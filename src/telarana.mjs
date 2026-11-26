/* ====================================================================
   FitGram — gráfico de telaraña del perfil (26-nov-2026; al equipo le gustó
   en la presentación).

   Solo datos reales de la persona, nada inventado:
   - Brazos, Piernas y Core: la posición (0–100) de flexiones, sentadillas y
     plancha en su tabla de referencia.
   - Técnica: el porcentaje de repeticiones válidas en flexiones y sentadillas.
   Se superpone la evaluación anterior (la penúltima medición de cada prueba)
   para ver el avance.

   Módulo puro (sin DOM): arma los datos y el SVG. No toca el conteo.
   ==================================================================== */

const EJES = Object.freeze([
  { clave: 'brazos', nombre: 'Brazos', prueba: 'pushup' },
  { clave: 'piernas', nombre: 'Piernas', prueba: 'squat' },
  { clave: 'core', nombre: 'Core', prueba: 'plank' },
  { clave: 'tecnica', nombre: 'Técnica', prueba: null },
]);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Valores de los ejes para un conjunto de resultados {pushup, squat, plank} (cualquiera puede faltar). */
function valoresDe(res, clasificar) {
  const v = {};
  for (const e of EJES) {
    if (!e.prueba) continue;
    const r = res[e.prueba];
    let pos = null;
    if (r) {
      try { pos = clasificar(e.prueba, r)?.position ?? null; } catch { pos = null; }
    }
    v[e.clave] = fin(pos) ? Math.max(0, Math.min(100, pos)) : null;
  }
  let validas = 0, total = 0;
  for (const t of ['pushup', 'squat']) {
    const r = res[t];
    if (r && fin(r.value)) { validas += r.value; total += r.value + (fin(r.invalid) ? r.invalid : 0); }
  }
  v.tecnica = total > 0 ? Math.round((100 * validas) / total) : null;
  return v;
}

/**
 * Datos de la telaraña a partir del historial.
 * @param {Record<string, Array<object>>} historial resultados por prueba, del más viejo al más nuevo
 * @param {(prueba: string, resultado: object) => {position:number}|null} clasificar posición en la tabla de referencia
 * @returns {{ejes: string[], actual: Array<number|null>, anterior: Array<number>|null}|null} null si hay menos de 3 ejes con dato
 */
function datosTelarana(historial, clasificar) {
  const ultimo = {}, previo = {};
  for (const t of ['pushup', 'squat', 'plank']) {
    const arr = historial?.[t] || [];
    ultimo[t] = arr[arr.length - 1] || null;
    previo[t] = arr.length >= 2 ? arr[arr.length - 2] : null;
  }
  const a = valoresDe(ultimo, clasificar);
  const actual = EJES.map((e) => a[e.clave]);
  if (actual.filter((x) => x != null).length < 3) return null;
  // La anterior solo si cada eje con dato hoy también lo tenía antes: si no, la comparación engañaría.
  const conPrevio = Object.fromEntries(['pushup', 'squat', 'plank'].map((t) => [t, previo[t] || null]));
  const p = valoresDe(conPrevio, clasificar);
  const anteriorCompleta = EJES.every((e, i) => actual[i] == null || p[e.clave] != null);
  const hayPrevio = Object.values(previo).some(Boolean);
  return { ejes: EJES.map((e) => e.nombre), actual, anterior: hayPrevio && anteriorCompleta ? EJES.map((e) => p[e.clave] ?? 0) : null };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * SVG de la telaraña. Los colores salen de variables CSS de la app (--accent, --muted, --line).
 * @param {{ejes: string[], actual: Array<number|null>, anterior: Array<number>|null}} d
 * @param {{tam?: number, titulo?: string}} [o]
 * @returns {string}
 */
function svgTelarana(d, o = {}) {
  const tam = o.tam || 300, c = tam / 2, r = tam * 0.36, n = d.ejes.length;
  const punto = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n, k = (r * (v ?? 0)) / 100;
    return [c + k * Math.cos(a), c + k * Math.sin(a)];
  };
  const poli = (vals) => vals.map((v, i) => punto(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  // Margen a los lados para las etiquetas de los ejes horizontales ("Técnica 97", "Piernas 63").
  const partes = [`<svg viewBox="-62 -8 ${tam + 124} ${tam + 16}" role="img" aria-label="${esc(o.titulo || 'Perfil por áreas')}" class="telarana">`];
  for (const nivel of [25, 50, 75, 100]) {
    partes.push(`<polygon points="${poli(Array(n).fill(nivel))}" fill="none" stroke="var(--line)" stroke-width="1"/>`);
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = punto(i, 100);
    partes.push(`<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`);
  }
  if (d.anterior) {
    partes.push(`<polygon points="${poli(d.anterior)}" fill="var(--muted)" fill-opacity="0.18" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  }
  partes.push(`<polygon points="${poli(d.actual)}" fill="var(--accent)" fill-opacity="0.32" stroke="var(--accent)" stroke-width="2.5"/>`);
  for (let i = 0; i < n; i++) {
    if (d.actual[i] == null) continue;
    const [x, y] = punto(i, d.actual[i]);
    partes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--accent)"/>`);
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = punto(i, 128);
    const ancla = Math.abs(x - c) < 4 ? 'middle' : x > c ? 'start' : 'end';
    const val = d.actual[i] == null ? '—' : String(Math.round(d.actual[i]));
    partes.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${ancla}" dominant-baseline="middle" font-size="16" fill="var(--ink)"><tspan font-weight="600">${esc(d.ejes[i])}</tspan><tspan fill="var(--muted)"> ${val}</tspan></text>`);
  }
  partes.push('</svg>');
  return partes.join('');
}

export { EJES, datosTelarana, svgTelarana };
