/* ====================================================================
   FitGram — guardar y compartir lo que la persona decida (idea de Elías,
   23-nov-2026).

   La app no envía nada sola. Desde el resultado, la persona puede:
   - exportar su esqueleto (solo puntos del cuerpo, sin imagen) para
     compartirlo con el equipo, con su permiso: sirve para afinar y validar
     las reglas de conteo de FitGram (no para entrenar MediaPipe);
   - guardar en su teléfono un video con el esqueleto superpuesto o la
     animación 3D.

   Este módulo es puro (sin DOM): arma el archivo del esqueleto y elige el
   formato de video que el navegador sabe grabar. La grabación vive en app.mjs.
   ==================================================================== */

/** Versión del formato del archivo del esqueleto. */
const ESQUELETO_SCHEMA = 1;

const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * El esqueleto de una serie, listo para compartir. Sin nombre, sin imagen y
 * sin la fecha exacta (solo año y mes); la edad y el sexo van porque sin ellos
 * los datos no sirven para comparar con los baremos.
 * @param {Array<{t:number, p:ArrayLike<number>}>} rec cuadros grabados (17 articulaciones × x,y,z)
 * @param {{test:string, value:number, invalid?:number, date?:string, age?:number, sex?:string,
 *          reglas?:string, nombres?:string[]}} meta
 * @returns {object}
 */
function esqueletoParaCompartir(rec, meta = {}) {
  const cuadros = (rec || []).map((c) => ({ t: Math.round(c.t), p: Array.from(c.p || [], r3) }));
  const dur = cuadros.length > 1 ? cuadros[cuadros.length - 1].t - cuadros[0].t : 0;
  return {
    schema: ESQUELETO_SCHEMA,
    tipo: 'fitgram-esqueleto',
    prueba: meta.test || null,
    resultado: { valor: meta.value ?? null, no_validas: meta.invalid ?? null },
    mes: meta.date ? String(meta.date).slice(0, 7) : null,
    edad: Number.isFinite(meta.age) ? meta.age : null,
    sexo: meta.sex || null,
    reglas: meta.reglas || null,
    articulaciones: meta.nombres || null,
    unidades: 'metros, origen en las caderas, y hacia abajo; t en ms desde el inicio',
    cuadros_por_segundo: dur > 0 ? Math.round((cuadros.length - 1) / (dur / 1000)) : null,
    cuadros,
  };
}

/** Formatos de video en orden de preferencia: mp4 se abre en todos lados (iPhone y galería). */
const FORMATOS_VIDEO = Object.freeze([
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
]);

/**
 * El primer formato que el navegador sabe grabar, o null si no graba video.
 * @param {(mime:string) => boolean} soporta normalmente MediaRecorder.isTypeSupported
 */
function elegirFormatoVideo(soporta) {
  if (typeof soporta !== 'function') return null;
  for (const f of FORMATOS_VIDEO) {
    try { if (soporta(f.mime)) return f; } catch { /* sigue con el próximo */ }
  }
  return null;
}

/** Nombre de archivo sin espacios ni tildes: «fitgram-sentadillas-esqueleto-2026-11-23.json». */
function nombreArchivo(prueba, tipo, ext, fecha = new Date()) {
  const d = fecha instanceof Date && !isNaN(fecha) ? fecha.toISOString().slice(0, 10) : 'sin-fecha';
  const limpio = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fitgram-${limpio(prueba)}-${limpio(tipo)}-${d}.${ext}`;
}

export { ESQUELETO_SCHEMA, esqueletoParaCompartir, FORMATOS_VIDEO, elegirFormatoVideo, nombreArchivo };
