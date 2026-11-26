// FitGram — src/sensors.mjs (traído de fitgram-v1 de Jose) · the phone's motion sensors (DOM layer, no DOM access at module top level).
// Responsabilidad: pide el permiso de movimiento en iOS (dentro del toque de la persona), escucha deviceorientation y
//   devicemotion, mantiene al estimador de inclinación al tanto del ángulo de pantalla y la cámara en uso, y prueba qué
//   sensores existen para el diagnóstico de Ajustes.
// Entradas: eventos del navegador; un estimador de orientation.mjs#createTiltEstimator. Los tiempos de los eventos usan
//   performance.now(), el mismo reloj de las llamadas state(now) del corredor de pruebas.
// Salidas: el objeto único Sensors (requestPermission, start, setFacing, stop, probe).

import { createTiltEstimator, resolveScreenAngle } from './orientation.mjs';

const xyz = (v) => (v && v.x != null && v.y != null && v.z != null ? { x: v.x, y: v.y, z: v.z } : null);

/** Ángulo actual de la pantalla (0/90/180/270): primero window.orientation, luego screen.orientation.angle. */
function screenAngle() {
  return resolveScreenAngle({
    windowOrientation: typeof window.orientation === 'number' ? window.orientation : null,
    screenAngle: window.screen?.orientation?.angle ?? null,
  });
}

/**
 * Conecta los oyentes de sensores y pantalla que alimentan a `estimator`; devuelve una función que los quita.
 * @param {object} estimator objeto de createTiltEstimator()
 * @param {() => 'user'|'environment'} facing cámara actual
 */
function attach(estimator, facing) {
  const onOri = (e) => estimator.pushOrientation({ t: performance.now(), alpha: e.alpha, beta: e.beta, gamma: e.gamma });
  const onMot = (e) => {
    const r = e.rotationRate;
    estimator.pushMotion({ t: performance.now(), accG: xyz(e.accelerationIncludingGravity), acc: xyz(e.acceleration),
      rot: r && r.alpha != null && r.beta != null && r.gamma != null ? { alpha: r.alpha, beta: r.beta, gamma: r.gamma } : null });
  };
  const onScreen = () => estimator.setScreen({ angle: screenAngle(), facing: facing() });
  onScreen();
  window.addEventListener('deviceorientation', onOri);
  window.addEventListener('devicemotion', onMot);
  window.addEventListener('orientationchange', onScreen);
  try { window.screen?.orientation?.addEventListener('change', onScreen); } catch { /* old Safari */ }
  return () => {
    window.removeEventListener('deviceorientation', onOri);
    window.removeEventListener('devicemotion', onMot);
    window.removeEventListener('orientationchange', onScreen);
    try { window.screen?.orientation?.removeEventListener('change', onScreen); } catch { /* ignore */ }
  };
}

/** Sensores de movimiento del teléfono (objeto único). */
const Sensors = {
  /** Última respuesta de requestPermission: 'granted' | 'denied' | 'not_needed' | 'unsupported' | null (no se ha pedido). */
  permission: null,
  facing: 'user',
  estimator: null,
  detach: null,

  /**
   * Pide el permiso de sensores de movimiento donde el navegador lo exige (iOS Safari 13+). DEBE llamarse
   * sincrónicamente dentro de un manejador de clic: en iOS la petición parte antes del primer await.
   * @returns {Promise<'granted'|'denied'|'not_needed'|'unsupported'>}
   */
  requestPermission() {
    if (typeof window === 'undefined' || (!('DeviceOrientationEvent' in window) && !('DeviceMotionEvent' in window))) {
      return Promise.resolve((this.permission = 'unsupported'));
    }
    const asks = [];
    for (const C of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
      if (typeof C?.requestPermission === 'function') { try { asks.push(C.requestPermission()); } catch { /* not in a gesture */ } }
    }
    if (!asks.length) return Promise.resolve((this.permission = 'not_needed'));
    return Promise.allSettled(asks).then((res) => (this.permission = res.some((r) => r.status === 'fulfilled' && r.value === 'granted') ? 'granted' : 'denied'));
  },

  /**
   * Empieza a alimentar a `estimator` (reemplaza al anterior).
   * @param {object} estimator objeto de createTiltEstimator()
   * @param {{facing?: 'user'|'environment'}} [opts] cámara en uso
   */
  start(estimator, opts = {}) {
    this.stop();
    if (opts.facing) this.facing = opts.facing;
    this.estimator = estimator;
    this.detach = attach(estimator, () => this.facing);
  },

  /** Cambió la cámara (frontal/trasera): el estimador lleva los ejes del aparato a la nueva imagen. */
  setFacing(facing) {
    this.facing = facing;
    this.estimator?.setScreen({ angle: screenAngle(), facing });
  },

  /** Quita los oyentes. */
  stop() {
    this.detach?.(); this.detach = null; this.estimator = null;
  },

  /**
   * Escucha `ms` milisegundos con un estimador propio e informa qué sensores entregaron números
   * (diagnóstico de Ajustes). Independiente de start()/stop().
   * @param {number} [ms=1500]
   * @returns {Promise<{orientation: boolean, accelerometer: boolean, gyroscope: boolean, permission: string|null}>}
   */
  async probe(ms = 1500) {
    if (typeof window === 'undefined') return { orientation: false, accelerometer: false, gyroscope: false, permission: this.permission };
    const est = createTiltEstimator({ facing: this.facing });
    const off = attach(est, () => this.facing);
    await new Promise((r) => setTimeout(r, ms));
    off();
    const s = est.state(performance.now()).sensors;
    return { orientation: s.orientation, accelerometer: s.accelerometer, gyroscope: s.gyroscope, permission: this.permission };
  },
};

export { Sensors };
