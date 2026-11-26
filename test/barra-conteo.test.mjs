// Conteo de dominadas y fondos, traído de fitgram-v1 de José (26-nov-2026). Escenarios y valores esperados de sus tests
// (test/exercises.test.mjs de la v1); aquí los cuadros pasan por nuestro toJoints, que ahora entrega los mismos 25 puntos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer, EX_CONFIG } from '../src/exercises.mjs';
import { synthSession, SYNTH_CONFIG } from '../src/synth.mjs';
import { toJoints } from '../src/skeleton.mjs';

const count = (events, type) => events.filter((e) => e.type === type).length;
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: se esperaba ${want} ±${tol}, salió ${got}`);
const porQueNoValida = (final) => final.log.filter((l) => !l.valid).map((l) => l.reason);

/** Pasa una sesión sintética por un analizador nuevo, como lo hace la app, y junta todo. */
function correr(prueba, opcionesSynth = {}, opcionesAnalizador = {}) {
  const sess = synthSession(prueba, opcionesSynth), an = createAnalyzer(prueba, opcionesAnalizador);
  an.start(sess.frames[0].t);
  const events = [];
  let final = null, endIndex = -1;
  for (let i = 0; i < sess.frames.length; i++) {
    final = an.update(toJoints(sess.frames[i]));
    events.push(...final.events);
    if (final.phase === 'ended') { endIndex = i; break; }
  }
  if (final.phase !== 'ended') { final = an.stop(sess.frames.at(-1).t + 1000 / sess.fps); events.push(...final.events); }
  return { sess, final, events, endIndex };
}

const MENTON = 'Pasa el mentón sobre la barra', ABAJO = 'Extiende los brazos abajo', BALANCEO = 'Sin balanceo';
const NOVENTA = 'Baja hasta 90° de codo', ARRIBA = 'Extiende los brazos arriba', PATADA = 'Sin impulso de piernas';
const CASOS = [
  { nombre: 'dominadas: 10 limpias -> 10 válidas', prueba: 'pullup', synth: { reps: 10 }, value: 10, invalid: 0 },
  { nombre: 'dominadas: el mentón no pasa la barra -> no válida, la prueba sigue', prueba: 'pullup',
    synth: { reps: 6, kinds: { 2: 'shallow' } }, value: 5, invalid: 1, why: [MENTON] },
  { nombre: 'dominadas: no estira los brazos abajo -> «Extiende los brazos abajo»', prueba: 'pullup',
    synth: { reps: 6, kinds: { 2: 'no_lockout' } }, value: 5, invalid: 1, why: [ABAJO] },
  { nombre: 'dominadas: impulso (rodillas + balanceo) -> «Sin balanceo»', prueba: 'pullup', synth: { reps: 6, kinds: { 3: 'kip' } },
    value: 5, invalid: 1, why: [BALANCEO] },
  { nombre: 'dominadas: 2 impulsos seguidos -> técnica', prueba: 'pullup', synth: { reps: 8, invalidAt: [3, 4], kind: 'kip' },
    value: 3, invalid: 2, end: 'technique', why: [BALANCEO, BALANCEO] },
  { nombre: 'dominadas: 2 tirones fallidos seguidos (fin de la serie) -> técnica', prueba: 'pullup', synth: { reps: 7, invalidAt: [5, 6] },
    value: 5, invalid: 2, end: 'technique', why: [MENTON, MENTON] },
  { nombre: 'dominadas: 6 s colgado después de la 3.ª -> pausa', prueba: 'pullup', synth: { reps: 8, pauseAfter: { rep: 3, seconds: 6 } },
    value: 3, invalid: 0, end: 'pause' },
  { nombre: 'dominadas: 1,5 s colgado entre repeticiones se tolera', prueba: 'pullup', synth: { reps: 6, pauseAfter: { rep: 3, seconds: 1.5 } }, value: 6, invalid: 0 },
  { nombre: 'dominadas: cansancio (sigue colgado después de la última) -> pausa', prueba: 'pullup', synth: { reps: 7, fatigueEnd: true }, value: 7, invalid: 0, end: 'pause' },
  { nombre: 'dominadas: ninguna repetición en 15 s -> pausa', prueba: 'pullup', synth: { reps: 2, lead: 20 }, value: 0, invalid: 0, end: 'pause' },
  { nombre: 'dominadas: un tirón chico al inicio (codo ~138) no es intento', prueba: 'pullup', synth: { reps: 6, kinds: { 0: 'wobble' } }, value: 5, invalid: 0 },
  { nombre: 'dominadas: suelta la barra -> posición perdida con las que llevaba', prueba: 'pullup', synth: { reps: 9, releaseAt: 12 },
    value: 4, invalid: 0, end: 'position_lost' },
  { nombre: 'dominadas: suelta antes de la primera -> posición perdida', prueba: 'pullup', synth: { reps: 3, releaseAt: 0.5 }, value: 0, invalid: 0, end: 'position_lost' },
  { nombre: 'dominadas: mirando a la izquierda, mismos juicios', prueba: 'pullup', synth: { reps: 7, facing: 'left', kinds: { 1: 'shallow', 3: 'no_lockout', 5: 'kip' } },
    value: 4, invalid: 3, why: [MENTON, ABAJO, BALANCEO] },
  { nombre: 'fondos: 10 limpios -> 10 válidos', prueba: 'dip', synth: { reps: 10 }, value: 10, invalid: 0 },
  { nombre: 'fondos: el codo se queda en ~108 -> «Baja hasta 90° de codo», la prueba sigue', prueba: 'dip', synth: { reps: 6, kinds: { 2: 'shallow' } },
    value: 5, invalid: 1, why: [NOVENTA] },
  { nombre: 'fondos: no estira arriba -> «Extiende los brazos arriba»', prueba: 'dip', synth: { reps: 6, kinds: { 2: 'no_lockout' } },
    value: 5, invalid: 1, why: [ARRIBA] },
  { nombre: 'fondos: patada al empujar -> «Sin impulso de piernas»', prueba: 'dip', synth: { reps: 6, kinds: { 2: 'kip' } },
    value: 5, invalid: 1, why: [PATADA] },
  { nombre: 'fondos: 2 fondos cortos seguidos -> técnica', prueba: 'dip', synth: { reps: 8, invalidAt: [4, 5] }, value: 4, invalid: 2, end: 'technique', why: [NOVENTA, NOVENTA] },
  { nombre: 'fondos: 6 s en el apoyo después del 3.º -> pausa', prueba: 'dip', synth: { reps: 8, pauseAfter: { rep: 3, seconds: 6 } }, value: 3, invalid: 0, end: 'pause' },
  { nombre: 'fondos: cansancio (se queda en el apoyo) -> pausa', prueba: 'dip', synth: { reps: 6, fatigueEnd: true }, value: 6, invalid: 0, end: 'pause' },
  { nombre: 'fondos: acomodarse en el apoyo (codo ~136) no es intento', prueba: 'dip', synth: { reps: 6, kinds: { 0: 'wobble' } }, value: 5, invalid: 0 },
  { nombre: 'fondos: se baja de las paralelas -> posición perdida con los que llevaba', prueba: 'dip', synth: { reps: 9, releaseAt: 10 },
    value: 4, invalid: 0, end: 'position_lost' },
  { nombre: 'fondos: mirando a la izquierda, mismos juicios', prueba: 'dip', synth: { reps: 7, facing: 'left', kinds: { 1: 'shallow', 3: 'no_lockout', 5: 'kip' } },
    value: 4, invalid: 3, why: [NOVENTA, ARRIBA, PATADA] },
  { nombre: 'demo de dominadas: 8, impulso en la 4.ª, suelta después de la última', prueba: 'pullup',
    synth: { reps: 8, kinds: { 3: 'kip' }, release: true, seed: 3, fps: 30, noise: 0.003 }, value: 7, invalid: 1, end: 'position_lost', why: [BALANCEO] },
  { nombre: 'demo de fondos: 11, sin estirar en el 5.º, dos cortos al final -> técnica', prueba: 'dip',
    synth: { reps: 11, kinds: { 4: 'no_lockout', 9: 'shallow', 10: 'shallow' }, seed: 9, fps: 30, noise: 0.003 }, value: 8, invalid: 3,
    end: 'technique', why: [ARRIBA, NOVENTA, NOVENTA] },
];

for (const c of CASOS) {
  test(c.nombre, () => {
    const r = correr(c.prueba, c.synth);
    const { final, events } = r;
    assert.deepEqual([final.value, final.invalid], [c.value, c.invalid], 'válidas / no válidas');
    assert.equal(final.phase, 'ended');
    assert.equal(final.endReason, c.end || 'manual');
    assert.equal(r.endIndex >= 0, Boolean(c.end), 'termina sola solo cuando se espera');
    assert.deepEqual(porQueNoValida(final), c.why || []);
    assert.equal(final.log.length, c.value + c.invalid);
    assert.equal(count(events, 'rep'), c.value);
    assert.equal(count(events, 'invalid'), c.invalid);
    assert.deepEqual([count(events, 'start'), count(events, 'end')], [1, 1]);
    // el pronóstico del propio generador coincide con lo medido
    assert.deepEqual([r.sess.meta.expectedValid, r.sess.meta.expectedInvalid, r.sess.meta.endReason], [c.value, c.invalid, c.end || null]);
    if (c.end === 'position_lost') near(events.at(-1).t / 1000, r.sess.meta.releaseT + SYNTH_CONFIG.releaseLag, 0.5, 'pierde la posición ~1 s después de soltar');
  });
}

// ---- Revisión de inicio --------------------------------------------------------------------------------------------
const ocultar = (f) => ({ ...f, lm: f.lm.map((p) => ({ ...p, visibility: 0.1 })) });
const deFrente = (f) => ({ ...f, lm: f.lm.map((p, i) => (i === 11 ? { ...p, x: p.x + 0.25 } : p)) });   // hombro lejano separado = de frente
const revisar = (prueba, frames, i0, i1, cambio = (f) => f) => {
  const an = createAnalyzer(prueba);
  let res;
  for (let i = i0; i <= i1; i++) res = an.check(toJoints(cambio(frames[i], i)));
  return res;
};
const balancear = (f, i) => ({ ...f, lm: f.lm.map((p, k) => (k >= 23 ? { ...p, x: p.x + 0.04 * Math.sin((2 * Math.PI * i) / 48) } : p)) });

test('inicio de dominadas: colgado quieto ok; de pie o en flexión -> cuélgate; brazos doblados; balanceo; de frente; no se ve', () => {
  const s = (o) => synthSession('pullup', { noise: 0.003, ...o }).frames;
  const colgado = s({ reps: 3 }), sq = synthSession('squat', { reps: 1, noise: 0.003 }).frames, ps = synthSession('pushup', { reps: 1, noise: 0.003 }).frames;
  assert.deepEqual(revisar('pullup', colgado, 0, 25), { ok: true, msg: '¡Bien! Mantén la posición' });
  assert.equal(revisar('pullup', sq, 0, 20).msg, 'Cuélgate de la barra con los brazos extendidos');
  assert.equal(revisar('pullup', ps, 0, 20).msg, 'Cuélgate de la barra con los brazos extendidos');
  assert.equal(revisar('pullup', colgado, 30, 45).msg, 'Extiende los brazos');
  assert.equal(revisar('pullup', s({ reps: 1, lead: 4 }), 0, 100, balancear).msg, 'Sin balanceo');
  assert.equal(revisar('pullup', colgado, 0, 25, deFrente).msg, 'Ponte de lado a la cámara');
  assert.equal(revisar('pullup', colgado, 0, 25, ocultar).msg, 'No te veo completo');
  assert.equal(revisar('pullup', s({ reps: 1, releaseAt: 1 }), 60, 80).msg, 'Cuélgate de la barra con los brazos extendidos');
});

test('inicio de fondos: brazos estirados en el apoyo ok; abajo -> estira; colgado o en flexión -> apóyate; de frente', () => {
  const dip = synthSession('dip', { reps: 3, noise: 0.003 }).frames;
  assert.deepEqual(revisar('dip', dip, 0, 25), { ok: true, msg: '¡Bien! Mantén la posición' });
  assert.equal(revisar('dip', dip, 45, 60).msg, 'Extiende los brazos');
  assert.equal(revisar('dip', synthSession('pullup', { reps: 1, noise: 0.003 }).frames, 0, 20).msg, 'Apóyate en las paralelas con los brazos extendidos');
  assert.equal(revisar('dip', synthSession('pushup', { reps: 1, noise: 0.003 }).frames, 0, 20).msg, 'Apóyate en las paralelas con los brazos extendidos');
  assert.equal(revisar('dip', dip, 0, 25, deFrente).msg, 'Ponte de lado a la cámara');
});

test('textos de término propios de la barra y configuraciones congeladas', () => {
  assert.equal(EX_CONFIG.msg.endByTest.pullup.position_lost, 'Fin: soltaste la barra');
  assert.equal(EX_CONFIG.msg.endByTest.dip.position_lost, 'Fin: bajaste de las paralelas');
  assert.ok(Object.isFrozen(EX_CONFIG.pullup) && Object.isFrozen(EX_CONFIG.dip) && Object.isFrozen(EX_CONFIG.msg.endByTest.pullup));
  assert.throws(() => createAnalyzer('muscleup'), /unknown test/);
});
