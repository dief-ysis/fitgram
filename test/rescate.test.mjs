/**
 * Rescatar la corrida de una medicion ya tomada.
 *
 * La corrida de la app —que descarto, por que, cuanto rato no vio, con que
 * reglas conto— solo se podia adjuntar desde la pantalla de resultado, en el
 * momento. Si se salia de ahi (alguien toco «Volver», se recargo la pagina, el
 * telefono paso a otra mano) no habia forma de volver a ella: la medicion
 * quedaba como `sinDato` aunque el resultado siguiera guardado en el telefono.
 *
 * Al rescatarla aparece un riesgo nuevo que antes no existia: adjuntar la
 * misma corrida a dos participantes. Eso seria peor que no tener el dato,
 * porque el diagnostico quedaria mal en los dos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './_load.mjs';

const V = loadModule('validation');

const FECHA = '2026-11-17T15:42:00.000Z';

function resultado(extra = {}) {
  const log = Array.from({ length: 20 }, (_, i) => ({ t: i, valid: true, reason: null }))
    .concat([{ t: 21, valid: false, reason: 'No bajaste lo suficiente' }]);
  return Object.assign({ value: 20, invalid: 1, endReason: 'pause', date: FECHA, log,
    sinVer: 0, reglas: '1cjnqw3', calidad: { nivel: 'bien', temblor: 0.009 } }, extra);
}

test('la corrida recuerda cuando se tomo', () => {
  // Sin esta fecha no hay como saber si una corrida ya se uso.
  const run = V.runFromResult(resultado());
  assert.equal(run.fecha, FECHA);
});

test('la fecha sobrevive a guardar y volver a leer', () => {
  const rec = V.newRecord({ participant: 'P01', test: 'pushup', app: 20, raters: [21, 21],
    run: V.runFromResult(resultado()) });
  const leido = V.loadRecords(JSON.parse(JSON.stringify([rec])))[0];
  assert.equal(leido.run.fecha, FECHA);
});

test('una corrida sin fecha no rompe nada: las mediciones viejas no la tienen', () => {
  const vieja = V.newRecord({ participant: 'P01', test: 'pushup', app: 20, raters: [21, 21],
    run: { invalid: 2, counted: 20 } });
  assert.equal(vieja.run.fecha, null);
  assert.equal(vieja.run.invalid, 2);
});

test('avisa si esa corrida ya esta guardada en otra medicion', () => {
  // Adjuntar la serie de P01 a la medicion de P02 dejaria el diagnostico mal
  // en las dos. La app no puede saber quien hizo la serie, pero si puede decir
  // que esa corrida ya la uso alguien.
  const rec = V.newRecord({ participant: 'P01', test: 'pushup', app: 20, raters: [21, 21],
    run: V.runFromResult(resultado()) });
  assert.equal(V.runYaUsada([rec], FECHA)?.participant, 'P01');
  assert.equal(V.runYaUsada([rec], '2026-11-17T16:00:00.000Z'), null);
});

test('sin fecha no se inventa una coincidencia', () => {
  const viejo = V.newRecord({ participant: 'P01', test: 'pushup', app: 20, raters: [21, 21],
    run: { invalid: 1, counted: 20 } });
  assert.equal(V.runYaUsada([viejo], null), null);
  assert.equal(V.runYaUsada([viejo], undefined), null);
  assert.equal(V.runYaUsada([], FECHA), null);
});

test('una medicion tecleada a mano no tiene corrida y no estorba', () => {
  const aMano = V.newRecord({ participant: 'P02', test: 'pushup', app: 18, raters: [19, 19] });
  assert.equal(aMano.run, null);
  assert.equal(V.runYaUsada([aMano], FECHA), null);
});

test('la fecha de la corrida llega al CSV', () => {
  // Cuando midio la app y cuando se tecleo la medicion son dos momentos
  // distintos, y para revisar un dato raro despues hace falta el primero.
  const rec = V.newRecord({ participant: 'P01', test: 'pushup', app: 20, raters: [21, 21],
    date: '2026-11-17T15:50:00.000Z', run: V.runFromResult(resultado()) });
  const csv = V.toCSV([rec], ['pushup', 'squat', 'plank'], {});
  assert.match(csv.split('\n')[0], /fecha_corrida/);
  assert.ok(csv.split('\n')[1].includes(FECHA), csv.split('\n')[1]);
});
