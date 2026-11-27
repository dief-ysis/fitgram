/* ====================================================================
   FitGram — utilidades chicas de pantalla y formato (números con coma, grados, minutos).
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d).replace('.', ','));
const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const deg = (v) => (v == null || !isFinite(v) ? '—' : `${Math.round(v)}°`);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sexLabel = (s) => (s === 'F' ? 'Mujer' : 'Hombre');

export { $, esc, num, mmss, deg, clamp, sexLabel };
