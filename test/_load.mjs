/**
 * Carga un pseudo-módulo de index.html para probarlo en Node.
 *
 * index.html es un solo archivo con bloques `__mods["nombre"] = (() => { ... })();`.
 * Esto recorta el bloque y lo evalúa. Solo sirve con módulos de lógica pura:
 * los que tocan el DOM o localStorage no se pueden cargar así.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadModule(name) {
  const src = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const open = `__mods["${name}"] = (() => {`;
  const i = src.indexOf(open);
  assert.notEqual(i, -1, `no encontré el módulo "${name}" en index.html`);
  const lines = src.slice(i).split('\n');
  const end = lines.findIndex((l, k) => k > 0 && l === '})();');
  assert.notEqual(end, -1, `no encontré el cierre del módulo "${name}"`);
  return new Function(lines.slice(1, end).join('\n'))();
}

/** Recorta una función declarada a nivel superior de un archivo, para probarla sin ejecutar el resto. */
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
