// FitGram — src/sensors.mjs (traído de fitgram-v1 de Jose) · the phone's motion sensors (DOM layer, no DOM access at module top level).
// Responsibility: asks for the motion permission on iOS (inside the user's tap), listens to deviceorientation and
//   devicemotion, keeps the tilt estimator informed of the screen angle and the camera in use, and probes which
//   sensors exist for the settings diagnostic.
// Inputs: browser events; an estimator from orientation.js#createTiltEstimator. Event times use performance.now(),
//   the same clock as the runner's state(now) calls.
// Outputs: the Sensors singleton (requestPermission, start, setFacing, stop, probe).

import { createTiltEstimator, resolveScreenAngle } from './orientation.mjs';

const xyz = (v) => (v && v.x != null && v.y != null && v.z != null ? { x: v.x, y: v.y, z: v.z } : null);

/** Current screen angle (0/90/180/270): window.orientation first, then screen.orientation.angle. */
function screenAngle() {
  return resolveScreenAngle({
    windowOrientation: typeof window.orientation === 'number' ? window.orientation : null,
    screenAngle: window.screen?.orientation?.angle ?? null,
  });
}

/**
 * Attaches the sensor and screen listeners that feed `estimator`; returns a function that removes them.
 * @param {object} estimator createTiltEstimator() object
 * @param {() => 'user'|'environment'} facing current camera
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

/** Motion sensors of the phone (singleton). */
const Sensors = {
  /** Last answer of requestPermission: 'granted' | 'denied' | 'not_needed' | 'unsupported' | null (not asked). */
  permission: null,
  facing: 'user',
  estimator: null,
  detach: null,

  /**
   * Asks for the motion-sensor permission where the browser requires it (iOS Safari 13+). MUST be called
   * synchronously inside a click handler: the iOS requests start before the first await.
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
   * Starts feeding `estimator` (replaces a previous one).
   * @param {object} estimator createTiltEstimator() object
   * @param {{facing?: 'user'|'environment'}} [opts] camera in use
   */
  start(estimator, opts = {}) {
    this.stop();
    if (opts.facing) this.facing = opts.facing;
    this.estimator = estimator;
    this.detach = attach(estimator, () => this.facing);
  },

  /** The camera changed (front/rear): the estimator maps the device axes to the new image. */
  setFacing(facing) {
    this.facing = facing;
    this.estimator?.setScreen({ angle: screenAngle(), facing });
  },

  /** Removes the listeners. */
  stop() {
    this.detach?.(); this.detach = null; this.estimator = null;
  },

  /**
   * Listens for `ms` milliseconds with a private estimator and reports which sensors delivered numbers
   * (settings diagnostic). Independent of start()/stop().
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
