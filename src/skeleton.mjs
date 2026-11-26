// FitGram v0 — src/skeleton.mjs
//
// Mapas de articulaciones (BlazePose 33 → Human3.6M 17 / COCO 17), PoseFrame → Joints, suavizado 1€,
// el dibujo 2D sobre el video en vivo, un visor 3D sin dependencias sobre un canvas 2D, y la
// interfaz de "elevador" 2D→3D (puntos de mundo de MediaPipe hoy, VideoPose3D ONNX en la fase 2).
//
// Reglas del módulo (CONTRACT.md): ES2022, sin dependencias, sin tocar el DOM al cargar el módulo,
// funciona igual en Node 22 y en navegadores de celular.
//
// Convenciones de coordenadas en todo el archivo:
// - `lm`    : coordenadas de imagen normalizadas, x,y en [0,1], y HACIA ABAJO, sin espejo (MediaPipe).
// - `world` : metros, origen = centro de caderas, x a la derecha, y HACIA ABAJO, z profundidad (z menor = más cerca).
// - el visor 3D usa por dentro un sistema con y HACIA ARRIBA: X = x, Y = -y, Z = -z (dextrógiro; la
//   cámara de la vista "frente" está en +Z mirando hacia -Z, como la cámara del teléfono).

/**
 * Constantes ajustables de skeleton.mjs, agrupadas y congeladas (CONTRACT: un objeto congelado por módulo).
 * - `headFactor`: coronilla ≈ centroOrejas + headFactor × (centroOrejas − tórax).
 * - `minVisibility`: bajo esto, articulaciones y huesos se dibujan tenues y punteados.
 * - `colors`: convención de captura de movimiento (izquierda del sujeto azul, derecha naranja, eje gris).
 * - `smoother`: valores por defecto de PoseSmoother (filtro 1€, Casiez 2012) ajustados para pose a ~30 fps.
 * - `draw2D` / `view3D`: estilos de dibujo (px de CSS salvo que se diga; tamaños 3D en metros).
 * - `lifter`: valores por defecto del elevador VideoPose3D.
 * @type {Readonly<object>}
 */
const SKELETON_CONFIG = Object.freeze({
  headFactor: 0.45,
  minVisibility: 0.5,
  colors: Object.freeze({ left: '#2F9BD3', right: '#E8613C', axial: '#8A96A3' }),
  smoother: Object.freeze({
    lm: Object.freeze({ minCutoff: 1.0, beta: 20 }),    // unidades de imagen normalizadas (velocidad en unidades/s)
    world: Object.freeze({ minCutoff: 1.0, beta: 10 }), // metros (velocidad en m/s)
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
    fovDeg: 32,                 // campo visual en el lado más corto del canvas
    near: 0.05, minDistance: 1.2, maxDistance: 12, minDepth: 0.6,
    radiusDistance: 3.0,        // cámara a ≥ 3 radios del cuerpo del objetivo (limita la distorsión de perspectiva)
    framing: 0.85,              // los extremos del cuerpo pueden llegar al 85 % de media vista
    background: '#0E1318',
    ankleHeight: 0.08, floorClearance: 0.03, // suelo = mín(tobillo más bajo − 8 cm, articulación más baja − 3 cm)
    gridStep: 0.25, gridHalf: 2.0, gridAlphas: Object.freeze([0.28, 0.18, 0.10, 0.045]), gridRGB: '255,255,255',
    spotAlpha: 0.08, shadowAlpha: 0.24,
    boneRadius: 0.022, jointRadius: 0.03, headRadius: 0.1, minPx: 1.5, maxPx: 16, depthDarken: 0.5,
    fadedAlpha: 0.35, outline: 'rgba(4,7,10,0.55)', ring: 'rgba(255,255,255,0.85)', gloss: 'rgba(255,255,255,0.22)',
    easeSeconds: 0.18, followSeconds: 0.8, fitSeconds: 1.0, autoRotateSpeed: 0.35, // rad/s
    dragPerSide: Math.PI,       // radianes de órbita por arrastre a lo ancho del lado más corto del canvas
    pitchMin: -0.2, pitchMax: 1.5,
    tapSlopPx: 10, tapMaxMs: 300, doubleTapMs: 350,
  }),
  lifter: Object.freeze({ receptiveField: 243, refHeight: 1000 }),
});

/**
 * Nombre de punto de MediaPipe BlazePose → índice (33 puntos; "l_" = la izquierda del sujeto).
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
 * Esqueleto Human3.6M de 17 articulaciones en el orden de VideoPose3D.
 * - `names[i]`, `parents[i]` (−1 para la raíz `pelvis`),
 * - `left` / `right`: índices de los miembros izquierdos/derechos del sujeto (joints_left/right de VideoPose3D),
 * - `bones`: 16 pares de índices `[padre, hijo]`.
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
 * Los 17 índices de BlazePose en el orden de puntos COCO (nariz, ojo i/d, oreja i/d, hombro i/d,
 * codo i/d, muñeca i/d, cadera i/d, rodilla i/d, tobillo i/d) — la entrada 2D de
 * `pretrained_h36m_detectron_coco.bin` de VideoPose3D (puntos COCO de Detectron).
 * @type {ReadonlyArray<number>}
 */
const COCO17_FROM_BLAZEPOSE = Object.freeze([0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

// Índice H36M por nombre, y el lado de dibujo ('left' | 'right' | 'axial') de cada articulación.
const HI = Object.freeze(Object.fromEntries(H36M_NAMES.map((n, i) => [n, i])));
const H_SIDE = Object.freeze(H36M_NAMES.map((_, i) =>
  (H36M.left.includes(i) ? 'left' : H36M.right.includes(i) ? 'right' : 'axial')));

// Nombres de articulaciones que entrega toJoints() (CONTRACT `Joints`).
// Las orejas, las comisuras de la boca y los nudillos del índice y el meñique se agregaron para las pruebas con barra
// (v1 de José, 26-nov-2026): la boca da el mentón de las dominadas y los nudillos, la línea de la barra.
const JOINT_NAMES = Object.freeze([
  'nose', 'l_ear', 'r_ear', 'mouth_l', 'mouth_r', 'l_shoulder', 'r_shoulder', 'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist',
  'l_index', 'r_index', 'l_pinky', 'r_pinky', 'l_hip', 'r_hip',
  'l_knee', 'r_knee', 'l_ankle', 'r_ankle', 'l_heel', 'r_heel', 'l_foot', 'r_foot',
]);

/**
 * Convierte un PoseFrame en la estructura `Joints` que usa exercises.mjs.
 * - `j2[name] = { x: lm.x * aspect, y: lm.y, v }` (unidades de imagen corregidas por aspecto, y hacia abajo),
 * - `j3[name] = { x, y, z, v }` copiado de `frame.world` (metros, y hacia abajo) o `j3 = null`,
 * - `v = visibility ?? 1`. Los puntos que faltan quedan `{ x: NaN, y: NaN, (z: NaN), v: 0 }`.
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

// Receta de cada articulación H36M como suma ponderada de puntos BlazePose: [índices, pesos].
const HEAD_K = SKELETON_CONFIG.headFactor;
const H36M_RECIPE = Object.freeze([
  [[23, 24], [0.5, 0.5]],                                         // 0 pelvis = centro de caderas
  [[24], [1]], [[26], [1]], [[28], [1]],                          // 1-3 pierna derecha
  [[23], [1]], [[25], [1]], [[27], [1]],                          // 4-6 pierna izquierda
  [[23, 24, 11, 12], [0.25, 0.25, 0.25, 0.25]],                   // 7 columna = punto medio(pelvis, tórax)
  [[11, 12], [0.5, 0.5]],                                         // 8 tórax = centro de hombros
  [[0], [1]],                                                     // 9 neck_nose = nariz
  [[7, 8, 11, 12], [(1 + HEAD_K) / 2, (1 + HEAD_K) / 2, -HEAD_K / 2, -HEAD_K / 2]], // 10 coronilla
  [[11], [1]], [[13], [1]], [[15], [1]],                          // 11-13 brazo izquierdo
  [[12], [1]], [[14], [1]], [[16], [1]],                          // 14-16 brazo derecho
].map((r) => Object.freeze(r)));

/** Visibilidad de un punto: `visibility` de MediaPipe, o un `v` ya convertido, si no 1. */
function visOf(p) {
  return p.visibility ?? p.v ?? 1;
}

/**
 * Convierte 33 puntos BlazePose (`lm` 2D o `world` 3D) en las 17 articulaciones Human3.6M.
 * Derivadas: pelvis = centro de caderas; tórax = centro de hombros; columna = punto medio pelvis–tórax;
 * neck_nose = nariz; cabeza (coronilla) = centroOrejas + 0,45 × (centroOrejas − tórax). Las demás van directo.
 * `z` se mantiene si todos los puntos que aportan tienen z numérica; `v` = visibilidad media de esos puntos.
 * Una articulación a la que le falta un punto queda `{ x: NaN, y: NaN, v: 0 }` (nunca lanza error).
 * @param {Array<{x:number,y:number,z?:number,visibility?:number,v?:number}>} points
 * @returns {Array<{x:number,y:number,z?:number,v:number}>} 17 puntos en orden H36M
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
 * Normalización de pantalla de VideoPose3D (`common/camera.py`): `X / w * 2 − [1, h / w]`, o sea x en
 * [0, w] → [−1, 1] e y escalada por el mismo factor (se mantiene la proporción, centro de la imagen → 0).
 * Acepta un arreglo de pares de píxeles `[x, y]` (devuelve un arreglo nuevo de pares) o un solo par.
 * @param {Array<number[]>|number[]} xyPixels
 * @param {number} w ancho de la imagen en píxeles
 * @param {number} h alto de la imagen en píxeles
 * @returns {Array<number[]>|number[]}
 */
function normalizeScreenCoordinates(xyPixels, w, h) {
  if (!(w > 0) || !(h > 0)) throw new RangeError('normalizeScreenCoordinates: w and h must be > 0');
  const f = (p) => [p[0] / w * 2 - 1, p[1] / w * 2 - h / w];
  return isPair(xyPixels) ? f(xyPixels) : Array.from(xyPixels, f);
}

/**
 * Inversa de {@link normalizeScreenCoordinates} (`image_coordinates` de VideoPose3D):
 * `(X + [1, h / w]) * w / 2`. Las mismas formas de entrada (arreglo de pares o un solo par).
 * @param {Array<number[]>|number[]} xyNorm
 * @param {number} w ancho de la imagen en píxeles
 * @param {number} h alto de la imagen en píxeles
 * @returns {Array<number[]>|number[]} coordenadas en píxeles
 */
function imageCoordinates(xyNorm, w, h) {
  if (!(w > 0) || !(h > 0)) throw new RangeError('imageCoordinates: w and h must be > 0');
  const f = (p) => [(p[0] + 1) * w / 2, (p[1] + h / w) * w / 2];
  return isPair(xyNorm) ? f(xyNorm) : Array.from(xyNorm, f);
}

// ───────────────────────────── Suavizado (filtro 1€) ─────────────────────────────

const TWO_PI = 2 * Math.PI;
const DEFAULT_DT = 1 / 30; // período de muestreo supuesto cuando no llega una marca de tiempo usable

/** Factor de suavizado exponencial de un pasa-bajos de primer orden en `cutoff` Hz con paso `dt` s. */
function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * Filtro 1€ escalar (Casiez, Roussel y Vogel, CHI 2012): un pasa-bajos adaptativo cuyo corte
 * crece con la velocidad (filtrada) — `cutoff = minCutoff + beta · |dx/dt|` — así quita el
 * temblor en reposo (`minCutoff` bajo) y mantiene poco retraso en movimientos rápidos (`beta` más alto).
 * Unidades: `minCutoff` y `dCutoff` en Hz, `beta` en 1/(unidad del valor), marcas de tiempo en segundos.
 * Los valores no finitos pasan sin tocar el estado; una marca repetida o más vieja devuelve la
 * última salida; sin marca de tiempo supone 30 Hz.
 */
class OneEuroFilter {
  /**
   * @param {{minCutoff?:number, beta?:number, dCutoff?:number}} [opts]
   *   minCutoff (Hz, por defecto 1), beta (por defecto 0 = pasa-bajos simple), dCutoff (Hz, por defecto 1).
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

  /** Olvida la historia; la próxima muestra se devuelve sin cambios. */
  reset() {
    this._x = NaN;   // último valor filtrado
    this._dx = 0;    // última derivada filtrada (unidades/s)
    this._t = NaN;   // última marca de tiempo (s)
    this._has = false;
  }

  /** Último valor filtrado (NaN antes de la primera muestra). @type {number} */
  get value() {
    return this._x;
  }

  /**
   * Filtra una muestra.
   * @param {number} value muestra cruda
   * @param {number} [tSeconds] marca de tiempo en segundos (siempre creciente)
   * @returns {number} valor filtrado
   */
  filter(value, tSeconds) {
    if (!Number.isFinite(value)) return value;
    const t = Number.isFinite(tSeconds) ? tSeconds : (this._has ? this._t + DEFAULT_DT : 0);
    if (!this._has) {
      this._x = value; this._dx = 0; this._t = t; this._has = true;
      return value;
    }
    const dt = t - this._t;
    if (!(dt > 0)) return this._x; // marca de tiempo repetida o desordenada
    const dx = (value - this._x) / dt;
    this._dx += smoothingAlpha(this.dCutoff, dt) * (dx - this._dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    this._x += smoothingAlpha(cutoff, dt) * (value - this._x);
    this._t = t;
    return this._x;
  }
}

/**
 * Suaviza un PoseFrame por punto y por eje con filtros 1€: `lm` x,y,z (unidades de imagen
 * normalizadas) y `world` x,y,z (metros) usan ajustes distintos. Los valores por defecto
 * (`SKELETON_CONFIG.smoother`) están ajustados para MediaPipe a ~30 fps. Medido en
 * `test/esqueleto.test.mjs`: en reposo divide el ruido por 2,7, y en una bajada de flexión
 * (0,6 unidades/s) se arrastra 0,35 cuadros. Tras un hueco largo —la cámara se queda
 * pegada— el paso de tiempo grande hace que el filtro siga el dato nuevo casi sin promediar
 * con el viejo, que es lo que corresponde cuando ya hay poca información.
 * `smooth()` nunca cambia su entrada; `visibility` y los demás campos pasan tal cual.
 * Un `world` ausente (null) pasa tal cual y sus filtros no se tocan. Si el tiempo retrocede
 * (clip nuevo, vuelta del demo) el suavizador se reinicia solo.
 */
class PoseSmoother {
  /**
   * @param {{lm?:{minCutoff?:number,beta?:number}, world?:{minCutoff?:number,beta?:number}, dCutoff?:number}} [opts]
   */
  constructor(opts = {}) {
    const d = SKELETON_CONFIG.smoother;
    const pick = (o, def) => ({ minCutoff: o?.minCutoff ?? def.minCutoff, beta: o?.beta ?? def.beta });
    /** Ajustes vigentes. */
    this.opts = { lm: pick(opts.lm, d.lm), world: pick(opts.world, d.world), dCutoff: opts.dCutoff ?? d.dCutoff };
    this._lm = [];    // por índice de punto: [fx, fy, fz]
    this._world = [];
    this._lastT = NaN; // ms
  }

  /** Borra todo el estado de los filtros (llamar al empezar una sesión o clip nuevo). */
  reset() {
    this._lm.length = 0;
    this._world.length = 0;
    this._lastT = NaN;
  }

  /**
   * Devuelve una copia suavizada de `frame` (`{ ...frame, lm: [...], world: [...] | null }`).
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

// ───────────────────────────── Dibujo 2D sobre el video ─────────────────────────────

/**
 * Arma la función `project(nx, ny) → [px, py]` que necesita drawSkeleton2D para un video mostrado con
 * CSS `object-fit: cover` (por defecto) o `'contain'` y `object-position: 50% 50%` dentro de una caja de
 * `width × height` px de CSS. `mirror` = el elemento de video está volteado con `transform: scaleX(-1)`
 * (vista de selfie). `scale` multiplica la salida (pasar devicePixelRatio cuando el contexto del canvas
 * NO está ya escalado por él, junto con `opts.scale` de drawSkeleton2D).
 * @param {{videoWidth:number, videoHeight:number, width:number, height:number, mirror?:boolean, fit?:'cover'|'contain', scale?:number}} p
 * @returns {(nx:number, ny:number) => number[]}
 */
function makeCoverProjection({ videoWidth, videoHeight, width, height, mirror = false, fit = 'cover', scale = 1 }) {
  const vw = videoWidth > 0 ? videoWidth : width, vh = videoHeight > 0 ? videoHeight : height;
  const k = (fit === 'contain' ? Math.min : Math.max)(width / vw, height / vh);
  const dw = vw * k, dh = vh * k, ox = (width - dw) / 2, oy = (height - dh) / 2;
  return (nx, ny) => [(ox + (mirror ? 1 - nx : nx) * dw) * scale, (oy + ny * dh) * scale];
}

/** Junta los colores dados con los por defecto; acepta `axial` o su alias `axis`. */
function resolveColors(c) {
  const d = SKELETON_CONFIG.colors;
  return { left: c?.left || d.left, right: c?.right || d.right, axial: c?.axial || c?.axis || d.axial };
}

// Casillas de dibujo: 0..16 = articulaciones H36M, luego 17 l_heel, 18 r_heel, 19 l_foot, 20 r_foot.
const SK_NSLOT = 21;
const SK_FOOT_BP = Object.freeze([29, 30, 31, 32]);
const SK_SLOT = Object.freeze({ ...HI, nose: 9, l_heel: 17, r_heel: 18, l_foot: 19, r_foot: 20 });
// Lado de cada casilla: 0 eje, 1 izquierda, 2 derecha.
const SK_SLOT_SIDE = Uint8Array.from({ length: SK_NSLOT }, (_, i) =>
  (i >= 17 ? (i % 2 ? 1 : 2) : H_SIDE[i] === 'left' ? 1 : H_SIDE[i] === 'right' ? 2 : 0));
// Segmentos = 16 huesos H36M + triángulos de los pies (tobillo → talón → punta → tobillo).
const SK_SEGS = Object.freeze([...H36M.bones, [6, 17], [17, 19], [19, 6], [3, 18], [18, 20], [20, 3]]);
const SK_NSEG = SK_SEGS.length;
// Definición de ángulos anatómicos (con prefijo l_/r_): [extremo A, vértice, extremo B].
const SK_ANGLE_DEF = Object.freeze({
  elbow: ['shoulder', 'elbow', 'wrist'], knee: ['hip', 'knee', 'ankle'], hip: ['shoulder', 'hip', 'knee'],
  shoulder: ['hip', 'shoulder', 'elbow'], ankle: ['knee', 'ankle', 'foot'],
});
// Arreglos de trabajo (la geometría no pide memoria en cada cuadro).
const SK_PX = new Float64Array(SK_NSLOT), SK_PY = new Float64Array(SK_NSLOT);
const SK_PZ = new Float64Array(SK_NSLOT), SK_PV = new Float64Array(SK_NSLOT);
const SK_ORDER2 = new Int16Array(SK_NSEG + SK_NSLOT), SK_DEPTH2 = new Float64Array(SK_NSEG + SK_NSLOT);

/** Ordena los índices 0..n-1 por profundidad, primero el mayor (más lejano); ordenamiento por inserción estable. */
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

/** Resuelve un ángulo a casillas [a, vértice, b], o null. Articulación sin prefijo → el lado más visible. */
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
 * Dibuja el esqueleto Human3.6M (desde `frame.lm` con blazeposeToH36M) y ambos pies sobre un video.
 * Los huesos son líneas de punta redonda con un borde oscuro fino (se leen sobre cualquier video), las
 * articulaciones son puntos rellenos con un anillo claro, en colores izquierda/derecha/eje; se dibuja de
 * lejos a cerca según `lm.z`. Las de visibilidad < `minVisibility` van tenues y punteadas. Nunca lanza
 * error con datos parciales (se saltan los puntos que faltan o NaN). No borra el canvas salvo con `opts.clear`.
 * @param {CanvasRenderingContext2D} ctx contexto del dibujo (px de CSS salvo que uses opts.scale)
 * @param {{lm:Array<{x:number,y:number,z?:number,visibility?:number}>}} frame PoseFrame
 * @param {object} [opts]
 * @param {number} [opts.width] ancho del canvas para la proyección por defecto (por defecto ctx.canvas.width)
 * @param {number} [opts.height] alto del canvas para la proyección por defecto
 * @param {boolean} [opts.mirror] la proyección por defecto voltea x (vista de selfie)
 * @param {(nx:number, ny:number) => number[]} [opts.project] imagen normalizada → px del canvas (ver makeCoverProjection)
 * @param {string[]} [opts.highlight] articulaciones a destacar: nombres H36M, 'nose', 'l_heel', 'r_foot'…; 'knee' sin prefijo = ambos lados
 * @param {Array<{joint:string, value?:number|null, between?:string[]}>} [opts.angles] arcos + etiquetas, p. ej.
 *   `{ joint: 'l_elbow', value: 92 }`. joint ∈ {l_,r_,}{elbow,knee,hip,shoulder,ankle} (hip = hombro–cadera–rodilla;
 *   sin prefijo = el lado más visible); `value` null → el ángulo 2D medido en pantalla; `between` cambia los extremos.
 * @param {number} [opts.minVisibility=0.5]
 * @param {{left?:string, right?:string, axial?:string}} [opts.colors]
 * @param {number} [opts.scale=1] multiplica grosores, radios y tamaño de letra (p. ej. devicePixelRatio)
 * @param {boolean} [opts.clear=false] primero clearRect(0, 0, width, height)
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
  // Casillas destacadas.
  const hi = new Set();
  for (const n of opts.highlight || []) {
    if (SK_SLOT[n] !== undefined) hi.add(SK_SLOT[n]);
    else if (SK_SLOT['l_' + n] !== undefined) { hi.add(SK_SLOT['l_' + n]); hi.add(SK_SLOT['r_' + n]); }
  }
  // Orden de profundidad: segmentos (z media) y articulaciones (z, un poco más cerca para tapar sus huesos).
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

/** Dibuja un arco de ángulo + la etiqueta "92°" (ver opts.angles de drawSkeleton2D). */
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
  // Dirección de la etiqueta: bisectriz exterior (lejos de ambos huesos); casi recto → lejos del tronco.
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

// ───────────────────────────── Visor 3D ─────────────────────────────

const V3_SHADES = 8; // niveles de sombra por profundidad guardados por color de lado
const V3_SIDE = Uint8Array.from(H_SIDE, (s) => (s === 'left' ? 1 : s === 'right' ? 2 : 0));
const V3_VIEWS = Object.freeze({
  front: Object.freeze({ yaw: 0, pitch: 0.08 }),
  side: Object.freeze({ yaw: Math.PI / 2, pitch: 0.08 }),
  top: Object.freeze({ yaw: 0, pitch: 1.5 }),
});

/** Lee '#rgb', '#rrggbb(aa)' o 'rgb()/rgba()' como [r, g, b] (0..255), si no null. */
function parseRGB(c) {
  const s = typeof c === 'string' ? c.trim() : '';
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((d) => parseInt(d + d, 16));
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** Reloj siempre creciente en ms. */
function nowMs() {
  const p = globalThis.performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
}

/** Lleva un ángulo a [−π, π). */
function wrapPi(a) {
  const r = (a + Math.PI) % TWO_PI;
  return (r < 0 ? r + TWO_PI : r) - Math.PI;
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Visor 3D de las 17 articulaciones Human3.6M dibujado con la API 2D simple del canvas (sin WebGL, sin librerías).
 * Los puntos de entrada son metros en la convención de MediaPipe (x a la derecha, y HACIA ABAJO, z profundidad,
 * z menor = más cerca); por dentro pasan a un sistema con y hacia arriba (X = x, Y = −y, Z = −z).
 * - Suelo: plano horizontal bajo el punto de apoyo más bajo — mín(tobillo más bajo − 8 cm, articulación más
 *   baja − 3 cm) — suponiendo imagen-abajo = gravedad (teléfono derecho). La pose se muestra anclada al
 *   suelo, así en una sentadilla baja el cuerpo en vez de subir el suelo.
 * - Cámara en perspectiva que orbita el eje de la pelvis (con transición; altura = mitad de la caja del
 *   cuerpo); su distancia se ajusta sola para que el cuerpo entero quepa. Vistas fijas con setView().
 * - Dibuja una grilla de suelo suave que se desvanece con la distancia, una sombra vertical suave, y huesos y
 *   articulaciones ordenados de lejos a cerca, más gruesos y claros cuanto más cerca; los de v < minVisibility tenues.
 * - Interacción: arrastrar (mouse/dedo, con captura del puntero) orbita; doble toque/doble clic →
 *   'front'. El constructor pone `touch-action: none` en el canvas (la página no se desplaza al arrastrar).
 * - Mientras la cámara transita, se arrastra o gira sola, el visor se vuelve a dibujar con
 *   requestAnimationFrame, así la app solo tiene que llamar render() después de setPose().
 * El tamaño del canvas se da con CSS; resize() (llamado solo por un ResizeObserver si existe) lee su
 * caja de CSS y devicePixelRatio. render() cuesta bastante menos de 1 ms de JS para 17 articulaciones.
 */
class View3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {{left?:string, right?:string, axial?:string, axis?:string}} [opts.colors] colores de los miembros (`axis` = alias de `axial`)
   * @param {string} [opts.background='#0E1318'] color CSS; 'transparent' o 'rgba(0,0,0,0)' deja ver lo de atrás
   * @param {boolean} [opts.grid=true] grilla del suelo, foco de luz y sombra
   * @param {boolean} [opts.autoRotate=false] giro lento tipo tornamesa cuando no se arrastra
   * @param {number} [opts.minVisibility=0.5] articulaciones y huesos bajo esto se dibujan tenues
   * @param {'front'|'side'|'top'} [opts.view='front'] vista inicial
   */
  constructor(canvas, opts = {}) {
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) throw new TypeError('View3D: a canvas with a 2D context is required');
    const cfg = SKELETON_CONFIG.view3D;
    /** @type {HTMLCanvasElement} */ this.canvas = canvas;
    /** @type {CanvasRenderingContext2D} */ this.ctx = ctx;
    /** Opciones vigentes. */
    this.opts = {
      grid: opts.grid !== false, autoRotate: !!opts.autoRotate, background: opts.background ?? cfg.background,
      minVisibility: opts.minVisibility ?? SKELETON_CONFIG.minVisibility,
    };
    this.setColors(opts.colors);
    this._gridStyles = cfg.gridAlphas.map((a) => `rgba(${cfg.gridRGB},${a})`);
    this._spotGrad = null;
    // Pose en el sistema de dibujo (X a la derecha, Y arriba, Z hacia la cámara de frente) + visibilidad.
    this._P = new Float64Array(51).fill(NaN);
    this._V = new Float64Array(17);
    this._hasPose = false;
    this._fresh = true; // la próxima pose fija el objetivo y el ajuste de la cámara sin transición
    // Arreglos de trabajo: coordenadas de pantalla y profundidad de articulaciones y sus sombras, grilla, orden.
    this._sx = new Float64Array(17); this._sy = new Float64Array(17); this._sd = new Float64Array(17);
    this._hx = new Float64Array(17); this._hy = new Float64Array(17);
    const M = 2 * Math.round(cfg.gridHalf / cfg.gridStep) + 1;
    this._gx = new Float64Array(M * M); this._gy = new Float64Array(M * M);
    this._order = new Int16Array(33); this._depth = new Float64Array(33);
    this._ps = new Float64Array(2);  // último resultado de la proyección (sx, sy)
    this._cam = new Float64Array(12); // posición de la cámara, derecha, arriba, atrás (vectores unitarios)
    // Estado de la cámara (actual + objetivo), todo con transición en render().
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
   * Cambia los colores de los miembros (`axis` se acepta como alias de `axial`). Los colores que no son
   * hex/rgb() se usan tal cual, sin sombra por profundidad.
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
   * Fija la pose que se muestra (los valores se copian). Después hay que llamar render().
   * @param {Array<{x:number, y:number, z?:number, v?:number, visibility?:number}|number[]>|null} points17
   *   17 articulaciones H36M en metros, convención de MediaPipe (x a la derecha, y HACIA ABAJO, z profundidad;
   *   z menor = más cerca), relativas a la raíz o no; también acepta arreglos `[x, y, z]`. Las que faltan o NaN
   *   se saltan; null borra.
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
   * Lleva la cámara a una vista fija con transición: 'front' = el punto de vista de la cámara del teléfono
   * (sin espejo, un poco elevado para ver el suelo), 'side' = 90° a la derecha de la cámara, 'top' = desde
   * arriba con el teléfono abajo de la pantalla. Los nombres desconocidos se ignoran.
   * @param {'front'|'side'|'top'} name
   * @param {{instant?: boolean}} [o] instant = saltar sin transición
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
   * Foto de la cámara: yaw/pitch actuales (radianes), los ángulos hacia los que transita (goalYaw/goalPitch),
   * distancia (m) y objetivo de la órbita (sistema de dibujo: y arriba, suelo en 0).
   * @returns {{yaw:number, pitch:number, goalYaw:number, goalPitch:number, distance:number, target:number[]}}
   */
  get camera() {
    return {
      yaw: this._yaw, pitch: this._pitch, goalYaw: this._tyaw, goalPitch: this._tpitch,
      distance: this._dist, target: [this._cx, this._cy, this._cz],
    };
  }

  /**
   * Vuelve a leer el tamaño CSS del canvas y devicePixelRatio (tope 3) y ajusta el búfer interno.
   * Sin tamaño del DOM (p. ej. en las pruebas) usa canvas.width/height con razón 1.
   * @returns {boolean} true si cambió el tamaño CSS o la razón de píxeles
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
      // Un canvas sin tamaño CSS sigue sus atributos: se fija para no caer en un ciclo de redimensionar.
      if (c.style && (c.clientWidth !== w || c.clientHeight !== h)) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
    }
    return changed;
  }

  /** Quita oyentes y observadores y cancela los cuadros pendientes (el canvas queda como está). */
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

  /** @private pointerup / pointercancel; dos toques rápidos → setView('front'). */
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
   * Dibuja un cuadro: fondo, suelo (foco de luz + grilla que se desvanece + sombra) y el esqueleto.
   * Mueve la cámara según el tiempo desde el dibujo anterior (tope 0,1 s) y se sigue dibujando en
   * cuadros de animación mientras la cámara se mueve. Nunca lanza error con poses parciales.
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

  /** @private Hace transitar ángulos, objetivo y distancia de ajuste; calcula el suelo y la base de la cámara. */
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
    C[3] = cy; C[4] = 0; C[5] = -sy;             // derecha (horizontal)
    C[9] = sy * cp; C[10] = sp; C[11] = cy * cp; // atrás: objetivo → cámara
    C[6] = C[10] * C[5] - C[11] * C[4];          // arriba = atrás × derecha
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
      // Objetivo: X/Z de la pelvis (centroide si falta); altura = mitad de la caja anclada al suelo.
      let tx = P[0], tz = P[2], top = 0, n = 0, mx = 0, mz = 0;
      for (let i = 0; i < 17; i++) {
        if (!Number.isFinite(P[3 * i])) continue;
        mx += P[3 * i]; mz += P[3 * i + 2]; n++;
        top = Math.max(top, P[3 * i + 1] - fl);
      }
      if (!Number.isFinite(tx)) { tx = mx / n; tz = mz / n; }
      const k = this._fresh ? 1 : ease(cfg.followSeconds);
      this._cx += (tx - this._cx) * k; this._cy += (top / 2 - this._cy) * k; this._cz += (tz - this._cz) * k;
      // Ajuste: la menor distancia que deja cada articulación dentro de framing × media vista (y minDepth adelante).
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
   * @private Proyecta un punto de dibujo (Y medida desde el suelo) en this._ps (px de CSS).
   * @returns {number} profundidad en metros, NaN si queda detrás del plano cercano (this._ps queda NaN)
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

  /** @private Foco de luz y grilla circular (que se desvanece con la distancia) en el plano del suelo Y = 0. */
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
      // Sin roll de cámara → el disco proyectado es casi una elipse alineada con los ejes.
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
    for (let b = 0; b < nb; b++) { // un trazo por anillo de desvanecido
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < M; j++) {
          const k = i * M + j;
          if (gx[k] !== gx[k]) continue; // NaN: detrás de la cámara
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

  /** @private Sombra suave, luego huesos, articulaciones y cabeza ordenados de lejos a cerca. */
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
    if (this.opts.grid) { // sombra: huesos bajados en vertical al suelo, dos pasadas suaves
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
    // Cabeza: esfera en torno al punto medio(neck_nose, coronilla); reemplaza el hueso 9→10 y el punto 9.
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
    // Elementos: 0..15 huesos (articulación hija = elemento + 1), 16..32 articulaciones; invisible → −∞ (al final).
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
        if (w >= 4) { // franja brillante: se lee como un tubo
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

  /** @private Verdadero mientras la cámara se sigue moviendo sola (transición, giro automático, ajuste). */
  _animating() {
    return this.opts.autoRotate || this._yaw !== this._tyaw || this._pitch !== this._tpitch
      || Math.abs(this._need - this._dist) > 0.005 * this._dist;
  }

  /** @private Agenda un dibujo propio en el próximo cuadro de animación (solo navegadores). */
  _kick() {
    if (this._raf || this._destroyed || typeof globalThis.requestAnimationFrame !== 'function') return;
    this._raf = globalThis.requestAnimationFrame(() => {
      this._raf = 0;
      if (nowMs() - this._lastRender > 12) this.render();
      else if (this._animating()) this._kick();
    });
  }
}

// ───────────────────────────── Elevadores 2D → 3D ─────────────────────────────

/**
 * Crea un elevador 2D→3D. Los dos tipos comparten una interfaz:
 * `{ kind, ready, push(frame), lift(frame) → points | null, liftAsync(frame?) → Promise<points | null>, reset() }`
 * donde points = 17 articulaciones Human3.6M `{x, y, z, v}` en metros, ejes de MediaPipe (x a la derecha,
 * y HACIA ABAJO, z profundidad), origen en la pelvis (= centro de caderas), listas para View3D#setPose.
 * - 'mediapipe' (v0): `lift(frame)` = blazeposeToH36M(frame.world); null si falta frame.world.
 *   Sin estado, siempre listo.
 * - 'videopose3d' (fase 2): un {@link VideoPose3DLifter} (opts como su constructor); devuelve null
 *   hasta que se fija una sesión ONNX con setSession(). Los pesos son CC BY-NC 4.0 (no comercial).
 * @param {'mediapipe'|'videopose3d'} [kind='mediapipe']
 * @param {object} [opts] opciones de VideoPose3DLifter
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
 * Elevador de la fase 2: VideoPose3D (Pavllo et al., CVPR 2019 — convoluciones temporales dilatadas sobre
 * puntos 2D) exportado a ONNX con `tools/export_videopose3d_onnx.py` y corrido con onnxruntime-web.
 * Entrada: puntos COCO-17 (tomados de `lm` de BlazePose) de los últimos `receptiveField` cuadros,
 * normalizados como en VideoPose3D (normalizeScreenCoordinates sobre una imagen nominal de refHeight·aspect ×
 * refHeight; el resultado no depende de refHeight). Entrada/salida del modelo: `[1, RF, 17, 2]` → `[1, 1, 17, 3]`.
 * Salida: 17 articulaciones H36M en el espacio de cámara de VideoPose3D (metros, relativas a la raíz, x a la
 * derecha, y hacia abajo, z adelante — los mismos ejes y orientación que world de MediaPipe), centradas en la raíz.
 *
 * LICENCIA Y VALIDEZ: los pesos preentrenados (`pretrained_h36m_detectron_coco.bin`) son
 * CC BY-NC 4.0 — solo uso no comercial. Se entrenaron con Human3.6M (acciones cotidianas de pie,
 * 4 cámaras fijas, 50 fps) y nunca han visto flexiones, planchas ni otros ejercicios en el suelo: la fase 2
 * tiene que ajustar y/o validar el modelo con videos de FitGram antes de que algún resultado dependa de él.
 *
 * Tiempos: el modelo de referencia (simétrico) predice el cuadro del CENTRO de su ventana. Con
 * `window: 'causal'` (por defecto; exacto para un modelo entrenado con causal=True) la ventana son los
 * últimos RF cuadros, así un modelo simétrico se atrasa (RF−1)/2 cuadros (4 s a 30 fps con RF 243).
 * `window: 'edge'` centra el cuadro más nuevo y lo repite en la mitad futura (el relleno de borde de
 * VideoPose3D al final de una secuencia): sin atraso, algo menos preciso. No se hace aquí: el aumento por
 * volteo de VideoPose3D al predecir, ni llevar la entrada de 30 fps a los 50 fps del entrenamiento.
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
    /** Cuadros de contexto 2D por predicción (3^bloques). @type {number} */ this.receptiveField = rf;
    /** Alto nominal del cuadro (px) para pasar de píxeles a normalizado. @type {number} */
    this.refHeight = opts.refHeight ?? d.refHeight;
    /** Alineación de la ventana, ver la descripción de la clase. @type {'causal'|'edge'} */
    this.window = opts.window === 'edge' ? 'edge' : 'causal';
    /** Verdadero una vez que se llamó setSession(). @type {boolean} */ this.ready = false;
    /** InferenceSession de onnxruntime-web (null hasta fijarla). */ this.session = null;
    /** Espacio de nombres de onnxruntime-web (null hasta fijarlo). */ this.ort = null;
    /** Último error de inferencia de lift() (null si no hay). */ this.error = null;
    this._buf = new Float32Array(rf * 34); // búfer en anillo: COCO-17 normalizado (x, y) por cuadro
    this._head = 0;  // próxima casilla a escribir
    this._count = 0; // cuadros guardados (≤ rf)
    this._vis = null; // visibilidades H36M del cuadro más nuevo
    this._last = null;
    this._lastPushT = NaN;
    this._busy = false;
  }

  /** Cuadros guardados ahora (≤ receptiveField). @type {number} */
  get length() {
    return this._count;
  }

  /** Borra los cuadros guardados y el último resultado (clip o sesión nueva). */
  reset() {
    this._head = 0; this._count = 0; this._vis = null; this._last = null; this._lastPushT = NaN;
  }

  /**
   * Agrega un cuadro al búfer en anillo. Se ignoran: cuadros sin 33 puntos y un cuadro con el mismo `t`
   * que el anterior (así llamar lift() dos veces para un cuadro no hace daño). Una coordenada no finita
   * repite el valor del cuadro anterior (0 en el primero).
   * @param {{t?: number, lm: Array<{x:number, y:number, visibility?:number}>, aspect: number}} frame PoseFrame
   * @returns {boolean} true si el cuadro se agregó
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
   * La entrada del modelo para los cuadros guardados, del más viejo al más nuevo: Float32Array(RF × 17 × 2).
   * 'causal': los últimos RF cuadros, rellenados a la izquierda repitiendo el más viejo mientras haya menos.
   * 'edge': los últimos (RF+1)/2 cuadros (rellenados igual), luego (RF−1)/2 copias del más nuevo.
   * @returns {Float32Array|null} null si no se ha agregado ningún cuadro
   */
  inputData() {
    const rf = this.receptiveField, n = this._count;
    if (!n) return null;
    const out = new Float32Array(rf * 34);
    const past = this.window === 'edge' ? (rf + 1) / 2 : rf; // casillas de la ventana hasta el cuadro más nuevo
    const oldest = (this._head - n + rf) % rf;
    for (let k = 0; k < rf; k++) {
      const idx = clamp(k + n - past, 0, n - 1); // cuadro guardado para la casilla k (con relleno de borde a ambos lados)
      const slot = ((oldest + idx) % rf) * 34;
      out.set(this._buf.subarray(slot, slot + 34), k * 34);
    }
    return out;
  }

  /**
   * Fija la sesión ONNX, p. ej. `lifter.setSession(await ort.InferenceSession.create(url), ort)`.
   * @param {{inputNames: string[], outputNames?: string[], run: Function}} session onnxruntime-web InferenceSession
   * @param {{Tensor: Function}} ort el espacio de nombres de onnxruntime-web (se usa como `new ort.Tensor('float32', data, dims)`)
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
   * Corre el modelo sobre la ventana guardada (agregando antes `frame` si viene).
   * @param {object} [frame] PoseFrame para agregar antes de correr
   * @returns {Promise<Array<{x:number, y:number, z:number, v:number}>|null>} 17 articulaciones H36M, metros,
   *   ejes de MediaPipe, pelvis en el origen, v = visibilidad del cuadro 2D más nuevo; null si no está listo o vacío
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
    const o = data.length - 51; // el cuadro más nuevo si el modelo devolvió varios
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
   * Fachada sincrónica con la misma firma que el elevador 'mediapipe': agrega `frame`, parte una
   * inferencia si no hay otra corriendo y devuelve el último resultado terminado (null hasta el primero).
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
