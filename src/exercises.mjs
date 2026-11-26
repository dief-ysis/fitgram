// FitGram, analizadores de ejercicios: flexiones (CSEP), sentadillas (ACE) y plancha en antebrazos (Strand 2014).
// Autónomo (sin imports, sin DOM). Entrada = Joints de skeleton.mjs#toJoints: j2 en unidades de imagen corregidas por
// aspecto (y HACIA ABAJO = gravedad), j3 en metros (y hacia abajo) o null, t en ms. Salida = AnalyzerState (ver CONTRACT.md).
// Diseño: un núcleo común (elección de lado, visibilidad, suavizado, eventos, estado) + una pequeña máquina de estados por prueba.

/** Umbrales congelados y mensajes. Los comentarios dicen de dónde sale cada número (CONTRACT/protocolo o decisión de ingeniería). */
const EX_CONFIG = Object.freeze({
  common: Object.freeze({
    visMean: 0.5,            // CONTRACT: las articulaciones clave deben verse (visibilidad media de las clave >= 0,5)
    visMinJoint: 0.25,       // ingeniería: una sola articulación clave bajo esto deja el cuadro inservible
    invisibleWarnSec: 1.5,   // CONTRACT: invisible más que esto -> visible=false + aviso
    invisibleEndSec: 4,      // CONTRACT: invisible más que esto -> termina 'not_visible'
    sideMargin: 0.1,         // ingeniería: el otro lado del cuerpo debe verse esto más para cambiar (histéresis)
    smoothSec: 0.2,          // ingeniería: mediana en ventana de tiempo aplicada a cada señal
    smoothMax: 9,            // ingeniería: máximo de muestras en esa ventana
    gapFreezeSec: 0.5,       // ingeniería: huecos entre cuadros más largos que esto son tiempo congelado (no cuenta) ...
    nominalFrameSec: 1 / 30, // ... salvo un cuadro nominal
    startAnchorSec: 2,       // ingeniería: start(t) puede marcarse a lo más esto antes del primer cuadro (protección contra relojes distintos)
    sideViewMax: 0.45,       // ingeniería: separación de hombros / largo del tronco sobre esto = de frente a la cámara
    voidCycleSec: 0.5,       // ingeniería: una repetición en curso durante un corte más largo se descarta (no se juzga)
    goodCueSec: 1.0,         // ingeniería: "¡Bien!" queda en state.cue este tiempo
    badCueSec: 2.0,          // ingeniería: un aviso de corrección queda en state.cue este tiempo
  }),
  pushup: Object.freeze({
    topElbow: 150,           // CONTRACT / CSEP: brazos completamente extendidos arriba
    bottomElbow: 95,         // CONTRACT / CSEP: codos a ~90° abajo
    descentElbow: 140,       // ingeniería: histéresis, la repetición parte cuando el codo baja de esto
    partialRise: 30,         // ingeniería: una subida de >= 30° después del fondo ...
    partialDrop: 12,         // ... que vuelve a caer 12° antes de extender ...
    partialHoldSec: 0.25,    // ... y se queda abajo este tiempo (el ruido no lo imita) = repetición incompleta ("Extiende los brazos")
    minLine: 163,            // CONTRACT dice ~155; ajustado: 163 = ~9 cm de desvío de la cadera respecto de la línea hombro-tobillo, así la
                             // cadera hundida de 12 cm (158,7°) y la alta de 15 cm (153,6°) del generador se detectan con margen
    minLineKnees: 160,       // la misma tolerancia de ~9 cm en la línea más corta hombro-cadera-rodilla (variante de rodillas)
    lineHoldSec: 0.3,        // ingeniería: la línea debe quedar bajo minLine este tiempo en una repetición (una muestra ruidosa no es cadera hundida)
    startTorsoMax: 50,       // ingeniería: inclinación del torso en la posición inicial (la variante de rodillas se inclina ~35°)
    attemptElbow: 125,       // ingeniería: una bajada que nunca pasa de esto es un titubeo, no un intento de repetición (se ignora)
    startElbowMin: 150,      // = topElbow: brazos extendidos antes de empezar
    pauseSec: 4,             // CONTRACT: ninguna repetición completa durante este tiempo después de la primera -> termina 'pause'
    firstRepSec: 15,         // CONTRACT: ninguna repetición este tiempo después del inicio -> termina 'pause'
    maxRepSec: 8,            // arreglo de revisión: una repetición lenta en curso puede durar esto antes de que la regla de no descansar termine la prueba
    maxInvalidInRow: 2,      // CONTRACT: repeticiones no válidas seguidas que terminan la prueba ('technique')
  }),
  squat: Object.freeze({
    standKnee: 160,          // CONTRACT: de pie = rodilla >= 160 ...
    standTorso: 60,          // ingeniería: ... y torso inclinado >= 60 respecto de la horizontal (casi vertical)
    descentKnee: 150,        // ingeniería: histéresis, la repetición parte cuando la rodilla baja de esto
    bottomKnee: 70,          // arreglo de revisión: el ángulo de rodilla es solo RESPALDO cuando faltan las alturas de cadera/rodilla (con la canilla a ~30°, 95° sigue 35° sobre paralelo)
    attemptHipDrop: 0.18,    // arreglo de revisión: la cadera debe bajar >= 0,18 muslos bajo su altura de pie para que cuente como intento (pasos o cambios de peso se ignoran)
    maxRepSec: 8,            // arreglo de revisión: una repetición en curso puede durar esto antes de que la regla de no descansar termine la prueba
    attemptKnee: 135,        // ingeniería: una bajada que nunca pasa de esto es un titubeo, no un intento de repetición (se ignora)
    parallelTol: 0.15,       // CONTRACT: cadera a la altura de la rodilla (o más abajo) menos 15 % del largo del muslo cuenta como paralelo
    partialRise: 30, partialDrop: 12, partialHoldSec: 0.25,   // ingeniería: la misma regla de repetición incompleta que en flexiones ("Sube completo")
    pauseSec: 4, firstRepSec: 15, maxInvalidInRow: 2,   // CONTRACT
  }),
  plank: Object.freeze({
    startTorsoMax: 25,       // CONTRACT: torso a ~25° o menos de la horizontal
    elbowMin: 70, elbowMax: 110,   // CONTRACT: codos doblados ~70-110°
    armTiltMax: 20,          // ingeniería: brazo a 20° o menos de la vertical (codo bajo el hombro)
    kneeMin: 150,            // ingeniería: rodillas rectas (CONTRACT: "rodillas rectas")
    lineOk: 160,             // CONTRACT: línea del cuerpo hombro-cadera-tobillo >= ~160
    lineHys: 3,              // ingeniería: histéresis para que el ruido cerca de 160 no haga saltar el estado
    holdSec: 1.0,            // CONTRACT: sostener la posición 1 s parte el reloj (contado desde el inicio de ese segundo)
    cueAfterSec: 1.0,        // CONTRACT: línea < 160 por > 1 s -> aviso de corrección
    cueWindowSec: 5.0,       // CONTRACT: un aviso falla si la postura no se corrige en 5 s
    restoreSec: 0.5,         // CONTRACT: corregida = línea >= 160 durante 0,5 s
    maxFailedCues: 2,        // CONTRACT: avisos fallidos seguidos que terminan la prueba ('technique')
    lostLine: 130,           // CONTRACT: línea < ~130 = rodillas/caderas en el suelo
    lostLineSec: 0.3,        // ingeniería: filtro de rebote para la regla de la línea
    lostTorso: 40,           // ingeniería: inclinación del torso sobre esto ...
    lostTorsoSec: 1.0,       // CONTRACT: ... por > 1 s = ya no está horizontal
    lostArmTilt: 45,         // ingeniería (25-nov-2026, video de David): acostado en el suelo, la línea y el torso siguen rectos, pero
    lostArmSec: 1.0,         // el brazo pasa de casi vertical (5-30°) a 60-85°: sobre 45° durante 1 s = perdió la posición
    startTimeoutSec: 30,     // ingeniería: si no sostiene la posición en este tiempo después de start() -> termina 'position_lost'
  }),
  msg: Object.freeze({
    good: '¡Bien!', lower: 'Baja más', extend: 'Extiende los brazos', hipLow: 'Cadera caída', hipHigh: 'Cadera alta',
    depth: 'Baja hasta muslos paralelos', standUp: 'Sube completo', raiseHip: 'Sube la cadera', lowerHip: 'Baja la cadera',
    notVisible: 'No te veo completo', sideOn: 'Ponte de lado a la cámara', hold: 'Mantén la posición',
    pushupPos: 'Ponte en posición de flexiones', standTall: 'Ponte de pie, erguido', kneesStraight: 'Estira las rodillas',
    plankPos: 'Apóyate en antebrazos y puntas de los pies', plankArms: 'Apoya los antebrazos bajo los hombros',
    ready: '¡Bien! Mantén la posición', go: '¡Comienza!',
    end: Object.freeze({ manual: 'Prueba terminada', technique: 'Fin: técnica no válida', pause: 'Fin: pausa muy larga',
      position_lost: 'Fin: perdiste la posición', not_visible: 'Fin: no te veo' }),
  }),
});

const CM = EX_CONFIG.common, MSG = EX_CONFIG.msg;
const DEG = 180 / Math.PI;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => (finite(v) ? Math.round(v * 10) / 10 : null);

/** Ángulo interior en b (grados) para puntos {x, y[, z]}; usa z solo si los tres puntos la tienen. */
function angleAt(a, b, c) {
  const has3 = finite(a.z) && finite(b.z) && finite(c.z);
  const u = [a.x - b.x, a.y - b.y, has3 ? a.z - b.z : 0], w = [c.x - b.x, c.y - b.y, has3 ? c.z - b.z : 0];
  const n = Math.hypot(...u) * Math.hypot(...w);
  if (!(n > 1e-9)) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / n))) * DEG;
}

/** Suavizador de mediana en ventana de tiempo por señal; resiste t irregulares y saltos. */
function makeSmoother() {
  const buf = {};
  const get = (key) => {
    const b = buf[key];
    if (!b || !b.length) return null;
    const s = b.map((x) => x[1]).sort((p, q) => p - q), m = s.length >> 1;
    return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return {
    push(key, t, v) {
      const b = (buf[key] ??= []);
      if (finite(v)) b.push([t, v]);
      while (b.length && (t - b[0][0] > CM.smoothSec || b.length > CM.smoothMax)) b.shift();
      return get(key);
    },
    get,
    reset() { for (const k of Object.keys(buf)) delete buf[k]; },
  };
}

// ---- Medición: señales de cada cuadro para el lado del cuerpo elegido ------------------------------------------
const PARTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
const SIGNALS = ['elbow', 'knee', 'hip', 'line', 'torso', 'tilt', 'dev', 'hipKnee', 'hipH', 'sideView'];
const KEY_JOINTS = {
  pushup: { toes: ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'], knees: ['shoulder', 'elbow', 'wrist', 'hip', 'knee'] },
  squat: ['shoulder', 'hip', 'knee', 'ankle'],
  plank: ['shoulder', 'elbow', 'hip', 'knee', 'ankle'],
};

/** Visibilidad media de hombro/codo/muñeca/cadera/rodilla/tobillo de un lado ('l_' | 'r_'). */
function sideScore(j2, p) {
  let s = 0;
  for (const n of PARTS) s += j2[p + n] ? j2[p + n].v : 0;
  return s / PARTS.length;
}

/** Lado del cuerpo con mayor visibilidad media; cambia solo si el otro lado gana por más de sideMargin. */
function pickSide(j2, prev) {
  const ml = sideScore(j2, 'l_'), mr = sideScore(j2, 'r_');
  if (prev == null) return ml >= mr ? 'l_' : 'r_';
  const cand = ml > mr ? 'l_' : 'r_';
  return cand !== prev && Math.abs(ml - mr) > CM.sideMargin ? cand : prev;
}

/**
 * Señales crudas del lado p. Los ángulos de flexión usan j3 cuando las tres articulaciones se ven ahí; si no, j2 (corregido
 * por aspecto). Las señales ligadas a la gravedad usan solo j2 (y hacia abajo): torso/tilt son inclinaciones respecto de la
 * horizontal/vertical, dev es la distancia con signo de la cadera a la línea hombro-tobillo (rodillas: hombro-rodilla) como
 * fracción de esa línea (+ = cadera abajo = hundida), hipKnee es (cadera.y - rodilla.y) / largo del muslo (+ = cadera bajo la rodilla).
 */
function measure(jn, p, test, variant) {
  const j2 = jn.j2, j3 = jn.j3 || null, g = (n) => j2[p + n] || null;
  const vs = (test === 'pushup' ? KEY_JOINTS.pushup[variant] : KEY_JOINTS[test]).map((n) => (g(n) ? g(n).v : 0));
  const good = vs.reduce((a, b) => a + b, 0) / vs.length >= CM.visMean && Math.min(...vs) >= CM.visMinJoint;
  const use3 = (...ns) => j3 && ns.every((n) => j3[p + n] && j3[p + n].v >= CM.visMean);
  const ang = (a, b, c) => {
    if (use3(a, b, c)) return angleAt(j3[p + a], j3[p + b], j3[p + c]);
    return g(a) && g(b) && g(c) ? angleAt(g(a), g(b), g(c)) : null;
  };
  const S = g('shoulder'), H = g('hip'), K = g('knee'), E = g('elbow'), L = g(variant === 'knees' ? 'knee' : 'ankle');
  const sig = { elbow: ang('shoulder', 'elbow', 'wrist'), knee: ang('hip', 'knee', 'ankle'), hip: ang('shoulder', 'hip', 'knee'),
    line: ang('shoulder', 'hip', variant === 'knees' ? 'knee' : 'ankle'),
    torso: S && H ? Math.atan2(Math.abs(S.y - H.y), Math.abs(S.x - H.x)) * DEG : null,
    tilt: S && E ? Math.atan2(Math.abs(E.x - S.x), Math.abs(E.y - S.y)) * DEG : null,
    dev: null, hipKnee: null, hipH: null, sideView: null };
  if (S && H && L && Math.abs(L.x - S.x) > 1e-6) {
    const dx = L.x - S.x, dy = L.y - S.y, len = Math.hypot(dx, dy);
    sig.dev = (-((H.x - S.x) * dy - (H.y - S.y) * dx) / len * Math.sign(dx)) / len;
  }
  if (H && K && Math.hypot(H.x - K.x, H.y - K.y) > 1e-6) sig.hipKnee = (H.y - K.y) / Math.hypot(H.x - K.x, H.y - K.y);
  // hipH: altura de la cadera sobre el suelo (tobillo/talón visible más bajo), en muslos; distingue una sentadilla de un paso.
  const floorY = Math.max(...['l_ankle', 'r_ankle', 'l_heel', 'r_heel'].map((n) => (j2[n] && j2[n].v >= CM.visMinJoint ? j2[n].y : -Infinity)));
  if (H && K && Number.isFinite(floorY) && Math.hypot(H.x - K.x, H.y - K.y) > 1e-6) sig.hipH = (floorY - H.y) / Math.hypot(H.x - K.x, H.y - K.y);
  if (j2.l_shoulder && j2.r_shoulder && S && H && Math.hypot(S.x - H.x, S.y - H.y) > 1e-6) {
    sig.sideView = Math.hypot(j2.l_shoulder.x - j2.r_shoulder.x, j2.l_shoulder.y - j2.r_shoulder.y) / Math.hypot(S.x - H.x, S.y - H.y);
  }
  return { good, sig };
}

// ---- Revisión de la posición inicial (la usan check() y la espera de la plancha) ------------------------------
const needs = (sm, ...ks) => ks.every((k) => finite(sm[k]));
const hipMsg = (sm) => (finite(sm.dev) && sm.dev > 0 ? MSG.raiseHip : MSG.lowerHip);   // hundida -> subir, alta -> bajar

/** Primer problema de la posición inicial de flexiones, o null. */
function pushupIssue(sm, variant) {
  const c = EX_CONFIG.pushup;
  if (!needs(sm, 'torso', 'elbow', 'line')) return MSG.notVisible;
  if (finite(sm.sideView) && sm.sideView > CM.sideViewMax) return MSG.sideOn;
  if (sm.torso > c.startTorsoMax) return MSG.pushupPos;
  if (sm.elbow < c.startElbowMin) return MSG.extend;
  return sm.line < (variant === 'knees' ? c.minLineKnees : c.minLine) ? hipMsg(sm) : null;
}

/** Primer problema de la posición inicial de sentadillas, o null. */
function squatIssue(sm) {
  const c = EX_CONFIG.squat;
  if (!needs(sm, 'torso', 'knee')) return MSG.notVisible;
  if (finite(sm.sideView) && sm.sideView > CM.sideViewMax) return MSG.sideOn;
  if (sm.torso < c.standTorso) return MSG.standTall;
  return sm.knee < c.standKnee ? MSG.kneesStraight : null;
}

/** Primer problema de la posición inicial de la plancha, o null. */
function plankIssue(sm) {
  const c = EX_CONFIG.plank;
  if (!needs(sm, 'torso', 'elbow', 'tilt', 'knee', 'line')) return MSG.notVisible;
  if (finite(sm.sideView) && sm.sideView > CM.sideViewMax) return MSG.sideOn;
  if (sm.torso > c.startTorsoMax) return MSG.plankPos;
  if (sm.tilt > c.armTiltMax || sm.elbow < c.elbowMin || sm.elbow > c.elbowMax) return MSG.plankArms;
  if (sm.knee < c.kneeMin) return MSG.kneesStraight;
  return sm.line < c.lineOk ? hipMsg(sm) : null;
}

const ISSUE = { pushup: pushupIssue, squat: squatIssue, plank: plankIssue };

// ---- Núcleo: estado común, eventos, avisos --------------------------------------------------------------------
function createCore(test, variant) {
  const S = { test, variant, started: false, phase: 'waiting', value: 0, invalid: 0, log: [], events: [], timed: null, sticky: null,
    visible: true, endReason: null, lastT: null, frozen: 0, startEff: 0, eff: 0, badStart: null, side: null, cur: {}, sm: makeSmoother() };
  S.emit = (type, t, msg) => S.events.push({ type, t, msg });
  S.timedCue = (level, msg, sec) => { S.timed = { level, msg, until: S.eff + sec }; };
  S.end = (reason, t) => {
    if (S.phase === 'ended') return;
    S.phase = 'ended'; S.endReason = reason; S.sticky = null; S.timed = null;
    S.emit('end', t, MSG.end[reason] ?? MSG.end.manual);
  };
  return S;
}

function stateOf(S) {
  const live = S.phase !== 'ended', m = S.cur;
  const timed = S.timed && S.timed.until > S.eff ? { level: S.timed.level, msg: S.timed.msg } : null;
  const cue = !live ? null : !S.visible ? { level: 'bad', msg: MSG.notVisible } : S.sticky ? { ...S.sticky } : timed;
  return { test: S.test, phase: S.phase, value: S.value, invalid: S.invalid, cue, events: S.events.splice(0),
    metrics: { elbow: r1(m.elbow), knee: r1(m.knee), hip: r1(m.hip), line: r1(m.line), torso: r1(m.torso) },
    visible: S.visible, log: S.log.map((e) => ({ ...e })), endReason: S.endReason,
    // Segundos en que la app NO estuvo mirando: detector sin encontrar a nadie
    // o cuadros que llegaron tarde. Las repeticiones que pasen ahí no se
    // cuentan, y sin este número el resultado sale bajo sin decir por qué.
    sinVer: r1(S.frozen) };
}

// ---- Flexiones / sentadillas: una máquina de ciclos (listo -> arriba -> abajo -> arriba ...) ------------------------------------
const REP_SPECS = {
  pushup: { sig: 'elbow', descent: 'descentElbow', attempt: 'attemptElbow', msgDepth: MSG.lower, msgPartial: MSG.extend,
    isTop: (sm, c) => finite(sm.elbow) && sm.elbow >= c.topElbow,
    depth: (sm, c) => finite(sm.elbow) && sm.elbow <= c.bottomElbow,
    line: true,
    quality: (cyc) => (cyc.lineBad ? (cyc.dev > 0 ? MSG.hipLow : MSG.hipHigh) : null) },
  squat: { sig: 'knee', descent: 'descentKnee', attempt: 'attemptKnee', msgDepth: MSG.depth, msgPartial: MSG.standUp,
    isTop: (sm, c) => finite(sm.knee) && sm.knee >= c.standKnee && (!finite(sm.torso) || sm.torso >= c.standTorso),
    depth: (sm, c) => (finite(sm.hipKnee) ? sm.hipKnee >= -c.parallelTol : finite(sm.knee) && sm.knee <= c.bottomKnee),
    hipDrop: true,
    quality: () => null },
};

/**
 * Una repetición = dejar arriba (señal < descent), pasar por el fondo, volver arriba. Un ciclo completo es válido si llegó
 * a la profundidad y (flexiones) mantuvo la línea del cuerpo; una subida que vuelve a caer antes de arriba es incompleta.
 */
function repMachine(S, test) {
  const spec = REP_SPECS[test], c = EX_CONFIG[test], m = { st: 'ready', cyc: null, lastEff: null, streak: 0, dropSince: null, topHipH: null };
  const newCycle = (sm) => ({ min: sm[spec.sig], peak: sm[spec.sig], depthOk: false, lineSince: null, lineBad: false, dev: 0,
    startEff: S.eff, hip0: m.topHipH, hipMin: finite(sm.hipH) ? sm.hipH : null });
  const track = (cyc, sm) => {
    const v = sm[spec.sig];
    if (finite(sm.hipH)) cyc.hipMin = cyc.hipMin == null ? sm.hipH : Math.min(cyc.hipMin, sm.hipH);
    if (v < cyc.min) { cyc.min = v; cyc.peak = v; } else cyc.peak = Math.max(cyc.peak, v);
    if (spec.depth(sm, c)) cyc.depthOk = true;
    if (spec.line && finite(sm.line)) {          // sostenido, no una sola muestra ruidosa
      if (sm.line >= (S.variant === 'knees' ? c.minLineKnees : c.minLine)) cyc.lineSince = null;
      else {
        cyc.lineSince ??= S.eff;
        if (S.eff - cyc.lineSince >= c.lineHoldSec) { cyc.lineBad = true; cyc.dev = finite(sm.dev) ? sm.dev : cyc.dev; }
      }
    }
  };
  const finish = (cyc, partial, t) => {
    if (cyc.min > c[spec.attempt]) return;          // titubeo: nunca dejó arriba de verdad, nada que juzgar
    // Un paso o un cambio de peso dobla la rodilla sin bajar la cadera: no es intento de sentadilla, nada que juzgar.
    if (spec.hipDrop && finite(cyc.hip0) && finite(cyc.hipMin) && cyc.hip0 - cyc.hipMin < c.attemptHipDrop) return;
    const reason = !cyc.depthOk ? spec.msgDepth : partial ? spec.msgPartial : spec.quality(cyc, c);
    const valid = reason == null;
    if (valid) S.value++; else S.invalid++;
    S.log.push({ t, valid, reason });
    S.emit(valid ? 'rep' : 'invalid', t, valid ? MSG.good : reason);
    S.timedCue(valid ? 'good' : 'bad', valid ? MSG.good : reason, valid ? CM.goodCueSec : CM.badCueSec);
    m.lastEff = S.eff;
    m.streak = valid ? 0 : m.streak + 1;
    if (m.streak >= c.maxInvalidInRow) S.end('technique', t);
  };
  return {
    voidCycle() {                      // hubo movimiento sin ver: espera el próximo arriba completo y reinicia la ventana de pausa
      if (m.st !== 'down') return;
      m.st = 'ready'; m.cyc = null; m.dropSince = null;
      if (m.lastEff != null) m.lastEff = S.eff;
    },
    step(sm, t) {
      const v = sm[spec.sig];
      if (finite(v)) {
        if (m.st === 'ready') { if (spec.isTop(sm, c)) { m.st = 'top'; if (finite(sm.hipH)) m.topHipH = sm.hipH; } }
        else if (m.st === 'top') {
          if (v < c[spec.descent]) { m.st = 'down'; m.cyc = newCycle(sm); track(m.cyc, sm); }
          else if (finite(sm.hipH) && spec.isTop(sm, c)) m.topHipH = sm.hipH;
        }
        else {
          track(m.cyc, sm);
          if (spec.isTop(sm, c)) { finish(m.cyc, false, t); m.st = 'top'; m.dropSince = null; if (finite(sm.hipH)) m.topHipH = sm.hipH; }
          else if (m.cyc.peak - m.cyc.min >= c.partialRise && v <= m.cyc.peak - c.partialDrop) {
            m.dropSince ??= S.eff;
            if (S.eff - m.dropSince >= c.partialHoldSec) {
              finish(m.cyc, true, t);
              m.cyc = newCycle(sm); track(m.cyc, sm); m.dropSince = null;      // la recaída es el inicio de la próxima bajada
            }
          } else m.dropSince = null;
        }
      }
      if (S.phase === 'ended') return;
      const since = m.lastEff ?? S.startEff, limit = m.lastEff == null ? c.firstRepSec : c.pauseSec;
      // No se permite descansar, pero una repetición lenta que sigue moviéndose no es pausa (hasta maxRepSec).
      const midRep = m.st === 'down' && m.cyc && S.eff - m.cyc.startEff <= c.maxRepSec;
      if (S.eff - since > limit && !midRep) S.end('pause', t);
    },
  };
}

// ---- Plancha: espera (sostener 1 s) -> activa (reloj + avisos de corrección) -> terminada -----------------------
function plankMachine(S) {
  const c = EX_CONFIG.plank;
  const m = { active: false, holdStart: null, holdStartT: 0, bad: false, badSince: null, okSince: null,
    pend: null, fails: 0, lostLine: null, lostTorso: null, lostLineT: null, lostTorsoT: null, lostArm: null, lostArmT: null };
  const settle = (ok, t) => {              // resuelve el aviso de corrección pendiente
    const p = m.pend;
    m.pend = null; S.sticky = null;
    S.log.push({ t: p.t, valid: ok, reason: p.msg });
    if (ok) { m.fails = 0; S.timedCue('good', MSG.good, CM.goodCueSec); }
    else { S.invalid++; m.fails++; if (m.fails >= c.maxFailedCues) S.end('technique', t); }
  };
  return {
    // El reloj de la plancha usa el tiempo real de los cuadros (un corte corto del seguimiento no lo pausa); los avisos usan S.eff.
    stopValue(tMs) { if (m.active) S.value = Math.max(S.value, r1((tMs - m.holdStartT) / 1000)); },
    step(sm, t) {
      const eff = S.eff;
      if (!m.active) {
        const issue = plankIssue(sm);
        if (issue == null) {
          if (m.holdStart == null) { m.holdStart = eff; m.holdStartT = t; }
          S.sticky = { level: 'good', msg: MSG.hold };
          if (eff - m.holdStart >= c.holdSec - 1e-6) {          // el reloj parte al inicio del segundo sostenido
            m.active = true; S.phase = 'active'; S.sticky = null;
            S.value = r1((t - m.holdStartT) / 1000);
            S.emit('start', m.holdStartT, MSG.hold);
          }
        } else { m.holdStart = null; S.sticky = { level: 'warn', msg: issue }; }
        if (!m.active && eff - S.startEff > c.startTimeoutSec) S.end('position_lost', t);
        return;
      }
      S.value = r1((t - m.holdStartT) / 1000);
      m.lostLine = finite(sm.line) && sm.line < c.lostLine ? (m.lostLine ?? eff) : null;
      m.lostTorso = finite(sm.torso) && sm.torso > c.lostTorso ? (m.lostTorso ?? eff) : null;
      m.lostLineT = m.lostLine == null ? null : (m.lostLineT ?? t);
      m.lostTorsoT = m.lostTorso == null ? null : (m.lostTorsoT ?? t);
      m.lostArm = finite(sm.tilt) && sm.tilt > c.lostArmTilt ? (m.lostArm ?? eff) : null;
      m.lostArmT = m.lostArm == null ? null : (m.lostArmT ?? t);
      if ((m.lostLine != null && eff - m.lostLine >= c.lostLineSec) || (m.lostTorso != null && eff - m.lostTorso >= c.lostTorsoSec)
        || (m.lostArm != null && eff - m.lostArm >= c.lostArmSec)) {
        // La plancha terminó cuando la posición empezó a perderse, no cuando se confirmó.
        const lossT = Math.min(...[m.lostLineT, m.lostTorsoT, m.lostArmT].filter((x) => x != null));
        S.value = r1(Math.max(0, (lossT - m.holdStartT) / 1000));
        S.end('position_lost', t);
        return;
      }
      if (finite(sm.line)) { if (sm.line < c.lineOk) m.bad = true; else if (sm.line >= c.lineOk + c.lineHys) m.bad = false; }
      if (m.bad) { m.badSince ??= eff; m.okSince = null; } else { m.badSince = null; m.okSince ??= eff; }
      if (m.pend) {
        if (m.okSince != null && eff - m.okSince >= c.restoreSec) settle(true, t);
        else if (eff - m.pend.eff >= c.cueWindowSec) settle(false, t);
      }
      if (S.phase !== 'ended' && !m.pend && m.badSince != null && eff - m.badSince >= c.cueAfterSec) {
        const msg = hipMsg(sm);                 // sale de nuevo al tiro si el primer aviso falló y la cadera sigue fuera de la línea
        m.pend = { eff, t, msg };
        S.sticky = { level: 'warn', msg };
        S.emit('cue', t, msg);
      }
    },
  };
}

// ---- API pública -----------------------------------------------------------------------------------------------
/**
 * Crea el analizador de una prueba. Los cuadros llegan como `Joints` (skeleton.mjs#toJoints); los tiempos en ms del reloj de los cuadros.
 *  - `check(joints)` -> `{ ok, msg }`: ¿está bien la posición inicial? (se llama en cada cuadro antes de la prueba)
 *  - `start(t)`: la prueba parte ahora (flexiones/sentadillas: fase 'active' + evento 'start'; plancha: fase 'waiting' hasta
 *    sostener la posición 1 s, luego 'active' con el reloj contado desde el inicio de ese segundo)
 *  - `update(joints)` -> AnalyzerState `{ test, phase, value, invalid, cue, events, metrics, visible, log, endReason }`;
 *    `events` son los nuevos desde la llamada anterior ('rep'|'invalid'|'cue'|'start'|'end'; una repetición no válida llega por
 *    su evento 'invalid', cuyo msg es el motivo, y por `cue`, sin un evento 'cue' aparte). Cuadros con t <= al anterior se ignoran.
 *  - `stop(t, reason='manual')` -> AnalyzerState final (termina la prueba; en la plancha el valor es el reloj en t).
 * @param {'pushup'|'squat'|'plank'} test
 * @param {{sex?: 'M'|'F', variant?: 'toes'|'knees'}} [opts] variante de flexiones: 'M' (por defecto) punta de pies, 'F' rodillas (CSEP); `variant` manda
 * @returns {{check: (joints: object) => {ok: boolean, msg: string}, start: (t: number) => void,
 *   update: (joints: object) => object, stop: (t: number, reason?: string) => object}}
 */
function createAnalyzer(test, opts) {
  opts = opts ?? {};
  if (test !== 'pushup' && test !== 'squat' && test !== 'plank') throw new Error(`createAnalyzer: unknown test "${test}"`);
  const variant = test === 'pushup' && (opts.variant ?? (opts.sex === 'F' ? 'knees' : 'toes')) === 'knees' ? 'knees' : 'toes';
  let S, machine;
  const reset = () => { S = createCore(test, variant); machine = test === 'plank' ? plankMachine(S) : repMachine(S, test); };
  reset();
  const pre = makeSmoother();
  let preSide = null, preT = -Infinity;
  const feed = (sm, ts, sig) => { for (const k of SIGNALS) sm.push(k, ts, sig[k]); };
  const read = (sm) => { const o = {}; for (const k of SIGNALS) o[k] = sm.get(k); return o; };
  return {
    check(jn) {
      if (!jn || !jn.j2) return { ok: false, msg: MSG.notVisible };
      const ts = jn.t / 1000;
      if (!finite(ts)) return { ok: false, msg: MSG.notVisible };
      if (ts < preT) { pre.reset(); preSide = null; }
      preT = ts;
      preSide = pickSide(jn.j2, preSide);
      const { good, sig } = measure(jn, preSide, test, variant);
      if (!good) return { ok: false, msg: MSG.notVisible };
      feed(pre, ts, sig);
      const issue = ISSUE[test](read(pre), variant);
      return issue ? { ok: false, msg: issue } : { ok: true, msg: MSG.ready };
    },
    start(t) {
      reset();
      S.started = true; S.startEff = S.eff = t / 1000;
      S.phase = test === 'plank' ? 'waiting' : 'active';
      if (test !== 'plank') S.emit('start', t, MSG.go);
    },
    update(jn) {
      if (S.phase === 'ended' || !jn || !jn.j2) return stateOf(S);
      const ts = jn.t / 1000;
      if (!finite(ts) || (S.lastT != null && ts <= S.lastT)) return stateOf(S);   // cuadro malo / que retrocede / repetido
      if (S.lastT == null) S.startEff = Math.max(S.startEff, ts - CM.startAnchorSec);              // start(t) marcado mucho antes del primer cuadro
      S.side = pickSide(jn.j2, S.side);
      const { good, sig } = measure(jn, S.side, test, variant);
      const dt = S.lastT == null ? 0 : ts - S.lastT, stepDt = dt > CM.gapFreezeSec ? CM.nominalFrameSec : dt;
      S.lastT = ts;
      S.frozen += dt - stepDt;                                          // un hueco largo cuenta como un cuadro nominal
      if (!good) {
        S.frozen += stepDt;                                             // los temporizadores y la máquina se congelan mientras no se ve
        if (S.badStart == null) S.badStart = ts;
        if (S.started) {
          if (ts - S.badStart > CM.invisibleWarnSec && S.visible) { S.visible = false; S.emit('cue', jn.t, MSG.notVisible); }
          if (ts - S.badStart > CM.invisibleEndSec) S.end('not_visible', jn.t);   // el reloj de la plancha queda en el último cuadro bueno
        }
        return stateOf(S);
      }
      if (S.badStart != null && ts - S.badStart > CM.voidCycleSec && machine.voidCycle) machine.voidCycle();
      S.badStart = null; S.visible = true; S.eff = ts - S.frozen;
      feed(S.sm, ts, sig);
      S.cur = read(S.sm);
      if (S.started) machine.step(S.cur, jn.t);
      return stateOf(S);
    },
    stop(t, reason = 'manual') {
      if (S.phase !== 'ended') {
        /* Cuánto rato lleva sin llegar un cuadro. update() solo sabe contar el
           tiempo de los cuadros que llegan: si la cámara se queda pegada no
           pasa nada por ahí, y sin esta cuenta la plancha se lleva de regalo
           todo el rato que la app no vio, con sinVer en cero. Para la persona
           que hizo la prueba es el mismo problema que no verla, visto desde el
           otro lado, así que se trata igual. */
        const ts = t / 1000;
        const hueco = S.lastT == null || !finite(ts) ? 0 : Math.max(0, ts - S.lastT);
        if (hueco > CM.gapFreezeSec) {
          S.frozen += hueco - CM.nominalFrameSec;        // el hueco cuenta como un cuadro nominal, igual que en update()
          if (hueco > CM.invisibleEndSec) { S.visible = false; reason = 'not_visible'; }
        }
        // El reloj no puede pasar del último cuadro que llegó. Si ahora mismo no se ve a nadie, se queda en el último valor bueno.
        if (S.started && machine.stopValue && S.badStart == null) {
          machine.stopValue(hueco > CM.gapFreezeSec ? (S.lastT + CM.nominalFrameSec) * 1000 : t);
        }
        S.end(reason, t);
      }
      return stateOf(S);
    },
  };
}

/* ------------------------------------------------------------------------
   Huella de las reglas de conteo.

   Si un umbral cambia mientras se está tomando el estudio, las mediciones de
   antes y las de después dejan de ser comparables, y hoy nada lo diría: el
   CSV saldría con 45 filas que parecen una sola tanda. Un número de versión a
   mano no sirve, porque lo que se olvida es justamente subirlo.

   Esto sale de las reglas mismas: cualquier cambio en un umbral cambia la
   huella sin que haya que acordarse de nada. Los textos de los avisos quedan
   fuera a propósito: arreglar una falta de ortografía no vuelve incomparables
   las mediciones de ayer.
   ------------------------------------------------------------------------ */

/**
 * Las claves que NO afectan el conteo y por eso no entran en la huella:
 * textos de los avisos, colores y parámetros de dibujo.
 */
const FUERA_DE_HUELLA = Object.freeze(['msg', 'colors', 'draw2D', 'view3D']);

/** Serializa en orden de claves, para que reordenar el objeto no cambie nada. */
function estable(v) {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort()
      .filter((k) => !FUERA_DE_HUELLA.includes(k))
      .map((k) => `${k}:${estable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** FNV-1a de 32 bits en base 36. Corta, legible y suficiente: no es seguridad. */
function huellaDe(reglas) {
  const str = estable(reglas);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/**
 * Deja el código de una función como algo comparable: sin comentarios y con
 * los espacios colapsados.
 *
 * Es lo mismo que hace `estable` con la configuración. Arreglar una falta de
 * ortografía en un comentario o reindentar un bloque no vuelve incomparables
 * las mediciones de ayer; cambiar una condición sí.
 */
function normalizarCodigo(src) {
  const s = String(src);
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {                 // el contenido de un texto va tal cual
      const q = c; out += c; i++;
      while (i < s.length) {
        if (s[i] === '\\') { out += s[i] + (s[i + 1] ?? ''); i += 2; continue; }
        out += s[i];
        if (s[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (/\s/.test(c)) { if (out && !out.endsWith(' ')) out += ' '; i++; continue; }
    out += c; i++;
  }
  return out.trim();
}

/**
 * Las funciones que deciden qué se cuenta.
 *
 * Entran en la huella porque cambiar una de ellas cambia el resultado tanto
 * como cambiar un umbral. Pasó de verdad: arreglar cómo se cierra una prueba
 * cuando la cámara se queda pegada cambió lo que mide la plancha, y una huella
 * que solo mirara la configuración habría dicho que las mediciones de antes y
 * las de después son comparables.
 *
 * Lo que queda fuera es lo que no cuenta nada: los textos, el dibujo, la
 * pantalla de validación, la huella misma.
 */
const CODIGO_DE_CONTEO = Object.freeze([angleAt, makeSmoother, sideScore, pickSide, measure,
  pushupIssue, squatIssue, plankIssue, createCore, stateOf, repMachine, plankMachine, createAnalyzer]);

/** Huella del código de conteo de esta copia. */
function codigoDeConteo() {
  return huellaDe(CODIGO_DE_CONTEO.map((f) => normalizarCodigo(f.toString())));
}

// La huella de esta copia de la app NO se arma acá: tiene que cubrir también
// el suavizado (`SKELETON_CONFIG`), porque cambiar el filtro cambia qué se
// cuenta igual que cambiar un umbral. Se arma en el módulo de la app, que ve
// las dos configuraciones; acá van solo las funciones.

/**
 * Cuánto mira la persona hacia la cámara: separación de los hombros / largo del tronco, en la imagen. Por encima de
 * EX_CONFIG.common.sideViewMax está de frente (o casi) y la rodilla o el codo no se pueden medir. La usa la app para
 * avisar durante la prueba; no cambia qué cuenta como repetición (no está en la huella de las reglas).
 * @param {object} j2 Joints.j2
 * @returns {number|null}
 */
function vistaDeFrente(j2) {
  const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const ls = j2?.l_shoulder, rs = j2?.r_shoulder, lh = j2?.l_hip, rh = j2?.r_hip;
  if (!ok(ls) || !ok(rs) || !ok(lh) || !ok(rh)) return null;
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2, hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
  const torso = Math.hypot(sx - hx, sy - hy);
  return torso > 1e-6 ? Math.hypot(ls.x - rs.x, ls.y - rs.y) / torso : null;
}

export { EX_CONFIG, createAnalyzer, huellaDe, normalizarCodigo, codigoDeConteo, vistaDeFrente };
