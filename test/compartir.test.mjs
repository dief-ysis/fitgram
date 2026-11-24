import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/compartir.mjs';

const rec = [0, 100, 200].map((t) => ({ t, p: Float32Array.from({ length: 51 }, (_, i) => i / 7) }));

test('esqueleto: solo puntos, sin fecha exacta, con lo necesario para compararlo', () => {
  const e = C.esqueletoParaCompartir(rec, { test: 'squat', value: 20, invalid: 2, date: '2026-11-23T15:04:05Z', age: 20, sex: 'M', reglas: 'abc' });
  assert.equal(e.tipo, 'fitgram-esqueleto');
  assert.equal(e.schema, 1);
  assert.equal(e.mes, '2026-11', 'año y mes, no el día ni la hora');
  assert.equal(e.cuadros.length, 3);
  assert.equal(e.cuadros[0].p.length, 51);
  assert.equal(e.cuadros[0].p[1], 0.143, 'redondeado a milímetros');
  assert.equal(e.cuadros_por_segundo, 10);
  const texto = JSON.stringify(e);
  assert.ok(!/nombre|name|video|imagen/i.test(Object.keys(e).join(',')), 'no hay campos de identidad ni imagen');
  assert.ok(!texto.includes('15:04'), 'no va la hora');
});

test('esqueleto: una serie vacía no rompe', () => {
  const e = C.esqueletoParaCompartir([], { test: 'plank' });
  assert.deepEqual(e.cuadros, []);
  assert.equal(e.cuadros_por_segundo, null);
});

test('video: elige mp4 si se puede, si no webm, y null si no graba', () => {
  assert.equal(C.elegirFormatoVideo((m) => m.startsWith('video/mp4')).ext, 'mp4');
  assert.equal(C.elegirFormatoVideo((m) => m === 'video/webm').mime, 'video/webm');
  assert.equal(C.elegirFormatoVideo(() => false), null);
  assert.equal(C.elegirFormatoVideo(undefined), null);
  assert.equal(C.elegirFormatoVideo(() => { throw new Error('x'); }), null);
});

test('nombre de archivo sin tildes ni espacios', () => {
  assert.equal(C.nombreArchivo('Sentadillas', 'video con esqueleto', 'mp4', new Date('2026-11-23T10:00:00Z')),
    'fitgram-sentadillas-video-con-esqueleto-2026-11-23.mp4');
});
