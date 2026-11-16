/**
 * Pruebas de la huella de las reglas de conteo.
 *
 * Si cambio un umbral mientras se esta tomando el estudio, las mediciones de
 * antes y las de despues dejan de ser comparables. Un numero de version a mano
 * se olvida de subir; la huella sale de las reglas mismas y no se puede olvidar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './_load.mjs';

const E = loadModule('exercises');

test('la huella es corta y estable', () => {
  const a = E.huellaDe({ x: 1, y: [2, 3], z: { w: true } });
  assert.equal(a, E.huellaDe({ x: 1, y: [2, 3], z: { w: true } }));
  assert.match(a, /^[0-9a-z]{6,10}$/);
});

test('cambiar cualquier umbral cambia la huella', () => {
  const base = { pushup: { bottomElbow: 95, topElbow: 150 } };
  const otro = { pushup: { bottomElbow: 96, topElbow: 150 } };
  assert.notEqual(E.huellaDe(base), E.huellaDe(otro));
});

test('el orden en que estan escritas las reglas no cambia la huella', () => {
  // Reordenar el objeto es una edicion cosmetica: no hace incomparables los datos.
  assert.equal(
    E.huellaDe({ a: 1, b: 2, c: { d: 3, e: 4 } }),
    E.huellaDe({ c: { e: 4, d: 3 }, b: 2, a: 1 }),
  );
});

test('quitar o agregar una regla cambia la huella', () => {
  assert.notEqual(E.huellaDe({ a: 1 }), E.huellaDe({ a: 1, b: 2 }));
});

test('la huella de las reglas de verdad es corta y reproducible', () => {
  const S = loadModule('skeleton');
  // La misma combinacion que sella la app: umbrales + suavizado.
  const h = E.huellaDe({ ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG });
  assert.match(h, /^[0-9a-z]{6,10}$/);
  assert.equal(h, E.huellaDe({ ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG }));
});

test('los textos de los avisos no cambian la huella: no cambian el conteo', () => {
  // Corregir una falta de ortografia en un mensaje no puede volver incomparables
  // las mediciones de ayer.
  const con = { pushup: { bottomElbow: 95 }, msg: { good: 'Bien' } };
  const sin = { pushup: { bottomElbow: 95 }, msg: { good: 'Muy bien' } };
  assert.equal(E.huellaDe(con), E.huellaDe(sin));
});

test('la huella de la app cubre tambien el suavizado, no solo los umbrales', () => {
  // Cambiar el filtro cambia que se cuenta, igual que cambiar un umbral.
  // Si la huella solo mirara EX_CONFIG, la garantia seria falsa.
  const S = loadModule('skeleton');
  const conFiltro = E.huellaDe({ ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG });
  const otroFiltro = E.huellaDe({ ex: E.EX_CONFIG, sk: { ...S.SKELETON_CONFIG, minVisibility: 0.99 } });
  assert.notEqual(conFiltro, otroFiltro);
});

test('los colores y el dibujo no entran en la huella: no cambian el conteo', () => {
  const S = loadModule('skeleton');
  const a = E.huellaDe({ sk: S.SKELETON_CONFIG });
  const b = E.huellaDe({ sk: { ...S.SKELETON_CONFIG, colors: { nuevo: '#fff' }, draw2D: { grosor: 9 } } });
  assert.equal(a, b);
});
