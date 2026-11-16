/**
 * Pruebas del modulo "calidad": si se puede confiar o no en una medicion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './_load.mjs';

const C = loadModule('calidad');
const { synthSession } = loadModule('synth');
const { toJoints, PoseSmoother } = loadModule('skeleton');
const { createAnalyzer } = loadModule('exercises');

/** 33 puntos, todos en (x, y). */
const cuadro = (x, y) => Array.from({ length: 33 }, () => ({ x, y, z: 0, visibility: 1 }));

test('temblor: un movimiento a velocidad constante no tiembla, por rapido que vaya', () => {
  // Es la propiedad que hace que la medida sirva: mide ruido, no velocidad.
  assert.equal(C.temblorCuadro(cuadro(0, 0), cuadro(0.3, 0), cuadro(0.6, 0)), 0);
});

test('temblor: una sacudida cuadro a cuadro si se nota', () => {
  const v = C.temblorCuadro(cuadro(0, 0), cuadro(0.02, 0), cuadro(0, 0));
  assert.ok(v > 0.03, `${v}`);
});

test('temblor: sin los tres cuadros, o con puntos rotos, devuelve NaN en vez de un numero', () => {
  assert.ok(Number.isNaN(C.temblorCuadro(null, cuadro(0, 0), cuadro(0, 0))));
  const roto = cuadro(0, 0).map((p, i) => (i === 11 ? { x: NaN, y: NaN } : p));
  assert.ok(Number.isFinite(C.temblorCuadro(roto, cuadro(0, 0), cuadro(0, 0))), 'un punto roto no bota el resto');
});

test('niveles: los umbrales son los del barrido', () => {
  assert.equal(C.nivelDe(0.0), 'bien');
  assert.equal(C.nivelDe(C.UMBRAL.dudoso - 1e-6), 'bien');
  assert.equal(C.nivelDe(C.UMBRAL.dudoso), 'dudoso');
  assert.equal(C.nivelDe(C.UMBRAL.malo - 1e-6), 'dudoso');
  assert.equal(C.nivelDe(C.UMBRAL.malo), 'malo');
  assert.equal(C.nivelDe(NaN), null);
});

test('seguimiento: no opina hasta tener cuadros suficientes', () => {
  const t = C.createJitterTracker();
  for (let i = 0; i < C.MIN_MUESTRAS; i++) t.push(cuadro(0, 0));
  assert.equal(t.nivel(), null, 'con los primeros dos cuadros no hay segunda diferencia');
  assert.equal(t.resumen(), null);
  for (let i = 0; i < 5; i++) t.push(cuadro(0, 0));
  assert.equal(t.nivel(), 'bien');
  assert.equal(t.resumen().cuadros, C.MIN_MUESTRAS + 5 - 2);
});

test('seguimiento: un cuadro perdido no dispara el aviso', () => {
  // La mediana es justamente para esto: un salto aislado no es ruido.
  const t = C.createJitterTracker();
  for (let i = 0; i < 40; i++) t.push(cuadro(i * 0.01, 0));
  t.push(cuadro(0.9, 0));           // salto brusco, como tras perder cuadros
  for (let i = 0; i < 40; i++) t.push(cuadro(0.9 + i * 0.01, 0));
  assert.equal(t.nivel(), 'bien');
});

test('seguimiento: reset deja el contador en cero', () => {
  const t = C.createJitterTracker();
  for (let i = 0; i < 30; i++) t.push(cuadro(Math.random() * 0.1, 0));
  t.reset();
  assert.equal(t.nivel(), null);
  assert.equal(t.resumen(), null);
});

/* --------------------------------------------- calibracion contra el conteo */

/** La tuberia completa, igual que en la app: puntos crudos al temblor, suavizados al analizador. */
function corre(test, opts) {
  const s = synthSession(test, opts);
  const sm = new PoseSmoother();
  const an = createAnalyzer(test, { sex: 'M' });
  const jt = C.createJitterTracker();
  an.start(s.frames[0].t);
  for (const f of s.frames) {
    jt.push(f.lm);
    const st = an.update(toJoints(sm.smooth(f)));
    if (st.phase === 'ended') break;
  }
  const fin = an.stop(s.frames[s.frames.length - 1].t, 'manual');
  return { contadas: fin.value, esperadas: s.meta.expectedValid, calidad: jt.resumen() };
}

const PUSHUP = { reps: 15, invalidAt: [13, 14], kind: 'sag', fatigueEnd: true };

test('calibracion: con poco ruido el conteo es exacto y la calidad sale bien', () => {
  for (const seed of [1, 2, 3]) {
    const r = corre('pushup', { ...PUSHUP, fps: 30, noise: 0.003, seed });
    assert.equal(r.contadas, r.esperadas, `semilla ${seed}`);
    assert.equal(r.calidad.nivel, 'bien', `semilla ${seed}: temblor ${r.calidad.temblor}`);
  }
});

test('calibracion: el nivel "malo" marca justo donde el conteo se cae', () => {
  // Con ruido 0,025 el conteo llega a cero. Lo que no se puede es que eso pase
  // y la app lo entregue como si nada: tiene que salir marcado.
  let perdidas = 0;
  for (const seed of [1, 2, 3]) {
    const r = corre('pushup', { ...PUSHUP, fps: 30, noise: 0.025, seed });
    perdidas += r.esperadas - r.contadas;
    assert.equal(r.calidad.nivel, 'malo', `semilla ${seed}: temblor ${r.calidad.temblor}`);
  }
  assert.ok(perdidas > 0, 'si no perdiera repeticiones, el aviso sobraria');
});

test('calibracion: la medida no depende de los cuadros por segundo', () => {
  // El conteo aguanta hasta 6 fps sin despeinarse; el temblor tiene que decir
  // lo mismo a 30 que a 15, o estaria midiendo la cadencia en vez del ruido.
  const a = corre('pushup', { ...PUSHUP, fps: 30, noise: 0.006, seed: 5 });
  const b = corre('pushup', { ...PUSHUP, fps: 15, noise: 0.006, seed: 5 });
  assert.equal(a.calidad.nivel, b.calidad.nivel);
  assert.ok(Math.abs(a.calidad.temblor - b.calidad.temblor) < 0.004,
    `${a.calidad.temblor} vs ${b.calidad.temblor}`);
  assert.equal(a.contadas, a.esperadas);
  assert.equal(b.contadas, b.esperadas);
});

test('calibracion: a 6 fps con poco ruido el conteo sigue siendo exacto', () => {
  const r = corre('pushup', { ...PUSHUP, fps: 6, noise: 0.003, seed: 7 });
  assert.equal(r.contadas, r.esperadas, 'los fps bajos no son el problema');
});

test('textos: en vivo solo se avisa lo grave; en el resultado se explican los dos niveles', () => {
  // El cartel grande de la imagen descarta lo que pase de MAX_MENSAJE.
  assert.ok(C.MENSAJE.malo && C.MENSAJE.malo.length <= C.MAX_MENSAJE,
    `MENSAJE.malo tiene ${C.MENSAJE.malo?.length} caracteres y no se veria`);
  assert.equal(C.MENSAJE.dudoso, undefined,
    'el nivel dudoso no interrumpe en vivo: los umbrales son provisorios');
  for (const n of ['dudoso', 'malo']) {
    assert.ok(C.RESULTADO[n] && C.RESULTADO[n].length > 40, `RESULTADO.${n}`);
  }
  assert.equal(C.MENSAJE.bien, undefined, 'con la detección estable no se dice nada');
  assert.equal(C.RESULTADO.bien, undefined);
});
