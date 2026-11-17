/**
 * Intervalo de confianza del CCI.
 *
 * El CCI es el numero con el que se va a defender el estudio. Darlo solo
 * —«CCI = 0,89»— suena mas firme de lo que es: con quince personas por prueba,
 * el intervalo es ancho, y eso hay que poder decirlo antes de que lo pregunte
 * alguien del jurado.
 *
 * El intervalo es el de McGraw y Wong (1996), tabla 7, caso CCI(A,1): el mismo
 * que calcula `irr::icc` en R con model="twoway", type="agreement", unit="single".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/validation.mjs';


const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

/* ------------------------------------------------- el cuantil de la F */

test('el cuantil de la F coincide con las tablas publicadas', () => {
  // Valores de tabla de toda la vida. Si esto estuviera mal, el intervalo
  // saldria mal sin que nada fallara.
  const casos = [
    [0.95, 5, 10, 3.3258], [0.975, 5, 10, 4.2361], [0.99, 4, 8, 7.0061],
    [0.95, 1, 1, 161.448], [0.95, 10, 20, 2.3479], [0.95, 3, 15, 3.2874],
    [0.975, 2, 3, 16.044], [0.95, 20, 20, 2.1242], [0.5, 10, 10, 1.0],
  ];
  for (const [p, d1, d2, esperado] of casos) {
    cerca(V.qf(p, d1, d2), esperado, Math.max(0.003, esperado * 0.002), `F(${p}; ${d1}, ${d2})`);
  }
});

test('la F es creciente en la probabilidad', () => {
  let prev = 0;
  for (const p of [0.5, 0.75, 0.9, 0.95, 0.975, 0.99]) {
    const v = V.qf(p, 6, 12);
    assert.ok(v > prev, `F(${p}) = ${v} no supera a ${prev}`);
    prev = v;
  }
});

test('la F de una probabilidad imposible no inventa un numero', () => {
  for (const p of [0, 1, -0.1, 1.2, NaN]) assert.equal(V.qf(p, 5, 5), null, String(p));
  for (const [d1, d2] of [[0, 5], [5, 0], [-1, 5]]) assert.equal(V.qf(0.95, d1, d2), null, `${d1},${d2}`);
});

/* ------------------------------------------------- el intervalo del CCI */

test('el intervalo contiene siempre a la estimacion', () => {
  const datos = [
    [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]],
    [[20, 21], [18, 19], [25, 24], [30, 31], [15, 14], [22, 23], [28, 27], [19, 20]],
  ];
  for (const rows of datos) {
    const ic = V.icc21CI(rows);
    const punto = V.icc21(rows);
    assert.ok(ic.lower <= punto + 1e-9, `${ic.lower} > ${punto}`);
    assert.ok(ic.upper >= punto - 1e-9, `${ic.upper} < ${punto}`);
    cerca(ic.icc, punto, 1e-12, 'la estimacion tiene que ser la misma de icc21');
  }
});

test('el intervalo se queda dentro de lo que un CCI puede valer', () => {
  const rows = [[20, 21], [18, 19], [25, 24], [30, 31], [15, 14], [22, 23]];
  const ic = V.icc21CI(rows);
  assert.ok(ic.lower >= -1 && ic.upper <= 1, `${ic.lower} a ${ic.upper}`);
});

test('con mas personas el intervalo se angosta', () => {
  // Es lo que justifica tenerlo: dice cuanta gente hace falta.
  const base = [[20, 21], [18, 19], [25, 24], [30, 31], [15, 14], [22, 23], [28, 27], [19, 20]];
  const ancho = (rows) => { const ic = V.icc21CI(rows); return ic.upper - ic.lower; };
  const pocos = ancho(base);
  const hartos = ancho(base.concat(base, base, base));
  assert.ok(hartos < pocos, `con 32 el ancho es ${hartos.toFixed(3)} y con 8 era ${pocos.toFixed(3)}`);
});

test('con acuerdo perfecto el intervalo se apreta contra el 1', () => {
  const rows = Array.from({ length: 15 }, (_, i) => [10 + i, 10 + i]);
  const ic = V.icc21CI(rows);
  cerca(ic.icc, 1, 1e-9);
  assert.ok(ic.lower > 0.99, `el extremo bajo quedo en ${ic.lower}`);
});

test('sin datos suficientes devuelve null en vez de un intervalo inventado', () => {
  for (const rows of [[], [[1, 2]], [[1], [2], [3]], null, [[5, 5], [5, 5], [5, 5]]]) {
    const ic = V.icc21CI(rows);
    assert.ok(ic === null || ic.icc === null, JSON.stringify(rows));
  }
});

/* --------------------------------------- que el intervalo sea el que dice ser */

test('el intervalo cubre el valor verdadero cerca del 95 % de las veces', () => {
  // Esta es la prueba de verdad: una formula mal copiada da un intervalo que
  // parece razonable y cubre el 70 % o el 100 %. Se simulan estudios con un
  // CCI conocido y se cuenta cuantas veces el intervalo acierta.
  //
  // Dos evaluadores, 15 personas: el tamaño del estudio real.
  let semilla = 12345;
  const uni = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const normal = () => {
    const u = Math.max(uni(), 1e-12), v = uni();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Varianza entre personas 1, error 1/3 -> CCI verdadero = 1 / (1 + 1/3) = 0,75.
  const sujeto = 1, error = Math.sqrt(1 / 3);
  const cciReal = sujeto / (sujeto + 1 / 3);
  let cubre = 0, total = 0, anchos = 0;
  for (let s = 0; s < 400; s++) {
    const rows = Array.from({ length: 15 }, () => {
      const base = normal() * Math.sqrt(sujeto);
      return [base + normal() * error, base + normal() * error];
    });
    const ic = V.icc21CI(rows);
    if (!ic || ic.lower == null) continue;
    total++;
    anchos += ic.upper - ic.lower;
    if (ic.lower <= cciReal && cciReal <= ic.upper) cubre++;
  }
  const cobertura = cubre / total;
  assert.ok(total > 350, `solo se pudieron calcular ${total} intervalos`);
  assert.ok(cobertura > 0.90 && cobertura < 0.99,
    `cubrio el ${(cobertura * 100).toFixed(1)} % de las veces, no el 95 %`);
  // Y de paso deja medido lo que importa para el estudio: cuanto mide el
  // intervalo con quince personas.
  assert.ok(anchos / total > 0.1, 'con 15 personas el intervalo no puede salir angosto');
});

/* --------------------------------------------------- llega al resumen */

test('el resumen del estudio entrega el intervalo junto al numero', () => {
  const rec = (participant, app, r1, r2) => V.newRecord({ participant, test: 'pushup', app, raters: [r1, r2] });
  const registros = Array.from({ length: 12 }, (_, i) =>
    rec(`P${i}`, 20 + i, 20 + i + (i % 3 === 0 ? 1 : 0), 20 + i));
  const s = V.summary(registros, ['pushup']).byTest.pushup;
  assert.ok(s.icc != null, 'deberia haber CCI');
  assert.ok(s.iccCI && s.iccCI.length === 2, JSON.stringify(s.iccCI));
  assert.ok(s.iccCI[0] <= s.icc && s.icc <= s.iccCI[1], `${s.iccCI} no contiene ${s.icc}`);
});

test('con poca gente el resumen marca el CCI como poco confiable', () => {
  // Con dos sujetos la formula igual da un numero, y si ademas coinciden da 1
  // con intervalo [1, 1]. Eso no es un CCI defendible: lo que protege es la
  // marca de pocos sujetos, y la pantalla la muestra al lado.
  const rec = (participant, app) => V.newRecord({ participant, test: 'pushup', app, raters: [app, app] });
  const pocos = V.summary([rec('P1', 20), rec('P2', 21)], ['pushup']).byTest.pushup;
  assert.equal(pocos.iccReliable, false, 'dos personas no pueden pasar por confiables');

  // Con una sola fila no hay nada que calcular.
  const una = V.summary([rec('P1', 20)], ['pushup']).byTest.pushup;
  assert.equal(una.icc, null);
  assert.equal(una.iccCI, null);
});
