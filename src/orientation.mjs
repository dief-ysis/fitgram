// FitGram orientation (traído de fitgram-v1 de Jose, 2026-11-13): phone tilt -> gravity direction in the camera image -> pose correction. Pure (no DOM, no imports).
// Receives: deviceorientation/devicemotion samples (plain objects pushed by sensors.js), the screen angle and camera
//   facing, uncorrected Joints (skeleton.js#toJoints) for the image-only estimate, and raw PoseFrames.
// Delivers: a `Tilt` (roll, pitch, gravity `down` in image axes, confidence, flags), a fused Tilt (sensor vs. start
//   posture), a Spanish UI hint, and corrected PoseFrames in which image +y (and world +y) is gravity, which is what
//   every analyzer in exercises.js assumes.
//
// ---- Frames (all right-handed) ------------------------------------------------------------------------------
// DEVICE (W3C DeviceOrientation §3.1): x = right edge of the screen in its natural (portrait) orientation, y = top
//   edge, z = out of the screen towards the viewer. Sensor data never follows the screen rotation.
// SCREEN: the device frame rotated about z by the screen angle A (0/90/180/270): A = 90 means the device was turned
//   90° counter-clockwise (top edge to the user's left), so screen-right = -y_dev and screen-up = +x_dev:
//     v_scr = [ cosA·x - sinA·y,  sinA·x + cosA·y,  z ]
// IMAGE (raw frame given to MediaPipe, `lm`/`world`): x right, y DOWN, z = optical axis, + away from the camera.
//   Browsers deliver getUserMedia frames upright with respect to the SCREEN, so:
//     rear camera  (facing 'environment', looks along -z_dev):  v_img = [  x_scr, -y_scr, -z_scr ]
//     front camera (facing 'user', looks along +z_dev, raw frame NOT mirrored):  v_img = [ -x_scr, -y_scr,  z_scr ]
// EULER (W3C intrinsic Z-X'-Y'', R = Rz(alpha)·Rx(beta)·Ry(gamma) maps device -> earth, earth z = up):
//   up_dev = R^T·ez = third row of R = [ -cos(beta)·sin(gamma), sin(beta), cos(beta)·cos(gamma) ]  (alpha drops out).
// TILT: down = -up in image axes; roll = atan2(down.x, down.y) (+ = camera turned clockwise seen from behind it, so
//   the scene looks turned counter-clockwise); pitch = asin(-down.z) (+ = camera looks above the horizon).
//   Level camera: down = (0, 1, 0), roll = 0, pitch = 0.
//
// ---- Platform findings (checked 2026-11; they drive the design below) ----------------------------------------
// (a) accelerationIncludingGravity sign. The spec says a device lying flat, screen up, reads {0, 0, +9.8}
//     (https://www.w3.org/TR/orientation-event/ §1 examples): at rest the vector points UP. Android browsers follow
//     it; iOS Safari reports the opposite sign (z = -9.81 flat, screen up):
//     https://lists.w3.org/Archives/Public/public-geolocation/2014Jul/0024.html . beta/gamma do not have this
//     problem, so gravity is taken from deviceorientation first; the accelerometer is the fallback and its sign is
//     never assumed: it is learnt from beta/gamma when both exist, else taken from opts.accelSign, else chosen so
//     that "up" falls on the upper half of the screen (a camera image is never upside down on purpose).
// (b) Screen angle. Screen Orientation: angle = degrees the screen is rotated counter-clockwise from its natural
//     orientation; 90 = landscape-primary, 270 = landscape-secondary on a portrait-natural phone
//     (https://w3c.github.io/screen-orientation). Safari has screen.orientation only since 16.4, and 16.4 shipped
//     with 90/270 swapped with respect to window.orientation and Chrome (https://bugs.webkit.org/show_bug.cgi?id=254863,
//     fixed later by https://bugs.webkit.org/show_bug.cgi?id=255388). window.orientation (0, 90 = counter-clockwise,
//     -90 = clockwise, 180; deprecated but present on iOS and Chrome Android:
//     https://developer.mozilla.org/en-US/docs/Web/API/Window/orientation) is the consistent source, hence
//     resolveScreenAngle() prefers it. A swapped angle shows up as a roll of ~180° and is caught by fuseTilt.
// (c) Camera frames. The capture is rotated to follow the UI orientation: track width/height swap when the phone
//     is turned (e.g. 480x640 -> 640x480, https://bugs.webkit.org/show_bug.cgi?id=220326). This is browser
//     behaviour, not specified by Media Capture. With the rotation lock on, the UI stays in portrait, the angle
//     stays 0 and a phone lying in landscape delivers a picture turned 90°: reported as `sideways`, never corrected.
// (d) Mirroring. getUserMedia frames of the front camera are not mirrored; pages mirror the <video> with CSS
//     (https://lists.w3.org/Archives/Public/public-media-capture/2017Apr/0017.html). The app mirrors only the display.
// (e) Missing sensors. Desktop browsers fire the events once with null fields (spec §4/§6: "null if it cannot be
//     provided"); a sensor counts as present only after several numeric samples. rotationRate is in deg/s.
//     iOS needs DeviceMotionEvent.requestPermission() inside a user gesture (done by sensors.js).
// Because (a)-(c) can still be wrong on some phone, nothing here trusts a single convention: the image estimate of
// createPoseLevelEstimator is measured in the very frame that is corrected, and fuseTilt lets it overrule a sensor
// that disagrees (in particular the ~90°/~180° signatures of a wrong screen angle or acceleration sign).

/**
 * Thresholds of the orientation module (frozen). Each number says where it comes from.
 * Angles in degrees, times in ms, accelerations in m/s², rotation rates in deg/s.
 */
const ORIENT_CONFIG = Object.freeze({
  // ---- sensor estimator
  windowMs: 800,            // engineering: task asks for a 0.5-1 s stillness window
  maxSamples: 64,           // engineering: ring size, ~1 s of 60 Hz events; state() cost is bounded by it
  minSamples: 6,            // engineering: fewer gravity samples than this in the window = no estimate yet
  minSpanMs: 350,           // engineering: `still` needs evidence over at least this much of the window
  minSensorEvents: 3,       // engineering: numeric events needed before a sensor counts as present (desktops fire one null event)
  staleMs: 1500,            // engineering: no events for this long = sensor not available any more
  stillRotRate: 3,          // engineering: RMS rotation rate of a resting phone is < 1 deg/s (gyro noise); hand-held is 5-30
  stillUpSpread: 1.2,       // engineering: every "up" sample within this angle of the window median (1° ~ 2 % thigh-length error)
  stillAccStd: 0.35,        // engineering: std of |accelerationIncludingGravity| at rest is ~0.05; footsteps and taps exceed 0.5
  gravityMin: 8.3,          // physics: |accG| must be within ~15 % of g = 9.81 to be read as gravity ...
  gravityMax: 11.3,         // ... (a sensor reporting zeros or in other units is ignored)
  accelAgree: 10,           // engineering: Euler-derived and accelerometer-derived "up" further apart than this = suspicious
  signVoteMin: 0.8,         // engineering: |cos| between both "up" estimates needed to learn the accelerometer sign
  screenUpMin: 0.26,        // engineering: sin(15°); below it the phone is too flat to guess the accelerometer sign from the screen
  movingConfidence: 0.4,    // engineering: confidence factor of a tilt measured while the phone moves
  // ---- geometry / limits
  sidewaysDeg: 45,          // CONTRACT: |roll| > 45° = picture turned on its side
  flatPitchDeg: 60,         // engineering: beyond this the camera looks at the floor/ceiling; roll is ill-defined (in-plane gravity < 50 %)
  maxAutoDeg: 30,           // task: automatic correction refused beyond 25-30°; the user must straighten the phone
  okDeg: 2,                 // engineering: below this the UI says "Teléfono derecho" (2° ~ 3.5 % of thigh length, inside the 15 % tolerance)
  warnDeg: 15,              // engineering: corrected, but the framing is poor and the person is partly cropped; UI warns
  pitchWarnDeg: 25,         // engineering: vertical lengths shrink by cos(25°) = 9 % in the 2D picture; UI warns
  pitchBadDeg: 40,          // engineering: 23 % foreshortening, 2D up/down ratios are no longer trustworthy
  // ---- fusion
  conflictDeg: 8,           // task: sensor vs. posture disagreement threshold (8-10°); 8° ~ 14 % thigh-length error
  patternTolDeg: 15,        // engineering: |difference - 90| or |difference - 180| within this = convention problem, not posture
  conflictImageMin: 0.5,    // engineering: in a conflict the posture estimate wins only with at least this confidence
  // ---- image (start posture) estimator
  visMin: 0.5,              // same as EX_CONFIG.common.visMean: joints below this visibility are not used
  minFrames: 12,            // engineering: 0.4 s of accepted frames at 30 fps before reporting
  fullFrames: 30,           // engineering: 1 s of accepted frames = full confidence
  windowFrames: 45,         // engineering: accepted frames kept (1.5 s at 30 fps)
  maxAgeMs: 5000,           // engineering: accepted frames older than this are dropped
  maxSpreadDeg: 3,          // engineering: robust spread (1.4826·MAD) above this = not a still start posture (walking, swinging)
  extendedElbow: 150,       // = EX_CONFIG.pushup.startElbowMin: arms extended (push-up top, dead hang, dip support)
  straightKnee: 160,        // = EX_CONFIG.squat.standKnee: standing
  straightHip: 160,         // engineering: shoulder-hip-knee angle of an upright stance
  bodyLine: 150,            // engineering: shoulder-hip-knee angle of a plank-like body (loose: a sagging hip keeps the contacts on the floor)
  plankElbowMin: 55,        // EX_CONFIG.plank elbow 70-110° with 15° slack (2D angles are noisier) ...
  plankElbowMax: 125,       // ...
  plankKnee: 140,           // EX_CONFIG.plank.kneeMin 150 with slack
  alignDeg: 12,             // engineering: two "vertical" references of one posture must agree within this
  dipArmTorsoDeg: 40,       // engineering: straight arm vs. torso in the dip support (the torso leans 10-20° forward)
  trunkFloorDeg: 50,        // engineering: shoulder->hip within this of the floor line (knee push-up top leans ~35°)
  armFloorDeg: 40,          // engineering: support arm (contact->shoulder) within this of the floor normal
  floorLineMin: 1.2,        // engineering: floor contacts at least 1.2 torso lengths apart (hands near the feet is not a plank)
  // height of the joint centre above the floor for each floor contact, in torso lengths (shoulder-hip ~ 0.5 m):
  // wrist 4 cm (palm flat), elbow 4.5 cm (forearm flat), knee 5 cm (kneeling), toe tip 1.5 cm. Anthropometric estimate
  // (engineering); it removes a ~1.5° bias of the wrist-toe line, and being wrong by 1 cm costs only 0.5°.
  contactLift: Object.freeze({ wrist: 0.08, elbow: 0.09, knee: 0.10, foot: 0.03 }),
  // base confidence of each reference: floor contacts are physical facts; a stance is only "about vertical" (±2°);
  // a hang swings; in the dip support the hands may be in front of or behind the shoulders (±4°)
  baseConfidence: Object.freeze({ pushup: 0.9, plank: 0.9, squat: 0.75, pullup: 0.7, dip: 0.6 }),
  // dead-band of the image estimate: a posture-only roll this small is within the anatomical uncertainty of the
  // reference and is reported as level (roll 0, `estimatedRoll` keeps the measurement), so a level camera is never
  // "corrected" by the posture itself. Measured on the synthetic person with a level camera: dead hang 2.2°, dip
  // support 4.0-4.4° (the torso leans 5° and the arm follows it; sign = facing direction). Engineering decision: a
  // little above those biases; the floor and standing references are unbiased (< 1°) and need none.
  imageDeadbandDeg: Object.freeze({ pullup: 3, dip: 5 }),
  // ---- 2D pitch correction (virtual level camera, homography)
  pitch2D: false,           // decision: OFF. It needs the focal length, which the browser does not expose (zoom, crop and
                            // lens differ per phone); a wrong value warps the pose. Without it horizontals stay horizontal
                            // and verticals shrink by cos(pitch) (< 10 % up to 25°), which the analyzers tolerate.
  longFovDeg: 63,           // field of view along the long image side assumed when pitch2D is on (phone main camera in
                            // video mode, 26-28 mm equivalent; same as SYNTH_CONFIG.vfov)
  msg: Object.freeze({
    level: 'Teléfono derecho',
    corrected: 'Inclinado {n}°: lo corregimos',
    correctedWarn: 'Inclinado {n}°: lo corregimos, pero enderézalo',
    straighten: 'Endereza el teléfono (inclinado {n}°)',
    sideways: 'Gira la pantalla: la imagen está de lado',
    moving: 'No muevas el teléfono',
    flat: 'Levanta el teléfono: está acostado',
    pitchUp: 'La cámara apunta {n}° hacia arriba: ponla más derecha',
    pitchDown: 'La cámara apunta {n}° hacia abajo: ponla más derecha',
    pitchBad: 'Cámara muy inclinada ({n}°): ponla de frente',
    conflict: 'Revisa que el teléfono esté derecho',
    none: 'Sin sensor de inclinación: pon el teléfono derecho',
  }),
});

const OC = ORIENT_CONFIG;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);   // no -0 and no 1e-17 leftovers of cos(90°)

/**
 * Wraps an angle to (-180, 180].
 * @param {number} deg
 * @returns {number}
 */
function wrapDeg(deg) {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

function unit(v) {
  const n = Math.hypot(v.x, v.y, v.z);
  return n > 1e-9 ? { x: v.x / n, y: v.y / n, z: v.z / n } : null;
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length ? (s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
}

const angleBetween = (a, b) => Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) * DEG;

/**
 * Screen angle to use with {@link deviceToImage}, normalized to 0/90/180/270.
 * Prefers `window.orientation` (consistent on iOS and Chrome Android; Safari 16.4 shipped screen.orientation.angle
 * with 90/270 swapped), then `screen.orientation.angle`, then 0. The DOM layer passes both raw values.
 * @param {{windowOrientation?: number|null, screenAngle?: number|null}} [src]
 * @returns {0|90|180|270}
 */
function resolveScreenAngle(src = {}) {
  const raw = fin(src.windowOrientation) ? src.windowOrientation : fin(src.screenAngle) ? src.screenAngle : 0;
  return ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
}

/**
 * Unit "up" vector (opposite to gravity) in the DEVICE frame from the W3C Euler angles of a deviceorientation event.
 * up = [-cos(beta)·sin(gamma), sin(beta), cos(beta)·cos(gamma)]; alpha (compass) is irrelevant.
 * Examples: flat on a table, screen up (0, 0) -> (0, 0, 1); upright portrait (90, 0) -> (0, 1, 0);
 * upright landscape with the top edge to the left (0, -90) -> (1, 0, 0).
 * @param {number} beta degrees, rotation about the device x axis, [-180, 180)
 * @param {number} gamma degrees, rotation about the device y axis, [-90, 90)
 * @returns {{x:number, y:number, z:number}|null} null when an angle is not a finite number
 */
function upFromEuler(beta, gamma) {
  if (!fin(beta) || !fin(gamma)) return null;
  const b = beta * RAD, g = gamma * RAD;
  return { x: clean(-Math.cos(b) * Math.sin(g)), y: clean(Math.sin(b)), z: clean(Math.cos(b) * Math.cos(g)) };
}

/**
 * True when a tilt may be corrected automatically: finite roll, not sideways, |roll| <= maxAutoDeg and the camera
 * is not looking at the floor/ceiling (|pitch| <= flatPitchDeg when the pitch is known).
 * @param {object|null} tilt Tilt
 * @returns {boolean}
 */
function isCorrectable(tilt) {
  if (!tilt || tilt.source === 'none' || !fin(tilt.roll)) return false;
  if (Math.abs(tilt.roll) > OC.maxAutoDeg) return false;
  return !(fin(tilt.pitch) && Math.abs(tilt.pitch) > OC.flatPitchDeg);
}

function makeTilt(roll, pitch, down, source, confidence, still) {
  const tilt = { roll, pitch, down, source, confidence: clamp(confidence, 0, 1), still,
    sideways: Math.abs(roll) > OC.sidewaysDeg, correctable: false };
  tilt.correctable = isCorrectable(tilt);
  return tilt;
}

/**
 * Converts the "up" vector of the device frame into the tilt of the camera image.
 * @param {{x:number, y:number, z:number}} upDevice "up" in device axes (any length; see {@link upFromEuler})
 * @param {{screenAngle?: number, facing?: 'user'|'environment'}} [view] screen angle (0/90/180/270, see
 *   {@link resolveScreenAngle}) and camera ('environment' = rear, default; 'user' = front, raw frame not mirrored)
 * @returns {{roll:number, pitch:number, down:{x:number,y:number,z:number}, source:'sensor', confidence:number,
 *   still:null, sideways:boolean, correctable:boolean}|null} Tilt, or null for an unusable vector.
 *   roll: + = camera turned clockwise seen from behind it; pitch: + = looking above the horizon;
 *   confidence falls from 1 (level) to 0 at |pitch| = flatPitchDeg, where roll stops being measurable.
 */
function deviceToImage(upDevice, view = {}) {
  const u = upDevice && fin(upDevice.x) && fin(upDevice.y) && fin(upDevice.z) ? unit(upDevice) : null;
  if (!u) return null;
  const a = resolveScreenAngle({ screenAngle: view.screenAngle }) * RAD, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const sx = c * u.x - s * u.y, sy = s * u.x + c * u.y, sz = u.z;               // "up" in screen axes
  const front = view.facing === 'user';
  // image = [x_scr, -y_scr, -z_scr] (rear) or [-x_scr, -y_scr, z_scr] (front); down = -up
  const down = front ? { x: clean(sx), y: clean(sy), z: clean(-sz) } : { x: clean(-sx), y: clean(sy), z: clean(sz) };
  const inPlane = Math.hypot(down.x, down.y);
  const roll = inPlane > 1e-6 ? clean(Math.atan2(down.x, down.y) * DEG) : 0;
  const pitch = clean(Math.asin(clamp(-down.z, -1, 1)) * DEG);
  const minPlane = Math.cos(OC.flatPitchDeg * RAD);
  return makeTilt(roll, pitch, down, 'sensor', (inPlane - minPlane) / (1 - minPlane), null);
}

// ---- Sensor estimator ----------------------------------------------------------------------------------------

/** Fixed-size ring of numeric rows (O(1) push, no allocation after creation). */
function makeRing(size, width) {
  const data = new Float64Array(size * width);
  let head = 0, count = 0;
  return {
    push(...row) {
      for (let k = 0; k < width; k++) data[head * width + k] = row[k];
      head = (head + 1) % size;
      if (count < size) count++;
    },
    /** Rows with t (column 0) >= since, oldest first. */
    since(since) {
      const out = [];
      for (let i = count; i >= 1; i--) {
        const at = ((head - i + size) % size) * width;
        if (data[at] >= since) out.push(Array.from(data.subarray(at, at + width)));
      }
      return out;
    },
    lastT() { return count ? data[((head - 1 + size) % size) * width] : -Infinity; },
    clear() { head = 0; count = 0; },
  };
}

const vec3 = (o) => (o && fin(o.x) && fin(o.y) && fin(o.z) ? o : null);

/** Component-wise median of unit vectors [t, x, y, z], renormalized; fine for the tight clusters of a 1 s window. */
function medianUp(rows) {
  return rows.length ? unit({ x: median(rows.map((r) => r[1])), y: median(rows.map((r) => r[2])), z: median(rows.map((r) => r[3])) }) : null;
}

/**
 * Tilt estimator fed by the DOM layer with deviceorientation / devicemotion samples (plain objects; `t` in ms on one
 * monotonic clock, e.g. performance.now()). Cheap: O(1) per event, `state()` works on windows of at most
 * `maxSamples` rows and is cached between events.
 *
 * Gravity source: beta/gamma first (same convention on every platform); accelerationIncludingGravity as fallback
 * with a sign that is learnt from beta/gamma when both exist, else `opts.accelSign`, else chosen so that "up" is on
 * the upper half of the screen (see the platform notes at the top of the file).
 *
 * @param {{screenAngle?: number, facing?: 'user'|'environment', accelSign?: 1|-1}} [opts] initial screen/camera;
 *   accelSign: +1 = spec/Android (vector points up at rest), -1 = iOS Safari; leave unset to let the estimator decide
 * @returns {{
 *   setScreen: (s: {angle?: number, facing?: 'user'|'environment'}) => void,
 *   pushOrientation: (e: {t:number, alpha?:number|null, beta:number|null, gamma:number|null}) => void,
 *   pushMotion: (e: {t:number, accG?:object|null, acc?:object|null, rot?:object|null}) => void,
 *   state: (now?: number) => object,
 *   reset: () => void }}
 *   `state(now)` returns `{ sensors: {orientation, accelerometer, gyroscope}, available, still, tilt, samples,
 *   lastStill, gravitySource, accelSign, accelSignFrom, disagreeDeg, screen }`:
 *   - sensors: which sensors have really delivered numbers (gyroscope = rotationRate with three numbers);
 *   - available: fresh gravity data exists (events within `staleMs` of `now`; `now` defaults to the last event time);
 *   - still: true/false, or null when it cannot be judged; uses the rotation rate, the spread of "up" and |accG|;
 *   - tilt: Tilt of the current window (median "up"), `still` copied in, confidence reduced while moving; null if none;
 *   - lastStill: Tilt of the last window that was still (what the runner should lock at the start of a test);
 *   - gravitySource: 'orientation' | 'accelerometer' | null; accelSign: +1 | -1 | null and where it came from
 *     ('orientation' | 'option' | 'screen' | 'spec'); disagreeDeg: angle between both gravity estimates, if both exist.
 */
function createTiltEstimator(opts = {}) {
  const ori = makeRing(OC.maxSamples, 4);     // t, up.x, up.y, up.z (device frame)
  const acc = makeRing(OC.maxSamples, 5);     // t, accG.x, accG.y, accG.z, |accG|
  const rot = makeRing(OC.maxSamples, 2);     // t, |rotationRate|
  const screen = { angle: resolveScreenAngle({ screenAngle: opts.screenAngle }), facing: opts.facing === 'user' ? 'user' : 'environment' };
  const optSign = opts.accelSign === 1 || opts.accelSign === -1 ? opts.accelSign : null;
  let counts, lastT, learntSign, lastStillUp, lastStillMeta, cache;

  function reset() {
    ori.clear(); acc.clear(); rot.clear();
    counts = { orientation: 0, accelerometer: 0, gyroscope: 0 };
    lastT = -Infinity; learntSign = null; lastStillUp = null; lastStillMeta = null; cache = null;
  }
  reset();

  function touch(t) { if (fin(t) && t > lastT) lastT = t; cache = null; }

  function accelSignFor(aUnit, oriUp) {
    if (oriUp) {
      const d = aUnit.x * oriUp.x + aUnit.y * oriUp.y + aUnit.z * oriUp.z;
      if (Math.abs(d) >= OC.signVoteMin) learntSign = d > 0 ? 1 : -1;
    }
    if (learntSign) return { sign: learntSign, from: 'orientation' };
    if (optSign) return { sign: optSign, from: 'option' };
    const a = screen.angle * RAD, d = aUnit.x * Math.sin(a) + aUnit.y * Math.cos(a);   // component along screen-up
    if (Math.abs(d) >= OC.screenUpMin) return { sign: d > 0 ? 1 : -1, from: 'screen' };
    return { sign: 1, from: 'spec' };
  }

  function compute(now) {
    const since = now - OC.windowMs;
    const fresh = (ring) => now - ring.lastT() <= OC.staleMs;
    const oRows = fresh(ori) ? ori.since(since) : [], aRows = fresh(acc) ? acc.since(since) : [], rRows = fresh(rot) ? rot.since(since) : [];
    const gRows = aRows.filter((r) => r[4] >= OC.gravityMin && r[4] <= OC.gravityMax);
    const oriUp = oRows.length >= OC.minSamples ? medianUp(oRows) : null;
    const aMed = gRows.length >= OC.minSamples ? medianUp(gRows) : null;
    const signInfo = aMed ? accelSignFor(aMed, oriUp) : { sign: learntSign ?? optSign, from: learntSign ? 'orientation' : optSign ? 'option' : null };
    const accUp = aMed ? { x: aMed.x * signInfo.sign, y: aMed.y * signInfo.sign, z: aMed.z * signInfo.sign } : null;
    const up = oriUp || accUp, source = oriUp ? 'orientation' : accUp ? 'accelerometer' : null;
    const rows = oriUp ? oRows : accUp ? gRows : [];
    const disagreeDeg = oriUp && accUp ? angleBetween(oriUp, accUp) : null;

    // Stillness: every available cue must agree.
    let still = null;
    if (up) {
      const cues = [];
      const span = rows.length ? rows[rows.length - 1][0] - rows[0][0] : 0;
      const sgn = oriUp ? 1 : signInfo.sign;
      let worst = 0;
      for (const r of rows) {
        const n = Math.hypot(r[1], r[2], r[3]) || 1;
        worst = Math.max(worst, angleBetween(up, { x: sgn * r[1] / n, y: sgn * r[2] / n, z: sgn * r[3] / n }));
      }
      cues.push(worst <= OC.stillUpSpread);
      if (rRows.length >= OC.minSamples) cues.push(Math.sqrt(rRows.reduce((q, r) => q + r[1] * r[1], 0) / rRows.length) <= OC.stillRotRate);
      if (aRows.length >= OC.minSamples) {
        const mean = aRows.reduce((q, r) => q + r[4], 0) / aRows.length;
        const sd = Math.sqrt(aRows.reduce((q, r) => q + (r[4] - mean) ** 2, 0) / aRows.length);
        cues.push(sd <= OC.stillAccStd && gRows.length === aRows.length);
      }
      still = span >= OC.minSpanMs && cues.every(Boolean);
    }

    const toTilt = (u, isStill, agree) => {
      const tilt = deviceToImage(u, { screenAngle: screen.angle, facing: screen.facing });
      if (!tilt) return null;
      tilt.still = isStill;
      if (isStill === false) tilt.confidence *= OC.movingConfidence;
      if (agree != null && agree > OC.accelAgree) tilt.confidence *= 0.5;
      return tilt;
    };
    if (up && still) { lastStillUp = up; lastStillMeta = disagreeDeg; }
    const sensors = { orientation: counts.orientation >= OC.minSensorEvents, accelerometer: counts.accelerometer >= OC.minSensorEvents,
      gyroscope: counts.gyroscope >= OC.minSensorEvents };
    return {
      sensors, available: !!up, still, tilt: up ? toTilt(up, still, disagreeDeg) : null, samples: rows.length,
      lastStill: lastStillUp ? toTilt(lastStillUp, true, lastStillMeta) : null,
      gravitySource: source, accelSign: signInfo.sign ?? null, accelSignFrom: signInfo.from ?? null,
      disagreeDeg, screen: { angle: screen.angle, facing: screen.facing },
    };
  }

  return {
    /** Screen angle (see resolveScreenAngle) and camera in use; may change at any time, no reset needed. */
    setScreen(s = {}) {
      if (fin(s.angle)) screen.angle = resolveScreenAngle({ screenAngle: s.angle });
      if (s.facing === 'user' || s.facing === 'environment') screen.facing = s.facing;
      cache = null;
    },
    /** One deviceorientation event; null/NaN angles (desktop) are ignored. */
    pushOrientation(e) {
      if (!e || !fin(e.t)) return;
      const up = upFromEuler(e.beta, e.gamma);
      if (!up) return;
      counts.orientation++;
      ori.push(e.t, up.x, up.y, up.z);
      touch(e.t);
    },
    /** One devicemotion event: accG = accelerationIncludingGravity, acc = acceleration, rot = rotationRate (any may be null). */
    pushMotion(e) {
      if (!e || !fin(e.t)) return;
      const g = vec3(e.accG), mag = g ? Math.hypot(g.x, g.y, g.z) : 0;
      if (g && mag > 1e-6) { counts.accelerometer++; acc.push(e.t, g.x, g.y, g.z, mag); }
      const r = e.rot;
      if (r && fin(r.alpha) && fin(r.beta) && fin(r.gamma)) { counts.gyroscope++; rot.push(e.t, Math.hypot(r.alpha, r.beta, r.gamma)); }
      touch(e.t);
    },
    state(now) {
      const at = fin(now) ? now : lastT;
      if (!cache || cache.at !== at) cache = { at, value: compute(at) };
      return cache.value;
    },
    reset,
  };
}

// ---- Image-only estimate from the start posture ---------------------------------------------------------------
// All gates use angles and length ratios, which do not change when the picture is rotated, so they work on
// uncorrected frames. Every reference yields an "up" vector u in j2 units; roll = atan2(-u.x, -u.y).

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len2 = (v) => Math.hypot(v.x, v.y);
const rollFromUp = (u) => Math.atan2(-u.x, -u.y) * DEG;

/** Interior angle at b in degrees (2D), or null for degenerate segments. */
function angle2(a, b, c) {
  const u = sub(a, b), w = sub(c, b), n = len2(u) * len2(w);
  return n > 1e-12 ? Math.acos(clamp((u.x * w.x + u.y * w.y) / n, -1, 1)) * DEG : null;
}

/** Unsigned angle between two 2D directions in degrees. */
function between2(u, w) {
  const n = len2(u) * len2(w);
  return n > 1e-12 ? Math.acos(clamp((u.x * w.x + u.y * w.y) / n, -1, 1)) * DEG : 180;
}

/** Signed distance of p from the line a->b, positive on the side of `ref`; and the unit normal towards `ref`. */
function floorLine(a, b, ref) {
  const h = sub(b, a), L = len2(h);
  if (!(L > 1e-9)) return null;
  let n = { x: h.y / L, y: -h.x / L };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (n.x * (ref.x - mid.x) + n.y * (ref.y - mid.y) < 0) n = { x: -n.x, y: -n.y };
  return { L, up: n, height: (p) => n.x * (p.x - a.x) + n.y * (p.y - a.y) };
}

/** Joints of one body side (prefix 'l_' | 'r_') that are visible enough; missing ones are null. */
function sideJoints(j2, prefix) {
  const get = (name) => {
    const p = j2[prefix + name];
    return p && fin(p.x) && fin(p.y) && p.v >= OC.visMin ? p : null;
  };
  return { shoulder: get('shoulder'), elbow: get('elbow'), wrist: get('wrist'), hip: get('hip'), knee: get('knee'),
    ankle: get('ankle'), foot: get('foot') };
}

const POSE_REFS = {
  /** Standing upright: ankle->shoulder is vertical; the torso must point the same way. */
  squat(s) {
    if (!s.shoulder || !s.hip || !s.knee || !s.ankle) return null;
    const knee = angle2(s.hip, s.knee, s.ankle), hip = angle2(s.shoulder, s.hip, s.knee);
    if (knee == null || hip == null || knee < OC.straightKnee || hip < OC.straightHip) return null;
    const up = sub(s.shoulder, s.ankle);
    return between2(up, sub(s.shoulder, s.hip)) <= OC.alignDeg ? up : null;
  },
  /** Push-up top: wrist and toes (or knees) are on the floor; arms extended, body in a line above the floor. */
  pushup(s, variant) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow) return null;
    return floorUp(s, s.wrist, variant, 0.2, 0.95);
  },
  /** Forearm plank: elbow and toes on the floor, upper arm roughly perpendicular to it. */
  plank(s) {
    if (!s.shoulder || !s.elbow || !s.hip || !s.knee || !s.foot) return null;
    if (s.wrist) {
      const elbow = angle2(s.shoulder, s.elbow, s.wrist);
      if (elbow == null || elbow < OC.plankElbowMin || elbow > OC.plankElbowMax) return null;
    }
    const knee = s.ankle ? angle2(s.hip, s.knee, s.ankle) : null;
    if (knee != null && knee < OC.plankKnee) return null;
    const up = floorUp(s, s.elbow, 'toes', 0.1, 0.6);
    return up;
  },
  /** Dead hang: the body hangs below the grip, wrist->ankle (legs straight) or wrist->hip (knees bent) is vertical. */
  pullup(s) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow) return null;
    const hang = sub(s.wrist, s.hip);
    if (between2(hang, sub(s.wrist, s.shoulder)) > OC.alignDeg + 3) return null;          // arm in line with the body
    if (len2(sub(s.wrist, s.shoulder)) > 0.9 * len2(hang)) return null;                    // shoulder between wrist and hip
    const knee = s.knee && s.ankle ? angle2(s.hip, s.knee, s.ankle) : null;
    if (knee != null && knee >= OC.straightKnee - 10) {
      const full = sub(s.wrist, s.ankle);
      return between2(full, hang) <= OC.alignDeg ? full : null;
    }
    return hang;
  },
  /** Dip support: straight arm, hand below the shoulder next to the hip: wrist->shoulder is vertical. */
  dip(s) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow + 5) return null;
    const arm = sub(s.wrist, s.shoulder), torso = sub(s.hip, s.shoulder), ratio = len2(arm) / (len2(torso) || 1e-9);
    if (between2(arm, torso) > OC.dipArmTorsoDeg || ratio < 0.7 || ratio > 1.6) return null;
    return sub(s.shoulder, s.wrist);
  },
};

/** "Up" from the floor line between a front contact (wrist/elbow) and the rear contact (toes or knees). */
function floorUp(s, front, variant, minShoulder, maxShoulder) {
  if (!s.knee && !s.foot) return null;
  let rear = variant === 'knees' ? s.knee : variant === 'toes' ? s.foot : null;
  if (!rear && variant !== 'knees' && variant !== 'toes') {
    // auto: the lower support. Toes hanging in the air (knee push-up) are above the wrist-knee line.
    rear = s.foot;
    if (s.knee && s.foot) {
      const viaKnee = floorLine(front, s.knee, s.shoulder);
      if (viaKnee && viaKnee.height(s.foot) > 0.04 * viaKnee.L) rear = s.knee;
    } else if (!s.foot) rear = s.knee;
  }
  if (!rear) return null;
  const raw = floorLine(front, rear, s.shoulder), torso = len2(sub(s.shoulder, s.hip));
  if (!raw || raw.L < OC.floorLineMin * torso) return null;
  // The landmarks are joint centres, not the skin on the floor: drop each one by its usual height before fitting.
  const lift = OC.contactLift, drop = (p, k) => ({ x: p.x - raw.up.x * k * torso, y: p.y - raw.up.y * k * torso });
  const line = floorLine(drop(front, front === s.elbow ? lift.elbow : lift.wrist), drop(rear, rear === s.knee ? lift.knee : lift.foot), s.shoulder);
  if (!line) return null;
  const hs = line.height(s.shoulder) / line.L, hh = line.height(s.hip) / line.L;
  if (hs < minShoulder || hs > maxShoulder || hh < 0.05) return null;                     // chest or hips on the floor
  // the trunk lies along the floor and the supporting arm stands on it (a standing person with the arms forward does neither)
  const along = sub(rear, front), trunk = between2(sub(s.hip, s.shoulder), along);
  if (trunk > OC.trunkFloorDeg || between2(sub(s.shoulder, front), line.up) > OC.armFloorDeg) return null;
  const far = rear === s.knee ? s.knee : (s.knee || rear);
  const body = angle2(s.shoulder, s.hip, far);
  if (body == null || body < OC.bodyLine) return null;
  // A standing person reaching forward (or leaning on a wall) looks like a push-up in a picture turned ~70°: floor
  // references are only used for moderate rolls, so they can never claim a sideways picture.
  return Math.abs(rollFromUp(line.up)) <= OC.sidewaysDeg ? line.up : null;
}

/**
 * Camera roll estimated from the picture alone, using the start posture of each test (for uploaded videos,
 * desktops and denied sensor permissions). References: squat = standing, ankle->shoulder vertical; push-up =
 * wrist and toes/knees on the floor; plank = elbow and toes on the floor; pull-up = dead hang, wrist->ankle (or
 * wrist->hip with bent knees) vertical; dip = top support, shoulder->wrist vertical. Frames that do not look like
 * the start posture are ignored; the estimate is the median over the accepted frames and is reported once at
 * least `minFrames` agree within `maxSpreadDeg`. The last confident estimate stays available (latched).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {{variant?: 'toes'|'knees'|'auto'}} [opts] push-up support; 'auto' (default) picks the lower one
 * @returns {{push: (joints: object) => boolean, state: () => {tilt: object|null, n: number, spread: number|null,
 *   fresh: boolean, seen: number}, reset: () => void}}
 *   push(joints): Joints of an UNCORRECTED frame (toJoints); returns true when the frame was accepted.
 *   state(): tilt = Tilt (source 'image', pitch null, still null, `estimatedRoll` = the measured roll before the
 *   per-test dead-band `imageDeadbandDeg`, inside which `roll` is 0) or null until confident; n = accepted frames in the
 *   window; spread = robust spread of their rolls in degrees (1.4826·MAD); fresh = the current window is confident
 *   (false = tilt is the latched one); seen = frames pushed.
 */
function createPoseLevelEstimator(test, opts = {}) {
  const ref = POSE_REFS[test];
  if (!ref) throw new Error(`orientation: prueba desconocida "${test}"`);
  const variant = opts.variant ?? 'auto';
  let rows = [], latched = null, seen = 0, prevSide = null, cache = null;

  function measure(j2) {
    const L = sideJoints(j2, 'l_'), R = sideJoints(j2, 'r_');
    const score = (p) => ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].reduce((q, n) => q + (j2[p + n] ? j2[p + n].v || 0 : 0), 0);
    const first = prevSide ?? (score('l_') >= score('r_') ? 'l_' : 'r_');
    for (const p of [first, first === 'l_' ? 'r_' : 'l_']) {
      const up = ref(p === 'l_' ? L : R, variant);
      if (up && len2(up) > 1e-9) { prevSide = p; return rollFromUp(up); }
    }
    return null;
  }

  function compute() {
    const n = rows.length;
    if (!n) return { tilt: latched, n: 0, spread: null, fresh: false, seen };
    const base = rows[n - 1][1], rel = rows.map((r) => wrapDeg(r[1] - base));
    const med = median(rel), spread = 1.4826 * median(rel.map((v) => Math.abs(v - med)));
    const fresh = n >= OC.minFrames && spread <= OC.maxSpreadDeg;
    if (fresh) {
      const est = wrapDeg(base + med), roll = Math.abs(est) <= (OC.imageDeadbandDeg[test] ?? 0) ? 0 : est;
      const conf = (OC.baseConfidence[test] ?? 0.6) * Math.min(1, n / OC.fullFrames) * (1 - 0.5 * spread / OC.maxSpreadDeg);
      latched = makeTilt(roll, null, { x: clean(Math.sin(roll * RAD)), y: clean(Math.cos(roll * RAD)) }, 'image', conf, null);
      latched.estimatedRoll = est;
    }
    return { tilt: latched, n, spread, fresh, seen };
  }

  return {
    push(joints) {
      seen++; cache = null;
      const j2 = joints && joints.j2, t = joints && fin(joints.t) ? joints.t : NaN;
      if (fin(t)) rows = rows.filter((r) => !fin(r[0]) || (t - r[0] <= OC.maxAgeMs && t >= r[0]));
      const roll = j2 ? measure(j2) : null;
      if (roll == null || !fin(roll)) return false;
      rows.push([t, roll]);
      if (rows.length > OC.windowFrames) rows.shift();
      return true;
    },
    state() { return (cache ??= compute()); },
    reset() { rows = []; latched = null; seen = 0; prevSide = null; cache = null; },
  };
}

// ---- Fusion ---------------------------------------------------------------------------------------------------

const usable = (t, source) => !!t && t.source === source && fin(t.roll) && t.confidence > 0;

/**
 * Chooses the tilt to apply from the sensor estimate and the start-posture (image) estimate.
 * - only one usable -> that one (`reason` 'sensor_only' | 'image_only');
 * - both agree within `conflictDeg` -> the sensor if it is still (it also knows the pitch; `reason` 'sensor'),
 *   else the image ('image_sensor_moving');
 * - the image claims a sideways picture but a still sensor does not -> sensor ('image_sideways_ignored'): a person
 *   lying in a line looks like a standing person in a turned picture, so that claim is weak;
 * - they differ by ~180° or ~90° (within `patternTolDeg`) -> the sensor convention is wrong on this phone (screen
 *   angle or acceleration sign): image, `reason` 'sensor_convention_180' | 'sensor_convention_90';
 * - any other disagreement -> the image if its confidence >= `conflictImageMin` ('conflict_image'), otherwise the
 *   estimate that rotates the pose less ('conflict_smaller'); confidence is reduced.
 * The result always carries `reason` and `correctable`; `conflictDeg` (absolute roll difference) when both existed.
 * @param {object|null} sensorTilt Tilt with source 'sensor' (e.g. createTiltEstimator().state().lastStill or .tilt)
 * @param {object|null} imageTilt Tilt with source 'image' (createPoseLevelEstimator().state().tilt)
 * @returns {object|null} a new Tilt, or null when neither estimate is usable
 */
function fuseTilt(sensorTilt, imageTilt) {
  const s = usable(sensorTilt, 'sensor') ? sensorTilt : null, i = usable(imageTilt, 'image') ? imageTilt : null;
  const out = (t, reason, factor = 1, conflictDeg) => {
    const r = { ...t, down: { ...t.down }, confidence: clamp(t.confidence * factor, 0, 1), reason };
    if (conflictDeg != null) r.conflictDeg = conflictDeg;
    r.sideways = Math.abs(r.roll) > OC.sidewaysDeg;
    r.correctable = isCorrectable(r);
    return r;
  };
  if (!s && !i) return null;
  if (!i) return out(s, 'sensor_only');
  if (!s) return out(i, 'image_only');
  const d = Math.abs(wrapDeg(s.roll - i.roll));
  if (i.sideways && !s.sideways && s.still !== false) return out(s, 'image_sideways_ignored', 0.8, d);
  if (d <= OC.conflictDeg) return s.still === false ? out(i, 'image_sensor_moving', 1, d) : out(s, 'sensor', 1, d);
  if (Math.abs(d - 180) <= OC.patternTolDeg) return out(i, 'sensor_convention_180', 0.8, d);
  if (Math.abs(d - 90) <= OC.patternTolDeg) return out(i, 'sensor_convention_90', 0.8, d);
  if (i.confidence >= OC.conflictImageMin) return out(i, 'conflict_image', 0.7, d);
  return out(Math.abs(s.roll) <= Math.abs(i.roll) ? s : i, 'conflict_smaller', 0.5, d);
}

// ---- Correction -----------------------------------------------------------------------------------------------

/**
 * Returns a NEW PoseFrame in which gravity points along +y, as the analyzers assume. The input is never mutated.
 * - `lm`: rotated by -roll about the image centre in aspect-corrected units (x·aspect, y) and converted back to
 *   normalized coordinates; z and visibility are kept. With `pitch2D` on (and a known pitch) the points are
 *   re-projected through a virtual level camera instead (pinhole, `longFovDeg` along the long image side).
 * - `world`: rotated in 3D about the optical axis by -roll and then about the camera x axis by the pitch (when it
 *   is known), so that `down` maps to (0, 1, 0). Hip-centred coordinates stay hip-centred.
 * - The result carries `tilt` and `corrected: true`. If the tilt is missing or not correctable (sideways, beyond
 *   `maxAutoDeg`, camera lying flat) the points are copied unchanged and `corrected` is false.
 * @param {{t:number, lm:Array<object>, world?:Array<object>|null, aspect:number}} frame raw PoseFrame
 * @param {object|null} tilt Tilt (from fuseTilt, createTiltEstimator or createPoseLevelEstimator)
 * @param {{pitch2D?: boolean, longFovDeg?: number}} [opts] overrides of the ORIENT_CONFIG defaults
 * @returns {object} new PoseFrame
 */
function correctFrame(frame, tilt, opts = {}) {
  const copy = (arr) => (Array.isArray(arr) ? arr.map((p) => (p ? { ...p } : p)) : arr ?? null);
  if (!frame) return frame;
  if (!isCorrectable(tilt)) return { ...frame, lm: copy(frame.lm), world: copy(frame.world), tilt: tilt ?? null, corrected: false };
  const aspect = fin(frame.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const r = tilt.roll * RAD, c = Math.cos(r), s = Math.sin(r);
  const hasPitch = fin(tilt.pitch), p = hasPitch ? tilt.pitch * RAD : 0, cp = Math.cos(p), sp = Math.sin(p);
  const warp = (opts.pitch2D ?? OC.pitch2D) && hasPitch;
  const f = (Math.max(aspect, 1) / 2) / Math.tan(((opts.longFovDeg ?? OC.longFovDeg) * RAD) / 2);   // focal length in image heights
  const lm = Array.isArray(frame.lm) ? frame.lm.map((q) => {
    if (!q) return q;
    const X = (q.x - 0.5) * aspect, Y = q.y - 0.5;
    let x1 = X * c - Y * s, y1 = X * s + Y * c;
    if (warp) {
      const y2 = y1 * cp - f * sp, z2 = y1 * sp + f * cp;
      if (z2 > 0.05 * f) { x1 = f * x1 / z2; y1 = f * y2 / z2; }
    }
    return { ...q, x: x1 / aspect + 0.5, y: y1 + 0.5 };
  }) : frame.lm;
  const world = Array.isArray(frame.world) ? frame.world.map((q) => {
    if (!q) return q;
    const x1 = q.x * c - q.y * s, y1 = q.x * s + q.y * c;
    return { ...q, x: x1, y: y1 * cp - q.z * sp, z: y1 * sp + q.z * cp };
  }) : frame.world ?? null;
  return { ...frame, lm, world, tilt, corrected: true };
}

// ---- UI text --------------------------------------------------------------------------------------------------

/**
 * Short Spanish (Chile) status for the UI.
 * 'ok': level, or a small tilt that is corrected; 'warn': phone moving, no estimate, a large corrected tilt, a
 * steep camera or sensor/posture conflict; 'bad': the user must act (sideways picture, tilt beyond `maxAutoDeg`,
 * phone lying flat, camera pitched beyond `pitchBadDeg`).
 * @param {object|null} tilt Tilt
 * @returns {{level: 'ok'|'warn'|'bad', msg: string}}
 */
function describeTilt(tilt) {
  const M = OC.msg, fill = (text, v) => text.replace('{n}', String(Math.round(Math.abs(v))));
  if (!tilt || tilt.source === 'none' || !fin(tilt.roll)) return { level: 'warn', msg: M.none };
  const roll = Math.abs(tilt.roll), pitch = fin(tilt.pitch) ? tilt.pitch : 0;
  if (Math.abs(pitch) > OC.flatPitchDeg) return { level: 'bad', msg: M.flat };
  if (roll > OC.sidewaysDeg) return { level: 'bad', msg: M.sideways };
  if (tilt.still === false) return { level: 'warn', msg: M.moving };
  if (roll > OC.maxAutoDeg) return { level: 'bad', msg: fill(M.straighten, roll) };
  if (Math.abs(pitch) > OC.pitchBadDeg) return { level: 'bad', msg: fill(M.pitchBad, pitch) };
  if (typeof tilt.reason === 'string' && tilt.reason.startsWith('conflict')) return { level: 'warn', msg: M.conflict };
  if (roll > OC.warnDeg) return { level: 'warn', msg: fill(M.correctedWarn, roll) };
  if (Math.abs(pitch) > OC.pitchWarnDeg) return { level: 'warn', msg: fill(pitch > 0 ? M.pitchUp : M.pitchDown, pitch) };
  if (Math.round(roll) > OC.okDeg) return { level: 'ok', msg: fill(M.corrected, roll) };
  return { level: 'ok', msg: M.level };
}

export { ORIENT_CONFIG, wrapDeg, resolveScreenAngle, upFromEuler, isCorrectable, deviceToImage, createTiltEstimator, createPoseLevelEstimator, fuseTilt, correctFrame, describeTilt };
