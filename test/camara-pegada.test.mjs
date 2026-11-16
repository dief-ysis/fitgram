/**
 * Cuando la camara se queda pegada.
 *
 * No es lo mismo "no te veo" que "no me llegan cuadros", y hasta ahora el
 * analizador solo sabia contar el primero. Las dos cosas se ven iguales desde
 * la persona que esta haciendo la prueba: la app no estaba mirando.
 *
 * El caso de terreno que esto cubre: la plancha son 60 segundos con el
 * telefono apoyado y nadie tocandolo. Si la camara se cuelga en el segundo 20,
 * el rato que la app no vio tiene que quedar contado y dicho, no regalado ni
 * descontado en silencio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './_load.mjs';

const { synthSession } = loadModule('synth');
const { toJoints, PoseSmoother } = loadModule('skeleton');
const { createAnalyzer, EX_CONFIG } = loadModule('exercises');

const CM = EX_CONFIG.common;

/**
 * Corre una prueba y deja de entregar cuadros en el segundo `pegada`.
 * `stopEn` es el reloj de pared con que se llama a stop(), que es lo que
 * conoce la app cuando la persona toca «Terminar prueba».
 */
function camaraPegada(prueba, opts, { pegada = null, stopEn = null } = {}) {
  const s = synthSession(prueba, { fps: 30, noise: 0.004, seed: 1, ...opts });
  const sm = new PoseSmoother();
  const an = createAnalyzer(prueba, { sex: 'M' });
  an.start(s.frames[0].t);
  let ultimo = s.frames[0].t;
  for (const f of s.frames) {
    if (pegada != null && f.t / 1000 >= pegada) break;
    ultimo = f.t;
    const st = an.update(toJoints(sm.smooth(f)));
    if (st.phase === 'ended') break;
  }
  const tPared = stopEn != null ? stopEn * 1000 : ultimo + 1000 / 30;
  const fin = an.stop(tPared, 'manual');
  return { v: Math.round(fin.value * 10) / 10, sinVer: fin.sinVer, fin: fin.endReason,
    esp: prueba === 'plank' ? s.meta.expectedSeconds : s.meta.expectedValid };
}

test('la plancha no se lleva de regalo el rato en que no llego ningun cuadro', () => {
  // La camara se cuelga en el segundo 20 y la persona toca «Terminar» en el 60.
  const r = camaraPegada('plank', { seconds: 60 }, { pegada: 20, stopEn: 60 });
  assert.ok(r.v <= 21, `conto ${r.v} s habiendo visto 20`);
});

test('y ese rato queda contado como tiempo sin ver, no como cero', () => {
  const r = camaraPegada('plank', { seconds: 60 }, { pegada: 20, stopEn: 60 });
  assert.ok(r.sinVer >= 35, `informo ${r.sinVer} s sin ver de los 40 que no vio`);
});

test('un hueco largo termina la prueba por lo mismo que lo hace no ver a nadie', () => {
  // invisibleEndSec es el criterio ya acordado: mas de ese rato sin poder
  // comprobar la posicion y la prueba no vale. Que los cuadros no lleguen es
  // el mismo problema visto desde el otro lado.
  const r = camaraPegada('plank', { seconds: 60 }, { pegada: 20, stopEn: 60 });
  assert.equal(r.fin, 'not_visible', 'termino como si nada hubiera pasado');
});

test('terminar una prueba normal no cambia por esto', () => {
  // El ultimo cuadro tiene 33 ms: eso no es una camara pegada.
  const r = camaraPegada('plank', { seconds: 60 });
  assert.equal(r.fin, 'manual');
  assert.equal(r.sinVer, 0);
  assert.ok(Math.abs(r.v - r.esp) <= 0.2, `${r.v} vs ${r.esp}`);
});

test('un tropezon corto de la camara no invalida la prueba', () => {
  // Medio segundo de retraso es un telefono con calor, no una camara colgada.
  const r = camaraPegada('plank', { seconds: 60 }, { pegada: 59, stopEn: 59.4 });
  assert.equal(r.fin, 'manual', `un hueco de 0,4 s no deberia cortar nada`);
  assert.ok(r.sinVer < CM.invisibleEndSec, `informo ${r.sinVer} s`);
});

test('en flexiones el numero queda en lo que se vio y el resto se dice', () => {
  const r = camaraPegada('pushup', { reps: 15 }, { pegada: 12, stopEn: 30 });
  assert.ok(r.v < r.esp, 'si contara todas no habria nada que arreglar');
  assert.ok(r.sinVer >= CM.invisibleEndSec,
    `con sinVer=${r.sinVer} el CSV diria que esta medicion salio limpia`);
});

/* --------------------------------------------- lo que se le dice a la persona */

test('si la prueba se corto por no ver, el aviso no dice que el reloj siguio', () => {
  // En la plancha el reloj sigue corriendo a proposito durante un corte corto.
  // Pero si la prueba se corto por eso, el reloj se quedo en el ultimo momento
  // que pudo ver, y decir lo contrario haria creer que el numero vale.
  const Cal = loadModule('calidad');
  const corto = Cal.sinVerTexto('plank', 40, 'not_visible');
  assert.ok(!/reloj siguió corriendo/i.test(corto), corto);
  assert.ok(/repetirla|no lo que hiciste/i.test(corto), corto);

  const normal = Cal.sinVerTexto('plank', 3, 'manual');
  assert.ok(/reloj siguió corriendo/i.test(normal), normal);
});

test('en flexiones el aviso tambien cambia si la prueba se corto', () => {
  const Cal = loadModule('calidad');
  assert.notEqual(Cal.sinVerTexto('pushup', 40, 'not_visible'), Cal.sinVerTexto('pushup', 40, 'manual'));
});

test('bajo el umbral no se dice nada, pase lo que pase', () => {
  const Cal = loadModule('calidad');
  assert.equal(Cal.sinVerTexto('plank', 0.2, 'not_visible'), null);
});
