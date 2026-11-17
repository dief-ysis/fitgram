/* ====================================================================
   FitGram v0 — modo validación.

   La hoja de ruta compromete, como etapa de HOY: "comparar FitGram con 2
   evaluadores en 15 personas, meta de 95 % de acuerdo". Esto guarda esas
   comparaciones y calcula el acuerdo.

   Decisiones que importan:

   - La referencia es el PROMEDIO de los evaluadores humanos, no uno de ellos.
     No hay razón para tratar a uno como verdad.
   - Se mide también el acuerdo ENTRE los evaluadores. Si los dos humanos no
     coinciden entre sí, no existe un patrón contra el cual comparar la app, y
     el 95 % no significa nada. Es la primera pregunta que hace un jurado.
   - El acuerdo relativo (sin unidad) es el titular, porque es el que se puede
     promediar entre repeticiones y segundos.
   - CCI(2,1): dos vías, efectos aleatorios, acuerdo absoluto, evaluador único
     (Shrout y Fleiss, 1979). Es lo que se reporta en la literatura del área.
   - Cuando no hay datos suficientes se devuelve null. Nunca un número inventado.

   Lógica pura: sin DOM ni localStorage, para poder probarla con node --test.
   ==================================================================== */

const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Desviación estándar muestral (n-1). null con menos de dos datos. */
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Un registro: una persona, una prueba, el conteo de la app y el de cada
 * evaluador humano. Sin nombres: solo un código de participante.
 */
function newRecord({ participant, test, app, raters, date, note, run }) {
  const code = String(participant ?? '').trim().toUpperCase();
  if (!code) throw new Error('Falta el código del participante.');
  if (!test) throw new Error('Falta la prueba.');
  const a = toNum(app);
  if (Number.isNaN(a)) throw new Error('El conteo de la app no es un número.');
  const rs = (Array.isArray(raters) ? raters : [raters]).map(toNum);
  if (!rs.length || rs.some(Number.isNaN)) throw new Error('Falta el conteo de algún evaluador.');
  return {
    id: newId(),
    participant: code,
    test: String(test),
    app: a,
    raters: rs,
    date: date || new Date().toISOString(),
    note: String(note ?? '').trim(),
    // Qué hizo la app en esa serie. Opcional: una medición tecleada a mano no
    // la tiene, y una corrida malformada no puede costar la medición.
    run: normalizeRun(run),
  };
}

/* ------------------------------------------------------------------------
   Por qué no coinciden los conteos.

   Un 95 % de acuerdo no dice nada por sí solo: lo que hay que poder responder
   es QUÉ pasa en el 5 % restante. No es lo mismo que a la app se le escape una
   repetición (falla de detección) a que la haya visto y la haya rechazado por
   técnica mientras el evaluador humano la contó igual (diferencia de criterio).
   Lo primero es un error; lo segundo es una decisión del protocolo, y hay que
   discutirla con quien puso los criterios, no arreglarla en el código.

   Por eso cada medición puede llevar adjunto el resumen de la corrida.
   ------------------------------------------------------------------------ */

/** Deja la corrida en su forma compacta, o null si no se entiende. */
function normalizeRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  const reasons = {};
  if (run.reasons && typeof run.reasons === 'object') {
    for (const [k, v] of Object.entries(run.reasons)) {
      const n = toNum(v);
      if (!Number.isNaN(n) && n > 0) reasons[String(k)] = n;
    }
  }
  const invalid = toNum(run.invalid);
  const counted = toNum(run.counted);
  const temblor = toNum(run.temblor);
  return {
    invalid: Number.isNaN(invalid) ? null : invalid,
    counted: Number.isNaN(counted) ? null : counted,
    endReason: run.endReason ? String(run.endReason) : null,
    // Si se podía confiar en la detección durante esa serie (módulo "calidad").
    calidad: run.calidad ? String(run.calidad) : null,
    temblor: Number.isNaN(temblor) ? null : temblor,
    sinVer: Number.isNaN(toNum(run.sinVer)) ? null : toNum(run.sinVer),
    reglas: run.reglas ? String(run.reglas) : null,
    // Cuándo midió la app. No es lo mismo que la fecha de la medición: esa es
    // cuándo se tecleó. Sirve para revisar un dato raro después, y para saber
    // si esta corrida ya se adjuntó a otro participante.
    fecha: run.fecha ? String(run.fecha) : null,
    reasons,
  };
}

/**
 * La medición que ya tiene adjunta la corrida tomada en `fecha`, si existe.
 *
 * Una corrida es de una persona sola. Adjuntar la serie de P01 a la medición
 * de P02 dejaría el diagnóstico mal en las dos, y en silencio. La app no sabe
 * quién hizo esa serie, pero sí puede decir que esa corrida ya la usó alguien.
 */
function runYaUsada(records, fecha) {
  if (!fecha) return null;
  return (records || []).find((r) => r.run && r.run.fecha === fecha) || null;
}

/** Resume una corrida real de la app: cuántas contó, cuántas descartó y por qué. */
function runFromResult(result) {
  if (!result || typeof result !== 'object') return null;
  const log = Array.isArray(result.log) ? result.log : [];
  const reasons = {};
  let counted = 0;
  let rechazadas = 0;
  for (const e of log) {
    if (e && e.valid) { counted++; continue; }
    rechazadas++;
    const k = String(e?.reason ?? '').trim() || 'sin motivo';
    reasons[k] = (reasons[k] || 0) + 1;
  }
  const invalid = toNum(result.invalid);
  return {
    invalid: Number.isNaN(invalid) ? rechazadas : invalid,
    counted,
    endReason: result.endReason ? String(result.endReason) : null,
    calidad: result.calidad?.nivel ? String(result.calidad.nivel) : null,
    temblor: Number.isFinite(result.calidad?.temblor) ? result.calidad.temblor : null,
    // Segundos en que la app no estuvo mirando: explican un conteo corto sin
    // que la culpa sea de la detección.
    sinVer: Number.isFinite(result.sinVer) ? result.sinVer : null,
    fecha: result.date ? String(result.date) : null,
    // Con qué reglas de conteo se tomó. Si el estudio mezcla dos, las
    // mediciones no son comparables entre sí y hay que saberlo.
    reglas: result.reglas ? String(result.reglas) : null,
    reasons,
  };
}

/**
 * Segundos sin ver a partir de los cuales la interrupción explica la
 * diferencia. Está duplicado del módulo "calidad" a propósito: los módulos no
 * se referencian entre sí para poder probarlos sueltos, y hay una prueba que
 * mantiene los dos valores iguales.
 */
const SIN_VER_MIN = 0.5;

/**
 * En qué consiste la diferencia de una medición.
 *
 * 'acuerdo'       el mismo conteo. Media repetición de diferencia solo aparece
 *                 cuando los dos evaluadores no coinciden entre sí, así que
 *                 tampoco es un fallo de la app.
 * 'criterio'      la app contó menos, pero descartó al menos esa cantidad por
 *                 técnica: las vio y las rechazó.
 * 'interrumpida'  contó menos y hubo un rato en que no estuvo mirando (alguien
 *                 se cruzó, se cortó la imagen). Culpar al detector por algo
 *                 que pasó delante de la cámara serían dos arreglos distintos.
 * 'noDetectadas'  contó menos sin ninguna de las dos excusas: se le escaparon.
 * 'deMas'         contó más que los evaluadores.
 * 'sinDato'       hay diferencia pero no se adjuntó la corrida.
 * null            prueba cronometrada: una diferencia de segundos no es una
 *                 repetición y no se puede clasificar así.
 */
function classifyRecord(rec, timed = false) {
  if (!rec || timed) return null;
  const ref = mean(rec.raters || []);
  if (!Number.isFinite(ref) || !Number.isFinite(rec.app)) return null;
  const d = rec.app - ref;
  if (Math.abs(d) <= 0.5) return 'acuerdo';
  if (d > 0) return 'deMas';
  const rechazadas = rec.run?.invalid;
  if (!Number.isFinite(rechazadas)) return 'sinDato';
  // Lo que descartó por técnica manda: si alcanza para explicar la diferencia,
  // es criterio y no hace falta invocar nada más. Si descartó menos de las que
  // faltan, aunque parte sea criterio, al menos una no quedó contada.
  if (-d <= rechazadas + 1e-9) return 'criterio';
  const sinVer = rec.run?.sinVer;
  if (Number.isFinite(sinVer) && sinVer >= SIN_VER_MIN) return 'interrumpida';
  return 'noDetectadas';
}

const BREAKDOWN_KEYS = Object.freeze(['acuerdo', 'criterio', 'interrumpida', 'noDetectadas', 'deMas', 'sinDato']);

/** Cuántas diferencias de cada tipo, solo sobre las pruebas de repeticiones. */
function breakdown(records, order, units = {}) {
  const out = { total: 0 };
  for (const k of BREAKDOWN_KEYS) out[k] = 0;
  for (const r of records || []) {
    if (order && !order.includes(r.test)) continue;
    if (units[r.test] === 's') continue;
    const k = classifyRecord(r, false);
    if (!k) continue;
    out[k]++;
    out.total++;
  }
  return out;
}

/** Los motivos de rechazo más frecuentes, de mayor a menor. */
function topReasons(records) {
  const acc = {};
  for (const r of records || []) {
    for (const [k, v] of Object.entries(r.run?.reasons || {})) acc[k] = (acc[k] || 0) + v;
  }
  return Object.entries(acc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** El motivo que más veces apareció en una corrida. */
function mainReason(run) {
  const es = Object.entries(run?.reasons || {});
  if (!es.length) return '';
  return es.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function addRecord(records, rec) { return (records || []).concat([rec]); }
function removeRecord(records, id) { return (records || []).filter((r) => r.id !== id); }

/** Normaliza lo leído del almacenamiento, descartando lo que no sirva. */
function loadRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    try {
      out.push(Object.assign(newRecord(r), { id: r.id || newId() }));  // newRecord ya normaliza r.run
    } catch { /* se descarta la fila rota */ }
  }
  return out;
}

/**
 * Junta un respaldo con lo que ya hay en este teléfono.
 *
 * La regla de la que cuelga todo lo demás: **juntar, nunca reemplazar**. Las
 * mediciones viven en el almacenamiento de un teléfono, y cargar un respaldo
 * encima de un día de trabajo no puede borrarlo.
 *
 * - Una medición que ya está (mismo `id`) se deja como está y se cuenta aparte.
 *   Así cargar dos veces el mismo archivo no duplica nada.
 * - Una que choca —mismo participante y misma prueba, pero otra medición— se
 *   **agrega igual** y se avisa. Perder una medición en silencio es peor que
 *   tener dos: la pantalla ya sabe avisar de los duplicados, y cuál vale lo
 *   decide quien tomó los datos, no esto.
 * - Una fila rota se cuenta y se salta: un archivo con una línea mala no puede
 *   costar las otras cuarenta.
 *
 * @returns {{records: object[], agregadas: number, yaEstaban: number,
 *            chocan: {participant: string, test: string}[], invalidas: number}}
 */
function mergeRecords(actuales, entrantes) {
  const out = { records: Array.isArray(actuales) ? actuales.slice() : [],
    agregadas: 0, yaEstaban: 0, chocan: [], invalidas: 0 };
  if (!Array.isArray(entrantes)) return out;
  const ids = new Set(out.records.map((r) => r.id));
  for (const cruda of entrantes) {
    let rec;
    try { rec = Object.assign(newRecord(cruda || {}), { id: (cruda && cruda.id) || newId() }); }
    catch { out.invalidas++; continue; }
    if (ids.has(rec.id)) { out.yaEstaban++; continue; }
    const choque = findDuplicate(out.records, rec.participant, rec.test);
    if (choque) out.chocan.push({ participant: rec.participant, test: rec.test });
    out.records.push(rec);
    ids.add(rec.id);
    out.agregadas++;
  }
  return out;
}

/**
 * Coeficiente de correlación intraclase CCI(2,1).
 * `rows` es una matriz sujetos x evaluadores. null si no alcanza para calcularlo.
 */
function icc21(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const n = rows.length;
  const k = rows[0]?.length ?? 0;
  if (k < 2 || rows.some((r) => r.length !== k || r.some((v) => !Number.isFinite(v)))) return null;

  const grand = mean(rows.flat());
  const rowMeans = rows.map(mean);
  const colMeans = Array.from({ length: k }, (_, j) => mean(rows.map((r) => r[j])));

  const SSR = k * rowMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const SSC = n * colMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const SST = rows.flat().reduce((a, x) => a + (x - grand) ** 2, 0);
  const SSE = SST - SSR - SSC;

  const MSR = SSR / (n - 1);
  const MSC = SSC / (k - 1);
  const MSE = SSE / ((n - 1) * (k - 1));

  const den = MSR + (k - 1) * MSE + (k * (MSC - MSE)) / n;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-12) return null;
  const v = (MSR - MSE) / den;
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------------
   Intervalo de confianza del CCI.

   El CCI es el número con el que se va a defender el estudio, y darlo solo
   —«CCI = 0,89»— suena más firme de lo que es. Con quince personas por prueba
   el intervalo es ancho, y eso conviene saberlo antes de que lo pregunte
   alguien, no después.

   Hace falta el cuantil de la F, que no viene en JavaScript. Es la beta
   incompleta invertida: unas cuarenta líneas, todas comprobadas contra las
   tablas publicadas en test/intervalo.test.mjs.
   ------------------------------------------------------------------------ */

/** log Γ(x) por la aproximación de Lanczos (g = 7, n = 9). */
function lnGamma(x) {
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = g[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fracción continua de la beta incompleta (Lentz), como en Numerical Recipes. */
function betacf(a, b, x) {
  const TINY = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
function betaInc(x, a, b) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Inversa de la beta incompleta, por bisección: lenta y sin sorpresas. */
function betaIncInv(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (betaInc(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Cuantil de la distribución F: el valor que deja probabilidad `p` por debajo.
 * @returns {number|null} null si los parámetros no sirven
 */
function qf(p, d1, d2) {
  if (!(p > 0 && p < 1) || !(d1 > 0) || !(d2 > 0)) return null;
  const x = betaIncInv(p, d1 / 2, d2 / 2);
  if (!(x > 0) || x >= 1) return x >= 1 ? Infinity : 0;
  const v = (d2 * x) / (d1 * (1 - x));
  return Number.isFinite(v) ? v : null;
}

/** Los cuadrados medios de un análisis de varianza de dos vías, o null si no se puede. */
function mediasCuadraticas(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const n = rows.length;
  const k = rows[0]?.length ?? 0;
  if (k < 2 || rows.some((r) => r.length !== k || r.some((v) => !Number.isFinite(v)))) return null;
  const grand = mean(rows.flat());
  const rowMeans = rows.map(mean);
  const colMeans = Array.from({ length: k }, (_, j) => mean(rows.map((r) => r[j])));
  const SSR = k * rowMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const SSC = n * colMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const SST = rows.flat().reduce((a, x) => a + (x - grand) ** 2, 0);
  return { n, k, MSR: SSR / (n - 1), MSC: SSC / (k - 1), MSE: (SST - SSR - SSC) / ((n - 1) * (k - 1)) };
}

/**
 * CCI(2,1) con su intervalo de confianza.
 *
 * El intervalo es el de McGraw y Wong (1996), tabla 7, caso CCI(A,1): el mismo
 * que calcula `irr::icc` en R con model="twoway", type="agreement",
 * unit="single". Verificado por simulación: con 15 personas y 2 evaluadores
 * cubre el valor verdadero el 95 % de las veces (test/intervalo.test.mjs).
 *
 * @param {number[][]} rows matriz sujetos x evaluadores
 * @param {number} [conf] nivel de confianza (0,95 por omisión)
 * @returns {{icc:number|null, lower:number|null, upper:number|null, n:number, k:number}|null}
 */
function icc21CI(rows, conf = 0.95) {
  const m = mediasCuadraticas(rows);
  if (!m) return null;
  const { n, k, MSR, MSC, MSE } = m;
  const icc = icc21(rows);
  if (icc == null) return { icc: null, lower: null, upper: null, n, k };

  // Acuerdo exacto: la fórmula se indetermina (1 − CCI = 0) y su límite es 1.
  // Pasa solo con datos degenerados —por ejemplo, si un evaluador copió al
  // otro— y por eso el resumen muestra siempre el n al lado.
  if (!(icc < 1)) return { icc, lower: 1, upper: 1, n, k };

  const alpha = 1 - conf;
  // Grados de libertad de Satterthwaite: el denominador mezcla dos fuentes de
  // error, así que no tiene unos grados de libertad enteros propios.
  const a = (k * icc) / (n * (1 - icc));
  const b = 1 + (k * icc * (n - 1)) / (n * (1 - icc));
  const v = ((a * MSC + b * MSE) ** 2) / (((a * MSC) ** 2) / (k - 1) + ((b * MSE) ** 2) / ((n - 1) * (k - 1)));

  const FL = qf(1 - alpha / 2, n - 1, v);
  const FU = qf(1 - alpha / 2, v, n - 1);
  if (FL == null || FU == null || !Number.isFinite(v) || v <= 0) return { icc, lower: null, upper: null, n, k };

  const kn = k * n - k - n;
  const lower = (n * (MSR - FL * MSE)) / (FL * (k * MSC + kn * MSE) + n * MSR);
  const upper = (n * (FU * MSR - MSE)) / (k * MSC + kn * MSE + n * FU * MSR);
  const acotar = (x) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : null);
  return { icc, lower: acotar(lower), upper: acotar(upper), n, k };
}

/** Bland y Altman: sesgo medio y límites de acuerdo al 95 %. */
function blandAltman(a, b) {
  const diffs = a.map((x, i) => x - b[i]).filter(Number.isFinite);
  if (!diffs.length) return { bias: null, sd: null, loA: null, n: 0 };
  const bias = mean(diffs);
  const s = sd(diffs);
  return {
    bias,
    sd: s,
    loA: s == null ? null : [bias - 1.96 * s, bias + 1.96 * s],
    n: diffs.length,
  };
}

/** Acuerdo relativo medio, en porcentaje. Sin unidad, así que se puede promediar entre pruebas. */
function relAgreementOf(pairs) {
  if (!pairs.length) return null;
  const vals = pairs.map(([x, ref]) => {
    const base = Math.max(Math.abs(ref), 1);
    return Math.max(0, Math.min(100, 100 * (1 - Math.abs(x - ref) / base)));
  });
  return mean(vals);
}

const pct = (hits, n) => (n ? (100 * hits) / n : null);

/** Mínimo de sujetos para que un CCI signifique algo. Por debajo se informa, pero avisando. */
const ICC_MIN_N = 5;

/**
 * Estadísticos de un conjunto de registros de la misma prueba.
 * `timed` marca las pruebas cronometradas: en un sostenido de 60 s, acertar el
 * segundo exacto o quedar "dentro de ±1" no significa nada, así que no se informa.
 */
/** Los dos extremos del intervalo, o null si no hay CCI que acompañar. */
function ciDe(rows) {
  const ic = icc21CI(rows);
  return ic && ic.lower != null && ic.upper != null ? [ic.lower, ic.upper] : null;
}

function statsFor(records, timed = false) {
  if (!records.length) return null;
  const app = records.map((r) => r.app);
  const ref = records.map((r) => mean(r.raters));
  const ba = blandAltman(app, ref);

  // Acuerdo entre los dos evaluadores humanos: solo con los registros que tengan dos.
  const pairs = records.filter((r) => r.raters.length === 2);
  let raters = null;
  if (pairs.length) {
    const r1 = pairs.map((r) => r.raters[0]);
    const r2 = pairs.map((r) => r.raters[1]);
    const rba = blandAltman(r1, r2);
    raters = {
      n: pairs.length,
      bias: rba.bias,
      sd: rba.sd,
      loA: rba.loA,
      // Cuánto se parecen los dos humanos entre sí, relativo a su propio promedio.
      relAgreement: mean(pairs.map((r) => {
        const base = Math.max(Math.abs(mean(r.raters)), 1);
        return Math.max(0, Math.min(100, 100 * (1 - Math.abs(r.raters[0] - r.raters[1]) / base)));
      })),
      icc: icc21(pairs.map((r) => [r.raters[0], r.raters[1]])),
      iccCI: ciDe(pairs.map((r) => [r.raters[0], r.raters[1]])),
    };
  }

  const people = new Set(records.map((r) => r.participant)).size;
  return {
    n: records.length,
    people,
    timed,
    relAgreement: relAgreementOf(records.map((r) => [r.app, mean(r.raters)])),
    exact: timed ? null : pct(records.filter((r) => r.app === mean(r.raters)).length, records.length),
    within1: timed ? null : pct(records.filter((r) => Math.abs(r.app - mean(r.raters)) <= 1).length, records.length),
    bias: ba.bias,
    sd: ba.sd,
    loA: ba.loA,
    icc: icc21(records.map((r) => [r.app].concat(r.raters))),
    // Un CCI sin intervalo suena más firme de lo que es. Con quince personas
    // el intervalo es ancho, y eso es parte del resultado, no un detalle.
    iccCI: ciDe(records.map((r) => [r.app].concat(r.raters))),
    iccReliable: people >= ICC_MIN_N,
    raters,
  };
}

/**
 * Resumen por prueba y total.
 * El total deja fuera el sesgo y los límites de acuerdo a propósito: mezclar
 * repeticiones con segundos daría un número sin significado.
 */
function summary(records, order, units = {}) {
  const rs = records || [];
  const timedOf = (t) => units[t] === 's';
  const byTest = {};
  for (const t of order) {
    const sub = rs.filter((r) => r.test === t);
    byTest[t] = sub.length ? statsFor(sub, timedOf(t)) : null;
  }
  // El acuerdo relativo no tiene unidad, así que se puede promediar entre pruebas.
  // El exacto y el ±1 solo se cuentan sobre las pruebas de repeticiones.
  const counted = rs.filter((r) => !timedOf(r.test));
  const overall = !rs.length ? null : {
    n: rs.length,
    people: new Set(rs.map((r) => r.participant)).size,
    counted: counted.length,
    relAgreement: relAgreementOf(rs.map((r) => [r.app, mean(r.raters)])),
    exact: pct(counted.filter((r) => r.app === mean(r.raters)).length, counted.length),
    within1: pct(counted.filter((r) => Math.abs(r.app - mean(r.raters)) <= 1).length, counted.length),
  };
  return { byTest, overall };
}

/** Número con coma decimal, como se escribe en Chile. */
function numCL(v, dec = 2) {
  if (v == null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 10 ** dec) / 10 ** dec).replace('.', ',');
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con ; de separador, para que Excel en Chile lo abra en columnas. */
function toCSV(records, order, units = {}) {
  const maxR = (records || []).reduce((m, r) => Math.max(m, r.raters.length), 2);
  const head = ['participante', 'prueba', 'fecha', 'app']
    .concat(Array.from({ length: maxR }, (_, i) => `evaluador${i + 1}`))
    .concat(['promedio_evaluadores', 'diferencia_app_menos_promedio',
      'descartadas', 'motivo_principal', 'termino', 'clasificacion',
      'temblor', 'calidad', 'sin_ver', 'reglas', 'fecha_corrida', 'nota']);
  const rows = (records || []).slice().sort((a, b) => String(a.participant).localeCompare(String(b.participant))
    || String(a.test).localeCompare(String(b.test)));
  const body = rows.map((r) => {
    const m = mean(r.raters);
    return [
      r.participant, r.test, (r.date || '').slice(0, 10), numCL(r.app),
      ...Array.from({ length: maxR }, (_, i) => numCL(r.raters[i])),
      numCL(m), numCL(r.app - m),
      r.run && r.run.invalid != null ? numCL(r.run.invalid, 0) : '',
      mainReason(r.run), r.run?.endReason || '',
      classifyRecord(r, units[r.test] === 's') || '',
      r.run?.temblor != null ? numCL(r.run.temblor, 4) : '', r.run?.calidad || '',
      r.run?.sinVer != null ? numCL(r.run.sinVer, 1) : '', r.run?.reglas || '',
      r.run?.fecha || '',
      r.note || '',
    ].map(csvCell).join(';');
  });
  return [head.join(';')].concat(body).join('\n') + '\n';
}

/* ------------------------------------------------------------------------
   Tomar los datos en terreno, con una persona esperando al frente, es otra
   cosa que probarlo con el mouse. Esto es para que la interfaz no sea la que
   haga perder una medicion.
   ------------------------------------------------------------------------ */

/** El codigo tal como lo guarda newRecord, para poder comparar. */
const normCode = (v) => String(v ?? '').trim().toUpperCase();

/** La medicion que ya existe de esa persona en esa prueba, si existe. */
function findDuplicate(records, participant, test) {
  const code = normCode(participant);
  if (!code || !test) return null;
  return (records || []).find((r) => r.participant === code && r.test === test) || null;
}

/**
 * Deja `rec` en el lugar de la medicion `id`, conservando su id.
 * Conservarlo importa: si ya se exporto, la fila corregida sigue siendo la
 * misma fila y no aparece como una medicion nueva.
 */
function replaceRecord(records, id, rec) {
  const rs = records || [];
  const i = rs.findIndex((r) => r.id === id);
  if (i < 0) return rs;
  const out = rs.slice();
  out[i] = Object.assign({}, rec, { id });
  return out;
}

/** Las pruebas que ya se le tomaron a una persona, en el orden de la app. */
function testsDoneBy(records, participant, order) {
  const code = normCode(participant);
  const done = new Set((records || []).filter((r) => r.participant === code).map((r) => r.test));
  return (order || []).filter((t) => done.has(t));
}

/**
 * La siguiente prueba que le falta a la misma persona, empezando despues de
 * `current` y dando la vuelta. null si no le falta ninguna.
 */
function nextPendingTest(records, participant, order, current) {
  const ord = order || [];
  if (!ord.length) return null;
  const done = new Set(testsDoneBy(records, participant, ord));
  const from = ord.indexOf(current);
  for (let k = 1; k <= ord.length; k++) {
    const t = ord[(Math.max(0, from) + k) % ord.length];
    if (!done.has(t)) return t;
  }
  return null;
}

/** Las versiones de las reglas de conteo presentes en las mediciones. */
function reglasUsadas(records) {
  return Array.from(new Set((records || []).map((r) => r.run?.reglas).filter(Boolean))).sort();
}

/** Los codigos ya ingresados, sin repetir y ordenados. */
function participantCodes(records) {
  return Array.from(new Set((records || []).map((r) => r.participant))).sort((a, b) => a.localeCompare(b));
}

/**
 * Cuantas mediciones se guardaron despues de la ultima exportacion.
 * Todo esto vive solo en este navegador, asi que es el unico aviso de que hay
 * trabajo sin respaldo. Una fecha ilegible cuenta como "nunca exporto": mas
 * vale avisar de mas que dar por salvado lo que no esta.
 */
function unexportedCount(records, exportedAt) {
  const rs = records || [];
  const t = exportedAt ? Date.parse(exportedAt) : NaN;
  if (!Number.isFinite(t)) return rs.length;
  return rs.filter((r) => {
    const d = Date.parse(r.date);
    return !Number.isFinite(d) || d > t;
  }).length;
}

export { newRecord, addRecord, removeRecord, replaceRecord, loadRecords, mergeRecords, icc21, icc21CI, qf, blandAltman,
  summary, statsFor, toCSV, numCL, toNum, mean, sd, SIN_VER_MIN,
  findDuplicate, testsDoneBy, nextPendingTest, participantCodes, unexportedCount, reglasUsadas, runYaUsada,
  runFromResult, classifyRecord, breakdown, topReasons, mainReason, BREAKDOWN_KEYS };
