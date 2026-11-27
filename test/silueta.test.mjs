// Silueta guía con la posición inicial ideal (pedido de David, 26-nov-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseIdeal, siluetaPara, opacidadSilueta } from '../src/silueta.mjs';
import { synthSession } from '../src/synth.mjs';
import { createAnalyzer } from '../src/exercises.mjs';
import { toJoints } from '../src/skeleton.mjs';

const ang = (a, b, c) => {
  const u = [a.x - b.x, a.y - b.y], v = [c.x - b.x, c.y - b.y];
  return Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180 / Math.PI;
};

test('la posición ideal es la inicial de cada prueba', () => {
  const sq = poseIdeal('squat').pts;
  assert.ok(ang(sq.cadera_i, sq.rodilla_i, sq.tobillo_i) > 160, 'sentadilla: de pie, rodilla estirada');
  assert.ok(sq.cuello.y < sq.pelvis.y - 0.9, 'sentadilla: tronco vertical');
  const pu = poseIdeal('pushup').pts;
  assert.ok(ang(pu.hombro_i, pu.codo_i, pu.muneca_i) > 150, 'flexión: brazos estirados');
  assert.ok(Math.abs(pu.cuello.y - pu.pelvis.y) < 0.6, 'flexión: cuerpo más bien horizontal');
  const pl = poseIdeal('plank').pts;
  const codo = ang(pl.hombro_i, pl.codo_i, pl.muneca_i);
  assert.ok(codo > 60 && codo < 120, `plancha: codo doblado (${codo.toFixed(0)}°)`);
  assert.equal(Math.round(Math.hypot(sq.cuello.x - sq.pelvis.x, sq.cuello.y - sq.pelvis.y) * 100), 100, 'tronco de largo 1');
});

test('la posición ideal pasa la revisión de inicio del analizador (es la misma que exige la app)', () => {
  for (const t of ['pushup', 'squat', 'plank']) {
    const f = synthSession(t, { noise: 0, seed: 1, reps: 1, seconds: 3 }).frames;
    const an = createAnalyzer(t);
    let c = null;
    for (const fr of f.slice(0, 15)) c = an.check(toJoints(fr));
    assert.equal(c.ok, true, `${t}: ${c.msg}`);
  }
});

test('sobre la persona: parada en sus pies, de su tamaño y mirando hacia su lado', () => {
  const f = synthSession('squat', { noise: 0, seed: 3, reps: 1, facing: 'left' }).frames[0];
  const s = siluetaPara('squat', f.lm, f.aspect);
  assert.equal(s.sobrePersona, true);
  const pel = { x: (f.lm[23].x + f.lm[24].x) / 2, y: (f.lm[23].y + f.lm[24].y) / 2 };
  assert.ok(Math.abs(s.puntos.pelvis.x - pel.x) < 0.02 && Math.abs(s.puntos.pelvis.y - pel.y) < 0.02, 'de pie, calza con la persona');
  const hombros = { x: (f.lm[11].x + f.lm[12].x) / 2, y: (f.lm[11].y + f.lm[12].y) / 2 };
  const troncoP = Math.hypot((hombros.x - pel.x) * f.aspect, hombros.y - pel.y);
  const troncoS = Math.hypot((s.puntos.cuello.x - s.puntos.pelvis.x) * f.aspect, s.puntos.cuello.y - s.puntos.pelvis.y);
  assert.ok(Math.abs(troncoP - troncoS) < 1e-9, 'mismo largo de tronco');
  const der = siluetaPara('squat', synthSession('squat', { noise: 0, seed: 3, reps: 1, facing: 'right' }).frames[0].lm, f.aspect);
  const lado = (x) => Math.sign(x.puntos.punta_i.x - x.puntos.talon_i.x);
  assert.notEqual(lado(s), lado(der), 'si la persona mira al otro lado, la silueta también');
});

test('sin persona a la vista, la silueta va al centro y cabe en la imagen', () => {
  for (const t of ['pushup', 'squat', 'plank']) {
    for (const a of [9 / 16, 16 / 9]) {
      const s = siluetaPara(t, null, a);
      assert.equal(s.sobrePersona, false);
      for (const [n, p] of Object.entries(s.puntos)) {
        assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${t} ${a.toFixed(2)}: ${n} fuera (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
      }
    }
  }
});

test('Victor se queda toda la preparación y se desvanece recién cuando empiezan las repeticiones', () => {
  assert.equal(opacidadSilueta('preview', null, 1000), 1);
  assert.equal(opacidadSilueta('countdown', null, 1000), 1);
  assert.equal(opacidadSilueta('arming', null, 99999), 1, 'aunque la persona ya esté en posición, sigue entero');
  assert.equal(opacidadSilueta('active', 1000, 1300), 0.5, 'a media salida');
  assert.equal(opacidadSilueta('active', 1000, 5000), 0);
  assert.equal(opacidadSilueta('active', null, 1000), 0);
  assert.equal(opacidadSilueta('ended', 1000, 1100), 0);
});

test('en el suelo (flexión sobre alguien en plancha) no se hunde bajo el suelo: queda parada en sus pies', () => {
  const f = synthSession('plank', { noise: 0, seed: 2, seconds: 3 }).frames[5];
  const s = siluetaPara('pushup', f.lm, f.aspect);
  const suelo = Math.max(...[27, 28, 29, 30, 31, 32].map((i) => f.lm[i].y));
  const masBajo = Math.max(...Object.values(s.puntos).map((p) => p.y));
  assert.ok(Math.abs(masBajo - suelo) < 0.01, `el punto más bajo de la silueta (${masBajo.toFixed(3)}) en el suelo (${suelo.toFixed(3)})`);
  const tob = (f.lm[27].x + f.lm[28].x) / 2, tobS = (s.puntos.tobillo_i.x + s.puntos.tobillo_d.x) / 2;
  assert.ok(Math.abs(tob - tobS) < 0.01, 'los pies de la silueta sobre los de la persona');
  for (const p of Object.values(s.puntos)) assert.ok(p.x > -0.05 && p.x < 1.05, 'no se sale de la imagen');
});

test('con barra, Victor se ancla en las manos (en la barra), no en los pies', () => {
  for (const t of ['pullup', 'dip']) {
    const f = synthSession(t, { noise: 0, seed: 4, reps: 1 }).frames[5];
    const s = siluetaPara(t, f.lm, f.aspect);
    const manoP = (f.lm[15].x + f.lm[16].x) / 2, manoS = (s.puntos.muneca_i.x + s.puntos.muneca_d.x) / 2;
    const yP = (f.lm[15].y + f.lm[16].y) / 2, yS = (s.puntos.muneca_i.y + s.puntos.muneca_d.y) / 2;
    assert.ok(Math.abs(manoP - manoS) < 0.01 && Math.abs(yP - yS) < 0.01, `${t}: manos sobre las manos`);
  }
});
