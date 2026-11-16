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
  // La misma combinacion que sella la app: umbrales, suavizado y el codigo que
  // decide que cuenta. Si esto deja de coincidir con la app, la huella del CSV
  // deja de significar lo que dice el README.
  const reglas = { ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG, cod: E.codigoDeConteo() };
  const h = E.huellaDe(reglas);
  assert.match(h, /^[0-9a-z]{6,10}$/);
  assert.equal(h, E.huellaDe(reglas));
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

/* --------------------------------------- la huella del codigo que cuenta */

test('normalizar: un comentario o la indentacion no cambian el codigo', () => {
  const a = E.normalizarCodigo(`function f(x) {
    // sube el umbral
    return x > 3;
  }`);
  const b = E.normalizarCodigo(`function f(x) { return x > 3; }   /* sube el umbral */`);
  assert.equal(a, b);
});

test('normalizar: cambiar una condicion si cambia el codigo', () => {
  assert.notEqual(
    E.normalizarCodigo('function f(x) { return x > 3; }'),
    E.normalizarCodigo('function f(x) { return x > 4; }'),
  );
});

test('normalizar: lo que esta dentro de un texto se respeta', () => {
  // Un "//" dentro de un texto no es un comentario, y los espacios de un
  // mensaje para la persona tampoco se pueden colapsar.
  const src = `function f() { return 'a  //  b'; }`;
  assert.match(E.normalizarCodigo(src), /'a {2}\/\/ {2}b'/);
});

test('la huella del codigo de conteo es corta y reproducible', () => {
  const a = E.codigoDeConteo();
  assert.equal(a, E.codigoDeConteo());
  assert.match(a, /^[0-9a-z]{7}$/);
});

test('la huella de las reglas cubre el codigo, no solo la configuracion', () => {
  // Esto es lo que fallaba: arreglar como se cierra una prueba cuando la camara
  // se queda pegada cambio lo que mide la plancha sin tocar una sola constante,
  // y la huella anterior no se habria movido.
  const S = loadModule('skeleton');
  const con = E.huellaDe({ ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG, cod: E.codigoDeConteo() });
  const sin = E.huellaDe({ ex: E.EX_CONFIG, sk: S.SKELETON_CONFIG });
  assert.notEqual(con, sin);
  assert.match(con, /^[0-9a-z]{7}$/);
});
