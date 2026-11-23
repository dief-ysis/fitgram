// Integration of src/orientation.js with the real analyzers (exercises.js), toJoints (skeleton.js) and synth.js:
// a synthetic session seen through a rolled camera is miscounted, and the same session corrected with the tilt
// estimated by this module gives exactly the result of the level camera.
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

/** The same scene seen by a camera rolled `deg` clockwise (seen from behind it): lm about the image centre, world about z. */
function rollFrame(f, deg) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD), a = f.aspect;
  const lm = f.lm.map((p) => {
    const X = (p.x - 0.5) * a, Y = p.y - 0.5;
    return { ...p, x: (X * c + Y * s) / a + 0.5, y: -X * s + Y * c + 0.5 };
  });
  const world = f.world && f.world.map((p) => ({ ...p, x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  return { ...f, lm, world };
}

/** Runs a whole session through an analyzer, as the runner does; returns the outcome that matters to the user. */
function analyze(testId, frames, anOpts = {}) {
  const an = createAnalyzer(testId, anOpts);
  const startOk = an.check(toJoints(frames[0])).ok;
  an.start(frames[0].t);
  let st = null;
  for (const f of frames) { st = an.update(toJoints(f)); if (st.phase === 'ended') break; }
  if (st.phase !== 'ended') st = an.stop(frames[frames.length - 1].t + 1000 / 30);
  return { startOk, value: st.value, invalid: st.invalid, endReason: st.endReason };
}

/** Tilt from the picture alone, using only the first second (the person waiting in the start position). */
function imageTiltOf(testId, frames, estOpts) {
  const est = createPoseLevelEstimator(testId, estOpts);
  for (const f of frames.slice(0, 30)) est.push(toJoints(f));
  return est.state().tilt;
}

/** Sensor tilt of a resting phone rolled `roll`° (upright portrait, rear camera); platform sets the acceleration sign. */
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
    // the roll that lifts the hip side of the thigh breaks the count; the opposite one makes the depth test laxer
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
  // knees variant at +18°: the uncorrected start position is refused
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

  // The browser reports the screen as upside down (angle 180) although the frames are upright: the sensor tilt is ~180° off.
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

