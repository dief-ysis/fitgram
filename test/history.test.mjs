/**
 * Pruebas del modulo "history" de index.html.
 *
 * index.html es un solo archivo con pseudo-modulos `__mods["nombre"] = (() => { ... })();`.
 * Este archivo recorta el bloque del modulo y lo evalua: no necesita navegador ni DOM,
 * porque "history" es logica pura (no toca document ni localStorage).
 *
 *   node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../src/history.mjs';


const ORDER = ['pushup', 'squat', 'plank'];

const res = (value, date, extra = {}) => ({
  value, invalid: 0, endReason: 'manual', mode: 'live',
  date: new Date(date).toISOString(), profile: { age: 20, sex: 'M' }, ...extra,
});

/* ---------------------------------------------------------------- migracion */

test('migrar: un store vacio da historial vacio', () => {
  const s = H.migrateStore({}, ORDER);
  assert.deepEqual(s.history, { pushup: [], squat: [], plank: [] });
  assert.deepEqual(s.results, {});
});

test('migrar: un store viejo (solo results) siembra el historial con ese resultado', () => {
  const old = { results: { pushup: res(32, '2026-10-01'), squat: res(41, '2026-10-02') } };
  const s = H.migrateStore(old, ORDER);
  assert.equal(s.history.pushup.length, 1);
  assert.equal(s.history.pushup[0].value, 32);
  assert.equal(s.history.squat[0].value, 41);
  assert.equal(s.history.plank.length, 0);
  // y el ultimo sigue siendo el mismo, para que el resto de la app no cambie
  assert.equal(s.results.pushup.value, 32);
  assert.equal(s.results.squat.value, 41);
  assert.equal(s.results.plank, undefined);
});

test('migrar: un store ya migrado no duplica nada', () => {
  const once = H.migrateStore({ results: { pushup: res(32, '2026-10-01') } }, ORDER);
  const twice = H.migrateStore({ history: once.history, results: once.results }, ORDER);
  assert.equal(twice.history.pushup.length, 1);
  assert.equal(twice.results.pushup.value, 32);
});

test('migrar: ordena por fecha y descarta entradas sin valor', () => {
  const s = H.migrateStore({
    history: { pushup: [res(40, '2026-11-01'), res(30, '2026-10-01'), { value: null, date: 'x' }] },
  }, ORDER);
  assert.deepEqual(s.history.pushup.map((r) => r.value), [30, 40]);
});

/* ---------------------------------------------------------------- guardar */

test('guardar: agrega al final y no pierde la anterior', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'pushup', res(32, '2026-10-01'), ORDER);
  h = H.pushResult(h, 'pushup', res(41, '2026-10-29'), ORDER);
  assert.deepEqual(h.pushup.map((r) => r.value), [32, 41]);
  assert.equal(H.latestOf(h, 'pushup').value, 41);
});

test('guardar: no modifica el historial que recibe', () => {
  const h0 = H.migrateStore({}, ORDER).history;
  const h1 = H.pushResult(h0, 'pushup', res(32, '2026-10-01'), ORDER);
  assert.equal(h0.pushup.length, 0);
  assert.equal(h1.pushup.length, 1);
});

test('guardar: solo la ultima entrada de cada prueba conserva el log de repeticiones', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'pushup', res(32, '2026-10-01', { log: [{ i: 1 }, { i: 2 }] }), ORDER);
  h = H.pushResult(h, 'pushup', res(41, '2026-10-29', { log: [{ i: 1 }] }), ORDER);
  assert.equal(h.pushup[0].log, undefined, 'la entrada vieja no deberia guardar el log');
  assert.equal(h.pushup[1].log.length, 1, 'la ultima si');
});

test('guardar: corta el historial en el maximo, botando las mas viejas', () => {
  let h = H.migrateStore({}, ORDER).history;
  for (let i = 0; i < 8; i++) h = H.pushResult(h, 'squat', res(20 + i, `2026-0${i + 1}-01`), ORDER, 5);
  assert.equal(h.squat.length, 5);
  assert.deepEqual(h.squat.map((r) => r.value), [23, 24, 25, 26, 27]);
});

/* ---------------------------------------------------------------- avance */

test('avance: con una sola medicion no hay con que comparar', () => {
  const h = H.pushResult(H.migrateStore({}, ORDER).history, 'pushup', res(32, '2026-10-01'), ORDER);
  assert.equal(H.deltaOf(h, 'pushup'), null);
});

test('avance: compara la ultima con la anterior y cuenta los dias', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'pushup', res(32, '2026-10-01T10:00:00Z'), ORDER);
  h = H.pushResult(h, 'pushup', res(41, '2026-10-29T10:00:00Z'), ORDER);
  const d = H.deltaOf(h, 'pushup');
  assert.equal(d.prev.value, 32);
  assert.equal(d.curr.value, 41);
  assert.equal(d.diff, 9);
  assert.equal(d.days, 28);
  assert.equal(d.dir, 'up');
});

test('avance: un retroceso se informa como tal, no se esconde', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'plank', res(60, '2026-10-01T00:00:00Z'), ORDER);
  h = H.pushResult(h, 'plank', res(48.5, '2026-10-15T00:00:00Z'), ORDER);
  const d = H.deltaOf(h, 'plank');
  assert.equal(d.dir, 'down');
  assert.equal(Math.round(d.diff * 10) / 10, -11.5);
  assert.equal(d.days, 14);
});

test('avance: mismo valor es "igual"', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'squat', res(30, '2026-10-01'), ORDER);
  h = H.pushResult(h, 'squat', res(30, '2026-11-01'), ORDER);
  assert.equal(H.deltaOf(h, 'squat').dir, 'same');
});

test('avance: el mejor valor historico', () => {
  let h = H.migrateStore({}, ORDER).history;
  for (const [v, d] of [[32, '2026-08-01'], [45, '2026-09-01'], [41, '2026-10-01']]) {
    h = H.pushResult(h, 'pushup', res(v, d), ORDER);
  }
  assert.equal(H.bestOf(h, 'pushup').value, 45);
  assert.equal(H.deltaOf(h, 'pushup').isBest, false);
});

/* ---------------------------------------------------------------- vueltas */

test('vueltas: la n-esima vez de cada prueba forma una evaluacion', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'pushup', res(32, '2026-10-01'), ORDER);
  h = H.pushResult(h, 'squat', res(38, '2026-10-01'), ORDER);
  h = H.pushResult(h, 'plank', res(55, '2026-10-02'), ORDER);
  h = H.pushResult(h, 'pushup', res(41, '2026-10-29'), ORDER);
  h = H.pushResult(h, 'squat', res(44, '2026-10-30'), ORDER);

  const rounds = H.roundsOf(h, ORDER);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].n, 1);
  assert.deepEqual(Object.keys(rounds[0].results).sort(), ['plank', 'pushup', 'squat']);
  assert.equal(rounds[0].complete, true);
  assert.equal(rounds[0].date.slice(0, 10), '2026-10-02', 'la fecha de la vuelta es la de la ultima prueba');
  assert.equal(rounds[1].n, 2);
  assert.equal(rounds[1].complete, false);
  assert.equal(rounds[1].results.plank, undefined);
});

test('vueltas: sin nada hecho no hay vueltas', () => {
  assert.deepEqual(H.roundsOf(H.migrateStore({}, ORDER).history, ORDER), []);
});

/* ---------------------------------------------------------------- recordatorio */

test('recordatorio: a las 4 semanas toca repetir', () => {
  const h = H.pushResult(H.migrateStore({}, ORDER).history, 'pushup', res(32, '2026-10-01T00:00:00Z'), ORDER);
  const soon = H.dueInfo(h, ORDER, new Date('2026-10-10T00:00:00Z'));
  assert.equal(soon.due, false);
  assert.equal(soon.daysLeft, 19);
  const now = H.dueInfo(h, ORDER, new Date('2026-10-30T00:00:00Z'));
  assert.equal(now.due, true);
  assert.equal(now.sinceDays, 29);
});

test('recordatorio: sin mediciones no hay nada que recordar', () => {
  assert.equal(H.dueInfo(H.migrateStore({}, ORDER).history, ORDER, new Date()).due, false);
});

/* ---------------------------------------------------------------- texto */

test('texto del avance: suma repeticiones', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'pushup', res(32, '2026-10-01T00:00:00Z'), ORDER);
  h = H.pushResult(h, 'pushup', res(41, '2026-10-29T00:00:00Z'), ORDER);
  const txt = H.deltaText(H.deltaOf(h, 'pushup'), { unit: 'rep' });
  assert.match(txt, /\+9/);
  assert.match(txt, /28 d/);
});

test('texto del avance: segundos de la plancha con un decimal', () => {
  let h = H.migrateStore({}, ORDER).history;
  h = H.pushResult(h, 'plank', res(48.5, '2026-10-01T00:00:00Z'), ORDER);
  h = H.pushResult(h, 'plank', res(62.3, '2026-10-29T00:00:00Z'), ORDER);
  const txt = H.deltaText(H.deltaOf(h, 'plank'), { unit: 's' });
  assert.match(txt, /13,8 s/);
});

test('avance: flexiones con perfiles de distinto sexo o con otras reglas no se comparan', () => {
  const mk = (sex, reglas, value) => ({ value, date: '2026-11-01T10:00:00Z', profile: { age: 20, sex }, reglas });
  assert.equal(H.noComparable('pushup', mk('M', 'a', 10), mk('F', 'a', 12)), 'protocolo');
  assert.equal(H.noComparable('squat', mk('M', 'a', 10), mk('F', 'a', 12)), null);
  assert.equal(H.noComparable('squat', mk('M', 'a', 10), mk('M', 'b', 12)), 'reglas');
  assert.equal(H.noComparable('pushup', mk('M', 'a', 10), mk('M', 'a', 12)), null);
});

test('borrar: quita solo la medición de esa prueba y esa fecha', () => {
  const h = { pushup: [{ value: 1, date: 'a' }, { value: 2, date: 'b' }], squat: [{ value: 3, date: 'a' }], plank: [] };
  const n = H.removeResult(h, 'pushup', 'a');
  assert.deepEqual(n.pushup.map((r) => r.value), [2]);
  assert.equal(n.squat.length, 1);
  assert.equal(h.pushup.length, 2, 'no modifica el original');
});

test('CSV personal: una fila por medición, ; y coma decimal', () => {
  const h = { pushup: [{ value: 12, invalid: 2, date: '2026-11-20T10:00:00Z', profile: { age: 20, sex: 'M' } }],
    squat: [], plank: [{ value: 61.5, date: '2026-11-21T10:00:00Z', captura: { roll: -4.5, movido: true } }] };
  const lines = H.toCSV(h, ORDER, (t) => ({ unidad: t === 'plank' ? 's' : 'rep', categoria: 'Promedio', banda: '20-29' })).trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^fecha;prueba;valor/);
  assert.ok(lines[0].includes(';banda;') && lines[0].includes(';inclinacion_fuente;'), lines[0]);
  assert.ok(lines.some((l) => l.includes(';plank;61,5;s;') && l.includes(';-4,5;;sí;')), lines.join('\n'));
});
