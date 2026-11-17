/**
 * Qué decirle a la persona cuando la cámara no abre.
 *
 * Son funciones puras y sin DOM a propósito: así se prueban en Node sin
 * levantar un navegador, que es donde esto es difícil de reproducir —hay que
 * denegar un permiso a mano para ver cada mensaje.
 */
const CAMERA_ERROR_NAMES = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError',
  'OverconstrainedError', 'SecurityError', 'DevicesNotFoundError', 'TrackStartError', 'PermissionDeniedError'];

/** True si el fallo viene de pedir la cámara y no de otra cosa. */
function esErrorDeCamara(e) {
  const name = e?.name || '';
  const msg = String(e?.message || e || '');
  return CAMERA_ERROR_NAMES.includes(name) || /getUserMedia|mediaDevices|cámara|camera/i.test(msg);
}

/**
 * Qué decirle a la persona cuando la cámara no abre.
 *
 * El texto anterior daba por hecho que la app corría dentro de un visor
 * embebido y, ante cualquier fallo de permiso, mandaba a «abrir la versión web
 * publicada en un sitio HTTPS». En el sitio real eso es un callejón sin salida:
 * la persona ya está en HTTPS y lo único que pasó es que tocó «Bloquear».
 * Ahora se distingue cada caso y se dice cómo arreglarlo.
 *
 * Pura a propósito: se prueba en Node.
 * @param {{name?:string, message?:string}|null|undefined} e
 * @param {{secure?:boolean}} opts `secure` es window.isSecureContext
 * @returns {{title:string, detail:string}}
 */
function cameraErrorMessage(e, { secure = true } = {}) {
  const name = e?.name || '';
  const msg = String(e?.message || e || 'error desconocido');

  // Sin contexto seguro el navegador nunca va a entregar la cámara: eso manda.
  if (!secure) {
    return {
      title: 'La cámara necesita una conexión segura',
      detail: 'Los navegadores solo entregan la cámara en sitios seguros. Abre FitGram en su dirección https:// y vuelve a intentarlo. Mientras tanto puedes usar «Grabar video» o «Elegir video» y analizar una grabación.',
    };
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission|not allowed|denied/i.test(msg)) {
    return {
      title: 'Falta el permiso de la cámara',
      detail: 'Tu navegador bloqueó el acceso. Toca el candado o el ícono de cámara en la barra de direcciones, permite la cámara para este sitio y vuelve a iniciar la prueba. Si prefieres no darlo, usa «Grabar video»: se abre la cámara del teléfono y FitGram analiza la grabación.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      title: 'No encontré ninguna cámara',
      detail: 'Este aparato no tiene una cámara disponible. Puedes usar «Elegir video» y analizar una grabación hecha con otro teléfono.',
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return {
      title: 'La cámara está ocupada',
      detail: 'Otra app la tiene tomada: la cámara del sistema, una videollamada u otra pestaña. Ciérrala y vuelve a intentarlo.',
    };
  }
  if (name === 'OverconstrainedError') {
    return {
      title: 'No pude abrir esa cámara',
      detail: 'La cámara pedida no existe o no acepta esa resolución. Prueba con el botón de cambiar de cámara, o analiza una grabación con «Grabar video».',
    };
  }
  if (name === 'SecurityError') {
    return {
      title: 'El navegador bloqueó la cámara',
      detail: 'La configuración de seguridad de este navegador no permite abrirla. Revisa los permisos del sitio, o analiza una grabación con «Grabar video».',
    };
  }
  if (/getUserMedia|mediaDevices/i.test(msg)) {
    return {
      title: 'Este navegador no entrega la cámara',
      detail: `No está disponible la función para pedir la cámara (${msg}). Usa «Grabar video» o «Elegir video» y FitGram analiza la grabación.`,
    };
  }
  return {
    title: 'No se pudo abrir la cámara',
    detail: `${msg}. Puedes intentar de nuevo, o usar «Grabar video» y analizar la grabación.`,
  };
}

export { CAMERA_ERROR_NAMES, esErrorDeCamara, cameraErrorMessage };
