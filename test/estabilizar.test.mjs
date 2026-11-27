// Estabilizar el dibujo cuando una parte del cuerpo no se ve (27-nov-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstabilizador, ESTAB_CONFIG } from '../src/estabilizar.mjs';

/** Cuadro de 33 puntos: caderas en (cx, 0.5), muñeca izquierda (15) en (cx + 0.2, 0.3) con la visibilidad dada. */
function cuadro(t, cx, visMuneca = 0.95, xMuneca = null) {
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, z: 0, visibility: 0.95 }));
  lm[23] = { x: cx - 0.02, y: 0.5, z: 0, visibility: 0.95 };
  lm[24] = { x: cx + 0.02, y: 0.5, z: 0, visibility: 0.95 };
  lm[15] = { x: xMuneca ?? cx + 0.2, y: 0.3, z: 0, visibility: visMuneca };
  return { t, lm, world: null, aspect: 1 };
}

test('un punto que deja de verse se dibuja donde estaba, siguiendo a la cadera', () => {
  const e = crearEstabilizador();
  e.aplicar(cuadro(0, 0.5));
  // la muñeca se pierde y MediaPipe la adivina lejos; la persona se corrió 0,05 a la derecha
  const r = e.aplicar(cuadro(200, 0.55, 0.1, 0.9));
  assert.ok(Math.abs(r.lm[15].x - 0.75) < 1e-9, `sigue a la cadera: ${r.lm[15].x}`);
  assert.ok(Math.abs(r.lm[15].y - 0.3) < 1e-9);
  assert.equal(r.lm[15].visibility, ESTAB_CONFIG.visSostenido, 'se dibuja tenue');
});

test('si pasa mucho rato sin verse, deja de inventar', () => {
  const e = crearEstabilizador();
  e.aplicar(cuadro(0, 0.5));
  const r = e.aplicar(cuadro(ESTAB_CONFIG.holdMs + 100, 0.5, 0.1, 0.9));
  assert.equal(r.lm[15].x, 0.9, 'queda como llegó');
  assert.equal(r.lm[15].visibility, 0.1);
});

test('los puntos que se ven no se tocan, y un punto que nunca se vio tampoco', () => {
  const e = crearEstabilizador();
  const a = cuadro(0, 0.5, 0.1, 0.9);
  const r = e.aplicar(a);
  assert.deepEqual(r.lm[15], a.lm[15], 'nunca se vio: no hay de dónde sacarlo');
  const b = cuadro(100, 0.5);
  assert.deepEqual(e.aplicar(b).lm, b.lm);
});

test('si el tiempo retrocede (clip nuevo, vuelta del demo) olvida lo anterior', () => {
  const e = crearEstabilizador();
  e.aplicar(cuadro(5000, 0.5));
  const r = e.aplicar(cuadro(100, 0.5, 0.1, 0.9));
  assert.equal(r.lm[15].x, 0.9);
});

test('no cambia la entrada y aguanta cuadros vacíos', () => {
  const e = crearEstabilizador();
  e.aplicar(cuadro(0, 0.5));
  const f = cuadro(100, 0.5, 0.1, 0.9);
  const copia = JSON.stringify(f);
  e.aplicar(f);
  assert.equal(JSON.stringify(f), copia);
  assert.equal(e.aplicar(null), null);
});
