/**
 * Lo que probe y resulto NO ser problema.
 *
 * Son las preguntas que hace cualquiera —"¿y si el telefono es malo?", "¿y si
 * la camara esta de lado?"— y la respuesta medida es que no afectan el conteo.
 * Estan como pruebas para que la respuesta siga siendo cierta y no quede solo
 * escrita en el README.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthSession } from '../src/synth.mjs';
import { toJoints, PoseSmoother } from '../src/skeleton.mjs';
import { createAnalyzer } from '../src/exercises.mjs';


function corre(prueba, opts) {
  const s = synthSession(prueba, { fps: 30, noise: 0.004, ...opts });
  const sm = new PoseSmoother();
  const an = createAnalyzer(prueba, { sex: opts.sex || 'M', variant: opts.variant });
  an.start(s.frames[0].t);
  for (const f of s.frames) {
    const st = an.update(toJoints(sm.smooth(f)));
    if (st.phase === 'ended') break;
  }
  const fin = an.stop(s.frames[s.frames.length - 1].t, 'manual');
  return { v: fin.value, esp: prueba === 'plank' ? s.meta.expectedSeconds : s.meta.expectedValid };
}

const CASOS = Object.freeze({ pushup: { reps: 15 }, squat: { reps: 16 }, plank: { seconds: 60 } });
const SEMILLAS = [1, 2];

test('un telefono lento no arruina el conteo', () => {
  // El motor aguanta hasta 6 fps. Lo que rompe el conteo es el ruido en los
  // puntos, no la cadencia: ver test/calidad.test.mjs.
  for (const fps of [30, 15, 6]) {
    for (const seed of SEMILLAS) {
      const r = corre('pushup', { ...CASOS.pushup, fps, seed, noise: 0.003 });
      assert.equal(r.v, r.esp, `${fps} fps, semilla ${seed}`);
    }
  }
});

test('la forma de la imagen no cambia el conteo', () => {
  for (const [prueba, base] of Object.entries(CASOS)) {
    for (const aspect of [9 / 16, 16 / 9, 1]) {
      for (const seed of SEMILLAS) {
        const r = corre(prueba, { ...base, aspect, seed });
        const tol = prueba === 'plank' ? 1.5 : 0;
        assert.ok(Math.abs(r.v - r.esp) <= tol, `${prueba} ${aspect.toFixed(2)} semilla ${seed}: ${r.v} vs ${r.esp}`);
      }
    }
  }
});

test('da lo mismo hacia que lado mire la persona', () => {
  for (const [prueba, base] of Object.entries(CASOS)) {
    for (const facing of ['right', 'left']) {
      for (const seed of SEMILLAS) {
        const r = corre(prueba, { ...base, facing, seed });
        const tol = prueba === 'plank' ? 1.5 : 0;
        assert.ok(Math.abs(r.v - r.esp) <= tol, `${prueba} ${facing} semilla ${seed}: ${r.v} vs ${r.esp}`);
      }
    }
  }
});

test('la variante de rodillas cuenta tan bien como la de puntas', () => {
  // Es la que el protocolo CSEP usa con mujeres: si contara peor, la mitad de
  // los participantes quedaria peor medida que la otra mitad.
  for (const facing of ['right', 'left']) {
    for (const seed of SEMILLAS) {
      const r = corre('pushup', { reps: 15, variant: 'knees', sex: 'F', facing, seed });
      assert.equal(r.v, r.esp, `rodillas ${facing} semilla ${seed}`);
    }
  }
});

test('vista de frente: de frente supera el umbral; de lado no', async () => {
  const { vistaDeFrente, EX_CONFIG } = await import('../src/exercises.mjs');
  const P = (x, y) => ({ x, y, v: 1 });
  const frente = { l_shoulder: P(0.62, 0.3), r_shoulder: P(0.38, 0.3), l_hip: P(0.56, 0.6), r_hip: P(0.44, 0.6) };
  const lado = { l_shoulder: P(0.51, 0.3), r_shoulder: P(0.49, 0.3), l_hip: P(0.5, 0.6), r_hip: P(0.5, 0.6) };
  assert.ok(vistaDeFrente(frente) > EX_CONFIG.common.sideViewMax);
  assert.ok(vistaDeFrente(lado) < EX_CONFIG.common.sideViewMax);
  assert.equal(vistaDeFrente({}), null);
});
