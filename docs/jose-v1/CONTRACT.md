# FitGram v1 — contrato de ingeniería entre módulos

> Documento compartido por todos los agentes y por el desarrollador que siga el proyecto (David).
> Si un cambio rompe este contrato, se discute antes de hacerlo. Las versiones anteriores están en git.

FitGram es una app web para celular (una sola página) que filma a la persona con la cámara, corre
MediaPipe Pose Landmarker en el navegador (33 puntos 2D + 33 puntos 3D «world»), dibuja el esqueleto
sobre el video, muestra el esqueleto en 3D (formato Human3.6M de 17 articulaciones, el de VideoPose3D),
cuenta repeticiones válidas o segundos de cinco pruebas **hasta el fallo** y clasifica el resultado con
baremos publicados para personas de **18 a 30 años** que ya entrenan, según edad y sexo.

Novedades de v1 respecto de v0:
1. Baremos ampliados a 18–30 años y **solo protocolos hasta el fallo** (máximo continuo, sin límite de
   tiempo). Se excluyen las tablas de 1 o 2 minutos (Golding, flexiones USMC en 2 min, fondos de Topend en 60 s).
2. Dos pruebas nuevas con barra: **dominadas** (`pullup`) y **fondos en paralelas** (`dip`).
3. **Inclinación del teléfono**: se detecta si hay giroscopio/acelerómetro, se mide la inclinación de la
   cámara respecto de la gravedad y se corrige la pose antes de analizarla. Sin sensores (o en videos
   subidos) se estima la inclinación con la postura de partida de cada prueba.
4. Código modular (una responsabilidad por archivo), historial de resultados y exportación de datos.

## Pruebas (cada baremo vale solo con su protocolo)

| id | Prueba | Protocolo hasta el fallo | Puntaje | Cámara |
|---|---|---|---|---|
| `pushup` | Flexiones de brazos | CSEP/ACSM: máximo de flexiones seguidas, sin descanso ni límite de tiempo. Hombres desde los pies, mujeres con apoyo de rodillas. Espalda recta, brazos extendidos arriba. | reps válidas | horizontal, de lado |
| `squat` | Sentadillas | ACE (Mackenzie): máximo de repeticiones controladas hasta la fatiga, muslos paralelos al suelo. | reps válidas | vertical, de lado |
| `plank` | Plancha en antebrazos | Strand et al. 2014: hasta la fatiga; termina al perder la posición o tras dos correcciones seguidas sin cumplir. Un intento. | segundos (0,1 s) | horizontal, de lado |
| `pullup` | Dominadas | Thomas et al. 2020 / USMC: agarre prono, desde suspensión con brazos extendidos; el mentón sobrepasa la barra y se vuelve a la extensión completa; sin balanceo ni impulso de piernas; máximo continuo, sin límite de tiempo. | reps válidas | vertical, de lado |
| `dip` | Fondos en paralelas | Thomas et al. 2020: desde brazos extendidos; cada codo llega al menos a 90° y vuelve a la extensión completa; sin ayuda de piernas; sin límite de tiempo. | reps válidas | vertical, de lado |

Orden en la app: evaluación base `pushup`, `squat`, `plank` (sin equipamiento) y pruebas con barra
`pullup`, `dip` (opcionales).

## Estructura del repositorio y dueños

```
CONTRACT.md                 este archivo (solo lectura para los agentes)
src/config.js               configuración global: público (edades), orden de pruebas, claves   (app)
src/norms.js                baremos y clasificación (datos + funciones puras)                  (norms)
src/orientation.js          inclinación del teléfono: sensores → gravedad en la imagen,
                            estimación por postura, fusión y corrección de la pose (puro)       (orientation)
src/skeleton.js             articulaciones, filtros, dibujo 2D, visor 3D, lifters               (skeleton; v1: exercises agent solo amplía JOINT_NAMES)
src/synth.js                persona sintética determinista (pruebas y demo)                    (exercises)
src/exercises.js            analizadores por prueba (repeticiones, avisos, término)            (exercises)
src/store.js, engine.js, sensors.js, ui.js, runner.js, screens.js, app.js   capa DOM           (app)
src/index.template.html     estructura y estilos                                               (app)
build.mjs                   arma dist/artifact y dist/web                                       (app)
test/*.test.mjs             pruebas node:test, un archivo por módulo
docs/                       historias de usuario, alcance, arquitectura                        (docs)
```

Solo escribe en los archivos de los que eres dueño (más tus tests). Si necesitas algo de otro módulo,
programa contra la interfaz de este contrato.

## Reglas de los módulos (el build concatena los módulos en un único `<script type="module">`)

- JavaScript moderno (ES2022), sin TypeScript, sin dependencias ni paquetes npm.
- Todo módulo debe poder importarse sin cambios en **Node 22** (para las pruebas) y correr en **navegadores
  móviles** (iOS Safari 16.4+, Chrome Android). Nada de acceso al DOM al nivel superior del módulo: el DOM
  solo dentro de funciones.
- Exportaciones: solo declaraciones en línea (`export function f`, `export const X`, `export class C`).
  Nada de `export default`, `export { a, b }` ni re-exportaciones.
- Importaciones: solo con nombre, de módulos hermanos, una por línea: `import { a, b } from './skeleton.js';`.
  Sin `import()` dinámico (salvo el de MediaPipe en engine.js, que ya existe) ni `await` de nivel superior.
- **Dependencias sin ciclos**, en este orden de build (un módulo solo importa de módulos anteriores):
  `config → norms → orientation → skeleton → synth → exercises → store → engine → sensors → ui → runner → screens → app`.
  Los módulos puros (`config`, `norms`, `orientation`, `skeleton`, `synth`, `exercises`) no importan nada de la capa DOM.
- JSDoc en todo símbolo exportado. Umbrales agrupados en un objeto exportado y congelado por módulo,
  con un comentario que diga de dónde sale cada número (protocolo, fuente o decisión de ingeniería).
- Encabezado de cada archivo: 3 a 8 líneas que digan su responsabilidad, qué recibe y qué entrega.
- Textos para el usuario en **español de Chile**, cortos y claros. Identificadores y comentarios en inglés.
- Pruebas: `node --test test/*.test.mjs` debe pasar completo. Solo `node:test` y `node:assert/strict`.

## Formatos compartidos

### Índices de BlazePose (33 puntos)

0 nose · 1 l_eye_inner · 2 l_eye · 3 l_eye_outer · 4 r_eye_inner · 5 r_eye · 6 r_eye_outer · 7 l_ear · 8 r_ear · 9 mouth_l · 10 mouth_r ·
11 l_shoulder · 12 r_shoulder · 13 l_elbow · 14 r_elbow · 15 l_wrist · 16 r_wrist · 17 l_pinky · 18 r_pinky · 19 l_index · 20 r_index · 21 l_thumb · 22 r_thumb ·
23 l_hip · 24 r_hip · 25 l_knee · 26 r_knee · 27 l_ankle · 28 r_ankle · 29 l_heel · 30 r_heel · 31 l_foot · 32 r_foot  («l_» = izquierda del sujeto).

### `PoseFrame` (lo produce engine/runner por cada cuadro analizado)

```js
{
  t: 1234.5,          // ms, monótono (en vivo: performance.now(); video: mediaTime*1000 + offset)
  lm: [{x, y, z, visibility}, ...33],     // coords normalizadas de la imagen CRUDA: x,y en [0,1], y hacia ABAJO, sin espejo
  world: [{x, y, z, visibility}, ...33],  // metros, origen = centro de caderas, ejes de la CÁMARA: x derecha, y abajo, z = profundidad (+ se aleja); puede ser null
  aspect: 0.5625,     // ancho / alto de la imagen analizada
  tilt?: Tilt,        // presente solo en cuadros corregidos por orientation.correctFrame
  corrected?: true
}
```

### `Joints` (`skeleton.js#toJoints(frame)`, lo consumen exercises y orientation)

```js
{ j2: { name: {x, y, v} }, j3: { name: {x, y, z, v} } | null, t }
```
Nombres (v1): `nose, l_ear, r_ear, mouth_l, mouth_r, l_shoulder, r_shoulder, l_elbow, r_elbow, l_wrist, r_wrist,
l_index, r_index, l_pinky, r_pinky, l_hip, r_hip, l_knee, r_knee, l_ankle, r_ankle, l_heel, r_heel, l_foot, r_foot`
(v1 agrega orejas, boca, índice y meñique, que necesitan las dominadas).
- `j2`: unidades de imagen corregidas por aspecto: `x = lm.x * aspect`, `y = lm.y`, y hacia abajo.
- **Gravedad**: los analizadores suponen que **+y de la imagen es la gravedad**. En v1 eso se garantiza aguas
  arriba: el runner pasa cuadros corregidos por `orientation.correctFrame`. Usa `j2` para todo lo que sea
  arriba/abajo/horizontal y `j3` (si existe y es visible) para ángulos de flexión.

### Esqueleto Human3.6M (VideoPose3D) — en `skeleton.js`

```
0 pelvis · 1 r_hip · 2 r_knee · 3 r_ankle · 4 l_hip · 5 l_knee · 6 l_ankle · 7 spine · 8 thorax ·
9 neck_nose · 10 head · 11 l_shoulder · 12 l_elbow · 13 l_wrist · 14 r_shoulder · 15 r_elbow · 16 r_wrist
```

## Interfaces

### `src/config.js` (app)

```js
export const APP       // { name: 'FitGram', version: '1.0.0', storeKey: 'fitgram.v1', legacyStoreKeys: ['fitgram.v0'] }
export const AUDIENCE  // { minAge: 18, maxAge: 30, label: '18 a 30 años' } ← único lugar para cambiar el público
export const TEST_ORDER   // ['pushup', 'squat', 'plank', 'pullup', 'dip']
export const TEST_GROUPS  // [{ id: 'base', label: 'Evaluación base', tests: ['pushup','squat','plank'] },
                          //  { id: 'bar', label: 'Pruebas con barra', tests: ['pullup','dip'], optional: true }]
```
`AUDIENCE` debe quedar dentro de `NORMS_AGE` (lo verifica una prueba).

### `src/norms.js` (norms)

```js
export const NORMS_AGE                 // { min: 18, max: 30 }: edades con baremo
export const NORMS                     // datos congelados por prueba: categorías, tablas, protocolo[], caveats[], fuentes
export function bandFor(test, age, sex)            // etiqueta de la banda/tabla usada, o null
export function classify(test, { age, sex, value, athlete })   // despachador genérico → Classification
export function classifyPushups({ age, sex, reps })
export function classifySquats({ age, sex, reps })
export function classifyPlank({ age, sex, seconds, athlete })
export function classifyPullups({ age, sex, reps })
export function classifyDips({ age, sex, reps })
export function plankPercentile(seconds, sex, group)   // group: 'all' (defecto) | 'athlete' | 'non_athlete'
export function fitnessProfile(parts)    // parts: { pushup?, squat?, plank?, pullup?, dip? } (Classification o null)
```
`Classification`:
```js
{
  test, value, unit: 'rep' | 's',
  band: string,                 // p. ej. '20–29', '26–35', 'universitarios (Strand 2014)', 'China 2014 · 1.º–2.º año', 'USMC 21–25', 'hombres que entrenan (Thomas 2020)'
  category: { key, label, index, of } | null,   // null cuando no existe baremo (fondos en mujeres)
  position: number | null,      // 0–100, escala común para el perfil; null sin baremo
  percentile: number | null,    // plancha, fondos (estimado) y cuando aplique
  table: [{ key, label, min, max, text }],      // filas de menor a mayor; [] sin baremo
  next: { label, needed } | null,
  flags: string[],              // 'unverified_cut' | 'questionable_source' | 'extrapolated' | 'estimated_norm' |
                                // 'trained_sample' | 'military_standard' | 'age_outside_sample' | 'no_norm'
  references: [{ key, label, text }],   // líneas de comparación extra, en español, listas para mostrar
  source: { short, apa, url },          // fuente principal
  sources: [{ short, apa, url }]        // todas las fuentes usadas (principal primero)
}
```
Edad fuera de 18–30 o sexo distinto de 'M'/'F' → `RangeError` con mensaje en español.
`fitnessProfile` → `{ position, label, parts: [{ test, position, label }], note }`; promedio de las posiciones
disponibles (no nulas); bandas: <20 «Muy bajo», <40 «Bajo», <60 «Medio», <80 «Alto», resto «Muy alto».
La nota dice que es un índice exploratorio de FitGram, no un puntaje validado.

### `src/orientation.js` (orientation) — puro, sin DOM

Marcos de referencia (deben quedar documentados y probados en el módulo):
- **Dispositivo** (W3C DeviceOrientation): x = borde derecho de la pantalla en orientación natural,
  y = borde superior, z = sale de la pantalla hacia quien la mira.
- **Pantalla**: el dispositivo rotado por `screen.orientation.angle` (0/90/180/270).
- **Imagen cruda** (la que ve MediaPipe, `lm`): x derecha, y abajo, z = eje óptico (+ se aleja de la cámara).
  Cámara trasera: mira hacia −z del dispositivo. Cámara frontal: mira hacia +z y su imagen cruda no está en espejo.

```js
export const ORIENT_CONFIG
export function upFromEuler(beta, gamma)                 // vector «arriba» unitario en el marco del dispositivo
export function deviceToImage(upDevice, { screenAngle, facing })   // → Tilt (source 'sensor')
export function createTiltEstimator(opts)
//   .setScreen({ angle, facing })
//   .pushOrientation({ t, alpha, beta, gamma })            // evento deviceorientation
//   .pushMotion({ t, accG: {x,y,z}|null, acc: {x,y,z}|null, rot: {alpha,beta,gamma}|null })   // evento devicemotion
//   .state() → { sensors: { orientation, accelerometer, gyroscope }, available, still, tilt: Tilt|null, samples }
//   .reset()
export function createPoseLevelEstimator(test)          // inclinación estimada con la postura de partida
//   .push(joints /* cuadro SIN corregir */) ; .state() → { tilt: Tilt|null, n, spread } ; .reset()
export function fuseTilt(sensorTilt, imageTilt)          // → Tilt final (o null) con conflictDeg y razón
export function correctFrame(frame, tilt)                // → PoseFrame nuevo con la gravedad alineada a +y
export function describeTilt(tilt)                      // → { level: 'ok'|'warn'|'bad', msg } en español para la UI
```
`Tilt`:
```js
{
  roll: number,        // grados, rotación en el plano de la imagen (giro alrededor del eje óptico); 0 = derecho
  pitch: number|null,  // grados, + = la cámara mira hacia arriba del horizonte; null si solo hay imagen
  down: { x, y, z? },  // dirección unitaria de la gravedad en la imagen (x derecha, y abajo, z eje óptico)
  source: 'sensor' | 'image' | 'none',
  confidence: number,  // 0–1
  still: boolean | null,
  sideways: boolean,   // |roll| > 45°: imagen girada (rotación de pantalla bloqueada)
  conflictDeg?: number // diferencia sensor vs postura, si hubo ambas
}
```
`correctFrame` rota `lm` alrededor del centro de la imagen (en unidades corregidas por aspecto) para que la
gravedad quede en +y, y rota `world` en 3D (roll y pitch si se conocen). No cambia visibilidades, no muta
la entrada y devuelve el cuadro con `tilt` y `corrected: true`. El dibujo sobre el video usa el cuadro crudo.

### `src/skeleton.js`

Igual que v0 (ver JSDoc del archivo): `BP`, `H36M`, `COCO17_FROM_BLAZEPOSE`, `toJoints`, `blazeposeToH36M`,
`normalizeScreenCoordinates`, `OneEuroFilter`, `PoseSmoother`, `makeCoverProjection`, `drawSkeleton2D`,
`View3D`, `createLifter`. v1 solo amplía los nombres de `toJoints` (ver `Joints`).

### `src/exercises.js` (exercises)

```js
export const EX_CONFIG
export function createAnalyzer(test, opts)   // test: 'pushup'|'squat'|'plank'|'pullup'|'dip'; opts: { sex, variant }
```
Analizador: `check(joints) → { ok, msg }`, `start(t)`, `update(joints) → AnalyzerState`, `stop(t, reason='manual') → AnalyzerState`.
```js
AnalyzerState = {
  test, phase: 'waiting'|'active'|'ended', value, invalid,
  cue: null | { level: 'good'|'warn'|'bad', msg },
  events: [{ type: 'rep'|'invalid'|'cue'|'start'|'end', t, msg }],
  metrics: { elbow, knee, hip, line, torso, ... },   // grados para el HUD (null si no se sabe)
  visible, log: [{ t, valid, reason }],
  endReason: null | 'manual'|'technique'|'pause'|'position_lost'|'not_visible'
}
```
`position_lost` en dominadas/fondos = soltó la barra o apoyó los pies.

### `src/synth.js` (exercises)

```js
export function synthSession(test, opts)   // { frames, fps, meta }; v1 acepta 'pullup' y 'dip'
export function synthFrameAt(test, tSeconds, opts)
// v1: opts.cameraRoll (grados) y opts.cameraPitch (grados) generan la misma escena vista con la cámara
// inclinada (lm proyectados con la cámara rotada; world en los ejes de esa cámara, como MediaPipe).
```

### Capa DOM (app): `store.js`, `engine.js`, `sensors.js`, `ui.js`, `runner.js`, `screens.js`, `app.js`

Se documentan en `docs/ARQUITECTURA.md`. Puntos fijos:
- `store.js`: esquema `{ schema: 1, profile: { age, sex, athlete }, results: { [test]: Result }, history: Result[], settings }`;
  migra `fitgram.v0`; exporta JSON y CSV; `toAnonymousRecord(result)` arma el registro anónimo para la futura
  base de datos central (sin nombre, sin video, edad en banda, fecha al mes). v1 no envía nada a internet.
- `sensors.js`: pide el permiso de movimiento en iOS (dentro del toque del usuario), escucha
  `deviceorientation`/`devicemotion`, informa qué sensores existen y alimenta `createTiltEstimator`.
- `runner.js`: cuadro crudo → suavizado → (dibujo) → `correctFrame` → `toJoints` → analizador; la inclinación
  se fija al iniciar la prueba y se avisa si el teléfono se mueve.

## Idioma y unidades
Español de Chile. Coma decimal en la UI. Plancha en `m:ss`, repeticiones enteras, ángulos enteros con `°`.
