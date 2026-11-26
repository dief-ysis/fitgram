// Baremos de dominadas y fondos, traídos de fitgram-v1 de José (26-nov-2026). Los valores esperados son los de sus
// tests (test/norms.test.mjs de la v1); solo cambia cómo se lee la banda (aquí, del resultado) y las advertencias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORMS, classifyPullups, classifyDips, AGE_RANGE } from '../src/norms.mjs';

const EDADES = Array.from({ length: AGE_RANGE.max - AGE_RANGE.min + 1 }, (_, i) => AGE_RANGE.min + i);
const banda = (fn, age, sex) => fn({ age, sex, reps: 1 }).band;

/** Cada corte sube de categoría justo en su mínimo, y nunca antes. */
function revisarCortes(clasificar, nCategorias, mins) {
  assert.equal(clasificar(0).category.index, 0);
  mins.forEach((m, i) => {
    assert.equal(clasificar(m - 1).category.index, i, `con ${m - 1}`);
    assert.equal(clasificar(m).category.index, i + 1, `con ${m}`);
  });
  assert.equal(clasificar(mins[mins.length - 1] + 50).category.index, nCategorias - 1);
}

test('dominadas: bandas de China, cortes y categorías', () => {
  revisarCortes((reps) => classifyPullups({ age: 19, sex: 'M', reps }), 4, [10, 15, 17]);
  revisarCortes((reps) => classifyPullups({ age: 21, sex: 'M', reps }), 4, [11, 16, 18]);
  assert.equal(banda(classifyPullups, 18, 'M'), 'China 2014 · 1.º–2.º año');
  assert.equal(banda(classifyPullups, 19, 'M'), 'China 2014 · 1.º–2.º año');
  assert.equal(banda(classifyPullups, 20, 'M'), 'China 2014 · 3.º–4.º año');
  assert.equal(banda(classifyPullups, 25, 'M'), 'China 2014 · 3.º–4.º año');
  assert.equal(banda(classifyPullups, 26, 'M'), 'USMC 26–30');
  assert.equal(banda(classifyPullups, 30, 'M'), 'USMC 26–30');
  const r = classifyPullups({ age: 19, sex: 'M', reps: 12 });
  assert.equal(r.category.key, 'pass');
  assert.equal(r.category.label, 'Aprobado');
  assert.equal(r.position, 33);
  assert.deepEqual(r.next, { label: 'Bueno', needed: 3 });
  assert.deepEqual(r.table.map((x) => x.text), ['≤9', '10–14', '15–16', '≥17']);
  assert.deepEqual(r.table.map((x) => x.label), ['Reprobado', 'Aprobado', 'Bueno', 'Excelente']);
  assert.equal(classifyPullups({ age: 19, sex: 'M', reps: 30 }).position, 100);
  assert.equal(classifyPullups({ age: 19, sex: 'M', reps: 30 }).next, null);
  assert.ok(!r.flags.includes('military_standard'));
  assert.ok(r.flags.includes('trained_sample'));
  assert.ok(!r.flags.includes('age_outside_sample'));
  for (const age of [18, 19, 20, 21, 22]) assert.ok(!classifyPullups({ age, sex: 'M', reps: 5 }).flags.includes('age_outside_sample'), `edad ${age}`);
  for (const age of [23, 24, 25]) assert.ok(classifyPullups({ age, sex: 'M', reps: 5 }).flags.includes('age_outside_sample'), `edad ${age}`);
  assert.match(NORMS.pullup.caveat, /estándar de logro/);
  assert.deepEqual(r.sources.map((s) => s.short), ['China (2014)', 'USMC (MCO 6100.13A)', 'Thomas et al. (2020)']);
});

test('dominadas: referencias para hombres de 18 a 25 (línea USMC y Thomas)', () => {
  const r = classifyPullups({ age: 22, sex: 'M', reps: 12 });
  assert.deepEqual(r.references.map((x) => x.key), ['usmc', 'thomas']);
  assert.equal(r.references[0].label, 'Infantería de Marina de EE. UU. (USMC), 21–25 años');
  assert.match(r.references[0].text, /^Mínimo 5 · máximo 23\. Puntaje aproximado: 63\.$/);
  assert.equal(r.references[1].label, 'Hombres que entrenan (Thomas et al., 2020)');
  assert.match(r.references[1].text, /^Percentil estimado \d+ \(n = 38\)\.$/);
  assert.equal(classifyPullups({ age: 18, sex: 'M', reps: 4 }).references[0].label, 'Infantería de Marina de EE. UU. (USMC), 17–20 años');
  assert.match(classifyPullups({ age: 18, sex: 'M', reps: 4 }).references[0].text, /Mínimo 4 · máximo 20\. Puntaje aproximado: 40\./);
  assert.match(classifyPullups({ age: 18, sex: 'M', reps: 3 }).references[0].text, /Aún no llegas al mínimo/);
  assert.match(classifyPullups({ age: 22, sex: 'M', reps: 40 }).references[0].text, /Puntaje aproximado: 100\./);
});

test('dominadas: el percentil de Thomas usa la normal (14,5 ± 5,3), entre 1 y 99', () => {
  const pc = (reps) => Number(classifyPullups({ age: 22, sex: 'M', reps }).references[1].text.match(/estimado (\d+)/)[1]);
  assert.equal(pc(0), 1);
  assert.equal(pc(15), 54);
  assert.equal(pc(14), 46);
  assert.equal(pc(80), 99);
  for (let i = 1; i < 40; i++) assert.ok(pc(i) >= pc(i - 1));
});

test('dominadas: USMC para hombres de 26 a 30 y todas las mujeres (tabla, posición, puntaje, siguiente)', () => {
  const esperado = {
    M: { '26–30': [5, 23, 40] },
    F: { '17–20': [1, 7, 60], '21–25': [3, 11, 60], '26–30': [4, 12, 60] },
  };
  const edadDe = { '17–20': 19, '21–25': 23, '26–30': 28 };
  for (const [sex, bandas] of Object.entries(esperado)) {
    for (const [b, [min, max, pts]] of Object.entries(bandas)) {
      const f = (reps) => classifyPullups({ age: edadDe[b], sex, reps });
      assert.equal(f(1).band, `USMC ${b}`);
      assert.equal(f(min - 1).category.key, 'below_min');
      assert.equal(f(min).category.key, 'passing');
      assert.equal(f(max - 1).category.key, 'passing');
      assert.equal(f(max).category.key, 'max');
      assert.equal(f(max).position, 100);
      assert.equal(f(max).next, null);
      assert.equal(f(0).position, 0);
      assert.equal(f(min).position, 25);
      assert.deepEqual(f(min - 1).next, { label: 'Aprobado', needed: 1 });
      assert.deepEqual(f(min).next, { label: 'Máximo', needed: max - min });
      assert.deepEqual(f(1).table.map((x) => x.text), [`<${min}`, `${min}–${max - 1}`, `≥${max}`]);
      assert.deepEqual(f(1).table.map((x) => x.label), ['Bajo el mínimo', 'Aprobado', 'Máximo']);
      assert.ok(f(min).flags.includes('military_standard'));
      assert.ok(f(min).flags.includes('estimated_norm'));
      assert.match(f(min).references.find((x) => x.key === 'usmc_points').text, new RegExp(`Puntaje aproximado: ${pts}\\.`));
      assert.match(f(max).references.find((x) => x.key === 'usmc_points').text, /Puntaje aproximado: 100\./);
    }
  }
  for (const [age, b] of [[18, '17–20'], [20, '17–20'], [21, '21–25'], [25, '21–25'], [26, '26–30'], [30, '26–30']]) {
    assert.equal(banda(classifyPullups, age, 'F'), `USMC ${b}`);
  }
  assert.equal(classifyPullups({ age: 28, sex: 'M', reps: 14 }).position, Math.round(25 + 70 * 9 / 18));
  assert.equal(classifyPullups({ age: 28, sex: 'M', reps: 14 }).references.find((x) => x.key === 'usmc_points').text, 'Mínimo 5 · máximo 23. Puntaje aproximado: 70.');
  assert.equal(classifyPullups({ age: 20, sex: 'F', reps: 4 }).position, Math.round(25 + 70 * 3 / 6));
  assert.equal(classifyPullups({ age: 20, sex: 'F', reps: 4 }).category.index, 1);
  const mujer = classifyPullups({ age: 28, sex: 'F', reps: 5 });
  assert.ok(!mujer.flags.includes('trained_sample'));
  assert.ok(!mujer.references.some((x) => x.key === 'thomas'));
  assert.equal(mujer.sources.length, 1);
  const hombre = classifyPullups({ age: 28, sex: 'M', reps: 5 });
  assert.ok(hombre.flags.includes('trained_sample'));
  assert.ok(hombre.references.some((x) => x.key === 'thomas'));
  assert.equal(hombre.sources.length, 2);
  assert.ok(!hombre.flags.includes('age_outside_sample'));
});

test('fondos: tabla de Thomas 2020 para hombres, percentil y marcas', () => {
  for (const age of [18, 25, 30]) revisarCortes((reps) => classifyDips({ age, sex: 'M', reps }), 5, [13, 20, 35, 41]);
  const r = classifyDips({ age: 24, sex: 'M', reps: 27 });
  assert.equal(r.band, 'hombres que entrenan (Thomas 2020)');
  assert.equal(r.category.key, 'average');
  assert.equal(r.percentile, 50);
  assert.equal(r.position, 50);
  assert.deepEqual(r.table.map((x) => x.text), ['≤12', '13–19', '20–34', '35–40', '≥41']);
  assert.deepEqual(r.next, { label: 'Alto', needed: 8 });
  assert.ok(r.flags.includes('estimated_norm') && r.flags.includes('trained_sample'));
  assert.equal(r.sources.length, 1);
  assert.equal(r.source.short, 'Thomas et al. (2020)');
  assert.equal(classifyDips({ age: 24, sex: 'M', reps: 0 }).percentile, 1);
  assert.equal(classifyDips({ age: 24, sex: 'M', reps: 0 }).position, 5);
  assert.equal(classifyDips({ age: 24, sex: 'M', reps: 100 }).percentile, 99);
  assert.equal(classifyDips({ age: 24, sex: 'M', reps: 100 }).position, 95);
  assert.equal(classifyDips({ age: 24, sex: 'M', reps: 100 }).next, null);
  const p13 = classifyDips({ age: 24, sex: 'M', reps: 13 }).percentile;
  assert.ok(p13 >= 7 && p13 <= 14);
});

test('fondos: las mujeres no tienen baremo (no se inventa una categoría)', () => {
  for (const age of EDADES) {
    const r = classifyDips({ age, sex: 'F', reps: 12 });
    assert.equal(r.category, null);
    assert.equal(r.position, null);
    assert.equal(r.percentile, null);
    assert.deepEqual(r.table, []);
    assert.equal(r.next, null);
    assert.deepEqual(r.flags, ['no_norm']);
    assert.equal(r.band, 'sin baremo');
    assert.equal(r.value, 12);
    assert.equal(r.unit, 'rep');
    assert.deepEqual(r.references, [{ key: 'no_norm', label: 'Sin baremo publicado', text: 'Aún no existe un baremo publicado de fondos para mujeres. FitGram guarda tu marca para comparar tu avance.' }]);
  }
});

test('dominadas y fondos: fuera del rango de edad no clasifican', () => {
  for (const fn of [classifyPullups, classifyDips]) {
    assert.throws(() => fn({ age: 31, sex: 'M', reps: 5 }), RangeError);
    assert.throws(() => fn({ age: 17, sex: 'F', reps: 5 }), RangeError);
  }
});
