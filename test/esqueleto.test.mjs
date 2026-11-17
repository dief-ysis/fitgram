/**
 * El esqueleto: suavizado y conversion de puntos.
 *
 * Es lo que alimenta a todo lo demas. Las pruebas sinteticas lo ejercitan de
 * paso, pero solo verian un error grueso: si el filtro se arrastra medio
 * segundo o si un NaN le envenena el estado, lo que se ve despues es un conteo
 * raro, no un error, y la culpa parece del analizador.
 *
 * Los numeros de retraso y de ruido estan medidos, no supuestos: ver los
 * comentarios de cada prueba.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './_load.mjs';

const S = loadModule('skeleton');
const { PoseSmoother, OneEuroFilter, toJoints, blazeposeToH36M,
  normalizeScreenCoordinates, imageCoordinates, BP, SKELETON_CONFIG } = S;

const FPS = 30;
const punto = (y, extra = {}) => Object.assign({ x: 0.5, y, z: 0, visibility: 1 }, extra);
const cuadro = (t, lm, resto = {}) => Object.assign({ t, lm, world: null, aspect: 1 }, resto);
const sd = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/* --------------------------------------------------------- el suavizado */

test('el primer cuadro sale tal cual: el filtro no arranca torcido', () => {
  // Si el primer valor saliera movido, el comienzo de cada prueba —donde se
  // decide si la posicion es correcta— empezaria con un sesgo.
  const s = new PoseSmoother();
  const o = s.smooth(cuadro(0, [punto(0.37)]));
  assert.equal(o.lm[0].y, 0.37);
  assert.equal(o.lm[0].x, 0.5);
});

test('en reposo quita ruido de verdad', () => {
  // Medido: desviacion de entrada 0,0030 -> salida 0,0011. Si bajara de 2x,
  // el filtro ya no estaria haciendo su trabajo.
  const s = new PoseSmoother();
  let semilla = 1;
  const rnd = () => (semilla = (semilla * 48271) % 2147483647) / 2147483647 - 0.5;
  const ent = [], sal = [];
  for (let i = 0; i < 200; i++) {
    const v = 0.5 + 0.01 * rnd();
    ent.push(v);
    sal.push(s.smooth(cuadro((i / FPS) * 1000, [punto(v)])).lm[0].y);
  }
  const razon = sd(ent.slice(50)) / sd(sal.slice(50));
  assert.ok(razon > 2, `solo redujo el ruido ${razon.toFixed(2)} veces`);
});

test('en movimiento rapido casi no se arrastra', () => {
  // Medido: 0,35 cuadros de retraso en una bajada de flexion (0,6 unidades/s).
  // Si se arrastrara mas de un cuadro y medio, el fondo del movimiento llegaria
  // tarde y la repeticion podria no alcanzar el umbral de profundidad.
  const s = new PoseSmoother();
  const vel = 0.6;
  let peor = 0;
  for (let i = 0; i <= 0.5 * FPS; i++) {
    const t = i / FPS, real = vel * t;
    const o = s.smooth(cuadro(t * 1000, [punto(real)]));
    if (t > 0.2) peor = Math.max(peor, Math.abs(o.lm[0].y - real));
  }
  const cuadros = peor / (vel / FPS);
  assert.ok(cuadros < 1.5, `se arrastra ${cuadros.toFixed(2)} cuadros`);
});

test('despues de un hueco largo sigue el dato nuevo, no el viejo', () => {
  // La camara se queda pegada tres segundos y vuelve con la persona en otra
  // posicion. Si el filtro promediara eso con lo de antes, el primer cuadro de
  // vuelta mentiria justo cuando ya hay poca informacion.
  const s = new PoseSmoother();
  for (let i = 0; i < 30; i++) s.smooth(cuadro((i / FPS) * 1000, [punto(0.5)]));
  const o = s.smooth(cuadro(3030, [punto(0.9)]));
  assert.ok(Math.abs(o.lm[0].y - 0.9) < 0.02, `volvio en ${o.lm[0].y} con la entrada en 0,9`);
});

test('si el tiempo va hacia atras, se olvida de todo', () => {
  // Pasa al empezar otro video o al repetir la demostracion.
  const s = new PoseSmoother();
  for (let i = 0; i < 30; i++) s.smooth(cuadro((i / FPS) * 1000, [punto(0.2)]));
  const o = s.smooth(cuadro(0, [punto(0.8)]));
  assert.equal(o.lm[0].y, 0.8, 'deberia salir tal cual, como un primer cuadro');
});

test('un cuadro repetido no mueve nada', () => {
  const s = new PoseSmoother();
  s.smooth(cuadro(0, [punto(0.5)]));
  const a = s.smooth(cuadro(100, [punto(0.6)])).lm[0].y;
  const b = s.smooth(cuadro(100, [punto(0.9)])).lm[0].y;
  assert.equal(b, a);
});

test('un valor imposible pasa de largo y no envenena el filtro', () => {
  // Un solo NaN que quedara guardado dejaria ese punto en NaN para siempre, y
  // a partir de ahi la app no veria mas a la persona sin decir por que.
  const s = new PoseSmoother();
  for (let i = 0; i < 10; i++) s.smooth(cuadro((i / FPS) * 1000, [punto(0.5)]));
  const malo = s.smooth(cuadro(400, [punto(NaN)]));
  assert.ok(Number.isNaN(malo.lm[0].y));
  const bueno = s.smooth(cuadro(433, [punto(0.5)]));
  assert.ok(Number.isFinite(bueno.lm[0].y), `quedo en ${bueno.lm[0].y}`);
  assert.ok(Math.abs(bueno.lm[0].y - 0.5) < 0.01);
});

test('cada punto se filtra por su cuenta', () => {
  // Si se mezclaran, el temblor de una mano moveria la cadera.
  const s = new PoseSmoother();
  let semilla = 7;
  const rnd = () => (semilla = (semilla * 48271) % 2147483647) / 2147483647 - 0.5;
  let ultimo = null;
  for (let i = 0; i < 60; i++) {
    ultimo = s.smooth(cuadro((i / FPS) * 1000, [punto(0.3 + 0.2 * rnd()), punto(0.8)]));
  }
  assert.ok(Math.abs(ultimo.lm[1].y - 0.8) < 0.005, `el punto quieto se movio a ${ultimo.lm[1].y}`);
});

test('no toca el cuadro que recibe', () => {
  // El temblor se mide sobre los puntos sin suavizar: si smooth() los
  // modificara, esa medicion quedaria midiendo lo suavizado.
  const s = new PoseSmoother();
  const lm = [punto(0.5)];
  const antes = JSON.parse(JSON.stringify(lm));
  const f = cuadro(0, lm);
  s.smooth(f);
  s.smooth(cuadro(33, lm));
  assert.deepEqual(lm, antes);
  assert.equal(f.lm, lm, 'tampoco deberia reemplazar la lista del original');
});

test('la visibilidad y lo demas del punto se conservan', () => {
  const s = new PoseSmoother();
  const o = s.smooth(cuadro(0, [punto(0.5, { visibility: 0.42, loQueSea: 'x' })]));
  assert.equal(o.lm[0].visibility, 0.42);
  assert.equal(o.lm[0].loQueSea, 'x');
});

test('sin puntos 3D no se inventa nada', () => {
  const s = new PoseSmoother();
  const o = s.smooth(cuadro(0, [punto(0.5)], { world: null }));
  assert.equal(o.world, null);
  const o2 = s.smooth(cuadro(33, [punto(0.5)], { world: [punto(1.2)] }));
  assert.equal(o2.world.length, 1);
});

test('que cambie la cantidad de puntos no lo rompe', () => {
  const s = new PoseSmoother();
  s.smooth(cuadro(0, [punto(0.5)]));
  const o = s.smooth(cuadro(33, [punto(0.5), punto(0.2), null]));
  assert.ok(Number.isFinite(o.lm[1].y));
  assert.equal(o.lm[2], null);
});

test('el filtro rechaza una configuracion imposible en vez de dar numeros raros', () => {
  for (const malo of [{ minCutoff: 0 }, { minCutoff: -1 }, { dCutoff: 0 }, { beta: -1 }]) {
    assert.throws(() => new OneEuroFilter(malo), RangeError, JSON.stringify(malo));
  }
});

/* ------------------------------------------------- puntos a articulaciones */

test('la correccion de proporcion va solo en el eje horizontal', () => {
  // Si se aplicara tambien en vertical, todos los angulos saldrian cambiados
  // segun la forma de la imagen, y el conteo dependeria del telefono.
  const lm = Array.from({ length: 33 }, () => punto(0.4));
  const j = toJoints({ t: 0, lm, world: null, aspect: 16 / 9 });
  assert.ok(Math.abs(j.j2.l_shoulder.x - 0.5 * (16 / 9)) < 1e-12);
  assert.equal(j.j2.l_shoulder.y, 0.4);
});

test('un punto que no vino queda marcado como no visto, no en cero', () => {
  // Un cero seria una posicion valida: la esquina de la imagen.
  const lm = Array.from({ length: 33 }, () => punto(0.4));
  lm[BP.l_elbow] = null;
  const j = toJoints({ t: 0, lm, world: null, aspect: 1 });
  assert.ok(Number.isNaN(j.j2.l_elbow.x));
  assert.equal(j.j2.l_elbow.v, 0);
});

test('una visibilidad de cero se respeta, no se convierte en uno', () => {
  const lm = Array.from({ length: 33 }, () => punto(0.4, { visibility: 0 }));
  const j = toJoints({ t: 0, lm, world: null, aspect: 1 });
  assert.equal(j.j2.l_hip.v, 0);
});

test('sin puntos 3D las articulaciones 3D son null, no un objeto vacio', () => {
  const lm = Array.from({ length: 33 }, () => punto(0.4));
  assert.equal(toJoints({ t: 0, lm, world: null, aspect: 1 }).j3, null);
  assert.equal(toJoints({ t: 0, lm, world: [], aspect: 1 }).j3, null);
});

test('estan las 17 articulaciones que el analizador espera', () => {
  const lm = Array.from({ length: 33 }, () => punto(0.4));
  const j = toJoints({ t: 0, lm, world: null, aspect: 1 });
  for (const n of ['l_shoulder', 'r_shoulder', 'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist',
    'l_hip', 'r_hip', 'l_knee', 'r_knee', 'l_ankle', 'r_ankle']) {
    assert.ok(j.j2[n], `falta ${n}`);
  }
});

/* --------------------------------------------------- BlazePose a H36M */

test('las articulaciones derivadas son los puntos medios que dicen ser', () => {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  p[BP.l_hip] = { x: 0, y: 1, z: 0, visibility: 1 };
  p[BP.r_hip] = { x: 2, y: 1, z: 0, visibility: 1 };
  p[BP.l_shoulder] = { x: 0, y: 3, z: 0, visibility: 1 };
  p[BP.r_shoulder] = { x: 2, y: 3, z: 0, visibility: 1 };
  const h = blazeposeToH36M(p);
  assert.deepEqual([h[0].x, h[0].y], [1, 1], 'pelvis = medio de las caderas');
  assert.deepEqual([h[8].x, h[8].y], [1, 3], 'torax = medio de los hombros');
  assert.deepEqual([h[7].x, h[7].y], [1, 2], 'columna = medio entre pelvis y torax');
});

test('mover a la persona entera mueve el esqueleto entero igual', () => {
  // Equivale a decir que los pesos de cada articulacion suman 1. Si alguno no
  // sumara, esa articulacion se deformaria segun donde este la persona en la
  // imagen, y solo se notaria en los bordes.
  const base = Array.from({ length: 33 }, (_, i) => ({ x: i * 0.01, y: i * 0.02, z: i * 0.003, visibility: 1 }));
  const movido = base.map((q) => ({ ...q, x: q.x + 5, y: q.y - 3, z: q.z + 1 }));
  const a = blazeposeToH36M(base), b = blazeposeToH36M(movido);
  for (let i = 0; i < 17; i++) {
    assert.ok(Math.abs((b[i].x - a[i].x) - 5) < 1e-9, `articulacion ${i}: x se movio ${b[i].x - a[i].x}`);
    assert.ok(Math.abs((b[i].y - a[i].y) + 3) < 1e-9, `articulacion ${i}: y se movio ${b[i].y - a[i].y}`);
    assert.ok(Math.abs((b[i].z - a[i].z) - 1) < 1e-9, `articulacion ${i}: z se movio ${b[i].z - a[i].z}`);
  }
});

test('si falta un punto de los que componen una articulacion, no revienta', () => {
  const p = Array.from({ length: 33 }, () => ({ x: 1, y: 1, z: 1, visibility: 1 }));
  p[BP.l_hip] = null;
  const h = blazeposeToH36M(p);
  assert.equal(h[0].v, 0);
  assert.ok(Number.isNaN(h[0].x));
  assert.equal(h[14].v, 1, 'las demas tienen que seguir bien');
});

test('la visibilidad de una articulacion derivada es la de sus partes', () => {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  p[BP.l_hip] = { x: 0, y: 0, z: 0, visibility: 0.2 };
  p[BP.r_hip] = { x: 0, y: 0, z: 0, visibility: 0.8 };
  assert.ok(Math.abs(blazeposeToH36M(p)[0].v - 0.5) < 1e-12);
});

/* ------------------------------------------------------- coordenadas */

test('normalizar y volver a pixeles da exactamente lo mismo', () => {
  const w = 1280, h = 720;
  const pts = [[0, 0], [w, h], [640, 360], [1, 719], [333.5, 12.25]];
  const vuelta = imageCoordinates(normalizeScreenCoordinates(pts, w, h), w, h);
  pts.forEach((p, i) => {
    assert.ok(Math.abs(vuelta[i][0] - p[0]) < 1e-9, `x de ${p}`);
    assert.ok(Math.abs(vuelta[i][1] - p[1]) < 1e-9, `y de ${p}`);
  });
});

test('normalizar conserva la proporcion: un cuadrado sigue siendo un cuadrado', () => {
  const w = 1280, h = 720, lado = 100;
  const [a, b] = normalizeScreenCoordinates([[100, 100], [100 + lado, 100 + lado]], w, h);
  assert.ok(Math.abs((b[0] - a[0]) - (b[1] - a[1])) < 1e-12);
});

test('un tamaño de imagen imposible se rechaza', () => {
  for (const [w, h] of [[0, 720], [1280, 0], [-1, 720]]) {
    assert.throws(() => normalizeScreenCoordinates([[0, 0]], w, h), RangeError, `${w}x${h}`);
    assert.throws(() => imageCoordinates([[0, 0]], w, h), RangeError, `${w}x${h}`);
  }
});

test('acepta un punto suelto igual que una lista', () => {
  const w = 1280, h = 720;
  const uno = normalizeScreenCoordinates([640, 360], w, h);
  const enLista = normalizeScreenCoordinates([[640, 360]], w, h)[0];
  assert.deepEqual(uno, enLista);
});

/* ------------------------------------------------------- la configuracion */

test('la configuracion del esqueleto no se puede modificar desde fuera', () => {
  // Entra en la huella de las reglas: si se pudiera cambiar en caliente, dos
  // mediciones con la misma huella no serian comparables.
  assert.throws(() => { SKELETON_CONFIG.smoother.lm.beta = 1; }, TypeError);
  assert.throws(() => { SKELETON_CONFIG.minVisibility = 0.9; }, TypeError);
});
