// FitGram, generador de poses sintéticas: PoseFrames deterministas vistos de lado (flexiones, sentadillas, plancha, dominadas,
// fondos) para las pruebas y el modo demo. Sistema de la escena (metros): x a la derecha por el suelo, y HACIA ABAJO (gravedad),
// suelo en y = 0 (el cuerpo tiene y < 0), z = profundidad alejándose de la cámara derecha (lado cercano en -zSide). Las cámaras
// son [centroX, centroY, distancia]: una cámara estenopeica que mira a (centroX, centroY, 0). opts.cameraRoll / cameraPitch (grados)
// giran esa cámara en torno a su eje óptico / su eje x mientras sigue mirando al mismo punto, así lm se proyectan con la cámara
// girada y los puntos de mundo (puntos de escena - centro de caderas) quedan en sus ejes, como los de MediaPipe. La gravedad en ejes
// de la cámara queda (sin r·cos p, cos r·cos p, -sin p): roll = atan2(down.x, down.y), pitch = asin(-down.z), como en orientation.mjs.
// Salida: { frames: PoseFrame[], fps, meta } con el resultado esperado del analizador en meta (ver synthSession).

/** Constantes ajustables del generador: modelo del cuerpo (m), cámara, ruido por defecto y tiempos de cada prueba. */
const SYNTH_CONFIG = Object.freeze({
  fps: 30, noise: 0.004, seed: 1, aspect: 9 / 16,
  vfov: 63,              // campo visual vertical (grados), cámara principal típica de teléfono en vertical
  zSide: 0.15,           // desplazamiento en profundidad del lado cercano (-) / lejano (+) del cuerpo (m)
  farShift: 0.025,       // las articulaciones del lado lejano se corren esto a la derecha para que los miembros no se tapen exacto
  visNear: 0.95, visFar: 0.7, visHidden: 0.1,
  arm1: 0.30, arm2: 0.27, thigh: 0.45, shank: 0.43, torso: 0.50, neck: 0.20,
  pushup: Object.freeze({ repDur: 1.6, rest: 0.45, top: 165, bottom: 75, shallow: 115, noLockout: 130, wobble: 132,
    sag: 0.12, pike: -0.15, lead: 1, tail: 1, cam: [0.62, -0.45, 3.4], camKnees: [0.2, -0.45, 3.4] }),
  squat: Object.freeze({ repDur: 2.0, rest: 0.5, top: 172, bottom: 65, shallow: 125, noLockout: 140, wobble: 142,
    leanTop: 3, leanBottom: 35, lead: 1, tail: 1, cam: [0.1, -0.9, 3.0] }),
  plank: Object.freeze({ breath: 0.004, breathPeriod: 4.2, ramp: 0.5, sagDepth: 0.14, sagDur: 3,
    collapseDur: 1.2,
    cueWindow: 5, cueLag: 1.45, restoreLag: 0.8, collapseLag: 1.45,   // solo para el pronóstico: ventana de aviso del CONTRACT; retrasos medidos del analizador (s)
    collapse: Object.freeze({ hip: 0.23, knee: 0.21, ankle: 0.22 }), cam: [0.45, -0.4, 3.4] }),
  // Dominadas: la variable de la línea de tiempo es la subida (0 = colgado, 1 = arriba limpio con el mentón ~5 cm sobre la barra).
  // Barra a 2,3 m, muñeca 8 cm bajo el centro de la barra, medio agarre de 0,26 m (un poco más ancho que los hombros);
  // el brazo es una cadena plana cuyas articulaciones van a distancias laterales fijas (largos 3D exactos). shallow = mentón
  // ~11 cm bajo la barra; noLockout = codo ~131° abajo; wobble = el codo baja a ~138° (no es un intento).
  pullup: Object.freeze({ repDur: 2.6, rest: 0.6, top: 0, bottom: 1, shallow: 0.7, noLockout: 0.09, wobble: 0.065,
    lead: 1, tail: 1, bar: 2.3, wristDrop: 0.08, grip: 0.26, elbowLat: 0.21, hang: 176, topBack: 0.088, topBelow: 0.06,
    lean: 12, hollow: 10, knee: 170, headBack: 15, kipHip: 70, kipKnee: 60, kipSwing: 12, releaseDur: 1.0,
    cam: [0, -1.3, 3.0] }),
  // Fondos: la variable de la línea de tiempo es el ángulo 3D del codo. Barras a 1,35 m, muñeca 4,5 cm sobre el centro de la
  // barra, manos a 0,24 m de cada lado; el antebrazo se inclina hasta 10° hacia atrás, el torso se inclina adelante 5 -> 25°,
  // rodillas dobladas 100° con los pies atrás (quedan > 0,5 m sobre el suelo). shallow = 108°, noLockout = 135°, wobble = 136°.
  dip: Object.freeze({ repDur: 2.0, rest: 0.5, top: 172, bottom: 82, shallow: 108, noLockout: 135, wobble: 136,
    lead: 1, tail: 1, bar: 1.35, wristUp: 0.045, grip: 0.24, elbowLat: 0.2, forearmLean: 10, leanTop: 5, leanBottom: 25,
    thigh: 10, knee: 100, kipKnee: 60, releaseDur: 1.2, cam: [0, -1.15, 3.0] }),
  releaseLag: 1.0,       // solo para el pronóstico: retraso medido desde que empieza a soltar hasta el 'position_lost' del analizador (s)
  standArm: Object.freeze({ el: 0.17, wr: 0.19 }),   // distancias laterales del codo / muñeca de una persona de pie (m)
});

// squat.bottom = 65°: con la canilla inclinada ~25°, eso es muslos paralelos al suelo (profundidad ACE).
const C = SYNTH_CONFIG;
const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const dir = (deg) => ({ x: Math.cos(deg * RAD), y: Math.sin(deg * RAD) });   // y HACIA ABAJO: un ángulo positivo apunta hacia abajo
const up = (beta) => dir(beta - 90);                                         // beta: grados en sentido horario desde la vertical hacia arriba
const mv = (p, d, k) => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const perp = (d) => ({ x: -d.y, y: d.x });
const down = (deg) => ({ x: Math.sin(deg * RAD), y: Math.cos(deg * RAD) });  // grados desde la vertical hacia abajo hacia el frente (+x)
/** Gira el punto p en torno a c en deg grados (y hacia abajo: positivo = sentido horario en pantalla). */
const rotP = (p, c, deg) => {
  const k = Math.cos(deg * RAD), s = Math.sin(deg * RAD), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
};
const planar = (len, dz) => Math.sqrt(len * len - dz * dz);   // largo en el plano de un miembro cuyos extremos difieren dz en lo lateral

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Raíz de una f creciente en [lo, hi] (f(lo) < 0 < f(hi)). */
function bisect(f, lo, hi) {
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Punto a distancia r0 de p0 y r1 de p1, al lado `side` (+1/-1) de la recta p0->p1 (cinemática inversa de dos huesos). */
function ik2(p0, p1, r0, r1, side) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1e-9;
  const d = Math.min(len, r0 + r1 - 1e-6), a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a)), ux = dx / len, uy = dy / len;
  return { x: p0.x + a * ux - side * h * uy, y: p0.y + a * uy + side * h * ux };
}

// Tablas de puntos de BlazePose. Cara: [índice, lado, a lo largo del eje frontal, a lo largo del eje de la cabeza] respecto de la oreja.
const FACE = [[0, 'm', 0.11, 0], [1, 'l', 0.085, 0.045], [2, 'l', 0.075, 0.05], [3, 'l', 0.06, 0.05],
  [4, 'r', 0.085, 0.045], [5, 'r', 0.075, 0.05], [6, 'r', 0.06, 0.05], [7, 'l', 0, 0], [8, 'r', 0, 0],
  [9, 'l', 0.085, -0.05], [10, 'r', 0.085, -0.05]];
const JOINTS = [[11, 'sh'], [13, 'el'], [15, 'wr'], [23, 'hi'], [25, 'kn'], [27, 'an'], [29, 'he'], [31, 'fo']];  // índice izquierdo; derecho = +1
const HAND = [[17, 0.15, 0.015], [19, 0.18, 0], [21, 0.10, -0.015]];   // meñique, índice, pulgar: [índice izquierdo, a lo largo de la mano, a lo ancho]
// Media distancia lateral (m) de los puntos de la cara en las pruebas con barra (las poses v0 los ponen en zSide): ojos, orejas, boca.
const FACE_LAT = { 1: 0.03, 2: 0.035, 3: 0.045, 4: 0.03, 5: 0.035, 6: 0.045, 7: 0.075, 8: 0.075, 9: 0.025, 10: 0.025 };

/** Puntos explícitos de meñique / índice / pulgar de la pose P (P.handPts, o a lo largo de la mano desde la muñeca). */
function handPoints(P) {
  if (P.handPts) return P.handPts;
  const o = {};
  for (const [li, k, across] of HAND) o[li] = mv(mv(P.wr, P.hand, k), perp(P.hand), across);
  return o;
}

/**
 * Expande las articulaciones clave de la pose P a 33 puntos de escena, con lado de profundidad y marca cercano/lejano. Opcional
 * (barra): P.lat {el, wr, hand} distancias laterales en vez de zSide, P.handPts {17, 19, 21} puntos de la mano, P.faceLat.
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
 * Ejes (vectores unitarios en coordenadas de escena) de una cámara girada en roll en torno a su eje óptico y en pitch en torno
 * a su eje x: R = Rx(pitch)·Rz(roll), columnas ex (derecha de la imagen), ey (abajo de la imagen), ez (eje óptico). La gravedad
 * (0, 1, 0) en ejes de la cámara = (ex.y, ey.y, ez.y) = (sin r·cos p, cos r·cos p, -sin p); pitch > 0 mira sobre el horizonte.
 */
function camBasis(rollDeg, pitchDeg) {
  const cr = Math.cos(rollDeg * RAD), sr = Math.sin(rollDeg * RAD), cp = Math.cos(pitchDeg * RAD), sp = Math.sin(pitchDeg * RAD);
  return { ex: { x: cr, y: cp * sr, z: sp * sr }, ey: { x: -sr, y: cp * cr, z: sp * cr }, ez: { x: 0, y: -sp, z: cp } };
}

/** Proyecta la pose con una cámara estenopeica y agrega ruido con semilla; devuelve un PoseFrame (t en ms). */
function buildFrame(P, cam, tMs, o, rnd, hidden) {
  const sY = 2 * Math.tan(C.vfov * RAD / 2), sX = sY * o.aspect, mirror = o.facing === 'left';
  const pts = scenePoints(P, mirror ? 'l' : 'r', mirror);
  const cx = mirror ? -cam[0] : cam[0];
  const hip = { x: (pts[23].x + pts[24].x) / 2, y: (pts[23].y + pts[24].y) / 2 };
  const nz = o.noise, wn = o.noise * sY * cam[2];       // ruido de mundo = el mismo error expresado en metros
  const lm = [], world = [];
  if (o.cameraRoll || o.cameraPitch) {                  // cámara girada (v1); la cámara derecha mantiene abajo el camino exacto de la v0
    const B = camBasis(o.cameraRoll || 0, o.cameraPitch || 0), D = cam[2];
    const pos = { x: cx - D * B.ez.x, y: cam[1] - D * B.ez.y, z: -D * B.ez.z };     // orbita su punto de mira (cx, cam[1], 0)
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

// ---- Cinemática -------------------------------------------------------------------------------------
const FOOT = { along: 0.10, perp: 0.20 };   // variante en punta de pies: apoyo de la planta respecto del tobillo (a lo largo del cuerpo, bajo él)
const dArm = (elbowDeg) => Math.sqrt(C.arm1 ** 2 + C.arm2 ** 2 - 2 * C.arm1 * C.arm2 * Math.cos(elbowDeg * RAD));
const rigCache = {};

/** Cuerpo rígido que pivota en la punta de los pies (o rodillas): posición del hombro sh(phi) para el ángulo phi (grados) y el apoyo de la muñeca. */
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

/** Puntos de piernas y torso del cuerpo rígido en el ángulo phi con pivote T; dev = caída de cadera (+ hundida, - alta) respecto de la línea hombro-tobillo. */
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

/** Plancha en antebrazos: codo bajo el hombro en el suelo, punta de pies en el suelo; dev = cadera hundida, c = colapso 0..1. */
function plankPose(dev, c, breath) {
  const R = rig('toes'), sh0 = { x: 0.9, y: -(0.05 + C.arm1) - breath * 0.5 };
  const phi = bisect((p) => sh0.y - R.sh(p).y, 0, 70);
  const b = body(false, { x: sh0.x - R.sh(phi).x, y: 0 }, phi, dev + breath);
  if (c > 0) {                                    // rodillas y caderas caen al suelo, las canillas se doblan hacia atrás
    const k = C.plank.collapse, an0 = b.an;
    b.hi = { x: b.hi.x, y: b.hi.y + k.hip * c };
    b.kn = { x: b.kn.x, y: b.kn.y + k.knee * c };
    b.an = { x: lerp(an0.x, b.kn.x - Math.sqrt(Math.max(0, C.shank ** 2 - (b.kn.y - (an0.y - k.ankle * c)) ** 2)), c), y: an0.y - k.ankle * c };
    for (const key of ['he', 'fo']) b[key] = { x: b[key].x + b.an.x - an0.x, y: b[key].y + b.an.y - an0.y };
  }
  const el = { x: sh0.x, y: -0.05 };
  return { ...b, sh: sh0, el, wr: { x: el.x + C.arm2, y: -0.05 }, ...headOf(sh0, phi), hand: { x: 1, y: 0 } };
}

// ---- Pruebas con barra: dominadas y fondos (la persona mira hacia +x, manos fijas en la barra) ------------------------
/**
 * Brazo plano de una prueba con barra cuyas articulaciones van a distancias laterales fijas (hombro zSide, codo elbowLat,
 * muñeca grip): los largos en el plano a1/a2 mantienen exactos los largos 3D, y d2(deg) es la distancia hombro-muñeca en el
 * plano que da un ángulo 3D de codo de deg.
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
 * Dominadas: u = subida (0 colgado, 1 arriba limpio). El hombro sube desde justo bajo la muñeca hasta 6 cm bajo la barra
 * y 9 cm detrás; arriba el torso se inclina 12° y la cadera se flexiona 10°; la cabeza se inclina 15° hacia atrás.
 * kipF (fase de la repetición 0..1, solo repeticiones con impulso): rodillas arriba en la primera mitad (cadera +70°, rodillas
 * +60°) y un balanceo de ±12° de todo el cuerpo en torno a las manos.
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
    // agarre prono: los nudillos del índice y del meñique envuelven la barra (su promedio ~ centro de la barra), pulgar abajo
    handPts: { 17: { x: 0.005, y: B.y + 0.015 }, 19: { x: 0.03, y: B.y - 0.01 }, 21: { x: -0.025, y: B.y + 0.03 } } };
  const swing = kipF == null ? 0 : g.kipSwing * Math.sin(2 * Math.PI * kipF);
  if (swing) {
    for (const k of BODY_KEYS) if (k !== 'wr') P[k] = rotP(P[k], W, swing);
    P.hv = rotP(P.hv, { x: 0, y: 0 }, swing); P.fv = perp(P.hv);
  }
  return P;
}

/**
 * Fondos: theta = ángulo 3D del codo. El antebrazo se inclina hasta 10° atrás, el hombro queda delante del codo (brazo
 * ~horizontal a 82°), el torso se inclina adelante 5 -> 25°, rodillas dobladas 100° con los pies atrás.
 * kipF (solo repeticiones con impulso): las rodillas se abren de golpe hasta 60° durante el empuje (segunda mitad).
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
    // manos sobre las barras, dedos adelante rodeándolas (nudillos de índice/meñique ~ centro de la barra)
    handPts: { 17: { x: W.x + 0.06, y: W.y + 0.04 }, 19: { x: W.x + 0.075, y: W.y + 0.035 }, 21: { x: W.x + 0.035, y: W.y + 0.045 } } };
}

/** Persona de pie en el suelo en x, brazos colgando a los lados (fin de un soltar). */
function standPose(x) {
  const g = C.standArm, an = { x, y: -0.08 }, kn = { x, y: an.y - C.shank }, hi = { x, y: kn.y - C.thigh }, sh = { x, y: hi.y - C.torso };
  const el = mv(sh, down(4), planar(C.arm1, g.el - C.zSide)), hand = down(8), wr = mv(el, hand, planar(C.arm2, g.wr - g.el)), hv = up(0);
  return { sh, el, wr, hi, kn, an, he: { x: x - 0.06, y: 0 }, fo: { x: x + 0.14, y: 0 }, ear: mv(sh, hv, C.neck), hv, fv: perp(hv),
    hand, lat: { el: g.el, wr: g.wr, hand: g.wr }, faceLat: true };
}

/**
 * Mezcla de dos poses (w = 0 -> A, 1 -> B) para el soltar: los puntos del cuerpo se mueven en línea recta, los segmentos del
 * brazo giran en torno al hombro / codo por el camino más corto (un brazo arriba baja por delante del cuerpo), la mano sigue a la muñeca.
 */
function blendPose(A, B, w) {
  const P = { faceLat: true, handPts: {}, lat: {} }, ha = handPoints(A), hb = handPoints(B);
  const mix = (a, b) => ({ x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w) });
  const ang = (v) => Math.atan2(v.x, v.y) / RAD;                       // ángulo de dirección, como en down()
  const turn = (a0, a1) => a0 + (((((a1 - a0) % 360) + 540) % 360) - 180) * w;
  const seg = (o, a0, a1, b0, b1) => {                                  // tramo a0->a1 de A mezclado con b0->b1 de B, desde o
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

/** Pose de una prueba con barra en t: pose de la repetición y luego (opts.releaseAt) la persona suelta / se baja y queda de pie. */
function barPose(plan, t, v, r) {
  const kipF = r.seg && r.seg.kind === 'kip' ? r.f : null;
  const P = plan.test === 'pullup' ? pullupPose(v, kipF) : dipPose(v, kipF), rel = plan.release;
  return !rel || t < rel.t0 ? P : blendPose(P, standPose(P.hi.x), smooth((t - rel.t0) / rel.dur));
}

// ---- Líneas de tiempo --------------------------------------------------------------------------------------
/** pauseAfter como {rep, seconds} (alias k/after, dur/s) o [rep, seconds]; rep = repeticiones hechas antes de la pausa. */
function pauseOf(p) {
  if (!p) return null;
  return Array.isArray(p) ? { rep: p[0], seconds: p[1] } : { rep: p.rep ?? p.k ?? p.after, seconds: p.seconds ?? p.dur ?? p.s ?? 0 };
}

/** Línea de tiempo de flexiones / sentadillas: un tramo por repetición (perfil coseno suave), breve descanso arriba entre repeticiones. */
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
  // Pruebas con barra (v1): opts.releaseAt (s) = soltar la barra / bajarse de las barras. Las repeticiones que parten en ese
  // momento o después no se hacen; el soltar parte en releaseAt o justo después de la última, dura releaseDur y sigue `tail` de pie.
  // opts.release: true = soltar justo después de la última repetición (en su breve descanso abajo / arriba).
  let tail = o.tail ?? (o.fatigueEnd ? 6 : cfg.tail), release = null, endT;
  if ((o.releaseAt != null || o.release) && cfg.releaseDur) {
    while (n && o.releaseAt != null && segs[n - 1].t0 >= o.releaseAt) { segs.pop(); n--; }
    release = { t0: Math.max(o.releaseAt ?? 0, n ? segs[n - 1].after : (o.lead ?? cfg.lead)), dur: cfg.releaseDur };
    tail = o.tail ?? cfg.tail; t = release.t0 + release.dur; endT = release.t0 + C.releaseLag;
  } else endT = t + tail;
  // Regla de no descansar (CONTRACT: 4 s sin completar una repetición, salvo una en curso): pausa cuando el descanso antes de la
  // próxima repetición juzgada pasa de 3,6 s (el analizador completa una repetición ~0,1 s antes de t1 y ve partir la siguiente
  // ~0,3 s después de t0), o cuando la serie termina más de 4,2 s después de la última. Un titubeo no completa nada: se salta.
  const judged = segs.flatMap((s, k) => (s.kind === 'wobble' ? [] : [k]));
  const paused = (k) => { const j = judged.find((i) => i > k); return j == null ? endT - segs[k].t1 > 4.2 : segs[j].t0 - segs[k].t1 > 3.6; };
  let valid = 0, invalid = 0, streak = 0, endReason = judged.length && segs[judged[0]].t1 > 15.2 ? 'pause' : null;   // resultado esperado según CONTRACT.md
  for (let k = 0; k < n && !endReason; k++) {
    if (segs[k].kind === 'wobble') continue;                           // una duda arriba: no es un intento de repetición
    if (segs[k].kind) { invalid++; streak++; } else { valid++; streak = 0; }
    if (streak >= 2) endReason = 'technique';
    else if (paused(k)) endReason = 'pause';
  }
  if (!endReason && release) {
    // Perder la barra termina la prueba una vez que partió una repetición (dominadas: también antes, las manos bajan de los
    // hombros); soltar los fondos antes de cualquier repetición parece estar de pie en el apoyo y termina por la regla de 15 s.
    if (n || test === 'pullup') endReason = !n && endT > 15.2 ? 'pause' : 'position_lost';
    else if (t + tail > 15.2) endReason = 'pause';
  }
  return { segs, top0: cfg.top, release, total: t + tail, meta: { variant: o.variant, reps: n, kinds: segs.map((s) => s.kind),
    repEnds: segs.map((s) => s.t1), expectedValid: valid, expectedInvalid: invalid, endReason, releaseT: release ? release.t0 : null } };
}

/** Línea de tiempo de la plancha: episodios de cadera hundida (recuperados o no) y una caída al suelo opcional. */
function plankPlan(o) {
  const g = C.plank, seconds = o.seconds ?? 60;
  const sag = (o.sagAt || []).map((e) => ({ t: e.t, depth: e.depth ?? g.sagDepth,
    end: e.recover === false ? (e.dur == null ? Infinity : e.t + e.dur) : e.t + (e.dur ?? g.sagDur) }));
  const lost = o.collapseAt == null ? Infinity : o.collapseAt + g.collapseLag;
  // Resultado esperado = las reglas de aviso del CONTRACT aplicadas al plan: aviso ~1 s después de que la cadera sale de la línea,
  // 5 s para corregir, si sigue hundida se avisa de nuevo al tiro, dos avisos fallidos seguidos terminan la prueba. Precisión de ±1 s.
  let fails = 0, techT = Infinity;
  const cues = [];                                  // {at, failAt}: cuándo sale cada aviso de corrección y (si falla) cuándo se da por perdido
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
  const v = r.seg ? lerp(r.f < 0.5 ? r.top : r.seg.topEnd, r.seg.bottom, r.s) : r.top;     // ángulo del codo (flexión) o de la rodilla (sentadilla)
  if (plan.test === 'pullup' || plan.test === 'dip') return barPose(plan, t, v, r);         // subida (dominada) o codo (fondo)
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
    camera: { roll: o.cameraRoll, pitch: o.cameraPitch, down: { x: B.ex.y + 0, y: B.ey.y + 0, z: B.ez.y + 0 } } });   // + 0: sin -0
  return plan;
}

function makeFrame(plan, o, idx, tMs) {
  const t = idx / o.fps, rnd = mulberry32((Math.imul(o.seed, 7919) + Math.imul(idx, 104729)) | 0);
  const hidden = (o.hide || []).some((h) => t >= h.t && t < h.t + h.dur);
  const cam = plan.test === 'pushup' && plan.variant === 'knees' ? C.pushup.camKnees : C[plan.test].cam;
  return buildFrame(poseAt(plan, t), cam, tMs, o, rnd, hidden);
}

/**
 * Genera una sesión sintética completa (vista de lado, con semilla, determinista).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {object} [opts]
 *   reps (10); invalidAt (índices de repetición desde 0) + kind, o kinds ({índice: kind}); kind = 'shallow' | 'sag' | 'pike' | 'no_lockout'
 *   (flexiones), 'shallow' | 'no_lockout' (sentadillas), 'shallow' (el mentón queda ~11 cm bajo la barra) | 'no_lockout' (codo ~131°
 *   abajo) | 'kip' (rodillas arriba + balanceo) (dominadas), 'shallow' (codo 108°) | 'no_lockout' (135° arriba) | 'kip' (las
 *   rodillas se abren 60° al empujar) (fondos), 'wobble' (una bajada que no es intento: no cuenta ni como válida ni como no válida);
 *   seconds (plancha, 60); fps (30); noise (0,004, unidades de imagen normalizadas, gaussiano); seed (1); sex ('M' punta de pies | 'F' rodillas);
 *   variant ('toes' | 'knees'); aspect (9/16); facing ('right' | 'left'); lead / tail (s quieto antes / después de las repeticiones);
 *   pauseAfter ({rep, seconds}: quieto arriba `seconds` después de `rep` repeticiones); fatigueEnd (6 s quieto al
 *   final); sagAt ([{t, dur, depth, recover}] episodios de cadera hundida en la plancha, depth en m (negativo = cadera alta), recover:false sin
 *   dur = no se recupera); collapseAt (plancha: segundo en que rodillas y caderas caen al suelo);
 *   releaseAt (dominadas/fondos, s: se quitan las repeticiones que parten en ese momento o después, y la persona suelta la barra / se
 *   baja de las barras y queda de pie; `tail` = segundos de pie después); release (true: lo mismo justo después de la última);
 *   cameraRoll / cameraPitch (grados, todas las pruebas, 0 por defecto = cámara derecha, idéntica bit a bit a la v0): la cámara
 *   se gira en torno a su eje óptico (+ = sentido horario visto desde atrás, la escena se ve girada en sentido antihorario) / su
 *   eje x (+ = mira arriba) mientras sigue mirando al mismo punto; lm usan la cámara girada, world usa sus ejes;
 *   hide ([{t, dur}]: todas las visibilidades en 0,1 durante esas ventanas).
 * @returns {{frames: object[], fps: number, meta: object}} PoseFrames (t en ms desde 0) y el resultado esperado:
 *   flexiones/sentadillas/dominadas/fondos: expectedValid, expectedInvalid, endReason ('technique' | 'pause' | 'position_lost' | null),
 *   repEnds (s), kinds, releaseT (s o null); plancha: expectedSeconds, expectedInvalid (avisos fallidos), expectedCues,
 *   endReason ('technique' | 'position_lost' | null), endT (s, precisión de ~1 s). Todas las pruebas: camera {roll, pitch, down}
 *   con down = la gravedad en ejes de la cámara. Las ventanas `hide` no entran en el pronóstico.
 */
function synthSession(test, opts) {
  const o = resolve(test, opts), plan = makePlan(test, o), n = Math.round(plan.total * o.fps), frames = [];
  for (let i = 0; i < n; i++) frames.push(makeFrame(plan, o, i, (i / o.fps) * 1000));
  return { frames, fps: o.fps, meta: plan.meta };
}

/**
 * Un cuadro de la misma sesión en el instante `tSeconds`, repitiendo la sesión en bucle (reproducción del demo). La pose y
 * el ruido son los del cuadro más cercano; `frame.t` es `tSeconds` en ms (sin dar la vuelta, así sigue creciendo).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {number} tSeconds
 * @param {object} [opts] igual que {@link synthSession}; reusar el mismo objeto entre llamadas evita rearmar el plan.
 * @returns {object} PoseFrame
 */
function synthFrameAt(test, tSeconds, opts) {
  if (memo.test !== test || memo.opts !== opts) { const o = resolve(test, opts); memo = { test, opts, o, plan: makePlan(test, o) }; }
  const { o, plan } = memo, n = Math.max(1, Math.round(plan.total * o.fps));
  return makeFrame(plan, o, ((Math.round(tSeconds * o.fps) % n) + n) % n, tSeconds * 1000);
}
let memo = { test: null, opts: null, o: null, plan: null };

export { SYNTH_CONFIG, synthSession, synthFrameAt };
