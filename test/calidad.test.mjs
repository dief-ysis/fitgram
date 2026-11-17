/**
 * Pruebas del modulo "calidad": si se puede confiar o no en una medicion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calidad.mjs';
import { synthSession } from '../src/synth.mjs';
import { toJoints, PoseSmoother } from '../src/skeleton.mjs';
import { createAnalyzer } from '../src/exercises.mjs';


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

/* ------------------- la regla de las dos seguidas y la calidad de la imagen */

/** Una serie donde la persona hace TODO bien: nada que rechazar. */
function seriePerfecta(test, opts) {
  const s = synthSession(test, { fps: 30, ...opts });
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
  return { contadas: fin.value, esperadas: s.meta.expectedValid, fin: fin.endReason,
    calidad: jt.resumen(), sinVer: fin.sinVer };
}

test('la prueba no se corta por tecnica en una serie perfecta con la deteccion sana', () => {
  // La prueba termina con dos repeticiones mal hechas SEGUIDAS. Si la deteccion
  // rechazara buenas, esa regla cortaria la prueba antes de tiempo y la persona
  // se llevaria un numero muy por debajo de lo suyo. No pasa mientras la
  // deteccion este sana.
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const [prueba, opts] of [['pushup', { reps: 15 }], ['squat', { reps: 16 }]]) {
      const r = seriePerfecta(prueba, { ...opts, noise: 0.008, seed });
      assert.notEqual(r.fin, 'technique', `${prueba} semilla ${seed}: se corto sola`);
      assert.equal(r.contadas, r.esperadas, `${prueba} semilla ${seed}`);
    }
  }
});

test('cuando si se corta sola, la app ya venia avisando de la deteccion', () => {
  // Con ruido alto la regla de las dos seguidas si dispara sobre series
  // perfectas. Lo que no puede pasar es que corte en silencio: si corta, el
  // nivel de calidad tiene que estar en 'malo' y el aviso ya estuvo en pantalla.
  let cortes = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = seriePerfecta('pushup', { reps: 15, noise: 0.020, seed });
    if (r.fin === 'technique') {
      cortes++;
      assert.equal(r.calidad.nivel, 'malo', `semilla ${seed}: corto sin avisar`);
    }
  }
  assert.ok(cortes > 0, 'si no cortara nunca, esta prueba no estaria comprobando nada');
});

/* ------------------------------------------- tiempo en que la app no miraba */

test('sin ver: el analizador informa cuanto tiempo no estuvo mirando', () => {
  // Alguien se cruza delante de la camara tres segundos.
  const r = seriePerfecta('pushup', { reps: 15, noise: 0.003, seed: 1, hide: [{ t: 12, dur: 3 }] });
  assert.ok(Math.abs(r.sinVer - 3) < 0.2, `informo ${r.sinVer} s`);
});

test('sin ver: sin interrupciones el tiempo es cero', () => {
  const r = seriePerfecta('pushup', { reps: 15, noise: 0.003, seed: 1 });
  assert.equal(r.sinVer, 0);
});

test('sin ver: una interrupcion corta ya cuesta repeticiones, por eso hay que avisarla', () => {
  // Es lo que justifica el umbral: a 0,3 s no se pierde nada, de 0,8 s en
  // adelante si, y la prueba termina normal sin que nada lo diga.
  const corta = seriePerfecta('pushup', { reps: 15, noise: 0.003, seed: 1, hide: [{ t: 12, dur: 0.3 }] });
  assert.equal(corta.contadas, corta.esperadas, 'a 0,3 s no se pierde nada');
  assert.ok(corta.sinVer < C.SIN_VER_MIN, 'y queda bajo el umbral del aviso');

  const larga = seriePerfecta('pushup', { reps: 15, noise: 0.003, seed: 1, hide: [{ t: 12, dur: 3 }] });
  assert.ok(larga.contadas < larga.esperadas, 'a 3 s si se pierden');
  assert.equal(larga.fin, 'manual', 'y la prueba termina como si nada hubiera pasado');
  assert.ok(larga.sinVer >= C.SIN_VER_MIN, 'por eso tiene que pasar el umbral');
});

test('sin ver: el texto dice lo que corresponde a cada prueba', () => {
  // En flexiones y sentadillas las repeticiones de ese rato se perdieron.
  const reps = C.sinVerTexto('pushup', 3);
  assert.ok(/3/.test(reps) && /no (te )?vi|sin verte/i.test(reps), reps);
  // En la plancha el reloj sigue corriendo a proposito, asi que esos segundos
  // se contaron sin poder comprobar la posicion. Es lo contrario y hay que
  // decirlo distinto.
  const plank = C.sinVerTexto('plank', 3);
  assert.notEqual(plank, reps);
  assert.ok(/cont/i.test(plank), plank);
  // Bajo el umbral no se dice nada.
  assert.equal(C.sinVerTexto('pushup', 0.2), null);
  assert.equal(C.sinVerTexto('pushup', 0), null);
});
