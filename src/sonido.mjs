/* ====================================================================
   FitGram — voz, pitidos y pantalla siempre encendida.
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

const Voice = {
  /** La app la reemplaza para leer el ajuste «Voz»; sin eso, habla siempre. */
  habilitada: () => true,
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
    if (!this.habilitada() || !('speechSynthesis' in window) || !text) return;
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

export { Voice, Sound, WakeLock };
