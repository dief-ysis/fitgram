/**
 * Volver a cargar un respaldo.
 *
 * Las 45 mediciones del estudio viven en el localStorage de un telefono. Habia
 * como sacarlas (CSV y JSON) y no habia como volver a meterlas: el respaldo
 * era una puerta de salida sin entrada. Si el navegador limpia los datos, si
 * alguien toca «borrar todo», si el telefono se resetea o si hay que seguir
 * desde otro equipo, el archivo exportado no servia de nada.
 *
 * La regla de la que cuelga todo lo demas: juntar, nunca reemplazar. Cargar un
 * respaldo sobre un telefono que ya tiene datos no puede borrar los que estan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/validation.mjs';


const med = (participant, t = 'pushup', extra = {}) => Object.assign(
  { participant, test: t, app: 20, raters: [21, 21], date: '2026-11-17T10:00:00.000Z', note: '' }, extra);

const guardada = (participant, t, extra) => V.newRecord(med(participant, t, extra));

test('un respaldo entra en un telefono vacio', () => {
  const r = V.mergeRecords([], [guardada('P01'), guardada('P02')]);
  assert.equal(r.records.length, 2);
  assert.equal(r.agregadas, 2);
  assert.equal(r.yaEstaban, 0);
});

test('cargar un respaldo NO borra lo que ya estaba', () => {
  // Es lo unico que no se puede equivocar: el telefono tiene mediciones de hoy
  // y el respaldo es de ayer.
  const hoy = [guardada('P09'), guardada('P10')];
  const ayer = [guardada('P01'), guardada('P02')];
  const r = V.mergeRecords(hoy, ayer);
  assert.equal(r.records.length, 4);
  for (const p of ['P09', 'P10', 'P01', 'P02']) {
    assert.ok(r.records.some((x) => x.participant === p), `se perdio ${p}`);
  }
});

test('cargar dos veces el mismo respaldo no duplica nada', () => {
  // Pasa solo: uno no se acuerda de si ya lo cargo y lo carga de nuevo.
  const resp = [guardada('P01'), guardada('P02')];
  const una = V.mergeRecords([], resp);
  const dos = V.mergeRecords(una.records, resp);
  assert.equal(dos.records.length, 2);
  assert.equal(dos.agregadas, 0);
  assert.equal(dos.yaEstaban, 2);
});

test('una medicion que choca se agrega igual y se avisa, no se descarta', () => {
  // Mismo participante y misma prueba, pero son mediciones distintas (otro id).
  // Perder una medicion en silencio es peor que tener dos: la pantalla ya sabe
  // avisar de los duplicados, y quien decide cual vale es la persona.
  const actual = [guardada('P01', 'pushup', { app: 20 })];
  const otra = guardada('P01', 'pushup', { app: 23 });
  const r = V.mergeRecords(actual, [otra]);
  assert.equal(r.records.length, 2);
  assert.equal(r.agregadas, 1);
  assert.equal(r.chocan.length, 1);
  assert.deepEqual(r.chocan[0], { participant: 'P01', test: 'pushup' });
});

test('el mismo participante en otra prueba no es un choque', () => {
  const r = V.mergeRecords([guardada('P01', 'pushup')], [guardada('P01', 'squat')]);
  assert.equal(r.chocan.length, 0);
  assert.equal(r.agregadas, 1);
});

test('las filas rotas se cuentan en vez de tumbar la carga entera', () => {
  const r = V.mergeRecords([], [guardada('P01'), { participant: '', test: 'pushup' }, null, guardada('P02')]);
  assert.equal(r.agregadas, 2);
  assert.equal(r.invalidas, 2);
  assert.equal(r.records.length, 2);
});

test('un archivo que no es una lista no rompe nada ni borra nada', () => {
  const actual = [guardada('P01')];
  for (const basura of [null, undefined, {}, 'texto', 42]) {
    const r = V.mergeRecords(actual, basura);
    assert.equal(r.records.length, 1, String(basura));
    assert.equal(r.agregadas, 0);
  }
});

test('la corrida de la app viaja en el respaldo', () => {
  // Sin esto el respaldo perderia el diagnostico: por que no coinciden los
  // conteos, cuanto tiempo no vio, con que reglas se conto.
  const con = guardada('P01', 'pushup', {
    run: { invalid: 2, counted: 20, endReason: 'pause', sinVer: 3.2, reglas: '1cjnqw3',
      reasons: { 'No bajaste lo suficiente': 2 } },
  });
  const r = V.mergeRecords([], [JSON.parse(JSON.stringify(con))]);
  const x = r.records[0];
  assert.equal(x.run.invalid, 2);
  assert.equal(x.run.sinVer, 3.2);
  assert.equal(x.run.reglas, '1cjnqw3');
  assert.equal(V.classifyRecord(x), 'criterio');
});

test('el respaldo conserva el id, que es lo que permite reconocerlo despues', () => {
  const uno = guardada('P01');
  const r = V.mergeRecords([], [JSON.parse(JSON.stringify(uno))]);
  assert.equal(r.records[0].id, uno.id);
});

test('juntar no altera la lista que ya estaba', () => {
  const actual = [guardada('P01')];
  const copia = actual.slice();
  V.mergeRecords(actual, [guardada('P02')]);
  assert.deepEqual(actual, copia);
});
