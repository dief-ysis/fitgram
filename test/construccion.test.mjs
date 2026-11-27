/**
 * Que lo publicado sea lo que dice el codigo fuente.
 *
 * El codigo se escribe en src/*.mjs y lo que se publica es un solo index.html
 * armado por build.mjs. El riesgo obvio de tener un archivo generado dentro
 * del repositorio es que alguien lo edite a mano: el cambio funciona, se sube,
 * y el siguiente build lo borra sin decir nada.
 *
 * Esta prueba es la que no deja que eso pase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construir, modulosEnDisco } from '../build.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

test('el index.html publicado es exactamente el que sale de src/', () => {
  const { html } = construir();
  const actual = readFileSync(join(RAIZ, 'index.html'), 'utf8');
  if (actual !== html) {
    // Decir en que linea, que si no hay que mirar 7000 lineas a ojo.
    const a = actual.split('\n'), b = html.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    assert.fail(`index.html no corresponde a src/ (primera diferencia en la linea ${i + 1}).\n`
      + `  publicado: ${JSON.stringify((a[i] || '').slice(0, 90))}\n`
      + `  deberia:   ${JSON.stringify((b[i] || '').slice(0, 90))}\n`
      + '  Corre: npm run build');
  }
});

test('todos los modulos de src/ llegan al archivo publicado', () => {
  // Un modulo que nadie importa no se pega, y entonces existe en el repositorio
  // sin estar en la app: codigo que parece vivo y no corre.
  const { modulos } = construir();
  const enDisco = modulosEnDisco();
  const sueltos = enDisco.filter((n) => !modulos.includes(n));
  assert.deepEqual(sueltos, [], `modulos que nadie importa: ${sueltos.join(', ')}`);
});

test('cada modulo se pega despues de los que importa', () => {
  // Es la unica restriccion real del orden: app lee __mods[...] al evaluarse.
  const { html, modulos } = construir();
  const pos = Object.fromEntries(modulos.map((n) => [n, html.indexOf(`__mods["${n}"] = `)]));
  for (const n of modulos) {
    const src = readFileSync(join(RAIZ, 'src', `${n}.mjs`), 'utf8');
    for (const m of src.matchAll(/^import .* from '\.\/([\w-]+)\.mjs';$/gm)) {
      assert.ok(pos[m[1]] < pos[n], `${n} se pega antes que ${m[1]}, del que depende`);
    }
  }
});

test('el archivo publicado no deja rastros del armado', () => {
  const actual = readFileSync(join(RAIZ, 'index.html'), 'utf8');
  assert.ok(!actual.includes('<!--MODULOS-->'), 'quedo la marca de la plantilla sin reemplazar');
  assert.ok(!/^import .* from/m.test(actual), 'quedo un import sin traducir');
  assert.ok(!/^export \{/m.test(actual), 'quedo un export sin traducir');
});

test('ningún módulo lleva un «</script>» literal: cerraría el script de index.html y la app no cargaría', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((n) => n.endsWith('.mjs'))) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/<\/script/i.test(src), `${f} tiene «</script»: escríbelo «<\\/script»`);
  }
});
