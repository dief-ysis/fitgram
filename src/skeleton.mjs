// FitGram v0 — src/skeleton.js (owner: skeleton agent)
//
// Joint maps (BlazePose 33 → Human3.6M 17 / COCO 17), PoseFrame → Joints, 1€ smoothing,
// the 2D overlay drawn over the live video, a dependency-free 3D viewer on a 2D canvas, and
// the 2D→3D "lifter" interface (MediaPipe world landmarks now, VideoPose3D ONNX in phase 2).
//
// Module rules (CONTRACT.md): ES2022, no dependencies, no DOM access at module top level,
// inline exports only, runs unchanged in Node 22 and mobile browsers.
//
// Coordinate conventions used throughout:
// - `lm`    : normalized image coords, x,y in [0,1], y DOWN, unmirrored (MediaPipe).
// - `world` : meters, origin = mid-hips, x right, y DOWN, z depth (smaller z = closer to camera).
// - 3D viewer internally uses a y-UP display frame: X = x, Y = -y, Z = -z (right-handed,
//   camera of the "front" view sits at +Z looking toward -Z, like the phone camera).

/**
 * Tunable constants of skeleton.js, grouped and frozen (CONTRACT: one frozen object per module).
 * - `headFactor`: head top ≈ midEars + headFactor × (midEars − thorax).
 * - `minVisibility`: below this, joints/bones are drawn faded and dashed.
 * - `colors`: mocap convention (subject's left blue, right orange, axial grey).
 * - `smoother`: PoseSmoother defaults (1€ filter, Casiez 2012) tuned for ~30 fps pose.
 * - `draw2D` / `view3D`: drawing styles (CSS px unless noted; 3D sizes in meters).
 * - `lifter`: VideoPose3D lifter defaults.
 * @type {Readonly<object>}
 */
const SKELETON_CONFIG = Object.freeze({
  headFactor: 0.45,
  minVisibility: 0.5,
  colors: Object.freeze({ left: '#2F9BD3', right: '#E8613C', axial: '#8A96A3' }),
  smoother: Object.freeze({
    lm: Object.freeze({ minCutoff: 1.0, beta: 20 }),    // normalized image units (speed in units/s)
    world: Object.freeze({ minCutoff: 1.0, beta: 10 }), // meters (speed in m/s)
    dCutoff: 1.0,
  }),
  draw2D: Object.freeze({
    boneWidth: 4.5, outlineWidth: 1.25, outlineColor: 'rgba(8,12,18,0.72)',
    jointRadius: 4, ringWidth: 1.5, ringColor: 'rgba(255,255,255,0.92)',
    footWidthFactor: 0.7, fadedAlpha: 0.38, dash: 6,
    highlightFactor: 2.0, angleRadius: 24, angleFill: 'rgba(255,255,255,0.20)',
    labelFont: '700 {px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    labelSize: 14, labelColor: '#FFFFFF', labelOutline: 'rgba(8,12,18,0.85)',
  }),
  view3D: Object.freeze({
    fovDeg: 32,                 // field of view across the shorter canvas side
    near: 0.05, minDistance: 1.2, maxDistance: 12, minDepth: 0.6,
    radiusDistance: 3.0,        // camera ≥ 3 body radii from the target (limits perspective distortion)
    framing: 0.85,              // body extremes may reach 85% of the half viewport
    background: '#0E1318',
    ankleHeight: 0.08, floorClearance: 0.03, // floor = min(lowest ankle − 8 cm, lowest joint − 3 cm)
    gridStep: 0.25, gridHalf: 2.0, gridAlphas: Object.freeze([0.28, 0.18, 0.10, 0.045]), gridRGB: '255,255,255',
    spotAlpha: 0.08, shadowAlpha: 0.24,
    boneRadius: 0.022, jointRadius: 0.03, headRadius: 0.1, minPx: 1.5, maxPx: 16, depthDarken: 0.5,
    fadedAlpha: 0.35, outline: 'rgba(4,7,10,0.55)', ring: 'rgba(255,255,255,0.85)', gloss: 'rgba(255,255,255,0.22)',
    easeSeconds: 0.18, followSeconds: 0.8, fitSeconds: 1.0, autoRotateSpeed: 0.35, // rad/s
    dragPerSide: Math.PI,       // radians of orbit per drag across the shorter canvas side
    pitchMin: -0.2, pitchMax: 1.5,
    tapSlopPx: 10, tapMaxMs: 300, doubleTapMs: 350,
  }),
  lifter: Object.freeze({ receptiveField: 243, refHeight: 1000 }),
});

/**
 * MediaPipe BlazePose landmark name → index (33 points; "l_" = the subject's left).
 * @type {Readonly<Record<string, number>>}
 */
const BP = Object.freeze({
  nose: 0, l_eye_inner: 1, l_eye: 2, l_eye_outer: 3, r_eye_inner: 4, r_eye: 5, r_eye_outer: 6,
  l_ear: 7, r_ear: 8, mouth_l: 9, mouth_r: 10, l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13, r_elbow: 14, l_wrist: 15, r_wrist: 16, l_pinky: 17, r_pinky: 18,
  l_index: 19, r_index: 20, l_thumb: 21, r_thumb: 22, l_hip: 23, r_hip: 24,
  l_knee: 25, r_knee: 26, l_ankle: 27, r_ankle: 28, l_heel: 29, r_heel: 30,
  l_foot: 31, r_foot: 32,
});

const H36M_NAMES = Object.freeze([
  'pelvis', 'r_hip', 'r_knee', 'r_ankle', 'l_hip', 'l_knee', 'l_ankle', 'spine', 'thorax',
  'neck_nose', 'head', 'l_shoulder', 'l_elbow', 'l_wrist', 'r_shoulder', 'r_elbow', 'r_wrist',
]);
const H36M_PARENTS = Object.freeze([-1, 0, 1, 2, 0, 4, 5, 0, 7, 8, 9, 8, 11, 12, 8, 14, 15]);

/**
 * Human3.6M 17-joint skeleton in VideoPose3D order.
 * - `names[i]`, `parents[i]` (−1 for the root `pelvis`),
 * - `left` / `right`: joint indices of the subject's left/right limbs (VideoPose3D joints_left/right),
 * - `bones`: 16 `[parent, child]` index pairs.
 * @type {Readonly<{names: string[], parents: number[], left: number[], right: number[], bones: number[][]}>}
 */
const H36M = Object.freeze({
  names: H36M_NAMES,
  parents: H36M_PARENTS,
  left: Object.freeze([4, 5, 6, 11, 12, 13]),
  right: Object.freeze([1, 2, 3, 14, 15, 16]),
  bones: Object.freeze(H36M_PARENTS.flatMap((p, i) => (p >= 0 ? [Object.freeze([p, i])] : []))),
});

/**
 * The 17 BlazePose indices in COCO keypoint order (nose, l/r eye, l/r ear, l/r shoulder,
 * l/r elbow, l/r wrist, l/r hip, l/r knee, l/r ankle) — the 2D input of VideoPose3D's
 * `pretrained_h36m_detectron_coco.bin` (Detectron COCO keypoints).
 * @type {ReadonlyArray<number>}
 */
const COCO17_FROM_BLAZEPOSE = Object.freeze([0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

// H36M joint index by name, and the drawing side ('left' | 'right' | 'axial') of each joint.
const HI = Object.freeze(Object.fromEntries(H36M_NAMES.map((n, i) => [n, i])));
const H_SIDE = Object.freeze(H36M_NAMES.map((_, i) =>
  (H36M.left.includes(i) ? 'left' : H36M.right.includes(i) ? 'right' : 'axial')));

// Joint names exposed by toJoints() (CONTRACT `Joints`).
const JOINT_NAMES = Object.freeze([
  'nose', 'l_shoulder', 'r_shoulder', 'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist', 'l_hip', 'r_hip',
  'l_knee', 'r_knee', 'l_ankle', 'r_ankle', 'l_heel', 'r_heel', 'l_foot', 'r_foot',
]);

/**
 * Converts a PoseFrame into the `Joints` structure consumed by exercises.js.
 * - `j2[name] = { x: lm.x * aspect, y: lm.y, v }` (aspect-corrected image units, y down),
 * - `j3[name] = { x, y, z, v }` copied from `frame.world` (meters, y down) or `j3 = null`,
 * - `v = visibility ?? 1`. Missing landmarks become `{ x: NaN, y: NaN, (z: NaN), v: 0 }`.
 * @param {{t:number, lm:Array<object>, world?:Array<object>|null, aspect:number}} frame
 * @returns {{j2: Record<string, {x:number,y:number,v:number}>, j3: Record<string, {x:number,y:number,z:number,v:number}>|null, t:number}}
 */
function toJoints(frame) {
  const lm = frame && Array.isArray(frame.lm) ? frame.lm : null;
  const world = frame && Array.isArray(frame.world) && frame.world.length ? frame.world : null;
  const aspect = frame && Number.isFinite(frame.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const j2 = {};
  const j3 = world ? {} : null;
  for (const name of JOINT_NAMES) {
    const i = BP[name];
    const p = lm ? lm[i] : null;
    j2[name] = p ? { x: p.x * aspect, y: p.y, v: p.visibility ?? 1 } : { x: NaN, y: NaN, v: 0 };
    if (j3) {
      const q = world[i];
      j3[name] = q ? { x: q.x, y: q.y, z: q.z, v: q.visibility ?? 1 } : { x: NaN, y: NaN, z: NaN, v: 0 };
    }
  }
  return { j2, j3, t: frame ? frame.t : NaN };
}

// Recipe of every H36M joint as a weighted sum of BlazePose points: [indices, weights].
const HEAD_K = SKELETON_CONFIG.headFactor;
const H36M_RECIPE = Object.freeze([
  [[23, 24], [0.5, 0.5]],                                         // 0 pelvis = mid hips
  [[24], [1]], [[26], [1]], [[28], [1]],                          // 1-3 right leg
  [[23], [1]], [[25], [1]], [[27], [1]],                          // 4-6 left leg
  [[23, 24, 11, 12], [0.25, 0.25, 0.25, 0.25]],                   // 7 spine = mid(pelvis, thorax)
  [[11, 12], [0.5, 0.5]],                                         // 8 thorax = mid shoulders
  [[0], [1]],                                                     // 9 neck_nose = nose
  [[7, 8, 11, 12], [(1 + HEAD_K) / 2, (1 + HEAD_K) / 2, -HEAD_K / 2, -HEAD_K / 2]], // 10 head top
  [[11], [1]], [[13], [1]], [[15], [1]],                          // 11-13 left arm
  [[12], [1]], [[14], [1]], [[16], [1]],                          // 14-16 right arm
].map((r) => Object.freeze(r)));

/** Visibility of a point: MediaPipe `visibility`, or an already converted `v`, else 1. */
function visOf(p) {
  return p.visibility ?? p.v ?? 1;
}

/**
 * Converts 33 BlazePose points (2D `lm` or 3D `world`) into the 17 Human3.6M joints.
 * Derived joints: pelvis = mid hips; thorax = mid shoulders; spine = midpoint pelvis–thorax;
 * neck_nose = nose; head (top) = midEars + 0.45 × (midEars − thorax). Others map directly.
 * `z` is kept when every contributor has a numeric z; `v` = mean visibility of the contributors.
 * A joint with a missing contributor becomes `{ x: NaN, y: NaN, v: 0 }` (never throws).
 * @param {Array<{x:number,y:number,z?:number,visibility?:number,v?:number}>} points
 * @returns {Array<{x:number,y:number,z?:number,v:number}>} 17 points in H36M order
 */
function blazeposeToH36M(points) {
  const out = new Array(17);
  for (let j = 0; j < 17; j++) {
    const [idx, w] = H36M_RECIPE[j];
    let x = 0, y = 0, z = 0, v = 0, hasZ = true, ok = true;
    for (let k = 0; k < idx.length; k++) {
      const p = points ? points[idx[k]] : null;
      if (!p) { ok = false; break; }
      x += w[k] * p.x;
      y += w[k] * p.y;
      if (typeof p.z === 'number') z += w[k] * p.z; else hasZ = false;
      v += visOf(p);
    }
    if (!ok) out[j] = { x: NaN, y: NaN, v: 0 };
    else out[j] = hasZ ? { x, y, z, v: v / idx.length } : { x, y, v: v / idx.length };
  }
  return out;
}

function isPair(a) {
  return a != null && typeof a[0] === 'number';
}

/**
 * VideoPose3D screen normalization (`common/camera.py`): `X / w * 2 − [1, h / w]`, i.e. x in
 * [0, w] → [−1, 1] and y scaled by the same factor (aspect ratio preserved, image centre → 0).
 * Accepts an array of `[x, y]` pixel pairs (returns a new array of pairs) or a single pair.
 * @param {Array<number[]>|number[]} xyPixels
 * @param {number} w image width in pixels
 * @param {number} h image height in pixels
 * @returns {Array<number[]>|number[]}
 */
function normalizeScreenCoordinates(xyPixels, w, h) {
  if (!(w > 0) || !(h > 0)) throw new RangeError('normalizeScreenCoordinates: w and h must be > 0');
  const f = (p) => [p[0] / w * 2 - 1, p[1] / w * 2 - h / w];
  return isPair(xyPixels) ? f(xyPixels) : Array.from(xyPixels, f);
}

/**
 * Inverse of {@link normalizeScreenCoordinates} (VideoPose3D `image_coordinates`):
 * `(X + [1, h / w]) * w / 2`. Same input shapes (array of pairs or a single pair).
 * @param {Array<number[]>|number[]} xyNorm
 * @param {number} w image width in pixels
 * @param {number} h image height in pixels
 * @returns {Array<number[]>|number[]} pixel coordinates
 */
function imageCoordinates(xyNorm, w, h) {
  if (!(w > 0) || !(h > 0)) throw new RangeError('imageCoordinates: w and h must be > 0');
  const f = (p) => [(p[0] + 1) * w / 2, (p[1] + h / w) * w / 2];
  return isPair(xyNorm) ? f(xyNorm) : Array.from(xyNorm, f);
}

// ───────────────────────────── Smoothing (1€ filter) ─────────────────────────────

const TWO_PI = 2 * Math.PI;
const DEFAULT_DT = 1 / 30; // assumed sampling period when no usable timestamp is given

/** Exponential smoothing factor for a first-order low-pass at `cutoff` Hz and step `dt` s. */
function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * Scalar 1€ filter (Casiez, Roussel & Vogel, CHI 2012): an adaptive low-pass whose cutoff
 * grows with the (low-passed) speed — `cutoff = minCutoff + beta · |dx/dt|` — so it removes
 * jitter at rest (low `minCutoff`) and keeps lag small on fast motion (higher `beta`).
 * Units: `minCutoff` and `dCutoff` in Hz, `beta` in 1/(value unit), timestamps in seconds.
 * Non-finite values pass through without touching the state; a repeated or older timestamp
 * returns the last output; a missing timestamp assumes 30 Hz.
 */
class OneEuroFilter {
  /**
   * @param {{minCutoff?:number, beta?:number, dCutoff?:number}} [opts]
   *   minCutoff (Hz, default 1), beta (default 0 = plain low-pass), dCutoff (Hz, default 1).
   */
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    if (!(minCutoff > 0) || !(dCutoff > 0) || !(beta >= 0)) {
      throw new RangeError('OneEuroFilter: minCutoff, dCutoff must be > 0 and beta >= 0');
    }
    /** @type {number} */ this.minCutoff = minCutoff;
    /** @type {number} */ this.beta = beta;
    /** @type {number} */ this.dCutoff = dCutoff;
    this.reset();
  }

  /** Forgets the history; the next sample is returned unchanged. */
  reset() {
    this._x = NaN;   // last filtered value
    this._dx = 0;    // last filtered derivative (units/s)
    this._t = NaN;   // last timestamp (s)
    this._has = false;
  }

  /** Last filtered value (NaN before the first sample). @type {number} */
  get value() {
    return this._x;
  }

  /**
   * Filters one sample.
   * @param {number} value raw sample
   * @param {number} [tSeconds] timestamp in seconds (monotonic)
   * @returns {number} filtered value
   */
  filter(value, tSeconds) {
    if (!Number.isFinite(value)) return value;
    const t = Number.isFinite(tSeconds) ? tSeconds : (this._has ? this._t + DEFAULT_DT : 0);
    if (!this._has) {
      this._x = value; this._dx = 0; this._t = t; this._has = true;
      return value;
    }
    const dt = t - this._t;
    if (!(dt > 0)) return this._x; // duplicate / out-of-order timestamp
    const dx = (value - this._x) / dt;
    this._dx += smoothingAlpha(this.dCutoff, dt) * (dx - this._dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    this._x += smoothingAlpha(cutoff, dt) * (value - this._x);
    this._t = t;
    return this._x;
  }
}

/**
 * Smooths a PoseFrame per landmark and axis with 1€ filters: `lm` x,y,z (normalized image
 * units) and `world` x,y,z (meters) use separate settings. Defaults
 * (`SKELETON_CONFIG.smoother`) are tuned for ~30 fps MediaPipe output. Medido en
 * `test/esqueleto.test.mjs`: en reposo divide el ruido por 2,7, y en una bajada de flexión
 * (0,6 unidades/s) se arrastra 0,35 cuadros. Tras un hueco largo —la cámara se queda
 * pegada— el paso de tiempo grande hace que el filtro siga el dato nuevo casi sin promediar
 * con el viejo, que es lo que corresponde cuando ya hay poca información.
 * `smooth()` never mutates its input; `visibility` and any other fields pass through.
 * A missing `world` (null) is passed through and its filters are left untouched. If time goes
 * backwards (new clip, demo loop) the smoother resets itself.
 */
class PoseSmoother {
  /**
   * @param {{lm?:{minCutoff?:number,beta?:number}, world?:{minCutoff?:number,beta?:number}, dCutoff?:number}} [opts]
   */
  constructor(opts = {}) {
    const d = SKELETON_CONFIG.smoother;
    const pick = (o, def) => ({ minCutoff: o?.minCutoff ?? def.minCutoff, beta: o?.beta ?? def.beta });
    /** Effective settings. */
    this.opts = { lm: pick(opts.lm, d.lm), world: pick(opts.world, d.world), dCutoff: opts.dCutoff ?? d.dCutoff };
    this._lm = [];    // per landmark index: [fx, fy, fz]
    this._world = [];
    this._lastT = NaN; // ms
  }

  /** Clears all filter state (call when a new session/clip starts). */
  reset() {
    this._lm.length = 0;
    this._world.length = 0;
    this._lastT = NaN;
  }

  /**
   * Returns a smoothed copy of `frame` (`{ ...frame, lm: [...], world: [...] | null }`).
   * @param {{t:number, lm:Array<object>, world?:Array<object>|null, aspect:number}} frame
   * @returns {object} new PoseFrame
   */
  smooth(frame) {
    if (!frame || typeof frame !== 'object') return frame;
    let tMs = Number(frame.t);
    if (Number.isFinite(tMs) && tMs < this._lastT) this.reset();
    if (!Number.isFinite(tMs)) tMs = Number.isFinite(this._lastT) ? this._lastT + DEFAULT_DT * 1000 : 0;
    const tSec = tMs / 1000;
    const out = { ...frame };
    if (Array.isArray(frame.lm)) out.lm = this._smoothList(frame.lm, this._lm, this.opts.lm, tSec);
    if (Array.isArray(frame.world)) out.world = this._smoothList(frame.world, this._world, this.opts.world, tSec);
    this._lastT = tMs;
    return out;
  }

  /** @private */
  _smoothList(list, bank, o, tSec) {
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || typeof p !== 'object') { out[i] = p; continue; }
      let f = bank[i];
      if (!f) {
        const fo = { minCutoff: o.minCutoff, beta: o.beta, dCutoff: this.opts.dCutoff };
        f = bank[i] = [new OneEuroFilter(fo), new OneEuroFilter(fo), new OneEuroFilter(fo)];
      }
      const q = { ...p };
      q.x = f[0].filter(p.x, tSec);
      q.y = f[1].filter(p.y, tSec);
      if (typeof p.z === 'number') q.z = f[2].filter(p.z, tSec);
      out[i] = q;
    }
    return out;
  }
}

// ───────────────────────────── 2D overlay ─────────────────────────────

/**
 * Builds the `project(nx, ny) → [px, py]` function drawSkeleton2D needs for a video shown with
 * CSS `object-fit: cover` (default) or `'contain'` and `object-position: 50% 50%` inside a box of
 * `width × height` CSS px. `mirror` = the video element is flipped with `transform: scaleX(-1)`
 * (selfie preview). `scale` multiplies the output (pass devicePixelRatio when the overlay canvas
 * context is NOT already scaled by it, together with `opts.scale` of drawSkeleton2D).
 * @param {{videoWidth:number, videoHeight:number, width:number, height:number, mirror?:boolean, fit?:'cover'|'contain', scale?:number}} p
 * @returns {(nx:number, ny:number) => number[]}
 */
function makeCoverProjection({ videoWidth, videoHeight, width, height, mirror = false, fit = 'cover', scale = 1 }) {
  const vw = videoWidth > 0 ? videoWidth : width, vh = videoHeight > 0 ? videoHeight : height;
  const k = (fit === 'contain' ? Math.min : Math.max)(width / vw, height / vh);
  const dw = vw * k, dh = vh * k, ox = (width - dw) / 2, oy = (height - dh) / 2;
  return (nx, ny) => [(ox + (mirror ? 1 - nx : nx) * dw) * scale, (oy + ny * dh) * scale];
}

/** Merges user colors with the defaults; accepts `axial` or its alias `axis`. */
function resolveColors(c) {
  const d = SKELETON_CONFIG.colors;
  return { left: c?.left || d.left, right: c?.right || d.right, axial: c?.axial || c?.axis || d.axial };
}

// Drawing slots: 0..16 = H36M joints, then 17 l_heel, 18 r_heel, 19 l_foot, 20 r_foot.
const SK_NSLOT = 21;
const SK_FOOT_BP = Object.freeze([29, 30, 31, 32]);
const SK_SLOT = Object.freeze({ ...HI, nose: 9, l_heel: 17, r_heel: 18, l_foot: 19, r_foot: 20 });
// Side of each slot: 0 axial, 1 left, 2 right.
const SK_SLOT_SIDE = Uint8Array.from({ length: SK_NSLOT }, (_, i) =>
  (i >= 17 ? (i % 2 ? 1 : 2) : H_SIDE[i] === 'left' ? 1 : H_SIDE[i] === 'right' ? 2 : 0));
// Segments = 16 H36M bones + feet triangles (ankle → heel → foot index → ankle).
const SK_SEGS = Object.freeze([...H36M.bones, [6, 17], [17, 19], [19, 6], [3, 18], [18, 20], [20, 3]]);
const SK_NSEG = SK_SEGS.length;
// Anatomical angle definitions (prefixed with l_/r_): [end A, vertex, end B].
const SK_ANGLE_DEF = Object.freeze({
  elbow: ['shoulder', 'elbow', 'wrist'], knee: ['hip', 'knee', 'ankle'], hip: ['shoulder', 'hip', 'knee'],
  shoulder: ['hip', 'shoulder', 'elbow'], ankle: ['knee', 'ankle', 'foot'],
});
// Scratch buffers (no allocation per frame for the geometry).
const SK_PX = new Float64Array(SK_NSLOT), SK_PY = new Float64Array(SK_NSLOT);
const SK_PZ = new Float64Array(SK_NSLOT), SK_PV = new Float64Array(SK_NSLOT);
const SK_ORDER2 = new Int16Array(SK_NSEG + SK_NSLOT), SK_DEPTH2 = new Float64Array(SK_NSEG + SK_NSLOT);

/** Sorts item indices 0..n-1 by depth, largest (farthest) first; stable insertion sort. */
function skSortFarFirst(order, depth, n) {
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = 1; i < n; i++) {
    const k = order[i], d = depth[k];
    let j = i - 1;
    while (j >= 0 && depth[order[j]] < d) { order[j + 1] = order[j]; j--; }
    order[j + 1] = k;
  }
}

function skFinite2(i) {
  return Number.isFinite(SK_PX[i]) && Number.isFinite(SK_PY[i]);
}

/** Resolves an angle spec to [a, vertex, b] slots, or null. Unprefixed joint → more visible side. */
function skAngleSlots(spec) {
  const name = String(spec && spec.joint || '');
  let side = name.startsWith('l_') ? 'l_' : name.startsWith('r_') ? 'r_' : '';
  const def = SK_ANGLE_DEF[side ? name.slice(2) : name];
  if (!def) return null;
  if (!side) {
    const vis = (p) => SK_PV[SK_SLOT[p + def[0]]] + SK_PV[SK_SLOT[p + def[1]]] + SK_PV[SK_SLOT[p + def[2]]];
    side = vis('l_') >= vis('r_') ? 'l_' : 'r_';
  }
  const bw = Array.isArray(spec.between) ? spec.between : null;
  const a = SK_SLOT[bw ? bw[0] : side + def[0]], v = SK_SLOT[side + def[1]], b = SK_SLOT[bw ? bw[1] : side + def[2]];
  return a === undefined || b === undefined ? null : [a, v, b];
}

/**
 * Draws the Human3.6M skeleton (from `frame.lm` via blazeposeToH36M) plus both feet over a video.
 * Bones are round-capped lines with a thin dark outline (readable over any video), joints are
 * filled dots with a light ring, colored left/right/axial; items are drawn far→near using `lm.z`.
 * Joints/bones with visibility < `minVisibility` are faded and dashed. Never throws on partial data
 * (missing/NaN landmarks are skipped). Does not clear the canvas unless `opts.clear`.
 * @param {CanvasRenderingContext2D} ctx overlay context (CSS px units unless you use opts.scale)
 * @param {{lm:Array<{x:number,y:number,z?:number,visibility?:number}>}} frame PoseFrame
 * @param {object} [opts]
 * @param {number} [opts.width] canvas width used by the default projection (default ctx.canvas.width)
 * @param {number} [opts.height] canvas height used by the default projection
 * @param {boolean} [opts.mirror] default projection flips x (selfie preview)
 * @param {(nx:number, ny:number) => number[]} [opts.project] normalized image → canvas px (see makeCoverProjection)
 * @param {string[]} [opts.highlight] joint names to emphasize: H36M names, 'nose', 'l_heel', 'r_foot'…; unprefixed 'knee' = both sides
 * @param {Array<{joint:string, value?:number|null, between?:string[]}>} [opts.angles] arcs + labels, e.g.
 *   `{ joint: 'l_elbow', value: 92 }`. joint ∈ {l_,r_,}{elbow,knee,hip,shoulder,ankle} (hip = shoulder–hip–knee;
 *   unprefixed = the more visible side); `value` null → the 2D angle measured on screen; `between` overrides the ends.
 * @param {number} [opts.minVisibility=0.5]
 * @param {{left?:string, right?:string, axial?:string}} [opts.colors]
 * @param {number} [opts.scale=1] multiplies line widths, radii and font size (e.g. devicePixelRatio)
 * @param {boolean} [opts.clear=false] clearRect(0, 0, width, height) first
 */
function drawSkeleton2D(ctx, frame, opts = {}) {
  if (!ctx || !frame || !Array.isArray(frame.lm) || frame.lm.length === 0) return;
  const cfg = SKELETON_CONFIG.draw2D;
  const width = opts.width ?? ctx.canvas?.width ?? 0, height = opts.height ?? ctx.canvas?.height ?? 0;
  const mirror = !!opts.mirror;
  const project = typeof opts.project === 'function' ? opts.project
    : (nx, ny) => [(mirror ? 1 - nx : nx) * width, ny * height];
  const minVis = opts.minVisibility ?? SKELETON_CONFIG.minVisibility;
  const col = resolveColors(opts.colors);
  const sideColor = [col.axial, col.left, col.right];
  const s = opts.scale > 0 ? opts.scale : 1;
  const lm = frame.lm;
  const h = blazeposeToH36M(lm);
  for (let i = 0; i < SK_NSLOT; i++) {
    const p = i < 17 ? h[i] : lm[SK_FOOT_BP[i - 17]];
    let x = NaN, y = NaN;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const q = project(p.x, p.y);
      if (q) { x = q[0]; y = q[1]; }
    }
    const v = p ? (i < 17 ? p.v : visOf(p)) : 0;
    SK_PX[i] = x; SK_PY[i] = y;
    SK_PZ[i] = p && Number.isFinite(p.z) ? p.z : 0;
    SK_PV[i] = Number.isFinite(v) ? v : 0;
  }
  // Highlighted slots.
  const hi = new Set();
  for (const n of opts.highlight || []) {
    if (SK_SLOT[n] !== undefined) hi.add(SK_SLOT[n]);
    else if (SK_SLOT['l_' + n] !== undefined) { hi.add(SK_SLOT['l_' + n]); hi.add(SK_SLOT['r_' + n]); }
  }
  // Depth order: segments (mean z) and joints (z, slightly nearer so they cover their bones).
  for (let k = 0; k < SK_NSEG; k++) SK_DEPTH2[k] = (SK_PZ[SK_SEGS[k][0]] + SK_PZ[SK_SEGS[k][1]]) / 2;
  for (let i = 0; i < SK_NSLOT; i++) SK_DEPTH2[SK_NSEG + i] = SK_PZ[i] - 1e-3;
  skSortFarFirst(SK_ORDER2, SK_DEPTH2, SK_NSEG + SK_NSLOT);

  ctx.save();
  if (opts.clear && ctx.clearRect) ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dashes = typeof ctx.setLineDash === 'function';
  const bw = cfg.boneWidth * s, ow = cfg.outlineWidth * s, jr = cfg.jointRadius * s, rw = cfg.ringWidth * s;
  for (let n = 0; n < SK_NSEG + SK_NSLOT; n++) {
    const item = SK_ORDER2[n];
    if (item < SK_NSEG) {
      const [a, b] = SK_SEGS[item];
      if (!skFinite2(a) || !skFinite2(b)) continue;
      const faded = Math.min(SK_PV[a], SK_PV[b]) < minVis;
      const w = item >= 16 ? bw * cfg.footWidthFactor : bw;
      ctx.globalAlpha = faded ? cfg.fadedAlpha : 1;
      if (dashes) ctx.setLineDash(faded ? [w * 0.9, w * 1.9] : []);
      ctx.beginPath();
      ctx.moveTo(SK_PX[a], SK_PY[a]);
      ctx.lineTo(SK_PX[b], SK_PY[b]);
      ctx.strokeStyle = cfg.outlineColor;
      ctx.lineWidth = w + 2 * ow;
      ctx.stroke();
      ctx.strokeStyle = sideColor[SK_SLOT_SIDE[b]];
      ctx.lineWidth = w;
      ctx.stroke();
    } else {
      const i = item - SK_NSEG;
      if (!skFinite2(i)) continue;
      const x = SK_PX[i], y = SK_PY[i], faded = SK_PV[i] < minVis, color = sideColor[SK_SLOT_SIDE[i]];
      const r = jr * (i >= 17 ? 0.7 : i === 7 ? 0.75 : 1) * (hi.has(i) ? 1.25 : 1);
      if (dashes) ctx.setLineDash([]);
      if (hi.has(i)) {
        const R = r * cfg.highlightFactor + 2 * s;
        ctx.globalAlpha = faded ? cfg.fadedAlpha : 1;
        ctx.beginPath(); ctx.arc(x, y, R, 0, TWO_PI);
        ctx.fillStyle = color; ctx.globalAlpha *= 0.3; ctx.fill();
        ctx.globalAlpha = faded ? cfg.fadedAlpha : 1;
        ctx.strokeStyle = cfg.outlineColor; ctx.lineWidth = rw + 2 * ow; ctx.stroke();
        ctx.strokeStyle = cfg.ringColor; ctx.lineWidth = rw; ctx.stroke();
      }
      ctx.globalAlpha = faded ? cfg.fadedAlpha : 1;
      if (!faded) {
        ctx.beginPath(); ctx.arc(x, y, r + rw + ow, 0, TWO_PI); ctx.fillStyle = cfg.outlineColor; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r + rw, 0, TWO_PI); ctx.fillStyle = cfg.ringColor; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r, 0, TWO_PI); ctx.fillStyle = color; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TWO_PI); ctx.fillStyle = color; ctx.fill();
        if (dashes) ctx.setLineDash([2 * s, 2 * s]);
        ctx.strokeStyle = cfg.ringColor; ctx.lineWidth = rw; ctx.stroke();
      }
    }
  }
  if (dashes) ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (Array.isArray(opts.angles)) {
    for (const spec of opts.angles) skDrawAngle(ctx, spec, cfg, s, width, height);
  }
  ctx.restore();
}

/** Draws one angle arc + "92°" label (see drawSkeleton2D opts.angles). */
function skDrawAngle(ctx, spec, cfg, s, width, height) {
  const slots = skAngleSlots(spec);
  if (!slots) return;
  const [a, v, b] = slots;
  if (!skFinite2(a) || !skFinite2(v) || !skFinite2(b)) return;
  const vx = SK_PX[v], vy = SK_PY[v];
  const ax = SK_PX[a] - vx, ay = SK_PY[a] - vy, bx = SK_PX[b] - vx, by = SK_PY[b] - vy;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1 || lb < 1) return;
  const ta = Math.atan2(ay, ax);
  let d = Math.atan2(by, bx) - ta;
  if (d > Math.PI) d -= TWO_PI; else if (d <= -Math.PI) d += TWO_PI;
  const value = Number.isFinite(spec.value) ? spec.value : Math.abs(d) * 180 / Math.PI;
  const r = Math.max(8 * s, Math.min(cfg.angleRadius * s, 0.6 * Math.min(la, lb)));
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.arc(vx, vy, r, ta, ta + d, d < 0); ctx.closePath();
  ctx.fillStyle = cfg.angleFill; ctx.fill();
  ctx.beginPath(); ctx.arc(vx, vy, r, ta, ta + d, d < 0);
  ctx.strokeStyle = cfg.outlineColor; ctx.lineWidth = 4 * s; ctx.stroke();
  ctx.strokeStyle = cfg.labelColor; ctx.lineWidth = 2 * s; ctx.stroke();
  // Label direction: exterior bisector (away from both bones); near-straight → away from the trunk.
  let ux = -(ax / la + bx / lb), uy = -(ay / la + by / lb), ul = Math.hypot(ux, uy);
  if (ul < 0.25) {
    ux = -ay / la; uy = ax / la; ul = 1;
    const cx = skFinite2(7) ? SK_PX[7] : vx, cy = skFinite2(7) ? SK_PY[7] : vy;
    if (ux * (vx - cx) + uy * (vy - cy) < 0) { ux = -ux; uy = -uy; }
  }
  ux /= ul; uy /= ul;
  const px = Math.round(cfg.labelSize * s);
  const text = `${Math.round(value)}°`;
  ctx.font = cfg.labelFont.replace('{px}', String(px));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = typeof ctx.measureText === 'function' ? (ctx.measureText(text)?.width || 0) : 0;
  const dist = r + 4 * s + Math.max(tw / 2, px * 0.5) * Math.abs(ux) + px * 0.55 * Math.abs(uy);
  let lx = vx + ux * dist, ly = vy + uy * dist;
  if (width > 0) lx = Math.min(Math.max(lx, tw / 2 + 2), width - tw / 2 - 2);
  if (height > 0) ly = Math.min(Math.max(ly, px / 2 + 2), height - px / 2 - 2);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cfg.labelOutline; ctx.lineWidth = 3.5 * s; ctx.strokeText(text, lx, ly);
  ctx.fillStyle = cfg.labelColor; ctx.fillText(text, lx, ly);
}

// ───────────────────────────── 3D viewer ─────────────────────────────

const V3_SHADES = 8; // cached depth-shade levels per side color
const V3_SIDE = Uint8Array.from(H_SIDE, (s) => (s === 'left' ? 1 : s === 'right' ? 2 : 0));
const V3_VIEWS = Object.freeze({
  front: Object.freeze({ yaw: 0, pitch: 0.08 }),
  side: Object.freeze({ yaw: Math.PI / 2, pitch: 0.08 }),
  top: Object.freeze({ yaw: 0, pitch: 1.5 }),
});

/** Parses '#rgb', '#rrggbb(aa)' or 'rgb()/rgba()' into [r, g, b] (0..255), else null. */
function parseRGB(c) {
  const s = typeof c === 'string' ? c.trim() : '';
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((d) => parseInt(d + d, 16));
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** Monotonic clock in ms. */
function nowMs() {
  const p = globalThis.performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
}

/** Wraps an angle into [−π, π). */
function wrapPi(a) {
  const r = (a + Math.PI) % TWO_PI;
  return (r < 0 ? r + TWO_PI : r) - Math.PI;
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * 3D viewer of the 17 Human3.6M joints drawn with the plain 2D canvas API (no WebGL, no libraries).
 * Input points are meters in MediaPipe convention (x right, y DOWN, z depth, smaller z = closer to
 * the camera); internally they become a y-up display frame (X = x, Y = −y, Z = −z).
 * - Floor: horizontal plane under the lowest support point — min(lowest ankle − 8 cm, lowest joint
 *   − 3 cm) — assuming image-down = gravity (phone upright and level). The pose is shown
 *   floor-anchored, so a squat moves the body down instead of moving the floor up.
 * - Perspective camera orbiting the pelvis axis (eased; height = middle of the body's bounding
 *   box); its distance auto-fits the whole body to the canvas. Presets via setView().
 * - Draws a subtle floor grid fading with distance, a soft vertical shadow, and bones/joints
 *   depth-sorted far→near, thicker and brighter when nearer; joints with v < minVisibility faded.
 * - Interaction: pointer drag (mouse/touch, pointer capture) orbits; double-tap/double-click →
 *   'front'. The constructor sets `touch-action: none` on the canvas (no page scroll while dragging).
 * - While the camera eases, is dragged or auto-rotates, the viewer re-renders itself with
 *   requestAnimationFrame, so the app only needs to call render() after setPose().
 * Size the canvas with CSS; resize() (auto-called through a ResizeObserver when available) reads
 * its CSS box and devicePixelRatio. render() costs well under 1 ms of JS for 17 joints.
 */
class View3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {{left?:string, right?:string, axial?:string, axis?:string}} [opts.colors] limb colors (`axis` = alias of `axial`)
   * @param {string} [opts.background='#0E1318'] CSS color; 'transparent' or 'rgba(0,0,0,0)' shows what is behind
   * @param {boolean} [opts.grid=true] floor grid, light spot and shadow
   * @param {boolean} [opts.autoRotate=false] slow turntable rotation when not dragging
   * @param {number} [opts.minVisibility=0.5] joints/bones below are drawn faded
   * @param {'front'|'side'|'top'} [opts.view='front'] initial view
   */
  constructor(canvas, opts = {}) {
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) throw new TypeError('View3D: a canvas with a 2D context is required');
    const cfg = SKELETON_CONFIG.view3D;
    /** @type {HTMLCanvasElement} */ this.canvas = canvas;
    /** @type {CanvasRenderingContext2D} */ this.ctx = ctx;
    /** Options in effect. */
    this.opts = {
      grid: opts.grid !== false, autoRotate: !!opts.autoRotate, background: opts.background ?? cfg.background,
      minVisibility: opts.minVisibility ?? SKELETON_CONFIG.minVisibility,
    };
    this.setColors(opts.colors);
    this._gridStyles = cfg.gridAlphas.map((a) => `rgba(${cfg.gridRGB},${a})`);
    this._spotGrad = null;
    // Pose in the display frame (X right, Y up, Z toward the front camera) + visibility.
    this._P = new Float64Array(51).fill(NaN);
    this._V = new Float64Array(17);
    this._hasPose = false;
    this._fresh = true; // next pose snaps camera target/fit instead of easing
    // Scratch buffers: screen coords/depth of joints and their floor shadows, grid lattice, sort.
    this._sx = new Float64Array(17); this._sy = new Float64Array(17); this._sd = new Float64Array(17);
    this._hx = new Float64Array(17); this._hy = new Float64Array(17);
    const M = 2 * Math.round(cfg.gridHalf / cfg.gridStep) + 1;
    this._gx = new Float64Array(M * M); this._gy = new Float64Array(M * M);
    this._order = new Int16Array(33); this._depth = new Float64Array(33);
    this._ps = new Float64Array(2);  // last projection result (sx, sy)
    this._cam = new Float64Array(12); // camera position, right, up, back (unit vectors)
    // Camera state (current + target), all eased in render().
    const v0 = V3_VIEWS[opts.view] || V3_VIEWS.front;
    this._yaw = this._tyaw = v0.yaw;
    this._pitch = this._tpitch = v0.pitch;
    this._dist = this._need = 3.6;
    this._cx = 0; this._cy = 0.85; this._cz = 0; this._floor = -0.95;
    this._w = 0; this._h = 0; this._dpr = 1; this._f = 1;
    this._lastT = NaN; this._lastRender = -Infinity; this._raf = 0;
    this._drag = null; this._tap = null; this._destroyed = false;
    const st = canvas.style;
    if (st) {
      st.touchAction = 'none'; st.userSelect = 'none'; st.webkitUserSelect = 'none';
      st.webkitTapHighlightColor = 'transparent';
    }
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('pointerdown', this._onDown);
      canvas.addEventListener('pointermove', this._onMove);
      canvas.addEventListener('pointerup', this._onUp);
      canvas.addEventListener('pointercancel', this._onUp);
    }
    this._ro = null;
    if (typeof globalThis.ResizeObserver === 'function') {
      this._ro = new globalThis.ResizeObserver(() => { if (this.resize()) this.render(); });
      this._ro.observe(canvas);
    }
    this.resize();
  }

  /**
   * Sets limb colors (`axis` accepted as alias of `axial`). Colors that are not hex/rgb() are used
   * as-is, without depth shading.
   * @param {{left?:string, right?:string, axial?:string, axis?:string}} [colors]
   */
  setColors(colors) {
    const c = resolveColors(colors), dark = SKELETON_CONFIG.view3D.depthDarken;
    this._shade = [c.axial, c.left, c.right].map((css) => {
      const rgb = parseRGB(css);
      return Array.from({ length: V3_SHADES }, (_, k) => {
        if (!rgb) return css;
        const f = 1 - dark * k / (V3_SHADES - 1);
        return `rgb(${Math.round(rgb[0] * f)},${Math.round(rgb[1] * f)},${Math.round(rgb[2] * f)})`;
      });
    });
  }

  /**
   * Sets the pose to show (values are copied). Call render() afterwards.
   * @param {Array<{x:number, y:number, z?:number, v?:number, visibility?:number}|number[]>|null} points17
   *   17 H36M joints in meters, MediaPipe convention (x right, y DOWN, z depth; smaller z = closer),
   *   root-relative or not; `[x, y, z]` arrays also accepted. Missing/NaN joints are skipped; null clears.
   */
  setPose(points17) {
    let n = 0;
    for (let i = 0; i < 17; i++) {
      const p = points17 ? points17[i] : null;
      const arr = Array.isArray(p);
      const x = p == null ? NaN : arr ? p[0] : p.x, y = p == null ? NaN : arr ? p[1] : p.y;
      const z0 = p == null ? NaN : arr ? p[2] : p.z, z = Number.isFinite(z0) ? z0 : 0;
      const ok = Number.isFinite(x) && Number.isFinite(y);
      this._P[3 * i] = ok ? x : NaN; this._P[3 * i + 1] = ok ? -y : NaN; this._P[3 * i + 2] = ok ? -z : NaN;
      const v = p && !arr ? (p.v ?? p.visibility ?? 1) : 1;
      this._V[i] = Number.isFinite(v) ? v : 1;
      if (ok) n++;
    }
    this._hasPose = n >= 2;
    if (!this._hasPose) this._fresh = true;
  }

  /**
   * Eases the camera to a preset: 'front' = the phone camera's point of view (unmirrored, slightly
   * raised to show the floor), 'side' = orbited 90° to the camera's right, 'top' = from above with
   * the phone at the bottom of the screen. Unknown names are ignored.
   * @param {'front'|'side'|'top'} name
   * @param {{instant?: boolean}} [o] instant = jump without easing
   */
  setView(name, o = {}) {
    const v = V3_VIEWS[name];
    if (!v) return;
    this._tyaw = this._yaw + wrapPi(v.yaw - this._yaw);
    this._tpitch = v.pitch;
    if (o.instant) { this._yaw = this._tyaw; this._pitch = this._tpitch; }
    this._kick();
  }

  /**
   * Camera snapshot: current yaw/pitch (radians), the angles it eases toward (goalYaw/goalPitch),
   * distance (m) and orbit target (display frame: y up, floor at 0).
   * @returns {{yaw:number, pitch:number, goalYaw:number, goalPitch:number, distance:number, target:number[]}}
   */
  get camera() {
    return {
      yaw: this._yaw, pitch: this._pitch, goalYaw: this._tyaw, goalPitch: this._tpitch,
      distance: this._dist, target: [this._cx, this._cy, this._cz],
    };
  }

  /**
   * Re-reads the canvas CSS size and devicePixelRatio (capped at 3) and resizes the backing store.
   * Without DOM sizing (e.g. tests) it uses canvas.width/height at ratio 1.
   * @returns {boolean} true if the CSS size or pixel ratio changed
   */
  resize() {
    const c = this.canvas;
    const dom = typeof c.clientWidth === 'number';
    const w = dom ? c.clientWidth : (c.width || 0), h = dom ? c.clientHeight : (c.height || 0);
    const dpr = dom ? Math.min(3, globalThis.devicePixelRatio || 1) : 1;
    const changed = w !== this._w || h !== this._h || dpr !== this._dpr;
    this._w = w; this._h = h; this._dpr = dpr;
    if (dom && w > 0 && h > 0) {
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (c.width !== bw) c.width = bw;
      if (c.height !== bh) c.height = bh;
      // A canvas without CSS size follows its attributes: pin it to avoid a resize feedback loop.
      if (c.style && (c.clientWidth !== w || c.clientHeight !== h)) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
    }
    return changed;
  }

  /** Removes listeners and observers and cancels pending frames (the canvas is left as is). */
  destroy() {
    this._destroyed = true;
    const c = this.canvas;
    if (typeof c.removeEventListener === 'function') {
      c.removeEventListener('pointerdown', this._onDown);
      c.removeEventListener('pointermove', this._onMove);
      c.removeEventListener('pointerup', this._onUp);
      c.removeEventListener('pointercancel', this._onUp);
    }
    if (this._raf && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(this._raf);
    this._raf = 0; this._drag = null;
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  /** @private */
  _pointerDown(e) {
    if (this._drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: nowMs(), moved: false };
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable: drag still works inside */ }
    if (e.cancelable !== false) e.preventDefault?.();
  }

  /** @private */
  _pointerMove(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const cfg = SKELETON_CONFIG.view3D;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > cfg.tapSlopPx) d.moved = true;
    const k = cfg.dragPerSide / Math.max(100, Math.min(this._w, this._h) || 0);
    this._yaw = this._tyaw = this._yaw - dx * k;
    this._pitch = this._tpitch = clamp(this._pitch + dy * k, cfg.pitchMin, cfg.pitchMax);
    this._kick();
  }

  /** @private pointerup / pointercancel; two quick taps → setView('front'). */
  _pointerUp(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    this._drag = null;
    try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    const cfg = SKELETON_CONFIG.view3D, t = nowMs();
    if (e.type !== 'pointerup' || d.moved || t - d.t0 > cfg.tapMaxMs) { this._tap = null; return; }
    const p = this._tap;
    if (p && t - p.t < cfg.doubleTapMs && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 3 * cfg.tapSlopPx) {
      this._tap = null;
      this.setView('front');
    } else {
      this._tap = { t, x: e.clientX, y: e.clientY };
    }
  }

  /**
   * Draws one frame: background, floor (light spot + fading grid + shadow) and the skeleton.
   * Eases the camera by the time since the previous render (capped at 0.1 s) and keeps rendering
   * itself on animation frames while the camera moves. Never throws on partial poses.
   */
  render() {
    if (this._destroyed) return;
    if (!(this._w > 0 && this._h > 0)) {
      this.resize();
      if (!(this._w > 0 && this._h > 0)) return;
    }
    const t = nowMs();
    const dt = Number.isFinite(this._lastT) ? clamp((t - this._lastT) / 1000, 0, 0.1) : 0;
    this._lastT = t;
    this._lastRender = t;
    this._update(dt);
    const ctx = this.ctx, bg = this.opts.background;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this._w, this._h);
    if (bg && bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, this._w, this._h); }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.opts.grid) this._drawFloor(ctx);
    if (this._hasPose) this._drawPose(ctx);
    ctx.globalAlpha = 1;
    if (this._animating()) this._kick();
  }

  /** @private Eases angles, target and fit distance; computes the floor and the camera basis. */
  _update(dt) {
    const cfg = SKELETON_CONFIG.view3D, P = this._P, C = this._cam;
    const ease = (tau) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
    if (!this._drag) {
      if (this.opts.autoRotate) this._tyaw += cfg.autoRotateSpeed * dt;
      this._yaw += wrapPi(this._tyaw - this._yaw) * ease(cfg.easeSeconds);
      this._pitch += (this._tpitch - this._pitch) * ease(cfg.easeSeconds);
      if (Math.abs(wrapPi(this._tyaw - this._yaw)) < 1e-4) this._yaw = this._tyaw;
      if (Math.abs(this._tpitch - this._pitch) < 1e-4) this._pitch = this._tpitch;
    }
    const cy = Math.cos(this._yaw), sy = Math.sin(this._yaw), cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
    C[3] = cy; C[4] = 0; C[5] = -sy;             // right (horizontal)
    C[9] = sy * cp; C[10] = sp; C[11] = cy * cp; // back: target → camera
    C[6] = C[10] * C[5] - C[11] * C[4];          // up = back × right
    C[7] = C[11] * C[3] - C[9] * C[5];
    C[8] = C[9] * C[4] - C[10] * C[3];
    this._f = 0.5 * Math.min(this._w, this._h) / Math.tan(cfg.fovDeg * Math.PI / 360);
    if (this._hasPose) {
      let lowAll = Infinity, lowAnkle = Infinity;
      for (let i = 0; i < 17; i++) {
        const y = P[3 * i + 1];
        if (y < lowAll) lowAll = y;
        if ((i === 3 || i === 6) && y < lowAnkle) lowAnkle = y;
      }
      const fl = this._floor = Math.min(lowAnkle - cfg.ankleHeight, lowAll - cfg.floorClearance);
      // Target: pelvis X/Z (centroid if missing); height = middle of the floor-anchored bounding box.
      let tx = P[0], tz = P[2], top = 0, n = 0, mx = 0, mz = 0;
      for (let i = 0; i < 17; i++) {
        if (!Number.isFinite(P[3 * i])) continue;
        mx += P[3 * i]; mz += P[3 * i + 2]; n++;
        top = Math.max(top, P[3 * i + 1] - fl);
      }
      if (!Number.isFinite(tx)) { tx = mx / n; tz = mz / n; }
      const k = this._fresh ? 1 : ease(cfg.followSeconds);
      this._cx += (tx - this._cx) * k; this._cy += (top / 2 - this._cy) * k; this._cz += (tz - this._cz) * k;
      // Fit: smallest distance keeping every joint inside framing × half-viewport (and minDepth ahead).
      const ex = (this._w / 2) / this._f * cfg.framing, ey = (this._h / 2) / this._f * cfg.framing;
      let need = cfg.minDistance, rad = 0;
      for (let i = 0; i < 17; i++) {
        if (!Number.isFinite(P[3 * i])) continue;
        const px = P[3 * i] - this._cx, py = P[3 * i + 1] - fl - this._cy, pz = P[3 * i + 2] - this._cz;
        rad = Math.max(rad, Math.hypot(px, py, pz));
        const a = Math.abs(px * C[3] + py * C[4] + pz * C[5]) / ex;
        const b = Math.abs(px * C[6] + py * C[7] + pz * C[8]) / ey;
        const d = Math.max(a, b, cfg.minDepth) + px * C[9] + py * C[10] + pz * C[11];
        if (d > need) need = d;
      }
      this._need = need = Math.min(Math.max(need, cfg.radiusDistance * rad), cfg.maxDistance);
      this._dist += (need - this._dist) * (this._fresh ? 1 : ease(need > this._dist ? cfg.easeSeconds : cfg.fitSeconds));
      this._fresh = false;
    }
    C[0] = this._cx + this._dist * C[9];
    C[1] = this._cy + this._dist * C[10];
    C[2] = this._cz + this._dist * C[11];
  }

  /**
   * @private Projects a display point (Y measured from the floor) into this._ps (CSS px).
   * @returns {number} depth in meters, NaN when behind the near plane (this._ps then NaN)
   */
  _proj(X, Y, Z) {
    const C = this._cam, ps = this._ps;
    const qx = X - C[0], qy = Y - C[1], qz = Z - C[2];
    const depth = -(qx * C[9] + qy * C[10] + qz * C[11]);
    if (!(depth > SKELETON_CONFIG.view3D.near)) { ps[0] = NaN; ps[1] = NaN; return NaN; }
    const k = this._f / depth;
    ps[0] = this._w / 2 + (qx * C[3] + qy * C[4] + qz * C[5]) * k;
    ps[1] = this._h / 2 - (qx * C[6] + qy * C[7] + qz * C[8]) * k;
    return depth;
  }

  /** @private Light spot and circular grid (fading with distance) on the floor plane Y = 0. */
  _drawFloor(ctx) {
    const cfg = SKELETON_CONFIG.view3D, C = this._cam, ps = this._ps, R = cfg.gridHalf;
    const cx = this._cx, cz = this._cz;
    if (typeof ctx.createRadialGradient === 'function') {
      if (!this._spotGrad) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, `rgba(${cfg.gridRGB},${cfg.spotAlpha})`);
        g.addColorStop(1, `rgba(${cfg.gridRGB},0)`);
        this._spotGrad = g;
      }
      // No camera roll → the projected disc is close to an axis-aligned ellipse.
      const r = 0.8 * R, hl = Math.hypot(C[9], C[11]) || 1, bx = r * C[9] / hl, bz = r * C[11] / hl;
      this._proj(cx - r * C[3], 0, cz - r * C[5]); const xL = ps[0];
      this._proj(cx + r * C[3], 0, cz + r * C[5]); const xR = ps[0];
      this._proj(cx + bx, 0, cz + bz); const yN = ps[1];
      this._proj(cx - bx, 0, cz - bz); const yF = ps[1];
      const rx = Math.abs(xR - xL) / 2, ry = Math.abs(yN - yF) / 2;
      if (rx > 1 && ry > 0.5) {
        ctx.save();
        ctx.translate((xL + xR) / 2, (yN + yF) / 2);
        ctx.scale(rx, ry);
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, TWO_PI);
        ctx.fillStyle = this._spotGrad; ctx.fill();
        ctx.restore();
      }
    }
    const step = cfg.gridStep, N = Math.round(R / step), M = 2 * N + 1, gx = this._gx, gy = this._gy;
    const ox = Math.round(cx / step) * step, oz = Math.round(cz / step) * step;
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        this._proj(ox + (i - N) * step, 0, oz + (j - N) * step);
        gx[i * M + j] = ps[0]; gy[i * M + j] = ps[1];
      }
    }
    const nb = this._gridStyles.length, half = step / 2;
    ctx.lineWidth = 1;
    for (let b = 0; b < nb; b++) { // one path per fade ring
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < M; j++) {
          const k = i * M + j;
          if (gx[k] !== gx[k]) continue; // NaN: behind the camera
          const x0 = ox + (i - N) * step - cx, z0 = oz + (j - N) * step - cz;
          if (i + 1 < M && gx[k + M] === gx[k + M] && Math.floor(Math.hypot(x0 + half, z0) / R * nb) === b) {
            ctx.moveTo(gx[k], gy[k]); ctx.lineTo(gx[k + M], gy[k + M]); any = true;
          }
          if (j + 1 < M && gx[k + 1] === gx[k + 1] && Math.floor(Math.hypot(x0, z0 + half) / R * nb) === b) {
            ctx.moveTo(gx[k], gy[k]); ctx.lineTo(gx[k + 1], gy[k + 1]); any = true;
          }
        }
      }
      if (any) { ctx.strokeStyle = this._gridStyles[b]; ctx.stroke(); }
    }
  }

  /** @private Soft shadow, then bones, joints and head depth-sorted far → near. */
  _drawPose(ctx) {
    const cfg = SKELETON_CONFIG.view3D, P = this._P, V = this._V, fl = this._floor, f = this._f, ps = this._ps;
    const sx = this._sx, sy = this._sy, sd = this._sd, hx = this._hx, hy = this._hy;
    const order = this._order, depth = this._depth, minVis = this.opts.minVisibility;
    let dmin = Infinity, dmax = -Infinity;
    for (let i = 0; i < 17; i++) {
      const X = P[3 * i], Z = P[3 * i + 2];
      const d = sd[i] = this._proj(X, P[3 * i + 1] - fl, Z);
      sx[i] = ps[0]; sy[i] = ps[1];
      if (d < dmin) dmin = d;
      if (d > dmax) dmax = d;
      this._proj(X, 0, Z); hx[i] = ps[0]; hy[i] = ps[1];
    }
    if (!(dmax >= dmin)) return;
    const span = dmax - dmin > 1e-6 ? dmax - dmin : 1;
    const boneW = (d) => clamp(2 * cfg.boneRadius * f / d, cfg.minPx, cfg.maxPx);
    if (this.opts.grid) { // shadow: bones dropped vertically onto the floor, two soft passes
      ctx.beginPath();
      let any = false;
      for (let i = 1; i < 17; i++) {
        const a = H36M_PARENTS[i];
        if (i !== 10 && hx[a] === hx[a] && hx[i] === hx[i]) { ctx.moveTo(hx[a], hy[a]); ctx.lineTo(hx[i], hy[i]); any = true; }
      }
      if (any) {
        const w = 1.5 * boneW(this._dist);
        ctx.strokeStyle = '#000';
        ctx.globalAlpha = 0.45 * cfg.shadowAlpha; ctx.lineWidth = 2.4 * w; ctx.stroke();
        ctx.globalAlpha = cfg.shadowAlpha; ctx.lineWidth = w; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // Head: sphere around mid(neck_nose, head top); replaces the 9→10 bone and the joint-9 dot.
    let hd = NaN, hsx = NaN, hsy = NaN, hr = 0, hm = cfg.headRadius;
    const ok9 = Number.isFinite(P[27]), ok10 = Number.isFinite(P[30]);
    if (ok9 || ok10) {
      const i0 = ok9 ? 9 : 10, i1 = ok10 ? 10 : 9;
      hd = this._proj((P[3 * i0] + P[3 * i1]) / 2, (P[3 * i0 + 1] + P[3 * i1 + 1]) / 2 - fl, (P[3 * i0 + 2] + P[3 * i1 + 2]) / 2);
      hsx = ps[0]; hsy = ps[1];
      const len = Math.hypot(P[27] - P[30], P[28] - P[31], P[29] - P[32]);
      hm = clamp(Number.isFinite(len) ? 0.6 * len : cfg.headRadius, 0.07, 0.13);
      hr = clamp(hm * f / hd, 2.5, 60);
    }
    // Items: 0..15 bones (child joint = item + 1), 16..32 joints; invisible → −∞ (sorted last).
    for (let i = 1; i < 17; i++) {
      const d = i === 10 ? NaN : (sd[H36M_PARENTS[i]] + sd[i]) / 2;
      depth[i - 1] = d === d ? d : -Infinity;
    }
    for (let j = 0; j < 17; j++) {
      const d = j === 9 ? NaN : j === 10 ? hd - hm : sd[j] - cfg.jointRadius;
      depth[16 + j] = d === d ? d : -Infinity;
    }
    skSortFarFirst(order, depth, 33);
    for (let n = 0; n < 33; n++) {
      const it = order[n], dd = depth[it];
      if (dd === -Infinity) break;
      const lvl = Math.round(clamp((dd - dmin) / span, 0, 1) * (V3_SHADES - 1));
      if (it < 16) {
        const b = it + 1, a = H36M_PARENTS[b], w = boneW(dd);
        ctx.globalAlpha = Math.min(V[a], V[b]) < minVis ? cfg.fadedAlpha : 1;
        ctx.beginPath(); ctx.moveTo(sx[a], sy[a]); ctx.lineTo(sx[b], sy[b]);
        ctx.strokeStyle = cfg.outline; ctx.lineWidth = w + 2; ctx.stroke();
        ctx.strokeStyle = this._shade[V3_SIDE[b]][lvl]; ctx.lineWidth = w; ctx.stroke();
        if (w >= 4) { // glossy stripe: reads as a tube
          const o = 0.18 * w;
          ctx.beginPath(); ctx.moveTo(sx[a] - o, sy[a] - o); ctx.lineTo(sx[b] - o, sy[b] - o);
          ctx.strokeStyle = cfg.gloss; ctx.lineWidth = 0.3 * w; ctx.stroke();
        }
      } else {
        const j = it - 16, head = j === 10;
        const r = head ? hr : clamp(cfg.jointRadius * f / sd[j], cfg.minPx, 0.6 * cfg.maxPx);
        ctx.globalAlpha = V[j] < minVis ? cfg.fadedAlpha : 1;
        ctx.beginPath(); ctx.arc(head ? hsx : sx[j], head ? hsy : sy[j], r, 0, TWO_PI);
        ctx.fillStyle = this._shade[V3_SIDE[j]][lvl]; ctx.fill();
        ctx.strokeStyle = cfg.ring; ctx.lineWidth = head ? 1.5 : Math.max(1, 0.3 * r); ctx.stroke();
      }
    }
  }

  /** @private True while the camera still moves by itself (easing, auto-rotation, fit). */
  _animating() {
    return this.opts.autoRotate || this._yaw !== this._tyaw || this._pitch !== this._tpitch
      || Math.abs(this._need - this._dist) > 0.005 * this._dist;
  }

  /** @private Schedules a self-driven render on the next animation frame (browsers only). */
  _kick() {
    if (this._raf || this._destroyed || typeof globalThis.requestAnimationFrame !== 'function') return;
    this._raf = globalThis.requestAnimationFrame(() => {
      this._raf = 0;
      if (nowMs() - this._lastRender > 12) this.render();
      else if (this._animating()) this._kick();
    });
  }
}

// ───────────────────────────── 2D → 3D lifters ─────────────────────────────

/**
 * Creates a 2D→3D lifter. Both kinds share one interface:
 * `{ kind, ready, push(frame), lift(frame) → points | null, liftAsync(frame?) → Promise<points | null>, reset() }`
 * where points = 17 Human3.6M joints `{x, y, z, v}` in meters, MediaPipe axes (x right, y DOWN,
 * z depth), origin at the pelvis (= mid-hips), ready for View3D#setPose.
 * - 'mediapipe' (v0): `lift(frame)` = blazeposeToH36M(frame.world); null when frame.world is
 *   missing. Stateless, always ready.
 * - 'videopose3d' (phase 2): a {@link VideoPose3DLifter} (opts as its constructor); returns null
 *   until an ONNX session is set with setSession(). Weights are CC BY-NC 4.0 (non-commercial).
 * @param {'mediapipe'|'videopose3d'} [kind='mediapipe']
 * @param {object} [opts] VideoPose3DLifter options
 * @returns {{kind:string, ready:boolean, push:Function, lift:Function, liftAsync:Function, reset:Function}}
 */
function createLifter(kind = 'mediapipe', opts = {}) {
  if (kind === 'videopose3d') return new VideoPose3DLifter(opts);
  if (kind !== 'mediapipe') throw new RangeError(`createLifter: unknown kind "${kind}"`);
  const lift = (frame) => (frame && Array.isArray(frame.world) && frame.world.length ? blazeposeToH36M(frame.world) : null);
  let last = null;
  return {
    kind: 'mediapipe',
    ready: true,
    push(frame) { last = frame || null; },
    lift,
    async liftAsync(frame) { return lift(frame || last); },
    reset() { last = null; },
  };
}

/**
 * Phase-2 lifter: VideoPose3D (Pavllo et al., CVPR 2019 — temporal dilated convolutions over 2D
 * keypoints) exported to ONNX with `tools/export_videopose3d_onnx.py` and run with onnxruntime-web.
 * Input: COCO-17 keypoints (taken from BlazePose `lm`) of the last `receptiveField` frames,
 * normalized like VideoPose3D (normalizeScreenCoordinates on a nominal refHeight·aspect × refHeight
 * image; the result does not depend on refHeight). Model I/O: `[1, RF, 17, 2]` → `[1, 1, 17, 3]`.
 * Output: 17 H36M joints in VideoPose3D camera space (meters, root-relative, x right, y down,
 * z forward — the same axes and handedness as MediaPipe world), returned root-centred.
 *
 * LICENSE AND VALIDITY: the pretrained weights (`pretrained_h36m_detectron_coco.bin`) are
 * CC BY-NC 4.0 — non-commercial use only. They were trained on Human3.6M (upright everyday actions,
 * 4 fixed cameras, 50 fps) and have never seen push-ups, planks or other floor exercises: phase 2
 * must fine-tune and/or validate the model on FitGram footage before any result relies on it.
 *
 * Timing: the reference (symmetric) checkpoint predicts the CENTRE frame of its window. With
 * `window: 'causal'` (default; exact for a model trained with causal=True) the window is the last RF
 * frames, so a symmetric model lags (RF−1)/2 frames (4 s at 30 fps for RF 243). `window: 'edge'`
 * centres the newest frame and repeats it over the future half (VideoPose3D's edge padding at the
 * end of a sequence): no lag, somewhat less accurate. Not done here: VideoPose3D's flip test-time
 * augmentation, and resampling 30 fps input to the 50 fps training rate.
 */
class VideoPose3DLifter {
  /**
   * @param {{receptiveField?: 243|81|27, refHeight?: number, window?: 'causal'|'edge'}} [opts]
   */
  constructor(opts = {}) {
    const d = SKELETON_CONFIG.lifter;
    const rf = opts.receptiveField ?? d.receptiveField;
    if (![27, 81, 243].includes(rf)) throw new RangeError('VideoPose3DLifter: receptiveField must be 27, 81 or 243');
    /** @type {'videopose3d'} */ this.kind = 'videopose3d';
    /** Frames of 2D context per prediction (3^blocks). @type {number} */ this.receptiveField = rf;
    /** Nominal frame height (px) for the pixel → normalized conversion. @type {number} */
    this.refHeight = opts.refHeight ?? d.refHeight;
    /** Window alignment, see the class description. @type {'causal'|'edge'} */
    this.window = opts.window === 'edge' ? 'edge' : 'causal';
    /** True once setSession() was called. @type {boolean} */ this.ready = false;
    /** onnxruntime-web InferenceSession (null until set). */ this.session = null;
    /** onnxruntime-web namespace (null until set). */ this.ort = null;
    /** Last inference error from lift() (null if none). */ this.error = null;
    this._buf = new Float32Array(rf * 34); // ring buffer: normalized COCO-17 (x, y) per frame
    this._head = 0;  // next slot to write
    this._count = 0; // frames stored (≤ rf)
    this._vis = null; // H36M visibilities of the newest frame
    this._last = null;
    this._lastPushT = NaN;
    this._busy = false;
  }

  /** Frames currently buffered (≤ receptiveField). @type {number} */
  get length() {
    return this._count;
  }

  /** Clears the buffered frames and the last result (new clip or session). */
  reset() {
    this._head = 0; this._count = 0; this._vis = null; this._last = null; this._lastPushT = NaN;
  }

  /**
   * Appends one frame to the ring buffer. Ignored: frames without 33 landmarks and a frame with the
   * same `t` as the previous push (so calling lift() twice for one frame is harmless). A non-finite
   * coordinate repeats the previous frame's value (0 for the first frame).
   * @param {{t?: number, lm: Array<{x:number, y:number, visibility?:number}>, aspect: number}} frame PoseFrame
   * @returns {boolean} true if the frame was added
   */
  push(frame) {
    const lm = frame && frame.lm;
    if (!Array.isArray(lm) || lm.length < 33) return false;
    if (Number.isFinite(frame.t) && frame.t === this._lastPushT) return false;
    this._lastPushT = frame.t;
    const aspect = Number.isFinite(frame.aspect) && frame.aspect > 0 ? frame.aspect : 1;
    const h = this.refHeight, w = h * aspect;
    const px = COCO17_FROM_BLAZEPOSE.map((i) => (lm[i] ? [lm[i].x * w, lm[i].y * h] : [NaN, NaN]));
    const xy = normalizeScreenCoordinates(px, w, h);
    const rf = this.receptiveField, o = this._head * 34, prev = ((this._head + rf - 1) % rf) * 34;
    for (let k = 0; k < 34; k++) {
      const v = xy[k >> 1][k & 1];
      this._buf[o + k] = Number.isFinite(v) ? v : (this._count ? this._buf[prev + k] : 0);
    }
    this._head = (this._head + 1) % rf;
    this._count = Math.min(this._count + 1, rf);
    this._vis = blazeposeToH36M(lm).map((p) => p.v);
    return true;
  }

  /**
   * The model input for the buffered frames, oldest → newest: Float32Array(RF × 17 × 2).
   * 'causal': the last RF frames, left-padded by repeating the oldest while fewer are buffered.
   * 'edge': the last (RF+1)/2 frames (left-padded the same way), then (RF−1)/2 copies of the newest.
   * @returns {Float32Array|null} null when no frame was pushed
   */
  inputData() {
    const rf = this.receptiveField, n = this._count;
    if (!n) return null;
    const out = new Float32Array(rf * 34);
    const past = this.window === 'edge' ? (rf + 1) / 2 : rf; // window slots up to the newest frame
    const oldest = (this._head - n + rf) % rf;
    for (let k = 0; k < rf; k++) {
      const idx = clamp(k + n - past, 0, n - 1); // stored frame for slot k (edge-padded both sides)
      const slot = ((oldest + idx) % rf) * 34;
      out.set(this._buf.subarray(slot, slot + 34), k * 34);
    }
    return out;
  }

  /**
   * Sets the ONNX session, e.g. `lifter.setSession(await ort.InferenceSession.create(url), ort)`.
   * @param {{inputNames: string[], outputNames?: string[], run: Function}} session onnxruntime-web InferenceSession
   * @param {{Tensor: Function}} ort the onnxruntime-web namespace (used as `new ort.Tensor('float32', data, dims)`)
   */
  setSession(session, ort) {
    if (!session || typeof session.run !== 'function' || !ort || typeof ort.Tensor !== 'function') {
      throw new TypeError('VideoPose3DLifter.setSession: an InferenceSession and the ort namespace are required');
    }
    this.session = session;
    this.ort = ort;
    this.ready = true;
  }

  /**
   * Runs the model on the buffered window (pushing `frame` first when given).
   * @param {object} [frame] PoseFrame to push before running
   * @returns {Promise<Array<{x:number, y:number, z:number, v:number}>|null>} 17 H36M joints, meters,
   *   MediaPipe axes, pelvis at the origin, v = visibility of the newest 2D frame; null when not ready or empty
   */
  async liftAsync(frame) {
    if (frame) this.push(frame);
    if (!this.ready || !this._count) return null;
    const rf = this.receptiveField, s = this.session;
    const input = new this.ort.Tensor('float32', this.inputData(), [1, rf, 17, 2]);
    const results = await s.run({ [s.inputNames[0]]: input });
    const name = s.outputNames && s.outputNames[0];
    const tensor = (name && results[name]) || Object.values(results)[0];
    const data = tensor && tensor.data;
    if (!data || data.length < 51) return null;
    const o = data.length - 51; // newest frame if the model returned several
    const pts = new Array(17);
    for (let j = 0; j < 17; j++) {
      pts[j] = {
        x: data[o + 3 * j] - data[o], y: data[o + 3 * j + 1] - data[o + 1], z: data[o + 3 * j + 2] - data[o + 2],
        v: this._vis ? this._vis[j] : 1,
      };
    }
    this._last = pts;
    return pts;
  }

  /**
   * Synchronous facade with the same signature as the 'mediapipe' lifter: pushes `frame`, starts an
   * inference if none is running and returns the latest finished result (null until the first).
   * @param {object} frame PoseFrame
   * @returns {Array<{x:number, y:number, z:number, v:number}>|null}
   */
  lift(frame) {
    this.push(frame);
    if (this.ready && !this._busy) {
      this._busy = true;
      this.liftAsync()
        .then((p) => { if (p) this._last = p; this.error = null; }, (e) => { this.error = e; })
        .finally(() => { this._busy = false; });
    }
    return this._last;
  }
}

export { SKELETON_CONFIG, BP, H36M, COCO17_FROM_BLAZEPOSE, toJoints, blazeposeToH36M, normalizeScreenCoordinates, imageCoordinates, OneEuroFilter, PoseSmoother, makeCoverProjection, drawSkeleton2D, View3D, createLifter, VideoPose3DLifter };
