// Video de David (25-nov-2026): al final de la plancha se acostó en el suelo unos segundos y el reloj siguió.
// Acostado, la línea del cuerpo y el torso siguen rectos; lo que cambia es el brazo, que deja de estar vertical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthSession } from '../src/synth.mjs';
import { createAnalyzer } from '../src/exercises.mjs';
import { toJoints } from '../src/skeleton.mjs';

const ELBOWS = [[11, 13], [12, 14]];   // (hombro, codo) en los puntos de MediaPipe

/** Acostado boca abajo: el codo se va hacia adelante, a la altura del hombro (antebrazo bajo la cabeza). */
function acostado(f) {
  const lm = f.lm.map((p) => ({ ...p }));
  const world = f.world && f.world.map((p) => ({ ...p }));
  const head = lm[0].x > lm[23].x ? 1 : -1;
  for (const [s, e] of ELBOWS) {
    for (const [arr, a] of [[lm, f.aspect], [world, 1]]) {
      if (!arr) continue;
      const L = Math.hypot((arr[e].x - arr[s].x) * a, arr[e].y - arr[s].y);
      arr[e] = { ...arr[e], x: arr[s].x + head * L / a * 0.95, y: arr[s].y + L * 0.2 };
    }
  }
  return { ...f, lm, world };
}

function run(frames) {
  const an = createAnalyzer('plank');
  an.start(frames[0].t);
  let st = null;
  for (const f of frames) { st = an.update(toJoints(f)); if (st.phase === 'ended') break; }
  if (st.phase !== 'ended') st = an.stop(frames[frames.length - 1].t + 33);
  return st;
}

test('plancha: acostarse en el suelo detiene el reloj cuando empezó', () => {
  const frames = synthSession('plank', { seconds: 40 }).frames;
  const base = run(frames);
  assert.ok(base.value > 38, `sin acostarse sigue hasta el final (${base.value})`);
  const t0 = frames[0].t + 25000;
  const st = run(frames.map((f) => (f.t >= t0 ? acostado(f) : f)));
  assert.equal(st.endReason, 'position_lost');
  assert.ok(Math.abs(st.value - (base.value - 15)) < 1.5, `se detiene cerca de los 25 s de prueba (${st.value} vs ${base.value})`);
});
