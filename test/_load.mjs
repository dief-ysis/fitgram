/**
 * Recorta una función suelta de un archivo que no es un módulo, para probarla
 * sin ejecutar el resto.
 *
 * Los módulos de la app ya no se cargan así: viven en `src/*.mjs` y las pruebas
 * los importan de verdad. Esto queda para lo que no es un módulo —`sw.js`, que
 * es un service worker— y para funciones sueltas de `src/app.mjs`, que no se
 * puede importar en Node porque toca el DOM.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadFunction(file, name) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const open = `function ${name}(`;
  const i = src.indexOf(open);
  assert.notEqual(i, -1, `no encontré la función "${name}" en ${file}`);
  const lines = src.slice(i).split('\n');
  const end = lines.findIndex((l, k) => k > 0 && l === '}');
  assert.notEqual(end, -1, `no encontré el cierre de "${name}"`);
  const body = lines.slice(0, end + 1).join('\n');
  return new Function(`${body}\nreturn ${name};`)();
}
