// Gráfico de telaraña del perfil: solo datos reales (26-nov-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosTelarana, svgTelarana } from '../src/telarana.mjs';

// Clasificador de mentira: la posición es el valor (para que los números del test se lean fácil).
const clasificar = (t, r) => ({ position: r.value });
const R = (value, invalid = 0, date = '2026-11-01') => ({ value, invalid, date });

test('con las tres pruebas: brazos, piernas, core y técnica', () => {
  const d = datosTelarana({ pushup: [R(30, 2)], squat: [R(40, 8)], plank: [R(55)] }, clasificar);
  assert.deepEqual(d.ejes, ['Brazos', 'Piernas', 'Core', 'Técnica']);
  assert.deepEqual(d.actual, [30, 40, 55, 88], 'técnica = 70 válidas de 80 = 88 %');
  assert.equal(d.anterior, null, 'sin mediciones anteriores no hay comparación');
});

test('compara con la medición anterior de cada prueba', () => {
  const d = datosTelarana({ pushup: [R(20, 5), R(30, 2)], squat: [R(35, 5), R(40, 8)], plank: [R(50), R(55)] }, clasificar);
  assert.deepEqual(d.anterior, [20, 35, 50, 85]);
});

test('no compara si a algún eje de hoy le falta su dato anterior', () => {
  const d = datosTelarana({ pushup: [R(20), R(30)], squat: [R(40)], plank: [R(50), R(55)] }, clasificar);
  assert.equal(d.anterior, null);
});

test('con menos de tres ejes con dato no hay telaraña', () => {
  assert.equal(datosTelarana({ pushup: [R(30)] }, clasificar), null, 'flexiones dan brazos y técnica: solo dos ejes');
  assert.equal(datosTelarana({}, clasificar), null);
  const dos = datosTelarana({ pushup: [R(30)], plank: [R(50)] }, clasificar);
  assert.deepEqual(dos.actual, [30, null, 50, 100]);
});

test('una prueba sin tabla (edad fuera de rango) deja su eje vacío, no inventa', () => {
  const sinTabla = (t, r) => (t === 'squat' ? null : { position: r.value });
  const d = datosTelarana({ pushup: [R(30)], squat: [R(40)], plank: [R(50)] }, sinTabla);
  assert.deepEqual(d.actual, [30, null, 50, 100]);
});

test('el SVG trae los ejes con su valor y la comparación punteada', () => {
  const svg = svgTelarana({ ejes: ['Brazos', 'Piernas', 'Core', 'Técnica'], actual: [30, null, 55, 88], anterior: [20, 0, 50, 85] });
  assert.match(svg, /^<svg[^>]+role="img"/);
  for (const t of ['Brazos', 'Piernas', 'Core', 'Técnica']) assert.ok(svg.includes(t));
  assert.ok(svg.includes('> —</tspan>'), 'eje sin dato muestra una raya');
  assert.ok(svg.includes('stroke-dasharray'), 'la anterior va punteada');
  assert.ok(!svg.includes('NaN'));
});
