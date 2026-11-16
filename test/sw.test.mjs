/** Política de caché del service worker. node --test test/sw.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFunction } from './_load.mjs';

const policyFor = loadFunction('sw.js', 'policyFor');

test('los binarios grandes van por la vía "heavy"', () => {
  for (const p of ['/fitgram/wasm/vision_wasm_internal.wasm', '/models/pose_landmarker_lite.task', '/models/pose_landmarker_full.task']) {
    assert.equal(policyFor(p), 'heavy', p);
  }
});

test('el documento va primero a la red, para no quedar pegado en una versión vieja', () => {
  for (const p of ['/fitgram/', '/', '/fitgram/index.html']) {
    assert.equal(policyFor(p), 'document', p);
  }
});

test('el resto es shell', () => {
  for (const p of ['/fitgram/lib/vision_bundle.mjs', '/fonts/barlow-400.woff2', '/icono.svg', '/manifest.webmanifest']) {
    assert.equal(policyFor(p), 'shell', p);
  }
});

test('todo lo que la app necesita para arrancar está en alguna lista del service worker', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // Cada archivo local referido desde el HTML (href/src/url(...)) debe estar precargado.
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|data:|#)([^"]+)"/g)) {
    if (!m[1].includes('${')) refs.add(m[1]); // los href armados en JS no son archivos
  }
  for (const m of html.matchAll(/url\('([^']+\.woff2)'\)/g)) refs.add(m[1]);
  assert.ok(refs.size >= 8, `esperaba varias referencias locales, encontré ${refs.size}`);
  for (const r of refs) {
    assert.ok(sw.includes(`'./${r}'`), `el service worker no precarga "${r}"`);
  }
});

test('los modelos y el wasm que pide el código están en la lista de pesados', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of ['wasm/vision_wasm_internal.wasm', 'models/pose_landmarker_lite.task', 'models/pose_landmarker_full.task']) {
    assert.ok(sw.includes(`'./${f}'`), `falta "${f}" en HEAVY`);
  }
});

test('no queda ninguna llamada a un dominio de terceros en el HTML', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const externos = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^https?:\/\/(www\.)?(cocc\.edu|acefitness\.org|doi\.org)/.test(u));
  assert.deepEqual(externos, [], `la app pide recursos a terceros: ${externos.join(', ')}`);
});

test('index.html NO se precarga: si no, cada publicación obligaría a subir VERSION', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL = ['), sw.indexOf('];', sw.indexOf('const SHELL = [')));
  assert.doesNotMatch(shell, /'\.\/index\.html'/, 'index.html no debe estar en la precarga');
  assert.doesNotMatch(shell, /'\.\/',/, "'./' tampoco: es el mismo documento");
  // pero el manejador del documento sí lo guarda al pasar por la red
  assert.match(sw, /networkFirst/);
});
