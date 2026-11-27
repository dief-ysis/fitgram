/* ====================================================================
   FitGram — estabilizar el dibujo cuando una parte del cuerpo no se ve
   (27-nov-2026, videos de David).

   Cuando MediaPipe pierde un punto (el brazo tapado por el cuerpo en el fondo
   de la flexión, una mano que sale del cuadro), igual entrega una posición
   adivinada que salta de un lado a otro, y el monito "actúa raro". Aquí, si
   un punto se ve poco, se dibuja donde estaba la última vez que se vio bien,
   relativo a la cadera (así sigue a la persona si se mueve), durante un rato
   corto. Si pasa más tiempo sin verse, se deja de inventar y queda como
   llegó: tenue y punteado en el dibujo, como siempre.

   SOLO para lo que se dibuja (esqueleto sobre la imagen, vista 3D y la
   animación 3D que se guarda). El conteo no pasa por aquí: los analizadores
   tienen sus propias reglas para lo que no se ve, y la huella de las reglas
   no cambia.
   ==================================================================== */

const ESTAB_CONFIG = Object.freeze({
  visMin: 0.5,        // bajo esta visibilidad el punto se considera "no visto"
  holdMs: 700,        // cuánto rato se sostiene la última posición buena
  visSostenido: 0.45, // visibilidad con que se dibuja el punto sostenido (tenue, para que se note que no se ve)
});

const CADERAS = [23, 24];
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const visDe = (p) => (p ? (p.visibility ?? p.v ?? 1) : 0);

/** Centro de caderas de una lista de puntos, o null si no se ven. */
function centro(pts) {
  if (!Array.isArray(pts)) return null;
  const vis = CADERAS.map((i) => pts[i]).filter((p) => p && visDe(p) >= ESTAB_CONFIG.visMin && fin(p.x) && fin(p.y));
  if (!vis.length) return null;
  return {
    x: vis.reduce((a, p) => a + p.x, 0) / vis.length,
    y: vis.reduce((a, p) => a + p.y, 0) / vis.length,
    z: vis.every((p) => fin(p.z)) ? vis.reduce((a, p) => a + p.z, 0) / vis.length : 0,
  };
}

/**
 * Crea un estabilizador para una serie de cuadros (uno por prueba; se reinicia solo si el tiempo retrocede).
 * @returns {{aplicar: (frame: object) => object, reiniciar: () => void}}
 */
function crearEstabilizador(cfg = ESTAB_CONFIG) {
  let memoria = { lm: [], world: [] }, ultimoT = -Infinity;
  const reiniciar = () => { memoria = { lm: [], world: [] }; ultimoT = -Infinity; };

  /** Una lista de puntos: guarda los que se ven bien y sostiene los que no, relativo al centro de caderas. */
  const capa = (pts, mem, t) => {
    if (!Array.isArray(pts)) return pts;
    const c = centro(pts);
    return pts.map((p, i) => {
      if (!p) return p;
      if (visDe(p) >= cfg.visMin && fin(p.x) && fin(p.y)) {
        if (c) mem[i] = { dx: p.x - c.x, dy: p.y - c.y, dz: fin(p.z) ? p.z - c.z : 0, t };
        return p;
      }
      const m = mem[i];
      if (!m || !c || t - m.t > cfg.holdMs) return p;   // nunca se vio, no hay cadera, o pasó mucho rato: no se inventa
      const q = { ...p, x: c.x + m.dx, y: c.y + m.dy, z: c.z + m.dz };
      if ('visibility' in p || !('v' in p)) q.visibility = Math.max(visDe(p), cfg.visSostenido);
      else q.v = Math.max(visDe(p), cfg.visSostenido);
      return q;
    });
  };

  return {
    aplicar(frame) {
      if (!frame) return frame;
      const t = fin(frame.t) ? frame.t : ultimoT;
      if (t < ultimoT) reiniciar();
      ultimoT = t;
      return { ...frame, lm: capa(frame.lm, memoria.lm, t), world: capa(frame.world, memoria.world, t) };
    },
    reiniciar,
  };
}

export { ESTAB_CONFIG, crearEstabilizador };
