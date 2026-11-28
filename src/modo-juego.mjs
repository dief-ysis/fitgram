/* ====================================================================
   FitGram — modo juego: la pantalla del juego con la cámara (la lógica pura está en game.mjs).
   (separado de app.mjs el 27-nov-2026)
   ==================================================================== */

import * as Gm from './game.mjs';
import { toJoints } from './skeleton.mjs';
import { cameraErrorMessage } from './camara-errores.mjs';
import { Engine } from './motor.mjs';
import { WakeLock } from './sonido.mjs';
import { $, esc, num, clamp } from './utiles.mjs';
import { waitFor, openCameraStream } from './camara.mjs';

/** Lo que el juego necesita de app.mjs (que importa este módulo, no al revés): se conecta al arrancar. */
let app = { show: () => {}, modeloEfectivo: () => 'lite' };
function conectarJuego(a) { app = a; }

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
    document.body.classList.remove('jugando');
    app.show('game');
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
    document.body.classList.add('jugando');
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
      await Engine.load(app.modeloEfectivo(), (stage, l, t) => {
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
    this.ultimoTiempoVideo = null; this.ultimaPos = null;   // sin restos de la partida anterior
    const tick = () => {
      if (sid !== this.sid) return;
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      // Solo se detecta cuando la cámara entrega un cuadro nuevo: el bucle corre a la frecuencia de la pantalla (hasta 60
      // por segundo) y la cámara da 30, así que la mitad de las detecciones eran sobre la misma imagen. Entre medio se
      // reusa la última posición (27-nov, rendimiento en teléfonos lentos).
      if (v.videoWidth && v.currentTime !== this.ultimoTiempoVideo) {
        this.ultimoTiempoVideo = v.currentTime;
        let frame = null, wrist = null, shoulder = null;
        try { frame = Engine.detect(v, now, v.videoWidth / v.videoHeight); } catch (e) { console.warn(e); }
        if (frame) {
          const { j2 } = toJoints(frame);
          const lw = j2.l_wrist, rw = j2.r_wrist, ls = j2.l_shoulder, rs = j2.r_shoulder;
          if ([lw, rw, ls, rs].every((q) => q && q.v >= 0.5 && Number.isFinite(q.y))) {
            wrist = (lw.y + rw.y) / 2;
            shoulder = (ls.y + rs.y) / 2;
          }
        }
        this.ultimaPos = { wrist, shoulder };
      }
      const pos = this.ultimaPos || { wrist: null, shoulder: null };
      this.step(dt, pos.wrist, pos.shoulder);
      this.draw();
    };
    this.raf = requestAnimationFrame(tick);
  },

  /** Un paso de la máquina: calibrar abajo, calibrar arriba, jugar. */
  step(dt, wrist, shoulder) {
    if (wrist == null) {
      // El juego solo mira hombros y muñecas: basta verte del pecho para arriba, con espacio para los brazos estirados.
      this.cue('No veo tus hombros y muñecas: ponte de frente, del pecho para arriba');
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
    document.body.classList.remove('jugando');
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

export { Game, conectarJuego };
