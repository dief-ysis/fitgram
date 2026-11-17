/* ====================================================================
   FitGram — ¿se puede confiar en esta medición?

   La app contaba repeticiones con la misma seguridad daba igual lo que
   estuviera viendo. Midiendo el barrido sintético se ve que el conteo no se
   degrada despacio: aguanta sin despeinarse hasta cierto nivel de ruido en los
   puntos del cuerpo y después se cae entero. Con ruido alto llega a contar
   CERO repeticiones de trece, sin decir nada.

   Lo que no lo rompe: los cuadros por segundo. El mismo barrido a 30 y a 6 fps
   da el mismo conteo. El problema es el temblor de los puntos, no la cadencia.

   El temblor se mide con la segunda diferencia de los puntos clave: un
   movimiento rápido pero limpio tiene primera diferencia grande y segunda
   chica, mientras que el ruido invierte la dirección cuadro a cuadro y dispara
   la segunda. Por eso la medida sale casi igual a 30 que a 15 fps: mide ruido,
   no velocidad. Se toma la mediana de la ventana para que un cuadro perdido no
   la dispare.

   Los umbrales salen de ese barrido sintético y por eso son PROVISORIOS: el
   generador mete ruido independiente en cada punto y cada cuadro, y el ruido
   de MediaPipe real está correlacionado. El estudio de validación los va a
   calibrar solo, porque cada medición queda guardada con su temblor.
   ==================================================================== */

/** Los puntos que usan las tres pruebas: hombros, codos, muñecas, caderas, rodillas, tobillos. */
const CLAVE = Object.freeze([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

/**
 * Umbrales provisorios, del barrido sintético (12 semillas x fps x ruido):
 *   hasta 0,025  conteo exacto en 12 de 12
 *   0,031        empieza a perder alguna
 *   0,037        pierde en la mitad de los casos
 *   0,046        pierde casi siempre
 *   0,061        catastrófico: llega a contar cero
 * Se avisa antes de que empiece a perder, no después.
 */
const UMBRAL = Object.freeze({ dudoso: 0.030, malo: 0.045 });

/** Cuántos cuadros hacen falta antes de decir algo. Menos que esto no es una medición. */
const MIN_MUESTRAS = 12;

/**
 * Lo que se dice sobre la imagen, antes y durante la prueba. Va al cartel
 * grande, que se lee a 2,5 m, y ese solo acepta hasta 44 caracteres (setPos):
 * más largo que eso no se vería, que es justo cuando hace falta.
 */
const MENSAJE = Object.freeze({
  // Solo se avisa en vivo el nivel 'malo'. El 'dudoso' se marca en el
  // resultado y nada más: los umbrales son provisorios y un aviso que salta
  // de más deja de leerse.
  malo: 'No te veo estable: más luz y ropa ajustada',
});
const MAX_MENSAJE = 44;

/** Lo que se dice en el resultado, donde hay espacio para explicar. */
const RESULTADO = Object.freeze({
  dudoso: 'La detección tuvo algo de temblor durante la prueba. El conteo puede quedarse corto en una repetición o dos.',
  malo: 'La detección estuvo inestable durante toda la prueba, y con ese nivel de temblor el conteo se queda corto. Conviene repetirla con más luz, ropa ajustada y el teléfono apoyado y quieto.',
});

/**
 * Segundos sin ver a partir de los cuales conviene decirlo.
 * Medido: una interrupción de 0,3 s no cuesta ninguna repetición; de 0,8 s en
 * adelante se pierden una a tres de quince, y la prueba termina como si nada.
 */
const SIN_VER_MIN = 0.5;

/**
 * Qué decir sobre el tiempo en que la app no estuvo mirando.
 *
 * Son tres situaciones distintas y decirlas igual sería mentir en dos de ellas:
 *
 *   - La prueba se cortó por eso (`not_visible`): el número es hasta donde
 *     alcanzó a ver, no lo que la persona hizo.
 *   - Flexiones y sentadillas, corte corto: las repeticiones de ese rato no se
 *     contaron, así que el número puede quedarse corto.
 *   - Plancha, corte corto: al revés, el reloj sigue corriendo a propósito, así
 *     que esos segundos se contaron sin poder comprobar la posición.
 */
function sinVerTexto(test, segundos, termino = null) {
  if (!Number.isFinite(segundos) || segundos < SIN_VER_MIN) return null;
  const s = String(Math.round(segundos * 10) / 10).replace('.', ',');
  const cabeza = `Durante ${s} s no te vi: alguien pasó por delante, se cortó la imagen o la cámara se quedó pegada.`;
  if (termino === 'not_visible') {
    return `${cabeza} La prueba se cortó ahí, así que el número es lo que alcancé a ver y no lo que hiciste. Conviene repetirla.`;
  }
  return test === 'plank'
    ? `${cabeza} El reloj siguió corriendo, así que esos segundos se contaron sin poder comprobar la posición.`
    : `${cabeza} Las repeticiones de ese rato no se contaron, así que el número puede quedarse corto.`;
}

function nivelDe(temblor) {
  if (!Number.isFinite(temblor)) return null;
  if (temblor >= UMBRAL.malo) return 'malo';
  if (temblor >= UMBRAL.dudoso) return 'dudoso';
  return 'bien';
}

const mediana = (xs) => {
  if (!xs.length) return NaN;
  const a = xs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** El temblor de un cuadro, dados los dos anteriores. NaN si falta algún punto. */
function temblorCuadro(a, b, c) {
  if (!a || !b || !c) return NaN;
  let suma = 0, n = 0;
  for (const k of CLAVE) {
    const pa = a[k], pb = b[k], pc = c[k];
    if (!pa || !pb || !pc) continue;
    const dx = pc.x - 2 * pb.x + pa.x;
    const dy = pc.y - 2 * pb.y + pa.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    suma += Math.hypot(dx, dy); n++;
  }
  return n ? suma / n : NaN;
}

/**
 * Sigue el temblor a lo largo de una corrida.
 * `ventana` son los cuadros recientes que miran `nivel()` y `temblor()`; aparte
 * se guarda el peor tramo y la mediana de toda la corrida para el resultado.
 */
function createJitterTracker({ ventana = 90 } = {}) {
  let prev2 = null, prev1 = null;
  let recientes = [];
  let todos = [];
  return {
    reset() { prev2 = prev1 = null; recientes = []; todos = []; },
    /** `lm` son los puntos SIN suavizar: suavizados ya no tienen el temblor que se busca. */
    push(lm) {
      if (!Array.isArray(lm)) return;
      const v = temblorCuadro(prev2, prev1, lm);
      prev2 = prev1; prev1 = lm;
      if (!Number.isFinite(v)) return;
      recientes.push(v);
      if (recientes.length > ventana) recientes.shift();
      todos.push(v);
    },
    /** Temblor de los cuadros recientes, para avisar en vivo. */
    temblor() { return recientes.length >= MIN_MUESTRAS ? mediana(recientes) : NaN; },
    nivel() { return recientes.length >= MIN_MUESTRAS ? nivelDe(mediana(recientes)) : null; },
    /** Resumen de toda la corrida, para guardar con el resultado. */
    resumen() {
      if (todos.length < MIN_MUESTRAS) return null;
      const med = mediana(todos);
      return { temblor: Math.round(med * 1e4) / 1e4, nivel: nivelDe(med), cuadros: todos.length };
    },
  };
}

export { CLAVE, UMBRAL, MIN_MUESTRAS, MENSAJE, MAX_MENSAJE, RESULTADO, SIN_VER_MIN, sinVerTexto, nivelDe, temblorCuadro, createJitterTracker, mediana };
