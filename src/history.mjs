/* ====================================================================
   FitGram v0 — historial de evaluaciones.

   El resto de la app guardaba un solo resultado por prueba y lo
   sobreescribia al repetirla, asi que no habia con que comparar. Aqui vive
   la serie: cada prueba es una lista de resultados ordenada por fecha.

   Es logica pura a proposito (no toca el DOM ni localStorage) para poder
   probarla sin navegador: `node --test test/`.

   Vocabulario:
     resultado  una corrida guardada: { value, date, invalid, profile, ... }
     serie      todos los resultados de una prueba, del mas viejo al mas nuevo
     historial  { pushup: serie, squat: serie, plank: serie }
     vuelta     la n-esima vez que se hace cada prueba; la vuelta 1 es la
                primera evaluacion completa, la 2 la de las 4 semanas siguientes
   ==================================================================== */

const MAX_PER_TEST = 50; // tope por prueba: localStorage ronda los 5 MB
const CYCLE_DAYS = 28;   // "repitela cada 4 semanas"
const DAY = 86400000;

const isResult = (r) => !!r && typeof r === 'object'
  && Number.isFinite(Number(r.value)) && r.value !== null && r.value !== ''
  && !Number.isNaN(Date.parse(r.date));
const tOf = (r) => Date.parse(r.date);
const byDate = (a, b) => tOf(a) - tOf(b);

function emptyHistory(order) {
  const h = {};
  for (const t of order) h[t] = [];
  return h;
}

/**
 * Normaliza el historial: descarta entradas invalidas, ordena por fecha, corta
 * en el tope y deja el log de repeticiones solo en la ultima entrada de cada
 * prueba (es lo unico que lo usa, y pesa demasiado para guardarlo 50 veces).
 */
function trim(history, order, max = MAX_PER_TEST) {
  const out = {};
  for (const t of order) {
    const arr = (history?.[t] || []).filter(isResult).sort(byDate).slice(-max);
    out[t] = arr.map((r, i) => {
      if (i === arr.length - 1 || r.log == null) return r;
      const copy = Object.assign({}, r);
      delete copy.log;
      return copy;
    });
  }
  return out;
}

function latestOf(history, test) {
  const arr = history?.[test] || [];
  return arr.length ? arr[arr.length - 1] : null;
}

/** El ultimo resultado de cada prueba, con la forma que el resto de la app ya espera. */
function latestMap(history, order) {
  const out = {};
  for (const t of order) {
    const r = latestOf(history, t);
    if (r) out[t] = r;
  }
  return out;
}

/**
 * Lee lo guardado en el telefono y devuelve siempre un historial, venga de la
 * version que guardaba la serie o de la anterior que guardaba un solo resultado.
 * Nadie pierde su medicion al actualizar la app.
 */
function migrateStore(stored, order) {
  const raw = stored?.history && typeof stored.history === 'object' ? stored.history : null;
  let history;
  if (raw) {
    history = trim(raw, order);
    // Por si quedo un resultado suelto de la version vieja que no esta en la serie.
    for (const t of order) {
      const last = stored?.results?.[t];
      if (isResult(last) && !history[t].some((r) => r.date === last.date)) {
        history[t] = trim({ [t]: history[t].concat([last]) }, [t])[t];
      }
    }
  } else {
    history = emptyHistory(order);
    for (const t of order) {
      const last = stored?.results?.[t];
      if (isResult(last)) history[t] = [last];
    }
  }
  return { history, results: latestMap(history, order) };
}

/** Agrega un resultado sin tocar el historial que recibe. */
function pushResult(history, test, result, order, max = MAX_PER_TEST) {
  const base = {};
  for (const t of order) base[t] = (history?.[t] || []).slice();
  base[test] = (base[test] || []).concat([result]);
  return trim(base, order, max);
}

function bestOf(history, test) {
  const arr = history?.[test] || [];
  return arr.reduce((b, r) => (b == null || Number(r.value) > Number(b.value) ? r : b), null);
}

/**
 * Lo que cambio entre la ultima medicion y la anterior.
 * null cuando es la primera vez: no hay nada que comparar y no se inventa.
 */
function deltaOf(history, test) {
  const arr = history?.[test] || [];
  if (arr.length < 2) return null;
  const curr = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  const diff = Number(curr.value) - Number(prev.value);
  const best = bestOf(history, test);
  return {
    test, prev, curr, diff,
    dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    days: Math.round((tOf(curr) - tOf(prev)) / DAY),
    count: arr.length,
    isBest: best == null || Number(curr.value) >= Number(best.value),
    noComparable: noComparable(test, prev, curr),
  };
}

/**
 * Por qué dos mediciones de la misma prueba no se pueden comparar, o null.
 * - 'protocolo': flexiones con perfiles de distinto sexo. CSEP mide a los
 *   hombres desde los pies y a las mujeres con rodillas: es otro ejercicio.
 * - 'reglas': se contaron con reglas de conteo distintas (otra huella).
 */
function noComparable(test, prev, curr) {
  const sp = prev?.profile?.sex, sc = curr?.profile?.sex;
  if (test === 'pushup' && sp && sc && sp !== sc) return 'protocolo';
  if (prev?.reglas && curr?.reglas && prev.reglas !== curr.reglas) return 'reglas';
  return null;
}

/**
 * Las evaluaciones agrupadas: la vuelta n toma la n-esima medicion de cada
 * prueba. Una vuelta sin las tres pruebas se marca incompleta en vez de
 * rellenarse con la de otra fecha.
 */
function roundsOf(history, order) {
  const n = order.reduce((m, t) => Math.max(m, (history?.[t] || []).length), 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const results = {};
    let date = null;
    for (const t of order) {
      const r = (history?.[t] || [])[i];
      if (!r) continue;
      results[t] = r;
      if (date == null || tOf(r) > Date.parse(date)) date = r.date;
    }
    out.push({ n: i + 1, date, results, complete: order.every((t) => !!results[t]) });
  }
  return out;
}

/** Cuanto falta (o hace cuanto se paso) para la siguiente evaluacion. */
function dueInfo(history, order, now = new Date()) {
  const dates = order.map((t) => latestOf(history, t)).filter(Boolean).map(tOf);
  if (!dates.length) return { due: false, sinceDays: null, daysLeft: null, date: null, cycleDays: CYCLE_DAYS };
  const last = Math.max.apply(null, dates);
  const sinceDays = Math.round((now.getTime() - last) / DAY);
  return {
    due: sinceDays >= CYCLE_DAYS,
    sinceDays,
    daysLeft: Math.max(0, CYCLE_DAYS - sinceDays),
    date: new Date(last).toISOString(),
    cycleDays: CYCLE_DAYS,
  };
}

/** Una linea en castellano con el cambio. Sin adjetivos: el numero y los dias. */
function deltaText(d, test) {
  if (!d) return '';
  const secs = test?.unit === 's';
  const mag = Math.abs(d.diff).toFixed(secs ? 1 : 0).replace('.', ',');
  const unit = secs ? ' s' : (Math.abs(d.diff) === 1 ? ' repetición' : ' repeticiones');
  const days = d.days === 0 ? 'hoy mismo' : d.days === 1 ? 'hace 1 día' : `hace ${d.days} días`;
  if (d.dir === 'same') return `Lo mismo que ${days}.`;
  const verb = d.dir === 'up' ? 'Subiste' : 'Bajaste';
  const sign = d.dir === 'up' ? '+' : '-';
  return `${verb} ${sign}${mag}${unit} respecto a ${days}.`;
}

/** Puntos para el grafico de una prueba: x repartido parejo, y segun el valor. */
function sparkPoints(history, test, w, h, pad = 3) {
  const arr = history?.[test] || [];
  if (arr.length < 2) return [];
  const vals = arr.map((r) => Number(r.value));
  const lo = Math.min.apply(null, vals);
  const hi = Math.max.apply(null, vals);
  const span = hi - lo || 1;
  return arr.map((r, i) => ({
    x: pad + (i * (w - 2 * pad)) / (arr.length - 1),
    y: h - pad - ((Number(r.value) - lo) * (h - 2 * pad)) / span,
    value: Number(r.value),
    date: r.date,
  }));
}

/** Quita una medición (por prueba y fecha exacta). Devuelve un historial nuevo. */
function removeResult(history, test, date) {
  const out = { ...history };
  out[test] = (history?.[test] || []).filter((r) => r.date !== date);
  return out;
}

const csvCell = (v) => {
  const t = v == null ? '' : String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * El historial personal en CSV (separador ;, coma decimal: Excel en Chile).
 * `describe(test, r)` entrega { categoria, tabla, banda, unidad } (lo pone la app,
 * que es la que sabe clasificar); así este módulo sigue sin depender de norms.
 */
function toCSV(history, order, describe = () => ({})) {
  const head = ['fecha', 'prueba', 'valor', 'unidad', 'no_validas', 'categoria', 'tabla', 'banda', 'edad', 'sexo',
    'termino', 'calidad', 'inclinacion', 'inclinacion_fuente', 'telefono_movido', 'modo'];
  const rows = [];
  for (const t of order) {
    for (const r of history?.[t] || []) {
      const d = describe(t, r) || {};
      const roll = r.captura && Number.isFinite(r.captura.roll) ? String(r.captura.roll).replace('.', ',') : '';
      rows.push([String(r.date || '').slice(0, 16).replace('T', ' '), t, String(r.value ?? '').replace('.', ','),
        d.unidad || '', r.invalid ?? '', d.categoria || '', d.tabla || '', d.banda || '', r.profile?.age ?? '', r.profile?.sex ?? '',
        r.endReason || '', r.calidad?.nivel || '', roll, r.captura?.fuente || '', r.captura ? (r.captura.movido ? 'sí' : 'no') : '', r.mode || '']
        .map(csvCell).join(';'));
    }
  }
  rows.sort();
  return [head.join(';')].concat(rows).join('\n') + '\n';
}

export { removeResult, toCSV, noComparable, MAX_PER_TEST, CYCLE_DAYS, emptyHistory, trim, latestOf, latestMap,
  migrateStore, pushResult, bestOf, deltaOf, roundsOf, dueInfo, deltaText, sparkPoints };
