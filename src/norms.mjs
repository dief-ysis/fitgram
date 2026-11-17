// FitGram v0 — norms (baremos) and classification for ages 18–21.
// Push-ups: CSEP/ACSM · Squats: ACE (Mackenzie 2005) · Plank: Strand et al. (2014).
// Each table is only valid with its own protocol (see NORMS[test].protocol).

const PUSHUP_CATS = [['needs_improvement', 'Necesita mejorar'], ['fair', 'Regular'], ['good', 'Bueno'], ['very_good', 'Muy bueno'], ['excellent', 'Excelente']];
const SQUAT_CATS = [['very_poor', 'Muy pobre'], ['poor', 'Pobre'], ['below_average', 'Bajo el promedio'], ['average', 'Promedio'], ['above_average', 'Sobre el promedio'], ['good', 'Bueno'], ['excellent', 'Excelente']];
const PLANK_CATS = [['very_low', 'Muy bajo'], ['low', 'Bajo'], ['average', 'Promedio'], ['high', 'Alto'], ['very_high', 'Muy alto']];

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/**
 * Frozen norm data, protocol notes, caveats and sources.
 * `mins` = lowest score of each category from the second one upward (category 0 starts at 0).
 * @type {Readonly<Record<'pushup'|'squat'|'plank', object>>}
 */
const NORMS = deepFreeze({
  pushup: {
    name: 'Flexiones de brazos',
    categories: PUSHUP_CATS,
    bands: {
      '15–19': {
        M: { mins: [18, 23, 29, 39], unverified: ['fair', 'very_good', 'excellent'] },
        F: { mins: [12, 18, 25, 33], unverified: ['fair', 'very_good', 'excellent'] },
      },
      '20–29': {
        M: { mins: [17, 22, 29, 36], unverified: [] },
        F: { mins: [10, 15, 21, 30], unverified: [] },
      },
    },
    protocol: [
      'Repeticiones seguidas, sin límite de tiempo y sin descansar.',
      'Hombres desde la punta de los pies; mujeres con apoyo de rodillas (versión modificada de CSEP).',
      'Espalda recta todo el tiempo: baja hasta que el mentón llegue a la colchoneta, sin apoyar el abdomen, y sube hasta extender los brazos.',
      'Termina cuando no puedes mantener la técnica en dos repeticiones seguidas.',
    ],
    caveat: 'Tres cortes de la banda 15–19 (Excelente, Muy bueno y Regular) no se confirmaron en una fuente primaria; conviene verificarlos en las ACSM\'s Guidelines.',
    source: {
      short: 'CSEP/ACSM',
      apa: 'Canadian Society for Exercise Physiology. (2003). The Canadian physical activity, fitness & lifestyle approach: CSEP-Health & Fitness Program\'s health-related appraisal and counselling strategy (3.ª ed.). CSEP.',
      url: 'https://www.cocc.edu/departments/health-and-human-performance/exercise-physiology-lab/files/push-up_procedure_and_norm.doc',
    },
    secondary: ['American College of Sports Medicine. (2021). ACSM\'s guidelines for exercise testing and prescription (11.ª ed.). Wolters Kluwer.'],
  },
  squat: {
    name: 'Sentadillas con peso corporal',
    categories: SQUAT_CATS,
    band: '18–25',
    tables: {
      M: { mins: [25, 31, 35, 39, 44, 50] },
      F: { mins: [18, 25, 29, 33, 37, 44] },
    },
    protocol: [
      'Puedes extender los brazos al frente o a los lados para mantener el equilibrio.',
      'Baja hasta que los muslos queden paralelos al suelo y vuelve a quedar de pie.',
      'Sin límite de tiempo: haz todas las repeticiones controladas y completas que puedas.',
      'Termina cuando no logras bajar completo, te detienes a descansar o pierdes el equilibrio al pararte.',
    ],
    caveat: 'La tabla de ACE coincide cifra por cifra con un baremo de abdominales en 1 minuto; es probable que no provenga de un estudio propio de sentadillas.',
    source: {
      short: 'ACE (Mackenzie, 2005)',
      apa: 'American Council on Exercise. (s.f.). Bodyweight squat assessment protocol [Documento PDF]. Baremos reproducidos de Mackenzie, B. (2005). 101 performance evaluation tests. Green Star Media.',
      url: 'https://www.acefitness.org/images/webcontent/assets/certification/ace-answers/forms/pt/37_Bodyweight_Squat_Assessment_Protocol.pdf',
    },
  },
  plank: {
    name: 'Plancha prona en antebrazos',
    categories: PLANK_CATS,
    band: 'universitarios (Strand 2014)',
    // Table 2, deciles P10..P90 in seconds.
    deciles: {
      M: [62, 79, 89, 97, 110, 122, 137, 157, 201],
      F: [35, 48, 58, 63, 72, 84, 95, 108, 142],
    },
    // Table 3, sex x athletic status, deciles P10..P90 (reference only).
    byAthleticStatus: {
      F_nonVarsity: [34, 47, 56, 62, 70, 79, 91, 103, 130],
      F_varsity: [45, 59, 63, 74, 87, 97, 110, 162, 194],
      M_nonVarsity: [49, 72, 83, 95, 103, 115, 125, 142, 189],
      M_varsity: [74, 84, 94, 117, 125, 140, 157, 183, 228],
    },
    meanSD: { M: [124, 72], F: [83, 63] },
    sample: { n: 471, meanAge: 20.4 },
    // Category cut points as percentiles: <P10, <P30, <P70, <P90, else.
    cutPercentiles: [10, 30, 70, 90],
    protocol: [
      'Apoyo en antebrazos y punta de los pies, con los codos bajo los hombros.',
      'Cuerpo rígido y en línea: tobillos, rodillas y caderas extendidos, espalda neutra.',
      'El tiempo corre desde que tomas la posición correcta; se hace un solo intento.',
      'Termina por cansancio, si pierdes la posición o tras dos correcciones seguidas que no logras cumplir.',
    ],
    caveat: 'Muestra de universitarios de EE. UU. (n = 471); en otras poblaciones los tiempos pueden ser menores.',
    source: {
      short: 'Strand et al. (2014)',
      apa: 'Strand, S. L., Hjelm, J., Shoepe, T. C., & Fajardo, M. A. (2014). Norms for an isometric muscle endurance test. Journal of Human Kinetics, 40, 93–102.',
      url: 'https://doi.org/10.2478/hukin-2014-0011',
    },
  },
});

/* ---------------------------------------------------------------- helpers */

/**
 * Edades que cubren los baremos de esta versión.
 * La tabla CSEP de flexiones llega hasta 29 y la de sentadillas de ACE dice 18–25,
 * pero la de plancha es de universitarios, así que el conjunto se declara en 18–21.
 * Subirlo es una decisión del equipo de ciencias del deporte, no del código.
 */
const AGE_RANGE = Object.freeze({ min: 18, max: 21 });

/** True si los baremos cubren esa edad. Única fuente de verdad del rango. */
function coversAge(age) {
  return Number.isInteger(age) && age >= AGE_RANGE.min && age <= AGE_RANGE.max;
}

function checkAgeSex(age, sex) {
  if (!coversAge(age)) throw new RangeError(`FitGram v0 solo tiene baremos para personas de ${AGE_RANGE.min} a ${AGE_RANGE.max} años.`);
  if (sex !== 'M' && sex !== 'F') throw new RangeError('El sexo debe ser "M" (hombre) o "F" (mujer).');
}

function checkValue(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`${what} debe ser un número mayor o igual a 0.`);
}

/** Index of the category for `value`, given the lower bounds of categories 1..n-1. */
function categoryIndex(value, mins) {
  let i = 0;
  while (i < mins.length && value >= mins[i]) i++;
  return i;
}

/** Table rows (lowest → highest) for integer-score tables. `style`: 'le' (≤x/≥y) or 'lt' (<x/>y). */
function repTable(cats, mins, style) {
  const last = cats.length - 1;
  return cats.map(([key, label], i) => {
    const min = i === 0 ? 0 : mins[i - 1];
    const max = i === last ? null : mins[i] - 1;
    let text;
    if (i === 0) text = style === 'le' ? `≤${max}` : `<${mins[0]}`;
    else if (i === last) text = style === 'le' ? `≥${min}` : `>${min - 1}`;
    else text = `${min}–${max}`;
    return { key, label, min, max, text };
  });
}

function result(test, value, unit, band, cats, index, position, percentile, table, next, flags) {
  const [key, label] = cats[index];
  return { test, value, unit, band, category: { key, label, index, of: cats.length }, position, percentile, table, next, flags, source: { ...NORMS[test].source } };
}

/* ---------------------------------------------------------------- push-ups */

/**
 * CSEP/ACSM band used for an age: 18–19 → '15–19', 20–21 → '20–29'.
 * @param {number} age
 * @returns {'15–19'|'20–29'|null} null outside 18–21
 */
function ageBandPushups(age) {
  if (!coversAge(age)) return null;
  return age <= 19 ? '15–19' : '20–29';
}

/**
 * Classifies a push-up score (max consecutive, CSEP protocol; men toes, women knees).
 * @param {{age:number, sex:'M'|'F', reps:number}} p
 */
function classifyPushups({ age, sex, reps }) {
  checkAgeSex(age, sex);
  checkValue(reps, 'El número de flexiones');
  const value = Math.floor(reps);
  const band = ageBandPushups(age);
  const t = NORMS.pushup.bands[band][sex];
  const idx = categoryIndex(value, t.mins);
  const table = repTable(PUSHUP_CATS, t.mins, 'le');
  const next = idx < PUSHUP_CATS.length - 1 ? { label: PUSHUP_CATS[idx + 1][1], needed: t.mins[idx] - value } : null;
  const flags = t.unverified.includes(PUSHUP_CATS[idx][0]) ? ['unverified_cut'] : [];
  return result('pushup', value, 'rep', band, PUSHUP_CATS, idx, Math.round(idx / 4 * 100), null, table, next, flags);
}

/* ---------------------------------------------------------------- squats */

/**
 * Classifies a bodyweight squat score (ACE, until fatigue, thighs parallel), band 18–25.
 * Every result carries the flag 'questionable_source'.
 * @param {{age:number, sex:'M'|'F', reps:number}} p
 */
function classifySquats({ age, sex, reps }) {
  checkAgeSex(age, sex);
  checkValue(reps, 'El número de sentadillas');
  const value = Math.floor(reps);
  const t = NORMS.squat.tables[sex];
  const idx = categoryIndex(value, t.mins);
  const table = repTable(SQUAT_CATS, t.mins, 'lt');
  const next = idx < SQUAT_CATS.length - 1 ? { label: SQUAT_CATS[idx + 1][1], needed: t.mins[idx] - value } : null;
  return result('squat', value, 'rep', NORMS.squat.band, SQUAT_CATS, idx, Math.round(idx / 6 * 100), null, table, next, ['questionable_source']);
}

/* ---------------------------------------------------------------- plank */

/**
 * Percentile of a plank time by linear interpolation between deciles (Strand 2014, Table 2).
 * Below P10: 10·s/P10. Above P90: min(99, 90 + 10·(s − P90)/(P90 − P80)).
 * @param {number} seconds
 * @param {'M'|'F'} sex
 * @returns {{percentile:number, extrapolated:boolean}} percentile not rounded
 */
function plankPercentile(seconds, sex) {
  const d = NORMS.plank.deciles[sex];
  if (seconds < d[0]) return { percentile: 10 * seconds / d[0], extrapolated: true };
  if (seconds > d[8]) return { percentile: Math.min(99, 90 + 10 * (seconds - d[8]) / (d[8] - d[7])), extrapolated: true };
  for (let i = 0; i < 8; i++) {
    if (seconds <= d[i + 1]) return { percentile: 10 * (i + 1) + 10 * (seconds - d[i]) / (d[i + 1] - d[i]), extrapolated: false };
  }
  return { percentile: 90, extrapolated: false };
}

/**
 * Classifies a prone forearm plank time (Strand et al. 2014). Not age-banded (university students).
 * @param {{age:number, sex:'M'|'F', seconds:number}} p
 */
function classifyPlank({ age, sex, seconds }) {
  checkAgeSex(age, sex);
  checkValue(seconds, 'El tiempo de plancha');
  const d = NORMS.plank.deciles[sex];
  const cuts = [d[0], d[2], d[6], d[8]]; // P10, P30, P70, P90 in seconds
  const idx = categoryIndex(seconds, cuts);
  const { percentile, extrapolated } = plankPercentile(seconds, sex);
  // Truncate (not round) so a time just under P10 never reports "percentil 10" next to "Muy bajo (<P10)".
  const p = Math.floor(percentile + 1e-9);
  const table = PLANK_CATS.map(([key, label], i) => {
    const min = i === 0 ? 0 : cuts[i - 1];
    const max = i === PLANK_CATS.length - 1 ? null : cuts[i] - 1;
    const text = i === 0 ? `<${cuts[0]} s` : i === PLANK_CATS.length - 1 ? `≥${min} s` : `${min}–${max} s`;
    return { key, label, min, max, text };
  });
  const next = idx < PLANK_CATS.length - 1 ? { label: PLANK_CATS[idx + 1][1], needed: Math.max(1, Math.ceil(cuts[idx] - seconds)) } : null;
  const position = Math.min(95, Math.max(5, p));
  return result('plank', seconds, 's', NORMS.plank.band, PLANK_CATS, idx, position, p, table, next, extrapolated ? ['extrapolated'] : []);
}

/* ---------------------------------------------------------------- profile */

/**
 * Exploratory FitGram index: mean of the available tests' positions (0–100).
 * @param {{pushup?:object|null, squat?:object|null, plank?:object|null}} parts classify* results
 * @returns {{position:number|null, label:string|null, parts:Array<{test:string, position:number, label:string}>, note:string}}
 */
function fitnessProfile({ pushup = null, squat = null, plank = null } = {}) {
  const parts = [pushup, squat, plank].filter(Boolean).map((r) => ({ test: r.test, position: r.position, label: r.category.label }));
  const note = 'Índice exploratorio de FitGram: promedia posiciones de baremos distintos; no es un puntaje validado.';
  if (!parts.length) return { position: null, label: null, parts, note };
  const position = Math.round(parts.reduce((a, p) => a + p.position, 0) / parts.length);
  const label = position < 20 ? 'Muy bajo' : position < 40 ? 'Bajo' : position < 60 ? 'Medio' : position < 80 ? 'Alto' : 'Muy alto';
  return { position, label, parts, note };
}

export { NORMS, AGE_RANGE, coversAge, ageBandPushups, classifyPushups, classifySquats, plankPercentile, classifyPlank, fitnessProfile };
