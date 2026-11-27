// FitGram, orientación (traído de fitgram-v1 de José, 2026-11-13): inclinación del teléfono -> dirección de la gravedad en
//   la imagen de la cámara -> corrección de la pose. Puro (sin DOM, sin imports).
// Recibe: muestras de deviceorientation/devicemotion (objetos simples que empuja sensors.mjs), el ángulo de pantalla y la
//   cámara en uso, Joints sin corregir (skeleton.mjs#toJoints) para la estimación solo con imagen, y PoseFrames crudos.
// Entrega: un `Tilt` (roll, pitch, gravedad `down` en ejes de imagen, confianza, marcas), un Tilt fusionado (sensor vs.
//   postura inicial), un texto para la interfaz, y PoseFrames corregidos en que +y de la imagen (y del mundo) es la
//   gravedad, que es lo que suponen todos los analizadores de exercises.mjs.
//
// ---- Sistemas de referencia (todos dextrógiros) ------------------------------------------------------------------------------
// APARATO (W3C DeviceOrientation §3.1): x = borde derecho de la pantalla en su orientación natural (vertical), y = borde
//   de arriba, z = saliendo de la pantalla hacia quien mira. Los datos del sensor nunca siguen la rotación de pantalla.
// PANTALLA: el sistema del aparato girado en z por el ángulo de pantalla A (0/90/180/270): A = 90 significa que el aparato
//   se giró 90° en sentido antihorario (borde de arriba a la izquierda), así pantalla-derecha = -y_ap y pantalla-arriba = +x_ap:
//     v_scr = [ cosA·x - sinA·y,  sinA·x + cosA·y,  z ]
// IMAGEN (cuadro crudo que recibe MediaPipe, `lm`/`world`): x a la derecha, y HACIA ABAJO, z = eje óptico, + alejándose.
//   Los navegadores entregan los cuadros de getUserMedia derechos respecto de la PANTALLA, así:
//     cámara trasera (facing 'environment', mira hacia -z_ap):  v_img = [  x_pan, -y_pan, -z_pan ]
//     cámara frontal (facing 'user', mira hacia +z_ap, cuadro crudo SIN espejo):  v_img = [ -x_pan, -y_pan,  z_pan ]
// EULER (W3C intrínseco Z-X'-Y'', R = Rz(alpha)·Rx(beta)·Ry(gamma) lleva aparato -> tierra, z de la tierra = arriba):
//   up_ap = R^T·ez = tercera fila de R = [ -cos(beta)·sin(gamma), sin(beta), cos(beta)·cos(gamma) ]  (alpha no influye).
// INCLINACIÓN: down = -up en ejes de imagen; roll = atan2(down.x, down.y) (+ = cámara girada en sentido horario vista desde
//   atrás, así la escena se ve girada en sentido antihorario); pitch = asin(-down.z) (+ = la cámara mira sobre el horizonte).
//   Cámara derecha: down = (0, 1, 0), roll = 0, pitch = 0.
//
// ---- Lo que hacen las plataformas (revisado 2026-11; define el diseño de abajo) ----------------------------------------
// (a) Signo de accelerationIncludingGravity. La norma dice que un aparato acostado, pantalla arriba, marca {0, 0, +9,8}
//     (https://www.w3.org/TR/orientation-event/ §1 ejemplos): en reposo el vector apunta HACIA ARRIBA. Los navegadores
//     de Android la siguen; iOS Safari entrega el signo contrario (z = -9,81 acostado, pantalla arriba):
//     https://lists.w3.org/Archives/Public/public-geolocation/2014Jul/0024.html . beta/gamma no tienen este problema,
//     así que la gravedad se toma primero de deviceorientation; el acelerómetro es el respaldo y nunca se supone su
//     signo: se aprende de beta/gamma cuando existen ambos, si no se toma de opts.accelSign, y si no se elige para que
//     "arriba" caiga en la mitad superior de la pantalla (una imagen de cámara nunca está de cabeza a propósito).
// (b) Ángulo de pantalla. Screen Orientation: angle = grados que la pantalla está girada en sentido antihorario desde su
//     orientación natural; 90 = landscape-primary, 270 = landscape-secondary en un teléfono naturalmente vertical
//     (https://w3c.github.io/screen-orientation). Safari tiene screen.orientation recién desde la 16.4, y la 16.4 salió
//     con 90/270 cambiados respecto de window.orientation y Chrome (https://bugs.webkit.org/show_bug.cgi?id=254863,
//     arreglado después en https://bugs.webkit.org/show_bug.cgi?id=255388). window.orientation (0, 90 = antihorario,
//     -90 = horario, 180; obsoleto pero presente en iOS y Chrome Android:
//     https://developer.mozilla.org/en-US/docs/Web/API/Window/orientation) es la fuente coherente, por eso
//     resolveScreenAngle() la prefiere. Un ángulo cambiado aparece como un roll de ~180° y lo detecta fuseTilt.
// (c) Cuadros de la cámara. La captura se gira para seguir la orientación de la interfaz: ancho y alto se intercambian
//     al girar el teléfono (p. ej. 480x640 -> 640x480, https://bugs.webkit.org/show_bug.cgi?id=220326). Es conducta del
//     navegador, no está en Media Capture. Con la rotación bloqueada, la interfaz queda vertical, el ángulo queda en 0 y
//     un teléfono de costado entrega una imagen girada 90°: los sensores lo ven y correctFrame la gira un cuarto de
//     vuelta (quarterTurn, desde 25-nov-2026); sin sensores se informa como `sideways` y no se corrige.
// (d) Espejo. Los cuadros de getUserMedia de la cámara frontal no vienen en espejo; las páginas ponen en espejo el <video>
//     con CSS (https://lists.w3.org/Archives/Public/public-media-capture/2017Apr/0017.html). La app espeja solo lo que muestra.
// (e) Sensores que faltan. Los navegadores de escritorio disparan los eventos una vez con campos null (norma §4/§6: "null
//     si no se puede entregar"); un sensor cuenta como presente solo después de varias muestras numéricas. rotationRate
//     va en grados/s. iOS necesita DeviceMotionEvent.requestPermission() dentro de un toque (lo hace sensors.mjs).
// Como (a)-(c) igual pueden fallar en algún teléfono, aquí nada confía en una sola convención: la estimación con imagen
// de createPoseLevelEstimator se mide en el mismo cuadro que se corrige, y fuseTilt la deja mandar sobre un sensor que no
// coincide (en especial las firmas de ~90°/~180° de un ángulo de pantalla o un signo de aceleración equivocados).

/**
 * Umbrales del módulo de orientación (congelados). Cada número dice de dónde sale.
 * Ángulos en grados, tiempos en ms, aceleraciones en m/s², velocidades de giro en grados/s.
 */
const ORIENT_CONFIG = Object.freeze({
  // ---- estimador con sensores
  windowMs: 800,            // ingeniería: la tarea pide una ventana de quietud de 0,5-1 s
  maxSamples: 64,           // ingeniería: tamaño del anillo, ~1 s de eventos a 60 Hz; acota el costo de state()
  minSamples: 6,            // ingeniería: menos muestras de gravedad que esto en la ventana = todavía sin estimación
  minSpanMs: 350,           // ingeniería: `still` necesita evidencia en al menos esta parte de la ventana
  minSensorEvents: 3,       // ingeniería: eventos numéricos para que un sensor cuente como presente (los escritorios mandan uno null)
  staleMs: 1500,            // ingeniería: sin eventos este tiempo = el sensor ya no está
  stillRotRate: 3,          // ingeniería: el giro RMS de un teléfono quieto es < 1 grado/s (ruido del giroscopio); en la mano, 5-30
  stillUpSpread: 1.2,       // ingeniería: cada muestra de "arriba" a este ángulo o menos de la mediana (1° ~ 2 % de error en el muslo)
  stillAccStd: 0.35,        // ingeniería: la desviación de |accelerationIncludingGravity| en reposo es ~0,05; pasos y toques pasan de 0,5
  gravityMin: 8.3,          // física: |accG| debe estar a ~15 % de g = 9,81 para leerse como gravedad ...
  gravityMax: 11.3,         // ... (se ignora un sensor que entrega ceros o en otras unidades)
  accelAgree: 10,           // ingeniería: "arriba" de Euler y del acelerómetro más separados que esto = sospechoso
  signVoteMin: 0.8,         // ingeniería: |cos| entre ambas estimaciones de "arriba" para aprender el signo del acelerómetro
  screenUpMin: 0.26,        // ingeniería: sin(15°); bajo esto el teléfono está muy acostado para adivinar el signo por la pantalla
  movingConfidence: 0.4,    // ingeniería: factor de confianza de una inclinación medida con el teléfono en movimiento
  // ---- geometría / límites
  sidewaysDeg: 45,          // CONTRACT: |roll| > 45° = imagen de costado
  flatPitchDeg: 60,         // ingeniería: pasado esto la cámara mira al suelo o al techo; el roll queda mal definido (gravedad en el plano < 50 %)
  maxAutoDeg: 30,           // tarea: la corrección automática se rechaza pasado 25-30°; hay que enderezar el teléfono
  okDeg: 2,                 // ingeniería: bajo esto la interfaz dice "Teléfono derecho" (2° ~ 3,5 % del muslo, dentro del 15 % de tolerancia)
  warnDeg: 15,              // ingeniería: se corrige, pero el encuadre es malo y la persona queda en parte cortada; la interfaz avisa
  pitchWarnDeg: 25,         // ingeniería: los largos verticales se acortan cos(25°) = 9 % en la imagen 2D; la interfaz avisa
  pitchBadDeg: 40,          // ingeniería: 23 % de acortamiento, las proporciones arriba/abajo en 2D ya no son confiables
  // ---- fusión
  conflictDeg: 8,           // tarea: umbral de desacuerdo sensor vs. postura (8-10°); 8° ~ 14 % de error en el muslo
  patternTolDeg: 15,        // ingeniería: |diferencia - 90| o |diferencia - 180| bajo esto = problema de convención, no de postura
  conflictImageMin: 0.5,    // ingeniería: en un conflicto la postura gana solo con al menos esta confianza
  // ---- estimador con imagen (postura inicial)
  visMin: 0.5,              // igual que EX_CONFIG.common.visMean: no se usan articulaciones con menos visibilidad
  minFrames: 12,            // ingeniería: 0,4 s de cuadros aceptados a 30 fps antes de informar
  fullFrames: 30,           // ingeniería: 1 s de cuadros aceptados = confianza completa
  windowFrames: 45,         // ingeniería: cuadros aceptados que se guardan (1,5 s a 30 fps)
  maxAgeMs: 5000,           // ingeniería: se descartan los cuadros aceptados más viejos que esto
  maxSpreadDeg: 3,          // ingeniería: dispersión robusta (1,4826·MAD) sobre esto = no es una postura inicial quieta (camina, se balancea)
  extendedElbow: 150,       // = EX_CONFIG.pushup.startElbowMin: brazos extendidos (arriba en flexión, colgado, apoyo de fondos)
  straightKnee: 160,        // = EX_CONFIG.squat.standKnee: de pie
  straightHip: 160,         // ingeniería: ángulo hombro-cadera-rodilla de una postura de pie
  bodyLine: 150,            // ingeniería: ángulo hombro-cadera-rodilla de un cuerpo en plancha (holgado: con la cadera hundida los apoyos siguen en el suelo)
  plankElbowMin: 55,        // codo de EX_CONFIG.plank 70-110° con 15° de holgura (los ángulos 2D son más ruidosos) ...
  plankElbowMax: 125,       // ...
  plankKnee: 140,           // EX_CONFIG.plank.kneeMin 150 con holgura
  alignDeg: 12,             // ingeniería: dos referencias "verticales" de una postura deben coincidir a esto o menos
  dipArmTorsoDeg: 40,       // ingeniería: brazo recto vs. torso en el apoyo de fondos (el torso se inclina 10-20° adelante)
  trunkFloorDeg: 50,        // ingeniería: hombro->cadera a esto o menos de la línea del suelo (arriba en flexión de rodillas se inclina ~35°)
  armFloorDeg: 40,          // ingeniería: brazo de apoyo (apoyo->hombro) a esto o menos de la normal al suelo
  floorLineMin: 1.2,        // ingeniería: apoyos en el suelo separados al menos 1,2 troncos (manos cerca de los pies no es plancha)
  // altura del centro de la articulación sobre el suelo para cada apoyo, en troncos (hombro-cadera ~ 0,5 m):
  // muñeca 4 cm (palma plana), codo 4,5 cm (antebrazo plano), rodilla 5 cm (de rodillas), punta del pie 1,5 cm. Estimación
  // antropométrica (ingeniería); quita un sesgo de ~1,5° de la línea muñeca-pie, y equivocarse en 1 cm cuesta solo 0,5°.
  contactLift: Object.freeze({ wrist: 0.08, elbow: 0.09, knee: 0.10, foot: 0.03 }),
  // confianza base de cada referencia: los apoyos en el suelo son hechos físicos; estar de pie es solo "más o menos
  // vertical" (±2°); colgado se balancea; en el apoyo de fondos las manos pueden ir delante o detrás de los hombros (±4°)
  baseConfidence: Object.freeze({ pushup: 0.9, plank: 0.9, squat: 0.75, pullup: 0.7, dip: 0.6 }),
  // zona muerta de la estimación con imagen: un roll de postura así de chico está dentro de la incertidumbre anatómica de
  // la referencia y se informa como derecho (roll 0, `estimatedRoll` guarda la medida), así la postura misma nunca
  // "corrige" una cámara derecha. Medido en la persona sintética con cámara derecha: colgado 2,2°, apoyo de fondos
  // 4,0-4,4° (el torso se inclina 5° y el brazo lo sigue; signo = hacia dónde mira). Decisión de ingeniería: un poco sobre
  // esos sesgos; las referencias del suelo y de pie no tienen sesgo (< 1°) y no la necesitan.
  imageDeadbandDeg: Object.freeze({ pullup: 3, dip: 5 }),
  // ---- corrección 2D del pitch (cámara virtual derecha, homografía)
  pitch2D: false,           // decisión: APAGADA. Necesita la distancia focal, que el navegador no entrega (zoom, recorte y
                            // lente cambian por teléfono); un valor equivocado deforma la pose. Sin ella las horizontales
                            // siguen horizontales y las verticales se acortan cos(pitch) (< 10 % hasta 25°), y los
                            // analizadores lo toleran.
  longFovDeg: 63,           // campo visual en el lado largo de la imagen que se supone con pitch2D encendido (cámara
                            // principal en modo video, equivalente 26-28 mm; igual que SYNTH_CONFIG.vfov)
  msg: Object.freeze({
    level: 'Teléfono derecho',
    corrected: 'Inclinado {n}°: lo corregimos',
    correctedWarn: 'Inclinado {n}°: lo corregimos, pero enderézalo',
    straighten: 'Endereza el teléfono (inclinado {n}°)',
    sideways: 'Gira la pantalla: la imagen está de lado',
    quarter: 'Teléfono de costado: lo giramos',
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
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);   // sin -0 ni restos de 1e-17 de cos(90°)

/**
 * Lleva un ángulo a (-180, 180].
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
 * Ángulo de pantalla para usar con {@link deviceToImage}, normalizado a 0/90/180/270.
 * Prefiere `window.orientation` (coherente en iOS y Chrome Android; Safari 16.4 salió con screen.orientation.angle
 * con 90/270 cambiados), luego `screen.orientation.angle`, luego 0. La capa del DOM pasa ambos valores crudos.
 * @param {{windowOrientation?: number|null, screenAngle?: number|null}} [src]
 * @returns {0|90|180|270}
 */
function resolveScreenAngle(src = {}) {
  const raw = fin(src.windowOrientation) ? src.windowOrientation : fin(src.screenAngle) ? src.screenAngle : 0;
  return ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
}

/**
 * Vector unitario "arriba" (contrario a la gravedad) en el sistema del APARATO, desde los ángulos de Euler W3C de un
 * evento deviceorientation. up = [-cos(beta)·sin(gamma), sin(beta), cos(beta)·cos(gamma)]; alpha (brújula) no importa.
 * Ejemplos: acostado en la mesa, pantalla arriba (0, 0) -> (0, 0, 1); vertical (90, 0) -> (0, 1, 0);
 * horizontal con el borde de arriba a la izquierda (0, -90) -> (1, 0, 0).
 * @param {number} beta grados, giro en el eje x del aparato, [-180, 180)
 * @param {number} gamma grados, giro en el eje y del aparato, [-90, 90)
 * @returns {{x:number, y:number, z:number}|null} null si un ángulo no es un número finito
 */
function upFromEuler(beta, gamma) {
  if (!fin(beta) || !fin(gamma)) return null;
  const b = beta * RAD, g = gamma * RAD;
  return { x: clean(-Math.cos(b) * Math.sin(g)), y: clean(Math.sin(b)), z: clean(Math.cos(b) * Math.cos(g)) };
}

/**
 * Verdadero si una inclinación se puede corregir sola: roll finito, no de costado, |roll| <= maxAutoDeg y la cámara no
 * mira al suelo ni al techo (|pitch| <= flatPitchDeg cuando se conoce el pitch). El cuarto de vuelta va aparte (quarterTurn).
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
 * Convierte el vector "arriba" del sistema del aparato en la inclinación de la imagen de la cámara.
 * @param {{x:number, y:number, z:number}} upDevice "arriba" en ejes del aparato (cualquier largo; ver {@link upFromEuler})
 * @param {{screenAngle?: number, facing?: 'user'|'environment'}} [view] ángulo de pantalla (0/90/180/270, ver
 *   {@link resolveScreenAngle}) y cámara ('environment' = trasera, por defecto; 'user' = frontal, cuadro crudo sin espejo)
 * @returns {{roll:number, pitch:number, down:{x:number,y:number,z:number}, source:'sensor', confidence:number,
 *   still:null, sideways:boolean, correctable:boolean}|null} Tilt, o null si el vector no sirve.
 *   roll: + = cámara girada en sentido horario vista desde atrás; pitch: + = mira sobre el horizonte;
 *   la confianza baja de 1 (derecha) a 0 en |pitch| = flatPitchDeg, donde el roll deja de poder medirse.
 */
function deviceToImage(upDevice, view = {}) {
  const u = upDevice && fin(upDevice.x) && fin(upDevice.y) && fin(upDevice.z) ? unit(upDevice) : null;
  if (!u) return null;
  const a = resolveScreenAngle({ screenAngle: view.screenAngle }) * RAD, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const sx = c * u.x - s * u.y, sy = s * u.x + c * u.y, sz = u.z;               // "arriba" en ejes de pantalla
  const front = view.facing === 'user';
  // imagen = [x_pan, -y_pan, -z_pan] (trasera) o [-x_pan, -y_pan, z_pan] (frontal); down = -up
  const down = front ? { x: clean(sx), y: clean(sy), z: clean(-sz) } : { x: clean(-sx), y: clean(sy), z: clean(sz) };
  const inPlane = Math.hypot(down.x, down.y);
  const roll = inPlane > 1e-6 ? clean(Math.atan2(down.x, down.y) * DEG) : 0;
  const pitch = clean(Math.asin(clamp(-down.z, -1, 1)) * DEG);
  const minPlane = Math.cos(OC.flatPitchDeg * RAD);
  return makeTilt(roll, pitch, down, 'sensor', (inPlane - minPlane) / (1 - minPlane), null);
}

// ---- Estimador con sensores ----------------------------------------------------------------------------------------

/** Anillo de tamaño fijo de filas numéricas (agregar es O(1), sin pedir memoria después de crearlo). */
function makeRing(size, width) {
  const data = new Float64Array(size * width);
  let head = 0, count = 0;
  return {
    push(...row) {
      for (let k = 0; k < width; k++) data[head * width + k] = row[k];
      head = (head + 1) % size;
      if (count < size) count++;
    },
    /** Filas con t (columna 0) >= since, de la más vieja a la más nueva. */
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

/** Mediana por componente de vectores unitarios [t, x, y, z], renormalizada; sirve para los grupos apretados de una ventana de 1 s. */
function medianUp(rows) {
  return rows.length ? unit({ x: median(rows.map((r) => r[1])), y: median(rows.map((r) => r[2])), z: median(rows.map((r) => r[3])) }) : null;
}

/**
 * Estimador de inclinación que la capa del DOM alimenta con muestras de deviceorientation / devicemotion (objetos simples;
 * `t` en ms de un reloj que solo avanza, p. ej. performance.now()). Liviano: O(1) por evento, `state()` trabaja sobre
 * ventanas de a lo más `maxSamples` filas y queda guardado entre eventos.
 *
 * Fuente de gravedad: primero beta/gamma (misma convención en todas las plataformas); accelerationIncludingGravity de
 * respaldo, con un signo aprendido de beta/gamma cuando existen ambos, si no `opts.accelSign`, y si no elegido para que
 * "arriba" quede en la mitad superior de la pantalla (ver las notas de plataformas al inicio del archivo).
 *
 * @param {{screenAngle?: number, facing?: 'user'|'environment', accelSign?: 1|-1}} [opts] pantalla y cámara iniciales;
 *   accelSign: +1 = norma/Android (en reposo el vector apunta arriba), -1 = iOS Safari; sin definir, decide el estimador
 * @returns {{
 *   setScreen: (s: {angle?: number, facing?: 'user'|'environment'}) => void,
 *   pushOrientation: (e: {t:number, alpha?:number|null, beta:number|null, gamma:number|null}) => void,
 *   pushMotion: (e: {t:number, accG?:object|null, acc?:object|null, rot?:object|null}) => void,
 *   state: (now?: number) => object,
 *   reset: () => void }}
 *   `state(now)` devuelve `{ sensors: {orientation, accelerometer, gyroscope}, available, still, tilt, samples,
 *   lastStill, gravitySource, accelSign, accelSignFrom, disagreeDeg, screen }`:
 *   - sensors: qué sensores entregaron números de verdad (gyroscope = rotationRate con tres números);
 *   - available: hay datos de gravedad recientes (eventos a `staleMs` o menos de `now`; `now` es por defecto el último evento);
 *   - still: true/false, o null si no se puede juzgar; usa la velocidad de giro, la dispersión de "arriba" y |accG|;
 *   - tilt: Tilt de la ventana actual ("arriba" mediano), con `still` copiado, menos confianza en movimiento; null si no hay;
 *   - lastStill: Tilt de la última ventana quieta (lo que el corredor debe fijar al empezar una prueba);
 *   - gravitySource: 'orientation' | 'accelerometer' | null; accelSign: +1 | -1 | null y de dónde salió
 *     ('orientation' | 'option' | 'screen' | 'spec'); disagreeDeg: ángulo entre ambas estimaciones de gravedad, si hay dos.
 */
function createTiltEstimator(opts = {}) {
  const ori = makeRing(OC.maxSamples, 4);     // t, up.x, up.y, up.z (sistema del aparato)
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
    const a = screen.angle * RAD, d = aUnit.x * Math.sin(a) + aUnit.y * Math.cos(a);   // componente hacia pantalla-arriba
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

    // Quietud: todas las señales disponibles deben coincidir.
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
    /** Ángulo de pantalla (ver resolveScreenAngle) y cámara en uso; puede cambiar en cualquier momento, sin reiniciar. */
    setScreen(s = {}) {
      if (fin(s.angle)) screen.angle = resolveScreenAngle({ screenAngle: s.angle });
      if (s.facing === 'user' || s.facing === 'environment') screen.facing = s.facing;
      cache = null;
    },
    /** Un evento deviceorientation; los ángulos null/NaN (escritorio) se ignoran. */
    pushOrientation(e) {
      if (!e || !fin(e.t)) return;
      const up = upFromEuler(e.beta, e.gamma);
      if (!up) return;
      counts.orientation++;
      ori.push(e.t, up.x, up.y, up.z);
      touch(e.t);
    },
    /** Un evento devicemotion: accG = accelerationIncludingGravity, acc = acceleration, rot = rotationRate (cualquiera puede ser null). */
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

// ---- Estimación solo con imagen, desde la postura inicial ---------------------------------------------------------------
// Todos los filtros usan ángulos y proporciones de largo, que no cambian al girar la imagen, así funcionan sobre cuadros
// sin corregir. Cada referencia da un vector "arriba" u en unidades de j2; roll = atan2(-u.x, -u.y).

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len2 = (v) => Math.hypot(v.x, v.y);
const rollFromUp = (u) => Math.atan2(-u.x, -u.y) * DEG;

/** Ángulo interior en b en grados (2D), o null si un segmento es degenerado. */
function angle2(a, b, c) {
  const u = sub(a, b), w = sub(c, b), n = len2(u) * len2(w);
  return n > 1e-12 ? Math.acos(clamp((u.x * w.x + u.y * w.y) / n, -1, 1)) * DEG : null;
}

/** Ángulo sin signo entre dos direcciones 2D, en grados. */
function between2(u, w) {
  const n = len2(u) * len2(w);
  return n > 1e-12 ? Math.acos(clamp((u.x * w.x + u.y * w.y) / n, -1, 1)) * DEG : 180;
}

/** Distancia con signo de p a la recta a->b, positiva del lado de `ref`; y la normal unitaria hacia `ref`. */
function floorLine(a, b, ref) {
  const h = sub(b, a), L = len2(h);
  if (!(L > 1e-9)) return null;
  let n = { x: h.y / L, y: -h.x / L };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (n.x * (ref.x - mid.x) + n.y * (ref.y - mid.y) < 0) n = { x: -n.x, y: -n.y };
  return { L, up: n, height: (p) => n.x * (p.x - a.x) + n.y * (p.y - a.y) };
}

/** Articulaciones de un lado del cuerpo (prefijo 'l_' | 'r_') que se ven lo suficiente; las que faltan, null. */
function sideJoints(j2, prefix) {
  const get = (name) => {
    const p = j2[prefix + name];
    return p && fin(p.x) && fin(p.y) && p.v >= OC.visMin ? p : null;
  };
  return { shoulder: get('shoulder'), elbow: get('elbow'), wrist: get('wrist'), hip: get('hip'), knee: get('knee'),
    ankle: get('ankle'), foot: get('foot') };
}

const POSE_REFS = {
  /** De pie: tobillo->hombro es vertical; el torso debe apuntar igual. */
  squat(s) {
    if (!s.shoulder || !s.hip || !s.knee || !s.ankle) return null;
    const knee = angle2(s.hip, s.knee, s.ankle), hip = angle2(s.shoulder, s.hip, s.knee);
    if (knee == null || hip == null || knee < OC.straightKnee || hip < OC.straightHip) return null;
    const up = sub(s.shoulder, s.ankle);
    return between2(up, sub(s.shoulder, s.hip)) <= OC.alignDeg ? up : null;
  },
  /** Arriba en flexión: muñeca y pies (o rodillas) en el suelo; brazos extendidos, cuerpo en línea sobre el suelo. */
  pushup(s, variant) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow) return null;
    return floorUp(s, s.wrist, variant, 0.2, 0.95);
  },
  /** Plancha en antebrazos: codo y pies en el suelo, brazo más o menos perpendicular a él. */
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
  /** Colgado: el cuerpo cuelga bajo el agarre, muñeca->tobillo (piernas rectas) o muñeca->cadera (rodillas dobladas) es vertical. */
  pullup(s) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow) return null;
    const hang = sub(s.wrist, s.hip);
    if (between2(hang, sub(s.wrist, s.shoulder)) > OC.alignDeg + 3) return null;          // brazo en línea con el cuerpo
    if (len2(sub(s.wrist, s.shoulder)) > 0.9 * len2(hang)) return null;                    // hombro entre la muñeca y la cadera
    const knee = s.knee && s.ankle ? angle2(s.hip, s.knee, s.ankle) : null;
    if (knee != null && knee >= OC.straightKnee - 10) {
      const full = sub(s.wrist, s.ankle);
      return between2(full, hang) <= OC.alignDeg ? full : null;
    }
    return hang;
  },
  /** Apoyo de fondos: brazo recto, mano bajo el hombro junto a la cadera: muñeca->hombro es vertical. */
  dip(s) {
    if (!s.shoulder || !s.elbow || !s.wrist || !s.hip) return null;
    const elbow = angle2(s.shoulder, s.elbow, s.wrist);
    if (elbow == null || elbow < OC.extendedElbow + 5) return null;
    const arm = sub(s.wrist, s.shoulder), torso = sub(s.hip, s.shoulder), ratio = len2(arm) / (len2(torso) || 1e-9);
    if (between2(arm, torso) > OC.dipArmTorsoDeg || ratio < 0.7 || ratio > 1.6) return null;
    return sub(s.shoulder, s.wrist);
  },
};

/** "Arriba" desde la línea del suelo entre un apoyo delantero (muñeca/codo) y el trasero (pies o rodillas). */
function floorUp(s, front, variant, minShoulder, maxShoulder) {
  if (!s.knee && !s.foot) return null;
  let rear = variant === 'knees' ? s.knee : variant === 'toes' ? s.foot : null;
  if (!rear && variant !== 'knees' && variant !== 'toes') {
    // auto: el apoyo más bajo. Los pies en el aire (flexión de rodillas) quedan sobre la línea muñeca-rodilla.
    rear = s.foot;
    if (s.knee && s.foot) {
      const viaKnee = floorLine(front, s.knee, s.shoulder);
      if (viaKnee && viaKnee.height(s.foot) > 0.04 * viaKnee.L) rear = s.knee;
    } else if (!s.foot) rear = s.knee;
  }
  if (!rear) return null;
  const raw = floorLine(front, rear, s.shoulder), torso = len2(sub(s.shoulder, s.hip));
  if (!raw || raw.L < OC.floorLineMin * torso) return null;
  // Los puntos son centros de articulación, no la piel en el suelo: se baja cada uno su altura usual antes de ajustar.
  const lift = OC.contactLift, drop = (p, k) => ({ x: p.x - raw.up.x * k * torso, y: p.y - raw.up.y * k * torso });
  const line = floorLine(drop(front, front === s.elbow ? lift.elbow : lift.wrist), drop(rear, rear === s.knee ? lift.knee : lift.foot), s.shoulder);
  if (!line) return null;
  const hs = line.height(s.shoulder) / line.L, hh = line.height(s.hip) / line.L;
  if (hs < minShoulder || hs > maxShoulder || hh < 0.05) return null;                     // pecho o caderas en el suelo
  // el tronco va a lo largo del suelo y el brazo de apoyo se para sobre él (una persona de pie con los brazos adelante no hace ninguna de las dos)
  const along = sub(rear, front), trunk = between2(sub(s.hip, s.shoulder), along);
  if (trunk > OC.trunkFloorDeg || between2(sub(s.shoulder, front), line.up) > OC.armFloorDeg) return null;
  const far = rear === s.knee ? s.knee : (s.knee || rear);
  const body = angle2(s.shoulder, s.hip, far);
  if (body == null || body < OC.bodyLine) return null;
  // Una persona de pie estirando los brazos (o apoyada en una pared) parece una flexión en una imagen girada ~70°: las
  // referencias del suelo solo se usan con roll moderado, así nunca pueden decir que la imagen está de costado.
  return Math.abs(rollFromUp(line.up)) <= OC.sidewaysDeg ? line.up : null;
}

/**
 * Roll de la cámara estimado solo con la imagen, usando la postura inicial de cada prueba (para videos subidos,
 * escritorios y permisos de sensores negados). Referencias: sentadilla = de pie, tobillo->hombro vertical; flexión =
 * muñeca y pies/rodillas en el suelo; plancha = codo y pies en el suelo; barra = colgado, muñeca->tobillo (o
 * muñeca->cadera con rodillas dobladas) vertical; fondos = apoyo arriba, hombro->muñeca vertical. Los cuadros que no
 * parecen la postura inicial se ignoran; la estimación es la mediana de los cuadros aceptados y se informa cuando al
 * menos `minFrames` coinciden dentro de `maxSpreadDeg`. La última estimación confiable queda disponible (retenida).
 * @param {'pushup'|'squat'|'plank'|'pullup'|'dip'} test
 * @param {{variant?: 'toes'|'knees'|'auto'}} [opts] apoyo de la flexión; 'auto' (por defecto) elige el más bajo
 * @returns {{push: (joints: object) => boolean, state: () => {tilt: object|null, n: number, spread: number|null,
 *   fresh: boolean, seen: number}, reset: () => void}}
 *   push(joints): Joints de un cuadro SIN CORREGIR (toJoints); devuelve true si el cuadro se aceptó.
 *   state(): tilt = Tilt (source 'image', pitch null, still null, `estimatedRoll` = el roll medido antes de la zona muerta
 *   de cada prueba `imageDeadbandDeg`, dentro de la cual `roll` es 0) o null hasta tener confianza; n = cuadros aceptados en
 *   la ventana; spread = dispersión robusta de sus roll en grados (1,4826·MAD); fresh = la ventana actual es confiable
 *   (false = tilt es el retenido); seen = cuadros recibidos.
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

// ---- Fusión ---------------------------------------------------------------------------------------------------

const usable = (t, source) => !!t && t.source === source && fin(t.roll) && t.confidence > 0;

/**
 * Elige la inclinación que se aplica entre la estimación de los sensores y la de la postura inicial (imagen).
 * - solo una sirve -> esa (`reason` 'sensor_only' | 'image_only');
 * - coinciden dentro de `conflictDeg` -> el sensor si está quieto (también sabe el pitch; `reason` 'sensor'),
 *   si no la imagen ('image_sensor_moving');
 * - la imagen dice que está de costado pero un sensor quieto no -> sensor ('image_sideways_ignored'): una persona
 *   acostada en línea parece una persona de pie en una imagen girada, así que esa afirmación es débil;
 * - difieren en ~180° o ~90° (dentro de `patternTolDeg`) -> la convención del sensor está mal en este teléfono (ángulo
 *   de pantalla o signo de la aceleración): imagen, `reason` 'sensor_convention_180' | 'sensor_convention_90';
 * - cualquier otro desacuerdo -> la imagen si su confianza >= `conflictImageMin` ('conflict_image'), si no la
 *   estimación que gira menos la pose ('conflict_smaller'); la confianza baja.
 * El resultado siempre lleva `reason` y `correctable`; `conflictDeg` (diferencia absoluta de roll) si existían ambas.
 * @param {object|null} sensorTilt Tilt con source 'sensor' (p. ej. createTiltEstimator().state().lastStill o .tilt)
 * @param {object|null} imageTilt Tilt con source 'image' (createPoseLevelEstimator().state().tilt)
 * @returns {object|null} un Tilt nuevo, o null si ninguna estimación sirve
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

// ---- Corrección -----------------------------------------------------------------------------------------------

/**
 * Devuelve un PoseFrame NUEVO en que la gravedad apunta hacia +y, como suponen los analizadores. Nunca cambia la entrada.
 * - `lm`: girado en -roll en torno al centro de la imagen en unidades corregidas por aspecto (x·aspect, y) y vuelto a
 *   coordenadas normalizadas; z y visibilidad se mantienen. Con `pitch2D` encendido (y pitch conocido) los puntos se
 *   reproyectan en cambio por una cámara virtual derecha (estenopeica, `longFovDeg` en el lado largo de la imagen).
 * - `world`: girado en 3D en torno al eje óptico en -roll y luego en el eje x de la cámara por el pitch (si se conoce),
 *   para que `down` quede en (0, 1, 0). Las coordenadas centradas en la cadera siguen centradas en la cadera.
 * - El resultado lleva `tilt` y `corrected: true`. Con el teléfono de costado (quarterTurn) se gira el cuarto de vuelta,
 *   `aspect` se invierte y lleva `quarter: true`. Si falta la inclinación o no se puede corregir (pasada `maxAutoDeg`,
 *   cámara acostada) los puntos se copian sin cambios y `corrected` es false.
 * @param {{t:number, lm:Array<object>, world?:Array<object>|null, aspect:number}} frame PoseFrame crudo
 * @param {object|null} tilt Tilt (de fuseTilt, createTiltEstimator o createPoseLevelEstimator)
 * @param {{pitch2D?: boolean, longFovDeg?: number, quarterOnly?: boolean}} [opts] cambios a lo de ORIENT_CONFIG;
 *   quarterOnly: solo el cuarto de vuelta (la corrección de inclinación está apagada en Ajustes)
 * @returns {object} PoseFrame nuevo
 */
/**
 * Cuarto de vuelta (±90°) de un teléfono de costado con la rotación bloqueada: la imagen llega girada y los
 * analizadores verían de pie un cuerpo acostado. Devuelve ±90 si |roll| está a maxAutoDeg o menos de un cuarto de
 * vuelta y la cámara no está acostada; si no, 0. 180° sigue rechazado (un ángulo de pantalla equivocado se ve igual).
 */
function quarterTurn(tilt) {
  // Solo los sensores pueden decir que el teléfono está de costado (una imagen de lado puede ser solo una mala
  // postura); tras la fusión la imagen puede corregir el signo, siempre que un sensor haya participado.
  const sensorSaw = tilt?.source === 'sensor' || (typeof tilt?.reason === 'string' && tilt.reason !== 'image_only');
  if (!tilt || !sensorSaw || !fin(tilt.roll)) return 0;
  if (fin(tilt.pitch) && Math.abs(tilt.pitch) > OC.flatPitchDeg) return 0;
  for (const q of [90, -90]) if (Math.abs(wrapDeg(tilt.roll - q)) <= OC.maxAutoDeg) return q;
  return 0;
}

/**
 * Qué tan derecha se ve la imagen: codos y tobillos más abajo que nariz y hombros (y crece hacia abajo), cierto en la
 * posición inicial de las tres pruebas (sentadilla, flexión, plancha). Más grande = más derecha.
 */
function uprightScore(lm) {
  const y = (ids) => { const v = ids.map((i) => lm?.[i]?.y).filter(fin); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const d = y([13, 14, 27, 28]) - y([0, 11, 12]);
  return fin(d) ? d : 0;
}

/** Sentido elegido para el cuarto de vuelta de cada inclinación (objeto Tilt): se decide una vez y se reusa. */
const sentidoCuarto = new WeakMap();

function correctFrame(frame, tilt, opts = {}) {
  const copy = (arr) => (Array.isArray(arr) ? arr.map((p) => (p ? { ...p } : p)) : arr ?? null);
  if (!frame) return frame;
  const q = opts.quarterOnly ? quarterTurn(tilt) : (isCorrectable(tilt) ? 0 : quarterTurn(tilt));
  if (q) {
    // Teléfono de costado: se gira la imagen por todo el roll (o solo el cuarto si la corrección está apagada).
    // No se confía en el signo del sensor (Safari cambia 90/270): decide la postura (ver uprightScore).
    // El sentido se decide UNA vez por inclinación y se guarda: la app fija la inclinación al empezar la prueba, con la
    // persona en la posición inicial, donde la postura no engaña. Decidirlo en cada cuadro daba vuelta la imagen en el
    // fondo de la flexión (los codos quedan sobre los hombros) y el monito se ponía de cabeza (videos de David, 26-nov).
    const roll = opts.quarterOnly ? q : tilt.roll;
    let signo = sentidoCuarto.get(tilt);
    if (signo == null) {
      const a = rotateFrame(frame, roll, null, opts), b = rotateFrame(frame, -roll, null, opts);   // la convención cambiada refleja el roll
      signo = uprightScore(b.lm) > uprightScore(a.lm) ? -1 : 1;
      if (tilt && typeof tilt === 'object') sentidoCuarto.set(tilt, signo);
    }
    return { ...rotateFrame(frame, signo * roll, null, opts), tilt, corrected: true, quarter: true };
  }
  if (opts.quarterOnly || !isCorrectable(tilt)) return { ...frame, lm: copy(frame.lm), world: copy(frame.world), tilt: tilt ?? null, corrected: false };
  return { ...rotateFrame(frame, tilt.roll, tilt.pitch, opts), tilt, corrected: true };
}

/** Gira un cuadro en -roll (y pitch, si se conoce). Un cuarto de vuelta cambia los lados de la imagen, y `aspect` también. */
function rotateFrame(frame, rollDeg, pitchDeg, opts = {}) {
  const aspect = fin(frame.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const tilt = { roll: rollDeg, pitch: pitchDeg };
  const r = tilt.roll * RAD, c = Math.cos(r), s = Math.sin(r);
  const hasPitch = fin(tilt.pitch), p = hasPitch ? tilt.pitch * RAD : 0, cp = Math.cos(p), sp = Math.sin(p);
  const warp = (opts.pitch2D ?? OC.pitch2D) && hasPitch;
  // Lados de la imagen girada, en altos de imagen: pasado 45° el lado largo cambia de eje.
  const side = Math.abs(Math.sin(r)) > Math.SQRT1_2, outW = side ? 1 : aspect, outH = side ? aspect : 1;
  const f = (Math.max(aspect, 1) / 2) / Math.tan(((opts.longFovDeg ?? OC.longFovDeg) * RAD) / 2);   // distancia focal en altos de imagen
  const lm = Array.isArray(frame.lm) ? frame.lm.map((q) => {
    if (!q) return q;
    const X = (q.x - 0.5) * aspect, Y = q.y - 0.5;
    let x1 = X * c - Y * s, y1 = X * s + Y * c;
    if (warp) {
      const y2 = y1 * cp - f * sp, z2 = y1 * sp + f * cp;
      if (z2 > 0.05 * f) { x1 = f * x1 / z2; y1 = f * y2 / z2; }
    }
    return { ...q, x: x1 / outW + 0.5, y: y1 / outH + 0.5 };
  }) : frame.lm;
  const world = Array.isArray(frame.world) ? frame.world.map((q) => {
    if (!q) return q;
    const x1 = q.x * c - q.y * s, y1 = q.x * s + q.y * c;
    return { ...q, x: x1, y: y1 * cp - q.z * sp, z: y1 * sp + q.z * cp };
  }) : frame.world ?? null;
  return { ...frame, lm, world, aspect: outW / outH };
}

// ---- Textos de la interfaz --------------------------------------------------------------------------------------------------

/**
 * Estado corto en español de Chile para la interfaz.
 * 'ok': derecho, una inclinación chica que se corrige, o de costado con sensores (se gira); 'warn': teléfono en
 * movimiento, sin estimación, una inclinación grande corregida, cámara muy inclinada o conflicto sensor/postura; 'bad': hay
 * que actuar (imagen de costado sin sensores, inclinación pasada `maxAutoDeg`, teléfono acostado, cámara pasada `pitchBadDeg`).
 * @param {object|null} tilt Tilt
 * @returns {{level: 'ok'|'warn'|'bad', msg: string}}
 */
function describeTilt(tilt) {
  const M = OC.msg, fill = (text, v) => text.replace('{n}', String(Math.round(Math.abs(v))));
  if (!tilt || tilt.source === 'none' || !fin(tilt.roll)) return { level: 'warn', msg: M.none };
  const roll = Math.abs(tilt.roll), pitch = fin(tilt.pitch) ? tilt.pitch : 0;
  if (Math.abs(pitch) > OC.flatPitchDeg) return { level: 'bad', msg: M.flat };
  if (roll > OC.sidewaysDeg) return quarterTurn(tilt) ? { level: 'ok', msg: M.quarter } : { level: 'bad', msg: M.sideways };
  if (tilt.still === false) return { level: 'warn', msg: M.moving };
  if (roll > OC.maxAutoDeg) return { level: 'bad', msg: fill(M.straighten, roll) };
  if (Math.abs(pitch) > OC.pitchBadDeg) return { level: 'bad', msg: fill(M.pitchBad, pitch) };
  if (typeof tilt.reason === 'string' && tilt.reason.startsWith('conflict')) return { level: 'warn', msg: M.conflict };
  if (roll > OC.warnDeg) return { level: 'warn', msg: fill(M.correctedWarn, roll) };
  if (Math.abs(pitch) > OC.pitchWarnDeg) return { level: 'warn', msg: fill(pitch > 0 ? M.pitchUp : M.pitchDown, pitch) };
  if (Math.round(roll) > OC.okDeg) return { level: 'ok', msg: fill(M.corrected, roll) };
  return { level: 'ok', msg: M.level };
}

export { ORIENT_CONFIG, wrapDeg, resolveScreenAngle, upFromEuler, isCorrectable, quarterTurn, deviceToImage, createTiltEstimator, createPoseLevelEstimator, fuseTilt, correctFrame, describeTilt };
