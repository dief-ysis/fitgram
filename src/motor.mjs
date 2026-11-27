/* ====================================================================
   FitGram — motor de pose: MediaPipe Tasks Vision, descarga del modelo y detección por cuadro.
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

const CFG = (typeof window !== 'undefined' && window.FITGRAM_CONFIG) || {};
const MP_VERSION = '1.1.0';
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const URLS = {
  lib: CFG.lib || `${MP_CDN}/vision_bundle.mjs`,
  wasmLoader: CFG.wasmLoader || `${MP_CDN}/wasm/vision_wasm_internal.js`,
  wasmBinary: CFG.wasmBinary || './wasm/vision_wasm_internal.wasm',
  model: (variant) => (CFG.modelBase || './models/') + `pose_landmarker_${variant}${CFG.modelExt || '.task'}`,
};

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

export { CFG, MP_VERSION, URLS, fetchBytes, fetchModel, Engine };
