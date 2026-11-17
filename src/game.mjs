/* ====================================================================
   FitGram — modo juego (idea de Elias Hermosilla, KineVision AI).

   Un "flappy" manejado por la altura del press militar: el avatar sube y baja
   con tus muñecas, y hay que pasar por corredores abiertos a alturas fijas.
   Los tramos isométricos son corredores largos: no basta con tocar la altura,
   hay que sostenerla mientras el corredor pasa.

   Lo que aporta sobre un juego cualquiera es que las secuencias son
   metodología de entrenamiento: hipertrofia pide isométricos largos y bajadas
   controladas, potencia pide empujes rápidos, etc.

   El pitch dice que el juego va en el stand "como gancho, no como parte de la
   solución". Acá se respeta: no entrega baremo, no guarda resultados y no
   entra en el historial.

   Portado del original en React a la arquitectura de FitGram: lógica pura acá
   (se prueba con node --test), dibujo y cámara en el módulo de la app, sin
   duplicar el detector de pose que la app ya tiene.
   ==================================================================== */

/** Alturas del hueco, 0 = hombros, 1 = lockout. */
const LEVELS = Object.freeze({ alto: 0.80, medioAlto: 0.60, medio: 0.45, hombros: 0.20 });

/** Secuencias por objetivo. Vienen del diseño original de Elias. */
const SEQUENCES = Object.freeze({
  hipertrofia: Object.freeze([
    { level: LEVELS.alto, sec: 1.5, iso: true, label: 'Arriba · sostén 1,5 s' },
    { level: LEVELS.medioAlto, sec: 1.0, iso: false, label: 'Baja a medio alto' },
    { level: LEVELS.medio, sec: 1.0, iso: false, label: 'Baja a medio' },
    { level: LEVELS.hombros, sec: 1.0, iso: false, label: 'Hasta los hombros' },
    { level: LEVELS.alto, sec: 1.2, iso: false, label: 'Empuja arriba' },
  ]),
  fuerza: Object.freeze([
    { level: LEVELS.alto, sec: 2.0, iso: true, label: 'Arriba · sostén 2 s' },
    { level: LEVELS.medio, sec: 1.5, iso: false, label: 'Baja a medio' },
    { level: LEVELS.hombros, sec: 1.5, iso: false, label: 'Hasta los hombros' },
    { level: LEVELS.alto, sec: 1.5, iso: false, label: 'Empuja arriba' },
  ]),
  potencia: Object.freeze([
    { level: LEVELS.hombros, sec: 1.0, iso: false, label: 'Desde los hombros' },
    { level: LEVELS.alto, sec: 0.8, iso: false, label: 'Empuje rápido' },
    { level: LEVELS.medio, sec: 0.8, iso: false, label: 'Baja rápido' },
    { level: LEVELS.hombros, sec: 0.8, iso: false, label: 'Vuelve abajo' },
  ]),
  resistencia: Object.freeze([
    { level: LEVELS.medioAlto, sec: 1.0, iso: false, label: 'Medio alto' },
    { level: LEVELS.hombros, sec: 1.0, iso: false, label: 'Hombros' },
    { level: LEVELS.medioAlto, sec: 1.0, iso: false, label: 'Medio alto' },
    { level: LEVELS.hombros, sec: 1.0, iso: false, label: 'Hombros' },
    { level: LEVELS.alto, sec: 1.0, iso: true, label: 'Arriba · sostén 1 s' },
  ]),
});

const FOCUS_LABEL = Object.freeze({
  hipertrofia: 'Hipertrofia', fuerza: 'Fuerza máxima', potencia: 'Potencia', resistencia: 'Resistencia',
});

const DEFAULTS = Object.freeze({
  speed: 105,        // px/s de desplazamiento
  gap: 0.38,         // alto del hueco, en fracción de la banda jugable
  minGap: 0.30,      // nunca menos que esto
  gateWidth: 52,     // ancho de un corredor normal, en px
  gapBetween: 150,   // separación entre corredores, en px
  playerX: 90,       // x fija del avatar, en px
  smooth: 0.28,      // suavizado exponencial de la altura
  graciaSec: 0.12,   // hay que estar fuera del hueco este rato seguido para perder el corredor:
                     // con tolerancia cero, un cuadro de ruido del detector arruinaría la partida
  safety: 0.05,      // margen ergonómico: no exigir el lockout absoluto
  loops: 3,          // cuántas veces se repite la secuencia
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Altura de la muñeca a 0..1, donde 0 son los hombros y 1 el lockout.
 * En la imagen el eje y crece hacia abajo, así que arriba es el valor menor.
 */
function normalizeHeight(wristY, bottomY, topY, safety = DEFAULTS.safety) {
  const span = Math.max(0.12, bottomY - topY);
  const effTop = topY + span * safety;
  const den = bottomY - effTop;
  if (!(Math.abs(den) > 1e-9)) return 0;
  return clamp((bottomY - wristY) / den, 0, 1);
}

/** Suavizado exponencial, para que el avatar no salte con el ruido del detector. */
function smoothNorm(prev, target, alpha = DEFAULTS.smooth) {
  if (!Number.isFinite(prev)) return target;
  return prev * (1 - alpha) + target * alpha;
}

/**
 * Arma el recorrido: una lista de corredores con su posición en px.
 * Un tramo isométrico es simplemente un corredor largo (ancho = duración × velocidad),
 * así que sostener la altura y pasar un corredor son la misma regla.
 */
function buildCourse(focus, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const seq = SEQUENCES[focus] || SEQUENCES.hipertrofia;
  const gates = [];
  let x = o.playerX + 260; // aire antes del primer corredor
  for (let loop = 0; loop < o.loops; loop++) {
    for (const s of seq) {
      const w = s.iso ? Math.max(o.gateWidth, s.sec * o.speed) : o.gateWidth;
      gates.push({
        x, w,
        level: s.level,
        gap: Math.max(o.minGap, o.gap),
        iso: !!s.iso,
        label: s.label,
        loop: loop + 1,
        estado: 'pendiente', // 'pendiente' | 'limpio' | 'tocado'
      });
      x += w + o.gapBetween;
    }
  }
  return { focus, gates, largo: x, opts: o };
}

function newGame(focus, opts = {}) {
  const course = buildCourse(focus, opts);
  return {
    focus,
    course,
    t: 0,
    scroll: 0,
    norm: 0.2,
    limpios: 0,
    tocados: 0,
    dentroMs: 0,
    enCorredorMs: 0,
    gateActual: null,
    tocando: false,
    terminado: false,
  };
}

/** El primer corredor que todavía no se cruza, para anticiparlo en pantalla. */
function proximoGate(state) {
  const px = state.course.opts.playerX;
  return state.course.gates.find((g) => g.x + g.w - state.scroll >= px) || null;
}

/** El corredor que el avatar está cruzando ahora, o null. */
function gateEnCurso(state) {
  const px = state.course.opts.playerX;
  for (const g of state.course.gates) {
    const x0 = g.x - state.scroll;
    if (px >= x0 && px <= x0 + g.w) return g;
  }
  return null;
}

/**
 * Avanza el juego un cuadro.
 * @param {object} state  el estado que devuelve newGame (se modifica)
 * @param {number} dt     segundos desde el cuadro anterior
 * @param {number} norm   altura actual del avatar, 0..1
 */
function stepGame(state, dt, norm) {
  if (state.terminado) return state;
  const o = state.course.opts;
  state.t += dt;
  state.scroll += o.speed * dt;
  state.norm = clamp(norm, 0, 1);

  const g = gateEnCurso(state);
  state.gateActual = g;
  state.tocando = false;

  if (g) {
    state.enCorredorMs += dt * 1000;
    const dentro = Math.abs(state.norm - g.level) <= g.gap / 2;
    if (dentro) {
      state.dentroMs += dt * 1000;
      g.fueraSec = 0;
    } else {
      state.tocando = true;
      g.fueraSec = (g.fueraSec || 0) + dt;
      // Solo se pierde el corredor tras estar fuera un rato seguido.
      if (g.fueraSec >= o.graciaSec) g.estado = 'tocado';
    }
  }

  // Resolver los corredores que ya quedaron atrás.
  for (const gate of state.course.gates) {
    if (gate.estado === 'pendiente' && gate.x + gate.w - state.scroll < o.playerX) {
      gate.estado = 'limpio';
      state.limpios++;
    } else if (gate.estado === 'tocado' && !gate.contado && gate.x + gate.w - state.scroll < o.playerX) {
      gate.contado = true;
      state.tocados++;
    }
  }

  const ultimo = state.course.gates[state.course.gates.length - 1];
  if (ultimo && ultimo.x + ultimo.w - state.scroll < -50) state.terminado = true;
  return state;
}

/** Resumen para mostrar al final. Sin baremo: esto es un juego, no una evaluación. */
function resumen(state) {
  const total = state.course.gates.length;
  const control = state.enCorredorMs > 0 ? (100 * state.dentroMs) / state.enCorredorMs : null;
  return {
    total,
    limpios: state.limpios,
    tocados: state.tocados,
    control,
    segundos: state.t,
  };
}

export { LEVELS, SEQUENCES, FOCUS_LABEL, DEFAULTS, normalizeHeight, smoothNorm,
  buildCourse, newGame, gateEnCurso, proximoGate, stepGame, resumen, clamp };
