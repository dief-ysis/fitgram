// FitGram synthetic pose generator: deterministic side-view PoseFrames for tests and the demo mode.
// Scene frame (meters): x right along the floor, y DOWN, floor at y = 0 (body points have y < 0),
// z = depth away from the camera (near body side at -zSide). World landmarks = scene points - mid-hips.
// Cameras are [centerX, centerY, distance] in scene meters (3-3.4 m away so the whole body fits a 9:16 portrait image).
// Opts (all optional): reps, invalidAt:[i] (0-based), kind, kinds:{i:kind}, seconds, fps, noise, seed, sex,
//   variant, aspect, facing:'right'|'left', lead, tail, pauseAfter:{rep,seconds}, fatigueEnd, sagAt, collapseAt,
//   hide:[{t,dur}] (all landmarks at visibility 0.1 during those windows).

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

/** Expand the key joints of pose P into 33 scene points with a depth side and a near/far flag. */
function scenePoints(P, nearSide, mirror) {
  const pts = [];
  const put = (i, side, p) => {
    const far = side !== 'm' && side !== nearSide;
    pts[i] = { x: (mirror ? -p.x : p.x) + (far ? C.farShift : 0), y: p.y, z: side === 'm' ? 0 : far ? C.zSide : -C.zSide, near: !far };
  };
  for (const [i, side, b, a] of FACE) put(i, side, mv(mv(P.ear, P.fv, b), P.hv, a));
  for (const [li, key] of JOINTS) { put(li, 'l', P[key]); put(li + 1, 'r', P[key]); }
  for (const [li, k, across] of HAND) {
    const p = mv(mv(P.wr, P.hand, k), perp(P.hand), across);
    put(li, 'l', p); put(li + 1, 'r', p);
  }
  return pts;
}

/** Project the scene pose with a pinhole camera and add seeded noise; returns a PoseFrame (t in ms). */
function buildFrame(P, cam, tMs, o, rnd, hidden) {
  const sY = 2 * Math.tan(C.vfov * RAD / 2), sX = sY * o.aspect, mirror = o.facing === 'left';
  const pts = scenePoints(P, mirror ? 'l' : 'r', mirror);
  const cx = mirror ? -cam[0] : cam[0];
  const hip = { x: (pts[23].x + pts[24].x) / 2, y: (pts[23].y + pts[24].y) / 2 };
  const nz = o.noise, wn = o.noise * sY * cam[2];       // world noise = same error expressed in meters
  const lm = [], world = [];
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

// ---- Timelines --------------------------------------------------------------------------------------
/** pauseAfter as {rep, seconds} (aliases k/after, dur/s) or [rep, seconds]; rep = number of reps done before the pause. */
function pauseOf(p) {
  if (!p) return null;
  return Array.isArray(p) ? { rep: p[0], seconds: p[1] } : { rep: p.rep ?? p.k ?? p.after, seconds: p.seconds ?? p.dur ?? p.s ?? 0 };
}

/** Push-up / squat timeline: one segment per rep (smooth cosine profile), small rest at the top between reps. */
function repPlan(test, o, rnd) {
  const cfg = C[test], n = o.reps ?? 10, pause = pauseOf(o.pauseAfter);
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
  }
  const tail = o.tail ?? (o.fatigueEnd ? 6 : cfg.tail), nextEnd = (k) => (k + 1 < n ? segs[k + 1].t1 : t + tail);
  let valid = 0, invalid = 0, streak = 0, endReason = n && segs[0].t1 > 15.2 ? 'pause' : null;   // expected outcome per CONTRACT.md
  for (let k = 0; k < n && !endReason; k++) {
    if (segs[k].kind === 'wobble') continue;                           // a hesitation at the top: not a repetition attempt
    if (segs[k].kind) { invalid++; streak++; } else { valid++; streak = 0; }
    if (streak >= 2) endReason = 'technique';
    else if (nextEnd(k) - segs[k].t1 > 4.2) endReason = 'pause';       // > 4 s without completing a rep (0.2 s margin)
  }
  return { segs, top0: cfg.top, total: t + tail, meta: { variant: o.variant, reps: n, kinds: segs.map((s) => s.kind),
    repEnds: segs.map((s) => s.t1), expectedValid: valid, expectedInvalid: invalid, endReason } };
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
  const dev = r.seg ? r.seg.dev * smooth(Math.min(1, 2 * Math.sin(Math.PI * r.f))) : 0;
  return plan.test === 'pushup' ? pushupPose(plan.variant, v, dev) : squatPose(v);
}

function resolve(test, opts = {}) {
  if (!['pushup', 'squat', 'plank'].includes(test)) throw new Error(`synth: unknown test "${test}"`);
  return { ...opts, fps: opts.fps ?? C.fps, noise: opts.noise ?? C.noise, seed: opts.seed ?? C.seed, aspect: opts.aspect ?? C.aspect,
    facing: opts.facing ?? 'right', variant: opts.variant ?? (opts.sex === 'F' ? 'knees' : 'toes') };
}

function makePlan(test, o) {
  const plan = test === 'plank' ? plankPlan(o) : repPlan(test, o, mulberry32((o.seed ^ 0x9E3779B9) | 0));
  plan.test = test; plan.variant = o.variant;
  Object.assign(plan.meta, { test, fps: o.fps, duration: plan.total });
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
 * @param {'pushup'|'squat'|'plank'} test
 * @param {object} [opts]
 *   reps (10); invalidAt (0-based rep indices) + kind, or kinds ({index: kind}); kind = 'shallow' | 'sag' | 'pike' | 'no_lockout'
 *   (push-ups), 'shallow' | 'no_lockout' (squats), 'wobble' (a dip that is not a rep attempt: counted as neither);
 *   seconds (plank, 60); fps (30); noise (0.004, normalized image units, gaussian); seed (1); sex ('M' toes | 'F' knees);
 *   variant ('toes' | 'knees'); aspect (9/16); facing ('right' | 'left'); lead / tail (s of stillness before / after the reps);
 *   pauseAfter ({rep, seconds}: stand still at the top for `seconds` once `rep` reps are done); fatigueEnd (6 s of stillness at
 *   the end); sagAt ([{t, dur, depth, recover}] plank hip-sag episodes, depth in m (negative = pike), recover:false without
 *   dur = never recovers); collapseAt (plank: second when knees and hips drop to the floor);
 *   hide ([{t, dur}]: all visibilities 0.1 during those windows).
 * @returns {{frames: object[], fps: number, meta: object}} PoseFrames (t in ms from 0) and the expected outcome:
 *   push-ups/squats: expectedValid, expectedInvalid, endReason ('technique' | 'pause' | null), repEnds (s), kinds;
 *   plank: expectedSeconds, expectedInvalid (failed cues), expectedCues, endReason ('technique' | 'position_lost' | null),
 *   endT (s, accurate to about 1 s). `hide` windows are not part of the forecast.
 */
function synthSession(test, opts) {
  const o = resolve(test, opts), plan = makePlan(test, o), n = Math.round(plan.total * o.fps), frames = [];
  for (let i = 0; i < n; i++) frames.push(makeFrame(plan, o, i, (i / o.fps) * 1000));
  return { frames, fps: o.fps, meta: plan.meta };
}

/**
 * One frame of the same session at time `tSeconds`, looping over the session length (demo playback). The pose and
 * noise are those of the nearest session frame; `frame.t` is `tSeconds` in ms (not wrapped, so it stays monotonic).
 * @param {'pushup'|'squat'|'plank'} test
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
