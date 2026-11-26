// FitGram synthetic pose generator: deterministic side-view PoseFrames (push-ups, squats, plank, pull-ups, dips) for
// the tests and the demo mode. Scene frame (meters): x right along the floor, y DOWN (gravity), floor at y = 0 (body
// points have y < 0), z = depth away from the level camera (near body side at -zSide). Cameras are [centerX, centerY,
// distance]: a pinhole looking at (centerX, centerY, 0). opts.cameraRoll / cameraPitch (deg) turn that camera about its
// optical axis / its x axis while it keeps looking at the same point, so lm are projected with the turned camera and
// world landmarks (scene points - mid-hips) are expressed in its axes, like MediaPipe's. Gravity in camera axes is then
// (sin r·cos p, cos r·cos p, -sin p): roll = atan2(down.x, down.y), pitch = asin(-down.z) as in orientation.js.
// Output: { frames: PoseFrame[], fps, meta } with the expected analyzer outcome in meta (see synthSession).

/** Tunable constants of the generator: body model (m), camera, noise defaults and per-test motion timing. */
const SYNTH_CONFIG = Object.freeze({
  fps: 30, noise: 0.004, seed: 1, aspect: 9 / 16,
  vfov: 63,              // vertical field of view (deg), typical phone main camera in portrait
  zSide: 0.15,           // depth offset of the near (-) / far (+) body side (m)
  farShift: 0.025,       // far-side joints are drawn this far to the right so the limbs do not overlap exactly
  visNear: 0.95, visFar: 0.7, visHidden: 0.1,
  arm1: 0.30, arm2: 0.27, thigh: 0.45, shank: 0.43, torso: 0.50, neck: 0.20,
  pushup: Object.freeze({ repDur: 1.6, rest: 0.45, top: 165, bottom: 75, shallow: 115, noLockout: 130, wobble: 132,
    sag: 0.12, pike: -0.15, lead: 1, tail: 1, cam: [0.62, -0.45, 3.4], camKnees: [0.2, -0.45, 3.4] }),
  squat: Object.freeze({ repDur: 2.0, rest: 0.5, top: 172, bottom: 65, shallow: 125, noLockout: 140, wobble: 142,
    leanTop: 3, leanBottom: 35, lead: 1, tail: 1, cam: [0.1, -0.9, 3.0] }),
  plank: Object.freeze({ breath: 0.004, breathPeriod: 4.2, ramp: 0.5, sagDepth: 0.14, sagDur: 3,
    collapseDur: 1.2,
    cueWindow: 5, cueLag: 1.45, restoreLag: 0.8, collapseLag: 1.45,   // forecast only: CONTRACT cue window; measured lags of the analyzer (s)
    collapse: Object.freeze({ hip: 0.23, knee: 0.21, ankle: 0.22 }), cam: [0.45, -0.4, 3.4] }),
  // Pull-up: the timeline variable is the lift (0 = dead hang, 1 = clean top with the chin ~5 cm over the bar).
  // Bar 2.3 m high, wrist 8 cm under the bar centre, grip half-width 0.26 m (slightly wider than the shoulders);
  // the arm is a planar chain whose joints sit at fixed lateral offsets (3D limb lengths exact). shallow = chin
  // ~11 cm under the bar; noLockout = elbow ~131 deg at the bottom; wobble = elbow dips to ~138 deg (not an attempt).
  pullup: Object.freeze({ repDur: 2.6, rest: 0.6, top: 0, bottom: 1, shallow: 0.7, noLockout: 0.09, wobble: 0.065,
    lead: 1, tail: 1, bar: 2.3, wristDrop: 0.08, grip: 0.26, elbowLat: 0.21, hang: 176, topBack: 0.088, topBelow: 0.06,
    lean: 12, hollow: 10, knee: 170, headBack: 15, kipHip: 70, kipKnee: 60, kipSwing: 12, releaseDur: 1.0,
    cam: [0, -1.3, 3.0] }),
  // Dip: the timeline variable is the 3D elbow angle. Bars 1.35 m high, wrist 4.5 cm above the bar centre, hands
  // 0.24 m to each side; the forearm leans back up to 10 deg, the torso leans forward 5 -> 25 deg, knees bent 100 deg
  // with the feet behind (they stay > 0.5 m above the floor). shallow = 108 deg, noLockout = 135 deg, wobble = 136 deg.
  dip: Object.freeze({ repDur: 2.0, rest: 0.5, top: 172, bottom: 82, shallow: 108, noLockout: 135, wobble: 136,
    lead: 1, tail: 1, bar: 1.35, wristUp: 0.045, grip: 0.24, elbowLat: 0.2, forearmLean: 10, leanTop: 5, leanBottom: 25,
    thigh: 10, knee: 100, kipKnee: 60, releaseDur: 1.2, cam: [0, -1.15, 3.0] }),
  releaseLag: 1.0,       // forecast only: measured delay from the start of a release to the analyzer's 'position_lost' (s)
  standArm: Object.freeze({ el: 0.17, wr: 0.19 }),   // lateral offsets of the elbow / wrist of a standing person (m)
});

// squat.bottom = 65 deg: with ~25 deg shin lean that is thighs parallel to the floor (ACE depth).
const C = SYNTH_CONFIG;
const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const dir = (deg) => ({ x: Math.cos(deg * RAD), y: Math.sin(deg * RAD) });   // y DOWN: positive angle points down
const up = (beta) => dir(beta - 90);                                         // beta: degrees clockwise from straight up
const mv = (p, d, k) => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const perp = (d) => ({ x: -d.y, y: d.x });
const down = (deg) => ({ x: Math.sin(deg * RAD), y: Math.cos(deg * RAD) });  // deg from straight down toward the front (+x)
/** Rotate point p about c by deg (y DOWN frame: positive = clockwise on screen). */
const rotP = (p, c, deg) => {
  const k = Math.cos(deg * RAD), s = Math.sin(deg * RAD), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
};
const planar = (len, dz) => Math.sqrt(len * len - dz * dz);   // in-plane length of a limb whose ends differ by dz laterally

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Root of an increasing f on [lo, hi] (f(lo) < 0 < f(hi)). */
function bisect(f, lo, hi) {
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Point at distance r0 from p0 and r1 from p1, on the `side` (+1/-1) of the p0->p1 line (two-bone IK). */
function ik2(p0, p1, r0, r1, side) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1e-9;
  const d = Math.min(len, r0 + r1 - 1e-6), a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a)), ux = dx / len, uy = dy / len;
  return { x: p0.x + a * ux - side * h * uy, y: p0.y + a * uy + side * h * ux };
}

// BlazePose landmark tables. Face: [index, side, along front axis, along head axis] relative to the ear.
const FACE = [[0, 'm', 0.11, 0], [1, 'l', 0.085, 0.045], [2, 'l', 0.075, 0.05], [3, 'l', 0.06, 0.05],
  [4, 'r', 0.085, 0.045], [5, 'r', 0.075, 0.05], [6, 'r', 0.06, 0.05], [7, 'l', 0, 0], [8, 'r', 0, 0],
  [9, 'l', 0.085, -0.05], [10, 'r', 0.085, -0.05]];
const JOINTS = [[11, 'sh'], [13, 'el'], [15, 'wr'], [23, 'hi'], [25, 'kn'], [27, 'an'], [29, 'he'], [31, 'fo']];  // left index; right = +1
const HAND = [[17, 0.15, 0.015], [19, 0.18, 0], [21, 0.10, -0.015]];   // pinky, index, thumb: [left index, along hand, across]
// Lateral half-distance (m) of the face points of the bar tests (v0 poses put them at zSide): eyes, ears, mouth corners.
const FACE_LAT = { 1: 0.03, 2: 0.035, 3: 0.045, 4: 0.03, 5: 0.035, 6: 0.045, 7: 0.075, 8: 0.075, 9: 0.025, 10: 0.025 };

/** Explicit pinky / index / thumb points of pose P (P.handPts, or along the hand direction from the wrist). */
function handPoints(P) {
  if (P.handPts) return P.handPts;
  const o = {};
  for (const [li, k, across] of HAND) o[li] = mv(mv(P.wr, P.hand, k), perp(P.hand), across);
  return o;
}

/**
 * Expand the key joints of pose P into 33 scene points with a depth side and a near/far flag. Optional (bar tests):
 * P.lat {el, wr, hand} lateral offsets instead of zSide, P.handPts {17, 19, 21} explicit hand points, P.faceLat.
 */
function scenePoints(P, nearSide, mirror) {
  const pts = [];
  const put = (i, side, p, lat = C.zSide) => {
    const far = side !== 'm' && side !== nearSide;
    pts[i] = { x: (mirror ? -p.x : p.x) + (far ? C.farShift : 0), y: p.y, z: side === 'm' ? 0 : far ? lat : -lat, near: !far };
  };
  const lat = P.lat || {};
  for (const [i, side, b, a] of FACE) put(i, side, mv(mv(P.ear, P.fv, b), P.hv, a), P.faceLat ? FACE_LAT[i] : C.zSide);
  for (const [li, key] of JOINTS) { put(li, 'l', P[key], lat[key] ?? C.zSide); put(li + 1, 'r', P[key], lat[key] ?? C.zSide); }
  for (const [li, k, across] of HAND) {
    const p = P.handPts ? P.handPts[li] : mv(mv(P.wr, P.hand, k), perp(P.hand), across);
    put(li, 'l', p, lat.hand ?? C.zSide); put(li + 1, 'r', p, lat.hand ?? C.zSide);
  }
  return pts;
}

/**
 * Camera axes (unit vectors in scene coordinates) of a camera turned by roll about its optical axis and by pitch about
 * its x axis: R = Rx(pitch)·Rz(roll), columns ex (image right), ey (image down), ez (optical axis). Gravity (0, 1, 0)
 * in camera axes = (ex.y, ey.y, ez.y) = (sin r·cos p, cos r·cos p, -sin p); pitch > 0 looks above the horizon.
 */
function camBasis(rollDeg, pitchDeg) {
  const cr = Math.cos(rollDeg * RAD), sr = Math.sin(rollDeg * RAD), cp = Math.cos(pitchDeg * RAD), sp = Math.sin(pitchDeg * RAD);
  return { ex: { x: cr, y: cp * sr, z: sp * sr }, ey: { x: -sr, y: cp * cr, z: sp * cr }, ez: { x: 0, y: -sp, z: cp } };
}

/** Project the scene pose with a pinhole camera and add seeded noise; returns a PoseFrame (t in ms). */
function buildFrame(P, cam, tMs, o, rnd, hidden) {
  const sY = 2 * Math.tan(C.vfov * RAD / 2), sX = sY * o.aspect, mirror = o.facing === 'left';
  const pts = scenePoints(P, mirror ? 'l' : 'r', mirror);
  const cx = mirror ? -cam[0] : cam[0];
  const hip = { x: (pts[23].x + pts[24].x) / 2, y: (pts[23].y + pts[24].y) / 2 };
  const nz = o.noise, wn = o.noise * sY * cam[2];       // world noise = same error expressed in meters
  const lm = [], world = [];
  if (o.cameraRoll || o.cameraPitch) {                  // turned camera (v1); the level camera keeps the exact v0 path below
    const B = camBasis(o.cameraRoll || 0, o.cameraPitch || 0), D = cam[2];
    const pos = { x: cx - D * B.ez.x, y: cam[1] - D * B.ez.y, z: -D * B.ez.z };     // orbits its look-at point (cx, cam[1], 0)
    const hz = (pts[23].z + pts[24].z) / 2, dot = (a, e) => a.x * e.x + a.y * e.y + a.z * e.z;
    const Zh = dot({ x: hip.x - pos.x, y: hip.y - pos.y, z: hz - pos.z }, B.ez);
    for (const p of pts) {
      const r = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z }, w = { x: p.x - hip.x, y: p.y - hip.y, z: p.z - hz };
      const X = dot(r, B.ex), Y = dot(r, B.ey), Z = dot(r, B.ez);
      const v = hidden ? C.visHidden : clamp((p.near ? C.visNear : C.visFar) + (rnd() - 0.5) * 0.06, 0, 1);
      lm.push({ x: 0.5 + X / (Z * sX) + nz * gauss(rnd), y: 0.5 + Y / (Z * sY) + nz * gauss(rnd),
        z: (Z - Zh) / (D * sX) + nz * gauss(rnd), visibility: v });
      world.push({ x: dot(w, B.ex) + wn * gauss(rnd), y: dot(w, B.ey) + wn * gauss(rnd), z: dot(w, B.ez) + wn * gauss(rnd), visibility: v });
    }
    return { t: tMs, lm, world, aspect: o.aspect };
  }
  for (const p of pts) {
    const Z = cam[2] + p.z;
    const v = hidden ? C.visHidden : clamp((p.near ? C.visNear : C.visFar) + (rnd() - 0.5) * 0.06, 0, 1);
    lm.push({ x: 0.5 + (p.x - cx) / (Z * sX) + nz * gauss(rnd), y: 0.5 + (p.y - cam[1]) / (Z * sY) + nz * gauss(rnd),
      z: p.z / (cam[2] * sX) + nz * gauss(rnd), visibility: v });
    world.push({ x: p.x - hip.x + wn * gauss(rnd), y: p.y - hip.y + wn * gauss(rnd), z: p.z + wn * gauss(rnd), visibility: v });
  }
  return { t: tMs, lm, world, aspect: o.aspect };
}

// ---- Kinematics -------------------------------------------------------------------------------------
const FOOT = { along: 0.10, perp: 0.20 };   // toes variant: ball-of-foot contact relative to the ankle (along body, below it)
const dArm = (elbowDeg) => Math.sqrt(C.arm1 ** 2 + C.arm2 ** 2 - 2 * C.arm1 * C.arm2 * Math.cos(elbowDeg * RAD));
const rigCache = {};

/** Rigid body pivoting on the toes (or knees): shoulder position sh(phi) for body angle phi (deg) and the wrist anchor. */
function rig(variant) {
  if (rigCache[variant]) return rigCache[variant];
  const knees = variant === 'knees';
  const along = knees ? C.thigh + C.torso : C.shank + C.thigh + C.torso - FOOT.along;
  const across = knees ? 0 : -FOOT.perp, ty = knees ? -0.05 : 0;
  const sh = (phi) => {
    const c = Math.cos(phi * RAD), s = Math.sin(phi * RAD);
    return { x: along * c + across * s, y: ty - along * s + across * c };
  };
  const top = bisect((p) => -sh(p).y - 0.04 - dArm(C.pushup.top), 0, 70);
  return (rigCache[variant] = { knees, ty, sh, wrist: { x: sh(top).x, y: -0.04 } });
}

/** Leg/torso points of the rigid body at angle phi with pivot T; dev = hip drop (+ sag, - pike) from the shoulder-ankle line. */
function body(knees, T, phi, dev) {
  const u = dir(-phi), n = perp(u), at = (A, a, b) => mv(mv(A, u, a), n, b);
  if (knees) {
    const A = mv(T, dir(184), C.shank);
    return { sh: at(T, C.thigh + C.torso, 0), hi: at(T, C.thigh, dev), kn: T, an: A,
      he: { x: A.x + 0.03, y: A.y + 0.02 }, fo: { x: A.x - 0.17, y: A.y + 0.07 } };
  }
  const A = at(T, -FOOT.along, -FOOT.perp), L = C.shank + C.thigh;
  return { sh: at(A, L + C.torso, 0), hi: at(A, L, dev), kn: at(A, C.shank, dev * C.shank / L), an: A, he: at(A, -0.06, 0.07), fo: T };
}

function headOf(sh, phi) {
  const hv = dir(-phi + 12);
  return { ear: mv(sh, hv, C.neck), hv, fv: perp(hv) };
}

function pushupPose(variant, elbow, dev) {
  const R = rig(variant);
  const phi = bisect((p) => Math.hypot(R.sh(p).x - R.wrist.x, R.sh(p).y - R.wrist.y) - dArm(elbow), 0, 70);
  const b = body(R.knees, { x: 0, y: R.ty }, phi, dev);
  return { ...b, el: ik2(b.sh, R.wrist, C.arm1, C.arm2, 1), wr: R.wrist, ...headOf(b.sh, phi), hand: { x: 1, y: 0 } };
}

function squatPose(knee) {
  const cfg = C.squat, depth = clamp((cfg.top - knee) / (cfg.top - cfg.bottom), 0, 1.3);
  const psi = 0.22 * (180 - knee), lean = cfg.leanTop + (cfg.leanBottom - cfg.leanTop) * depth;
  const an = { x: 0, y: -0.08 }, kn = mv(an, up(psi), C.shank);
  const hi = mv(kn, up(psi + knee - 180), C.thigh), sh = mv(hi, up(lean), C.torso);
  const a2 = dir(-2), el = mv(sh, dir(-6), C.arm1), wr = mv(el, a2, C.arm2), hv = up(lean * 0.5);
  return { sh, el, wr, hi, kn, an, he: { x: -0.06, y: 0 }, fo: { x: 0.14, y: 0 }, ear: mv(sh, hv, C.neck), hv, fv: perp(hv), hand: a2 };
}

/** Forearm plank: elbow under the shoulder on the floor, toes on the floor; dev = hip sag, c = collapse 0..1. */
function plankPose(dev, c, breath) {
  const R = rig('toes'), sh0 = { x: 0.9, y: -(0.05 + C.arm1) - breath * 0.5 };
  const phi = bisect((p) => sh0.y - R.sh(p).y, 0, 70);
  const b = body(false, { x: sh0.x - R.sh(phi).x, y: 0 }, phi, dev + breath);
  if (c > 0) {                                    // knees and hips drop to the floor, shanks fold up behind
    const k = C.plank.collapse, an0 = b.an;
    b.hi = { x: b.hi.x, y: b.hi.y + k.hip * c };
    b.kn = { x: b.kn.x, y: b.kn.y + k.knee * c };
    b.an = { x: lerp(an0.x, b.kn.x - Math.sqrt(Math.max(0, C.shank ** 2 - (b.kn.y - (an0.y - k.ankle * c)) ** 2)), c), y: an0.y - k.ankle * c };
    for (const key of ['he', 'fo']) b[key] = { x: b[key].x + b.an.x - an0.x, y: b[key].y + b.an.y - an0.y };
  }
  const el = { x: sh0.x, y: -0.05 };
  return { ...b, sh: sh0, el, wr: { x: el.x + C.arm2, y: -0.05 }, ...headOf(sh0, phi), hand: { x: 1, y: 0 } };
}

// ---- Bar tests: pull-up and dip (person faces +x, hands fixed on the bar) ------------------------------------
/**
 * Planar arm of a bar test whose joints sit at fixed lateral offsets (shoulder zSide, elbow elbowLat, wrist grip):
 * in-plane segment lengths a1/a2 keep the 3D lengths exact, and d2(deg) is the in-plane shoulder-wrist distance that
 * gives a 3D elbow angle of deg.
 */
function armRig(cfg) {
  const dz = cfg.grip - C.zSide;
  return { a1: planar(C.arm1, cfg.elbowLat - C.zSide), a2: planar(C.arm2, cfg.grip - cfg.elbowLat),
    d2: (deg) => Math.sqrt(Math.max(0, dArm(deg) ** 2 - dz * dz)) };
}
const PU_RIG = armRig(C.pullup), DIP_RIG = armRig(C.dip);
const footOf = (an, sd) => ({ he: mv(mv(an, sd, 0.05), perp(sd), 0.05), fo: mv(mv(an, sd, 0.13), perp(sd), -0.08) });
const BODY_KEYS = ['sh', 'el', 'wr', 'hi', 'kn', 'an', 'he', 'fo', 'ear'];

/**
 * Pull-up: u = lift (0 dead hang, 1 clean top). The shoulder rises from straight under the wrist to 6 cm under the bar
 * and 9 cm behind it; the torso leans 12 deg and the hips flex 10 deg at the top; the head tilts back 15 deg.
 * kipF (rep phase 0..1, kip reps only): knee drive in the first half (hips +70 deg, knees +60 deg) and a ±12 deg swing
 * of the whole body about the hands.
 */
function pullupPose(u, kipF) {
  const g = C.pullup, R = PU_RIG, W = { x: 0, y: -g.bar + g.wristDrop }, B = { x: 0, y: -g.bar };
  const sh = { x: -g.topBack * u * u, y: lerp(W.y + R.d2(g.hang), B.y + g.topBelow, u) };
  const drive = kipF == null ? 0 : Math.sin(Math.PI * clamp(kipF / 0.5, 0, 1));
  const lean = g.lean * u, flex = g.hollow * u + g.kipHip * drive, kneeFlex = 180 - g.knee + g.kipKnee * drive;
  const hi = mv(sh, down(lean), C.torso), kn = mv(hi, down(lean + flex), C.thigh), sd = down(lean + flex - kneeFlex);
  const an = mv(kn, sd, C.shank), hv = up(-g.headBack * u);
  const P = { sh, el: ik2(sh, W, R.a1, R.a2, 1), wr: W, hi, kn, an, ...footOf(an, sd), ear: mv(sh, hv, C.neck), hv, fv: perp(hv),
    hand: { x: 0, y: -1 }, lat: { el: g.elbowLat, wr: g.grip, hand: g.grip }, faceLat: true,
    // overhand grip: index and pinky knuckles wrap the bar (their mean ~ bar centre), thumb under it
    handPts: { 17: { x: 0.005, y: B.y + 0.015 }, 19: { x: 0.03, y: B.y - 0.01 }, 21: { x: -0.025, y: B.y + 0.03 } } };
  const swing = kipF == null ? 0 : g.kipSwing * Math.sin(2 * Math.PI * kipF);
  if (swing) {
    for (const k of BODY_KEYS) if (k !== 'wr') P[k] = rotP(P[k], W, swing);
    P.hv = rotP(P.hv, { x: 0, y: 0 }, swing); P.fv = perp(P.hv);
  }
  return P;
}

/**
 * Dip: theta = 3D elbow angle. The forearm leans back up to 10 deg, the shoulder sits in front of the elbow (upper arm
 * ~horizontal at 82 deg), the torso leans forward 5 -> 25 deg, knees bent 100 deg with the feet behind.
 * kipF (kip reps only): the knees kick open by up to 60 deg during the push (second half of the rep).
 */
function dipPose(theta, kipF) {
  const g = C.dip, R = DIP_RIG, W = { x: 0, y: -g.bar - g.wristUp };
  const k = clamp((g.top - theta) / (g.top - g.bottom), 0, 1.3);
  const el = mv(W, up(-g.forearmLean * k), R.a2), sh = ik2(el, W, R.a1, R.d2(theta), -1);
  const drive = kipF == null ? 0 : Math.sin(Math.PI * clamp((kipF - 0.5) / 0.5, 0, 1));
  const lean = g.leanTop + (g.leanBottom - g.leanTop) * k, knee = g.knee + g.kipKnee * drive;
  const hi = mv(sh, down(-lean), C.torso), kn = mv(hi, down(g.thigh), C.thigh), sd = down(g.thigh - (180 - knee));
  const an = mv(kn, sd, C.shank), hv = up(lean * 0.6);
  return { sh, el, wr: W, hi, kn, an, ...footOf(an, sd), ear: mv(sh, hv, C.neck), hv, fv: perp(hv), hand: { x: 1, y: 0 },
    lat: { el: g.elbowLat, wr: g.grip, hand: g.grip }, faceLat: true,
    // hands on top of the bars, fingers forward around them (index/pinky knuckles ~ bar centre)
    handPts: { 17: { x: W.x + 0.06, y: W.y + 0.04 }, 19: { x: W.x + 0.075, y: W.y + 0.035 }, 21: { x: W.x + 0.035, y: W.y + 0.045 } } };
}

/** Person standing on the floor at x, arms hanging at the sides (end of a release). */
function standPose(x) {
  const g = C.standArm, an = { x, y: -0.08 }, kn = { x, y: an.y - C.shank }, hi = { x, y: kn.y - C.thigh }, sh = { x, y: hi.y - C.torso };
  const el = mv(sh, down(4), planar(C.arm1, g.el - C.zSide)), hand = down(8), wr = mv(el, hand, planar(C.arm2, g.wr - g.el)), hv = up(0);
  return { sh, el, wr, hi, kn, an, he: { x: x - 0.06, y: 0 }, fo: { x: x + 0.14, y: 0 }, ear: mv(sh, hv, C.neck), hv, fv: perp(hv),
    hand, lat: { el: g.el, wr: g.wr, hand: g.wr }, faceLat: true };
}

/**
 * Blend of two poses (w = 0 -> A, 1 -> B) for the release: body points move linearly, the arm segments turn about the
 * shoulder / elbow by the shorter way (an overhead arm comes down in front of the body), hand points follow the wrist.
 */
function blendPose(A, B, w) {
  const P = { faceLat: true, handPts: {}, lat: {} }, ha = handPoints(A), hb = handPoints(B);
  const mix = (a, b) => ({ x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w) });
  const ang = (v) => Math.atan2(v.x, v.y) / RAD;                       // direction angle, as in down()
  const turn = (a0, a1) => a0 + (((((a1 - a0) % 360) + 540) % 360) - 180) * w;
  const seg = (o, a0, a1, b0, b1) => {                                  // segment a0->a1 of A blended with b0->b1 of B, from o
    const da = { x: a1.x - a0.x, y: a1.y - a0.y }, db = { x: b1.x - b0.x, y: b1.y - b0.y };
    return mv(o, down(turn(ang(da), ang(db))), lerp(Math.hypot(da.x, da.y), Math.hypot(db.x, db.y), w));
  };
  for (const k of BODY_KEYS) P[k] = mix(A[k], B[k]);
  P.el = seg(P.sh, A.sh, A.el, B.sh, B.el);
  P.wr = seg(P.el, A.el, A.wr, B.el, B.wr);
  P.hv = down(turn(ang(A.hv), ang(B.hv))); P.fv = perp(P.hv); P.hand = down(turn(ang(A.hand), ang(B.hand)));
  for (const i of [17, 19, 21]) P.handPts[i] = seg(P.wr, A.wr, ha[i], B.wr, hb[i]);
  for (const k of ['el', 'wr', 'hand']) P.lat[k] = lerp(A.lat?.[k] ?? C.zSide, B.lat?.[k] ?? C.zSide, w);
  return P;
}

/** Pose of a bar test at t: rep pose, then (opts.releaseAt) the person lets go / steps off and stands. */
function barPose(plan, t, v, r) {
  const kipF = r.seg && r.seg.kind === 'kip' ? r.f : null;
  const P = plan.test === 'pullup' ? pullupPose(v, kipF) : dipPose(v, kipF), rel = plan.release;
  return !rel || t < rel.t0 ? P : blendPose(P, standPose(P.hi.x), smooth((t - rel.t0) / rel.dur));
}

// ---- Timelines --------------------------------------------------------------------------------------
/** pauseAfter as {rep, seconds} (aliases k/after, dur/s) or [rep, seconds]; rep = number of reps done before the pause. */
function pauseOf(p) {
  if (!p) return null;
  return Array.isArray(p) ? { rep: p[0], seconds: p[1] } : { rep: p.rep ?? p.k ?? p.after, seconds: p.seconds ?? p.dur ?? p.s ?? 0 };
}

/** Push-up / squat timeline: one segment per rep (smooth cosine profile), small rest at the top between reps. */
function repPlan(test, o, rnd) {
  const cfg = C[test], pause = pauseOf(o.pauseAfter);
  let n = o.reps ?? 10;
  const kindAt = (k) => (o.kinds && o.kinds[k]) || ((o.invalidAt || []).includes(k) ? (o.kind || 'shallow') : null);
  const segs = [];
  let t = o.lead ?? cfg.lead;
  for (let k = 0; k < n; k++) {
    const kind = kindAt(k), dur = cfg.repDur * (1 + 0.1 * (rnd() - 0.5));
    segs.push({ t0: t, t1: t + dur, kind, bottom: kind === 'shallow' ? cfg.shallow : kind === 'wobble' ? cfg.wobble : cfg.bottom,
      topEnd: kind === 'no_lockout' ? cfg.noLockout : cfg.top,
      dev: kind === 'sag' ? (cfg.sag ?? 0) : kind === 'pike' ? (cfg.pike ?? 0) : 0 });
    t += dur + cfg.rest * (0.3 + 0.7 * rnd());
    if (pause && pause.rep === k + 1) t += pause.seconds;
    segs[k].after = t;
  }
  // v1 bar tests: opts.releaseAt (s) = let go of the bar / step off the bars. Reps starting at or after it are not done;
  // the release starts at releaseAt or right after the last rep, lasts releaseDur and is followed by `tail` standing.
  // opts.release: true = let go right after the last rep (its short rest at the bottom / top).
  let tail = o.tail ?? (o.fatigueEnd ? 6 : cfg.tail), release = null, endT;
  if ((o.releaseAt != null || o.release) && cfg.releaseDur) {
    while (n && o.releaseAt != null && segs[n - 1].t0 >= o.releaseAt) { segs.pop(); n--; }
    release = { t0: Math.max(o.releaseAt ?? 0, n ? segs[n - 1].after : (o.lead ?? cfg.lead)), dur: cfg.releaseDur };
    tail = o.tail ?? cfg.tail; t = release.t0 + release.dur; endT = release.t0 + C.releaseLag;
  } else endT = t + tail;
  // No-rest rule (CONTRACT: 4 s without completing a rep, a rep in progress excepted): pause when the rest before the
  // next judged rep exceeds 3.6 s (the analyzer completes a rep ~0.1 s before t1 and sees the next one start ~0.3 s
  // after t0), or when the set ends more than 4.2 s after the last rep. A wobble completes no rep: it is skipped.
  const judged = segs.flatMap((s, k) => (s.kind === 'wobble' ? [] : [k]));
  const paused = (k) => { const j = judged.find((i) => i > k); return j == null ? endT - segs[k].t1 > 4.2 : segs[j].t0 - segs[k].t1 > 3.6; };
  let valid = 0, invalid = 0, streak = 0, endReason = judged.length && segs[judged[0]].t1 > 15.2 ? 'pause' : null;   // expected outcome per CONTRACT.md
  for (let k = 0; k < n && !endReason; k++) {
    if (segs[k].kind === 'wobble') continue;                           // a hesitation at the top: not a repetition attempt
    if (segs[k].kind) { invalid++; streak++; } else { valid++; streak = 0; }
    if (streak >= 2) endReason = 'technique';
    else if (paused(k)) endReason = 'pause';
  }
  if (!endReason && release) {
    // Losing the bar ends the test once a rep has begun (pull-ups: also before, the hands drop under the shoulders);
    // a dip release before any rep looks like standing in the support and ends by the 15 s first-rep rule instead.
    if (n || test === 'pullup') endReason = !n && endT > 15.2 ? 'pause' : 'position_lost';
    else if (t + tail > 15.2) endReason = 'pause';
  }
  return { segs, top0: cfg.top, release, total: t + tail, meta: { variant: o.variant, reps: n, kinds: segs.map((s) => s.kind),
    repEnds: segs.map((s) => s.t1), expectedValid: valid, expectedInvalid: invalid, endReason, releaseT: release ? release.t0 : null } };
}

/** Static plank timeline: hip-sag episodes (recovered or not) and an optional collapse to the floor. */
function plankPlan(o) {
  const g = C.plank, seconds = o.seconds ?? 60;
  const sag = (o.sagAt || []).map((e) => ({ t: e.t, depth: e.depth ?? g.sagDepth,
    end: e.recover === false ? (e.dur == null ? Infinity : e.t + e.dur) : e.t + (e.dur ?? g.sagDur) }));
  const lost = o.collapseAt == null ? Infinity : o.collapseAt + g.collapseLag;
  // Expected outcome = the CONTRACT cue rules applied to the plan: cue ~1 s after the hip leaves the line, 5 s to restore,
  // a still-sagging hip is cued again at once, two failed cues in a row end the test. Accurate to about +-1 s.
  let fails = 0, techT = Infinity;
  const cues = [];                                  // {at, failAt}: when each corrective cue is issued and (if it fails) gives up
  for (const e of sag) {
    let cueAt = e.t + g.cueLag;
    while (cueAt < e.end && techT === Infinity) {
      const ok = e.end + g.restoreLag <= cueAt + g.cueWindow;
      cues.push({ at: cueAt, failAt: ok ? null : cueAt + g.cueWindow });
      if (ok) { fails = 0; break; }
      if (++fails >= 2) techT = cueAt + g.cueWindow;
      cueAt += g.cueWindow;
    }
  }
  const endT = Math.min(techT, lost), ended = endT <= seconds, stop = ended ? endT : seconds;
  const endReason = !ended ? null : lost <= techT ? 'position_lost' : 'technique';
  return { seconds, sag, collapseAt: o.collapseAt ?? null, total: seconds, meta: { seconds, expectedSeconds: stop, endReason,
    endT: ended ? endT : null, expectedInvalid: cues.filter((c) => c.failAt != null && c.failAt <= stop + 0.1).length,
    expectedCues: cues.filter((c) => c.at < stop).length, sagAt: sag.map((e) => ({ t: e.t, end: e.end, depth: e.depth })) } };
}

function repState(plan, t) {
  let top = plan.top0;
  for (const s of plan.segs) {
    if (t < s.t0) break;
    if (t < s.t1) { const f = (t - s.t0) / (s.t1 - s.t0); return { f, seg: s, top, s: (1 - Math.cos(2 * Math.PI * f)) / 2 }; }
    top = s.topEnd;
  }
  return { f: 0, seg: null, top, s: 0 };
}

function poseAt(plan, t) {
  if (plan.test === 'plank') {
    const g = C.plank;
    let dev = 0;
    for (const e of plan.sag) dev += e.depth * smooth((t - e.t) / g.ramp) * (1 - smooth((t - e.end) / g.ramp));
    const c = plan.collapseAt == null ? 0 : smooth((t - plan.collapseAt) / g.collapseDur);
    return plankPose(dev, c, g.breath * Math.sin(2 * Math.PI * t / g.breathPeriod));
  }
  const r = repState(plan, t);
  const v = r.seg ? lerp(r.f < 0.5 ? r.top : r.seg.topEnd, r.seg.bottom, r.s) : r.top;     // elbow (push-up) or knee (squat) angle
  if (plan.test === 'pullup' || plan.test === 'dip') return barPose(plan, t, v, r);         // lift (pull-up) or elbow (dip)
  const dev = r.seg ? r.seg.dev * smooth(Math.min(1, 2 * Math.sin(Math.PI * r.f))) : 0;
  return plan.test === 'pushup' ? pushupPose(plan.variant, v, dev) : squatPose(v);
}

function resolve(test, opts = {}) {
  if (!['pushup', 'squat', 'plank', 'pullup', 'dip'].includes(test)) throw new Error(`synth: unknown test "${test}"`);
  return { ...opts, fps: opts.fps ?? C.fps, noise: opts.noise ?? C.noise, seed: opts.seed ?? C.seed, aspect: opts.aspect ?? C.aspect,
    facing: opts.facing ?? 'right', variant: opts.variant ?? (opts.sex === 'F' ? 'knees' : 'toes'),
    cameraRoll: opts.cameraRoll ?? 0, cameraPitch: opts.cameraPitch ?? 0 };
}

function makePlan(test, o) {
  const plan = test === 'plank' ? plankPlan(o) : repPlan(test, o, mulberry32((o.seed ^ 0x9E3779B9) | 0));
  plan.test = test; plan.variant = o.variant;
  const B = camBasis(o.cameraRoll, o.cameraPitch);
  Object.assign(plan.meta, { test, fps: o.fps, duration: plan.total,
    camera: { roll: o.cameraRoll, pitch: o.cameraPitch, down: { x: B.ex.y + 0, y: B.ey.y + 0, z: B.ez.y + 0 } } });   // + 0: no -0
  return plan;
}

function makeFrame(plan, o, idx, tMs) {
  const t = idx / o.fps, rnd = mulberry32((Math.imul(o.seed, 7919) + Math.imul(idx, 104729)) | 0);
  const hidden = (o.hide || []).some((h) => t >= h.t && t < h.t + h.dur);
  const cam = plan.test === 'pushup' && plan.variant === 'knees' ? C.pushup.camKnees : C[plan.test].cam;
  return buildFrame(poseAt(plan, t), cam, tMs, o, rnd, hidden);
}

/**
 * Generate a whole synthetic session (side view, seeded, deterministic).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {object} [opts]
 *   reps (10); invalidAt (0-based rep indices) + kind, or kinds ({index: kind}); kind = 'shallow' | 'sag' | 'pike' | 'no_lockout'
 *   (push-ups), 'shallow' | 'no_lockout' (squats), 'shallow' (chin stays ~11 cm under the bar) | 'no_lockout' (elbow ~131 deg
 *   at the bottom) | 'kip' (knee drive + body swing) (pull-ups), 'shallow' (elbow 108 deg) | 'no_lockout' (135 deg at the
 *   top) | 'kip' (knees kick open 60 deg during the push) (dips), 'wobble' (a dip that is not a rep attempt: counted as neither);
 *   seconds (plank, 60); fps (30); noise (0.004, normalized image units, gaussian); seed (1); sex ('M' toes | 'F' knees);
 *   variant ('toes' | 'knees'); aspect (9/16); facing ('right' | 'left'); lead / tail (s of stillness before / after the reps);
 *   pauseAfter ({rep, seconds}: stand still at the top for `seconds` once `rep` reps are done); fatigueEnd (6 s of stillness at
 *   the end); sagAt ([{t, dur, depth, recover}] plank hip-sag episodes, depth in m (negative = pike), recover:false without
 *   dur = never recovers); collapseAt (plank: second when knees and hips drop to the floor);
 *   releaseAt (pull-ups/dips, s: reps starting at or after it are dropped, then the person lets go of the bar / steps off the
 *   bars and stands; `tail` = seconds standing afterwards); release (true: the same right after the last rep);
 *   cameraRoll / cameraPitch (deg, all tests, default 0 = level camera, bit-identical to v0): the camera is turned about its
 *   optical axis (+ = clockwise seen from behind it, the scene looks turned counter-clockwise) / its x axis (+ = looks up)
 *   while it keeps looking at the same point; lm use the turned pinhole, world uses its axes;
 *   hide ([{t, dur}]: all visibilities 0.1 during those windows).
 * @returns {{frames: object[], fps: number, meta: object}} PoseFrames (t in ms from 0) and the expected outcome:
 *   push-ups/squats/pull-ups/dips: expectedValid, expectedInvalid, endReason ('technique' | 'pause' | 'position_lost' | null),
 *   repEnds (s), kinds, releaseT (s or null); plank: expectedSeconds, expectedInvalid (failed cues), expectedCues,
 *   endReason ('technique' | 'position_lost' | null), endT (s, accurate to about 1 s). All tests: camera {roll, pitch, down}
 *   with down = gravity in camera axes. `hide` windows are not part of the forecast.
 */
function synthSession(test, opts) {
  const o = resolve(test, opts), plan = makePlan(test, o), n = Math.round(plan.total * o.fps), frames = [];
  for (let i = 0; i < n; i++) frames.push(makeFrame(plan, o, i, (i / o.fps) * 1000));
  return { frames, fps: o.fps, meta: plan.meta };
}

/**
 * One frame of the same session at time `tSeconds`, looping over the session length (demo playback). The pose and
 * noise are those of the nearest session frame; `frame.t` is `tSeconds` in ms (not wrapped, so it stays monotonic).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {number} tSeconds
 * @param {object} [opts] same as {@link synthSession}; reuse the same object between calls to skip rebuilding the plan.
 * @returns {object} PoseFrame
 */
function synthFrameAt(test, tSeconds, opts) {
  if (memo.test !== test || memo.opts !== opts) { const o = resolve(test, opts); memo = { test, opts, o, plan: makePlan(test, o) }; }
  const { o, plan } = memo, n = Math.max(1, Math.round(plan.total * o.fps));
  return makeFrame(plan, o, ((Math.round(tSeconds * o.fps) % n) + n) % n, tSeconds * 1000);
}
let memo = { test: null, opts: null, o: null, plan: null };

export { SYNTH_CONFIG, synthSession, synthFrameAt };
