// El aviso de "No te veo completo" dice qué parte falta y qué hacer (pedido de David, 26-nov-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queFalta } from '../src/exercises.mjs';

const PARTES = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
function cuerpo(ocultas = [], lado = 'l_') {
  const j2 = {};
  for (const p of ['l_', 'r_']) for (const n of PARTES) j2[p + n] = { x: 0.5, y: 0.5, v: p === lado && !ocultas.includes(n) ? 0.95 : 0.2 };
  return { j2, j3: null, t: 0 };
}

test('si se ve todo lo necesario, no hay nada que decir', () => {
  assert.equal(queFalta(cuerpo(), 'squat'), null);
  assert.equal(queFalta(cuerpo(['wrist', 'elbow']), 'squat'), null, 'la sentadilla no usa los brazos');
});

test('nombra lo que falta y da el consejo según dónde está', () => {
  assert.equal(queFalta(cuerpo(['ankle']), 'squat'), 'No veo tus tobillos: aléjate un poco o baja el teléfono');
  assert.equal(queFalta(cuerpo(['shoulder']), 'squat'), 'No veo tus hombros: aléjate un poco o sube el teléfono');
  assert.equal(queFalta(cuerpo(['knee', 'ankle']), 'plank'), 'No veo tus rodillas ni tus tobillos: aléjate un poco o baja el teléfono');
  assert.equal(queFalta(cuerpo(['wrist', 'ankle']), 'pushup'), 'No veo tus muñecas ni tus tobillos: aléjate de la cámara');
  assert.equal(queFalta(cuerpo(['hip']), 'squat'), 'No veo tu cadera: aléjate un poco de la cámara');
});

test('usa el lado que mejor se ve, y la variante de rodillas en flexiones', () => {
  assert.equal(queFalta(cuerpo(['ankle'], 'r_'), 'squat'), 'No veo tus tobillos: aléjate un poco o baja el teléfono');
  assert.equal(queFalta(cuerpo(['ankle']), 'pushup', 'knees'), null, 'de rodillas no hacen falta los tobillos');
});

test('entradas raras no rompen', () => {
  assert.equal(queFalta(null, 'squat'), null);
  assert.equal(queFalta({ j2: {} }, 'squat').startsWith('No veo tus hombros'), true);
  assert.equal(queFalta(cuerpo(), 'otra'), null);
});
