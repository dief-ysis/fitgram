/* ====================================================================
   FitGram — pantalla de validación del estudio: registro manual frente a la app,
   guardado aparte, respaldo y exportación (la lógica pura está en validation.mjs).
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

import * as Val from './validation.mjs';
import * as Hist from './history.mjs';
import { ORDER, TODAS, TESTS } from './pruebas.mjs';
import { $, esc, num, clamp } from './utiles.mjs';

/* Lo que esta pantalla necesita de app.mjs (que la importa, no al revés): se conecta al arrancar. */
let S = null, saveStore = () => {}, show = () => {}, hasDemoData = () => false, resultText = (t, v) => String(v);
function conectarValidacion(a) { ({ S, saveStore, show, hasDemoData, resultText } = a); }

const VALID_KEY = 'fitgram.validation.v1'; // aparte de los resultados personales, a propósito
const VALID_EXPORT_KEY = 'fitgram.validation.exported.v1'; // cuándo se exportó por última vez

function loadValidExport() {
  try { return localStorage.getItem(VALID_EXPORT_KEY) || null; } catch { return null; }
}

function saveValidExport(iso) {
  if (S.stand) return;
  try { localStorage.setItem(VALID_EXPORT_KEY, iso); } catch { /* storage unavailable */ }
}
function loadValid() {
  try { return Val.loadRecords(JSON.parse(localStorage.getItem(VALID_KEY) || '[]')); } catch { return []; }
}
function saveValid() {
  if (S.stand) return; // modo stand: no se escribe nada en este teléfono
  try { localStorage.setItem(VALID_KEY, JSON.stringify(S.valid)); return true; } catch (e) {
    // Perder mediciones del estudio sin enterarse sería lo peor: se avisa y se pide exportar.
    console.warn('saveValid', e);
    try { validError('No se pudo guardar en este teléfono (memoria llena o navegación privada). Exporta el CSV o el JSON ahora para no perder las mediciones.'); } catch { /* pantalla no lista */ }
    return false;
  }
}


let vTest = ORDER[0];
/* Lo que hay que resolver antes de guardar (duplicado), lo que se puede
   deshacer (borrado) y cuándo se exportó por última vez. Todo de pantalla:
   nada de esto es dato de la validación. */
let vPending = null;
let vUndo = null;
/* La corrida que quedó de la prueba recién hecha, para adjuntarla a la
   medición. Lleva su prueba: si se cambia el selector ya no corresponde. */
let vRun = null;
let vExportedAt = loadValidExport();
const stamp = () => new Date().toISOString().slice(0, 10);

function renderValidForm() {
  const seg = $('v-test');
  seg.innerHTML = '';
  for (const t of ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = TESTS[t].short;
    b.setAttribute('aria-pressed', String(t === vTest));
    b.addEventListener('click', () => { vTest = t; renderValidForm(); });
    seg.appendChild(b);
  }
  $('v-unit-hint').textContent = TESTS[vTest].unit === 's'
    ? 'Segundos que cada uno cronometró en posición. Se admiten decimales.'
    : 'Repeticiones que cada uno contó como válidas, sobre la misma serie.';
  renderValidPerson();
  renderValidRun();
}

/**
 * Qué pruebas lleva ya la persona que está escrita en el campo.
 * En terreno uno va con el teléfono en una mano y pierde la cuenta de a quién
 * le falta qué; esto lo deja a la vista sin tener que buscar en la lista.
 */
function renderValidPerson() {
  const dl = $('v-codes');
  dl.innerHTML = Val.participantCodes(S.valid).map((c) => `<option value="${esc(c)}"></option>`).join('');

  const code = $('v-part').value.trim().toUpperCase();
  const hint = $('v-part-done');
  if (!code) {
    hint.textContent = 'Un código, no el nombre: el protocolo es anónimo.';
    return;
  }
  const done = Val.testsDoneBy(S.valid, code, ORDER);
  if (!done.length) {
    hint.textContent = `${code}: primera medición.`;
    return;
  }
  const falta = ORDER.filter((t) => !done.includes(t)).map((t) => TESTS[t].short);
  hint.textContent = `${code}: ya tiene ${done.map((t) => TESTS[t].short).join(', ')}`
    + (falta.length ? ` · falta ${falta.join(', ')}.` : ' · están las tres.');
}

/** Esconde lo que quedó de la medición anterior. */
function vClearNotices() {
  vPending = null;
  $('v-dup').hidden = true;
  $('v-saved').hidden = true;
  validError(null);
}

/** Bloque de una prueba en el resumen de acuerdo. */
function statBlock(test, s) {
  if (!s) return '';
  const T = TESTS[test];
  const u = T.unit === 's' ? ' s' : ' rep';
  const loa = s.loA ? `límites ${Val.numCL(s.loA[0], 1)} a ${Val.numCL(s.loA[1], 1)}${u}` : 'faltan datos para los límites';
  // Si los dos humanos no coinciden entre sí, no hay patrón contra el cual comparar.
  const warn = s.raters && s.raters.relAgreement < 95
    ? '<div class="small" style="color:var(--warn)">Los dos evaluadores difieren entre sí más que la meta. Sin un patrón humano estable, el acuerdo de la app es difícil de interpretar.</div>'
    : '';
  return `<div class="stat">
    <div class="stat-head"><span class="lbl" style="color:var(--ink)">${esc(T.short)}</span><span class="stat-v">${Val.numCL(s.relAgreement, 1)} %</span></div>
    <div class="small">${s.n} ${s.n === 1 ? 'medición' : 'mediciones'} · ${s.people} ${s.people === 1 ? 'persona' : 'personas'}${s.within1 == null ? '' : ` · ${Val.numCL(s.within1, 0)} % dentro de ±1`}</div>
    <div class="small">Sesgo ${s.bias > 0 ? '+' : ''}${Val.numCL(s.bias, 2)}${u} (${loa})${s.icc != null ? ` · CCI(2,1) ${Val.numCL(s.icc, 2)}${ic(s.iccCI)}${s.iccReliable ? '' : ' <span class="muted">(pocos sujetos: tómalo con pinzas)</span>'}` : ''}</div>
    ${s.raters ? `<div class="small muted">Entre evaluadores: ${Val.numCL(s.raters.relAgreement, 1)} % de acuerdo${s.raters.icc != null ? `, CCI ${Val.numCL(s.raters.icc, 2)}${ic(s.raters.iccCI)}` : ''}.</div>` : ''}
    ${warn}
  </div>`;
}

/**
 * El intervalo de confianza, al lado del CCI.
 *
 * Un CCI solo suena más firme de lo que es. Con quince personas el intervalo
 * es ancho, y ese ancho es parte del resultado: es lo que responde «¿y cuánta
 * gente harían falta?» con un número en vez de con una intuición.
 */
function ic(par) {
  // Dos decimales fijos: «0,94–1» al lado de «0,94» se lee como si el extremo
  // alto fuera otra cosa, y este es el número principal del estudio.
  const dos = (v) => v.toFixed(2).replace('.', ',');
  return Array.isArray(par) ? ` <span class="muted">(IC 95 %: ${dos(par[0])}–${dos(par[1])})</span>` : '';
}

const VALID_TARGET = 15; // la hoja de ruta compromete 15 personas

/** La unidad de cada prueba: marca cuáles son cronometradas. */
function unitsByTest() {
  return Object.fromEntries(ORDER.map((t) => [t, TESTS[t].unit]));
}

/**
 * El desglose de las diferencias, que es lo que de verdad hay que poder
 * responder. Un 95 % de acuerdo no dice nada por sí solo: la pregunta es qué
 * pasa en el resto, y no es lo mismo que a la app se le escape una repetición
 * a que la haya rechazado por técnica y el evaluador la haya contado igual.
 */
function renderBreakdown() {
  const b = Val.breakdown(S.valid, ORDER, unitsByTest());
  const dif = b.total - b.acuerdo;
  if (!b.total || !dif) return '';
  const linea = (n, txt) => (n ? `<div class="small">${n} ${txt}</div>` : '');
  const motivos = Val.topReasons(S.valid).slice(0, 3);
  return `<div style="border-top:1px solid var(--line);padding-top:10px">
    <div class="lbl">En qué consisten las diferencias</div>
    <div class="small muted" style="margin-bottom:6px">${dif} de ${b.total} mediciones de repeticiones no coinciden con el promedio de los evaluadores.</div>
    ${linea(b.criterio, 'por criterio: la app las vio y las descartó por técnica, el evaluador las contó.')}
    ${linea(b.interrumpida, 'interrumpidas: hubo un rato en que la app no estaba mirando.')}
    ${linea(b.noDetectadas, 'no detectadas: se le escaparon a la app.')}
    ${linea(b.deMas, 'de más: la app contó repeticiones que el evaluador no contó.')}
    ${linea(b.sinDato, 'sin dato: se tecleó a mano, sin la corrida de la app.')}
    ${motivos.length ? `<div class="small muted" style="margin-top:6px">Lo que más descarta la app: ${motivos.map(([m, n]) => `${esc(m)} (${n})`).join(', ')}.</div>` : ''}
  </div>`;
}

function renderValid() {
  renderValidForm();
  const units = unitsByTest();
  const sum = Val.summary(S.valid, ORDER, units);
  const box = $('valid-summary');
  if (!sum.overall) {
    box.innerHTML = `<div class="lbl">Acuerdo con los evaluadores</div>
      <p class="small" style="margin:0">Todavía no hay mediciones. Para cada persona y cada prueba: el conteo que entregó FitGram y el que contó cada evaluador, sobre la misma serie.</p>`;
  } else {
    const o = sum.overall;
    const falta = Math.max(0, VALID_TARGET - o.people);
    box.innerHTML = `<div class="lbl">Acuerdo con los evaluadores</div>
      <div class="result-head">
        <div><span class="result-big">${Val.numCL(o.relAgreement, 1)}</span><span class="result-unit">% de acuerdo</span></div>
        <div class="result-cat">${o.people}/${VALID_TARGET}</div>
      </div>
      <div class="small">${o.n} ${o.n === 1 ? 'medición' : 'mediciones'} en ${o.people} ${o.people === 1 ? 'persona' : 'personas'}${o.counted ? ` · en las de repeticiones, ${Val.numCL(o.within1, 0)} % dentro de ±1 y ${Val.numCL(o.exact, 0)} % exacto` : ''}</div>
      ${falta
        ? `<div class="small muted">Faltan ${falta} ${falta === 1 ? 'persona' : 'personas'} para la muestra de la etapa 1.</div>`
        : '<div class="small">Se completó la muestra de 15 personas de la etapa 1.</div>'}
      <div>${ORDER.map((t) => statBlock(t, sum.byTest[t])).join('')}</div>
      ${renderBreakdown()}
      <div class="small muted">El acuerdo es 100 % menos la diferencia contra el promedio de los evaluadores, relativa a ese promedio. El total no promedia sesgos: mezclaría repeticiones con segundos.</div>`;
  }

  const list = $('valid-list');
  if (!S.valid.length) {
    list.innerHTML = '<p class="small muted" style="margin:0">Nada guardado todavía.</p>';
  } else {
    const rows = S.valid.slice().sort((a, b) => a.participant.localeCompare(b.participant) || ORDER.indexOf(a.test) - ORDER.indexOf(b.test));
    list.innerHTML = rows.map((r) => {
      const u = TESTS[r.test]?.unit === 's' ? ' s' : '';
      const d = r.app - Val.mean(r.raters);
      const dir = d === 0 ? 'same' : Math.abs(d) <= 1 ? 'up' : 'down';
      const KIND = { criterio: 'criterio', interrumpida: 'interrumpida', noDetectadas: 'no detectada', deMas: 'de más', sinDato: 'sin corrida' };
      const kind = KIND[Val.classifyRecord(r, TESTS[r.test]?.unit === 's')] || '';
      return `<div class="vrow">
        <span><strong>${esc(r.participant)}</strong> <span class="muted">· ${esc(TESTS[r.test]?.short || r.test)}${kind ? ` · ${kind}` : ''}</span>${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</span>
        <span>${esc(Val.numCL(r.app, 1))}${u} <span class="muted">vs ${esc(r.raters.map((x) => Val.numCL(x, 1)).join(' / '))}</span> <span class="delta-inline ${dir}">${d > 0 ? '+' : ''}${esc(Val.numCL(d, 1))}</span></span>
        <button class="x" type="button" data-del="${esc(r.id)}" aria-label="Borrar la medición de ${esc(r.participant)}">×</button>
      </div>`;
    }).join('');
    for (const b of list.querySelectorAll('[data-del]')) {
      b.addEventListener('click', () => {
        const r = S.valid.find((x) => x.id === b.dataset.del);
        vUndo = {
          records: S.valid,
          label: r ? `${r.participant} · ${TESTS[r.test]?.short || r.test}` : 'la medición',
        };
        S.valid = Val.removeRecord(S.valid, b.dataset.del);
        saveValid();
        renderValid();
      });
    }
  }
  $('v-clear-n').textContent = String(S.valid.length);

  // Si durante el estudio cambió algún umbral de conteo, las mediciones de
  // antes y las de después no son comparables. Sin esto, el CSV parecería una
  // sola tanda de 45 filas.
  const reglas = Val.reglasUsadas(S.valid);
  const rg = $('v-reglas');
  rg.hidden = reglas.length < 2;
  if (reglas.length >= 2) {
    rg.textContent = `Ojo: hay mediciones tomadas con ${reglas.length} versiones distintas de las reglas de conteo`
      + ` (${reglas.join(', ')}). No son comparables entre sí sin decirlo en el informe.`;
  }

  $('v-undo').hidden = !vUndo;
  if (vUndo) $('v-undo-msg').textContent = `Se borró ${vUndo.label}.`;

  // Todo esto vive solo en este navegador. Si no se exportó, no hay respaldo.
  const sinRespaldo = Val.unexportedCount(S.valid, vExportedAt);
  const bk = $('v-backup');
  bk.hidden = !S.valid.length;
  bk.classList.toggle('warn', sinRespaldo > 0);
  if (S.valid.length) {
    const hora = vExportedAt ? new Date(vExportedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    bk.textContent = sinRespaldo
      ? (hora
        ? `${sinRespaldo} ${sinRespaldo === 1 ? 'medición' : 'mediciones'} sin exportar desde las ${hora}. Exporta antes de cerrar.`
        : `${sinRespaldo} ${sinRespaldo === 1 ? 'medición' : 'mediciones'} sin exportar: todavía no hay respaldo de nada.`)
      // Que el navegador haya iniciado la descarga no prueba que el archivo
      // quedó guardado, sobre todo en iOS. Por eso no se dice "a salvo".
      : `Exportado a las ${hora}. Revisa que el archivo haya quedado en el teléfono.`;
  }
}

function validError(msg) {
  const e = $('v-error');
  e.hidden = !msg;
  e.textContent = msg || '';
}

function saveValidRecord() {
  let rec;
  try {
    rec = Val.newRecord({
      participant: $('v-part').value,
      test: vTest,
      app: $('v-app').value,
      raters: [$('v-r1').value, $('v-r2').value],
      note: $('v-note').value,
      run: runEnUso(),
    });
  } catch (err) {
    vPending = null;
    $('v-dup').hidden = true;
    validError(err?.message || 'No se pudo guardar.');
    return;
  }

  // Dos mediciones de la misma persona en la misma prueba pesan doble en el
  // acuerdo. Puede ser una repetición legítima o puede ser que se perdió la
  // cuenta: no lo decide el código, lo decide quien está tomando los datos.
  const dup = Val.findDuplicate(S.valid, rec.participant, rec.test);
  if (dup) {
    vPending = { rec, dupId: dup.id };
    const u = TESTS[dup.test]?.unit === 's' ? ' s' : '';
    $('v-dup-msg').textContent = `${dup.participant} ya tiene una medición en ${TESTS[dup.test]?.short || dup.test}:`
      + ` ${Val.numCL(dup.app, 1)}${u} contra ${dup.raters.map((x) => Val.numCL(x, 1)).join(' / ')}.`
      + ' ¿Reemplazarla o guardar las dos?';
    $('v-dup').hidden = false;
    validError(null);
    $('v-saved').hidden = true;
    return;
  }
  commitValidRecord(rec, null);
}

/** Guarda de verdad y prepara el formulario para la siguiente prueba de la misma persona. */
function commitValidRecord(rec, replaceId) {
  S.valid = replaceId ? Val.replaceRecord(S.valid, replaceId, rec) : Val.addRecord(S.valid, rec);
  saveValid();
  vPending = null;
  vUndo = null;
  $('v-dup').hidden = true;
  validError(null);

  for (const id of ['v-app', 'v-r1', 'v-r2', 'v-note']) $(id).value = '';
  vRun = null;  // pertenecía a esa serie y ya se guardó
  $('v-part').value = rec.participant; // tal como quedó guardado, no como se tecleó
  // El código se queda: lo normal es tomarle las tres pruebas a la misma
  // persona de corrido, y volver a escribirlo cada vez es la forma más fácil
  // de inventar un participante que no existe (P1 y P01 serían dos personas).
  const sigue = Val.nextPendingTest(S.valid, rec.participant, ORDER, rec.test);
  if (sigue) vTest = sigue;

  $('v-saved-msg').textContent = `Guardado: ${rec.participant} · ${TESTS[rec.test]?.short || rec.test}.`
    + (sigue ? ` Sigue ${TESTS[sigue].short}.` : ' A esta persona ya están las tres.');
  $('v-saved').hidden = false;

  renderValid();
  const foco = sigue ? 'v-app' : 'v-part';
  $(foco).focus();
  if (foco === 'v-part') $('v-part').select();
}

/**
 * Abre el modo validación con la prueba y el conteo de la app ya puestos.
 * `result` es la corrida recién hecha, para adjuntarle lo que la app descartó.
 */
function openValid(test, appValue, result) {
  if (!S.settings.valid) { S.settings.valid = true; saveStore(); }
  if (test && ORDER.includes(test)) vTest = test;
  vUndo = null;
  vRun = result && test ? { test, run: Val.runFromResult(result) } : null;
  show('valid');
  vClearNotices();
  if (appValue != null) $('v-app').value = Val.numCL(appValue, 1);
  renderValidRun();
  $('v-part').focus();
}

/** La corrida solo vale para la prueba de la que salió. */
function runEnUso() {
  return vRun && vRun.test === vTest ? vRun.run : null;
}

/**
 * Qué descartó la app en esa serie.
 * Es lo que después permite distinguir una repetición que se le escapó de una
 * que vio y rechazó por técnica mientras el evaluador la contaba igual.
 */
function renderValidRun() {
  const box = $('v-run');
  const run = runEnUso();
  box.hidden = !run;
  if (run) {
    const motivos = Object.entries(run.reasons || {}).sort((a, b) => b[1] - a[1]);
    box.textContent = motivos.length
      ? `Se guarda junto con la medición lo que la app descartó en esa serie: `
        + motivos.map(([m, n]) => `${m} ×${n}`).join(', ') + '.'
      : 'Se guarda junto con la medición que la app no descartó ningún intento en esa serie.';
  }
  renderRescate(!!run);
}

/** La última medición de esta prueba guardada en el teléfono, si sirve de corrida. */
function ultimaCorrida() {
  const r = S.results[vTest];
  return r && !hasDemoData() && Array.isArray(r.log) ? r : null;
}

/**
 * Ofrecer la corrida de una medición que ya se tomó.
 *
 * La corrida se adjuntaba solo viniendo desde la pantalla de resultado. Si se
 * salía de ahí —alguien tocó «Volver», se recargó la página, el teléfono pasó
 * a otra mano— no había forma de volver a ella y la medición quedaba sin
 * diagnóstico, aunque el resultado siguiera guardado acá mismo.
 *
 * No se adjunta sola: cuál persona hizo esa serie la app no lo sabe. Se
 * muestra la hora y el número para que quien tomó los datos lo reconozca, y
 * se avisa si esa misma corrida ya está en otra medición, porque adjuntarla
 * dos veces dejaría el diagnóstico mal en las dos.
 */
function renderRescate(yaHayRun) {
  const box = $('v-rescate');
  const r = yaHayRun ? null : ultimaCorrida();
  box.hidden = !r;
  if (!r) return;
  const hora = new Date(r.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const usada = Val.runYaUsada(S.valid, r.date);
  box.classList.toggle('warn', !!usada);
  $('v-rescate-msg').textContent =
    `La última ${TESTS[vTest].short} medida en este teléfono fue a las ${hora} y dio ${resultText(vTest, r.value)}.`
    + (usada
      ? ` Ojo: esa corrida ya está guardada en la medición de ${usada.participant}. Si la adjuntas acá también, el diagnóstico queda mal en las dos.`
      : ' Si es la de esta persona, adjúntala y se guarda con lo que la app descartó.');
}

function downloadText(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) {
    validError(`No se pudo exportar: ${e?.message || e}`);
    return false;
  }
}

/** Marca que hay respaldo, solo si la descarga partió. */
/**
 * Carga un respaldo exportado antes y lo junta con lo que ya hay.
 *
 * Exportar sin poder volver a cargar es una puerta de salida sin entrada: si
 * el navegador limpia los datos o hay que seguir desde otro equipo, el archivo
 * no sirve de nada. Nunca reemplaza lo que está en el teléfono; ver
 * `Val.mergeRecords`.
 */
async function cargarRespaldo(file) {
  const aviso = $('v-loaded');
  const decir = (txt, mal) => { aviso.hidden = false; aviso.classList.toggle('warn', !!mal); aviso.textContent = txt; };
  let datos;
  try {
    datos = JSON.parse(await file.text());
  } catch {
    decir('No pude leer ese archivo. Tiene que ser el JSON que exporta esta misma pantalla, no el CSV.', true);
    return;
  }
  const r = Val.mergeRecords(S.valid, datos);
  if (!r.agregadas && !r.yaEstaban && !r.invalidas) {
    decir('Ese archivo no traía ninguna medición. No se tocó nada.', true);
    return;
  }
  S.valid = r.records;
  saveValid();
  renderValid();
  const partes = [];
  if (r.agregadas) partes.push(`${r.agregadas} ${r.agregadas === 1 ? 'medición nueva' : 'mediciones nuevas'}`);
  if (r.yaEstaban) partes.push(`${r.yaEstaban} que ya ${r.yaEstaban === 1 ? 'estaba' : 'estaban'}`);
  if (r.invalidas) partes.push(`${r.invalidas} que no pude leer`);
  let txt = `Cargado: ${partes.join(', ')}. No se borró nada de lo que ya había.`;
  if (r.chocan.length) {
    const lista = r.chocan.slice(0, 4).map((c) => `${c.participant} ${TESTS[c.test]?.short || c.test}`).join(', ');
    txt += ` Ojo: ${r.chocan.length} ${r.chocan.length === 1 ? 'choca' : 'chocan'} con una medición que ya existía`
      + ` del mismo participante y prueba (${lista}${r.chocan.length > 4 ? '…' : ''}). Quedaron las dos: revisa cuál vale.`;
  }
  decir(txt, r.chocan.length > 0 || r.invalidas > 0);
}

function exportValid(name, text, type) {
  if (!downloadText(name, text, type)) return;
  vExportedAt = new Date().toISOString();
  saveValidExport(vExportedAt);
  renderValid();
}

/** Pide la cámara. Compartido por las pruebas y por el modo juego. */

/** Botones y campos de la pantalla de validación. */
function bindValid() {
  $('v-save').addEventListener('click', saveValidRecord);
  $('v-back').addEventListener('click', () => show(S.profile.age && S.profile.sex ? 'hub' : 'onb'));
  $('v-csv').addEventListener('click', () => exportValid(`fitgram-validacion-${stamp()}.csv`, '\ufeff' + Val.toCSV(S.valid, ORDER, unitsByTest()), 'text/csv'));
  $('v-json').addEventListener('click', () => exportValid(`fitgram-validacion-${stamp()}.json`, JSON.stringify(S.valid, null, 2), 'application/json'));
  // El mismo archivo que exporta el botón de al lado, de vuelta.
  $('v-rescate-si').addEventListener('click', () => {
    const r = ultimaCorrida();
    if (!r) return;
    vRun = { test: vTest, run: Val.runFromResult(r) };
    $('v-app').value = Val.numCL(r.value, 1);
    renderValidRun();
  });
  $('v-load').addEventListener('click', () => { $('v-file').value = ''; $('v-file').click(); });
  $('v-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) cargarRespaldo(f);
  });

  // Escribir el código vuelve a mostrar qué le falta a esa persona.
  $('v-part').addEventListener('input', () => { vPending = null; $('v-dup').hidden = true; renderValidPerson(); });

  // Enter pasa al campo siguiente y, en el último, guarda. Con el teclado del
  // teléfono abierto, cada toque de más es un toque sobre un dato a la vista.
  const salto = { 'v-app': 'v-r1', 'v-r1': 'v-r2' };
  for (const [from, to] of Object.entries(salto)) {
    $(from).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      $(to).focus();
    });
  }
  $('v-r2').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    saveValidRecord();
  });

  $('v-dup-replace').addEventListener('click', () => { if (vPending) commitValidRecord(vPending.rec, vPending.dupId); });
  $('v-dup-both').addEventListener('click', () => { if (vPending) commitValidRecord(vPending.rec, null); });
  $('v-dup-cancel').addEventListener('click', () => { vPending = null; $('v-dup').hidden = true; });

  $('v-next-person').addEventListener('click', () => {
    vClearNotices();
    vRun = null;
    for (const id of ['v-part', 'v-app', 'v-r1', 'v-r2', 'v-note']) $(id).value = '';
    vTest = ORDER[0];
    renderValid();
    $('v-part').focus();
  });

  $('v-undo-yes').addEventListener('click', () => {
    if (!vUndo) return;
    S.valid = vUndo.records;
    vUndo = null;
    saveValid();
    renderValid();
  });
  $('v-clear').addEventListener('click', () => { $('v-clear-confirm').hidden = false; });
  $('v-clear-no').addEventListener('click', () => { $('v-clear-confirm').hidden = true; });
  $('v-clear-yes').addEventListener('click', () => {
    S.valid = [];
    vUndo = null;
    vExportedAt = null;
    try { localStorage.removeItem(VALID_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(VALID_EXPORT_KEY); } catch { /* ignore */ }
    $('v-clear-confirm').hidden = true;
    renderValid();
  });
}

export { conectarValidacion, bindValid, loadValid, saveValid, renderValid, openValid, ultimaCorrida, downloadText, stamp, VALID_KEY, VALID_EXPORT_KEY };
