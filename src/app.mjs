// FitGram v0 — la app: pantallas, cámara, MediaPipe Pose Landmarker, corredor de pruebas, resultados.
// build.mjs junta los módulos en un solo archivo; estos import se reescriben al construir.
import { NORMS, classifyPushups, classifySquats, classifyPlank, fitnessProfile } from './norms.mjs';
import { createAnalyzer, huellaDe, codigoDeConteo, EX_CONFIG, vistaDeFrente, queFalta } from './exercises.mjs';
import { siluetaPara, opacidadSilueta } from './silueta.mjs';
import { synthSession } from './synth.mjs';
import { SKELETON_CONFIG, H36M, toJoints, PoseSmoother, drawSkeleton2D, View3D, createLifter } from './skeleton.mjs';
import * as Hist from './history.mjs';
import * as Val from './validation.mjs';
import * as Gm from './game.mjs';
import * as Cal from './calidad.mjs';
import { ORIENT_CONFIG, createPoseLevelEstimator, createTiltEstimator, fuseTilt, correctFrame, describeTilt, isCorrectable, quarterTurn } from './orientation.mjs';
import { Sensors } from './sensors.mjs';
import { esqueletoParaCompartir, elegirFormatoVideo, nombreArchivo } from './compartir.mjs';
import { esErrorDeCamara, cameraErrorMessage } from './camara-errores.mjs';
/**
 * Con qué reglas cuenta esta copia de la app: los umbrales, el suavizado y el
 * código que decide qué cuenta. Va sellada en cada resultado, para que el
 * estudio no mezcle dos versiones sin que nadie se entere.
 *
 * Los tres hacen falta. Un umbral distinto cambia el conteo; el filtro cambia
 * la señal con que se mide; y una corrección en la máquina de estados cambia
 * el resultado sin tocar ni una constante.
 */
const REGLAS = huellaDe({ ex: EX_CONFIG, sk: SKELETON_CONFIG, cod: codigoDeConteo() });
import { AGE_RANGE, coversAge } from './norms.mjs';
/* ------------------------------------------------------------------ configuración */

const CFG = (typeof window !== 'undefined' && window.FITGRAM_CONFIG) || {};
const MP_VERSION = '1.1.0';
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const URLS = {
  lib: CFG.lib || `${MP_CDN}/vision_bundle.mjs`,
  wasmLoader: CFG.wasmLoader || `${MP_CDN}/wasm/vision_wasm_internal.js`,
  wasmBinary: CFG.wasmBinary || './wasm/vision_wasm_internal.wasm',
  model: (variant) => (CFG.modelBase || './models/') + `pose_landmarker_${variant}${CFG.modelExt || '.task'}`,
};
const STORE_KEY = 'fitgram.v0';
const ARM_HOLD_MS = 300; // cuánto hay que estar en la posición de partida para que empiece la prueba
const DEFAULT_SETTINGS = Object.freeze({ voice: true, angles: true, model: 'full', facing: 'user', show3d: true, valid: false, tiltCorrection: true, grabarVideo: false, mostrarJuego: true, silueta: true });
const ORDER = ['pushup', 'squat', 'plank'];
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
};

const END_TEXT = {
  manual: 'terminaste la prueba',
  technique: { pushup: 'dos repeticiones seguidas no válidas', squat: 'dos repeticiones seguidas no válidas', plank: 'dos avisos seguidos sin corregir la postura' },
  pause: 'pausa de más de 4 s; el protocolo no permite descansar',
  position_lost: 'se perdió la posición',
  not_visible: 'la cámara dejó de verte',
  video_end: 'terminó el video',
};

/* ------------------------------------------------------------------ utilidades */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d).replace('.', ','));
const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const deg = (v) => (v == null || !isFinite(v) ? '—' : `${Math.round(v)}°`);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sexLabel = (s) => (s === 'F' ? 'Mujer' : 'Hombre');

const VALID_KEY = 'fitgram.validation.v1'; // aparte de los resultados personales, a propósito
const VALID_EXPORT_KEY = 'fitgram.validation.exported.v1'; // cuándo se exportó por última vez

function loadValidExport() {
  try { return localStorage.getItem(VALID_EXPORT_KEY) || null; } catch { return null; }
}

function saveValidExport(iso) {
  if (S.stand) return;
  try { localStorage.setItem(VALID_EXPORT_KEY, iso); } catch { /* storage unavailable */ }
}
function loadValid() {
  try { return Val.loadRecords(JSON.parse(localStorage.getItem(VALID_KEY) || '[]')); } catch { return []; }
}
function saveValid() {
  if (S.stand) return; // modo stand: no se escribe nada en este teléfono
  try { localStorage.setItem(VALID_KEY, JSON.stringify(S.valid)); return true; } catch (e) {
    // Perder mediciones del estudio sin enterarse sería lo peor: se avisa y se pide exportar.
    console.warn('saveValid', e);
    try { validError('No se pudo guardar en este teléfono (memoria llena o navegación privada). Exporta el CSV o el JSON ahora para no perder las mediciones.'); } catch { /* pantalla no lista */ }
    return false;
  }
}

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {}; } catch { return {}; }
}
function saveStore() {
  if (S.stand) return; // modo stand: no se escribe nada en este teléfono
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ profile: S.profile, results: S.results, history: S.history, settings: S.settings })); } catch { /* storage unavailable */ }
}

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) {
    const b = new Uint8Array(await res.arrayBuffer());
    onProgress?.(b.length, b.length);
    return b;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Bytes del modelo desde un archivo .task, o desde un JSON {format:'base64', data} (donde no se pueden servir .task). */
async function fetchModel(url, onProgress) {
  const raw = await fetchBytes(url, onProgress);
  if (!/\.json(\?|$)/.test(url)) return raw;
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (obj?.format !== 'base64' || typeof obj.data !== 'string') throw new Error('Formato de modelo desconocido');
  const bin = atob(obj.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ voz y sonido */

const Voice = {
  voice: null,
  ready: false,
  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices() || [];
      this.voice = vs.find((v) => /^es[-_]CL/i.test(v.lang)) || vs.find((v) => /^es[-_](419|MX|US|AR|CO)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
    };
    pick();
    try { window.speechSynthesis.addEventListener('voiceschanged', pick); } catch { /* old Safari */ }
  },
  unlock() { // en iOS tiene que correr dentro de un toque de la persona
    if (!('speechSynthesis' in window) || this.ready) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); this.ready = true; } catch { /* ignore */ }
  },
  say(text, interrupt = false) {
    if (!S.settings.voice || !('speechSynthesis' in window) || !text) return;
    try {
      const ss = window.speechSynthesis;
      if (interrupt || ss.pending) ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.voice?.lang || 'es-CL';
      if (this.voice) u.voice = this.voice;
      u.rate = 1.15;
      ss.speak(u);
    } catch { /* ignore */ }
  },
};

const Sound = {
  ctx: null,
  unlock() {
    try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch { this.ctx = null; }
  },
  beep(freq = 880, dur = 0.12, gain = 0.15) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  },
};

const WakeLock = {
  lock: null,
  async on() { try { this.lock = await navigator.wakeLock?.request('screen'); } catch { this.lock = null; } },
  off() { try { this.lock?.release(); } catch { /* ignore */ } this.lock = null; },
};

/* ------------------------------------------------------------------ motor de pose (MediaPipe Tasks Vision) */

const Engine = {
  landmarker: null, variant: null, delegate: null, loading: null, lastTs: 0, vision: null, error: null,

  async load(variant, onProgress) {
    if (this.landmarker && this.variant === variant) return this.landmarker;
    if (this.loading) { await this.loading.catch(() => {}); if (this.landmarker && this.variant === variant) return this.landmarker; }
    this.loading = (async () => {
      onProgress?.('lib', 0, 0);
      const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return u; } };
      this.vision = this.vision || await import(abs(URLS.lib));
      const bytes = await fetchModel(URLS.model(variant), (l, t) => onProgress?.('model', l, t));
      onProgress?.('wasm', 0, 0);
      const fileset = { wasmLoaderPath: abs(URLS.wasmLoader), wasmBinaryPath: abs(URLS.wasmBinary) };
      const opts = (delegate, buf) => ({
        baseOptions: { modelAssetBuffer: buf, delegate },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      let lm, delegate = 'GPU';
      try { lm = await this.vision.PoseLandmarker.createFromOptions(fileset, opts('GPU', bytes.slice())); }
      catch (e) { delegate = 'CPU'; lm = await this.vision.PoseLandmarker.createFromOptions(fileset, opts('CPU', bytes.slice())); }
      this.create = () => this.vision.PoseLandmarker.createFromOptions(fileset, opts(delegate, bytes.slice()));
      try { this.landmarker?.close(); } catch { /* ignore */ }
      this.landmarker = lm; this.variant = variant; this.delegate = delegate; this.lastTs = 0; this.error = null; this.warm = false;
      this.bytes = bytes;
      return lm;
    })();
    try { return await this.loading; }
    catch (e) { this.error = e; throw e; }
    finally { this.loading = null; }
  },

  /** Rearma el detector con el modelo guardado cuando su grafo falló (un grafo de MediaPipe caído no se recupera). */
  async rebuild() {
    if (this.rebuilding || !this.create) return;
    this.rebuilding = true;
    try {
      const fresh = await this.create();
      try { this.landmarker?.close(); } catch { /* ignore */ }
      this.landmarker = fresh; this.errorCount = 0; this.warm = false;
      console.warn('FitGram: detector rebuilt after a graph error');
    } catch (e) { console.warn('FitGram: rebuild failed', e); }
    finally { this.rebuilding = false; }
  },

  /** Corre la detección; devuelve un PoseFrame o null. `tMs` tiene que crecer; aquí se asegura. */
  detect(source, tMs, aspect) {
    if (!this.landmarker || this.rebuilding || !source || !Number.isFinite(tMs)) return null;
    if (!Number.isFinite(this.lastTs)) this.lastTs = 0;
    const ts = Math.max(Math.round(tMs), this.lastTs + 1);
    this.lastTs = ts;
    let res;
    try { res = this.landmarker.detectForVideo(source, ts); this.errorCount = 0; }
    catch (e) {
      this.errorCount = (this.errorCount || 0) + 1;
      if (this.errorCount < 3) console.warn('detectForVideo', e);
      if (this.errorCount >= 2) this.rebuild();
      return null;
    }
    const lm = res?.landmarks?.[0];
    if (!lm) return null;
    const w = res.worldLandmarks?.[0];
    const P = (p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 });
    return { t: tMs, lm: lm.map(P), world: w ? w.map(P) : null, aspect };
  },

  info() {
    if (!this.landmarker) return this.error ? `Error: ${this.error.message || this.error}` : 'Sin cargar todavía.';
    return `MediaPipe Pose Landmarker ${MP_VERSION} · modelo ${this.variant === 'lite' ? 'liviano' : 'completo'} · ${this.delegate === 'GPU' ? 'GPU' : 'CPU'}`;
  },
};

/* ------------------------------------------------------------------ estado */

const stored = loadStore();
const restored = Hist.migrateStore(stored, ORDER);
const S = {
  profile: stored.profile || { age: null, sex: null },
  // `history` es la fuente: la serie completa de cada prueba.
  // `results` es solo el ultimo de cada serie, porque las pantallas ya lo usan asi.
  history: restored.history,
  results: restored.results,
  settings: Object.assign({}, DEFAULT_SETTINGS, stored.settings || {}),
  valid: loadValid(), // mediciones del modo validación, en su propia llave
  screen: null,
  stand: false, // modo stand: efímero, no toca el almacenamiento
  test: null,
  last: null, // última prueba terminada, para la pantalla de resultado
};

/* ------------------------------------------------------------------ clasificación */

function classify(test, value, profile = S.profile) {
  const { age, sex } = profile;
  if (test === 'pushup') return classifyPushups({ age, sex, reps: value });
  if (test === 'squat') return classifySquats({ age, sex, reps: value });
  return classifyPlank({ age, sex, seconds: value });
}

function normsFor(test) {
  const n = NORMS?.[test] || NORMS?.tests?.[test] || {};
  const notes = n.protocol || n.protocolNotes || n.notes || n.protocol_notes || [];
  const caveat = n.caveat || n.caveats || '';
  return { notes: Array.isArray(notes) ? notes : [String(notes)], caveat: Array.isArray(caveat) ? caveat.join(' ') : caveat };
}

/* ------------------------------------------------------------------ navegación */

const SCREENS = ['onb', 'hub', 'intro', 'run', 'result', 'profile', 'valid', 'game'];

function show(name) {
  if (S.screen === 'run' && name !== 'run') Runner.teardown();
  S.screen = name;
  document.body.classList.toggle('run-mode', name === 'run');
  for (const s of SCREENS) $(`scr-${s}`).hidden = s !== name;
  const inApp = name !== 'onb' && name !== 'run';
  $('tabs').hidden = !inApp;
  for (const b of $('tabs').querySelectorAll('button')) {
    const cur = (b.dataset.tab === 'hub' && ['hub', 'intro', 'result'].includes(name)) || (b.dataset.tab === name);
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  const t = S.test ? TESTS[S.test] : null;
  $('stand-bar').hidden = !S.stand || name === 'run';
  $('head-right').textContent = name === 'onb' ? (S.stand ? 'Modo stand' : `${AGE_RANGE.min} a ${AGE_RANGE.max} años`)
    : (name === 'intro' || name === 'run' || name === 'result') && t ? `Prueba ${t.n} de 03` : profileTag();
  window.scrollTo(0, 0);
  if (name === 'hub') renderHub();
  if (name === 'profile') renderProfile();
  if (name === 'valid') renderValid();
  if (name !== 'game') Game.teardown();
}

function profileTag() {
  const p = S.profile;
  return p.age && p.sex ? `${p.age} años · ${sexLabel(p.sex)}` : '';
}

/* ------------------------------------------------------------------ bienvenida */

function renderOnb() {
  const ages = $('age-pills');
  ages.innerHTML = '';
  // El rango sale de un solo lugar (AGE_RANGE en norms.mjs): botones y textos lo leen de ahí.
  for (const el of document.querySelectorAll('.age-range')) el.textContent = `${AGE_RANGE.min} a ${AGE_RANGE.max}`;
  for (let a = AGE_RANGE.min; a <= AGE_RANGE.max; a++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.textContent = String(a);
    b.setAttribute('aria-pressed', String(S.profile.age === a));
    b.addEventListener('click', () => { S.profile.age = a; renderOnb(); });
    ages.appendChild(b);
  }
  const sexes = $('sex-pills');
  sexes.innerHTML = '';
  for (const [k, l] of [['F', 'Mujer'], ['M', 'Hombre']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.textContent = l;
    b.setAttribute('aria-pressed', String(S.profile.sex === k));
    b.addEventListener('click', () => { S.profile.sex = k; renderOnb(); });
    sexes.appendChild(b);
  }
  // Bienvenida: solo la primera vez (HU-05). Después vive en Ajustes.
  $('onb-welcome').hidden = !!S.settings.welcomed || S.stand;
  $('onb-other').hidden = !S.stand;
  if (S.stand) {
    const inp = $('onb-age-num');
    const fuera = S.profile.age != null && !coversAge(S.profile.age);
    if (document.activeElement !== inp) inp.value = fuera ? String(S.profile.age) : '';
  }
  const ok = !!(S.profile.age && S.profile.sex);
  $('btn-onb').disabled = !ok;
  $('onb-hint').textContent = !S.profile.age ? 'Elige tu edad.'
    : !S.profile.sex ? 'Elige tu sexo para usar la tabla correcta.'
      : !coversAge(S.profile.age) ? `Fuera de ${AGE_RANGE.min} a ${AGE_RANGE.max} años no hay tabla: vas a ver el conteo, no la categoría.`
        : '';
}

/* ------------------------------------------------------------------ hub */

function nextPending() { return ORDER.find((t) => !S.results[t]) || null; }

function resultText(test, value) {
  return TESTS[test].unit === 's' ? `${mmss(value)}` : `${value} rep`;
}

function renderHub() {
  const list = $('test-list');
  list.innerHTML = '';
  const next = nextPending();
  for (const id of ORDER) {
    const t = TESTS[id], r = S.results[id];
    let cls = null;
    if (r) { try { cls = classify(id, r.value, r.profile || S.profile); } catch { cls = null; } }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card test-card' + (id === next ? ' next' : '');
    b.innerHTML = `<span class="test-n">${t.n}</span>
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="test-name">${esc(t.name)}</span><span class="test-q">${esc(t.measures)}</span></span>
      <span class="test-status">${r ? `<span class="test-val">${esc(resultText(id, r.value))}</span>${cls ? `<span class="chip cat">${esc(cls.category.label)}</span>` : ''}${deltaChip(id)}` : '<span class="test-val muted" style="font-size:18px">Pendiente</span>'}</span>`;
    b.setAttribute('aria-label', `${t.name}: ${r ? resultText(id, r.value) + (cls ? ', ' + cls.category.label : '') + deltaAria(id) : 'pendiente'}`);
    b.addEventListener('click', () => openIntro(id));
    list.appendChild(b);
  }
  const done = ORDER.filter((t) => S.results[t]).length;
  $('hub-title').textContent = done === 3 ? 'Evaluación completa' : 'Tu evaluación';
  const sinTabla = S.profile.age != null && !coversAge(S.profile.age);
  $('hub-sub').textContent = `${profileTag()}. ${sinTabla ? `Fuera de ${AGE_RANGE.min} a ${AGE_RANGE.max} años: verás el conteo, no la categoría.` : hasDemoData() ? 'Estás viendo datos de demostración.' : done === 3 ? 'Puedes repetir cualquier prueba cuando quieras.' : '3 pruebas. Descansa lo que necesites entre una y otra.'}`;
  // El juego es un prototipo: se puede ocultar desde Ajustes (por ejemplo, para el pitch) sin publicar otra versión.
  $('btn-open-game').hidden = !S.settings.mostrarJuego;
  const btn = $('btn-hub');
  btn.textContent = next ? `${done ? 'Continuar' : 'Comenzar'} · ${TESTS[next].short}` : 'Ver mi estado de forma';
  btn.onclick = () => (next ? openIntro(next) : show('profile'));
}

/* ------------------------------------------------------------------ introducción */

function placementSVG(test) {
  // Flexiones y plancha: vista desde arriba. De costado, el teléfono quedaba
  // alineado con los pies y parecía que la cámara miraba a la persona desde atrás.
  if (test !== 'squat') return placementTopSVG(test);
  // Sentadillas: vista de costado, teléfono en el suelo a la izquierda.
  const person = `<circle cx="262" cy="26" r="8"/><path d="M262 34 L262 68 M262 42 L284 42 M262 68 L264 86 L262 104 L274 104 M262 68 L258 86 L256 104 L268 104"/>`; // de pie, de perfil, brazos al frente
  const phone = TESTS[test].landscape
    ? '<rect x="14" y="90" width="26" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    : '<rect x="22" y="78" width="12" height="26" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  return `<svg viewBox="0 0 326 124" role="img" aria-label="Teléfono ${TESTS[test].landscape ? 'en horizontal' : 'en vertical'} en el suelo, a unos 2,5 a 3 metros, viéndote de lado">
    <line x1="0" y1="104" x2="326" y2="104" stroke="currentColor" stroke-width="1"/>
    ${phone}
    <path d="M34 86 L300 0 M34 98 L292 106" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 4"/>
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${person}</g>
    <path d="M34 116 L262 116 M34 112 L34 120 M262 112 L262 120" stroke="var(--muted)" stroke-width="1"/>
    <text x="148" y="112" text-anchor="middle" style="font:600 13px var(--font-cd);fill:currentColor">2,5–3 m</text>
  </svg>`;
}

function placementTopSVG(test) {
  // Vista desde arriba: la persona acostada a lo largo, el teléfono al costado,
  // mirándola de lado. Cabeza a la derecha, pies a la izquierda.
  const arms = test === 'pushup'
    ? 'M236 40 L236 26 M236 40 L236 54' // brazos extendidos: manos bajo los hombros
    : 'M234 40 L234 28 L252 28 M234 40 L234 52 L252 52'; // antebrazos apoyados hacia adelante
  return `<svg viewBox="0 0 326 124" role="img" aria-label="Vista desde arriba: teléfono en horizontal en el suelo, a unos 2,5 a 3 metros, al costado de tu cuerpo, viéndote de lado">
    <text x="0" y="12" style="font:600 11px var(--font-cd);fill:var(--muted);letter-spacing:.08em">VISTA DESDE ARRIBA</text>
    <path d="M196 102 L150 30 M214 102 L280 30" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 4"/>
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="256" cy="40" r="8"/>
      <path d="M248 40 L172 40 M172 40 L160 34 M172 40 L160 46 ${arms}"/>
    </g>
    <rect x="192" y="102" width="26" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M120 40 L120 108 M116 40 L124 40 M116 108 L124 108" stroke="var(--muted)" stroke-width="1"/>
    <text x="112" y="78" text-anchor="end" style="font:600 13px var(--font-cd);fill:currentColor">2,5–3 m</text>
  </svg>`;
}

function openIntro(test) {
  S.test = test;
  const t = TESTS[test];
  $('intro-kicker').textContent = `Prueba ${t.n} de 03 · ${t.measures}`;
  $('intro-title').textContent = t.name;
  const variant = test === 'pushup' ? (S.profile.sex === 'F' ? ' Según el protocolo CSEP, en mujeres se hace con apoyo de rodillas.' : ' Según el protocolo CSEP, en hombres se hace desde la punta de los pies.') : '';
  $('intro-sub').textContent = (test === 'plank' ? 'Cuenta los segundos que mantienes la posición correcta.' : 'Cuenta solo las repeticiones completas y con buena técnica.') + variant;
  $('intro-diagram').innerHTML = placementSVG(test);
  $('intro-setup').innerHTML = t.setup.map((s, i) => `<li><span class="k">${String(i + 1).padStart(2, '0')}</span><span>${esc(s)}</span></li>`).join('');
  const { notes } = normsFor(test);
  $('intro-proto').innerHTML = notes.map((s) => `<li><span class="k" aria-hidden="true">·</span><span>${esc(s)}</span></li>`).join('');
  $('intro-proto-lbl').textContent = `Protocolo · ${sourceOf(test).short}`;
  $('intro-measure').textContent = t.measure;
  $('mode-hint').textContent = '';
  show('intro');
}

function sourceOf(test) {
  try { return classify(test, 0).source; } catch { return { short: '', apa: '', url: '' }; }
}

/* ------------------------------------------------------------------ corredor de pruebas */

const Runner = {
  mode: null, test: null, stream: null, videoUrl: null, raf: 0, vfc: 0, running: false,
  phase: 'idle', analyzer: null, smoother: null, lifter: null, view: null,
  st: null, frame: null, rec: [], lastRecT: -1e9, countdownEnd: 0, armOkSince: null, startT: 0,
  demo: null, demoT0: 0, videoOffset: 0, detectMs: [], jitter: null, avisoCalidad: 0, resizeObs: null, lastCueMsg: '', lastCueAt: 0, lastCount: 0,

  async open(test, mode, file) {
    this.teardown();
    const sid = this.sid; // teardown() cambia el id de sesión; todo lo que se espera más abajo revisa que siga vigente
    this.test = test; this.mode = mode;
    S.test = test;
    show('run');
    const t = TESTS[test];
    $('run-title').textContent = t.name;
    $('run-mode').textContent = mode === 'live' ? 'En vivo' : mode === 'video' ? 'Video' : 'Demo';
    $('run-title').textContent = t.short;
    $('run-h1').textContent = `${t.name}: prueba en curso`;
    $('btn-flip').hidden = mode !== 'live';
    $('btn-start').hidden = false; $('btn-stop').hidden = true;
    $('btn-start').disabled = true;
    $('btn-start').textContent = mode === 'video' ? 'Analizar video' : mode === 'demo' ? 'Iniciar demostración' : 'Iniciar · cuenta de 5 s';
    $('replog').innerHTML = '';
    $('replog-wrap').hidden = test === 'plank';
    $('cue-bar').hidden = true;
    $('stage-grid').hidden = mode !== 'demo';
    $('video').hidden = mode === 'demo';
    $('video').classList.toggle('mirror', mode === 'live' && S.settings.facing === 'user');
    this.setHudIdle();
    this.setPos(null, 'Preparando…');
    this.analyzer = createAnalyzer(test, { sex: S.profile.sex });
    this.smoother = new PoseSmoother();
    this.jitter = Cal.createJitterTracker();
    this.avisoCalidad = 0;
    this.lifter = createLifter('mediapipe');
    // Inclinación del teléfono (orientation.mjs, de Jose): se estima con la postura
    // de partida antes de empezar y queda fija durante la prueba. Sin esto, una
    // cámara ladeada ladea el esqueleto 3D y los ángulos respecto de la vertical.
    this.level = createPoseLevelEstimator(test); this.tilt = null; this.tiltLocked = false; this.sensorLock = null; this.avisoMovido = false; this.movido = false; this.chipKey = ''; this.tiltDicho = ''; this.frenteDesde = null; this.avisoLadoAt = null;
    $('level-chip').hidden = mode === 'demo'; $('level-chip').dataset.level = ''; $('level-msg').textContent = 'Inclinación del teléfono'; $('level-src').textContent = '';
    // En vivo se suman el giroscopio y el acelerómetro: dicen la inclinación
    // aunque la persona todavía no esté en posición, y avisan si el teléfono se mueve.
    this.tiltEst = null;
    if (mode === 'live' && Sensors.permission !== 'denied') {
      try { this.tiltEst = createTiltEstimator({ facing: S.settings.facing }); Sensors.start(this.tiltEst, { facing: S.settings.facing }); } catch { this.tiltEst = null; }
    }
    this.rec = []; this.lastRecT = -1e9; this.st = null; this.frame = null; this.lastRaw = null; this.phase = 'preview'; this.posOkDesde = null; this.girada = false;
    this.huboCuadro = false; this.fallosSeguidos = 0; this.fallosTotal = 0;
    this.lastCount = 0;
    this.setup3D();
    this.observeResize();

    try {
      if (mode === 'demo') {
        this.demo = buildDemo(test, S.profile.sex);
        this.veil(null);
        this.demoT0 = performance.now();
        $('btn-start').disabled = false;
        this.loop();
        return;
      }
      if (mode === 'live') await this.startCamera(sid);
      else await this.loadVideo(file);
      if (sid !== this.sid) return;
      await this.ensureEngine();
      if (sid !== this.sid) return;
      $('btn-start').disabled = false;
      if (mode === 'live') {
        await this.warmUp($('video'), performance.now());
        if (sid !== this.sid) return;
        this.veil(null);
        this.loop();
        // Desde acá, no solo durante la serie: si la cámara se queda pegada
        // mientras la persona se acomoda, antes quedaba la imagen congelada
        // sin que nada lo dijera.
        this.vigilarCuadros();
      }
      else { this.veil(null); this.setPos(null, 'Toca «Analizar video» para procesar la grabación.'); }
    } catch (e) {
      console.warn(e);
      if (sid === this.sid) this.fail(e);
    }
  },

  fail(e) {
    const msg = String(e?.message || e || 'Error desconocido');
    const secure = typeof window !== 'undefined' ? window.isSecureContext !== false : true;
    if (this.mode === 'live' && esErrorDeCamara(e)) {
      const m = cameraErrorMessage(e, { secure });
      this.veil(m.title, m.detail);
    } else if (/WebAssembly|wasm|CompileError|Content Security|CSP/i.test(msg)) {
      this.veil('No se pudo iniciar el detector de pose',
        `No se pudo cargar el motor de MediaPipe (WebAssembly): ${msg}. La demostración con una persona simulada sí funciona sin el detector.`);
    } else {
      this.veil('No se pudo iniciar', msg);
    }
    $('btn-start').disabled = true;
    this.setPos(false, 'Revisa el mensaje sobre la imagen.');
  },

  /** La primera detección compila los shaders de la GPU y puede trabar varios segundos en teléfonos lentos: se hace antes de reproducir. */
  async warmUp(v, t) {
    if (Engine.warm || !Engine.landmarker || !v.videoWidth) return;
    this.veil('Preparando el detector', 'Solo la primera vez: puede tardar unos segundos.', null);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));   // que el mensaje alcance a dibujarse primero
    Engine.detect(v, t, v.videoWidth / v.videoHeight);
    Engine.warm = true;
    this.veil(null);
  },

  async ensureEngine() {
    if (Engine.landmarker && Engine.variant === S.settings.model) return;
    this.veil('Cargando el detector de pose', 'La primera vez descarga unos 22 MB. Todo se procesa en este teléfono.', 0);
    await Engine.load(S.settings.model, (stage, l, t) => {
      if (stage === 'model') this.veil('Descargando el modelo de pose', `${num(l / 1e6, 1)} de ${t ? num(t / 1e6, 1) : '?'} MB · se procesa en este teléfono`, t ? l / t : null);
      if (stage === 'wasm') this.veil('Iniciando el motor', 'Preparando MediaPipe en este teléfono…', null);
    });
    $('engine-info').textContent = Engine.info();
  },

  /** @see cameraErrorMessage */
  async startCamera(sid = this.sid) {
    this.veil('Pidiendo acceso a la cámara', 'Acepta el permiso para ver tu esqueleto en vivo.');
    this.stopStream();
    const stream = await openCameraStream(S.settings.facing);
    if (sid !== this.sid) { for (const tr of stream.getTracks()) tr.stop(); return; } // la persona se fue mientras el permiso estaba abierto
    this.stream = stream;
    for (const tr of stream.getVideoTracks()) tr.addEventListener('ended', () => { if (this.stream === stream) this.cameraLost(); });
    const v = $('video');
    v.srcObject = stream; v.muted = true; v.playsInline = true;
    await v.play().catch(() => {});
    await waitFor(() => v.videoWidth > 0, 4000);
    $('video').classList.toggle('mirror', S.settings.facing === 'user');
    this.resize();
  },

  async loadVideo(file) {
    if (!file) throw new Error('No se eligió ningún video');
    const v = $('video');
    this.videoUrl = URL.createObjectURL(file);
    v.srcObject = null; v.src = this.videoUrl; v.muted = true; v.playsInline = true; v.loop = false;
    v.preload = 'auto';
    this.veil('Abriendo el video', file.name || '');
    await new Promise((res, rej) => {
      const done = () => { clearTimeout(timer); v.onloadedmetadata = v.onloadeddata = v.onerror = null; res(); };
      const timer = setTimeout(() => (v.readyState >= 1 ? done() : rej(new Error('No se pudo abrir el video en este navegador'))), 10000);
      v.onloadedmetadata = done; v.onloadeddata = done;
      v.onerror = () => { clearTimeout(timer); rej(new Error('El formato del video no se puede leer en este navegador')); };
      v.load();
    });
    try { v.currentTime = 0.01; } catch { /* ignore */ }
    this.resize();
  },

  stopStream() {
    if (this.stream) { for (const tr of this.stream.getTracks()) tr.stop(); this.stream = null; }
  },

  teardown() {
    this.stopGrab(false);
    this.dejarDeVigilar();
    this.sid = (this.sid || 0) + 1;
    this.runId = (this.runId || 0) + 1;
    this.running = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    const v = $('video');
    v.onended = v.onloadeddata = v.onloadedmetadata = v.onerror = null;
    if (this.vfc && v.cancelVideoFrameCallback) { try { v.cancelVideoFrameCallback(this.vfc); } catch { /* ignore */ } }
    this.vfc = 0;
    this.stopStream();
    Sensors.stop(); this.tiltEst = null;
    try { v.pause(); } catch { /* ignore */ }
    v.removeAttribute('src'); v.srcObject = null;
    try { v.load(); } catch { /* ignore */ }
    if (this.videoUrl) { URL.revokeObjectURL(this.videoUrl); this.videoUrl = null; }
    this.resizeObs?.disconnect(); this.resizeObs = null;
    this.view?.destroy?.(); this.view = null;
    WakeLock.off();
    this.phase = 'idle';
  },

  setup3D() {
    const show3d = S.settings.show3d;
    $('inset3d').hidden = !show3d;
    $('btn-3d').textContent = show3d ? 'Ocultar 3D' : 'Mostrar 3D';
    $('btn-3d').setAttribute('aria-pressed', String(show3d));
    if (!this.view) {
      try { this.view = new View3D($('canvas3d'), { colors: COLORS, grid: true, background: 'rgba(0,0,0,0)' }); this.view.setView?.('side'); }
      catch (e) { console.warn('View3D', e); this.view = null; }
    }
  },

  observeResize() {
    this.resizeObs?.disconnect();
    if ('ResizeObserver' in window) {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe($('stage'));
    }
    this.resize();
  },

  resize() {
    const stage = $('stage'), c = $('overlay');
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    this.cw = r.width; this.ch = r.height; this.dpr = dpr;
    try { this.view?.resize(); } catch { /* ignore */ }
    if (this.frame) this.draw(this.frame);
  },

  /** Rectángulo del contenido del video o cuadro sintético que se muestra (object-fit: contain). */
  contentRect(aspect) {
    const v = $('video');
    let vw, vh;
    if (this.mode !== 'demo' && v.videoWidth) { vw = v.videoWidth; vh = v.videoHeight; }
    else { vw = (aspect || 9 / 16) * 1000; vh = 1000; }
    const s = Math.min(this.cw / vw, this.ch / vh);
    const w = vw * s, h = vh * s;
    return { x: (this.cw - w) / 2, y: (this.ch - h) / 2, w, h };
  },

  start() {
    Voice.unlock(); Sound.unlock();
    $('btn-flip').hidden = true;
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
    WakeLock.on();
    if (this.mode === 'video') return this.runVideo();
    if (this.mode === 'demo') {
      this.demoT0 = performance.now();
      this.analyzer = createAnalyzer(this.test, { sex: S.profile.sex });
      this.smoother.reset?.();
      this.level?.reset(); this.tilt = null; this.tiltLocked = false;
      this.countdown(3, () => { this.demoT0 = performance.now(); this.beginActive(this.demo.frames[0]?.t ?? 0, true); });
      return;
    }
    this.countdown(5, () => { this.phase = 'arming'; this.armOkSince = null; this.cue({ level: 'warn', msg: 'Ponte en posición' }); });
  },

  countdown(n, done) {
    this.phase = 'countdown';
    $('btn-start').hidden = true; $('btn-stop').hidden = false;
    this.countdownEnd = performance.now() + n * 1000;
    let last = -1;
    const tick = () => {
      if (this.phase !== 'countdown') return;
      const left = Math.ceil((this.countdownEnd - performance.now()) / 1000);
      if (left !== last) {
        last = left;
        if (left > 0) {
          this.veilCount(left, left > 3 ? 'Ponte en posición' : 'Atento');
          if (left <= 3) Sound.beep(660, 0.1);
          if (left === 3) Voice.say('Tres', true);
        }
      }
      if (left <= 0) { this.veil(null); Sound.beep(990, 0.25); done(); return; }
      setTimeout(tick, 100);
    };
    tick();
  },

  /**
   * Con qué reloj se cierra la prueba.
   *
   * En vivo los cuadros vienen sellados con performance.now(), así que el
   * reloj de pared es comparable y el analizador puede darse cuenta de que el
   * último cuadro que recibió tiene cuarenta segundos. En video la marca es
   * tiempo del medio, donde performance.now() no significa nada.
   */
  relojFin() {
    return this.mode === 'live' ? performance.now() : (this.frame?.t ?? performance.now());
  },

  /**
   * Vigila que sigan llegando cuadros.
   *
   * La plancha es un minuto con el teléfono apoyado y nadie tocándolo. Si la
   * cámara se queda pegada, no llega ningún cuadro, y entonces el analizador
   * no se entera: su cuenta del tiempo sin ver vive dentro de update(), que es
   * justo lo que deja de pasar. Sin esto la prueba se queda esperando para
   * siempre con la imagen congelada y nada lo dice.
   *
   * El umbral es el mismo que ya rige para no ver a nadie: son la misma cosa
   * para quien está haciendo la prueba.
   */
  vigilarCuadros() {
    this.dejarDeVigilar();
    if (this.mode !== 'live') return;
    this.ultimoCuadroAt = performance.now();
    this.vigia = setInterval(() => this.revisarCuadros(), 1000);
  },

  /** Marca que llegó un cuadro. Lo usan los dos caminos que alimentan al analizador. */
  anotarCuadro() {
    this.ultimoCuadroAt = performance.now();
    this.huboCuadro = true;
    if (this.perf && this.phase === 'active') this.perf.n++;
  },

  /** Rendimiento de la serie (HU-65): cuadros analizados por segundo y lo que tarda el detector. Solo cámara y video. */
  rendimiento() {
    const p = this.perf;
    if (!p || !['live', 'video'].includes(this.mode)) return null;
    const seg = (performance.now() - p.t0) / 1000;
    const ms = p.ms.length ? p.ms.slice().sort((a, b) => a - b) : null;
    return {
      fps: seg > 1 ? Math.round((p.n / seg) * 10) / 10 : null,
      msDeteccion: ms ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
      msP95: ms ? Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]) : null,
      modelo: S.settings.model || 'full',
      video: this.mode === 'video',
    };
  },

  dejarDeVigilar() {
    if (this.vigia) { clearInterval(this.vigia); this.vigia = 0; }
  },

  revisarCuadros() {
    if (this.mode !== 'live') return;
    if (!['preview', 'countdown', 'arming', 'active'].includes(this.phase)) return;
    // Sin un primer cuadro no hay nada que vigilar: la cámara puede estar
    // todavía encendiéndose, y declararla muerta ahí sería un falso aviso.
    if (!this.huboCuadro) return;
    const hueco = (performance.now() - (this.ultimoCuadroAt || 0)) / 1000;
    if (hueco <= EX_CONFIG.common.invisibleEndSec) return;
    this.dejarDeVigilar();
    if (this.phase !== 'active') { this.cameraLost(); return; }
    const st = this.analyzer.stop(performance.now(), 'not_visible');
    this.finish(st, 'not_visible');
  },

  /**
   * Durante la prueba: si la persona queda de frente a la cámara más de 1,5 s, se avisa en pantalla y en voz (cada 8 s
   * como máximo). De frente no se mide la rodilla ni el codo y las repeticiones no se cuentan, sin que se note.
   */
  revisarLado(joints, t) {
    const r = vistaDeFrente(joints.j2);
    if (r == null || r <= EX_CONFIG.common.sideViewMax) { this.frenteDesde = null; return; }
    if (this.frenteDesde == null) { this.frenteDesde = t; return; }
    if (t - this.frenteDesde < 1500 || t - (this.avisoLadoAt ?? -1e9) < 8000) return;
    this.avisoLadoAt = t;
    this.cue({ level: 'warn', msg: 'Ponte de lado a la cámara' });
    Voice.say('Ponte de lado a la cámara. De frente no puedo contar', true);
  },

  sensorState() { return this.tiltEst ? this.tiltEst.state(performance.now()) : null; },

  /** Una vez fijada la inclinación: si el sensor dice que el teléfono se movió más de 5°, se avisa (una vez). */
  revisarMovido() {
    if (this.avisoMovido || !this.sensorLock) return;
    const ss = this.sensorState(), cur = ss?.tilt;
    if (!cur || cur.source !== 'sensor' || !Number.isFinite(cur.roll)) return;
    const d = Math.abs(((cur.roll - this.sensorLock.roll + 540) % 360) - 180);
    if (d > 5) { this.avisoMovido = true; this.movido = true; this.cue({ level: 'warn', msg: 'Se movió el teléfono' }); Voice.say('Se movió el teléfono. No lo toques', true); }
  },

  /** Aviso bajo la imagen: cuánto está inclinado el teléfono y de dónde sale el dato (Jose, runner.js#renderLevel). */
  renderLevel() {
    const chip = $('level-chip');
    if (!chip) return;
    chip.hidden = this.mode === 'demo';   // la persona de la demo es sintética: no hay teléfono
    const t = this.tilt, off = !S.settings.tiltCorrection;
    let d = describeTilt(t);
    if (!t && this.mode === 'live' && !this.tiltEst) d = { level: 'warn', msg: 'Sin sensores: pon el teléfono derecho' };
    else if (!t && this.tiltLocked) d = { level: 'warn', msg: 'No alcancé a medir la inclinación' };
    else if (!t) d = { level: 'warn', msg: 'Midiendo la inclinación con tu postura…' };
    else if (off && d.level !== 'bad' && Math.round(Math.abs(t.roll)) > ORIENT_CONFIG.okDeg) {
      d = { level: 'warn', msg: ORIENT_CONFIG.msg.straighten.replace('{n}', String(Math.round(Math.abs(t.roll)))) };
    }
    const conf = Number.isFinite(t?.confidence) ? ` · confianza ${Math.round(t.confidence * 100)} %` : '';
    let src = off ? 'Corrección desactivada' : !t || !isCorrectable(t) ? 'Sin corrección'
      : t.source === 'sensor' ? 'Sensores del teléfono' : `Estimado por tu postura${conf}`;
    // iPhone con el permiso rechazado: decirlo, para que se sepa por qué no hay sensores (HU-18).
    if (this.mode === 'live' && Sensors.permission === 'denied') src = 'Sin permiso de sensores · ' + src;
    const key = `${d.level}|${d.msg}|${src}|${this.tiltLocked}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    chip.dataset.level = d.level;
    $('level-msg').textContent = d.msg;
    $('level-src').textContent = src + (this.tiltLocked ? ' · fijada' : '');
    // Lo que obliga a mover el teléfono también se dice: desde 2–3 m no se lee.
    if (d.level === 'bad' && !this.tiltLocked && d.msg !== this.tiltDicho) { this.tiltDicho = d.msg; Voice.say(d.msg); }
  },

  /** Lo que se sabe de la cámara en esta serie; se guarda con el resultado. */
  capturaAhora() {
    const t = this.tilt, r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
    return {
      fuente: t?.source || 'none', roll: r1(t?.roll), pitch: r1(t?.pitch),
      corregida: !!(S.settings.tiltCorrection && isCorrectable(t)) || !!quarterTurn(t), movido: !!this.movido,
    };
  },

  /* ---------------- video con el esqueleto (opcional, queda en el teléfono) ---------------- */

  /** Empieza a grabar la imagen con el esqueleto encima, si la persona lo activó en Ajustes. */
  startGrab() {
    this.grab = null;
    if (!S.settings.grabarVideo || S.stand || !['live', 'video'].includes(this.mode)) return;
    const fmt = typeof MediaRecorder !== 'undefined' ? elegirFormatoVideo((m) => MediaRecorder.isTypeSupported(m)) : null;
    const ov = $('overlay');
    if (!fmt || !ov.width || typeof ov.captureStream !== 'function') return;
    try {
      const canvas = document.createElement('canvas');
      const k = Math.min(1, 1280 / Math.max(ov.width, ov.height));
      canvas.width = Math.round(ov.width * k); canvas.height = Math.round(ov.height * k);
      const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: fmt.mime, videoBitsPerSecond: 2500000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.start(1000);
      this.grab = { canvas, ctx: canvas.getContext('2d'), rec, chunks, fmt, k };
    } catch (e) { console.warn('grabar video', e); this.grab = null; }
  },

  /** Pinta un cuadro del video grabado: la imagen, el esqueleto y el conteo. */
  componer() {
    const g = this.grab;
    if (!g || g.rec.state !== 'recording') return;
    const v = $('video'), ov = $('overlay'), { ctx, canvas } = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (v.videoWidth) {
      const r = this.contentRect(v.videoWidth / v.videoHeight), s = this.dpr * g.k;
      const mirror = this.mode === 'live' && S.settings.facing === 'user';
      ctx.save();
      if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      const x = mirror ? (this.cw - r.x - r.w) : r.x;
      try { ctx.drawImage(v, x * s, r.y * s, r.w * s, r.h * s); } catch { /* cuadro no listo */ }
      ctx.restore();
    }
    ctx.drawImage(ov, 0, 0, canvas.width, canvas.height);
    const val = this.st?.value;
    if (val != null) {
      const txt = this.test === 'plank' ? `${mmss(val)}` : `${val} válidas`;
      ctx.font = `600 ${Math.round(canvas.height / 16)}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, ctx.measureText(txt).width + 32, canvas.height / 11);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 16, canvas.height / 22);
    }
  },

  /** Termina la grabación y entrega { blob, ext }, o null si no había. `guardar` false la descarta. */
  stopGrab(guardar = true) {
    const g = this.grab;
    this.grab = null;
    if (!g || g.rec.state === 'inactive') return Promise.resolve(null);
    return new Promise((res) => {
      g.rec.onstop = () => res(guardar && g.chunks.length ? { blob: new Blob(g.chunks, { type: g.fmt.mime.split(';')[0] }), ext: g.fmt.ext } : null);
      try { g.rec.stop(); } catch { res(null); }
    });
  },

  beginActive(t, immediate = false) {
    this.perf = { n: 0, t0: performance.now(), ms: [] };
    this.tiltLocked = true;
    this.startGrab();
    const ss = this.sensorState();
    this.sensorLock = ss?.lastStill?.source === 'sensor' ? ss.lastStill : null;
    this.analyzer.start(t);
    this.phase = 'active';
    this.startT = t;
    this.vigilarCuadros();
    // El temblor que se guarda con el resultado es el de la serie, no el de
    // la gente acomodándose antes de empezar.
    this.jitter?.reset();
    this.avisoCalidad = 0;
    Voice.say(this.test === 'plank' ? 'Mantén la posición' : 'Comienza', true);
    if (immediate) this.cue(null);
  },

  /** Detiene el ciclo de análisis de video (incluidos los callbacks pendientes) y pausa el video. */
  haltVideo() {
    this.runId = (this.runId || 0) + 1;
    this.running = false;
    const v = $('video');
    if (this.vfc && v.cancelVideoFrameCallback) { try { v.cancelVideoFrameCallback(this.vfc); } catch { /* ignore */ } }
    this.vfc = 0;
    cancelAnimationFrame(this.raf); this.raf = 0;
    v.onended = null;
    try { v.pause(); } catch { /* ignore */ }
  },

  stopByUser() {
    if (this.phase === 'countdown') { this.phase = 'preview'; this.veil(null); $('btn-start').hidden = false; $('btn-stop').hidden = true; $('btn-flip').hidden = this.mode !== 'live'; return; }
    if (this.phase === 'arming' && this.mode === 'video') {
      this.haltVideo();
      this.phase = 'preview';
      $('btn-start').hidden = false; $('btn-stop').hidden = true;
      this.cue(null);
      this.setPos(null, 'Análisis detenido. Toca «Analizar video» para empezar de nuevo.');
      return;
    }
    if (this.phase === 'active' && this.test === 'plank' && this.st?.phase === 'waiting') {
      // El reloj de la plancha nunca partió: esto es cancelar, no un resultado.
      return this.notStarted('Prueba detenida', 'El reloj no alcanzó a partir.');
    }
    if (this.phase === 'active') {
      const st = this.analyzer.stop(this.relojFin(), 'manual');
      if (this.mode === 'video') this.haltVideo();
      return this.finish(st, 'manual');
    }
    if (this.phase === 'arming') { this.phase = 'preview'; $('btn-start').hidden = false; $('btn-stop').hidden = true; $('btn-flip').hidden = this.mode !== 'live'; this.cue(null); }
  },

  /* ---------------- fuentes de cuadros ---------------- */

  loop() {
    this.running = true;
    const v = $('video');
    const useVfc = this.mode === 'live' && typeof v.requestVideoFrameCallback === 'function';
    /* El reagendado va DESPUÉS de tick(), así que una excepción ahí adentro
       mataba el bucle para siempre: la imagen quedaba congelada, el conteo
       detenido y nada lo decía. Se aguanta un tropezón y se sigue; si falla
       de verdad, se dice con el mensaje real en vez de dejar la pantalla
       quieta. */
    const step = () => {
      if (!this.running) return;
      try { this.tick(); this.fallosSeguidos = 0; }
      catch (e) { if (this.tickFallo(e)) return; }
      if (useVfc) this.vfc = v.requestVideoFrameCallback(step);
      else this.raf = requestAnimationFrame(step);
    };
    if (useVfc) this.vfc = v.requestVideoFrameCallback(step); else this.raf = requestAnimationFrame(step);
  },

  /** Un error dentro de tick(). Devuelve true si hay que parar el bucle. */
  tickFallo(e) {
    this.fallosSeguidos = (this.fallosSeguidos || 0) + 1;
    this.fallosTotal = (this.fallosTotal || 0) + 1;
    if (this.fallosSeguidos <= 3) console.warn('tick', e);
    if (this.fallosSeguidos < 10 && this.fallosTotal < 60) return false;
    this.running = false;
    this.dejarDeVigilar();
    if (this.phase === 'active') {
      // La medición no se puede defender: se cierra diciendo por qué.
      const st = this.analyzer.stop(this.relojFin(), 'not_visible');
      this.finish(st, 'not_visible');
    } else {
      this.fail(new Error(`La app falló mientras procesaba la imagen: ${e?.message || e}`));
    }
    return true;
  },

  tick() {
    let frame = null;
    if (this.mode === 'demo') {
      frame = this.demoFrame();
      if (frame && frame === this.lastRaw) return;
      this.lastRaw = frame;
      this.process(frame);
      return;
    }
    if (this.mode === 'live') {
      const v = $('video');
      if (!(v.readyState >= 2 && v.videoWidth)) return;
      const t = performance.now();
      frame = Engine.detect(v, t, v.videoWidth / v.videoHeight);
      this.noteDetect(performance.now() - t);
      if (Engine.errorCount > 90) { this.running = false; this.fail(new Error('El detector de pose dejó de responder. Cierra la prueba y vuelve a abrirla.')); return; }
      if (!frame) { this.processEmpty(t); return; }
    }
    this.process(frame);
  },

  /** Un cuadro en que MediaPipe no encontró a nadie: limpia el dibujo y deja que el analizador cuente el tiempo sin ver. */
  processEmpty(t) {
    this.anotarCuadro();
    this.ultimas = null;   // sin nadie a la vista no hay partes que nombrar
    this.marcarPosicion(false);
    // Sin persona a la vista igual se informa la inclinación (los sensores la saben).
    if (!this.tiltLocked && this.tiltEst) this.tilt = fuseTilt(this.sensorState()?.lastStill ?? null, this.level.state().tilt);
    this.renderLevel();
    this.draw(null);
    if (this.phase === 'active') {
      const st = this.analyzer.update(blankJoints(t));
      this.st = st;
      this.handleEvents(st);
      this.updateHud(st);
      if (st.phase === 'ended') this.finish(st, st.endReason);
      return;
    }
    if (this.phase === 'arming') this.armOkSince = null;
    if (this.phase !== 'ended') this.setPos(false, 'No detecto a nadie en la imagen');
  },

  demoFrame() {
    const d = this.demo;
    if (!d || !d.frames.length) return null;
    if (this.phase !== 'active') return d.frames[0];
    const el = performance.now() - this.demoT0; // ms since playback start
    const t0 = d.frames[0].t;
    let i = d.cursor || 0;
    while (i < d.frames.length - 1 && d.frames[i + 1].t - t0 <= el) i++;
    d.cursor = i;
    if (i >= d.frames.length - 1 && this.phase === 'active') {
      // Fin de la grabación sintética: se detiene como un video que terminó.
      const st = this.analyzer.stop(d.frames[i].t, 'manual');
      this.finish(st, 'video_end');
      return null;
    }
    return d.frames[i];
  },

  async runVideo() {
    const v = $('video');
    $('btn-start').hidden = true; $('btn-stop').hidden = false;
    this.phase = 'arming'; this.armOkSince = null;
    this.smoother.reset?.();
    this.level?.reset(); this.tilt = null; this.tiltLocked = false;
    this.jitter?.reset();
    this.videoOffset = Engine.lastTs + 1000;
    this.detectMs = [];
    v.playbackRate = 1;
    try { v.currentTime = 0; } catch { /* ignore */ }
    this.cue({ level: 'warn', msg: 'Buscando la posición inicial' });
    this.haltVideo();                      // cancela cualquier ciclo que haya quedado de un análisis anterior
    const runId = this.runId;
    await this.warmUp(v, this.videoOffset - 500);
    if (runId !== this.runId) return;
    this.running = true;
    const aspect = v.videoWidth / v.videoHeight;
    const onFrame = (mediaTime) => {
      if (!this.running || runId !== this.runId) return;
      const t = this.videoOffset + mediaTime * 1000;
      const t0 = performance.now();
      const frame = Engine.detect(v, t, aspect);
      this.noteDetect(performance.now() - t0, true);
      if (frame) this.process(frame); else this.processEmpty(t);
    };
    const ended = () => {
      if (!this.running || runId !== this.runId) return;
      this.haltVideo();
      if (this.phase === 'active') {
        const st = this.analyzer.stop(this.frame?.t ?? 0, 'manual');
        this.finish(st, 'video_end');
      } else {
        this.notStarted();
      }
    };
    v.onended = ended;
    if (typeof v.requestVideoFrameCallback === 'function') {
      const cb = (_now, meta) => {
        if (runId !== this.runId) return;
        onFrame(meta.mediaTime);
        if (this.running && runId === this.runId && !v.ended) this.vfc = v.requestVideoFrameCallback(cb);
      };
      this.vfc = v.requestVideoFrameCallback(cb);
    } else {
      let lastTime = -1;
      const poll = () => {
        if (!this.running || runId !== this.runId) return;
        if (v.currentTime !== lastTime) { lastTime = v.currentTime; onFrame(v.currentTime); }
        this.raf = requestAnimationFrame(poll);
      };
      this.raf = requestAnimationFrame(poll);
    }
    try { await v.play(); } catch (e) { if (runId === this.runId) this.fail(e); }
  },

  noteDetect(ms, adaptVideo = false) {
    this.detectMs.push(ms);
    if (this.perf && this.phase === 'active' && this.perf.ms.length < 20000) this.perf.ms.push(ms);
    if (this.detectMs.length > 30) this.detectMs.shift();
    if (adaptVideo && this.detectMs.length >= 10) {
      const avg = this.detectMs.reduce((a, b) => a + b, 0) / this.detectMs.length;
      const v = $('video');
      const rate = avg > 90 ? 0.35 : avg > 45 ? 0.5 : 1;
      if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
    }
  },

  /**
   * El temblor crudo en la imagen, si se pidió en Ajustes.
   * Está para calibrar: los umbrales salen de pruebas sintéticas y hay que
   * contrastarlos con teléfonos y luces de verdad antes de confiar en ellos.
   */
  mostrarCalidad() {
    const el = $('hud-cal');
    if (!S.settings.calidad) { if (!el.hidden) el.hidden = true; return; }
    const v = this.jitter?.temblor();
    el.hidden = false;
    el.textContent = Number.isFinite(v)
      ? `estabilidad ${v.toFixed(4).replace('.', ',')} · ${Cal.nivelDe(v)}`
      : 'estabilidad —';
  },

  /* ---------------- proceso de cada cuadro ---------------- */

  process(raw) {
    if (!raw) { this.draw(null); return; }
    this.anotarCuadro();
    // El temblor se mide sobre los puntos sin suavizar: el filtro justamente
    // se lo come, y es lo que dice si se puede confiar en el conteo.
    this.jitter?.push(raw.lm);
    this.mostrarCalidad();
    const frame = this.smoother.smooth(raw);
    this.frame = frame;
    if (!this.tiltLocked) {
      this.level.push(toJoints(frame));
      this.tilt = fuseTilt(this.sensorState()?.lastStill ?? null, this.level.state().tilt);
    } else this.revisarMovido();
    this.renderLevel();
    // De costado con la rotación bloqueada, el cuarto de vuelta se aplica siempre: sin él no hay prueba posible.
    const fc = correctFrame(frame, this.tilt, { quarterOnly: !S.settings.tiltCorrection });
    const joints = toJoints(fc);
    this.ultimas = joints;
    this.girada = !!fc.quarter;   // con la imagen girada la silueta derecha no calzaría: no se dibuja

    if (this.phase === 'preview' || this.phase === 'countdown') {
      const c = this.analyzer.check(joints);
      this.setPos(c.ok, c.ok ? 'Posición correcta' : this.detalle(c.msg));
      this.marcarPosicion(c.ok);
      // Si además la detección está inestable, conviene arreglarlo ahora y no
      // descubrirlo cuando el número ya salió corto. Va aparte del estado de
      // posición: la posición puede estar bien y la detección igual temblar, y
      // decir que la posición está mal sería mentira. Solo en 'malo': los
      // umbrales todavía son provisorios y avisar de más desgasta el aviso.
      if (c.ok && this.jitter?.nivel() === 'malo') this.cue({ level: "warn", msg: Cal.MENSAJE.malo });
    } else if (this.phase === 'arming' && this.test === 'plank') {
      this.beginActive(frame.t); // el analizador de la plancha espera solo el segundo sostenido antes de partir el reloj
    } else if (this.phase === 'arming') {
      const c = this.analyzer.check(joints);
      this.setPos(c.ok, c.ok ? 'Posición correcta: comienza' : this.detalle(c.msg));
      this.marcarPosicion(c.ok);
      if (c.ok) {
        if (this.armOkSince == null) this.armOkSince = frame.t;
        // Basta con estar en la posición de partida un momento (no 1 s quieto): quien hace las repeticiones sin pausa
        // nunca se queda 1 s arriba, y la app se perdía las primeras (video de Elías, 25-nov).
        if (frame.t - this.armOkSince >= ARM_HOLD_MS) { this.beginActive(this.armOkSince); }
      } else this.armOkSince = null;
    }
    if (this.phase === 'active') {
      this.revisarLado(joints, frame.t);
      const st = this.analyzer.update(joints);
      this.st = st;
      // Una sola vez cada 12 s: avisar más seguido sería ruido encima del ruido.
      if (this.jitter?.nivel() === 'malo' && frame.t - this.avisoCalidad > 12000) {
        this.avisoCalidad = frame.t;
        { this.cue({ level: 'warn', msg: Cal.MENSAJE.malo }); Voice.say(Cal.MENSAJE.malo); }
      }
      this.handleEvents(st);
      this.updateHud(st);
      if (st.phase === 'ended') { this.finish(st, st.endReason); return; }
      if (frame.t - this.lastRecT >= 50) { this.record(fc); this.lastRecT = frame.t; }
    }
    this.draw(frame);
  },

  record(frame) {
    const pts = this.lifter.lift(frame);
    if (!pts) return;
    const arr = new Float32Array(51);
    for (let i = 0; i < 17; i++) { const p = pts[i]; arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; }
    this.rec.push({ t: frame.t - this.startT, p: arr });
  },

  draw(frame) {
    this.drawOverlay(frame);
    this.componer();
  },

  drawOverlay(frame) {
    const c = $('overlay'), ctx = c.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (!frame) { this.dibujarSilueta(ctx, null); return; }
    const mirror = this.mode === 'live' && S.settings.facing === 'user';
    let project;
    if (this.mode === 'demo' && this.demo?.box) {
      // Persona sintética: encuadra todo el movimiento para llenar el escenario, sea cual sea la orientación.
      const b = this.demo.box, a = frame.aspect;
      const k = Math.min(this.cw * 0.84 / (b.x1 - b.x0), this.ch * 0.6 / (b.y1 - b.y0));
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      project = (nx, ny) => [this.cw / 2 + (nx * a - cx) * k, this.ch * 0.53 + (ny - cy) * k];
    } else {
      const rect = this.contentRect(frame.aspect);
      project = (nx, ny) => [rect.x + (mirror ? 1 - nx : nx) * rect.w, rect.y + ny * rect.h];
    }
    this.dibujarSilueta(ctx, frame, project);
    const side = pickSide(frame);
    const m = this.st?.metrics || {};
    const angles = [];
    if (S.settings.angles) {
      if (this.test === 'pushup' && m.elbow != null) angles.push({ joint: `${side}_elbow`, value: m.elbow });
      if (this.test === 'squat' && m.knee != null) angles.push({ joint: `${side}_knee`, value: m.knee });
      if (this.test === 'plank' && (m.line ?? m.hip) != null) angles.push({ joint: `${side}_hip`, value: m.line ?? m.hip, between: [`${side}_shoulder`, `${side}_ankle`] });
    }
    try {
      drawSkeleton2D(ctx, frame, { width: this.cw, height: this.ch, project, mirror, colors: COLORS, angles, highlight: angles.map((a) => a.joint) });
    } catch (e) { console.warn('drawSkeleton2D', e); }
    if (this.view && S.settings.show3d) {
      const pts = this.lifter.lift(frame);
      if (pts) { try { this.view.setPose(pts); this.view.render(); } catch (e) { console.warn('View3D', e); } }
    }
  },

  /** Desde cuándo la persona está en la posición inicial (para desvanecer la silueta guía). */
  marcarPosicion(ok) {
    if (!ok) this.posOkDesde = null;
    else if (this.posOkDesde == null) this.posOkDesde = performance.now();
  },

  /**
   * Silueta guía con la posición inicial ideal, al estilo de Victor, debajo del esqueleto. Va sobre la persona (a su
   * tamaño y mirando hacia su lado) o, si no hay nadie, al centro. Se desvanece cuando la posición es correcta y no
   * se muestra durante la prueba, en los videos subidos ni en la demostración.
   */
  dibujarSilueta(ctx, frame, project) {
    if (this.mode !== 'live' || S.settings.silueta === false || this.girada) return;
    const alfa = opacidadSilueta(this.phase, this.posOkDesde, performance.now());
    if (alfa <= 0) return;
    const v = $('video'), aspect = frame?.aspect || (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 9 / 16);
    if (!project) {
      const rect = this.contentRect(aspect), mirror = S.settings.facing === 'user';
      project = (nx, ny) => [rect.x + (mirror ? 1 - nx : nx) * rect.w, rect.y + ny * rect.h];
    }
    const variant = this.test === 'pushup' && S.profile.sex === 'F' ? 'knees' : 'toes';
    const { puntos, tramos } = siluetaPara(this.test, frame?.lm || null, aspect, { variant });
    const px = {};
    for (const [n, p] of Object.entries(puntos)) px[n] = project(p.x, p.y);
    const tronco = Math.hypot(px.cuello[0] - px.pelvis[0], px.cuello[1] - px.pelvis[1]);
    if (!(tronco > 4)) return;
    const COLOR = { eje: '#222427', i: '#3d9edb', d: '#e8633f' };
    const grueso = Math.max(4, tronco * 0.11);
    ctx.save();
    ctx.globalAlpha = 0.72 * alfa;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // halo blanco para que se vea sobre fondos oscuros, y encima el color de Victor
    for (const [halo, ancho] of [[true, grueso + 6], [false, grueso]]) {
      for (const [a, b, parte] of tramos) {
        ctx.strokeStyle = halo ? 'rgba(255,255,255,0.85)' : COLOR[parte];
        ctx.lineWidth = ancho;
        ctx.beginPath(); ctx.moveTo(...px[a]); ctx.lineTo(...px[b]); ctx.stroke();
      }
    }
    const rc = tronco * 0.3;
    ctx.fillStyle = COLOR.eje; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(...px.cabeza, rc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.lineWidth = Math.max(2, grueso * 0.35);
    for (const [, b, parte] of tramos) {
      ctx.strokeStyle = COLOR[parte];
      ctx.beginPath(); ctx.arc(...px[b], grueso * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },

  /* ---------------- HUD ---------------- */

  setHudIdle() {
    const plank = this.test === 'plank';
    $('hud-tl-lbl').textContent = plank ? 'Línea corporal' : 'Tiempo';
    $('hud-tl').textContent = plank ? '—' : '0:00';
    $('hud-tr-lbl').textContent = plank ? 'Tiempo' : 'Válidas';
    $('hud-tr').textContent = plank ? '0:00' : '0';
    $('hud-tr-sub').textContent = plank ? 'avisos: 0' : 'no válidas: 0';
    this.renderCells({});
  },

  updateHud(st) {
    const plank = this.test === 'plank';
    const el = ((this.frame?.t ?? this.startT) - this.startT) / 1000;
    if (plank) {
      $('hud-tl').textContent = deg(st.metrics?.line);
      $('hud-tr').textContent = mmss(st.value || 0);
      $('hud-tr-sub').textContent = `avisos: ${st.log?.length || 0}` + (st.phase === 'waiting' ? ' · esperando posición' : '');
    } else {
      $('hud-tl').textContent = mmss(el);
      $('hud-tr').textContent = String(st.value || 0);
      $('hud-tr-sub').textContent = `no válidas: ${st.invalid || 0}`;
    }
    this.renderCells(st.metrics || {});
    if (st.cue) this.cue({ ...st.cue, msg: this.detalle(st.cue.msg) }); else if (Date.now() - this.lastCueAt > 1500) this.cue(null);
    if (!plank && st.log) {
      const box = $('replog');
      while (box.children.length < st.log.length) {
        const r = st.log[box.children.length];
        const i = document.createElement('i');
        i.className = r.valid ? 'ok' : 'bad';
        i.title = r.valid ? 'válida' : (r.reason || 'no válida');
        box.appendChild(i);
      }
    }
  },

  renderCells(m) {
    const defs = this.test === 'pushup' ? [['Codo', m.elbow], ['Línea corporal', m.line], ['Cadera', m.hip]]
      : this.test === 'squat' ? [['Rodilla', m.knee], ['Cadera', m.hip], ['Tronco', m.torso]]
        : [['Línea corporal', m.line], ['Codo', m.elbow], ['Cadera', m.hip]];
    $('cells').innerHTML = defs.map(([l, v]) => `<div class="cell"><div class="lbl" style="font-size:12px">${esc(l)}</div><div class="v">${deg(v)}</div></div>`).join('');
  },

  /** "No te veo completo" se cambia por qué parte falta y qué hacer (queFalta); los demás avisos pasan tal cual. */
  detalle(msg) {
    if (msg !== EX_CONFIG.msg.notVisible || !this.ultimas) return msg;
    return queFalta(this.ultimas, this.test, S.profile.sex === 'F' ? 'knees' : 'toes') || msg;
  },

  handleEvents(st) {
    for (const ev of st.events || []) {
      if (ev.type === 'rep') { Sound.beep(1046, 0.08, 0.12); Voice.say(String(st.value), true); }
      else if (ev.type === 'invalid') { Sound.beep(330, 0.18, 0.15); Voice.say(ev.msg || 'No válida', true); }
      else if (ev.type === 'cue') { Voice.say(this.detalle(ev.msg), true); }
      else if (ev.type === 'start' && this.test === 'plank') { Voice.say('Tiempo corriendo', true); }
    }
    if (this.test === 'plank' && st.phase === 'active') {
      const s = Math.floor(st.value || 0);
      if (s > 0 && s % 15 === 0 && s !== this.lastCount) { this.lastCount = s; Voice.say(`${s} segundos`); }
    }
  },

  cue(c) {
    const bar = $('cue-bar');
    if (!c) { bar.hidden = true; return; }
    bar.hidden = false; bar.dataset.level = c.level || ''; bar.textContent = c.msg;
    this.lastCueAt = Date.now();
  },

  setPos(ok, msg) {
    const chip = $('pos-chip');
    chip.dataset.ok = ok == null ? '' : String(!!ok);
    $('pos-msg').textContent = msg;
    // Antes de la prueba, los mensajes cortos de posición van también a la barra grande sobre la imagen (se lee a 2,5 m).
    if (ok != null && msg && msg.length <= 44 && this.phase !== 'active' && this.phase !== 'ended') {
      this.cue({ level: ok ? 'good' : 'warn', msg });
      this.decirPosicion(ok, msg);
    }
  },

  // A 2–3 m el texto casi no se lee: lo que el modelo ve también se dice. Solo
  // cuando el mensaje cambia y se mantiene, y no más de uno cada 3 s, para no
  // hablar encima de la persona mientras se acomoda.
  decirPosicion(ok, msg) {
    const now = performance.now();
    if (msg !== this.posPend) { this.posPend = msg; this.posDesde = now; return; }
    if (msg === this.posDicho || now - this.posDesde < 700 || now - (this.posDichoAt || 0) < 3000) return;
    this.posDicho = msg; this.posDichoAt = now;
    Voice.say(msg);
  },

  veil(msg, sub = '', progress) {
    const v = $('veil');
    if (!msg) { v.hidden = true; return; }
    v.hidden = false;
    $('veil-count').hidden = true;
    $('veil-msg').textContent = msg;
    $('veil-sub').textContent = sub || '';
    const has = progress != null && isFinite(progress);
    $('veil-progress').hidden = progress === undefined;
    $('veil-bar').style.width = has ? `${Math.round(clamp(progress, 0, 1) * 100)}%` : '30%';
  },

  veilCount(n, msg) {
    const v = $('veil');
    v.hidden = false;
    $('veil-count').hidden = false; $('veil-count').textContent = String(n);
    $('veil-msg').textContent = msg; $('veil-sub').textContent = ''; $('veil-progress').hidden = true;
  },

  /* ---------------- término ---------------- */

  /** La prueba nunca partió de verdad (el reloj de la plancha no corrió, o un video sin posición inicial): vuelve a la vista previa. */
  notStarted(title = 'No encontré la posición', detail = null) {
    this.dejarDeVigilar();
    if (this.mode === 'video') this.haltVideo();
    this.phase = 'preview';
    this.analyzer = createAnalyzer(this.test, { sex: S.profile.sex });
    this.st = null;
    $('btn-start').hidden = false; $('btn-stop').hidden = true;
    $('btn-flip').hidden = this.mode !== 'live';
    $('replog').innerHTML = '';
    this.setHudIdle();
    this.cue({ level: 'bad', msg: title });
    this.setPos(false, (detail || (this.mode === 'video'
      ? 'Revisa que el video te muestre de lado y de cuerpo entero, y vuelve a intentarlo.'
      : 'Ponte de lado y de cuerpo entero frente a la cámara, y vuelve a iniciar.')) + ' No se guardó ningún resultado.');
    Voice.say(title, true);
  },

  /** Se cortó la cámara (otra app la tomó, el sistema la interrumpió…). */
  cameraLost() {
    if (this.mode !== 'live' || this.phase === 'ended' || this.phase === 'idle') return;
    if (this.phase === 'active') {
      const st = this.analyzer.stop(performance.now(), 'not_visible');
      this.finish(st, 'not_visible');
      return;
    }
    this.running = false;
    this.phase = 'preview';
    $('btn-start').hidden = false; $('btn-stop').hidden = true; $('btn-start').disabled = true;
    this.veil('La cámara se detuvo', 'Otra app pudo haber tomado la cámara. Cierra la prueba y vuelve a abrirla.');
  },

  finish(st, reason) {
    if (this.phase === 'ended') return;
    if (this.test === 'plank' && !(st?.value > 0)) { this.notStarted(); return; }
    // Flexiones/sentadillas: una prueba sin ninguna repetición juzgada (cancelada, o nadie se movió) no es un resultado.
    if (this.test !== 'plank' && !(st?.log?.length > 0)) { this.notStarted('No registré repeticiones'); return; }
    this.phase = 'ended';
    this.running = false;
    this.dejarDeVigilar();
    WakeLock.off();
    try { $('video').pause(); } catch { /* ignore */ }
    const endReason = reason || st?.endReason || 'manual';
    Voice.say(this.test === 'plank' ? `Fin. ${Math.floor(st.value || 0)} segundos` : `Fin. ${st.value || 0} válidas`, true);
    Sound.beep(523, 0.3, 0.15);
    const value = this.test === 'plank' ? Math.round((st.value || 0) * 10) / 10 : (st.value || 0);
    const result = { value, invalid: st.invalid || 0, endReason, mode: this.mode, date: new Date().toISOString(), log: (st.log || []).slice(0, 200),
      calidad: this.jitter?.resumen() || null,
      captura: this.capturaAhora(),
      rendimiento: this.rendimiento(),
      sinVer: Number.isFinite(st.sinVer) ? st.sinVer : null,
      reglas: REGLAS,
      profile: { age: S.profile.age, sex: S.profile.sex } };
    if (this.mode !== 'demo') {
      S.history = Hist.pushResult(S.history, this.test, result, ORDER);
      S.results = Hist.latestMap(S.history, ORDER);
      saveStore();
    }
    S.last = { test: this.test, result, rec: this.rec, demo: this.mode === 'demo', video: null };
    const ultimo = S.last;
    this.stopGrab().then((v) => { if (v && S.last === ultimo) { ultimo.video = v; if (S.screen === 'result') renderGuardar(); } });
    const test = this.test;
    const sid = this.sid;
    setTimeout(() => { if (sid === this.sid && S.screen === 'run') { show('result'); renderResult(test); } }, 350);
  },
};

const BLANK_LM = Object.freeze(Array.from({ length: 33 }, () => Object.freeze({ x: 0.5, y: 0.5, z: 0, visibility: 0 })));
/** Articulaciones de un cuadro en que no se detectó a nadie (todas invisibles). */
function blankJoints(t) { return toJoints({ t, lm: BLANK_LM, world: null, aspect: 1 }); }

function pickSide(frame) {
  const L = [11, 13, 15, 23, 25, 27], R = [12, 14, 16, 24, 26, 28];
  const vis = (ids) => ids.reduce((a, i) => a + (frame.lm[i]?.visibility ?? 0), 0);
  return vis(L) >= vis(R) ? 'l' : 'r';
}

function waitFor(pred, ms) {
  return new Promise((res) => {
    const t0 = performance.now();
    const f = () => (pred() || performance.now() - t0 > ms ? res() : setTimeout(f, 50));
    f();
  });
}

/** Sesiones de demostración: personas sintéticas haciendo cada prueba (prueba todo el flujo sin cámara). */
function buildDemo(test, sex) {
  const opts = test === 'pushup' ? { reps: 15, invalidAt: [13, 14], kind: 'sag', sex, seed: 7, fps: 30, noise: 0.003, fatigueEnd: true }
    : test === 'squat' ? { reps: 16, invalidAt: [14, 15], kind: 'shallow', sex, seed: 11, fps: 30, noise: 0.003 }
      : { seconds: 48, sagAt: [{ t: 20, dur: 2.5, depth: 0.12, recover: true }], collapseAt: 46, sex, seed: 5, fps: 30, noise: 0.002 };
  const s = synthSession(test, opts);
  // Caja que encierra todo el movimiento (unidades de imagen corregidas por aspecto) para encuadrar en pantalla.
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const f of s.frames) {
    for (let i = 0; i < f.lm.length; i++) {
      if (i > 0 && i < 11) continue;
      const x = f.lm[i].x * f.aspect, y = f.lm[i].y;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    }
  }
  return { frames: s.frames, meta: s.meta, cursor: 0, box };
}

/* ------------------------------------------------------------------ resultado */

let Review = null;

function renderResult(test) {
  const L = S.last;
  const t = TESTS[test];
  const r = L?.result || S.results[test];
  if (!r) { show('hub'); return; }
  // El perfil con el que se midió, no el de ahora: «Cambiar edad o sexo» en
  // Ajustes no puede reescribir con qué tabla se comparó una medición vieja.
  const perfil = r.profile || S.profile;
  let cls = null;
  try { cls = classify(test, r.value, perfil); } catch (e) { console.warn(e); }
  $('res-kicker').textContent = `Prueba ${t.n} · ${t.name}${L?.demo ? ' · demostración' : ''}`;
  $('res-title').textContent = L?.demo ? 'Resultado de la demostración' : 'Tu resultado';
  const shortPlank = t.unit === 's' && r.value < 60;
  $('res-value').textContent = t.unit === 's' ? (shortPlank ? num(r.value, 1) : mmss(r.value)) : String(r.value);
  $('res-unit').textContent = t.unit === 's' ? (shortPlank ? 's' : 'min') : t.unitLong;
  $('res-cat').textContent = cls ? cls.category.label : '';
  $('res-meter').innerHTML = cls ? Array.from({ length: cls.category.of }, (_, i) => `<i class="${i <= cls.category.index ? 'on' : ''}"></i>`).join('') : '';
  const endTxt = typeof END_TEXT[r.endReason] === 'object' ? END_TEXT[r.endReason][test] : END_TEXT[r.endReason] || r.endReason;
  const detail = t.unit === 's'
    ? `${num(r.value, 1)} s en posición. ${cls?.percentile != null ? `Percentil ${cls.percentile} entre universitarios de tu sexo.` : ''} Terminó porque ${endTxt}.`
    : `${r.invalid} no válidas. Terminó porque ${endTxt}.`;
  const rd = r.rendimiento;
  $('res-detail').textContent = detail
    + (S.settings.calidad && r.calidad
      ? ` Estabilidad de la detección: ${String(r.calidad.temblor).replace('.', ',')} (${r.calidad.nivel}).`
      : '')
    + (S.settings.calidad && rd?.fps != null
      ? ` Rendimiento: ${num(rd.fps, 1)} cuadros por segundo, el detector tarda ${rd.msDeteccion} ms (${rd.msP95} ms en los cuadros más lentos), modelo ${rd.modelo === 'lite' ? 'rápido' : 'preciso'}.${rd.fps < 15 && !rd.video ? ' Bajo 15 cuadros por segundo: prueba el modelo «Rápido» en Ajustes.' : ''}`
      : '');
  $('res-next').textContent = cls ? (cls.next ? `Te faltan ${t.unit === 's' ? num(cls.next.needed, 0) + ' s' : cls.next.needed + (cls.next.needed === 1 ? ' repetición' : ' repeticiones')} para llegar a «${cls.next.label}».` : 'Estás en la categoría más alta de la tabla.') : '';

  renderDelta($('res-delta'), test, { demo: !!L?.demo });

  if (cls) {
    // La etiqueta tiene que describir la tabla que se usó de verdad. Con
    // S.profile decía «mujeres · con apoyo de rodillas» sobre una medición
    // clasificada con la tabla de hombres, y en flexiones no es un matiz: el
    // protocolo de CSEP es físicamente otro ejercicio.
    const variant = test === 'pushup' ? (perfil.sex === 'F' ? ' · con apoyo de rodillas' : ' · desde los pies') : '';
    const bandLabel = test === 'plank' ? 'universitarios' : cls.band;
    $('res-table-lbl').textContent = `Baremo ${cls.source.short} · ${perfil.sex === 'F' ? 'mujeres' : 'hombres'} ${bandLabel}${variant}`;
    const rows = [...cls.table].reverse();
    $('res-table').innerHTML = `<thead><tr><th>Categoría</th><th style="text-align:right">${t.unit === 's' ? 'Tiempo' : 'Repeticiones'}</th></tr></thead><tbody>${rows.map((row) => `<tr class="${row.key === cls.category.key ? 'hit' : ''}"><td>${esc(row.label)}${row.key === cls.category.key ? ' · tú' : ''}</td><td class="r">${esc(row.text)}</td></tr>`).join('')}</tbody>`;
    const flags = [];
    if (cls.flags?.includes('unverified_cut')) flags.push('Este corte de la banda 15–19 no se confirmó en una fuente primaria; conviene verificarlo en las ACSM\'s Guidelines.');
    if (cls.flags?.includes('questionable_source')) flags.push(normsFor('squat').caveat || 'La tabla de ACE coincide con un baremo de abdominales; úsala como referencia práctica.');
    if (cls.flags?.includes('extrapolated')) flags.push('Tu tiempo está fuera del rango P10–P90 del estudio; el percentil es una estimación.');
    if (test === 'plank') flags.push(normsFor('plank').caveat);
    if (L?.demo) flags.push('Esto es una demostración con una persona simulada: no se guarda en tu perfil.');
    $('res-flags').innerHTML = flags.filter(Boolean).map((f) => `<div class="flag">${esc(f)}</div>`).join('');
    $('res-src').innerHTML = `${esc(cls.source.apa)} ${cls.source.url ? `<a href="${esc(cls.source.url)}" target="_blank" rel="noopener">${esc(cls.source.url)}</a>` : ''}`;
  } else {
    // Sin clasificación hay que decir por qué, en vez de dejar la tarjeta en blanco.
    $('res-table').innerHTML = '';
    $('res-src').innerHTML = '';
    $('res-table-lbl').textContent = 'Sin tabla de referencia';
    const porque = !coversAge(perfil.age)
      ? `Los baremos de esta versión van de ${AGE_RANGE.min} a ${AGE_RANGE.max} años, y la edad registrada es ${perfil.age ?? '—'}. FitGram contó las repeticiones válidas y corrigió la técnica, pero no puede decir en qué nivel estás: inventar una categoría con una tabla de otra población sería un número falso.`
      : 'No se pudo clasificar este resultado con las tablas disponibles.';
    $('res-flags').innerHTML = `<div class="flag">${esc(porque)}</div>`;
  }

  // Si no se pudo confiar en la detección, eso va primero: cambia cómo hay que
  // leer el número, incluso antes que la tabla con la que se comparó.
  const avisoSinVer = Cal.sinVerTexto(test, r.sinVer, r.endReason);
  if (avisoSinVer) $('res-flags').insertAdjacentHTML('afterbegin', `<div class="flag">${esc(avisoSinVer)}</div>`);
  const avisoCal = Cal.RESULTADO[r.calidad?.nivel];
  if (avisoCal) $('res-flags').insertAdjacentHTML('afterbegin', `<div class="flag">${esc(avisoCal)}</div>`);
  // La inclinación del teléfono: si se movió, va arriba de todo (HU-22); si
  // estaba ladeada, se dice cuánto y si se corrigió, para leer bien el número.
  const cap = r.captura;
  if (cap && !L?.demo) {
    const g = Number.isFinite(cap.roll) ? Math.round(Math.abs(cap.roll)) : null;
    const fuente = cap.fuente === 'sensor' ? 'con los sensores' : cap.fuente === 'image' ? 'con tu postura' : '';
    let txt = '';
    if (g != null && g > 2) txt = cap.corregida
      ? `El teléfono estaba inclinado ${g}° (medido ${fuente}) y se corrigió antes de contar.`
      : `El teléfono estaba inclinado ${g}° y no se corrigió: el conteo puede estar afectado.`;
    if (txt) $('res-flags').insertAdjacentHTML('afterbegin', `<div class="flag">${esc(txt)}</div>`);
    if (cap.movido) $('res-flags').insertAdjacentHTML('afterbegin', `<div class="flag">El teléfono se movió durante la prueba. Si el conteo no te calza, repítela sin tocarlo.</div>`);
  }

  const next = ORDER.find((x) => x !== test && !S.results[x]);
  const bn = $('btn-res-next');
  bn.textContent = next ? `Siguiente · ${TESTS[next].short}` : 'Ver mi estado de forma';
  bn.onclick = () => (next ? openIntro(next) : show('profile'));
  $('btn-res-retry').onclick = () => openIntro(test);
  const bv = $('btn-res-valid');
  bv.hidden = !S.settings.valid || !!L?.demo;
  bv.onclick = () => openValid(test, r.value, r);

  setupReview(L?.rec || []);
  renderGuardar();
}

function setupReview(rec) {
  const box = $('review');
  Review?.stop();
  if (!rec.length) { box.hidden = true; return; }
  box.hidden = false;
  const canvas = $('review3d');
  let view = null;
  try { view = new View3D(canvas, { colors: COLORS, grid: true }); } catch (e) { console.warn(e); box.hidden = true; return; }
  const range = $('review-range');
  range.max = String(rec.length - 1); range.value = '0';
  const toPts = (arr) => Array.from({ length: 17 }, (_, i) => ({ x: arr[i * 3], y: arr[i * 3 + 1], z: arr[i * 3 + 2], v: 1 }));
  const showAt = (i) => {
    const r = rec[clamp(i, 0, rec.length - 1)];
    view.setPose(toPts(r.p)); view.render();
    $('review-time').textContent = mmss(r.t / 1000);
  };
  let playing = false, raf = 0, t0 = 0, i0 = 0;
  // Se abre en el cuadro del medio como vista previa; la primera vez que se
  // reproduce parte desde el inicio, no desde ahí.
  let preview = true;
  let onEnd = null;   // lo usa grabar(): avisa cuando la reproducción llega al final
  const icon = (p) => { $('review-play-ic').innerHTML = p ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="7 4 20 12 7 20 7 4"/>'; $('review-play').setAttribute('aria-label', p ? 'Pausar' : 'Reproducir'); };
  const step = () => {
    if (!playing) return;
    const el = performance.now() - t0 + rec[i0].t;
    let i = Number(range.value);
    while (i < rec.length - 1 && rec[i + 1].t <= el) i++;
    range.value = String(i); showAt(i);
    if (i >= rec.length - 1) { playing = false; icon(false); onEnd?.(); return; }
    raf = requestAnimationFrame(step);
  };
  $('review-play').onclick = () => {
    playing = !playing; icon(playing);
    if (playing) { if (preview || Number(range.value) >= rec.length - 1) range.value = '0'; preview = false; i0 = Number(range.value); t0 = performance.now(); raf = requestAnimationFrame(step); }
    else cancelAnimationFrame(raf);
  };
  range.oninput = () => { preview = false; playing = false; icon(false); cancelAnimationFrame(raf); showAt(Number(range.value)); };
  for (const b of box.querySelectorAll('.seg button')) {
    b.onclick = () => {
      for (const o of box.querySelectorAll('.seg button')) o.setAttribute('aria-pressed', String(o === b));
      view.setView?.(b.dataset.view);
      $('review-tag').textContent = b.textContent;
      showAt(Number(range.value));
    };
  }
  requestAnimationFrame(() => { view.resize?.(); view.setView?.('front'); showAt(Math.floor(rec.length / 2)); range.value = String(Math.floor(rec.length / 2)); });
  Review = {
    stop() { playing = false; onEnd = null; cancelAnimationFrame(raf); view?.destroy?.(); },
    /** Graba la animación 3D de principio a fin, en la vista elegida. Entrega { blob, ext } o null. */
    grabar() {
      const fmt = typeof MediaRecorder !== 'undefined' ? elegirFormatoVideo((m) => MediaRecorder.isTypeSupported(m)) : null;
      if (!fmt || typeof canvas.captureStream !== 'function') return Promise.resolve(null);
      return new Promise((res) => {
        let mr;
        try { mr = new MediaRecorder(canvas.captureStream(30), { mimeType: fmt.mime, videoBitsPerSecond: 2000000 }); } catch { res(null); return; }
        const chunks = [];
        mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        mr.onstop = () => res(chunks.length ? { blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), ext: fmt.ext } : null);
        onEnd = () => { onEnd = null; setTimeout(() => { try { mr.stop(); } catch { res(null); } }, 400); };
        mr.start(500);
        cancelAnimationFrame(raf);
        preview = false; range.value = '0'; showAt(0);
        playing = true; icon(true); i0 = 0; t0 = performance.now(); raf = requestAnimationFrame(step);
      });
    },
  };
  Review.disponible = typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
}

/** Guarda un archivo: con la hoja de compartir del teléfono si existe, si no, como descarga. */
async function guardarArchivo(nombre, blob) {
  try {
    const file = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'FitGram' }); return true; }
  } catch (e) { if (e?.name === 'AbortError') return false; /* sigue con la descarga */ }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}

/** Botones de «Guardar o compartir» del resultado (idea de Elías, 23-nov). */
function renderGuardar() {
  const L = S.last;
  const box = $('res-guardar');
  const real = !!L && !L.demo && L.test === S.test;
  box.hidden = !real || S.stand;   // modo stand: el teléfono es compartido, no se guarda nada
  if (box.hidden) return;
  $('btn-save-video').hidden = !L.video;
  $('btn-save-3d').hidden = !(L.rec?.length && Review?.disponible);
  $('btn-share-skel').hidden = !(L.rec?.length);
  box.hidden = $('btn-save-video').hidden && $('btn-save-3d').hidden && $('btn-share-skel').hidden;
  $('res-guardar-msg').textContent = '';
}

/* ------------------------------------------------------------------ avance */

const DATE_FMT = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const dateLabel = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : DATE_FMT.format(d); };
const valText = (test, v) => (TESTS[test].unit === 's' ? `${num(v, 1)} s` : `${v} rep`);

/** El cambio de una prueba, en corto: "+9 rep", "-2,5 s", "igual". */
function deltaShort(test, d) {
  if (!d) return '';
  if (d.dir === 'same') return 'igual';
  const T = TESTS[test];
  const mag = Math.abs(d.diff).toFixed(T.unit === 's' ? 1 : 0).replace('.', ',');
  return `${d.dir === 'up' ? '+' : '-'}${mag}${T.unit === 's' ? ' s' : ' rep'}`;
}

function deltaChip(test) {
  const d = Hist.deltaOf(S.history, test);
  if (!d) return '';
  return `<span class="delta-inline ${d.dir}">${esc(deltaShort(test, d))}</span>`;
}

function deltaAria(test) {
  const d = Hist.deltaOf(S.history, test);
  return d ? `. ${Hist.deltaText(d, TESTS[test])}` : '';
}

/**
 * Bloque "qué cambió" de la pantalla de resultado.
 * Con una sola medición no compara nada: dice que es el punto de partida.
 */
function renderDelta(box, test, { demo = false } = {}) {
  const T = TESTS[test];
  if (demo) {
    box.innerHTML = `<div class="delta"><p class="small muted" style="margin:0">La demostración no se guarda, así que no entra en tu historial.</p></div>`;
    return;
  }
  const d = Hist.deltaOf(S.history, test);
  if (!d) {
    box.innerHTML = `<div class="delta"><div class="lbl">Tu punto de partida</div>
      <p class="small" style="margin:0">Es tu primera medición de ${esc(T.short.toLowerCase())}. Repite la prueba en ${Hist.CYCLE_DAYS} días y acá vas a ver cuánto cambió.</p></div>`;
    return;
  }
  let catTxt = '';
  try {
    const a = classify(test, d.prev.value, d.prev.profile || S.profile);
    const b = classify(test, d.curr.value, d.curr.profile || S.profile);
    if (a && b && a.category.key !== b.category.key) catTxt = `<span class="chip cat">${esc(a.category.label)} → ${esc(b.category.label)}</span>`;
  } catch (e) { console.warn(e); }
  const sign = d.dir === 'up' ? '+' : d.dir === 'down' ? '-' : '=';
  const mag = d.dir === 'same' ? '0' : Math.abs(d.diff).toFixed(T.unit === 's' ? 1 : 0).replace('.', ',');
  box.innerHTML = `<div class="delta ${d.dir}">
    <div class="lbl">Qué cambió</div>
    <div class="delta-row">
      <span class="delta-big">${sign}${mag}</span>
      <span class="delta-unit">${T.unit === 's' ? 'segundos' : esc(T.unitLong)}</span>
      ${catTxt}
    </div>
    <p class="small" style="margin:0">${esc(dateLabel(d.prev.date))}: ${esc(valText(test, d.prev.value))}. Ahora: ${esc(valText(test, d.curr.value))}. ${esc(Hist.deltaText(d, T))}</p>
    ${d.isBest && d.count > 1 ? '<p class="small" style="margin:0">Es tu mejor marca hasta ahora.</p>' : ''}
    ${d.noComparable ? `<div class="note warn small" style="margin:4px 0 0">${d.noComparable === 'protocolo'
      ? 'Ojo: estas dos mediciones se hicieron con protocolos distintos (desde los pies y con rodillas). No son comparables.'
      : 'Ojo: estas dos mediciones se contaron con versiones distintas de las reglas de la app. La diferencia puede venir de ahí.'}</div>` : ''}
    <p class="small muted" style="margin:0">${d.count} ${d.count === 1 ? 'medición' : 'mediciones'} guardadas en este teléfono.</p>
    ${hasDemoData() ? `<div class="note warn small" style="margin:4px 0 0">${esc(DEMO_WARN)}</div>` : ''}
  </div>`;
}

/** El índice FitGram de una vuelta, con las pruebas que tenga. */
function roundIndex(round) {
  const parts = {};
  for (const t of ORDER) {
    const r = round.results[t];
    if (!r) { parts[t] = null; continue; }
    try { parts[t] = classify(t, r.value, r.profile || S.profile); } catch { parts[t] = null; }
  }
  try { return fitnessProfile(parts); } catch (e) { console.warn(e); return null; }
}

/** Gráfico de la serie de una prueba. La lista de abajo es su alternativa en texto. */
function sparkSVG(test, w = 280, h = 46) {
  const pts = Hist.sparkPoints(S.history, test, w, h);
  if (pts.length < 2) return '';
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => {
    const last = i === pts.length - 1;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${last ? 3.4 : 2.1}"${last ? ' class="last"' : ''}/>`;
  }).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${path}"/>${dots}</svg>`;
}

/* --- datos de demostración -------------------------------------------------
   El avance solo se ve con varias mediciones separadas en el tiempo, y nadie
   tiene dos meses para esperar antes de una presentación. Esto siembra tres
   evaluaciones de ejemplo (hace 8 semanas, hace 4, hoy) para poder mirar y
   mostrar la pantalla. Queda marcado en pantalla: no se presenta como dato real.

   Se activa con `index.html?demo=historial`, o desde la consola con
   `FITGRAM.seedDemoHistory()`. Se borra con «Borrar mis datos de este teléfono».
   --------------------------------------------------------------------------- */

const DEMO_SERIES = { pushup: [18, 24, 29], squat: [26, 33, 41], plank: [38, 52, 61.5] };

function demoHistory(now = Date.now()) {
  const h = Hist.emptyHistory(ORDER);
  for (const t of ORDER) {
    const vals = DEMO_SERIES[t] || [];
    h[t] = vals.map((v, i) => ({
      value: v,
      invalid: t === 'plank' ? 0 : 3 - i,
      endReason: 'manual',
      mode: 'demo',
      demo: true,
      date: new Date(now - (vals.length - 1 - i) * Hist.CYCLE_DAYS * 86400000).toISOString(),
      profile: { age: S.profile.age || 20, sex: S.profile.sex || 'M' },
    }));
  }
  return Hist.trim(h, ORDER);
}

/** True si lo guardado viene del sembrador y no de pruebas reales. */
function hasDemoData() {
  return ORDER.some((t) => (S.history?.[t] || []).some((r) => r.demo));
}

function seedDemoHistory(target = 'profile') {
  if (!S.profile.age) S.profile.age = 20;
  if (!S.profile.sex) S.profile.sex = 'M';
  S.history = demoHistory();
  S.results = Hist.latestMap(S.history, ORDER);
  S.last = null;
  saveStore();
  if (ORDER.includes(target)) { S.test = target; show('result'); renderResult(target); return; }
  show(target === 'hub' ? 'hub' : 'profile');
}

const DEMO_WARN = 'Datos de demostración: tres evaluaciones de ejemplo, no mediciones tuyas. Bórralas con «Borrar mis datos de este teléfono» antes de usar la app en serio.';

/** Tarjeta de avance del perfil: cuándo repetir, índice por evaluación y serie de cada prueba. */
function renderProgress() {
  const box = $('prof-progress');
  const rounds = Hist.roundsOf(S.history, ORDER);
  if (!rounds.length) { box.hidden = true; return; }
  box.hidden = false;

  const due = Hist.dueInfo(S.history, ORDER);
  const dueHtml = !due.date ? '' : `<div class="due${due.due ? ' now' : ''}">
    <div class="lbl">${due.due ? 'Te toca repetir' : 'Próxima evaluación'}</div>
    <p class="small" style="margin:0">${due.due
      ? `Tu última prueba fue el ${esc(dateLabel(due.date))}, hace ${due.sinceDays} días. Repite las tres para ver cuánto cambiaste.`
      : `Última prueba el ${esc(dateLabel(due.date))}. Te toca repetir las tres el ${esc(dateLabel(new Date(Date.parse(due.date) + due.cycleDays * 86400000).toISOString()))}, en ${due.daysLeft} ${due.daysLeft === 1 ? 'día' : 'días'}.`}</p>
  </div>`;

  const idx = rounds.map((rd) => ({ rd, prof: roundIndex(rd) })).filter((x) => x.prof && x.prof.position != null);
  let idxHtml = '';
  if (idx.length > 1) {
    idxHtml = `<div>
      <div class="lbl">Índice FitGram por evaluación</div>
      <ul class="hist-list">${idx.map((x, i) => {
        const dp = i ? x.prof.position - idx[i - 1].prof.position : null;
        const dir = dp == null ? '' : dp > 0 ? 'up' : dp < 0 ? 'down' : 'same';
        const dtxt = dp == null ? '' : ` <span class="delta-inline ${dir}">${dp > 0 ? '+' : dp < 0 ? '-' : '='}${Math.abs(dp)}</span>`;
        return `<li class="${i === idx.length - 1 ? 'cur' : ''}"><span>Evaluación ${x.rd.n} <span class="d">· ${esc(dateLabel(x.rd.date))}${x.rd.complete ? '' : ' · incompleta'}</span></span><span>${x.prof.position}/100${dtxt}</span></li>`;
      }).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">La evaluación N junta la N-ésima vez que hiciste cada prueba. Si dejaste una sin hacer, queda marcada como incompleta y el índice usa solo las que hay.</p>
    </div>`;
  }

  const tests = ORDER.map((t) => {
    const serie = S.history[t] || [];
    if (!serie.length) return '';
    const T = TESTS[t];
    const d = Hist.deltaOf(S.history, t);
    const best = Hist.bestOf(S.history, t);
    const shown = serie.slice(-6);
    return `<div class="hist-test">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div class="lbl" style="color:var(--ink)">${esc(T.name)}</div>
        ${d ? `<span class="delta-inline ${d.dir}">${esc(deltaShort(t, d))}</span>` : '<span class="small muted">una sola medición</span>'}
      </div>
      ${sparkSVG(t)}
      <ul class="hist-list">${shown.map((r, i) => `<li class="${i === shown.length - 1 ? 'cur' : ''}"><span class="d">${esc(dateLabel(r.date))}</span><span>${esc(valText(t, r.value))}${serie.length > 1 && r === best ? ' · tu mejor' : ''}</span></li>`).join('')}</ul>
      ${serie.length > shown.length ? `<p class="small muted" style="margin:0">${serie.length} mediciones en total; se muestran las ${shown.length} últimas.</p>` : ''}
    </div>`;
  }).join('');

  const warn = hasDemoData() ? `<div class="note warn small" style="margin:0">${esc(DEMO_WARN)}</div>` : '';
  box.innerHTML = `<div class="lbl">Tu avance</div>${warn}${dueHtml}${idxHtml}${tests}`;
}

/* ------------------------------------------------------------------ perfil */

function renderProfile() {
  const parts = {};
  for (const t of ORDER) {
    const r = S.results[t];
    if (r) { try { parts[t] = classify(t, r.value, r.profile || S.profile); } catch { parts[t] = null; } }
  }
  const prof = fitnessProfile({ pushup: parts.pushup || null, squat: parts.squat || null, plank: parts.plank || null });
  const done = Object.values(parts).filter(Boolean).length;
  $('prof-sub').textContent = `${profileTag()}. ${done ? `${done} de 3 pruebas hechas.` : 'Todavía no haces ninguna prueba.'}`;
  const ov = $('prof-overall');
  if (prof?.position == null) {
    const fuera = S.profile.age != null && !coversAge(S.profile.age);
    ov.innerHTML = `<div class="lbl">Índice FitGram</div><p style="margin:0">${fuera
      ? `Los baremos van de ${AGE_RANGE.min} a ${AGE_RANGE.max} años. Con ${S.profile.age} no hay tabla, así que no hay índice; abajo están tus resultados en bruto.`
      : 'Completa al menos una prueba para ver dónde te ubicas.'}</p>`;
  } else {
    const bands = ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'];
    ov.innerHTML = `<div class="lbl">Índice FitGram${done < 3 ? ` · con ${done} de 3 pruebas` : ''}</div>
      <div class="overall-top"><span class="overall-val">${prof.position}<span class="result-unit">/100</span></span><span class="overall-lbl">${esc(prof.label)}</span></div>
      <div class="scale" aria-hidden="true"><div class="track">${bands.map(() => '<i></i>').join('')}</div><div class="pin" style="left:${clamp(prof.position, 0, 100)}%"></div></div>
      <div class="scale-lbls" aria-hidden="true">${bands.map((b) => `<span>${b}</span>`).join('')}</div>`;
  }
  $('prof-rows').innerHTML = ORDER.map((t) => {
    const T = TESTS[t], r = S.results[t], c = parts[t];
    const meter = c ? `<div class="meter">${Array.from({ length: c.category.of }, (_, i) => `<i class="${i <= c.category.index ? 'on' : ''}"></i>`).join('')}</div><div class="lbl" style="font-size:12px;text-align:center;color:var(--ink)">${esc(c.category.label)}</div>` : '<div class="lbl" style="font-size:12px;text-align:center">Pendiente</div>';
    return `<div class="prof-row"><div style="min-width:0"><div style="font-weight:600">${esc(T.name)}</div><div class="small muted">${esc(T.measures)}${c ? ` · ${esc(c.source.short)}` : ''}</div></div><div class="prof-val">${r ? esc(resultText(t, r.value)) : '—'}</div><div style="display:flex;flex-direction:column;gap:4px">${meter}</div></div>`;
  }).join('');
  $('prof-note').textContent = prof?.note || 'Índice exploratorio de FitGram: promedia posiciones de baremos distintos; no es un puntaje validado.';
  const srcs = ORDER.map((t) => sourceOf(t)).filter((s) => s.apa);
  $('prof-src').innerHTML = srcs.map((s) => `<div style="margin-bottom:8px">${esc(s.apa)} ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : ''}</div>`).join('');
  renderProgress();
  renderHistList();
  $('btn-prof-eval').textContent = nextPending() ? `Seguir · ${TESTS[nextPending()].short}` : 'Repetir una prueba';
  $('btn-prof-eval').onclick = () => (nextPending() ? openIntro(nextPending()) : show('hub'));
}

/** Todas las mediciones guardadas, la más nueva primero, con su botón de borrar (HU-38). */
function renderHistList() {
  const rows = [];
  for (const t of ORDER) for (const r of S.history?.[t] || []) rows.push({ t, r });
  rows.sort((a, b) => String(b.r.date).localeCompare(String(a.r.date)));
  $('prof-hist-list').innerHTML = rows.length
    ? rows.map(({ t, r }) => `<div class="prof-row" style="grid-template-columns:1fr auto auto">
        <div style="min-width:0"><div style="font-weight:600">${esc(TESTS[t].short)}</div><div class="small muted">${esc(dateLabel(r.date))}</div></div>
        <div class="prof-val">${esc(resultText(t, r.value))}</div>
        <button class="icon-btn" type="button" data-del-test="${esc(t)}" data-del-date="${esc(r.date)}" aria-label="Borrar ${esc(TESTS[t].short)} del ${esc(dateLabel(r.date))}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>`).join('')
    : '<p class="small muted" style="margin:0">Todavía no hay mediciones guardadas.</p>';
  $('btn-exp-csv').disabled = $('btn-exp-json').disabled = !rows.length;
}

function describeForCsv(t, r) {
  let c = null;
  try { c = classify(t, r.value, r.profile || S.profile); } catch { c = null; }
  return { unidad: TESTS[t].unit === 's' ? 's' : 'rep', categoria: c?.category.label || '', tabla: c ? c.source.short : '', banda: c ? (t === 'plank' ? 'universitarios' : c.band || '') : '' };
}

/* ------------------------------------------------------------------ validación */

let vTest = ORDER[0];
/* Lo que hay que resolver antes de guardar (duplicado), lo que se puede
   deshacer (borrado) y cuándo se exportó por última vez. Todo de pantalla:
   nada de esto es dato de la validación. */
let vPending = null;
let vUndo = null;
/* La corrida que quedó de la prueba recién hecha, para adjuntarla a la
   medición. Lleva su prueba: si se cambia el selector ya no corresponde. */
let vRun = null;
let vExportedAt = loadValidExport();
const stamp = () => new Date().toISOString().slice(0, 10);

function renderValidForm() {
  const seg = $('v-test');
  seg.innerHTML = '';
  for (const t of ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = TESTS[t].short;
    b.setAttribute('aria-pressed', String(t === vTest));
    b.addEventListener('click', () => { vTest = t; renderValidForm(); });
    seg.appendChild(b);
  }
  $('v-unit-hint').textContent = TESTS[vTest].unit === 's'
    ? 'Segundos que cada uno cronometró en posición. Se admiten decimales.'
    : 'Repeticiones que cada uno contó como válidas, sobre la misma serie.';
  renderValidPerson();
  renderValidRun();
}

/**
 * Qué pruebas lleva ya la persona que está escrita en el campo.
 * En terreno uno va con el teléfono en una mano y pierde la cuenta de a quién
 * le falta qué; esto lo deja a la vista sin tener que buscar en la lista.
 */
function renderValidPerson() {
  const dl = $('v-codes');
  dl.innerHTML = Val.participantCodes(S.valid).map((c) => `<option value="${esc(c)}"></option>`).join('');

  const code = $('v-part').value.trim().toUpperCase();
  const hint = $('v-part-done');
  if (!code) {
    hint.textContent = 'Un código, no el nombre: el protocolo es anónimo.';
    return;
  }
  const done = Val.testsDoneBy(S.valid, code, ORDER);
  if (!done.length) {
    hint.textContent = `${code}: primera medición.`;
    return;
  }
  const falta = ORDER.filter((t) => !done.includes(t)).map((t) => TESTS[t].short);
  hint.textContent = `${code}: ya tiene ${done.map((t) => TESTS[t].short).join(', ')}`
    + (falta.length ? ` · falta ${falta.join(', ')}.` : ' · están las tres.');
}

/** Esconde lo que quedó de la medición anterior. */
function vClearNotices() {
  vPending = null;
  $('v-dup').hidden = true;
  $('v-saved').hidden = true;
  validError(null);
}

/** Bloque de una prueba en el resumen de acuerdo. */
function statBlock(test, s) {
  if (!s) return '';
  const T = TESTS[test];
  const u = T.unit === 's' ? ' s' : ' rep';
  const loa = s.loA ? `límites ${Val.numCL(s.loA[0], 1)} a ${Val.numCL(s.loA[1], 1)}${u}` : 'faltan datos para los límites';
  // Si los dos humanos no coinciden entre sí, no hay patrón contra el cual comparar.
  const warn = s.raters && s.raters.relAgreement < 95
    ? '<div class="small" style="color:var(--warn)">Los dos evaluadores difieren entre sí más que la meta. Sin un patrón humano estable, el acuerdo de la app es difícil de interpretar.</div>'
    : '';
  return `<div class="stat">
    <div class="stat-head"><span class="lbl" style="color:var(--ink)">${esc(T.short)}</span><span class="stat-v">${Val.numCL(s.relAgreement, 1)} %</span></div>
    <div class="small">${s.n} ${s.n === 1 ? 'medición' : 'mediciones'} · ${s.people} ${s.people === 1 ? 'persona' : 'personas'}${s.within1 == null ? '' : ` · ${Val.numCL(s.within1, 0)} % dentro de ±1`}</div>
    <div class="small">Sesgo ${s.bias > 0 ? '+' : ''}${Val.numCL(s.bias, 2)}${u} (${loa})${s.icc != null ? ` · CCI(2,1) ${Val.numCL(s.icc, 2)}${ic(s.iccCI)}${s.iccReliable ? '' : ' <span class="muted">(pocos sujetos: tómalo con pinzas)</span>'}` : ''}</div>
    ${s.raters ? `<div class="small muted">Entre evaluadores: ${Val.numCL(s.raters.relAgreement, 1)} % de acuerdo${s.raters.icc != null ? `, CCI ${Val.numCL(s.raters.icc, 2)}${ic(s.raters.iccCI)}` : ''}.</div>` : ''}
    ${warn}
  </div>`;
}

/**
 * El intervalo de confianza, al lado del CCI.
 *
 * Un CCI solo suena más firme de lo que es. Con quince personas el intervalo
 * es ancho, y ese ancho es parte del resultado: es lo que responde «¿y cuánta
 * gente harían falta?» con un número en vez de con una intuición.
 */
function ic(par) {
  // Dos decimales fijos: «0,94–1» al lado de «0,94» se lee como si el extremo
  // alto fuera otra cosa, y este es el número principal del estudio.
  const dos = (v) => v.toFixed(2).replace('.', ',');
  return Array.isArray(par) ? ` <span class="muted">(IC 95 %: ${dos(par[0])}–${dos(par[1])})</span>` : '';
}

const VALID_TARGET = 15; // la hoja de ruta compromete 15 personas

/** La unidad de cada prueba: marca cuáles son cronometradas. */
function unitsByTest() {
  return Object.fromEntries(ORDER.map((t) => [t, TESTS[t].unit]));
}

/**
 * El desglose de las diferencias, que es lo que de verdad hay que poder
 * responder. Un 95 % de acuerdo no dice nada por sí solo: la pregunta es qué
 * pasa en el resto, y no es lo mismo que a la app se le escape una repetición
 * a que la haya rechazado por técnica y el evaluador la haya contado igual.
 */
function renderBreakdown() {
  const b = Val.breakdown(S.valid, ORDER, unitsByTest());
  const dif = b.total - b.acuerdo;
  if (!b.total || !dif) return '';
  const linea = (n, txt) => (n ? `<div class="small">${n} ${txt}</div>` : '');
  const motivos = Val.topReasons(S.valid).slice(0, 3);
  return `<div style="border-top:1px solid var(--line);padding-top:10px">
    <div class="lbl">En qué consisten las diferencias</div>
    <div class="small muted" style="margin-bottom:6px">${dif} de ${b.total} mediciones de repeticiones no coinciden con el promedio de los evaluadores.</div>
    ${linea(b.criterio, 'por criterio: la app las vio y las descartó por técnica, el evaluador las contó.')}
    ${linea(b.interrumpida, 'interrumpidas: hubo un rato en que la app no estaba mirando.')}
    ${linea(b.noDetectadas, 'no detectadas: se le escaparon a la app.')}
    ${linea(b.deMas, 'de más: la app contó repeticiones que el evaluador no contó.')}
    ${linea(b.sinDato, 'sin dato: se tecleó a mano, sin la corrida de la app.')}
    ${motivos.length ? `<div class="small muted" style="margin-top:6px">Lo que más descarta la app: ${motivos.map(([m, n]) => `${esc(m)} (${n})`).join(', ')}.</div>` : ''}
  </div>`;
}

function renderValid() {
  renderValidForm();
  const units = unitsByTest();
  const sum = Val.summary(S.valid, ORDER, units);
  const box = $('valid-summary');
  if (!sum.overall) {
    box.innerHTML = `<div class="lbl">Acuerdo con los evaluadores</div>
      <p class="small" style="margin:0">Todavía no hay mediciones. Para cada persona y cada prueba: el conteo que entregó FitGram y el que contó cada evaluador, sobre la misma serie.</p>`;
  } else {
    const o = sum.overall;
    const falta = Math.max(0, VALID_TARGET - o.people);
    box.innerHTML = `<div class="lbl">Acuerdo con los evaluadores</div>
      <div class="result-head">
        <div><span class="result-big">${Val.numCL(o.relAgreement, 1)}</span><span class="result-unit">% de acuerdo</span></div>
        <div class="result-cat">${o.people}/${VALID_TARGET}</div>
      </div>
      <div class="small">${o.n} ${o.n === 1 ? 'medición' : 'mediciones'} en ${o.people} ${o.people === 1 ? 'persona' : 'personas'}${o.counted ? ` · en las de repeticiones, ${Val.numCL(o.within1, 0)} % dentro de ±1 y ${Val.numCL(o.exact, 0)} % exacto` : ''}</div>
      ${falta
        ? `<div class="small muted">Faltan ${falta} ${falta === 1 ? 'persona' : 'personas'} para la muestra de la etapa 1.</div>`
        : '<div class="small">Se completó la muestra de 15 personas de la etapa 1.</div>'}
      <div>${ORDER.map((t) => statBlock(t, sum.byTest[t])).join('')}</div>
      ${renderBreakdown()}
      <div class="small muted">El acuerdo es 100 % menos la diferencia contra el promedio de los evaluadores, relativa a ese promedio. El total no promedia sesgos: mezclaría repeticiones con segundos.</div>`;
  }

  const list = $('valid-list');
  if (!S.valid.length) {
    list.innerHTML = '<p class="small muted" style="margin:0">Nada guardado todavía.</p>';
  } else {
    const rows = S.valid.slice().sort((a, b) => a.participant.localeCompare(b.participant) || ORDER.indexOf(a.test) - ORDER.indexOf(b.test));
    list.innerHTML = rows.map((r) => {
      const u = TESTS[r.test]?.unit === 's' ? ' s' : '';
      const d = r.app - Val.mean(r.raters);
      const dir = d === 0 ? 'same' : Math.abs(d) <= 1 ? 'up' : 'down';
      const KIND = { criterio: 'criterio', interrumpida: 'interrumpida', noDetectadas: 'no detectada', deMas: 'de más', sinDato: 'sin corrida' };
      const kind = KIND[Val.classifyRecord(r, TESTS[r.test]?.unit === 's')] || '';
      return `<div class="vrow">
        <span><strong>${esc(r.participant)}</strong> <span class="muted">· ${esc(TESTS[r.test]?.short || r.test)}${kind ? ` · ${kind}` : ''}</span>${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</span>
        <span>${esc(Val.numCL(r.app, 1))}${u} <span class="muted">vs ${esc(r.raters.map((x) => Val.numCL(x, 1)).join(' / '))}</span> <span class="delta-inline ${dir}">${d > 0 ? '+' : ''}${esc(Val.numCL(d, 1))}</span></span>
        <button class="x" type="button" data-del="${esc(r.id)}" aria-label="Borrar la medición de ${esc(r.participant)}">×</button>
      </div>`;
    }).join('');
    for (const b of list.querySelectorAll('[data-del]')) {
      b.addEventListener('click', () => {
        const r = S.valid.find((x) => x.id === b.dataset.del);
        vUndo = {
          records: S.valid,
          label: r ? `${r.participant} · ${TESTS[r.test]?.short || r.test}` : 'la medición',
        };
        S.valid = Val.removeRecord(S.valid, b.dataset.del);
        saveValid();
        renderValid();
      });
    }
  }
  $('v-clear-n').textContent = String(S.valid.length);

  // Si durante el estudio cambió algún umbral de conteo, las mediciones de
  // antes y las de después no son comparables. Sin esto, el CSV parecería una
  // sola tanda de 45 filas.
  const reglas = Val.reglasUsadas(S.valid);
  const rg = $('v-reglas');
  rg.hidden = reglas.length < 2;
  if (reglas.length >= 2) {
    rg.textContent = `Ojo: hay mediciones tomadas con ${reglas.length} versiones distintas de las reglas de conteo`
      + ` (${reglas.join(', ')}). No son comparables entre sí sin decirlo en el informe.`;
  }

  $('v-undo').hidden = !vUndo;
  if (vUndo) $('v-undo-msg').textContent = `Se borró ${vUndo.label}.`;

  // Todo esto vive solo en este navegador. Si no se exportó, no hay respaldo.
  const sinRespaldo = Val.unexportedCount(S.valid, vExportedAt);
  const bk = $('v-backup');
  bk.hidden = !S.valid.length;
  bk.classList.toggle('warn', sinRespaldo > 0);
  if (S.valid.length) {
    const hora = vExportedAt ? new Date(vExportedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    bk.textContent = sinRespaldo
      ? (hora
        ? `${sinRespaldo} ${sinRespaldo === 1 ? 'medición' : 'mediciones'} sin exportar desde las ${hora}. Exporta antes de cerrar.`
        : `${sinRespaldo} ${sinRespaldo === 1 ? 'medición' : 'mediciones'} sin exportar: todavía no hay respaldo de nada.`)
      // Que el navegador haya iniciado la descarga no prueba que el archivo
      // quedó guardado, sobre todo en iOS. Por eso no se dice "a salvo".
      : `Exportado a las ${hora}. Revisa que el archivo haya quedado en el teléfono.`;
  }
}

function validError(msg) {
  const e = $('v-error');
  e.hidden = !msg;
  e.textContent = msg || '';
}

function saveValidRecord() {
  let rec;
  try {
    rec = Val.newRecord({
      participant: $('v-part').value,
      test: vTest,
      app: $('v-app').value,
      raters: [$('v-r1').value, $('v-r2').value],
      note: $('v-note').value,
      run: runEnUso(),
    });
  } catch (err) {
    vPending = null;
    $('v-dup').hidden = true;
    validError(err?.message || 'No se pudo guardar.');
    return;
  }

  // Dos mediciones de la misma persona en la misma prueba pesan doble en el
  // acuerdo. Puede ser una repetición legítima o puede ser que se perdió la
  // cuenta: no lo decide el código, lo decide quien está tomando los datos.
  const dup = Val.findDuplicate(S.valid, rec.participant, rec.test);
  if (dup) {
    vPending = { rec, dupId: dup.id };
    const u = TESTS[dup.test]?.unit === 's' ? ' s' : '';
    $('v-dup-msg').textContent = `${dup.participant} ya tiene una medición en ${TESTS[dup.test]?.short || dup.test}:`
      + ` ${Val.numCL(dup.app, 1)}${u} contra ${dup.raters.map((x) => Val.numCL(x, 1)).join(' / ')}.`
      + ' ¿Reemplazarla o guardar las dos?';
    $('v-dup').hidden = false;
    validError(null);
    $('v-saved').hidden = true;
    return;
  }
  commitValidRecord(rec, null);
}

/** Guarda de verdad y prepara el formulario para la siguiente prueba de la misma persona. */
function commitValidRecord(rec, replaceId) {
  S.valid = replaceId ? Val.replaceRecord(S.valid, replaceId, rec) : Val.addRecord(S.valid, rec);
  saveValid();
  vPending = null;
  vUndo = null;
  $('v-dup').hidden = true;
  validError(null);

  for (const id of ['v-app', 'v-r1', 'v-r2', 'v-note']) $(id).value = '';
  vRun = null;  // pertenecía a esa serie y ya se guardó
  $('v-part').value = rec.participant; // tal como quedó guardado, no como se tecleó
  // El código se queda: lo normal es tomarle las tres pruebas a la misma
  // persona de corrido, y volver a escribirlo cada vez es la forma más fácil
  // de inventar un participante que no existe (P1 y P01 serían dos personas).
  const sigue = Val.nextPendingTest(S.valid, rec.participant, ORDER, rec.test);
  if (sigue) vTest = sigue;

  $('v-saved-msg').textContent = `Guardado: ${rec.participant} · ${TESTS[rec.test]?.short || rec.test}.`
    + (sigue ? ` Sigue ${TESTS[sigue].short}.` : ' A esta persona ya están las tres.');
  $('v-saved').hidden = false;

  renderValid();
  const foco = sigue ? 'v-app' : 'v-part';
  $(foco).focus();
  if (foco === 'v-part') $('v-part').select();
}

/**
 * Abre el modo validación con la prueba y el conteo de la app ya puestos.
 * `result` es la corrida recién hecha, para adjuntarle lo que la app descartó.
 */
function openValid(test, appValue, result) {
  if (!S.settings.valid) { S.settings.valid = true; saveStore(); }
  if (test && ORDER.includes(test)) vTest = test;
  vUndo = null;
  vRun = result && test ? { test, run: Val.runFromResult(result) } : null;
  show('valid');
  vClearNotices();
  if (appValue != null) $('v-app').value = Val.numCL(appValue, 1);
  renderValidRun();
  $('v-part').focus();
}

/** La corrida solo vale para la prueba de la que salió. */
function runEnUso() {
  return vRun && vRun.test === vTest ? vRun.run : null;
}

/**
 * Qué descartó la app en esa serie.
 * Es lo que después permite distinguir una repetición que se le escapó de una
 * que vio y rechazó por técnica mientras el evaluador la contaba igual.
 */
function renderValidRun() {
  const box = $('v-run');
  const run = runEnUso();
  box.hidden = !run;
  if (run) {
    const motivos = Object.entries(run.reasons || {}).sort((a, b) => b[1] - a[1]);
    box.textContent = motivos.length
      ? `Se guarda junto con la medición lo que la app descartó en esa serie: `
        + motivos.map(([m, n]) => `${m} ×${n}`).join(', ') + '.'
      : 'Se guarda junto con la medición que la app no descartó ningún intento en esa serie.';
  }
  renderRescate(!!run);
}

/** La última medición de esta prueba guardada en el teléfono, si sirve de corrida. */
function ultimaCorrida() {
  const r = S.results[vTest];
  return r && !hasDemoData() && Array.isArray(r.log) ? r : null;
}

/**
 * Ofrecer la corrida de una medición que ya se tomó.
 *
 * La corrida se adjuntaba solo viniendo desde la pantalla de resultado. Si se
 * salía de ahí —alguien tocó «Volver», se recargó la página, el teléfono pasó
 * a otra mano— no había forma de volver a ella y la medición quedaba sin
 * diagnóstico, aunque el resultado siguiera guardado acá mismo.
 *
 * No se adjunta sola: cuál persona hizo esa serie la app no lo sabe. Se
 * muestra la hora y el número para que quien tomó los datos lo reconozca, y
 * se avisa si esa misma corrida ya está en otra medición, porque adjuntarla
 * dos veces dejaría el diagnóstico mal en las dos.
 */
function renderRescate(yaHayRun) {
  const box = $('v-rescate');
  const r = yaHayRun ? null : ultimaCorrida();
  box.hidden = !r;
  if (!r) return;
  const hora = new Date(r.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const usada = Val.runYaUsada(S.valid, r.date);
  box.classList.toggle('warn', !!usada);
  $('v-rescate-msg').textContent =
    `La última ${TESTS[vTest].short} medida en este teléfono fue a las ${hora} y dio ${resultText(vTest, r.value)}.`
    + (usada
      ? ` Ojo: esa corrida ya está guardada en la medición de ${usada.participant}. Si la adjuntas acá también, el diagnóstico queda mal en las dos.`
      : ' Si es la de esta persona, adjúntala y se guarda con lo que la app descartó.');
}

function downloadText(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) {
    validError(`No se pudo exportar: ${e?.message || e}`);
    return false;
  }
}

/** Marca que hay respaldo, solo si la descarga partió. */
/**
 * Carga un respaldo exportado antes y lo junta con lo que ya hay.
 *
 * Exportar sin poder volver a cargar es una puerta de salida sin entrada: si
 * el navegador limpia los datos o hay que seguir desde otro equipo, el archivo
 * no sirve de nada. Nunca reemplaza lo que está en el teléfono; ver
 * `Val.mergeRecords`.
 */
async function cargarRespaldo(file) {
  const aviso = $('v-loaded');
  const decir = (txt, mal) => { aviso.hidden = false; aviso.classList.toggle('warn', !!mal); aviso.textContent = txt; };
  let datos;
  try {
    datos = JSON.parse(await file.text());
  } catch {
    decir('No pude leer ese archivo. Tiene que ser el JSON que exporta esta misma pantalla, no el CSV.', true);
    return;
  }
  const r = Val.mergeRecords(S.valid, datos);
  if (!r.agregadas && !r.yaEstaban && !r.invalidas) {
    decir('Ese archivo no traía ninguna medición. No se tocó nada.', true);
    return;
  }
  S.valid = r.records;
  saveValid();
  renderValid();
  const partes = [];
  if (r.agregadas) partes.push(`${r.agregadas} ${r.agregadas === 1 ? 'medición nueva' : 'mediciones nuevas'}`);
  if (r.yaEstaban) partes.push(`${r.yaEstaban} que ya ${r.yaEstaban === 1 ? 'estaba' : 'estaban'}`);
  if (r.invalidas) partes.push(`${r.invalidas} que no pude leer`);
  let txt = `Cargado: ${partes.join(', ')}. No se borró nada de lo que ya había.`;
  if (r.chocan.length) {
    const lista = r.chocan.slice(0, 4).map((c) => `${c.participant} ${TESTS[c.test]?.short || c.test}`).join(', ');
    txt += ` Ojo: ${r.chocan.length} ${r.chocan.length === 1 ? 'choca' : 'chocan'} con una medición que ya existía`
      + ` del mismo participante y prueba (${lista}${r.chocan.length > 4 ? '…' : ''}). Quedaron las dos: revisa cuál vale.`;
  }
  decir(txt, r.chocan.length > 0 || r.invalidas > 0);
}

function exportValid(name, text, type) {
  if (!downloadText(name, text, type)) return;
  vExportedAt = new Date().toISOString();
  saveValidExport(vExportedAt);
  renderValid();
}

/** Pide la cámara. Compartido por las pruebas y por el modo juego. */
async function openCameraStream(facing) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw new Error('getUserMedia no disponible');
  return md.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
}

/* ------------------------------------------------------------------ sin conexión */

/* El service worker (sw.js) guarda la app en el teléfono. Acá va solo la parte
   de la página: registrarlo, mostrar el avance y avisar cuando hay una versión
   nueva, en vez de cambiarla por debajo mientras alguien está en una prueba. */

let swReg = null;

const offlineInfo = (msg) => { $('offline-info').textContent = msg; };

function swMsg(type) {
  (navigator.serviceWorker?.controller || swReg?.active)?.postMessage({ type });
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) {
    offlineInfo('Este navegador no permite guardar la app para usarla sin conexión.');
    $('btn-offline').disabled = true;
    return;
  }

  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d?.type !== 'offline') return;
    if (d.estado === 'avance') offlineInfo(`Descargando… ${d.hechos} de ${d.total}`);
    else if (d.estado === 'listo') offlineInfo('Listo: la app abre y mide sin conexión, incluso en modo avión.');
    else if (d.estado === 'parcial') offlineInfo(d.hechos ? `Guardados ${d.hechos} de ${d.total} archivos pesados.` : 'Todavía no está guardada para usarla sin conexión.');
    else if (d.estado === 'error') offlineInfo(`No se pudo preparar: ${d.detalle}`);
    if (d.estado !== 'avance') $('btn-offline').disabled = false;
  });

  // Si ya había un worker al cargar, un cambio de control significa versión nueva activada.
  const teniaControl = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControl || recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    swReg = reg;
    if (reg.waiting) $('update-bar').hidden = false;
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) $('update-bar').hidden = false;
      });
    });
    return navigator.serviceWorker.ready;
  }).then((reg) => {
    reg.active?.postMessage({ type: 'estadoOffline' });
  }).catch((e) => {
    offlineInfo(`No se pudo activar: ${e?.message || e}`);
  });
}

/* ------------------------------------------------------------------ ensayo antes de presentar */

/* Una lista de chequeo para correr en el equipo del pitch (la Lenovo Tab P12) antes de presentar. Cada punto dice
   ok / ojo / falla y qué hacer. No guarda nada. */
const Ensayo = {
  corriendo: false,
  async run() {
    if (this.corriendo) return;
    this.corriendo = true;
    const ul = $('ensayo-out'), btn = $('btn-ensayo');
    btn.disabled = true; ul.innerHTML = '';
    const poner = (nivel, titulo, detalle) => {
      const li = document.createElement('li');
      li.className = nivel;
      li.innerHTML = `<span class="i" aria-hidden="true">${nivel === 'ok' ? '✓' : nivel === 'warn' ? '!' : '✕'}</span><span><b>${esc(titulo)}</b> · ${esc(detalle)}</span>`;
      li.setAttribute('aria-label', `${nivel === 'ok' ? 'Bien' : nivel === 'warn' ? 'Ojo' : 'Falla'}: ${titulo}. ${detalle}`);
      ul.appendChild(li);
    };
    let stream = null;
    try {
      // 1. Sitio seguro (sin HTTPS no hay cámara ni sensores)
      if (window.isSecureContext === false) poner('bad', 'Conexión', 'El sitio no es seguro (HTTPS): la cámara no va a funcionar. Abre la app desde dief-ysis.github.io/fitgram.');
      else poner('ok', 'Conexión', 'Sitio seguro.');
      // 2. Cámara
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      try {
        stream = await openCameraStream(S.settings.facing);
        v.srcObject = stream; await v.play().catch(() => {});
        await waitFor(() => v.videoWidth > 0, 4000);
        const s = stream.getVideoTracks()[0]?.getSettings?.() || {};
        poner(v.videoWidth >= 640 ? 'ok' : 'warn', 'Cámara', `${v.videoWidth}×${v.videoHeight}${s.frameRate ? `, ${Math.round(s.frameRate)} cuadros/s` : ''} (${S.settings.facing === 'user' ? 'frontal' : 'trasera'}).`);
      } catch (e) {
        const m = cameraErrorMessage(e, { secure: window.isSecureContext !== false });
        poner('bad', 'Cámara', `${m.title}. ${m.detail}`);
      }
      // 3. Detector y velocidad
      try {
        await Engine.load(S.settings.model, () => {});
        if (v.videoWidth) {
          const ms = [];
          for (let i = 0; i < 25; i++) {
            const t0 = performance.now();
            Engine.detect(v, performance.now(), v.videoWidth / v.videoHeight);
            ms.push(performance.now() - t0);
            await new Promise((r) => requestAnimationFrame(r));
          }
          const prom = ms.slice(5).reduce((a, b) => a + b, 0) / (ms.length - 5);
          const fps = Math.min(30, 1000 / Math.max(prom, 1));
          poner('ok', 'Detector', Engine.info());
          poner(fps >= 15 ? 'ok' : 'warn', 'Velocidad', `unos ${Math.round(fps)} cuadros por segundo (${Math.round(prom)} ms por cuadro).${fps < 15 ? (S.settings.model === 'lite' ? ' Está bajo 15: cierra otras apps y vuelve a probar.' : ' Está bajo 15: prueba el modelo «Rápido».') : ''}`);
        } else poner('warn', 'Detector', `${Engine.info()}. Sin cámara no se pudo medir la velocidad.`);
      } catch (e) { poner('bad', 'Detector', `No cargó: ${e?.message || e}`); }
      // 4. Sensores
      try {
        await Sensors.requestPermission();
        const est = createTiltEstimator({ facing: S.settings.facing });
        Sensors.start(est, { facing: S.settings.facing });
        await new Promise((r) => setTimeout(r, 1500));
        const st = est.state(performance.now()); Sensors.stop();
        const ok = st.sensors.orientation || st.sensors.accelerometer;
        const t = st.lastStill || st.tilt;
        poner(ok ? 'ok' : 'warn', 'Sensores', ok ? `responden${t && Number.isFinite(t.roll) ? `; inclinación ahora: ${Math.round(Math.abs(t.roll))}°` : ''}.` : (Sensors.permission === 'denied' ? 'permiso rechazado: la inclinación se estimará con la postura.' : 'no responden: la inclinación se estimará con la postura.'));
      } catch { poner('warn', 'Sensores', 'no se pudieron leer: la inclinación se estimará con la postura.'); }
      // 5. Voz
      const hayVoz = 'speechSynthesis' in window;
      poner(hayVoz && Voice.voice ? 'ok' : hayVoz ? 'warn' : 'bad', 'Voz',
        !hayVoz ? 'este navegador no habla: los avisos serán solo en pantalla.'
          : Voice.voice ? `voz en español (${Voice.voice.lang}).${S.settings.voice ? ' Sube el volumen del equipo.' : ' Está apagada en Ajustes.'}`
            : 'no hay voz en español instalada; puede hablar con acento o en otro idioma.');
      // 6. Sin conexión
      try {
        const keys = (await caches.keys()).filter((k) => k.endsWith('-heavy'));
        let n = 0;
        for (const k of keys) n += (await (await caches.open(k)).keys()).length;
        poner(n >= 3 ? 'ok' : 'warn', 'Sin conexión', n >= 3 ? 'el detector y los modelos están guardados: funciona en modo avión.' : 'todavía no está preparada: toca «Preparar para usar sin conexión» abajo, con wifi.');
      } catch { poner('warn', 'Sin conexión', 'no se pudo revisar.'); }
      // 7. Batería y pantalla
      try {
        const b = await navigator.getBattery?.();
        if (b) poner(b.level >= 0.5 || b.charging ? 'ok' : 'warn', 'Batería', `${Math.round(b.level * 100)} %${b.charging ? ', cargando' : ''}.${b.level < 0.5 && !b.charging ? ' Cárgala antes de presentar.' : ''}`);
      } catch { /* sin dato de batería */ }
      poner('wakeLock' in navigator ? 'ok' : 'warn', 'Pantalla', 'wakeLock' in navigator ? 'la app mantiene la pantalla encendida durante la prueba.' : 'este navegador puede apagar la pantalla: súbele el tiempo de apagado.');
    } finally {
      try { for (const tr of stream?.getTracks() || []) tr.stop(); } catch { /* ignore */ }
      $('engine-info').textContent = Engine.info();
      btn.disabled = false; this.corriendo = false;
    }
  },
};

/* ------------------------------------------------------------------ modo juego */

/* Idea de Elias Hermosilla (KineVision). La lógica del juego vive en el módulo
   "game"; acá va la cámara, la calibración y el dibujo. Reusa el mismo detector
   de pose que las pruebas, así que no hay un segundo motor ni una segunda forma
   de medir lo mismo. */

const FOCUS_DESC = {
  hipertrofia: 'Sostenidos arriba y bajadas controladas.',
  fuerza: 'Isométricos largos y recorridos completos.',
  potencia: 'Empujes rápidos, sin pausa arriba.',
  resistencia: 'Muchas repeticiones a media altura.',
};

const Game = {
  focus: 'hipertrofia',
  phase: 'idle',   // 'idle' | 'cal-abajo' | 'cal-arriba' | 'jugando' | 'fin'
  stream: null, raf: 0, sid: 0, state: null, cal: null, norm: 0.2,
  cw: 0, ch: 0, dpr: 1,

  msg(t) { $('game-msg').textContent = t || ''; },
  cue(t) { $('game-cue').textContent = t || ''; },
  hud(izq, der) { $('game-hud').innerHTML = `<span>${esc(izq || '')}</span><span>${esc(der || '')}</span>`; },

  open() {
    this.teardown();
    this.renderFocus();
    $('game-setup').hidden = false;
    $('game-stage').hidden = true;
    $('game-result').hidden = true;
    show('game');
  },

  renderFocus() {
    const box = $('game-focus');
    box.innerHTML = '';
    for (const k of Object.keys(Gm.SEQUENCES)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pill'; b.textContent = Gm.FOCUS_LABEL[k];
      b.setAttribute('aria-pressed', String(k === this.focus));
      b.addEventListener('click', () => { this.focus = k; this.renderFocus(); });
      box.appendChild(b);
    }
    $('game-focus-desc').textContent = FOCUS_DESC[this.focus] || '';
  },

  stopStream() {
    try { for (const t of this.stream?.getTracks() || []) t.stop(); } catch { /* ignore */ }
    this.stream = null;
    const v = $('game-video');
    if (v) { try { v.pause(); } catch { /* ignore */ } v.srcObject = null; }
  },

  teardown() {
    this.sid++;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.phase = 'idle';
    this.state = null;
    this.stopStream();
    WakeLock.off();
  },

  resize() {
    const c = $('game-canvas');
    const r = c.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(1, Math.round(r.width));
    this.ch = Math.max(1, Math.round(r.height));
    c.width = Math.round(this.cw * this.dpr);
    c.height = Math.round(this.ch * this.dpr);
  },

  async start() {
    const sid = ++this.sid;
    $('game-setup').hidden = true;
    $('game-stage').hidden = false;
    $('game-result').hidden = true;
    this.cue(''); this.hud('', '');
    this.msg('Pidiendo la cámara…');
    try {
      this.stream = await openCameraStream('user');
      if (sid !== this.sid) { this.stopStream(); return; }
      const v = $('game-video');
      v.srcObject = this.stream; v.muted = true; v.playsInline = true;
      await v.play().catch(() => {});
      await waitFor(() => v.videoWidth > 0, 4000);
      if (sid !== this.sid) return;
      this.msg('Cargando el detector…');
      await Engine.load(S.settings.model, (stage, l, t) => {
        this.msg(stage === 'model'
          ? `Descargando el detector… ${num(l / 1e6, 0)} de ${t ? num(t / 1e6, 0) : '?'} MB`
          : 'Iniciando el motor…');
      });
      if (sid !== this.sid) return;
      WakeLock.on();
      this.resize();
      this.cal = { abajo: [], arriba: [] };
      this.phase = 'cal-abajo';
      this.msg('Dos pasos de calibración y empieza.');
      this.loop();
    } catch (e) {
      console.warn(e);
      const m = cameraErrorMessage(e, { secure: typeof window !== 'undefined' ? window.isSecureContext !== false : true });
      this.msg(`${m.title}. ${m.detail}`);
      this.cue('');
      this.phase = 'idle';
    }
  },

  loop() {
    const sid = this.sid;
    const v = $('game-video');
    let last = performance.now();
    const tick = () => {
      if (sid !== this.sid) return;
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      let wrist = null, shoulder = null;
      if (v.videoWidth) {
        let frame = null;
        try { frame = Engine.detect(v, now, v.videoWidth / v.videoHeight); } catch (e) { console.warn(e); }
        if (frame) {
          const { j2 } = toJoints(frame);
          const lw = j2.l_wrist, rw = j2.r_wrist, ls = j2.l_shoulder, rs = j2.r_shoulder;
          if ([lw, rw, ls, rs].every((q) => q && q.v >= 0.5 && Number.isFinite(q.y))) {
            wrist = (lw.y + rw.y) / 2;
            shoulder = (ls.y + rs.y) / 2;
          }
        }
      }
      this.step(dt, wrist, shoulder);
      this.draw();
    };
    this.raf = requestAnimationFrame(tick);
  },

  /** Un paso de la máquina: calibrar abajo, calibrar arriba, jugar. */
  step(dt, wrist, shoulder) {
    if (wrist == null) {
      this.cue('No te veo: ponte de frente, de la cadera para arriba');
      return;
    }
    const c = this.cal;

    if (this.phase === 'cal-abajo') {
      // Manos a la altura de los hombros: la muñeca no debe estar por encima.
      if (wrist > shoulder - 0.04) c.abajo.push(wrist); else c.abajo.length = 0;
      const pct = Math.min(100, Math.round((c.abajo.length / 30) * 100));
      this.cue(`Paso 1 de 2 · manos a la altura de los hombros  ${pct}%`);
      if (c.abajo.length >= 30) {
        c.bottomY = mediana(c.abajo);
        this.phase = 'cal-arriba';
      }
      return;
    }

    if (this.phase === 'cal-arriba') {
      // Brazos estirados sobre la cabeza: la muñeca bien por encima del hombro.
      if (wrist < shoulder - 0.12) c.arriba.push(wrist); else c.arriba.length = 0;
      const pct = Math.min(100, Math.round((c.arriba.length / 20) * 100));
      this.cue(`Paso 2 de 2 · estira los brazos arriba  ${pct}%`);
      if (c.arriba.length >= 20) {
        c.topY = mediana(c.arriba);
        this.comenzarPartida();
      }
      return;
    }

    if (this.phase !== 'jugando' || !this.state) return;

    const objetivo = Gm.normalizeHeight(wrist, c.bottomY, c.topY);
    this.norm = Gm.smoothNorm(this.norm, objetivo);
    Gm.stepGame(this.state, dt, this.norm);

    const st = this.state;
    const g = st.gateActual || Gm.proximoGate(st);
    this.cue(g ? g.label : '');
    this.hud(`${Gm.FOCUS_LABEL[this.focus]}`, `${st.limpios} limpios · ${st.tocados} tocados`);
    this.msg(st.tocando ? 'Fuera del corredor' : 'Vas bien');
    if (st.terminado) this.finish();
  },

  comenzarPartida() {
    // El recorrido se arma con el tamaño real del lienzo, para que la velocidad
    // y la separación se vean igual en cualquier pantalla.
    const W = this.cw || 320;
    this.state = Gm.newGame(this.focus, {
      playerX: Math.round(W * 0.22),
      speed: Math.round(W * 0.33),
      gapBetween: Math.round(W * 0.46),
      gateWidth: Math.round(W * 0.16),
      loops: 3,
    });
    this.norm = 0.2;
    this.phase = 'jugando';
    this.msg('');
  },

  finish() {
    const r = Gm.resumen(this.state);
    this.phase = 'fin';
    cancelAnimationFrame(this.raf);
    this.stopStream();
    WakeLock.off();
    $('game-stage').hidden = true;
    const box = $('game-result');
    box.hidden = false;
    box.innerHTML = `<div class="lbl">Fin de la partida · ${esc(Gm.FOCUS_LABEL[this.focus])}</div>
      <div class="result-head">
        <div><span class="result-big">${r.limpios}</span><span class="result-unit">de ${r.total} corredores</span></div>
        <div class="result-cat">${r.control == null ? '' : `${num(r.control, 0)} %`}</div>
      </div>
      <div class="small">${r.control == null ? '' : `Estuviste dentro del corredor el ${num(r.control, 0)} % del tiempo. `}Duró ${num(r.segundos, 0)} s.</div>
      <div class="small muted">Esto es un juego: no es una medición ni entrega nivel, y no se guarda en tu perfil.</div>
      <div class="btn-row">
        <button class="btn" id="btn-game-again" type="button">Otra vez</button>
        <button class="btn ghost" id="btn-game-change" type="button">Cambiar objetivo</button>
      </div>`;
    $('btn-game-again').onclick = () => this.start();
    $('btn-game-change').onclick = () => this.open();
  },

  draw() {
    const c = $('game-canvas');
    if (!c || !this.cw) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    const H = this.ch, W = this.cw;
    const m = H * 0.1, bTop = m, bBot = H - m, bH = bBot - bTop;
    const yFor = (n) => bBot - Gm.clamp(n, 0, 1) * bH;

    ctx.strokeStyle = 'rgba(242,242,243,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bTop); ctx.lineTo(W, bTop);
    ctx.moveTo(0, bBot); ctx.lineTo(W, bBot);
    ctx.stroke();

    if (this.phase === 'cal-abajo' || this.phase === 'cal-arriba') {
      const y = this.phase === 'cal-abajo' ? bBot : bTop;
      ctx.strokeStyle = '#7fa3c6';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const st = this.state;
    if (!st) return;
    for (const g of st.course.gates) {
      const x = g.x - st.scroll;
      if (x > W || x + g.w < 0) continue;
      const top = yFor(g.level + g.gap / 2), bot = yFor(g.level - g.gap / 2);
      ctx.fillStyle = g.estado === 'tocado' ? 'rgba(178,59,59,.8)'
        : g.iso ? 'rgba(127,163,198,.95)' : 'rgba(89,128,166,.85)';
      ctx.fillRect(x, bTop, g.w, Math.max(0, top - bTop));
      ctx.fillRect(x, bot, g.w, Math.max(0, bBot - bot));
    }
    const px = st.course.opts.playerX, py = yFor(st.norm), s = 11;
    ctx.fillStyle = st.tocando ? '#ec7b7b' : '#f2f2f3';
    ctx.fillRect(px - s, py - s, s * 2, s * 2);
  },
};

/** Mediana, para que un cuadro raro no arruine la calibración. */
function mediana(xs) {
  const a = xs.slice().sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/* ------------------------------------------------------------------ modo stand */

/* Para una feria: cualquiera toma el teléfono, prueba y se lo pasa al siguiente.
   Tres problemas que resuelve:
     1. Las tablas son de 18 a 21, y casi nadie en un jurado tiene esa edad. Sin
        esto no se puede ni pasar de la primera pantalla.
     2. Los resultados de una persona quedaban guardados y la siguiente veía un
        "avance" que no era suyo.
     3. El detector pesa varios MB y nadie quiere esperarlo con gente mirando.
   En modo stand no se escribe nada en el teléfono: saveStore y saveValid salen
   antes de tocar localStorage. */

const STAND_IDLE_MS = 4 * 60 * 1000;
let standIdleTimer = null;

const standStatus = (msg) => { $('stand-status').textContent = msg; };

/** Borra lo de la persona anterior. Solo en memoria: en modo stand nunca se guardó. */
function nextPerson() {
  S.profile = { age: null, sex: null };
  S.history = Hist.emptyHistory(ORDER);
  S.results = {};
  S.last = null;
  S.test = null;
  renderOnb();
  show('onb');
}

function touchStandIdle() {
  clearTimeout(standIdleTimer);
  if (!S.stand) return;
  standIdleTimer = setTimeout(() => {
    if (S.stand && !['run', 'onb'].includes(S.screen)) nextPerson();
  }, STAND_IDLE_MS);
}

function enterStand() {
  S.stand = true;
  nextPerson();
  touchStandIdle();
  standStatus('Cargando el detector…');
  Engine.load(S.settings.model, (stage, l, t) => {
    standStatus(stage === 'model'
      ? `Cargando el detector… ${num(l / 1e6, 0)} de ${t ? num(t / 1e6, 0) : '?'} MB`
      : 'Iniciando el motor…');
  }).then(() => standStatus('Detector listo. Nada se guarda en este teléfono.'))
    .catch((e) => standStatus(`No se pudo cargar el detector: ${e?.message || e}`));
}

/** Salir recarga, para volver a leer los datos reales que había guardados. */
function exitStand() {
  S.stand = false;
  clearTimeout(standIdleTimer);
  location.replace(location.pathname);
}

/* ------------------------------------------------------------------ ajustes */

function renderSettings() {
  $('set-voice').checked = !!S.settings.voice;
  $('set-angles').checked = !!S.settings.angles;
  $('set-calidad').checked = !!S.settings.calidad;
  $('set-grabar').checked = !!S.settings.grabarVideo;
  $('set-juego').checked = S.settings.mostrarJuego !== false;
  $('set-silueta').checked = S.settings.silueta !== false;
  $('set-tilt').checked = !!S.settings.tiltCorrection;
  $('set-stand').checked = !!S.stand;
  $('set-valid').checked = !!S.settings.valid;
  $('btn-open-valid').hidden = !S.settings.valid;
  const box = $('model-pills');
  box.innerHTML = '';
  for (const [k, l] of [['full', 'Preciso'], ['lite', 'Rápido']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.textContent = l;
    b.setAttribute('aria-pressed', String(S.settings.model === k));
    b.addEventListener('click', () => { S.settings.model = k; saveStore(); renderSettings(); });
    box.appendChild(b);
  }
  $('engine-info').textContent = Engine.info();
}

/* ------------------------------------------------------------------ arranque */

function bind() {
  $('brand').addEventListener('click', () => (S.profile.age && S.profile.sex ? show('hub') : show('onb')));
  $('btn-onb').addEventListener('click', () => { S.settings.welcomed = true; saveStore(); show('hub'); });
  for (const b of $('tabs').querySelectorAll('button')) b.addEventListener('click', () => show(b.dataset.tab));
  $('btn-intro-back').addEventListener('click', () => show('hub'));
  $('btn-live').addEventListener('click', () => { Sensors.requestPermission(); Voice.unlock(); Sound.unlock(); Runner.open(S.test, 'live'); });
  $('btn-demo').addEventListener('click', () => { Voice.unlock(); Sound.unlock(); Runner.open(S.test, 'demo'); });
  for (const id of ['file-record', 'file-pick']) {
    $(id).addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) Runner.open(S.test, 'video', f);
    });
  }
  $('btn-start').addEventListener('click', () => Runner.start());
  $('btn-stop').addEventListener('click', () => Runner.stopByUser());
  $('btn-cancel').addEventListener('click', () => { Runner.teardown(); openIntro(S.test); });
  $('btn-close').addEventListener('click', () => { Runner.teardown(); openIntro(S.test); });
  $('btn-flip').addEventListener('click', async () => {
    S.settings.facing = S.settings.facing === 'user' ? 'environment' : 'user'; saveStore();
    try { await Runner.startCamera(); Runner.veil(null); } catch (e) { Runner.fail(e); }
  });
  $('btn-3d').addEventListener('click', () => { S.settings.show3d = !S.settings.show3d; saveStore(); Runner.setup3D(); Runner.resize(); });
  $('btn-settings').addEventListener('click', () => { renderSettings(); $('sheet').hidden = false; $('sheet-close').focus(); });
  $('sheet-close').addEventListener('click', () => { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').hidden = true; });
  $('set-voice').addEventListener('change', (e) => { S.settings.voice = e.target.checked; saveStore(); });
  $('set-angles').addEventListener('change', (e) => { S.settings.angles = e.target.checked; saveStore(); });
  $('set-calidad').addEventListener('change', (e) => { S.settings.calidad = e.target.checked; saveStore(); });
  $('set-grabar').addEventListener('change', (e) => { S.settings.grabarVideo = e.target.checked; saveStore(); });
  $('btn-ensayo').addEventListener('click', () => Ensayo.run());
  $('set-silueta').addEventListener('change', (e) => { S.settings.silueta = e.target.checked; saveStore(); });
  $('set-juego').addEventListener('change', (e) => { S.settings.mostrarJuego = e.target.checked; saveStore(); if (S.screen === 'hub') renderHub(); });
  const guardarMsg = (t) => { $('res-guardar-msg').textContent = t; };
  $('btn-save-video').addEventListener('click', async () => {
    const v = S.last?.video;
    if (!v) return;
    const ok = await guardarArchivo(nombreArchivo(TESTS[S.last.test].name, 'video con esqueleto', v.ext), v.blob);
    guardarMsg(ok ? 'Listo: el video quedó en tu teléfono.' : '');
  });
  $('btn-save-3d').addEventListener('click', async () => {
    const b = $('btn-save-3d');
    b.disabled = true; guardarMsg('Grabando la animación 3D… espera a que termine.');
    const v = await Review?.grabar();
    b.disabled = false;
    if (!v) { guardarMsg('Este navegador no puede grabar la animación.'); return; }
    const ok = await guardarArchivo(nombreArchivo(TESTS[S.last.test].name, 'animacion 3d', v.ext), v.blob);
    guardarMsg(ok ? 'Listo: la animación quedó en tu teléfono.' : '');
  });
  $('btn-share-skel').addEventListener('click', async () => {
    const L = S.last;
    if (!L?.rec?.length) return;
    if (!window.confirm('Vas a compartir solo los puntos de tu cuerpo (sin imagen ni video), tu edad, tu sexo y tu resultado. No va tu nombre ni la fecha exacta. Sirve para que el equipo de FitGram afine las reglas de conteo. ¿Seguir?')) return;
    const r = L.result;
    const datos = esqueletoParaCompartir(L.rec, { test: L.test, value: r.value, invalid: r.invalid, date: r.date,
      age: r.profile?.age, sex: r.profile?.sex, reglas: r.reglas, nombres: [...H36M.names] });
    const ok = await guardarArchivo(nombreArchivo(TESTS[L.test].name, 'esqueleto', 'json'), new Blob([JSON.stringify(datos)], { type: 'application/json' }));
    guardarMsg(ok ? 'Listo. Mándaselo al equipo por el medio que prefieras.' : '');
  });
  $('set-tilt').addEventListener('change', (e) => { S.settings.tiltCorrection = e.target.checked; saveStore(); });
  $('btn-probe').addEventListener('click', async () => {
    const out = $('probe-out');
    out.textContent = 'Escuchando los sensores 1,5 s… deja el teléfono quieto.';
    await Sensors.requestPermission();
    // Igual que Sensors.probe, pero además lee la inclinación medida (HU-17).
    const est = createTiltEstimator({ facing: S.settings.facing });
    Sensors.start(est, { facing: S.settings.facing });
    await new Promise((res) => setTimeout(res, 1500));
    const st = est.state(performance.now());
    Sensors.stop();
    const r = st.sensors, si = (b) => (b ? 'sí' : 'no');
    const t = st.lastStill || st.tilt;
    const incl = t && Number.isFinite(t.roll)
      ? ` Inclinación: ${Math.round(t.roll)}° de lado${Number.isFinite(t.pitch) ? `, ${Math.round(t.pitch)}° hacia ${t.pitch >= 0 ? 'arriba' : 'abajo'}` : ''}${st.still === false ? ' (el teléfono se estaba moviendo)' : ''}.`
      : '';
    out.textContent = `Orientación: ${si(r.orientation)} · Acelerómetro: ${si(r.accelerometer)} · Giroscopio: ${si(r.gyroscope)}.`
      + (Sensors.permission === 'denied' ? ' Permiso rechazado.' : '')
      + (!r.orientation && !r.accelerometer ? ' Sin sensores: la inclinación se estima con tu postura.' : incl);
  });
  $('btn-edit-profile').addEventListener('click', () => { $('sheet').hidden = true; renderOnb(); show('onb'); });
  $('set-stand').addEventListener('change', (e) => { $('sheet').hidden = true; if (e.target.checked) enterStand(); else exitStand(); });
  $('btn-next-person').addEventListener('click', nextPerson);
  $('btn-open-game').addEventListener('click', () => Game.open());
  $('btn-game-start').addEventListener('click', () => Game.start());
  $('btn-game-stop').addEventListener('click', () => { if (Game.state) Game.finish(); else { Game.teardown(); Game.open(); } });
  $('btn-game-back').addEventListener('click', () => show('hub'));
  window.addEventListener('resize', () => { if (S.screen === 'game') Game.resize(); });
  $('btn-offline').addEventListener('click', () => {
    $('btn-offline').disabled = true;
    offlineInfo('Descargando…');
    swMsg('prepararOffline');
  });
  $('btn-update').addEventListener('click', () => {
    $('update-bar').hidden = true;
    swReg?.waiting?.postMessage({ type: 'activarAhora' });
  });
  $('onb-age-num').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    S.profile.age = Number.isInteger(v) && v >= 10 && v <= 99 ? v : null;
    renderOnb();
  });
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, touchStandIdle, { passive: true });
  $('set-valid').addEventListener('change', (e) => { S.settings.valid = e.target.checked; saveStore(); renderSettings(); });
  $('btn-open-valid').addEventListener('click', () => { $('sheet').hidden = true; show('valid'); });
  $('v-save').addEventListener('click', saveValidRecord);
  $('v-back').addEventListener('click', () => show(S.profile.age && S.profile.sex ? 'hub' : 'onb'));
  $('v-csv').addEventListener('click', () => exportValid(`fitgram-validacion-${stamp()}.csv`, '\ufeff' + Val.toCSV(S.valid, ORDER, unitsByTest()), 'text/csv'));
  $('v-json').addEventListener('click', () => exportValid(`fitgram-validacion-${stamp()}.json`, JSON.stringify(S.valid, null, 2), 'application/json'));
  // El mismo archivo que exporta el botón de al lado, de vuelta.
  $('v-rescate-si').addEventListener('click', () => {
    const r = ultimaCorrida();
    if (!r) return;
    vRun = { test: vTest, run: Val.runFromResult(r) };
    $('v-app').value = Val.numCL(r.value, 1);
    renderValidRun();
  });
  $('v-load').addEventListener('click', () => { $('v-file').value = ''; $('v-file').click(); });
  $('v-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) cargarRespaldo(f);
  });

  // Escribir el código vuelve a mostrar qué le falta a esa persona.
  $('v-part').addEventListener('input', () => { vPending = null; $('v-dup').hidden = true; renderValidPerson(); });

  // Enter pasa al campo siguiente y, en el último, guarda. Con el teclado del
  // teléfono abierto, cada toque de más es un toque sobre un dato a la vista.
  const salto = { 'v-app': 'v-r1', 'v-r1': 'v-r2' };
  for (const [from, to] of Object.entries(salto)) {
    $(from).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      $(to).focus();
    });
  }
  $('v-r2').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    saveValidRecord();
  });

  $('v-dup-replace').addEventListener('click', () => { if (vPending) commitValidRecord(vPending.rec, vPending.dupId); });
  $('v-dup-both').addEventListener('click', () => { if (vPending) commitValidRecord(vPending.rec, null); });
  $('v-dup-cancel').addEventListener('click', () => { vPending = null; $('v-dup').hidden = true; });

  $('v-next-person').addEventListener('click', () => {
    vClearNotices();
    vRun = null;
    for (const id of ['v-part', 'v-app', 'v-r1', 'v-r2', 'v-note']) $(id).value = '';
    vTest = ORDER[0];
    renderValid();
    $('v-part').focus();
  });

  $('v-undo-yes').addEventListener('click', () => {
    if (!vUndo) return;
    S.valid = vUndo.records;
    vUndo = null;
    saveValid();
    renderValid();
  });
  $('v-clear').addEventListener('click', () => { $('v-clear-confirm').hidden = false; });
  $('v-clear-no').addEventListener('click', () => { $('v-clear-confirm').hidden = true; });
  $('v-clear-yes').addEventListener('click', () => {
    S.valid = [];
    vUndo = null;
    vExportedAt = null;
    try { localStorage.removeItem(VALID_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(VALID_EXPORT_KEY); } catch { /* ignore */ }
    $('v-clear-confirm').hidden = true;
    renderValid();
  });
  $('btn-engine-test').addEventListener('click', async () => {
    const info = $('engine-info'), btn = $('btn-engine-test');
    btn.disabled = true;
    info.textContent = 'Cargando…';
    try {
      await Engine.load(S.settings.model, (stage, l, t) => {
        info.textContent = stage === 'model' ? `Descargando el modelo: ${num(l / 1e6, 1)} de ${t ? num(t / 1e6, 1) : '?'} MB` : stage === 'wasm' ? 'Iniciando el motor…' : 'Cargando la librería…';
      });
      info.textContent = `Listo. ${Engine.info()}`;
    } catch (e) {
      info.textContent = `No se pudo cargar: ${e?.message || e}`;
    } finally { btn.disabled = false; }
  });
  $('prof-hist-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-test]');
    if (!b) return;
    const t = b.dataset.delTest, d = b.dataset.delDate;
    if (!window.confirm(`¿Borrar ${TESTS[t].short.toLowerCase()} del ${dateLabel(d)}? No se puede deshacer.`)) return;
    S.history = Hist.removeResult(S.history, t, d);
    S.results = Hist.latestMap(S.history, ORDER);
    saveStore();
    renderProfile();
  });
  $('btn-exp-csv').addEventListener('click', () => downloadText(`fitgram-mis-resultados-${stamp()}.csv`, '\ufeff' + Hist.toCSV(S.history, ORDER, describeForCsv), 'text/csv'));
  $('btn-exp-json').addEventListener('click', () => downloadText(`fitgram-mis-resultados-${stamp()}.json`,
    JSON.stringify({ schema: 1, app: 'fitgram', exportado: new Date().toISOString(), profile: S.profile, history: S.history }, null, 2), 'application/json'));
  $('btn-reset').addEventListener('click', () => { $('reset-confirm').hidden = false; });
  $('btn-reset-no').addEventListener('click', () => { $('reset-confirm').hidden = true; });
  $('btn-reset-yes').addEventListener('click', () => {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    S.profile = { age: null, sex: null }; S.results = {}; S.history = Hist.emptyHistory(ORDER); S.last = null;
    // «Borrar todos mis datos» incluye los ajustes (HU-38): vuelven a los de fábrica.
    S.settings = Object.assign({}, DEFAULT_SETTINGS);
    $('reset-confirm').hidden = true;
    renderOnb(); show('onb');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) $('sheet').hidden = true; });
  // Al volver a la app durante una prueba en vivo: retoma la vista de la cámara y el bloqueo de pantalla encendida.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || S.screen !== 'run' || Runner.mode !== 'live') return;
    $('video').play().catch(() => {});
    if (['countdown', 'arming', 'active'].includes(Runner.phase)) WakeLock.on();
    // Los temporizadores se frenan con la app en segundo plano, así que el
    // vigilante puede no haber alcanzado a correr: se revisa al volver.
    Runner.revisarCuadros();
  });
}

/**
 * Red de seguridad: un error que nadie atrapó.
 *
 * Sin esto, una excepción en cualquier parte deja la pantalla tal como estaba
 * y a la persona mirando algo que ya no responde. Decirlo no arregla el error,
 * pero evita que una medición se dé por buena cuando en realidad se cayó.
 *
 * Solo informa: no toca el estado de la app. El error pudo venir de cualquier
 * parte, incluida una extensión del navegador, y cerrar una prueba buena por
 * algo ajeno sería peor que el aviso.
 */
let erroresSueltos = 0;
function avisarErrorSuelto(origen, e) {
  erroresSueltos++;
  if (erroresSueltos <= 3) console.warn(origen, e);
  const bar = $('error-bar');
  if (!bar || erroresSueltos > 1) {
    // Ya hay un aviso puesto: no se pisa, solo se cuenta.
    if (bar && !bar.hidden) $('error-bar-msg').textContent += ` (y ${erroresSueltos - 1} más)`;
    return;
  }
  const msg = String(e?.message || e || 'error desconocido').slice(0, 160);
  bar.hidden = false;
  $('error-bar-msg').textContent = S.screen === 'run'
    ? `${msg} — si estabas midiendo, repite la prueba: ese resultado no es confiable.`
    : msg;
}

function boot() {
  Voice.init();
  bind();
  $('btn-error-close').addEventListener('click', () => { $('error-bar').hidden = true; erroresSueltos = 0; });
  window.addEventListener('error', (e) => avisarErrorSuelto('error', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => avisarErrorSuelto('rejection', e.reason));
  registrarSW();
  // Sin WebAssembly no hay detector de pose: avisar de entrada (HU-47).
  if (typeof WebAssembly === 'undefined') {
    $('error-bar').hidden = false;
    $('error-bar-msg').textContent = 'Este navegador no puede correr el detector de pose. Usa Chrome (Android o computador) o Safari 16.4 o superior (iPhone).';
  }
  renderOnb();
  window.FITGRAM = { S, Runner, Engine, classify, URLS, Hist, Val, seedDemoHistory, openValid, renderResult, show }; // útil para depurar y para las pruebas automáticas
  // ?demo=historial abre el perfil; ?demo=pushup|squat|plank abre esa pantalla de resultado.
  let seed = null;
  try { seed = new URLSearchParams(location.search).get('demo'); } catch { /* ignore */ }
  if (seed) { seedDemoHistory(seed === 'historial' ? 'profile' : seed); return; }
  let modo = null;
  try { modo = new URLSearchParams(location.search).get('modo'); } catch { /* ignore */ }
  if (modo === 'stand') { enterStand(); return; }
  if (modo === 'validacion') { openValid(); return; }
  if (S.profile.age && S.profile.sex) show('hub'); else show('onb');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}

export { URLS, TESTS, Engine, classify, Runner };
