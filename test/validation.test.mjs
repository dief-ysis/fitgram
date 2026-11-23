/**
 * Pruebas del modulo "validation" de index.html.
 * Mismo truco que history.test.mjs: se recorta el pseudo-modulo y se evalua en Node.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/validation.mjs';
import * as Cal from '../src/calidad.mjs';


const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b} (tol ${tol})`);

const rec = (participant, test, app, raters, date = '2026-11-15') =>
  V.newRecord({ participant, test, app, raters, date: new Date(date).toISOString() });

/* ------------------------------------------------------------------ ICC */

test('ICC(2,1): reproduce el ejemplo publicado de Shrout y Fleiss (1979)', () => {
  // 6 sujetos x 4 jueces. Los valores publicados son ICC(1,1)=0,17 ICC(2,1)=0,29 ICC(3,1)=0,71.
  const rows = [
    [9, 2, 5, 8],
    [6, 1, 3, 2],
    [8, 4, 6, 8],
    [7, 1, 2, 6],
    [10, 5, 6, 9],
    [6, 2, 4, 7],
  ];
  near(V.icc21(rows), 0.2898, 0.001);
});

test('ICC(2,1): acuerdo perfecto da 1', () => {
  near(V.icc21([[10, 10], [20, 20], [30, 30], [40, 40]]), 1, 1e-9);
});

test('ICC(2,1): sin suficientes datos devuelve null en vez de un numero inventado', () => {
  assert.equal(V.icc21([[1, 2]]), null, 'un solo sujeto');
  assert.equal(V.icc21([[1], [2], [3]]), null, 'un solo evaluador');
  assert.equal(V.icc21([]), null);
});

test('ICC(2,1): sin varianza entre sujetos devuelve null, no una division por cero', () => {
  assert.equal(V.icc21([[5, 5], [5, 5], [5, 5]]), null);
});

/* ------------------------------------------------- Bland-Altman */

test('Bland-Altman: sesgo, desviacion y limites de acuerdo', () => {
  const ba = V.blandAltman([10, 12, 14, 16], [9, 12, 13, 17]);
  near(ba.bias, 0.25);            // diferencias: 1, 0, 1, -1
  near(ba.sd, 0.9574, 1e-3);      // desviacion muestral (n-1)
  near(ba.loA[0], 0.25 - 1.96 * 0.9574, 1e-3);
  near(ba.loA[1], 0.25 + 1.96 * 0.9574, 1e-3);
});

test('Bland-Altman: con menos de 2 pares no hay limites', () => {
  assert.equal(V.blandAltman([5], [5]).sd, null);
});

/* ------------------------------------------------- registros */

test('registro: se guarda con id, y los conteos quedan como numeros', () => {
  const r = rec('P01', 'pushup', '29', ['28', '29']);
  assert.ok(r.id, 'deberia traer id');
  assert.equal(r.app, 29);
  assert.deepEqual(r.raters, [28, 29]);
  assert.equal(r.test, 'pushup');
});

test('registro: rechaza conteos que no son numeros', () => {
  assert.throws(() => V.newRecord({ participant: 'P01', test: 'pushup', app: 'x', raters: [1, 2] }));
  assert.throws(() => V.newRecord({ participant: 'P01', test: 'pushup', app: 10, raters: [] }));
});

test('registro: el codigo del participante se normaliza y no admite vacio', () => {
  assert.equal(V.newRecord({ participant: '  p01 ', test: 'squat', app: 1, raters: [1] }).participant, 'P01');
  assert.throws(() => V.newRecord({ participant: '   ', test: 'squat', app: 1, raters: [1] }));
});

test('registros: agregar y borrar', () => {
  let rs = [];
  const a = rec('P01', 'pushup', 29, [28, 29]);
  rs = V.addRecord(rs, a);
  rs = V.addRecord(rs, rec('P02', 'pushup', 31, [31, 30]));
  assert.equal(rs.length, 2);
  rs = V.removeRecord(rs, a.id);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].participant, 'P02');
});

test('registros: agregar no modifica la lista que recibe', () => {
  const rs = [];
  V.addRecord(rs, rec('P01', 'pushup', 29, [28, 29]));
  assert.equal(rs.length, 0);
});

/* ------------------------------------------------- acuerdo */

test('acuerdo: app igual a los evaluadores da 100 %', () => {
  const rs = [
    rec('P01', 'pushup', 20, [20, 20]),
    rec('P02', 'pushup', 30, [30, 30]),
    rec('P03', 'pushup', 25, [25, 25]),
  ];
  const s = V.summary(rs, ['pushup']).byTest.pushup;
  assert.equal(s.n, 3);
  near(s.relAgreement, 100);
  near(s.bias, 0);
  assert.equal(s.exact, 100);
});

test('acuerdo: una diferencia de 1 sobre 20 da 95 %', () => {
  const rs = [rec('P01', 'pushup', 19, [20, 20])];
  const s = V.summary(rs, ['pushup']).byTest.pushup;
  near(s.relAgreement, 95);
  near(s.bias, -1);
  assert.equal(s.exact, 0);
  assert.equal(s.within1, 100);
});

test('acuerdo: la referencia es el promedio de los evaluadores', () => {
  const rs = [rec('P01', 'squat', 30, [28, 32])];
  const s = V.summary(rs, ['squat']).byTest.squat;
  near(s.bias, 0, 1e-9);
  near(s.relAgreement, 100);
});

test('acuerdo: tambien mide cuanto se parecen los evaluadores entre si', () => {
  const rs = [
    rec('P01', 'pushup', 20, [20, 24]),
    rec('P02', 'pushup', 30, [30, 34]),
    rec('P03', 'pushup', 25, [25, 29]),
  ];
  const s = V.summary(rs, ['pushup']).byTest.pushup;
  near(s.raters.bias, -4, 1e-9); // evaluador 1 cuenta 4 menos que el 2
  assert.ok(s.raters.relAgreement < 90, 'los evaluadores no se parecen tanto');
});

test('acuerdo: con un solo evaluador no se inventa el acuerdo entre evaluadores', () => {
  const s = V.summary([rec('P01', 'pushup', 20, [20])], ['pushup']).byTest.pushup;
  assert.equal(s.raters, null);
});

test('acuerdo: no divide por cero cuando la referencia es 0', () => {
  const s = V.summary([rec('P01', 'pushup', 0, [0, 0])], ['pushup']).byTest.pushup;
  assert.ok(Number.isFinite(s.relAgreement));
});

test('acuerdo: el total solo junta lo que no tiene unidad', () => {
  const rs = [
    rec('P01', 'pushup', 19, [20, 20]), // 95 %
    rec('P01', 'plank', 57, [60, 60]),  // 95 %
  ];
  const o = V.summary(rs, ['pushup', 'plank']).overall;
  assert.equal(o.n, 2);
  near(o.relAgreement, 95);
  assert.equal(o.bias, undefined, 'no deberia mezclar repeticiones con segundos');
});

test('acuerdo: sin registros no hay numeros', () => {
  const s = V.summary([], ['pushup']);
  assert.equal(s.byTest.pushup, null);
  assert.equal(s.overall, null);
});

test('acuerdo: cuenta cuantas personas distintas se midieron, no cuantos registros', () => {
  const rs = [
    rec('P01', 'pushup', 20, [20, 20]),
    rec('P01', 'squat', 30, [30, 30]),
    rec('P02', 'pushup', 25, [25, 25]),
  ];
  assert.equal(V.summary(rs, ['pushup', 'squat']).overall.people, 2);
});

/* ------------------------------------------------- exportar */

test('CSV: trae encabezado y una fila por registro', () => {
  const rs = [rec('P01', 'pushup', 29, [28, 29], '2026-11-15T12:00:00Z')];
  const csv = V.toCSV(rs);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /participante/);
  assert.match(lines[1], /P01/);
  assert.ok(lines[1].includes(';'), 'separado con ; para Excel en Chile');
});

test('CSV: los decimales van con coma y el texto raro no rompe las columnas', () => {
  const r = V.newRecord({ participant: 'P01', test: 'plank', app: 61.5, raters: [60, 62], note: 'cayó; la cadera' });
  const line = V.toCSV([r]).trim().split('\n')[1];
  assert.ok(line.includes('61,5'), `decimales con coma: ${line}`);
  assert.ok(line.includes('"cayó; la cadera"'), `el ; del texto va entre comillas: ${line}`);
});

/* ------------------------------------------------- pruebas cronometradas */

test('acuerdo: en una prueba de tiempo no se reporta el acuerdo exacto ni el ±1', () => {
  const rs = [rec('P01', 'plank', 61.5, [60, 63]), rec('P02', 'plank', 44, [45, 46])];
  const s = V.summary(rs, ['plank'], { plank: 's' }).byTest.plank;
  assert.equal(s.timed, true);
  assert.equal(s.exact, null, 'un segundo exacto no significa nada en un sostenido');
  assert.equal(s.within1, null);
  assert.ok(Number.isFinite(s.relAgreement));
  assert.ok(Number.isFinite(s.bias));
});

test('acuerdo: el total cuenta el exacto y el ±1 solo sobre las pruebas de repeticiones', () => {
  const rs = [
    rec('P01', 'pushup', 20, [20, 20]),  // exacto
    rec('P02', 'pushup', 19, [20, 20]),  // dentro de 1
    rec('P03', 'plank', 50, [60, 60]),   // cronometrada, no entra en esos dos
  ];
  const o = V.summary(rs, ['pushup', 'plank'], { plank: 's' }).overall;
  assert.equal(o.n, 3, 'el acuerdo relativo sí usa las tres');
  assert.equal(o.counted, 2, 'pero el exacto y el ±1 solo las dos de repeticiones');
  assert.equal(o.exact, 50);
  assert.equal(o.within1, 100);
});

test('acuerdo: avisa cuando hay muy pocos sujetos para confiar en el CCI', () => {
  const pocos = [rec('P01', 'pushup', 20, [20, 21]), rec('P02', 'pushup', 30, [30, 31])];
  assert.equal(V.summary(pocos, ['pushup']).byTest.pushup.iccReliable, false);
  const hartos = Array.from({ length: 6 }, (_, i) => rec(`P0${i}`, 'pushup', 20 + i * 3, [20 + i * 3, 21 + i * 3]));
  assert.equal(V.summary(hartos, ['pushup']).byTest.pushup.iccReliable, true);
});

/* ------------------------------------------- en terreno: no perder datos */

test('duplicados: encuentra una medicion ya hecha de la misma persona y prueba', () => {
  const rs = [rec('P01', 'pushup', 20, [20, 21]), rec('P02', 'pushup', 30, [30, 31])];
  assert.equal(V.findDuplicate(rs, 'P01', 'pushup').app, 20);
  assert.equal(V.findDuplicate(rs, 'P01', 'squat'), null, 'otra prueba no es duplicado');
  assert.equal(V.findDuplicate(rs, 'P03', 'pushup'), null, 'otra persona tampoco');
});

test('duplicados: el codigo se compara normalizado, como lo guarda newRecord', () => {
  const rs = [rec('P01', 'pushup', 20, [20, 21])];
  assert.ok(V.findDuplicate(rs, '  p01  ', 'pushup'), 'minusculas y espacios son la misma persona');
});

test('reemplazar: deja la medicion nueva en el lugar de la vieja y conserva su id', () => {
  const rs = [rec('P01', 'pushup', 20, [20, 21]), rec('P02', 'pushup', 30, [30, 31])];
  const id = rs[0].id;
  const out = V.replaceRecord(rs, id, rec('P01', 'pushup', 25, [25, 26]));
  assert.equal(out.length, 2, 'no crece');
  assert.equal(out[0].id, id, 'mismo id: lo exportado antes sigue cuadrando');
  assert.equal(out[0].app, 25);
  assert.equal(out[1].app, 30, 'no toca a los demas');
});

test('reemplazar: con un id que no existe no inventa ni pierde nada', () => {
  const rs = [rec('P01', 'pushup', 20, [20, 21])];
  const out = V.replaceRecord(rs, 'no-existe', rec('P01', 'pushup', 25, [25, 26]));
  assert.deepEqual(out, rs);
});

test('avance: dice que pruebas ya le tomaron a una persona, en el orden de la app', () => {
  const orden = ['plank', 'pushup', 'squat'];
  const rs = [rec('P01', 'squat', 30, [30, 31]), rec('P01', 'plank', 60, [60, 61])];
  assert.deepEqual(V.testsDoneBy(rs, 'P01', orden), ['plank', 'squat'], 'ordenadas como en la app');
  assert.deepEqual(V.testsDoneBy(rs, 'P02', orden), []);
});

test('avance: propone la siguiente prueba que le falta a la misma persona', () => {
  const orden = ['plank', 'pushup', 'squat'];
  const rs = [rec('P01', 'plank', 60, [60, 61])];
  assert.equal(V.nextPendingTest(rs, 'P01', orden, 'plank'), 'pushup');
  const dos = rs.concat([rec('P01', 'pushup', 20, [20, 21])]);
  assert.equal(V.nextPendingTest(dos, 'P01', orden, 'pushup'), 'squat');
});

test('avance: si a la persona no le falta ninguna, no propone nada', () => {
  const orden = ['plank', 'pushup'];
  const rs = [rec('P01', 'plank', 60, [60, 61]), rec('P01', 'pushup', 20, [20, 21])];
  assert.equal(V.nextPendingTest(rs, 'P01', orden, 'pushup'), null);
});

test('avance: envuelve, para no dejar afuera una prueba anterior', () => {
  const orden = ['plank', 'pushup', 'squat'];
  const rs = [rec('P01', 'pushup', 20, [20, 21])];
  // Venia en flexiones y le falta la plancha, que esta antes: igual la propone.
  assert.equal(V.nextPendingTest(rs, 'P01', orden, 'pushup'), 'squat');
  const conSquat = rs.concat([rec('P01', 'squat', 30, [30, 31])]);
  assert.equal(V.nextPendingTest(conSquat, 'P01', orden, 'squat'), 'plank');
});

test('codigos: lista los participantes ya ingresados, sin repetir y ordenados', () => {
  const rs = [rec('P03', 'pushup', 20, [20, 21]), rec('P01', 'pushup', 20, [20, 21]), rec('P03', 'squat', 20, [20, 21])];
  assert.deepEqual(V.participantCodes(rs), ['P01', 'P03']);
});

test('respaldo: cuenta las mediciones guardadas despues de la ultima exportacion', () => {
  const rs = [
    rec('P01', 'pushup', 20, [20, 21], '2026-11-15T10:00:00Z'),
    rec('P02', 'pushup', 20, [20, 21], '2026-11-15T12:00:00Z'),
  ];
  assert.equal(V.unexportedCount(rs, null), 2, 'sin exportar nunca, todas');
  assert.equal(V.unexportedCount(rs, '2026-11-15T11:00:00Z'), 1);
  assert.equal(V.unexportedCount(rs, '2026-11-15T13:00:00Z'), 0);
});

test('respaldo: una fecha de exportacion ilegible se trata como si no hubiera', () => {
  const rs = [rec('P01', 'pushup', 20, [20, 21])];
  assert.equal(V.unexportedCount(rs, 'cualquier cosa'), 1, 'mejor avisar de mas que dar por salvado');
});

/* ------------------------------------------- por que no coinciden los conteos */

const corrida = (valid, rechazos, endReason = 'manual') => ({
  invalid: rechazos.length,
  endReason,
  log: Array.from({ length: valid }, () => ({ valid: true, reason: null }))
    .concat(rechazos.map((reason) => ({ valid: false, reason }))),
});

test('corrida: resume lo que la app conto y lo que descarto, con los motivos', () => {
  const r = V.runFromResult(corrida(20, ['No bajaste lo suficiente', 'No bajaste lo suficiente', 'Cadera caida'], 'pause'));
  assert.equal(r.counted, 20);
  assert.equal(r.invalid, 3);
  assert.equal(r.endReason, 'pause');
  assert.deepEqual(r.reasons, { 'No bajaste lo suficiente': 2, 'Cadera caida': 1 });
});

test('corrida: sin resultado o sin registro no inventa nada', () => {
  assert.equal(V.runFromResult(null), null);
  const vacia = V.runFromResult({ invalid: 0, endReason: 'manual', log: [] });
  assert.deepEqual(vacia.reasons, {});
  assert.equal(vacia.counted, 0);
});

test('clasificar: mismo conteo es acuerdo', () => {
  const r = Object.assign(rec('P01', 'pushup', 24, [24, 24]), { run: V.runFromResult(corrida(24, [])) });
  assert.equal(V.classifyRecord(r), 'acuerdo');
});

test('clasificar: media repeticion de diferencia es que los humanos no coinciden, no un fallo', () => {
  const r = Object.assign(rec('P01', 'pushup', 24, [24, 25]), { run: V.runFromResult(corrida(24, [])) });
  assert.equal(V.classifyRecord(r), 'acuerdo');
});

test('clasificar: si la app descarto suficientes, la diferencia es de criterio y no de deteccion', () => {
  // La app conto 23, los evaluadores 25, y descarto 2 por profundidad: no se le
  // escaparon, las rechazo. Es la distincion que cambia la lectura del estudio.
  const r = Object.assign(rec('P01', 'pushup', 23, [25, 25]), {
    run: V.runFromResult(corrida(23, ['No bajaste lo suficiente', 'No bajaste lo suficiente'])),
  });
  assert.equal(V.classifyRecord(r), 'criterio');
});

test('clasificar: si no descarto suficientes, se le escaparon repeticiones', () => {
  const r = Object.assign(rec('P01', 'pushup', 23, [25, 25]), { run: V.runFromResult(corrida(23, [])) });
  assert.equal(V.classifyRecord(r), 'noDetectadas');
});

test('clasificar: contar de mas es su propia categoria', () => {
  const r = Object.assign(rec('P01', 'pushup', 27, [25, 25]), { run: V.runFromResult(corrida(27, [])) });
  assert.equal(V.classifyRecord(r), 'deMas');
});

test('clasificar: sin corrida adjunta no se adivina el motivo de la diferencia', () => {
  assert.equal(V.classifyRecord(rec('P01', 'pushup', 23, [25, 25])), 'sinDato');
  assert.equal(V.classifyRecord(rec('P01', 'pushup', 25, [25, 25])), 'acuerdo', 'el acuerdo si se ve sin corrida');
});

test('clasificar: en las cronometradas no aplica, una diferencia de segundos no es una repeticion', () => {
  assert.equal(V.classifyRecord(rec('P01', 'plank', 50, [60, 60]), true), null);
});

test('desglose: cuenta las diferencias por tipo, dejando fuera las cronometradas', () => {
  const rs = [
    Object.assign(rec('P01', 'pushup', 25, [25, 25]), { run: V.runFromResult(corrida(25, [])) }),
    Object.assign(rec('P02', 'pushup', 23, [25, 25]), { run: V.runFromResult(corrida(23, ['Poca profundidad', 'Poca profundidad'])) }),
    Object.assign(rec('P03', 'pushup', 23, [25, 25]), { run: V.runFromResult(corrida(23, [])) }),
    Object.assign(rec('P04', 'squat', 27, [25, 25]), { run: V.runFromResult(corrida(27, [])) }),
    rec('P05', 'plank', 50, [60, 60]),
  ];
  const b = V.breakdown(rs, ['pushup', 'squat', 'plank'], { plank: 's' });
  assert.equal(b.total, 4, 'la plancha no entra');
  assert.equal(b.acuerdo, 1);
  assert.equal(b.criterio, 1);
  assert.equal(b.noDetectadas, 1);
  assert.equal(b.deMas, 1);
  assert.equal(b.sinDato, 0);
});

test('motivos: dice cual es el criterio que mas veces choca con los evaluadores', () => {
  const rs = [
    Object.assign(rec('P01', 'pushup', 23, [25, 25]), { run: V.runFromResult(corrida(23, ['Poca profundidad', 'Poca profundidad'])) }),
    Object.assign(rec('P02', 'pushup', 24, [25, 25]), { run: V.runFromResult(corrida(24, ['Poca profundidad'])) }),
    Object.assign(rec('P03', 'pushup', 24, [25, 25]), { run: V.runFromResult(corrida(24, ['Cadera caida'])) }),
  ];
  assert.deepEqual(V.topReasons(rs), [['Poca profundidad', 3], ['Cadera caida', 1]]);
});

test('guardar: la corrida viaja con la medicion y sobrevive a releerla del almacenamiento', () => {
  const r = V.newRecord({
    participant: 'P01', test: 'pushup', app: 23, raters: [25, 25],
    run: V.runFromResult(corrida(23, ['Poca profundidad', 'Poca profundidad'])),
  });
  assert.equal(r.run.invalid, 2);
  const vuelta = V.loadRecords([JSON.parse(JSON.stringify(r))]);
  assert.equal(vuelta[0].run.invalid, 2);
  assert.deepEqual(vuelta[0].run.reasons, { 'Poca profundidad': 2 });
});

test('guardar: una corrida con basura no bota la medicion, solo se queda sin ella', () => {
  const r = V.newRecord({ participant: 'P01', test: 'pushup', app: 23, raters: [25, 25], run: 'cualquier cosa' });
  assert.equal(r.run, null);
  assert.equal(r.app, 23, 'la medicion se guarda igual');
});

test('CSV: lleva lo descartado, el motivo principal y la clasificacion', () => {
  const rs = [Object.assign(rec('P01', 'pushup', 23, [25, 25]), {
    run: V.runFromResult(corrida(23, ['Poca profundidad', 'Poca profundidad'], 'pause')),
  })];
  const csv = V.toCSV(rs, ['pushup'], { pushup: 'rep' });
  const [head, fila] = csv.trim().split('\n');
  assert.ok(head.includes('descartadas'), head);
  assert.ok(head.includes('motivo_principal'), head);
  assert.ok(head.includes('clasificacion'), head);
  assert.ok(fila.includes('Poca profundidad'), fila);
  assert.ok(fila.includes('criterio'), fila);
  assert.ok(fila.includes('pause'), fila);
});

test('corrida: lleva tambien si se podia confiar en la deteccion', () => {
  const r = V.runFromResult({
    invalid: 1, endReason: 'manual', log: [{ valid: false, reason: 'Poca profundidad' }],
    calidad: { temblor: 0.0512, nivel: 'malo', cuadros: 300 },
  });
  assert.equal(r.calidad, 'malo');
  assert.equal(r.temblor, 0.0512);
});

test('corrida: sin medida de calidad no se inventa un nivel', () => {
  const r = V.runFromResult({ invalid: 0, endReason: 'manual', log: [] });
  assert.equal(r.calidad, null);
  assert.equal(r.temblor, null);
});

test('guardar: la calidad sobrevive a releer la medicion del almacenamiento', () => {
  const rec0 = V.newRecord({
    participant: 'P01', test: 'pushup', app: 9, raters: [14, 14],
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], calidad: { temblor: 0.062, nivel: 'malo', cuadros: 200 } }),
  });
  const vuelta = V.loadRecords([JSON.parse(JSON.stringify(rec0))]);
  assert.equal(vuelta[0].run.calidad, 'malo');
  assert.equal(vuelta[0].run.temblor, 0.062);
});

test('CSV: lleva el temblor y la calidad de la deteccion', () => {
  const rs = [Object.assign(rec('P01', 'pushup', 9, [14, 14]), {
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], calidad: { temblor: 0.062, nivel: 'malo', cuadros: 200 } }),
  })];
  const csv = V.toCSV(rs, ['pushup'], { pushup: 'rep' });
  const [head, fila] = csv.trim().split('\n');
  assert.ok(head.includes('temblor'), head);
  assert.ok(head.includes('calidad'), head);
  assert.ok(fila.includes('0,062'), fila);
  assert.ok(fila.includes('malo'), fila);
});

test('corrida: lleva el tiempo en que la app no estuvo mirando', () => {
  const r = V.runFromResult({ invalid: 0, endReason: 'manual', log: [], sinVer: 3.2 });
  assert.equal(r.sinVer, 3.2);
  assert.equal(V.runFromResult({ invalid: 0, endReason: 'manual', log: [] }).sinVer, null);
});

test('CSV: lleva el tiempo sin ver, que explica un conteo corto sin culpar a la deteccion', () => {
  const rs = [Object.assign(rec('P01', 'pushup', 12, [15, 15]), {
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], sinVer: 3.2 }),
  })];
  const csv = V.toCSV(rs, ['pushup'], { pushup: 'rep' });
  const [head, fila] = csv.trim().split('\n');
  assert.ok(head.includes('sin_ver'), head);
  assert.ok(fila.includes('3,2'), fila);
});

test('clasificar: si la app no estuvo mirando, la diferencia no es un fallo de deteccion', () => {
  // Alguien se cruzo delante. Decir "no detectadas" culparia al detector por
  // algo que paso delante de la camara, y son dos arreglos distintos.
  const r = Object.assign(rec('P01', 'pushup', 12, [15, 15]), {
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], sinVer: 3.2 }),
  });
  assert.equal(V.classifyRecord(r), 'interrumpida');
});

test('clasificar: una interrupcion corta no excusa la diferencia', () => {
  const r = Object.assign(rec('P01', 'pushup', 12, [15, 15]), {
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], sinVer: 0.2 }),
  });
  assert.equal(V.classifyRecord(r), 'noDetectadas');
});

test('clasificar: lo que la app descarto por tecnica manda sobre la interrupcion', () => {
  // Si rechazo suficientes para explicar la diferencia, es criterio: no hace
  // falta invocar la interrupcion.
  const r = Object.assign(rec('P01', 'pushup', 13, [15, 15]), {
    run: V.runFromResult({ invalid: 2, endReason: 'manual', sinVer: 3.2,
      log: [{ valid: false, reason: 'Poca profundidad' }, { valid: false, reason: 'Poca profundidad' }] }),
  });
  assert.equal(V.classifyRecord(r), 'criterio');
});

test('el umbral de interrupcion es el mismo que usa el modulo de calidad', () => {
  // Esta duplicado a proposito: los modulos no se referencian entre si para
  // poder probarlos sueltos. Esta prueba es la que mantiene los dos iguales.
  assert.equal(V.SIN_VER_MIN, Cal.SIN_VER_MIN);
});

test('desglose: la interrupcion es su propia categoria', () => {
  const rs = [
    Object.assign(rec('P01', 'pushup', 15, [15, 15]), { run: V.runFromResult({ invalid: 0, log: [] }) }),
    Object.assign(rec('P02', 'pushup', 12, [15, 15]), { run: V.runFromResult({ invalid: 0, log: [], sinVer: 3 }) }),
  ];
  const b = V.breakdown(rs, ['pushup'], {});
  assert.equal(b.acuerdo, 1);
  assert.equal(b.interrumpida, 1);
  assert.equal(b.noDetectadas, 0);
  assert.equal(b.total, 2);
});

/* --------------------------------- con que reglas se tomo cada medicion */

const conReglas = (participant, test, app, raters, reglas) =>
  Object.assign(rec(participant, test, app, raters), {
    run: V.runFromResult({ invalid: 0, endReason: 'manual', log: [], reglas }),
  });

test('corrida: la medicion guarda con que reglas de conteo se tomo', () => {
  assert.equal(V.runFromResult({ invalid: 0, log: [], reglas: 'abc1234' }).reglas, 'abc1234');
  assert.equal(V.runFromResult({ invalid: 0, log: [] }).reglas, null);
});

test('reglas: con una sola version no hay nada que avisar', () => {
  const rs = [conReglas('P01', 'pushup', 15, [15, 15], 'abc1234'),
    conReglas('P02', 'pushup', 14, [14, 14], 'abc1234')];
  assert.deepEqual(V.reglasUsadas(rs), ['abc1234']);
});

test('reglas: si el estudio mezcla dos versiones, se ven las dos', () => {
  // Es lo que hace que 45 mediciones dejen de ser una sola tanda.
  const rs = [conReglas('P01', 'pushup', 15, [15, 15], 'abc1234'),
    conReglas('P02', 'pushup', 14, [14, 14], 'zzz9999')];
  assert.deepEqual(V.reglasUsadas(rs), ['abc1234', 'zzz9999']);
});

test('reglas: las mediciones tecleadas a mano no cuentan como otra version', () => {
  const rs = [conReglas('P01', 'pushup', 15, [15, 15], 'abc1234'),
    rec('P02', 'pushup', 14, [14, 14])];
  assert.deepEqual(V.reglasUsadas(rs), ['abc1234']);
});

test('CSV: lleva la huella de las reglas de cada medicion', () => {
  const csv = V.toCSV([conReglas('P01', 'pushup', 15, [15, 15], 'abc1234')], ['pushup'], {});
  const [head, fila] = csv.trim().split('\n');
  assert.ok(head.includes('reglas'), head);
  assert.ok(fila.includes('abc1234'), fila);
});

test('CSV: la inclinación del teléfono y si se movió viajan con la corrida', () => {
  const r = V.newRecord({ participant: 'P01', test: 'squat', app: 20, raters: [20, 21],
    run: V.runFromResult({ value: 20, log: [], date: '2026-11-22T10:00:00Z', captura: { fuente: 'sensor', roll: -7.5, movido: true } }) });
  const [head, line] = V.toCSV([r]).trim().split('\n');
  assert.ok(head.includes('inclinacion;inclinacion_fuente;telefono_movido'), head);
  assert.ok(line.includes('-7,5;sensor;sí'), line);
});
