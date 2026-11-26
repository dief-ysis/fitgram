/* ====================================================================
   FitGram — silueta guía con la posición inicial ideal (26-nov-2026).

   Antes de la prueba se dibuja, encima de la persona, la posición inicial
   correcta, con el estilo de Victor (la mascota): cabeza y tronco negros,
   brazos y piernas en azul y naranja. Cuando la persona ya está en posición,
   la silueta se desvanece; durante la prueba no se muestra.

   La posición ideal no es inventada: es el primer cuadro del generador
   sintético (synth.mjs), que es justo la posición inicial que revisan los
   analizadores (de pie, brazos estirados arriba de la flexión, plancha en
   antebrazos).

   Este módulo es puro (sin DOM): calcula dónde van los puntos de la silueta.
   El dibujo vive en app.mjs. No toca el conteo ni está en la huella de las reglas.
   ==================================================================== */

import { synthSession } from './synth.mjs';

/** Puntos de BlazePose que forman la silueta. */
const P = Object.freeze({
  nariz: 0, oreja_i: 7, oreja_d: 8, hombro_i: 11, hombro_d: 12, codo_i: 13, codo_d: 14, muneca_i: 15, muneca_d: 16,
  cadera_i: 23, cadera_d: 24, rodilla_i: 25, rodilla_d: 26, tobillo_i: 27, tobillo_d: 28, talon_i: 29, talon_d: 30,
  punta_i: 31, punta_d: 32,
});

/** Tramos de la silueta: [desde, hasta, parte] (parte: 'eje' | 'i' | 'd'), como Victor. */
const TRAMOS = Object.freeze([
  ['cuello', 'pelvis', 'eje'],
  ['cuello', 'codo_i', 'i'], ['codo_i', 'muneca_i', 'i'], ['cuello', 'codo_d', 'd'], ['codo_d', 'muneca_d', 'd'],
  ['pelvis', 'rodilla_i', 'i'], ['rodilla_i', 'tobillo_i', 'i'], ['pelvis', 'rodilla_d', 'd'], ['rodilla_d', 'tobillo_d', 'd'],
  ['tobillo_i', 'punta_i', 'i'], ['tobillo_d', 'punta_d', 'd'],
]);

const VIS = 0.5;
const ideales = new Map();

const medio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? p.v ?? 1) >= VIS;

/**
 * Pasa los 33 puntos (lm normalizados) a puntos con nombre en unidades corregidas por aspecto (x·aspect, y).
 * Agrega 'cuello' (centro de hombros) y 'pelvis' (centro de caderas); 'cabeza' es el centro de las orejas.
 */
function aNombres(lm, aspect) {
  const q = (i) => (lm[i] ? { x: lm[i].x * aspect, y: lm[i].y, ok: visible(lm[i]) } : { x: NaN, y: NaN, ok: false });
  const o = {};
  for (const [n, i] of Object.entries(P)) o[n] = q(i);
  o.cuello = { ...medio(o.hombro_i, o.hombro_d), ok: o.hombro_i.ok || o.hombro_d.ok };
  o.pelvis = { ...medio(o.cadera_i, o.cadera_d), ok: o.cadera_i.ok || o.cadera_d.ok };
  o.cabeza = { ...medio(o.oreja_i, o.oreja_d), ok: o.oreja_i.ok || o.oreja_d.ok };
  return o;
}

/** Hacia dónde mira: +1 a la derecha, −1 a la izquierda, 0 si no se sabe. De pie, mandan los pies; acostado, la cabeza. */
function mirada(o, test) {
  if (test === 'squat') {
    const d = ['i', 'd'].map((s) => (o[`punta_${s}`].ok && o[`talon_${s}`].ok ? o[`punta_${s}`].x - o[`talon_${s}`].x : 0))
      .reduce((a, b) => a + b, 0);
    if (Math.abs(d) > 1e-3) return Math.sign(d);
  }
  const cab = o.cabeza.ok ? o.cabeza : o.nariz;
  if ((cab.ok || o.nariz.ok) && o.pelvis.ok && Math.abs(cab.x - o.pelvis.x) > 1e-3) return Math.sign(cab.x - o.pelvis.x);
  return 0;
}

/**
 * La posición inicial ideal de una prueba, en unidades corregidas por aspecto, con la pelvis en (0, 0) y el tronco
 * (cuello–pelvis) de largo 1. Se calcula una vez por prueba y variante.
 * @param {'pushup'|'squat'|'plank'} test
 * @param {'toes'|'knees'} [variant]
 */
function poseIdeal(test, variant = 'toes') {
  const clave = `${test}:${variant}`;
  if (ideales.has(clave)) return ideales.get(clave);
  const f = synthSession(test, { variant, noise: 0, seed: 1, reps: 1, seconds: 3 }).frames[0];
  const o = aNombres(f.lm, f.aspect);
  const tronco = dist(o.cuello, o.pelvis) || 1;
  const pts = {};
  for (const [n, p] of Object.entries(o)) pts[n] = { x: (p.x - o.pelvis.x) / tronco, y: (p.y - o.pelvis.y) / tronco };
  const r = { pts, mira: mirada(o, test) || 1 };
  ideales.set(clave, r);
  return r;
}

/**
 * Dónde dibujar la silueta en este cuadro, en coordenadas normalizadas de la imagen (las mismas que lm).
 * Con la persona a la vista: pegada a su pelvis, del largo de su tronco y mirando hacia el mismo lado.
 * Sin persona (o sin cadera y hombros visibles): al centro de la imagen, como guía de dónde ponerse.
 * @param {'pushup'|'squat'|'plank'} test
 * @param {Array<object>|null} lm puntos de MediaPipe del cuadro (o null si no hay nadie)
 * @param {number} aspect ancho / alto de la imagen
 * @param {{variant?: 'toes'|'knees'}} [opts]
 * @returns {{puntos: Record<string,{x:number,y:number}>, tramos: typeof TRAMOS, sobrePersona: boolean}}
 */
function siluetaPara(test, lm, aspect, opts = {}) {
  const ideal = poseIdeal(test, opts.variant || 'toes');
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 9 / 16;
  let cx, cy, escala, mira = ideal.mira, sobrePersona = false;
  const o = Array.isArray(lm) && lm.length >= 33 ? aNombres(lm, a) : null;
  if (o && o.pelvis.ok && o.cuello.ok && dist(o.cuello, o.pelvis) > 0.03) {
    escala = dist(o.cuello, o.pelvis);
    mira = mirada(o, test) || ideal.mira;
    sobrePersona = true;
    const tob = ['tobillo_i', 'tobillo_d'].map((n) => o[n]).filter((p) => p.ok);
    if (tob.length) {
      // Anclada en los pies: a la altura horizontal de los tobillos y parada en el suelo de la persona (el punto
      // visible más bajo de sus pies). Así una flexión o una plancha no se hunde bajo el suelo ni se sale de la imagen.
      const flipI = mira === ideal.mira ? 1 : -1;
      const pieI = medio(ideal.pts.tobillo_i, ideal.pts.tobillo_d);
      const sueloI = Math.max(...Object.values(ideal.pts).map((p) => p.y));
      const pies = ['tobillo_i', 'tobillo_d', 'talon_i', 'talon_d', 'punta_i', 'punta_d'].map((n) => o[n]).filter((p) => p.ok);
      const tx = tob.reduce((s, p) => s + p.x, 0) / tob.length, suelo = Math.max(...pies.map((p) => p.y));
      cx = tx - pieI.x * flipI * escala;
      cy = suelo - sueloI * escala;
    } else {
      cx = o.pelvis.x; cy = o.pelvis.y;
    }
  } else {
    // Al centro: que el cuerpo ideal ocupe ~60 % del alto o ~75 % del ancho, lo que llegue primero.
    const xs = Object.values(ideal.pts).map((p) => p.x), ys = Object.values(ideal.pts).map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    escala = Math.min((a * 0.75) / w, 0.6 / h);
    cx = a / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * escala * (mira / ideal.mira);
    cy = 0.5 - ((Math.max(...ys) + Math.min(...ys)) / 2) * escala;
  }
  const flip = mira === ideal.mira ? 1 : -1;
  const puntos = {};
  for (const [n, p] of Object.entries(ideal.pts)) puntos[n] = { x: (cx + p.x * flip * escala) / a, y: cy + p.y * escala };
  return { puntos, tramos: TRAMOS, sobrePersona };
}

/**
 * Opacidad de la silueta según cuánto tiempo lleva la persona en posición: 1 mientras no lo está, y se desvanece en
 * `fadeMs` una vez que lo está. Durante la prueba, 0.
 * @param {string} fase fase del corredor ('preview' | 'countdown' | 'arming' | 'active' | ...)
 * @param {number|null} okDesdeMs instante (ms) desde el que la posición es correcta, o null
 * @param {number} ahoraMs
 */
function opacidadSilueta(fase, okDesdeMs, ahoraMs, fadeMs = 600) {
  if (fase !== 'preview' && fase !== 'countdown' && fase !== 'arming') return 0;
  if (okDesdeMs == null) return 1;
  return Math.max(0, 1 - (ahoraMs - okDesdeMs) / fadeMs);
}

export { TRAMOS, poseIdeal, siluetaPara, opacidadSilueta };
