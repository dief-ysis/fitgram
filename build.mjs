/**
 * Arma `index.html` a partir de `src/`.
 *
 * El código se escribe en módulos ES de verdad, uno por archivo, con `import`
 * y `export`. Lo que se publica sigue siendo **un solo archivo**: GitHub Pages
 * lo sirve tal cual, funciona abierto desde el disco, y el service worker no
 * tiene que cachear quince rutas más.
 *
 * Lo único que hace este build es pegar los módulos dentro del HTML, en orden
 * de dependencias, y traducir `import`/`export` a la forma que ya usaba el
 * archivo publicado:
 *
 *     import { a } from './x.mjs';   ->  const { a } = __mods["x"];
 *     import * as N from './x.mjs';  ->  const N = __mods["x"];
 *     export { a, b };               ->  return { a, b };
 *
 * No minifica, no transpila y no reordena nada más. El archivo publicado se
 * puede leer y comparar con la fuente línea por línea, que es justo lo que hace
 * `test/construccion.test.mjs`.
 *
 *     node build.mjs            escribe index.html
 *     node build.mjs --check    no escribe: falla si index.html quedó atrasado
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SRC = join(RAIZ, 'src');
const ENTRADA = 'app';
const MARCA = '<!--MODULOS-->';

const RE_IMPORT_LLAVES = /^import \{ (.+) \} from '\.\/([\w-]+)\.mjs';$/;
const RE_IMPORT_NS = /^import \* as (\w+) from '\.\/([\w-]+)\.mjs';$/;

/** Lee un módulo y separa sus dependencias del cuerpo ya traducido. */
function leerModulo(nombre) {
  const ruta = join(SRC, `${nombre}.mjs`);
  const lineas = readFileSync(ruta, 'utf8').replace(/\n+$/, '').split('\n');
  const deps = [];
  const cuerpo = lineas.map((l, i) => {
    const conLlaves = RE_IMPORT_LLAVES.exec(l);
    if (conLlaves) { deps.push(conLlaves[2]); return `const { ${conLlaves[1]} } = __mods["${conLlaves[2]}"];`; }
    const ns = RE_IMPORT_NS.exec(l);
    if (ns) { deps.push(ns[2]); return `const ${ns[1]} = __mods["${ns[2]}"];`; }
    if (/^import\b/.test(l)) throw new Error(`${nombre}.mjs:${i + 1}: import que no entiendo: ${l}`);
    return l;
  });

  const exports = cuerpo.map((l, i) => (l.startsWith('export ') ? i : -1)).filter((i) => i >= 0);
  if (exports.length !== 1) throw new Error(`${nombre}.mjs: esperaba un solo export al final, encontré ${exports.length}`);
  const iExport = exports[0];
  if (!cuerpo[iExport].startsWith('export {')) throw new Error(`${nombre}.mjs: el export tiene que ser 'export { ... };'`);
  cuerpo[iExport] = `return {${cuerpo[iExport].slice('export {'.length)}`;

  return { nombre, deps, cuerpo: cuerpo.join('\n') };
}

/**
 * Orden en que se pegan los módulos: cada uno después de los que importa.
 *
 * Es la única restricción real — `app` lee `__mods[...]` al evaluarse, así que
 * sus dependencias ya tienen que existir. Entre módulos que no dependen uno de
 * otro el orden da igual, y ahí se ordena alfabéticamente para que el archivo
 * publicado no cambie de forma según el orden en que estén escritos los
 * `import`. Falla si hay un ciclo.
 */
function ordenar(entrada) {
  const visto = new Map();
  const enCurso = new Set();
  const orden = [];
  const bajar = (nombre, camino) => {
    if (enCurso.has(nombre)) throw new Error(`dependencias circulares: ${[...camino, nombre].join(' -> ')}`);
    if (visto.has(nombre)) return;
    enCurso.add(nombre);
    const m = leerModulo(nombre);
    visto.set(nombre, m);
    for (const d of [...new Set(m.deps)].sort()) bajar(d, [...camino, nombre]);
    enCurso.delete(nombre);
    orden.push(m);            // después de sus dependencias
  };
  bajar(entrada, []);
  return orden;
}

/** El HTML completo, listo para publicar. */
export function construir() {
  const plantilla = readFileSync(join(SRC, 'index.template.html'), 'utf8');
  if (!plantilla.includes(MARCA)) throw new Error(`la plantilla no tiene ${MARCA}`);
  const modulos = ordenar(ENTRADA);
  const pegado = modulos
    .map((m) => `// ---- ${m.nombre}.mjs ----\n__mods["${m.nombre}"] = (() => {\n${m.cuerpo}\n})();`)
    .join('\n');
  return { html: plantilla.replace(MARCA, pegado), modulos: modulos.map((m) => m.nombre) };
}

/** Los módulos que hay en src/, estén o no en el grafo. */
export function modulosEnDisco() {
  return readdirSync(SRC).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destino = join(RAIZ, 'index.html');
  const { html, modulos } = construir();
  const sueltos = modulosEnDisco().filter((n) => !modulos.includes(n));
  if (sueltos.length) console.warn(`aviso: módulos que nadie importa: ${sueltos.join(', ')}`);
  if (process.argv.includes('--check')) {
    const actual = readFileSync(destino, 'utf8');
    if (actual !== html) {
      console.error('index.html no corresponde a src/. Corre: npm run build');
      process.exit(1);
    }
    console.log(`index.html al día · ${modulos.length} módulos: ${modulos.join(', ')}`);
  } else {
    writeFileSync(destino, html);
    console.log(`index.html escrito · ${modulos.length} módulos: ${modulos.join(', ')}`);
  }
}
