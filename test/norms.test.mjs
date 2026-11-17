/** Rango de edad que cubren los baremos. node --test test/norms.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../src/norms.mjs';


test('el rango de edad de los baremos está declarado y es 18 a 21', () => {
  assert.equal(N.AGE_RANGE.min, 18);
  assert.equal(N.AGE_RANGE.max, 21);
});

test('coversAge dice quién entra en las tablas', () => {
  for (const a of [18, 19, 20, 21]) assert.equal(N.coversAge(a), true, `${a} debería entrar`);
  for (const a of [17, 22, 30, 45, 0, -1]) assert.equal(N.coversAge(a), false, `${a} no debería entrar`);
  for (const a of [20.5, null, undefined, NaN, '20']) assert.equal(N.coversAge(a), false, `${a} no es una edad entera`);
});

test('fuera del rango las tres pruebas se niegan a clasificar, no inventan una categoría', () => {
  for (const fn of ['classifyPushups', 'classifySquats']) {
    assert.throws(() => N[fn]({ age: 45, sex: 'M', reps: 20 }), RangeError, `${fn} con 45 años`);
  }
  assert.throws(() => N.classifyPlank({ age: 45, sex: 'M', seconds: 60 }), RangeError);
});

test('dentro del rango sí clasifican', () => {
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 29 }).category.label.length > 0, true);
  assert.equal(N.classifySquats({ age: 20, sex: 'M', reps: 41 }).category.label.length > 0, true);
  assert.equal(N.classifyPlank({ age: 20, sex: 'M', seconds: 61 }).category.label.length > 0, true);
});

test('la banda CSEP depende de la edad dentro del rango', () => {
  assert.equal(N.ageBandPushups(18), '15–19');
  assert.equal(N.ageBandPushups(21), '20–29');
  assert.equal(N.ageBandPushups(45), null);
});
