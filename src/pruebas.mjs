/* ====================================================================
   FitGram — las pruebas: textos, unidades, orden y motivos de término.
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

// Las tres pruebas de la evaluación base (índice, perfil, telaraña, validación).
const ORDER = ['pushup', 'squat', 'plank'];
// Pruebas con barra, opcionales (traídas de la v1 de José, 26-nov-2026): necesitan barra fija o paralelas.
const BARRA = ['pullup', 'dip'];
// Todas las que se pueden guardar en el historial.
const TODAS = [...ORDER, ...BARRA];
const COLORS = { left: '#2f9bd3', right: '#e8613c', axial: '#8a96a3', axis: '#8a96a3' };

const TESTS = {
  pushup: {
    n: '01', name: 'Flexiones de brazos', short: 'Flexiones', measures: 'Resistencia del tren superior',
    unit: 'rep', unitLong: 'flexiones válidas',
    measure: 'Cómo lo mide FitGram: la bajada vale cuando el codo llega a unos 90°, y la repetición cuenta si vuelves a extender los brazos con el cuerpo en línea.',
    landscape: true,
    setup: [
      'Apoya el teléfono en el suelo, en horizontal, contra una botella o una mochila. Si usas la cámara en vivo, activa la rotación de pantalla.',
      'Ponte de lado a la cámara, a unos 2,5 a 3 metros.',
      'Revisa en la imagen que se vea todo tu cuerpo, de las manos a los pies.',
    ],
  },
  squat: {
    n: '02', name: 'Sentadillas', short: 'Sentadillas', measures: 'Resistencia del tren inferior',
    unit: 'rep', unitLong: 'sentadillas válidas',
    measure: 'Cómo lo mide FitGram: la bajada vale cuando la cadera llega a la altura de la rodilla (muslos paralelos), y la repetición cuenta si vuelves a quedar de pie.',
    setup: [
      'Deja el teléfono en vertical, a la altura de tu cadera o en el suelo, inclinado hacia ti.',
      'Ponte de lado a la cámara, a unos 2,5 metros.',
      'Revisa que se vean tu cabeza y tus pies durante toda la bajada.',
    ],
  },
  plank: {
    n: '03', name: 'Plancha en antebrazos', short: 'Plancha', measures: 'Resistencia del core',
    unit: 's', unitLong: 'sostenidos',
    measure: 'Cómo lo mide FitGram: el reloj corre mientras hombro, cadera y tobillo forman una línea recta (unos 160° o más). Si la cadera cae o sube por más de 1 s, te avisa; dos avisos seguidos sin corregir terminan la prueba.',
    landscape: true,
    setup: [
      'Apoya el teléfono en el suelo, en horizontal, contra una botella o una mochila. Si usas la cámara en vivo, activa la rotación de pantalla.',
      'Ponte de lado a la cámara, a unos 2,5 a 3 metros.',
      'El reloj parte solo cuando la app confirma la posición durante 1 segundo.',
    ],
  },
  pullup: {
    n: '04', name: 'Dominadas', short: 'Dominadas', measures: 'Resistencia de espalda y brazos (tracción)',
    unit: 'rep', unitLong: 'dominadas válidas', equipment: 'Barra fija',
    measure: 'Cómo lo mide FitGram: partes colgado con los brazos estirados. La repetición cuenta cuando el mentón sube por sobre tus manos (la barra) y vuelves a estirar los brazos por completo. Si te balanceas o te impulsas con las piernas, no cuenta. Si sueltas la barra o apoyas los pies, la prueba termina.',
    setup: [
      'Deja el teléfono en vertical, apoyado a la altura de la cintura.',
      'Ponte de lado a la cámara, a unos 2,5 a 3 metros de la barra.',
      'Revisa que se vean la barra, tus manos y tus pies durante toda la prueba.',
    ],
  },
  dip: {
    n: '05', name: 'Fondos en paralelas', short: 'Fondos', measures: 'Resistencia de pecho y tríceps (empuje)',
    unit: 'rep', unitLong: 'fondos válidos', equipment: 'Barras paralelas',
    measure: 'Cómo lo mide FitGram: partes con los brazos estirados sobre las paralelas. La repetición cuenta cuando el codo llega a 90° o menos y vuelves a estirar los brazos. Sin ayuda de las piernas. Si apoyas los pies o te bajas de las paralelas, la prueba termina.',
    setup: [
      'Deja el teléfono en vertical, apoyado a la altura de la cintura.',
      'Ponte de lado a la cámara, a unos 2,5 a 3 metros de las paralelas.',
      'Revisa que se vea todo tu cuerpo, de las manos a los pies, también abajo en cada fondo.',
    ],
  },
};

const END_TEXT = {
  manual: 'terminaste la prueba',
  technique: { pushup: 'dos repeticiones seguidas no válidas', squat: 'dos repeticiones seguidas no válidas', plank: 'dos avisos seguidos sin corregir la postura',
    pullup: 'dos repeticiones seguidas no válidas', dip: 'dos repeticiones seguidas no válidas' },
  pause: 'pausa de más de 4 s; el protocolo no permite descansar',
  position_lost: { pushup: 'se perdió la posición', squat: 'se perdió la posición', plank: 'se perdió la posición',
    pullup: 'soltaste la barra o apoyaste los pies', dip: 'dejaste las paralelas o apoyaste los pies' },
  not_visible: 'la cámara dejó de verte',
  video_end: 'terminó el video',
};

export { ORDER, BARRA, TODAS, COLORS, TESTS, END_TEXT };
