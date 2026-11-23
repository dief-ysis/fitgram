// Unit tests of src/orientation.js: frame conversions, sensor estimator, start-posture estimator, fusion,
// frame correction and UI text. Synthetic sensor streams and rolled synthetic poses are built here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIENT_CONFIG } from '../src/orientation.mjs';
import { upFromEuler } from '../src/orientation.mjs';
import { deviceToImage } from '../src/orientation.mjs';
import { resolveScreenAngle } from '../src/orientation.mjs';
import { wrapDeg } from '../src/orientation.mjs';
import { isCorrectable } from '../src/orientation.mjs';
import { createTiltEstimator } from '../src/orientation.mjs';
import { createPoseLevelEstimator } from '../src/orientation.mjs';
import { fuseTilt } from '../src/orientation.mjs';
import { correctFrame } from '../src/orientation.mjs';
import { describeTilt } from '../src/orientation.mjs';
import { toJoints } from '../src/skeleton.mjs';
import { synthSession } from '../src/synth.mjs';

const RAD = Math.PI / 180;
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? 'value'}: ${actual} is not within ${tol} of ${expected}`);
const nearVec = (v, e, tol = 1e-9) => { near(v.x, e[0], tol, 'x'); near(v.y, e[1], tol, 'y'); if (e.length > 2) near(v.z, e[2], tol, 'z'); };

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** The same scene seen by a camera rolled `deg` clockwise (seen from behind it): gravity becomes (sin, cos) in the image. */
function rollFrame(f, deg) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD), a = f.aspect;
  const lm = f.lm.map((p) => {
    const X = (p.x - 0.5) * a, Y = p.y - 0.5;
    return { ...p, x: (X * c + Y * s) / a + 0.5, y: -X * s + Y * c + 0.5 };
  });
  const world = f.world && f.world.map((p) => ({ ...p, x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  return { ...f, lm, world };
}

// ---- 1. Frames and math -----------------------------------------------------------------------------------------

test('upFromEuler: hand-checked device poses', () => {
  nearVec(upFromEuler(0, 0), [0, 0, 1]);            // flat on a table, screen up: up = out of the screen
  nearVec(upFromEuler(180, 0), [0, 0, -1]);         // flat, screen down
  nearVec(upFromEuler(90, 0), [0, 1, 0]);           // upright portrait: up = top edge
  nearVec(upFromEuler(-90, 0), [0, -1, 0]);         // upside-down portrait
  nearVec(upFromEuler(0, -90), [1, 0, 0]);          // landscape, right edge up (top edge to the user's left)
  nearVec(upFromEuler(0, 90), [-1, 0, 0]);          // landscape, left edge up
  nearVec(upFromEuler(70, 0), [0, Math.sin(70 * RAD), Math.cos(70 * RAD)]);   // leaning back 20°: screen looks a bit up
  nearVec(upFromEuler(90, 37), [0, 1, 0]);          // gimbal lock: gamma is meaningless at beta = 90, the vector is not
  const u = upFromEuler(-41, 63);
  near(Math.hypot(u.x, u.y, u.z), 1, 1e-12, 'unit length');
  assert.equal(upFromEuler(null, 0), null);
  assert.equal(upFromEuler(10, undefined), null);
  assert.equal(upFromEuler(NaN, 0), null);
});

test('upFromEuler matches the full W3C rotation matrix for any alpha', () => {
  // R = Rz(alpha)·Rx(beta)·Ry(gamma) maps device -> earth; "up" in device axes is R^T·[0,0,1] = third row of R.
  const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((q, v, k) => q + v * B[k][j], 0)));
  const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx = (b) => [[1, 0, 0], [0, Math.cos(b), -Math.sin(b)], [0, Math.sin(b), Math.cos(b)]];
  const Ry = (g) => [[Math.cos(g), 0, Math.sin(g)], [0, 1, 0], [-Math.sin(g), 0, Math.cos(g)]];
  for (const [alpha, beta, gamma] of [[0, 30, 20], [123, -75, 44], [270, 100, -80], [45, 89, 5]]) {
    const R = mul(mul(Rz(alpha * RAD), Rx(beta * RAD)), Ry(gamma * RAD));
    nearVec(upFromEuler(beta, gamma), R[2], 1e-12);
  }
});

test('deviceToImage: upright portrait, rear camera, is level', () => {
  const t = deviceToImage({ x: 0, y: 1, z: 0 }, { screenAngle: 0, facing: 'environment' });
  near(t.roll, 0, 1e-9); near(t.pitch, 0, 1e-9);
  nearVec(t.down, [0, 1, 0]);
  assert.equal(t.source, 'sensor');
  assert.equal(t.sideways, false);
  assert.equal(t.correctable, true);
  near(t.confidence, 1, 1e-9);
  assert.equal(t.still, null);
});

test('deviceToImage: known roll, rear vs front camera', () => {
  // Phone upright, its top edge tipped 10° towards the user's right: "up" lies 10° to the left of the device y axis.
  const up = { x: -Math.sin(10 * RAD), y: Math.cos(10 * RAD), z: 0 };
  const rear = deviceToImage(up, { screenAngle: 0, facing: 'environment' });
  near(rear.roll, 10, 1e-9, 'rear roll');           // seen from behind the rear camera the phone turned clockwise
  nearVec(rear.down, [Math.sin(10 * RAD), Math.cos(10 * RAD), 0]);
  const front = deviceToImage(up, { screenAngle: 0, facing: 'user' });
  near(front.roll, -10, 1e-9, 'front roll');        // the front camera looks the other way: same tip is counter-clockwise
  near(front.pitch, 0, 1e-9);
  assert.equal(deviceToImage(up).roll, rear.roll, 'rear camera and angle 0 are the defaults');
});

test('deviceToImage: pitch sign, rear vs front camera', () => {
  // Leaning back 20° (screen faces slightly up): the rear camera looks 20° below the horizon, the front one 20° above.
  const up = upFromEuler(70, 0);
  const rear = deviceToImage(up, { screenAngle: 0, facing: 'environment' });
  near(rear.pitch, -20, 1e-9); near(rear.roll, 0, 1e-9);
  near(rear.down.z, Math.sin(20 * RAD), 1e-9, 'gravity has a component along the optical axis');
  const front = deviceToImage(up, { screenAngle: 0, facing: 'user' });
  near(front.pitch, 20, 1e-9); near(front.roll, 0, 1e-9);
  near(rear.confidence, (Math.cos(20 * RAD) - 0.5) / 0.5, 1e-9, 'confidence drops with pitch');
});

test('deviceToImage: landscape both ways follows the screen angle', () => {
  // Top edge to the user's left (device turned counter-clockwise): right edge up, screen angle 90.
  const a = deviceToImage(upFromEuler(0, -90), { screenAngle: 90, facing: 'environment' });
  near(a.roll, 0, 1e-9); near(a.pitch, 0, 1e-9); assert.equal(a.sideways, false);
  // Top edge to the user's right: left edge up, screen angle 270 (window.orientation -90).
  const b = deviceToImage(upFromEuler(0, 90), { screenAngle: 270, facing: 'environment' });
  near(b.roll, 0, 1e-9); assert.equal(b.sideways, false);
  const c = deviceToImage(upFromEuler(0, 90), { screenAngle: -90, facing: 'user' });
  near(c.roll, 0, 1e-9, 'negative angles are normalized');
  // Landscape plus an extra 8° clockwise turn of the phone as the user sees it (rear camera): roll +8.
  const up = { x: Math.cos(8 * RAD), y: Math.sin(8 * RAD), z: 0 };      // device x is 8° clockwise from up, so up has a +y part
  near(deviceToImage(up, { screenAngle: 90, facing: 'environment' }).roll, 8, 1e-9);
  near(deviceToImage(up, { screenAngle: 90, facing: 'user' }).roll, -8, 1e-9);
});

test('deviceToImage: rotation lock and wrong screen angle show up as sideways / upside down', () => {
  // Phone lying in landscape while the page stays in portrait (rotation lock): the picture is turned 90°.
  const locked = deviceToImage(upFromEuler(0, -90), { screenAngle: 0, facing: 'environment' });
  near(locked.roll, -90, 1e-9);
  assert.equal(locked.sideways, true);
  assert.equal(locked.correctable, false);
  // Safari 16.4 bug pattern: 90 and 270 swapped -> the sensor claims an upside-down picture (roll 180).
  const swapped = deviceToImage(upFromEuler(0, -90), { screenAngle: 270, facing: 'environment' });
  near(Math.abs(swapped.roll), 180, 1e-9);
  assert.equal(swapped.sideways, true);
});

test('deviceToImage: flat phone has no usable roll; bad input gives null', () => {
  const flat = deviceToImage(upFromEuler(0, 0), { screenAngle: 0, facing: 'environment' });
  near(flat.pitch, -90, 1e-9);                      // rear camera looks straight down
  assert.equal(flat.confidence, 0);
  assert.equal(flat.correctable, false);
  assert.equal(deviceToImage(null), null);
  assert.equal(deviceToImage({ x: 0, y: 0, z: 0 }), null);
  assert.equal(deviceToImage({ x: NaN, y: 1, z: 0 }), null);
  near(deviceToImage({ x: 0, y: 9.81, z: 0 }).roll, 0, 1e-9, 'any length is accepted');
});

test('resolveScreenAngle prefers window.orientation and normalizes', () => {
  assert.equal(resolveScreenAngle({ windowOrientation: -90, screenAngle: 90 }), 270);   // Safari 16.4: trust window.orientation
  assert.equal(resolveScreenAngle({ windowOrientation: 90, screenAngle: 90 }), 90);
  assert.equal(resolveScreenAngle({ screenAngle: 180 }), 180);
  assert.equal(resolveScreenAngle({ windowOrientation: undefined, screenAngle: null }), 0);
  assert.equal(resolveScreenAngle(), 0);
  assert.equal(resolveScreenAngle({ screenAngle: 360 }), 0);
  assert.equal(wrapDeg(190), -170);
  assert.equal(wrapDeg(-180), 180);
  assert.equal(wrapDeg(725), 5);
});

test('ORIENT_CONFIG is frozen and consistent', () => {
  assert.ok(Object.isFrozen(ORIENT_CONFIG) && Object.isFrozen(ORIENT_CONFIG.msg) && Object.isFrozen(ORIENT_CONFIG.baseConfidence));
  assert.ok(ORIENT_CONFIG.okDeg < ORIENT_CONFIG.conflictDeg && ORIENT_CONFIG.conflictDeg < ORIENT_CONFIG.warnDeg);
  assert.ok(ORIENT_CONFIG.warnDeg < ORIENT_CONFIG.maxAutoDeg && ORIENT_CONFIG.maxAutoDeg < ORIENT_CONFIG.sidewaysDeg);
  assert.equal(ORIENT_CONFIG.pitch2D, false, 'the 2D pitch warp must stay opt-in');
  assert.ok(ORIENT_CONFIG.windowMs >= 500 && ORIENT_CONFIG.windowMs <= 1000);
});

// ---- 2. Sensor estimator ----------------------------------------------------------------------------------------

/** Device "up" for an upright portrait phone rolled `roll`° (rear-camera sign) and pitched `pitch`° (rear camera up = +). */
function upFor(roll, pitch = 0) {
  const r = roll * RAD, p = pitch * RAD;
  return { x: -Math.sin(r) * Math.cos(p), y: Math.cos(r) * Math.cos(p), z: -Math.sin(p) };
}
const eulerOf = (u) => ({ beta: Math.asin(u.y) / RAD, gamma: Math.atan2(-u.x, u.z) / RAD });

/**
 * Feeds `ms` of 60 Hz events. platform: 'android' (accG points up), 'ios' (accG points down), 'desktop' (null fields).
 * shake: rotation-rate amplitude (deg/s) and matching wobble of the attitude; parts: which events/fields exist.
 */
function feed(est, { t0 = 0, ms = 1200, up = upFor(0), platform = 'android', noise = 0.03, shake = 0, seed = 7,
  orientation = true, motion = true, gyro = true, accel = true } = {}) {
  const r = rng(seed);
  let t = t0;
  for (; t < t0 + ms; t += 1000 / 60) {
    if (platform === 'desktop') {
      est.pushOrientation({ t, alpha: null, beta: null, gamma: null });
      est.pushMotion({ t, accG: { x: null, y: null, z: null }, acc: null, rot: { alpha: null, beta: null, gamma: null } });
      continue;
    }
    const wob = shake * 0.25 * Math.sin(t / 60) * RAD;                 // attitude wobble that goes with the shaking
    const u = { x: up.x * Math.cos(wob) - up.y * Math.sin(wob), y: up.x * Math.sin(wob) + up.y * Math.cos(wob), z: up.z };
    if (orientation) {
      const e = eulerOf(u);
      est.pushOrientation({ t, alpha: 200, beta: e.beta + noise * gauss(r), gamma: e.gamma + noise * gauss(r) });
    }
    if (motion) {
      const k = (platform === 'ios' ? -9.81 : 9.81) * (1 + (shake ? 0.08 * gauss(r) : 0));
      est.pushMotion({ t,
        accG: accel ? { x: k * u.x + noise * gauss(r), y: k * u.y + noise * gauss(r), z: k * u.z + noise * gauss(r) } : null,
        acc: accel ? { x: 0, y: 0, z: 0 } : null,
        rot: gyro ? { alpha: 0.2 * gauss(r) + shake * gauss(r), beta: 0.2 * gauss(r) + shake * gauss(r), gamma: 0.2 * gauss(r) } : null });
    }
  }
  return t;
}

test('tilt estimator: resting phone with all sensors gives a still, accurate tilt', () => {
  const est = createTiltEstimator({ screenAngle: 0, facing: 'environment' });
  assert.deepEqual(est.state().sensors, { orientation: false, accelerometer: false, gyroscope: false });
  assert.equal(est.state().available, false);
  assert.equal(est.state().tilt, null);
  feed(est, { up: upFor(7, -12) });
  const s = est.state();
  assert.deepEqual(s.sensors, { orientation: true, accelerometer: true, gyroscope: true });
  assert.equal(s.available, true);
  assert.equal(s.still, true);
  assert.equal(s.gravitySource, 'orientation');
  near(s.tilt.roll, 7, 0.2, 'roll'); near(s.tilt.pitch, -12, 0.2, 'pitch');
  assert.equal(s.tilt.still, true);
  assert.equal(s.tilt.source, 'sensor');
  assert.ok(s.samples >= ORIENT_CONFIG.minSamples && s.samples <= ORIENT_CONFIG.maxSamples);
  near(s.lastStill.roll, 7, 0.2);
  assert.equal(s.accelSign, 1);
  assert.equal(s.accelSignFrom, 'orientation');
  assert.ok(s.disagreeDeg < 1, 'both gravity sources agree');
});

test('tilt estimator: iOS and Android acceleration signs give the same tilt', () => {
  for (const platform of ['android', 'ios']) {
    // accelerometer only (no deviceorientation events): the sign must be worked out, not assumed
    const est = createTiltEstimator();
    feed(est, { up: upFor(-9, 5), platform, orientation: false });
    const s = est.state();
    assert.equal(s.gravitySource, 'accelerometer', platform);
    assert.equal(s.sensors.orientation, false);
    assert.equal(s.accelSign, platform === 'ios' ? -1 : 1, `${platform} sign`);
    assert.equal(s.accelSignFrom, 'screen');
    near(s.tilt.roll, -9, 0.3, `${platform} roll`); near(s.tilt.pitch, 5, 0.3, `${platform} pitch`);
    assert.equal(s.still, true);
    // with deviceorientation present the sign is learnt from it and both sources agree
    const both = createTiltEstimator();
    feed(both, { up: upFor(-9, 5), platform });
    assert.equal(both.state().accelSign, platform === 'ios' ? -1 : 1);
    assert.ok(both.state().disagreeDeg < 1);
  }
  // an explicit option is used when the screen heuristic is not needed
  const opt = createTiltEstimator({ accelSign: -1 });
  feed(opt, { up: upFor(4), platform: 'ios', orientation: false });
  assert.equal(opt.state().accelSignFrom, 'option');
  near(opt.state().tilt.roll, 4, 0.3);
});

test('tilt estimator: landscape with the accelerometer only uses the screen angle for the sign', () => {
  for (const platform of ['android', 'ios']) {
    const est = createTiltEstimator({ screenAngle: 90, facing: 'environment' });
    feed(est, { up: { x: Math.cos(6 * RAD), y: Math.sin(6 * RAD), z: 0 }, platform, orientation: false });
    near(est.state().tilt.roll, 6, 0.3, platform);
    assert.equal(est.state().tilt.sideways, false);
  }
});

test('tilt estimator: desktop null events report no sensors', () => {
  const est = createTiltEstimator();
  feed(est, { platform: 'desktop' });
  const s = est.state();
  assert.deepEqual(s.sensors, { orientation: false, accelerometer: false, gyroscope: false });
  assert.equal(s.available, false);
  assert.equal(s.tilt, null);
  assert.equal(s.still, null);
  assert.equal(s.samples, 0);
  est.pushMotion(null); est.pushOrientation(undefined); est.pushMotion({ t: NaN, accG: { x: 0, y: 9.8, z: 0 } });
  est.pushMotion({ t: 1, accG: { x: 0, y: 0, z: 0 }, rot: null });       // all-zero accelerometer is not a sensor
  assert.equal(est.state().sensors.accelerometer, false);
});

test('tilt estimator: phone without gyroscope still works and says so', () => {
  const est = createTiltEstimator();
  feed(est, { up: upFor(3), gyro: false });
  const s = est.state();
  assert.deepEqual(s.sensors, { orientation: true, accelerometer: true, gyroscope: false });
  assert.equal(s.still, true);
  near(s.tilt.roll, 3, 0.2);
  // orientation events only (motion permission denied)
  const only = createTiltEstimator();
  feed(only, { up: upFor(-5), motion: false });
  assert.deepEqual(only.state().sensors, { orientation: true, accelerometer: false, gyroscope: false });
  assert.equal(only.state().still, true);
  near(only.state().tilt.roll, -5, 0.2);
});

test('tilt estimator: a motion burst clears `still`, keeps the last still tilt and recovers', () => {
  const est = createTiltEstimator();
  let t = feed(est, { up: upFor(6), ms: 1500 });
  assert.equal(est.state().still, true);
  const conf = est.state().tilt.confidence;
  t = feed(est, { t0: t, up: upFor(14), ms: 700, shake: 40, seed: 3 });  // someone grabs and turns the phone
  const moving = est.state();
  assert.equal(moving.still, false);
  assert.equal(moving.tilt.still, false);
  assert.ok(moving.tilt.confidence < conf * 0.5, 'confidence drops while moving');
  near(moving.lastStill.roll, 6, 0.3, 'last still tilt is kept');
  assert.equal(describeTilt(moving.tilt).msg, 'No muevas el teléfono');
  t = feed(est, { t0: t, up: upFor(14), ms: 1400, seed: 5 });            // put down again, 14° this time
  const after = est.state();
  assert.equal(after.still, true);
  near(after.tilt.roll, 14, 0.3);
  near(after.lastStill.roll, 14, 0.3);
});

test('tilt estimator: the gyroscope alone can veto stillness', () => {
  // attitude samples look steady, but the rotation rate says the phone is being handled
  const est = createTiltEstimator();
  const r = rng(11);
  for (let t = 0; t < 1200; t += 1000 / 60) {
    est.pushOrientation({ t, alpha: 0, beta: 90, gamma: 0 });
    est.pushMotion({ t, accG: { x: 0, y: 9.81, z: 0 }, acc: null, rot: { alpha: 25 * gauss(r), beta: 25 * gauss(r), gamma: 0 } });
  }
  assert.equal(est.state().still, false);
});

test('tilt estimator: outliers do not move the median; stale data is not available', () => {
  const est = createTiltEstimator();
  const t = feed(est, { up: upFor(5), ms: 1000, motion: false });
  est.pushOrientation({ t: t + 1, alpha: 0, beta: 20, gamma: 60 });       // one wild sample
  est.pushOrientation({ t: t + 2, alpha: 0, beta: -70, gamma: -10 });
  const s = est.state();
  near(s.tilt.roll, 5, 0.3, 'median ignores two wild samples');
  assert.equal(s.still, false, 'but they do break stillness');
  assert.equal(est.state(t + 5000).available, false, 'no events for 5 s');
  assert.equal(est.state(t + 5000).tilt, null);
  assert.equal(est.state(t + 5000).sensors.orientation, true, 'the sensor exists even if it is silent now');
});

test('tilt estimator: setScreen remaps without a reset; reset clears everything', () => {
  const est = createTiltEstimator({ screenAngle: 0 });
  feed(est, { up: upFor(10) });
  near(est.state().tilt.roll, 10, 0.2);
  est.setScreen({ facing: 'user' });
  near(est.state().tilt.roll, -10, 0.2, 'front camera flips the roll sign');
  assert.deepEqual(est.state().screen, { angle: 0, facing: 'user' });
  est.setScreen({ angle: -90, facing: 'environment' });
  assert.equal(est.state().screen.angle, 270);
  assert.equal(est.state().tilt.sideways, true, 'upright portrait data with a landscape screen angle = sideways picture');
  est.reset();
  assert.equal(est.state().available, false);
  assert.equal(est.state().lastStill, null);
  assert.deepEqual(est.state().sensors, { orientation: false, accelerometer: false, gyroscope: false });
});

test('tilt estimator: bounded work per state() and cached between events', () => {
  const est = createTiltEstimator();
  feed(est, { up: upFor(2), ms: 20000 });                                  // 20 s of events
  const s = est.state();
  assert.ok(s.samples <= ORIENT_CONFIG.maxSamples);
  assert.equal(est.state(), s, 'same object until a new event arrives');
  est.pushOrientation({ t: 20001, alpha: 0, beta: 90, gamma: 0 });
  assert.notEqual(est.state(), s);
});

// ---- 3. Start-posture (image) estimator ---------------------------------------------------------------------------

/** Feeds the first `seconds` of a rolled synthetic session; returns the estimator state. */
function estimateLead(testId, synthOpts, roll, seconds = 1, estOpts) {
  const sess = synthSession(testId, synthOpts), est = createPoseLevelEstimator(testId, estOpts);
  let accepted = 0;
  for (const f of sess.frames.slice(0, Math.round(seconds * sess.fps))) if (est.push(toJoints(rollFrame(f, roll)))) accepted++;
  return { ...est.state(), accepted };
}

for (const [name, testId, opts, tol] of [
  ['squat, facing right', 'squat', { reps: 3 }, 1.5],
  ['squat, facing left', 'squat', { reps: 3, facing: 'left' }, 1.5],
  ['push-up on toes', 'pushup', { reps: 3 }, 2],
  ['push-up on knees', 'pushup', { reps: 3, variant: 'knees' }, 2],
  ['push-up, facing left, other seed', 'pushup', { reps: 3, facing: 'left', seed: 9 }, 2],
  ['plank', 'plank', { seconds: 5 }, 2],
]) {
  test(`pose level: ${name} start posture recovers the camera roll`, () => {
    for (const roll of [-24, -11, 0, 6, 12, 20]) {
      const s = estimateLead(testId, opts, roll);
      assert.ok(s.tilt, `${name} roll ${roll}: no estimate`);
      near(s.tilt.roll, roll, tol, `${name} roll ${roll}`);
      assert.equal(s.tilt.source, 'image');
      assert.equal(s.tilt.pitch, null);
      assert.equal(s.tilt.still, null);
      near(s.tilt.down.x, Math.sin(s.tilt.roll * RAD), 1e-9); near(s.tilt.down.y, Math.cos(s.tilt.roll * RAD), 1e-9);
      assert.ok(s.tilt.confidence > 0.5 && s.tilt.confidence <= 1);
      assert.ok(s.spread <= ORIENT_CONFIG.maxSpreadDeg && s.n >= ORIENT_CONFIG.minFrames && s.fresh);
    }
  });
}

test('pose level: null until enough frames, then latched', () => {
  const sess = synthSession('squat', { reps: 2 }), est = createPoseLevelEstimator('squat');
  const frames = sess.frames.map((f) => rollFrame(f, 9));
  for (let i = 0; i < ORIENT_CONFIG.minFrames - 1; i++) est.push(toJoints(frames[i]));
  assert.equal(est.state().tilt, null, 'not yet confident');
  assert.equal(est.state().n, ORIENT_CONFIG.minFrames - 1);
  est.push(toJoints(frames[ORIENT_CONFIG.minFrames - 1]));
  near(est.state().tilt.roll, 9, 1.5);
  est.reset();
  assert.deepEqual(est.state(), { tilt: null, n: 0, spread: null, fresh: false, seen: 0 });
});

test('pose level: frames that are not the start posture are rejected', () => {
  // bottom half of every repetition: knee / elbow far from extension
  for (const [testId, opts] of [['squat', { reps: 3 }], ['pushup', { reps: 3 }]]) {
    const sess = synthSession(testId, opts), est = createPoseLevelEstimator(testId);
    const ends = sess.meta.repEnds, dur = ends[0] - 1;                    // lead = 1 s, first rep lasts `dur`
    const bottoms = sess.frames.filter((f) => ends.some((e) => Math.abs(f.t / 1000 - (e - dur / 2)) < dur * 0.2));
    assert.ok(bottoms.length > 20);
    for (const f of bottoms) assert.equal(est.push(toJoints(rollFrame(f, 10))), false, `${testId} bottom frame accepted`);
    assert.equal(est.state().tilt, null);
    assert.equal(est.state().seen, bottoms.length);
  }
  // a collapsed plank (hips and knees on the floor) is not a plank
  const plank = synthSession('plank', { seconds: 8, collapseAt: 2 }), pe = createPoseLevelEstimator('plank');
  const down = plank.frames.filter((f) => f.t > 4500);
  assert.equal(down.filter((f) => pe.push(toJoints(f))).length, 0);
  assert.equal(pe.state().tilt, null);
  // wrong test for the posture: a standing person is not a push-up, a plank is not a squat stance
  const stand = synthSession('squat', { reps: 1 }).frames.slice(0, 30), pu = createPoseLevelEstimator('pushup');
  assert.equal(stand.filter((f) => pu.push(toJoints(f))).length, 0);
  // Known ambiguity: a rigid body lying in a line looks exactly like a standing body in a picture turned 90°.
  // It can never be corrected by mistake: it is reported as sideways and not correctable.
  const sq = createPoseLevelEstimator('squat');
  plank.frames.slice(0, 30).forEach((f) => sq.push(toJoints(f)));
  assert.equal(sq.state().tilt.sideways, true);
  assert.equal(sq.state().tilt.correctable, false);
  assert.equal(correctFrame(plank.frames[0], sq.state().tilt).corrected, false);
  // invisible person, empty input
  const hidden = synthSession('squat', { reps: 1, hide: [{ t: 0, dur: 1 }] }).frames.slice(0, 30), hs = createPoseLevelEstimator('squat');
  assert.equal(hidden.filter((f) => hs.push(toJoints(f))).length, 0);
  assert.equal(hs.push(null), false);
  assert.equal(hs.push({ j2: {}, j3: null, t: 0 }), false);
  assert.throws(() => createPoseLevelEstimator('burpee'), /desconocida/);
});

test('pose level: an unsteady posture is not trusted (spread gate)', () => {
  // the same standing frames seen through a camera that wobbles ±8°: accepted frame by frame, but never confident
  const sess = synthSession('squat', { reps: 1 }), est = createPoseLevelEstimator('squat');
  sess.frames.slice(0, 30).forEach((f, i) => est.push(toJoints(rollFrame(f, 8 * Math.sin(i * 1.3)))));
  const s = est.state();
  assert.ok(s.n >= ORIENT_CONFIG.minFrames);
  assert.ok(s.spread > ORIENT_CONFIG.maxSpreadDeg);
  assert.equal(s.tilt, null);
  assert.equal(s.fresh, false);
});

test('pose level: the push-up reference survives the whole set and a sideways picture is flagged', () => {
  const sess = synthSession('pushup', { reps: 5 }), est = createPoseLevelEstimator('pushup');
  for (const f of sess.frames) est.push(toJoints(rollFrame(f, -15)));
  near(est.state().tilt.roll, -15, 2, 'top positions between reps keep feeding the estimate');
  const side = estimateLead('squat', { reps: 1 }, 88);
  near(side.tilt.roll, 88, 1.5);
  assert.equal(side.tilt.sideways, true);
  assert.equal(side.tilt.correctable, false);
  // floor references never claim a sideways picture (a standing person reaching forward would look like one)
  const turned = estimateLead('plank', { seconds: 3 }, -100);
  assert.equal(turned.tilt, null); assert.equal(turned.accepted, 0);
  near(estimateLead('plank', { seconds: 3 }, -40).tilt.roll, -40, 2, 'but large rolls below 45° are still measured');
});

/** Stick figure (side view, metres, y down, floor at 0) -> Joints of a camera rolled `roll`°, with landmark noise. */
function figureJoints(points, roll, i, noise = 0.003) {
  const r = rng(1000 + i), c = Math.cos(roll * RAD), s = Math.sin(roll * RAD), j2 = {};
  for (const [name, [mx, my]] of Object.entries(points)) {
    for (const [prefix, v, dx] of [['l_', 0.95, 0], ['r_', 0.7, 0.008]]) {
      const X = mx / 3.7 + dx, Y = (my + 1.2) / 3.7;                       // image-centred, aspect-corrected units
      j2[prefix + name] = { x: X * c + Y * s + 0.28 + noise * gauss(r), y: -X * s + Y * c + 0.5 + noise * gauss(r), v };
    }
  }
  return { j2, j3: null, t: i * 33.3 };
}
const HANG = { wrist: [0, -2.2], elbow: [0.01, -1.93], shoulder: [0, -1.63], hip: [0.02, -1.13], knee: [0.03, -0.68], ankle: [0.02, -0.25], foot: [0.15, -0.2] };
const HANG_BENT = { ...HANG, knee: [0.06, -0.69], ankle: [-0.34, -0.6], foot: [-0.45, -0.5] };
const CHIN_UP = { ...HANG, elbow: [0.12, -1.95], shoulder: [0.02, -2.08], hip: [0.05, -1.58], knee: [0.07, -1.13], ankle: [0.05, -0.7], foot: [0.18, -0.65] };
const DIP_TOP = { shoulder: [0, -1.5], elbow: [0.01, -1.21], wrist: [0, -0.93], hip: [-0.08, -1.02], knee: [-0.05, -0.57], ankle: [-0.38, -0.42], foot: [-0.45, -0.3] };
const DIP_BOTTOM = { ...DIP_TOP, shoulder: [0.06, -1.2], elbow: [-0.22, -1.17], hip: [-0.06, -0.72], knee: [-0.03, -0.3], ankle: [-0.36, -0.2], foot: [-0.43, -0.1] };

function figureState(testId, points, roll, frames = 30) {
  const est = createPoseLevelEstimator(testId);
  let accepted = 0;
  for (let i = 0; i < frames; i++) if (est.push(figureJoints(points, roll, i))) accepted++;
  return { ...est.state(), accepted };
}

test('pose level: pull-up dead hang (straight or bent legs) and dip support', () => {
  for (const roll of [-18, 0, 11]) {
    near(figureState('pullup', HANG, roll).tilt.roll, roll, 1.5, `hang ${roll}`);
    near(figureState('pullup', HANG_BENT, roll).tilt.roll, roll, 2.5, `hang with bent knees ${roll}`);
    near(figureState('dip', DIP_TOP, roll).tilt.roll, roll, 1.5, `dip support ${roll}`);
  }
  assert.equal(figureState('pullup', CHIN_UP, 10).accepted, 0, 'chin over the bar is not the start posture');
  assert.equal(figureState('dip', DIP_BOTTOM, 10).accepted, 0, 'bottom of the dip is not the start posture');
  assert.equal(figureState('dip', HANG, 10).accepted, 0, 'arms overhead are not a dip support');
  assert.equal(figureState('pullup', DIP_TOP, 10).accepted, 0, 'a dip support is not a hang');
  assert.ok(figureState('dip', DIP_TOP, 0).tilt.confidence < figureState('pullup', HANG, 0).tilt.confidence,
    'the weaker reference reports less confidence');
});

// ---- 4. Fusion --------------------------------------------------------------------------------------------------

const sensorTilt = (roll, pitch = 0, still = true) => {
  const t = deviceToImage(upFor(roll, pitch), { screenAngle: 0, facing: 'environment' });
  t.still = still;
  return t;
};
const imageTilt = (roll, confidence = 0.8) => ({ roll, pitch: null, down: { x: Math.sin(roll * RAD), y: Math.cos(roll * RAD) },
  source: 'image', confidence, still: null, sideways: Math.abs(roll) > 45, correctable: Math.abs(roll) <= 30 });

test('fuseTilt: single sources and nothing', () => {
  assert.equal(fuseTilt(null, null), null);
  assert.equal(fuseTilt(undefined, { source: 'none', roll: 0, confidence: 0 }), null);
  const s = sensorTilt(5, 10), fs = fuseTilt(s, null);
  assert.equal(fs.reason, 'sensor_only'); near(fs.roll, 5, 1e-9); near(fs.pitch, 10, 1e-9);
  assert.equal('conflictDeg' in fs, false);
  assert.notEqual(fs, s); assert.notEqual(fs.down, s.down, 'a new object, the input is not shared');
  const fi = fuseTilt(null, imageTilt(-7));
  assert.equal(fi.reason, 'image_only'); assert.equal(fi.source, 'image'); assert.equal(fi.pitch, null);
  assert.equal(fuseTilt(imageTilt(3), null), null, 'an image tilt in the sensor slot is not accepted');
  assert.equal(fuseTilt({ ...s, confidence: 0 }, null), null, 'zero confidence (flat phone) is not usable');
});

test('fuseTilt: agreement prefers the still sensor, keeps its pitch and reports the difference', () => {
  const f = fuseTilt(sensorTilt(10, 6), imageTilt(12.5));
  assert.equal(f.source, 'sensor'); assert.equal(f.reason, 'sensor');
  near(f.roll, 10, 1e-9); near(f.pitch, 6, 1e-9); near(f.conflictDeg, 2.5, 1e-9);
  assert.equal(f.correctable, true);
  const moving = fuseTilt(sensorTilt(10, 6, false), imageTilt(12.5));
  assert.equal(moving.source, 'image'); assert.equal(moving.reason, 'image_sensor_moving');
  near(moving.roll, 12.5, 1e-9);
});

test('fuseTilt: convention problems (about 90° or 180° apart) fall back to the picture', () => {
  const upsideDown = fuseTilt(sensorTilt(-170), imageTilt(6));              // swapped 90/270 or wrong acceleration sign
  assert.equal(upsideDown.reason, 'sensor_convention_180');
  assert.equal(upsideDown.source, 'image'); near(upsideDown.roll, 6, 1e-9);
  near(upsideDown.conflictDeg, 176, 1e-9);
  assert.equal(upsideDown.correctable, true);
  const quarter = fuseTilt(sensorTilt(-90), imageTilt(-3));                 // frames did not follow the reported screen angle
  assert.equal(quarter.reason, 'sensor_convention_90');
  near(quarter.roll, -3, 1e-9); assert.equal(quarter.sideways, false);
  assert.ok(quarter.confidence < 0.8);
});

test('fuseTilt: other conflicts keep the safer estimate and flag it', () => {
  const a = fuseTilt(sensorTilt(-6), imageTilt(6, 0.8));                    // e.g. a mirrored convention: 12° apart
  assert.equal(a.reason, 'conflict_image'); near(a.roll, 6, 1e-9); near(a.conflictDeg, 12, 1e-9);
  near(a.confidence, 0.56, 1e-9);
  const b = fuseTilt(sensorTilt(4), imageTilt(20, 0.3));                    // weak picture estimate: rotate as little as possible
  assert.equal(b.reason, 'conflict_smaller'); assert.equal(b.source, 'sensor'); near(b.roll, 4, 1e-9);
  const c = fuseTilt(sensorTilt(22), imageTilt(3, 0.3));
  assert.equal(c.source, 'image'); near(c.roll, 3, 1e-9);
  assert.equal(describeTilt(a).level, 'warn');
  assert.equal(describeTilt(a).msg, 'Revisa que el teléfono esté derecho');
  const lying = fuseTilt(sensorTilt(2), imageTilt(-84));                    // person lying down during a standing test
  assert.equal(lying.reason, 'image_sideways_ignored'); assert.equal(lying.source, 'sensor'); near(lying.roll, 2, 1e-9);
  assert.equal(lying.sideways, false); near(lying.conflictDeg, 86, 1e-9);
  const edge = fuseTilt(sensorTilt(0), imageTilt(ORIENT_CONFIG.conflictDeg));
  assert.equal(edge.reason, 'sensor', 'exactly at the threshold still agrees');
});

// ---- 5. correctFrame ----------------------------------------------------------------------------------------------

const tiltOf = (roll, pitch = null) => ({ roll, pitch, down: { x: Math.sin(roll * RAD), y: Math.cos(roll * RAD) }, source: pitch == null ? 'image' : 'sensor',
  confidence: 1, still: true, sideways: Math.abs(roll) > 45 });

test('correctFrame: round trip restores the unrolled frame', () => {
  for (const [testId, aspect] of [['squat', 9 / 16], ['pushup', 16 / 9], ['plank', 4 / 3]]) {
    const f = synthSession(testId, { reps: 1, seconds: 1, aspect }).frames[20];
    for (const roll of [-27, -3.5, 0, 12, 30]) {
      const back = correctFrame(rollFrame(f, roll), tiltOf(roll));
      assert.equal(back.corrected, true);
      for (let i = 0; i < 33; i++) {
        near(back.lm[i].x, f.lm[i].x, 1e-12, `lm.x ${i}`); near(back.lm[i].y, f.lm[i].y, 1e-12, `lm.y ${i}`);
        assert.equal(back.lm[i].z, f.lm[i].z); assert.equal(back.lm[i].visibility, f.lm[i].visibility);
        near(back.world[i].x, f.world[i].x, 1e-12); near(back.world[i].y, f.world[i].y, 1e-12);
        assert.equal(back.world[i].z, f.world[i].z); assert.equal(back.world[i].visibility, f.world[i].visibility);
      }
      assert.equal(back.t, f.t); assert.equal(back.aspect, f.aspect);
    }
  }
});

test('correctFrame: gravity ends on +y (a plumb line becomes vertical), in non-square images too', () => {
  // two points on a plumb line, as a camera rolled 12° sees them in a 16:9 picture
  const aspect = 16 / 9, roll = 12, top = { x: 0.1, y: -0.3 }, bottom = { x: 0.1, y: 0.25 };   // centred aspect units, level camera
  const raw = { t: 0, aspect, world: null, lm: [top, bottom].map((p) => ({ x: p.x / aspect + 0.5, y: p.y + 0.5, z: 0, visibility: 1 })) };
  const seen = rollFrame(raw, roll);
  assert.ok(Math.abs((seen.lm[0].x - seen.lm[1].x) * aspect) > 0.1, 'the rolled camera sees the plumb line leaning');
  const fixed = correctFrame(seen, tiltOf(roll));
  near(fixed.lm[0].x, fixed.lm[1].x, 1e-12, 'vertical again');
  near(fixed.lm[1].y - fixed.lm[0].y, 0.55, 1e-12, 'lengths are preserved');
  assert.equal(fixed.world, null);
  // rotating in normalized units instead of aspect-corrected units would NOT restore it
  const naive = seen.lm.map((p) => ({ x: (p.x - 0.5) * Math.cos(roll * RAD) - (p.y - 0.5) * Math.sin(roll * RAD) + 0.5 }));
  assert.ok(Math.abs(naive[0].x - naive[1].x) > 0.02);
});

test('correctFrame: never mutates the input and keeps extra fields', () => {
  const f = rollFrame(synthSession('squat', { reps: 1 }).frames[5], 10);
  f.extra = 'kept'; f.lm[0].presence = 0.9;
  Object.freeze(f); f.lm.forEach(Object.freeze); f.world.forEach(Object.freeze); Object.freeze(f.lm); Object.freeze(f.world);
  const snapshot = JSON.stringify(f), tilt = Object.freeze(tiltOf(10));
  const out = correctFrame(f, tilt);
  assert.equal(JSON.stringify(f), snapshot);
  assert.notEqual(out, f); assert.notEqual(out.lm, f.lm); assert.notEqual(out.lm[0], f.lm[0]); assert.notEqual(out.world[0], f.world[0]);
  assert.equal(out.extra, 'kept'); assert.equal(out.lm[0].presence, 0.9);
  assert.equal(out.tilt, tilt); assert.equal(out.corrected, true);
  assert.notEqual(out.lm[11].x, f.lm[11].x);
});

test('correctFrame: world is levelled with roll and pitch', () => {
  // A camera pitched up 20° and rolled 10° looks at a 1 m plumb line (hip at the origin, head above) and a floor arrow.
  const roll = 10, pitch = 20, down = deviceToImage(upFor(roll, pitch)).down;
  near(deviceToImage(upFor(roll, pitch)).roll, roll, 1e-9); near(deviceToImage(upFor(roll, pitch)).pitch, pitch, 1e-9);
  const head = { x: -down.x, y: -down.y, z: -down.z, visibility: 1 };       // 1 m against gravity, in camera axes
  const cr = Math.cos(roll * RAD), sr = Math.sin(roll * RAD);
  const side = { x: cr, y: -sr, z: 0, visibility: 0.7 };                    // horizontal, across the view (camera x, rolled)
  const lm = [0, 1].map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const out = correctFrame({ t: 1, aspect: 1, lm, world: [head, side] }, deviceToImage(upFor(roll, pitch)));
  nearVec(out.world[0], [0, -1, 0], 1e-9);                                  // straight up
  nearVec(out.world[1], [1, 0, 0], 1e-9);                                   // still horizontal, still across
  assert.equal(out.world[1].visibility, 0.7);
  // roll only (image estimate): the pitch stays in the data
  const rollOnly = correctFrame({ t: 1, aspect: 1, lm, world: [head, side] }, tiltOf(roll));
  near(rollOnly.world[0].x, 0, 1e-9); near(rollOnly.world[0].z, Math.sin(pitch * RAD), 1e-9);
  near(rollOnly.world[0].y, -Math.cos(pitch * RAD), 1e-9);
  // rotations keep lengths and angles between segments
  near(Math.hypot(out.world[0].x, out.world[0].y, out.world[0].z), 1, 1e-12);
  near(out.world[0].x * out.world[1].x + out.world[0].y * out.world[1].y + out.world[0].z * out.world[1].z, 0, 1e-12);
});

test('correctFrame: refuses what must not be corrected automatically', () => {
  const f = synthSession('squat', { reps: 1 }).frames[5];
  for (const tilt of [null, undefined, tiltOf(ORIENT_CONFIG.maxAutoDeg + 2), tiltOf(-90), tiltOf(5, 75), { roll: NaN, source: 'sensor' }, { roll: 3, source: 'none' }]) {
    const out = correctFrame(f, tilt);
    assert.equal(out.corrected, false);
    assert.deepEqual(out.lm, f.lm); assert.deepEqual(out.world, f.world);
    assert.notEqual(out.lm, f.lm); assert.notEqual(out.lm[0], f.lm[0], 'still a copy');
    assert.equal(out.tilt, tilt ?? null);
    assert.equal(isCorrectable(tilt), false);
  }
  assert.equal(isCorrectable(tiltOf(ORIENT_CONFIG.maxAutoDeg)), true);
  assert.equal(correctFrame({ ...f, world: null }, tiltOf(4)).world, null);
  assert.equal(correctFrame(null, tiltOf(4)), null);
});

/** Pinhole projection (long-side field of view `fov`) of 3D points given in LEVEL camera axes by a camera pitched/rolled. */
function project(points, { roll = 0, pitch = 0, aspect = 9 / 16, fov = 63 }) {
  const f = (Math.max(aspect, 1) / 2) / Math.tan(fov * RAD / 2), cr = Math.cos(roll * RAD), sr = Math.sin(roll * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  const lm = points.map((p) => {
    const y1 = p.y * cp + p.z * sp, z1 = -p.y * sp + p.z * cp;              // level -> pitched camera (inverse of the correction)
    const x2 = p.x * cr + y1 * sr, y2 = -p.x * sr + y1 * cr;                // then rolled about the optical axis
    return { x: (f * x2 / z1) / aspect + 0.5, y: f * y2 / z1 + 0.5, z: 0, visibility: 1 };
  });
  return { t: 0, aspect, lm, world: null };
}

test('correctFrame: optional 2D pitch warp is exact with the right field of view and off by default', () => {
  const body = [{ x: -0.3, y: -1.6, z: 3 }, { x: -0.3, y: 0, z: 3 }, { x: 0.4, y: -0.9, z: 3.2 }, { x: 0.35, y: -0.45, z: 2.9 }, { x: 0, y: -0.8, z: 3 }];
  const level = project(body, {}), seen = project(body, { roll: 8, pitch: 18 });
  const tilt = { ...tiltOf(8, 18), source: 'sensor' };
  const warped = correctFrame(seen, tilt, { pitch2D: true });
  for (let i = 0; i < body.length; i++) { near(warped.lm[i].x, level.lm[i].x, 1e-9, `x ${i}`); near(warped.lm[i].y, level.lm[i].y, 1e-9, `y ${i}`); }
  // default: roll only. The plumb line (points 0-1, off-centre) keeps a small keystone lean, far smaller than the roll.
  const plain = correctFrame(seen, tilt);
  const lean = (fr) => Math.atan2((fr.lm[0].x - fr.lm[1].x) * fr.aspect, fr.lm[1].y - fr.lm[0].y) / RAD;
  assert.ok(Math.abs(lean(seen)) > 6, 'uncorrected lean is about the roll');
  assert.ok(Math.abs(lean(plain)) > 0.5 && Math.abs(lean(plain)) < 3, `keystone residual ${lean(plain)}`);
  near(lean(warped), 0, 1e-6);
  // why it is off: a wrong assumed field of view (50° instead of the real 63°) leaves the same order of error it removes
  const wrong = correctFrame(seen, tilt, { pitch2D: true, longFovDeg: 50 });
  const err = (fr) => Math.max(...fr.lm.map((p, i) => Math.hypot((p.x - level.lm[i].x) * fr.aspect, p.y - level.lm[i].y)));
  assert.ok(err(wrong) > 0.02, `wrong-fov error ${err(wrong)}`);
});

// ---- 6. describeTilt ------------------------------------------------------------------------------------------------

test('describeTilt: Spanish UI messages and levels', () => {
  assert.deepEqual(describeTilt(sensorTilt(0.8)), { level: 'ok', msg: 'Teléfono derecho' });
  assert.deepEqual(describeTilt(sensorTilt(-6.2)), { level: 'ok', msg: 'Inclinado 6°: lo corregimos' });
  assert.deepEqual(describeTilt(sensorTilt(21)), { level: 'warn', msg: 'Inclinado 21°: lo corregimos, pero enderézalo' });
  assert.deepEqual(describeTilt(sensorTilt(32)), { level: 'bad', msg: 'Endereza el teléfono (inclinado 32°)' });
  assert.deepEqual(describeTilt(sensorTilt(-88)), { level: 'bad', msg: 'Gira la pantalla: la imagen está de lado' });
  assert.deepEqual(describeTilt(sensorTilt(3, 0, false)), { level: 'warn', msg: 'No muevas el teléfono' });
  assert.deepEqual(describeTilt(sensorTilt(1, 30)), { level: 'warn', msg: 'La cámara apunta 30° hacia arriba: ponla más derecha' });
  assert.deepEqual(describeTilt(sensorTilt(1, -30)), { level: 'warn', msg: 'La cámara apunta 30° hacia abajo: ponla más derecha' });
  assert.deepEqual(describeTilt(sensorTilt(1, 45)), { level: 'bad', msg: 'Cámara muy inclinada (45°): ponla de frente' });
  assert.deepEqual(describeTilt(sensorTilt(0, -80)), { level: 'bad', msg: 'Levanta el teléfono: está acostado' });
  assert.deepEqual(describeTilt(null), { level: 'warn', msg: 'Sin sensor de inclinación: pon el teléfono derecho' });
  assert.deepEqual(describeTilt({ source: 'none', roll: 0 }), describeTilt(null));
  assert.deepEqual(describeTilt(imageTilt(9)), { level: 'ok', msg: 'Inclinado 9°: lo corregimos' });
  // the message and correctFrame agree on what gets corrected
  for (const roll of [0, 5, 14, 29, 31, 50, 120]) {
    const t = sensorTilt(roll);
    assert.equal(describeTilt(t).level === 'bad', !isCorrectable(t), `roll ${roll}`);
  }
});
