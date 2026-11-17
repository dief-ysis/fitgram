/** Lógica del modo juego (idea de Elias). node --test test/game.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.mjs';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

/* ------------------------------------------------- altura normalizada */

test('en los hombros la altura es 0 y en el lockout es 1', () => {
  // y crece hacia abajo: la muñeca arriba tiene y menor
  near(G.normalizeHeight(0.8, 0.8, 0.2, 0), 0);
  near(G.normalizeHeight(0.2, 0.8, 0.2, 0), 1);
  near(G.normalizeHeight(0.5, 0.8, 0.2, 0), 0.5);
});

test('el margen ergonómico hace que no haya que llegar al lockout absoluto', () => {
  // con 10% de margen, el tope útil está un poco más abajo que el lockout medido
  const conMargen = G.normalizeHeight(0.26, 0.8, 0.2, 0.1);
  assert.ok(conMargen > G.normalizeHeight(0.26, 0.8, 0.2, 0), 'con margen debería costar menos llegar arriba');
  assert.ok(conMargen <= 1);
});

test('la altura nunca se sale de 0..1 aunque la muñeca se pase', () => {
  assert.equal(G.normalizeHeight(0.05, 0.8, 0.2), 1);
  assert.equal(G.normalizeHeight(1.5, 0.8, 0.2), 0);
});

test('una calibración degenerada no divide por cero', () => {
  assert.ok(Number.isFinite(G.normalizeHeight(0.5, 0.5, 0.5)));
});

test('el suavizado parte del valor real y después se acerca de a poco', () => {
  assert.equal(G.smoothNorm(NaN, 0.7), 0.7);
  const s = G.smoothNorm(0, 1, 0.25);
  near(s, 0.25);
});

/* ------------------------------------------------- recorrido */

test('el recorrido repite la secuencia y los corredores van en orden', () => {
  const c = G.buildCourse('fuerza', { loops: 2 });
  assert.equal(c.gates.length, G.SEQUENCES.fuerza.length * 2);
  for (let i = 1; i < c.gates.length; i++) {
    assert.ok(c.gates[i].x > c.gates[i - 1].x, 'cada corredor empieza después del anterior');
  }
});

test('un tramo isométrico es un corredor largo: duración por velocidad', () => {
  const c = G.buildCourse('fuerza', { loops: 1, speed: 100 });
  const iso = c.gates.find((g) => g.iso);
  assert.ok(iso, 'fuerza máxima debería tener un tramo isométrico');
  near(iso.w, 2.0 * 100, 1e-6); // 2 s sostenidos
  const normal = c.gates.find((g) => !g.iso);
  assert.ok(iso.w > normal.w * 3, 'el isométrico debe ser mucho más largo');
});

test('el hueco nunca baja del mínimo', () => {
  const c = G.buildCourse('potencia', { gap: 0.01 });
  for (const g of c.gates) assert.ok(g.gap >= G.DEFAULTS.minGap);
});

test('un objetivo desconocido no revienta: cae en hipertrofia', () => {
  assert.equal(G.buildCourse('nomeinventes', { loops: 1 }).gates.length, G.SEQUENCES.hipertrofia.length);
});

/* ------------------------------------------------- juego */

/**
 * Corre la partida entera con una función que decide la altura en cada cuadro.
 * Mira el corredor que viene, no el actual: es lo que hace un jugador de verdad,
 * que ve venir el hueco y se acomoda antes de llegar.
 */
function jugar(focus, alturaEn, opts = {}) {
  const s = G.newGame(focus, { loops: 1, ...opts });
  const dt = 1 / 60;
  for (let i = 0; i < 20000 && !s.terminado; i++) {
    G.stepGame(s, dt, alturaEn(G.gateEnCurso(s) || G.proximoGate(s), s));
  }
  return s;
}

test('quien sigue todas las alturas pasa todos los corredores limpio', () => {
  const s = jugar('fuerza', (g) => (g ? g.level : 0.2));
  const r = G.resumen(s);
  assert.equal(r.limpios, r.total, 'debería pasarlos todos');
  assert.equal(r.tocados, 0);
  near(r.control, 100, 0.001);
});

test('quien anticipa el corredor que viene lo pasa limpio', () => {
  // mismo jugador, pero confirmando explícitamente que anticipar es lo que vale
  const s = jugar('hipertrofia', (g) => (g ? g.level : 0.2));
  assert.equal(G.resumen(s).tocados, 0);
});

test('quien se queda abajo todo el rato toca los corredores altos', () => {
  const s = jugar('fuerza', () => 0.0);
  const r = G.resumen(s);
  assert.ok(r.tocados > 0, 'debería tocar varios');
  assert.ok(r.limpios < r.total);
  assert.ok(r.control < 60, `el control debería ser bajo, fue ${r.control}`);
});

test('un cuadro suelto de ruido NO arruina el corredor', () => {
  let n = 0;
  const s = jugar('fuerza', (g) => {
    n++;
    if (!g) return 0.2;
    return n % 90 === 0 ? 0.0 : g.level; // un salto cada 1,5 s
  });
  assert.equal(G.resumen(s).tocados, 0, 'un cuadro fuera no debería costar el corredor');
});

test('en un isométrico no basta con llegar: hay que sostener', () => {
  // Se pone a la altura correcta, pero a mitad del corredor largo se cae.
  let cuadros = 0;
  const s = jugar('fuerza', (g) => {
    if (!g) { cuadros = 0; return 0.2; }
    cuadros++;
    if (g.iso && cuadros > 30) return 0.0; // se cae después de medio segundo
    return g.level;
  });
  const iso = s.course.gates.find((g) => g.iso);
  assert.equal(iso.estado, 'tocado', 'el isométrico debería quedar tocado');
});

test('un corredor tocado no se cuenta como limpio, y se cuenta una sola vez', () => {
  const s = jugar('potencia', () => 0.2); // siempre abajo
  const r = G.resumen(s);
  assert.equal(r.limpios + r.tocados, r.total, 'cada corredor se resuelve exactamente una vez');
});

test('la partida termina sola', () => {
  const s = jugar('potencia', (g) => (g ? g.level : 0.2));
  assert.equal(s.terminado, true);
  assert.ok(s.t > 0);
});

test('el juego no entrega categoría ni puntaje de baremo: es un juego', () => {
  const r = G.resumen(jugar('potencia', (g) => (g ? g.level : 0.2)));
  assert.deepEqual(Object.keys(r).sort(), ['control', 'limpios', 'segundos', 'tocados', 'total']);
});

test('todas las secuencias tienen etiquetas en castellano y niveles válidos', () => {
  for (const [nombre, seq] of Object.entries(G.SEQUENCES)) {
    assert.ok(G.FOCUS_LABEL[nombre], `falta la etiqueta de ${nombre}`);
    for (const s of seq) {
      assert.ok(s.level >= 0 && s.level <= 1, `${nombre}: nivel fuera de rango`);
      assert.ok(s.sec > 0, `${nombre}: duración inválida`);
      assert.ok(s.label?.length > 0, `${nombre}: falta etiqueta`);
    }
  }
});
