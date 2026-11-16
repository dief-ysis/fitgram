/**
 * Mensajes de error de la cámara.
 *
 * El texto original estaba escrito para un visor embebido: ante CUALQUIER fallo
 * de permiso decía «este visor no deja usar la cámara, abre la versión web
 * publicada en un sitio HTTPS». En el sitio real, donde la persona ya está en
 * HTTPS y lo único que pasó es que apretó «Bloquear», ese texto la manda a otra
 * parte y nunca le dice cómo arreglarlo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction } from './_load.mjs';

const msgFor = loadFunction('index.html', 'cameraErrorMessage');
const err = (name, message = '') => Object.assign(new Error(message), { name });

test('sin HTTPS sí corresponde mandar a la versión segura', () => {
  const m = msgFor(err('NotAllowedError'), { secure: false });
  assert.match(m.title + m.detail, /HTTPS|https/);
});

test('con HTTPS y permiso denegado se explica cómo darlo, no se manda a otro sitio', () => {
  const m = msgFor(err('NotAllowedError'), { secure: true });
  assert.match(m.detail, /permi/i, 'debería hablar del permiso');
  assert.doesNotMatch(m.title + m.detail, /https/i, 'ya está en HTTPS: mandarla a otra parte es un callejón sin salida');
});

test('sin cámara en el aparato se ofrece analizar un video', () => {
  const m = msgFor(err('NotFoundError'), { secure: true });
  assert.match(m.detail, /video/i);
});

test('cámara ocupada por otra app se dice tal cual', () => {
  for (const n of ['NotReadableError', 'AbortError']) {
    assert.match(msgFor(err(n), { secure: true }).detail, /otra app|otra aplicación/i, n);
  }
});

test('restricción imposible sugiere cambiar de cámara', () => {
  assert.match(msgFor(err('OverconstrainedError'), { secure: true }).detail, /cámara/i);
});

test('un error desconocido muestra el mensaje real en vez de tragárselo', () => {
  const m = msgFor(err('WeirdError', 'algo muy raro pasó'), { secure: true });
  assert.match(m.detail, /algo muy raro pasó/);
});

test('ningún mensaje en HTTPS manda a abrir "la versión web"', () => {
  const nombres = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError',
    'OverconstrainedError', 'SecurityError', 'TypeError', 'WeirdError'];
  for (const n of nombres) {
    const m = msgFor(err(n, 'x'), { secure: true });
    assert.doesNotMatch(m.title + ' ' + m.detail, /versión web|sitio HTTPS|este visor/i, n);
  }
});

test('siempre devuelve título y detalle con texto', () => {
  for (const secure of [true, false]) {
    for (const e of [err('NotAllowedError'), err('X'), null, undefined]) {
      const m = msgFor(e, { secure });
      assert.ok(m.title?.length > 0 && m.detail?.length > 0, `${e?.name} secure=${secure}`);
    }
  }
});
