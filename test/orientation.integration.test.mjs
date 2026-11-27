// Integración de src/orientation.mjs con los analizadores reales (exercises.mjs), toJoints (skeleton.mjs) y synth.mjs:
// una sesión sintética vista por una cámara girada se cuenta mal, y la misma sesión corregida con la inclinación que
// estima este módulo da exactamente el resultado de la cámara derecha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIENT_CONFIG } from '../src/orientation.mjs';
import { createPoseLevelEstimator } from '../src/orientation.mjs';
import { createTiltEstimator } from '../src/orientation.mjs';
import { fuseTilt } from '../src/orientation.mjs';
import { correctFrame } from '../src/orientation.mjs';
import { describeTilt } from '../src/orientation.mjs';
import { toJoints } from '../src/skeleton.mjs';
import { synthSession } from '../src/synth.mjs';
import { createAnalyzer } from '../src/exercises.mjs';

const RAD = Math.PI / 180;

/** La misma escena vista por una cámara girada `deg` en sentido horario (vista desde atrás): lm en torno al centro de la imagen, world en torno a z. */
function rollFrame(f, deg) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD), a = f.aspect;
  const lm = f.lm.map((p) => {
    const X = (p.x - 0.5) * a, Y = p.y - 0.5;
    return { ...p, x: (X * c + Y * s) / a + 0.5, y: -X * s + Y * c + 0.5 };
  });
  const world = f.world && f.world.map((p) => ({ ...p, x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  return { ...f, lm, world };
}

/** Pasa una sesión entera por un analizador, como lo hace el corredor; devuelve el resultado que le importa a la persona. */
function analyze(testId, frames, anOpts = {}) {
  const an = createAnalyzer(testId, anOpts);
  const startOk = an.check(toJoints(frames[0])).ok;
  an.start(frames[0].t);
  let st = null;
  for (const f of frames) { st = an.update(toJoints(f)); if (st.phase === 'ended') break; }
  if (st.phase !== 'ended') st = an.stop(frames[frames.length - 1].t + 1000 / 30);
  return { startOk, value: st.value, invalid: st.invalid, endReason: st.endReason };
}

/** Inclinación solo con la imagen, usando solo el primer segundo (la persona esperando en la posición inicial). */
function imageTiltOf(testId, frames, estOpts) {
  const est = createPoseLevelEstimator(testId, estOpts);
  for (const f of frames.slice(0, 30)) est.push(toJoints(f));
  return est.state().tilt;
}

/** Inclinación de sensores de un teléfono quieto girado `roll`° (vertical, cámara trasera); platform fija el signo de la aceleración. */
function sensorTiltOf(roll, { platform = 'android', screenAngle = 0 } = {}) {
  const est = createTiltEstimator({ screenAngle, facing: 'environment' });
  const up = { x: -Math.sin(roll * RAD), y: Math.cos(roll * RAD), z: 0 }, k = platform === 'ios' ? -9.81 : 9.81;
  for (let t = 0; t < 1200; t += 1000 / 60) {
    est.pushOrientation({ t, alpha: 10, beta: Math.asin(up.y) / RAD, gamma: Math.atan2(-up.x, up.z) / RAD });
    est.pushMotion({ t, accG: { x: k * up.x, y: k * up.y, z: k * up.z }, acc: { x: 0, y: 0, z: 0 }, rot: { alpha: 0.1, beta: -0.1, gamma: 0 } });
  }
  return est.state();
}

test('squat: a 12° camera roll ruins the count; the image-based correction restores it', () => {
  const sess = synthSession('squat', { reps: 6 });
  const level = analyze('squat', sess.frames);
  assert.deepEqual(level, { startOk: true, value: 6, invalid: 0, endReason: 'manual' });

  const rolled = sess.frames.map((f) => rollFrame(f, -12));
  const raw = analyze('squat', rolled);
  assert.equal(raw.value, 0, 'every full-depth repetition is rejected: the tilted thigh never looks parallel');
  assert.equal(raw.endReason, 'technique');

  const tilt = fuseTilt(null, imageTiltOf('squat', rolled));
  assert.ok(Math.abs(tilt.roll - -12) < 1.5, `estimated roll ${tilt.roll}`);
  assert.equal(tilt.reason, 'image_only');
  assert.equal(describeTilt(tilt).msg, 'Inclinado 12°: lo corregimos');
  assert.deepEqual(analyze('squat', rolled.map((f) => correctFrame(f, tilt))), level);
});

test('squat: both roll directions, both facings and mixed valid/invalid reps match the level camera', () => {
  for (const facing of ['right', 'left']) {
    const sess = synthSession('squat', { reps: 8, invalidAt: [3], facing, seed: 4 });
    const level = analyze('squat', sess.frames);
    assert.equal(level.value, sess.meta.expectedValid);
    assert.equal(level.invalid, sess.meta.expectedInvalid);
    let broken = 0;
    for (const roll of [-12, -10, 10, 12]) {
      const rolled = sess.frames.map((f) => rollFrame(f, roll));
      if (analyze('squat', rolled).value !== level.value) broken++;
      const tilt = imageTiltOf('squat', rolled);
      assert.deepEqual(analyze('squat', rolled.map((f) => correctFrame(f, tilt))), level, `facing ${facing}, roll ${roll}`);
    }
    // el roll que levanta el lado de la cadera del muslo arruina el conteo; el contrario hace más laxa la prueba de profundidad
    assert.equal(broken, 2, `facing ${facing}: uncorrected count wrong for one roll direction`);
  }
});

test('squat without world landmarks (2D only) is corrected too', () => {
  const sess = synthSession('squat', { reps: 5 });
  const flat = sess.frames.map((f) => ({ ...f, world: null }));
  const level = analyze('squat', flat);
  const rolled = flat.map((f) => rollFrame(f, -11));
  assert.notDeepEqual(analyze('squat', rolled), level);
  const tilt = imageTiltOf('squat', rolled);
  const fixed = rolled.map((f) => correctFrame(f, tilt));
  assert.equal(fixed[0].world, null);
  assert.deepEqual(analyze('squat', fixed), level);
});

test('plank: an 18° roll fails the start check and loses seconds; corrected, it matches', () => {
  for (const opts of [{ seconds: 20 }, { seconds: 25, collapseAt: 12 }]) {
    const sess = synthSession('plank', opts);
    const level = analyze('plank', sess.frames);
    assert.equal(level.startOk, true);
    const rolled = sess.frames.map((f) => rollFrame(f, 18));
    const raw = analyze('plank', rolled);
    assert.equal(raw.startOk, false, 'the horizontal body looks tilted: start position refused');
    assert.ok(raw.value < level.value - 2, `uncorrected ${raw.value} s vs ${level.value} s`);
    const tilt = imageTiltOf('plank', rolled);
    assert.ok(Math.abs(tilt.roll - 18) < 2, `estimated roll ${tilt.roll}`);
    assert.deepEqual(analyze('plank', rolled.map((f) => correctFrame(f, tilt))), level);
  }
});

test('push-ups (toes and knees): the corrected session matches the level camera', () => {
  for (const [synthOpts, anOpts] of [[{ reps: 6, invalidAt: [2], kind: 'sag' }, {}], [{ reps: 5, variant: 'knees' }, { variant: 'knees' }]]) {
    const sess = synthSession('pushup', synthOpts);
    const level = analyze('pushup', sess.frames, anOpts);
    for (const roll of [-18, 18]) {
      const rolled = sess.frames.map((f) => rollFrame(f, roll));
      const tilt = imageTiltOf('pushup', rolled, { variant: anOpts.variant });
      assert.ok(Math.abs(tilt.roll - roll) < 2, `estimated roll ${tilt.roll} for ${roll}`);
      assert.deepEqual(analyze('pushup', rolled.map((f) => correctFrame(f, tilt)), anOpts), level);
    }
  }
  // variante de rodillas a +18°: la posición inicial sin corregir se rechaza
  const knees = synthSession('pushup', { reps: 5, variant: 'knees' }).frames.map((f) => rollFrame(f, 18));
  assert.equal(analyze('pushup', knees, { variant: 'knees' }).startOk, false);
});

test('sensor path: accelerometer/gyroscope tilt alone corrects the squat, on both acceleration conventions', () => {
  const sess = synthSession('squat', { reps: 6 }), level = analyze('squat', sess.frames);
  const rolled = sess.frames.map((f) => rollFrame(f, -12));
  for (const platform of ['android', 'ios']) {
    const s = sensorTiltOf(-12, { platform });
    assert.deepEqual(s.sensors, { orientation: true, accelerometer: true, gyroscope: true });
    assert.equal(s.still, true);
    const tilt = fuseTilt(s.lastStill, null);
    assert.equal(tilt.reason, 'sensor_only');
    assert.ok(Math.abs(tilt.roll - -12) < 0.3);
    const fixed = rolled.map((f) => correctFrame(f, tilt));
    assert.equal(fixed[0].corrected, true);
    assert.deepEqual(analyze('squat', fixed), level, platform);
  }
});

test('fusion: sensor and picture agree -> sensor; a wrong screen angle is overruled by the picture', () => {
  const sess = synthSession('squat', { reps: 6 }), level = analyze('squat', sess.frames);
  const rolled = sess.frames.map((f) => rollFrame(f, -12)), image = imageTiltOf('squat', rolled);

  const good = fuseTilt(sensorTiltOf(-12).lastStill, image);
  assert.equal(good.source, 'sensor');
  assert.ok(good.conflictDeg < ORIENT_CONFIG.conflictDeg);
  assert.deepEqual(analyze('squat', rolled.map((f) => correctFrame(f, good))), level);

  // El navegador dice que la pantalla está de cabeza (ángulo 180) aunque los cuadros vienen derechos: el sensor se equivoca en ~180°.
  const wrong = sensorTiltOf(-12, { screenAngle: 180 }).lastStill;
  assert.ok(Math.abs(wrong.roll) > 150);
  assert.equal(correctFrame(rolled[0], wrong).corrected, false, 'the sensor tilt alone is refused, never applied');
  const fused = fuseTilt(wrong, image);
  assert.equal(fused.reason, 'sensor_convention_180');
  assert.equal(fused.source, 'image');
  assert.deepEqual(analyze('squat', rolled.map((f) => correctFrame(f, fused))), level);
});

test('beyond the automatic limit nothing is corrected and the user is told to straighten the phone', () => {
  const sess = synthSession('squat', { reps: 3 }), rolled = sess.frames.map((f) => rollFrame(f, 36));
  const tilt = fuseTilt(null, imageTiltOf('squat', rolled));
  assert.ok(Math.abs(tilt.roll - 36) < 1.5);
  assert.equal(tilt.correctable, false);
  assert.deepEqual(describeTilt(tilt), { level: 'bad', msg: 'Endereza el teléfono (inclinado 36°)' });
  const out = correctFrame(rolled[10], tilt);
  assert.equal(out.corrected, false);
  assert.deepEqual(out.lm, rolled[10].lm);
});

test('a level camera is left alone: correcting with the estimated tilt does not change any result', () => {
  for (const [testId, opts] of [['squat', { reps: 6, invalidAt: [1, 4] }], ['pushup', { reps: 6 }], ['plank', { seconds: 15, sagAt: [{ t: 4, dur: 3 }] }]]) {
    const sess = synthSession(testId, opts), level = analyze(testId, sess.frames);
    const tilt = imageTiltOf(testId, sess.frames);
    assert.ok(Math.abs(tilt.roll) < 2, `${testId}: estimated ${tilt.roll}° on a level camera`);
    assert.deepEqual(analyze(testId, sess.frames.map((f) => correctFrame(f, tilt))), level, testId);
  }
});


test('teléfono de costado con la rotación bloqueada: el cuarto de vuelta deja contar flexiones, plancha y sentadillas', () => {
  for (const [testId, opts] of [['pushup', { reps: 6 }], ['plank', {}], ['squat', { reps: 6 }]]) {
    const sess = synthSession(testId, opts), level = analyze(testId, sess.frames);
    for (const roll of [90, -90, 80, -100]) {
      const rolled = sess.frames.map((f) => rollFrame(f, roll));
      assert.equal(analyze(testId, rolled).startOk && testId !== 'plank' ? 'raw-ok' : 'x', 'x');
      for (const sensorRoll of [roll, -roll]) {   // el signo del sensor puede venir cambiado (Safari)
        const s = fuseTilt(sensorTiltOf(sensorRoll).lastStill, imageTiltOf(testId, rolled));
        const fixed = rolled.map((f) => correctFrame(f, s));
        assert.equal(fixed[0].quarter, true, `${testId} ${roll}/${sensorRoll} reason ${s.reason} roll ${s.roll}`);
        const got = analyze(testId, fixed);
        assert.equal(got.startOk, true, `${testId} ${roll}/${sensorRoll}`);
        assert.equal(got.value, level.value, `${testId} ${roll}/${sensorRoll}`);
        const q = rolled.map((f) => correctFrame(f, s, { quarterOnly: true }));
        assert.equal(analyze(testId, q).startOk, true, `solo cuarto ${testId} ${roll}/${sensorRoll}`);
      }
    }
  }
});

test('teléfono de costado: el sentido del giro se decide una vez y no se da vuelta en el fondo de la flexión', () => {
  const sess = synthSession('pushup', { reps: 6 });
  // Como en el video real: en el fondo de la flexión los codos quedan sobre los hombros y la nariz pegada al suelo, que es
  // justo lo que engañaba a la versión anterior (decidía el sentido en cada cuadro por la postura).
  const fondo = sess.frames.map((f) => {
    const P = (i) => ({ x: f.lm[i].x * f.aspect, y: f.lm[i].y });
    const u = [P(11).x - P(13).x, P(11).y - P(13).y], v = [P(15).x - P(13).x, P(15).y - P(13).y];
    const codoDeg = Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) / RAD;
    if (codoDeg > 120) return f;                                 // arriba: brazos estirados, no se toca
    const hombro = (f.lm[11].y + f.lm[12].y) / 2, codo = (f.lm[13].y + f.lm[14].y) / 2;
    const lm = f.lm.map((p, i) => (i === 13 || i === 14 ? { ...p, y: hombro - 0.04 } : i === 0 ? { ...p, y: codo + 0.06 } : p));
    return { ...f, lm };
  });
  assert.ok(fondo.some((f, i) => f !== sess.frames[i]), 'hay cuadros de fondo modificados');
  const rolled = fondo.map((f) => rollFrame(f, 90));
  const tilt = fuseTilt(sensorTiltOf(90).lastStill, null);   // inclinación fija, como la que la app guarda al empezar
  const fixed = rolled.map((f) => correctFrame(f, tilt));
  // La cabeza (nariz) queda siempre del mismo lado de la cadera: si el giro se diera vuelta en algún cuadro, cambiaría.
  const lado = fixed.map((f) => Math.sign(f.lm[0].x - (f.lm[23].x + f.lm[24].x) / 2));
  assert.equal(new Set(lado).size, 1, 'la cabeza nunca cambia de lado');
  assert.equal(lado[0], Math.sign(sess.frames[0].lm[0].x - (sess.frames[0].lm[23].x + sess.frames[0].lm[24].x) / 2), 'y es el lado correcto');
});
