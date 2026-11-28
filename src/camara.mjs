/* ====================================================================
   FitGram — cámara: abrirla con la resolución que conviene a cada equipo.
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

/** Teléfono (pantalla táctil chica) frente a tablet o computador. */
function esTelefono() {
  try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600; } catch { return false; }
}

/** Espera a que `pred()` sea verdadero, o a que pasen `ms` milisegundos. */
function waitFor(pred, ms) {
  return new Promise((res) => {
    const t0 = performance.now();
    const f = () => (pred() || performance.now() - t0 > ms ? res() : setTimeout(f, 50));
    f();
  });
}

async function openCameraStream(facing) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw new Error('getUserMedia no disponible');
  return md.getUserMedia({
    audio: false,
    // En teléfonos, 960x540: MediaPipe igual achica la imagen para detectar, y subir menos píxeles por cuadro ayuda en
    // los que van lentos. Tablets y computadores siguen en 1280x720 (27-nov).
    video: esTelefono()
      ? { facingMode: facing, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } }
      : { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
}

export { esTelefono, waitFor, openCameraStream };
