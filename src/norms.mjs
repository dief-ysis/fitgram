// FitGram v0 — baremos y clasificación para edades de 18 a 30 años (ampliado desde 18–21 con fitgram-v1 de José).
// Push-ups: CSEP/ACSM · Squats: ACE (Mackenzie 2005) · Plank: Strand et al. (2014).
// Cada tabla vale solo con su propio protocolo (ver NORMS[test].protocol).

const PUSHUP_CATS = [['needs_improvement', 'Necesita mejorar'], ['fair', 'Regular'], ['good', 'Bueno'], ['very_good', 'Muy bueno'], ['excellent', 'Excelente']];
const SQUAT_CATS = [['very_poor', 'Muy pobre'], ['poor', 'Pobre'], ['below_average', 'Bajo el promedio'], ['average', 'Promedio'], ['above_average', 'Sobre el promedio'], ['good', 'Bueno'], ['excellent', 'Excelente']];
const PLANK_CATS = [['very_low', 'Muy bajo'], ['low', 'Bajo'], ['average', 'Promedio'], ['high', 'Alto'], ['very_high', 'Muy alto']];
// Pruebas con barra (traídas de fitgram-v1 de José, 26-nov-2026).
const CHINA_CATS = [['fail', 'Reprobado'], ['pass', 'Aprobado'], ['good', 'Bueno'], ['excellent', 'Excelente']];
const USMC_CATS = [['below_min', 'Bajo el mínimo'], ['passing', 'Aprobado'], ['max', 'Máximo']];
const DIP_CATS = PLANK_CATS; // las mismas cinco etiquetas: Muy bajo … Muy alto

/** Fuentes de las pruebas con barra. */
const SRC_BARRA = {
  china: {
    short: 'China (2014)',
    apa: 'Ministerio de Educación de la República Popular China. (2014). Estándar nacional de salud física estudiantil (revisión 2014).',
    url: 'https://www2.scut.edu.cn/_upload/article/files/ec/fe/446734564a3fb1ea3bc6edb4aae5/d39f68c5-788b-4fc9-b504-8c57412abb99.pdf',
  },
  usmc: {
    short: 'USMC (MCO 6100.13A)',
    apa: 'U.S. Marine Corps. (s.f.). Table 2-2: Hybrid pull-up/push-up test scoring tables (MCO 6100.13A).',
    url: 'https://www.fitness.marines.mil/Portals/211/Docs/PFT_CFT/PFT_CFT%20Standards/Table%202-2%20Hybrid%20Pull-up%20Push-up%20Test%20Scoring%20Tables.pdf',
  },
  thomas: {
    short: 'Thomas et al. (2020)',
    apa: 'Thomas, E., Gennaro, V., Battaglia, G., Bellafiore, M., Iovane, A., Palma, A., & Bianco, A. (2020). Upper body strength endurance evaluation: A comparison between the handgrip strength and three body weight tests. Isokinetics and Exercise Science.',
    url: 'https://content.iospress.com/articles/isokinetics-and-exercise-science/ies202206',
  },
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/**
 * Datos de baremos congelados, notas de protocolo, advertencias y fuentes.
 * `mins` = puntaje mínimo de cada categoría desde la segunda en adelante (la categoría 0 parte en 0).
 * @type {Readonly<Record<'pushup'|'squat'|'plank'|'pullup'|'dip', object>>}
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
      // Banda 30–39, para quien tiene 30 (traída de fitgram-v1 de José, 26-nov-2026).
      '30–39': {
        M: { mins: [12, 17, 22, 30], unverified: [] },
        F: { mins: [8, 13, 20, 27], unverified: [] },
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
    // Bandas ACE por edad (la de 26–35 viene de fitgram-v1 de José, 26-nov-2026).
    ageBands: [[18, 25, '18–25'], [26, 30, '26–35']],
    bands: {
      '18–25': {
        M: { mins: [25, 31, 35, 39, 44, 50] },
        F: { mins: [18, 25, 29, 33, 37, 44] },
      },
      '26–35': {
        M: { mins: [22, 29, 31, 35, 40, 46] },
        F: { mins: [13, 21, 25, 29, 33, 40] },
      },
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
    // Tabla 2, deciles P10..P90 en segundos.
    deciles: {
      M: [62, 79, 89, 97, 110, 122, 137, 157, 201],
      F: [35, 48, 58, 63, 72, 84, 95, 108, 142],
    },
    // Tabla 3, sexo x condición de deportista, deciles P10..P90 (solo de referencia).
    byAthleticStatus: {
      F_nonVarsity: [34, 47, 56, 62, 70, 79, 91, 103, 130],
      F_varsity: [45, 59, 63, 74, 87, 97, 110, 162, 194],
      M_nonVarsity: [49, 72, 83, 95, 103, 115, 125, 142, 189],
      M_varsity: [74, 84, 94, 117, 125, 140, 157, 183, 228],
    },
    meanSD: { M: [124, 72], F: [83, 63] },
    sample: { n: 471, meanAge: 20.4 },
    // Cortes de categoría como percentiles: <P10, <P30, <P70, <P90, resto.
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
  pullup: {
    name: 'Dominadas',
    categories: CHINA_CATS,
    // Solo hombres. Estándar nacional de estudiantes de China (2014), por año de estudio.
    china: {
      M: [
        { from: 18, to: 19, band: 'China 2014 · 1.º–2.º año', mins: [10, 15, 17] },
        { from: 20, to: 25, band: 'China 2014 · 3.º–4.º año', mins: [11, 16, 18], outsideFrom: 23 },
      ],
    },
    // Mínimo y máximo de dominadas de la Infantería de Marina de EE. UU. por edad; puntaje aproximado:
    // mínimo = minPoints, máximo = 100, lineal entre medio.
    usmc: {
      categories: USMC_CATS,
      ageBands: [[18, 20, '17–20'], [21, 25, '21–25'], [26, 30, '26–30']],
      bands: {
        '17–20': { M: { min: 4, max: 20 }, F: { min: 1, max: 7 } },
        '21–25': { M: { min: 5, max: 23 }, F: { min: 3, max: 11 } },
        '26–30': { M: { min: 5, max: 23 }, F: { min: 4, max: 12 } },
      },
      minPoints: { M: 40, F: 60 },
      maxPoints: 100,
    },
    // Hombres que entrenan (n = 38, 23,9 ± 6,7 años, ≥ 3 meses de entrenamiento): 14,5 ± 5,3 dominadas.
    thomas: { M: { mean: 14.5, sd: 5.3, n: 38, meanAge: 23.9 } },
    protocol: [
      'Agarre prono (palmas hacia adelante), un poco más ancho que los hombros.',
      'Parte colgado y quieto, con los brazos completamente extendidos.',
      'Vale cuando el mentón sobrepasa la barra y vuelves a extender los brazos por completo.',
      'Sin balanceo ni impulso de piernas, y sin límite de tiempo: termina cuando no puedes seguir o sueltas la barra.',
    ],
    caveat: 'No existe un baremo poblacional de dominadas hasta el fallo. El estándar de China (2014) es un estándar de logro para estudiantes hombres, no percentiles. Los valores del USMC son un mínimo y un máximo militares, no percentiles; el puntaje se aproxima en forma lineal. La referencia de Thomas et al. (2020) viene de solo 38 hombres que entrenan.',
    source: SRC_BARRA.china,
  },
  dip: {
    name: 'Fondos en paralelas',
    categories: DIP_CATS,
    band: 'hombres que entrenan (Thomas 2020)',
    noNormBand: 'sin baremo',
    // Hombres: media ± DE de hombres que entrenan; mins = P10/P25/P75/P90 del documento de estándares.
    thomas: { M: { mean: 27.1, sd: 11.2, n: 38, meanAge: 23.9, mins: [13, 20, 35, 41] } },
    protocol: [
      'Barras paralelas; parte con los brazos completamente extendidos.',
      'Baja hasta que cada codo llegue al menos a 90° y vuelve a extender los brazos.',
      'Sin ayuda de las piernas.',
      'Sin límite de tiempo ni de ritmo: termina cuando no puedes seguir o apoyas los pies.',
    ],
    caveat: 'No existe un baremo poblacional ni un estándar oficial de fondos en paralelas hasta el fallo. Los valores salen de 38 hombres que entrenan (Thomas et al., 2020). No hay datos publicados para mujeres.',
    source: SRC_BARRA.thomas,
  },
});

/* ---------------------------------------------------------------- utilidades */

/**
 * Edades que cubren los baremos de esta versión: 18 a 30, como lo amplió José en fitgram-v1 (26-nov-2026; antes
 * 18 a 21). Flexiones usa las bandas CSEP 15–19, 20–29 y 30–39; sentadillas, las ACE 18–25 y 26–35; la plancha sigue
 * con la tabla de universitarios. Cambiarlo es una decisión del equipo de ciencias del deporte, no del código.
 */
const AGE_RANGE = Object.freeze({ min: 18, max: 30 });

/** True si los baremos cubren esa edad. Única fuente de verdad del rango. */
function coversAge(age) {
  return Number.isInteger(age) && age >= AGE_RANGE.min && age <= AGE_RANGE.max;
}

function checkAgeSex(age, sex) {
  if (!coversAge(age)) throw new RangeError(`FitGram solo tiene baremos para personas de ${AGE_RANGE.min} a ${AGE_RANGE.max} años.`);
  if (sex !== 'M' && sex !== 'F') throw new RangeError('El sexo debe ser "M" (hombre) o "F" (mujer).');
}

function checkValue(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`${what} debe ser un número mayor o igual a 0.`);
}

/** Índice de la categoría de `value`, dados los límites inferiores de las categorías 1..n-1. */
function categoryIndex(value, mins) {
  let i = 0;
  while (i < mins.length && value >= mins[i]) i++;
  return i;
}

/** Filas de la tabla (de menor a mayor) para puntajes enteros. `style`: 'le' (≤x/≥y), 'lt' (<x/>y) o 'ge' (<x/≥y). */
function repTable(cats, mins, style) {
  const last = cats.length - 1;
  return cats.map(([key, label], i) => {
    const min = i === 0 ? 0 : mins[i - 1];
    const max = i === last ? null : mins[i] - 1;
    let text;
    if (i === 0) text = style === 'le' ? `≤${max}` : `<${mins[0]}`;
    else if (i === last) text = style === 'lt' ? `>${min - 1}` : `≥${min}`;
    else text = `${min}–${max}`;
    return { key, label, min, max, text };
  });
}

function result(test, value, unit, band, cats, index, position, percentile, table, next, flags) {
  const [key, label] = cats[index];
  return { test, value, unit, band, category: { key, label, index, of: cats.length }, position, percentile, table, next, flags, source: { ...NORMS[test].source } };
}

/* ---------------------------------------------------------------- flexiones */

/**
 * Banda CSEP/ACSM que corresponde a una edad: 18–19 → '15–19', 20–29 → '20–29', 30 → '30–39'.
 * @param {number} age
 * @returns {'15–19'|'20–29'|'30–39'|null} null fuera del rango de los baremos
 */
function ageBandPushups(age) {
  if (!coversAge(age)) return null;
  return age <= 19 ? '15–19' : age <= 29 ? '20–29' : '30–39';
}

/** Banda ACE de sentadillas para una edad: 18–25 → '18–25', 26–30 → '26–35'. */
function ageBandSquats(age) {
  if (!coversAge(age)) return null;
  return NORMS.squat.ageBands.find(([desde, hasta]) => age >= desde && age <= hasta)[2];
}

/**
 * Clasifica un puntaje de flexiones (máximo consecutivo, protocolo CSEP; hombres en punta de pies, mujeres de rodillas).
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

/* ---------------------------------------------------------------- sentadillas */

/**
 * Clasifica un puntaje de sentadillas sin carga (ACE, hasta la fatiga, muslos paralelos), banda 18–25 o 26–35.
 * Todo resultado lleva la marca 'questionable_source'.
 * @param {{age:number, sex:'M'|'F', reps:number}} p
 */
function classifySquats({ age, sex, reps }) {
  checkAgeSex(age, sex);
  checkValue(reps, 'El número de sentadillas');
  const value = Math.floor(reps);
  const band = ageBandSquats(age);
  const t = NORMS.squat.bands[band][sex];
  const idx = categoryIndex(value, t.mins);
  const table = repTable(SQUAT_CATS, t.mins, 'lt');
  const next = idx < SQUAT_CATS.length - 1 ? { label: SQUAT_CATS[idx + 1][1], needed: t.mins[idx] - value } : null;
  return result('squat', value, 'rep', band, SQUAT_CATS, idx, Math.round(idx / 6 * 100), null, table, next, ['questionable_source']);
}

/* ---------------------------------------------------------------- plancha */

/**
 * Percentil de un tiempo de plancha por interpolación lineal entre deciles (Strand 2014, Tabla 2).
 * Bajo P10: 10·s/P10. Sobre P90: min(99, 90 + 10·(s − P90)/(P90 − P80)).
 * @param {number} seconds
 * @param {'M'|'F'} sex
 * @returns {{percentile:number, extrapolated:boolean}} percentil sin redondear
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
 * Clasifica un tiempo de plancha en antebrazos boca abajo (Strand et al. 2014). Sin bandas de edad (universitarios).
 * @param {{age:number, sex:'M'|'F', seconds:number}} p
 */
function classifyPlank({ age, sex, seconds }) {
  checkAgeSex(age, sex);
  checkValue(seconds, 'El tiempo de plancha');
  const d = NORMS.plank.deciles[sex];
  const cuts = [d[0], d[2], d[6], d[8]]; // P10, P30, P70, P90 en segundos
  const idx = categoryIndex(seconds, cuts);
  const { percentile, extrapolated } = plankPercentile(seconds, sex);
  // Truncar (no redondear): un tiempo apenas bajo P10 nunca dice "percentil 10" junto a "Muy bajo (<P10)".
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

/* ---------------------------------------------------------------- pruebas con barra */

/** Resultado de una prueba con barra: el mismo formato de siempre, más referencias y la lista de fuentes. */
function resultadoBarra(test, value, band, cats, index, position, percentile, table, next, flags, references, sources) {
  const [key, label] = cats[index];
  return {
    test, value, unit: 'rep', band, category: { key, label, index, of: cats.length }, position, percentile, table, next,
    flags, references, source: { ...sources[0] }, sources: sources.map((x) => ({ ...x })),
  };
}

function siguiente(cats, mins, idx, value) {
  return idx < cats.length - 1 ? { label: cats[idx + 1][1], needed: mins[idx] - value } : null;
}

/** Función de error, Abramowitz y Stegun 7.1.26 (error máximo ≈ 1,5e-7). */
function erf(x) {
  const sg = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sg * y;
}

/** Percentil (entero, 1..99) de `value` en una normal N(media, de). */
function percentilNormal(value, mean, sd) {
  return Math.min(99, Math.max(1, Math.round(50 * (1 + erf((value - mean) / (sd * Math.SQRT2))))));
}

/** La fila de China 2014 (hombres) para una edad, o null. */
function filaChina(age) {
  return NORMS.pullup.china.M.find((r) => age >= r.from && age <= r.to) || null;
}

/** Banda USMC de dominadas para una edad y sexo, con su mínimo y máximo. */
function usmcPara(age, sex) {
  const U = NORMS.pullup.usmc, fila = U.ageBands.find(([desde, hasta]) => age >= desde && age <= hasta);
  return fila ? { label: fila[2], ...U.bands[fila[2]][sex] } : null;
}

/** Puntaje USMC aproximado: mínimo = 40 (hombres) / 60 (mujeres), máximo = 100, lineal entre medio; bajo el mínimo = 0. */
function puntosUsmc(reps, sex, u) {
  const U = NORMS.pullup.usmc;
  if (reps < u.min) return 0;
  if (reps >= u.max) return U.maxPoints;
  const lo = U.minPoints[sex];
  return Math.round(lo + (U.maxPoints - lo) * (reps - u.min) / (u.max - u.min));
}

function lineaUsmc(reps, sex, u, key) {
  const head = `Mínimo ${u.min} · máximo ${u.max}.`;
  const text = reps < u.min ? `${head} Aún no llegas al mínimo.` : `${head} Puntaje aproximado: ${puntosUsmc(reps, sex, u)}.`;
  return { key, label: `Infantería de Marina de EE. UU. (USMC), ${u.label} años`, text };
}

/**
 * Clasifica dominadas (máximo continuo, agarre prono, mentón sobre la barra, sin impulso, sin límite de tiempo).
 * No existe baremo poblacional. Hombres 18–25: estándar de estudiantes de China 2014 (1.º–2.º o 3.º–4.º año), con una
 * línea de referencia USMC; hombres 26–30 y todas las mujeres: mínimo y máximo USMC de su edad (puntaje aproximado).
 * Todos los hombres reciben además el percentil frente a hombres que entrenan (Thomas et al., 2020).
 * @param {{age:number, sex:'M'|'F', reps:number}} p
 */
function classifyPullups({ age, sex, reps }) {
  checkAgeSex(age, sex);
  checkValue(reps, 'El número de dominadas');
  const value = Math.floor(reps), flags = [], references = [], th = NORMS.pullup.thomas.M;
  const refThomas = () => references.push({ key: 'thomas', label: 'Hombres que entrenan (Thomas et al., 2020)',
    text: `Percentil estimado ${percentilNormal(value, th.mean, th.sd)} (n = ${th.n}).` });
  const fila = sex === 'M' ? filaChina(age) : null;
  if (fila) {
    const idx = categoryIndex(value, fila.mins);
    if (fila.outsideFrom && age >= fila.outsideFrom) flags.push('age_outside_sample');
    flags.push('estimated_norm', 'trained_sample');
    references.push(lineaUsmc(value, 'M', usmcPara(age, 'M'), 'usmc'));
    refThomas();
    return resultadoBarra('pullup', value, fila.band, CHINA_CATS, idx, Math.round(idx / 3 * 100), null,
      repTable(CHINA_CATS, fila.mins, 'le'), siguiente(CHINA_CATS, fila.mins, idx, value), flags, references,
      [SRC_BARRA.china, SRC_BARRA.usmc, SRC_BARRA.thomas]);
  }
  const u = usmcPara(age, sex);
  const idx = value < u.min ? 0 : value < u.max ? 1 : 2;
  const position = idx === 0 ? Math.round(25 * value / u.min) : idx === 1 ? Math.round(25 + 70 * (value - u.min) / (u.max - u.min)) : 100;
  const mins = [u.min, u.max];
  flags.push('military_standard', 'estimated_norm');
  references.push({ key: 'usmc_points', label: `Puntaje USMC aproximado, ${u.label} años`, text: lineaUsmc(value, sex, u, 'x').text });
  const sources = [SRC_BARRA.usmc];
  if (sex === 'M') { flags.push('trained_sample'); refThomas(); sources.push(SRC_BARRA.thomas); }
  return resultadoBarra('pullup', value, `USMC ${u.label}`, USMC_CATS, idx, position, null,
    repTable(USMC_CATS, mins, 'ge'), siguiente(USMC_CATS, mins, idx, value), flags, references, sources);
}

/**
 * Clasifica fondos en paralelas (máximo continuo, codos a 90° o menos, sin piernas, sin límite de tiempo).
 * Hombres: hombres que entrenan de Thomas et al. (2020) (27,1 ± 11,2), percentil por la normal. Mujeres: no hay baremo
 * publicado (categoría, posición y percentil en null, marca 'no_norm').
 * @param {{age:number, sex:'M'|'F', reps:number}} p
 */
function classifyDips({ age, sex, reps }) {
  checkAgeSex(age, sex);
  checkValue(reps, 'El número de fondos');
  const value = Math.floor(reps);
  if (sex === 'F') {
    return {
      test: 'dip', value, unit: 'rep', band: NORMS.dip.noNormBand, category: null, position: null, percentile: null,
      table: [], next: null, flags: ['no_norm'],
      references: [{ key: 'no_norm', label: 'Sin baremo publicado', text: 'Aún no existe un baremo publicado de fondos para mujeres. FitGram guarda tu marca para comparar tu avance.' }],
      source: { ...SRC_BARRA.thomas }, sources: [{ ...SRC_BARRA.thomas }],
    };
  }
  const t = NORMS.dip.thomas.M, idx = categoryIndex(value, t.mins), pc = percentilNormal(value, t.mean, t.sd);
  return resultadoBarra('dip', value, NORMS.dip.band, DIP_CATS, idx, Math.min(95, Math.max(5, pc)), pc,
    repTable(DIP_CATS, t.mins, 'le'), siguiente(DIP_CATS, t.mins, idx, value), ['estimated_norm', 'trained_sample'], [], [SRC_BARRA.thomas]);
}

/* ---------------------------------------------------------------- perfil */

/**
 * Índice FitGram exploratorio: promedio de las posiciones de las pruebas disponibles (0–100).
 * @param {{pushup?:object|null, squat?:object|null, plank?:object|null}} parts resultados de classify*
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

export { NORMS, AGE_RANGE, coversAge, ageBandPushups, ageBandSquats, classifyPushups, classifyPullups, classifyDips, classifySquats, plankPercentile, classifyPlank, fitnessProfile };
