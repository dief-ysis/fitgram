/**
 * Los baremos, contra las tablas publicadas.
 *
 * Este modulo produce la categoria que ve la persona y que va a ver el jurado.
 * Un error aca no se nota: la app sigue dando un numero y una palabra con la
 * misma seguridad de siempre, solo que la palabra no corresponde.
 *
 * Los cortes de abajo NO salen del codigo: estan escritos de nuevo a partir de
 * las tablas publicadas (CSEP para flexiones, ACE para sentadillas). Si fueran
 * una copia de lo que el codigo hace hoy, la prueba no comprobaria nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../src/norms.mjs';


/* Tabla CSEP de flexiones: banda -> sexo -> [categoria, desde, hasta]. */
const CSEP = {
  '15–19': {
    M: [['Necesita mejorar', 0, 17], ['Regular', 18, 22], ['Bueno', 23, 28], ['Muy bueno', 29, 38], ['Excelente', 39, null]],
    F: [['Necesita mejorar', 0, 11], ['Regular', 12, 17], ['Bueno', 18, 24], ['Muy bueno', 25, 32], ['Excelente', 33, null]],
  },
  '20–29': {
    M: [['Necesita mejorar', 0, 16], ['Regular', 17, 21], ['Bueno', 22, 28], ['Muy bueno', 29, 35], ['Excelente', 36, null]],
    F: [['Necesita mejorar', 0, 9], ['Regular', 10, 14], ['Bueno', 15, 20], ['Muy bueno', 21, 29], ['Excelente', 30, null]],
  },
};

/* Tabla ACE de sentadillas, banda 18-25. */
const ACE = {
  M: [['Muy pobre', 0, 24], ['Pobre', 25, 30], ['Bajo el promedio', 31, 34], ['Promedio', 35, 38],
    ['Sobre el promedio', 39, 43], ['Bueno', 44, 49], ['Excelente', 50, null]],
  F: [['Muy pobre', 0, 17], ['Pobre', 18, 24], ['Bajo el promedio', 25, 28], ['Promedio', 29, 32],
    ['Sobre el promedio', 33, 36], ['Bueno', 37, 43], ['Excelente', 44, null]],
};

const EDAD = { '15–19': 19, '20–29': 20 };

/* ------------------------------------------------------------ los cortes */

test('flexiones: cada corte de la tabla CSEP cae donde dice la tabla', () => {
  for (const [banda, porSexo] of Object.entries(CSEP)) {
    for (const [sex, filas] of Object.entries(porSexo)) {
      const age = EDAD[banda];
      for (const [etiqueta, desde, hasta] of filas) {
        // El primer valor de la categoria.
        assert.equal(N.classifyPushups({ age, sex, reps: desde }).category.label, etiqueta,
          `${banda} ${sex}: ${desde} deberia ser ${etiqueta}`);
        // El ultimo valor de la categoria.
        if (hasta != null) {
          assert.equal(N.classifyPushups({ age, sex, reps: hasta }).category.label, etiqueta,
            `${banda} ${sex}: ${hasta} deberia ser ${etiqueta}`);
          // Y uno mas ya es la siguiente.
          assert.notEqual(N.classifyPushups({ age, sex, reps: hasta + 1 }).category.label, etiqueta,
            `${banda} ${sex}: ${hasta + 1} no deberia seguir siendo ${etiqueta}`);
        }
      }
    }
  }
});

test('sentadillas: cada corte de la tabla ACE cae donde dice la tabla', () => {
  for (const [sex, filas] of Object.entries(ACE)) {
    for (const [etiqueta, desde, hasta] of filas) {
      assert.equal(N.classifySquats({ age: 20, sex, reps: desde }).category.label, etiqueta, `${sex}: ${desde}`);
      if (hasta != null) {
        assert.equal(N.classifySquats({ age: 20, sex, reps: hasta }).category.label, etiqueta, `${sex}: ${hasta}`);
        assert.notEqual(N.classifySquats({ age: 20, sex, reps: hasta + 1 }).category.label, etiqueta, `${sex}: ${hasta + 1}`);
      }
    }
  }
});

test('la banda de flexiones cambia a los 20, y 19 y 20 no dan lo mismo', () => {
  // Es el unico salto de edad que hay dentro del rango: si se rompiera, una
  // persona de 20 quedaria clasificada con la tabla de los de 15.
  assert.equal(N.ageBandPushups(18), '15–19');
  assert.equal(N.ageBandPushups(19), '15–19');
  assert.equal(N.ageBandPushups(20), '20–29');
  assert.equal(N.ageBandPushups(21), '20–29');
  // 17 flexiones: "Necesita mejorar" a los 19, "Regular" a los 20.
  assert.equal(N.classifyPushups({ age: 19, sex: 'M', reps: 17 }).category.label, 'Necesita mejorar');
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 17 }).category.label, 'Regular');
});

/* ------------------------------- que la tabla en pantalla diga la verdad */

test('la tabla que se muestra coincide con la categoria que se entrega', () => {
  // El texto de los rangos y la clasificacion se calculan por separado, asi que
  // pueden decir cosas distintas. En pantalla salen juntos.
  const casos = [
    ['pushup', (v) => N.classifyPushups({ age: 20, sex: 'M', reps: v })],
    ['pushup', (v) => N.classifyPushups({ age: 18, sex: 'F', reps: v })],
    ['squat', (v) => N.classifySquats({ age: 20, sex: 'M', reps: v })],
    ['squat', (v) => N.classifySquats({ age: 20, sex: 'F', reps: v })],
  ];
  for (const [nombre, clasificar] of casos) {
    const filas = clasificar(0).table;
    for (const fila of filas) {
      const dentro = [fila.min, fila.max == null ? fila.min + 25 : fila.max];
      for (const v of dentro) {
        const r = clasificar(v);
        assert.equal(r.category.label, fila.label,
          `${nombre}: la tabla pone ${v} en «${fila.label}» (${fila.text}) y la clasificacion dice «${r.category.label}»`);
      }
      if (fila.max != null) {
        assert.ok(fila.max >= fila.min, `${nombre}: la fila «${fila.label}» muestra un rango vacio (${fila.text})`);
      }
    }
  }
});

test('la plancha tambien: la tabla y la categoria no pueden contradecirse', () => {
  for (const sex of ['M', 'F']) {
    const filas = N.classifyPlank({ age: 20, sex, seconds: 0 }).table;
    for (const fila of filas) {
      const v = fila.min;
      assert.equal(N.classifyPlank({ age: 20, sex, seconds: v }).category.label, fila.label,
        `${sex}: ${v} s`);
      if (fila.max != null) {
        assert.equal(N.classifyPlank({ age: 20, sex, seconds: fila.max }).category.label, fila.label,
          `${sex}: ${fila.max} s`);
      }
    }
  }
});

/* ------------------------------------------------- cuanto falta para subir */

test('«te faltan N» lleva exactamente a la categoria siguiente', () => {
  // Si este numero esta mal, la persona hace el esfuerzo y la categoria no sube.
  const pruebas = [
    (v) => N.classifyPushups({ age: 20, sex: 'M', reps: v }),
    (v) => N.classifyPushups({ age: 18, sex: 'F', reps: v }),
    (v) => N.classifySquats({ age: 20, sex: 'M', reps: v }),
    (v) => N.classifySquats({ age: 20, sex: 'F', reps: v }),
  ];
  for (const clasificar of pruebas) {
    for (let v = 0; v <= 60; v++) {
      const r = clasificar(v);
      if (!r.next) continue;
      assert.ok(r.next.needed >= 1, `con ${v} dice que faltan ${r.next.needed}`);
      const subido = clasificar(v + r.next.needed);
      assert.equal(subido.category.index, r.category.index + 1,
        `con ${v} faltaban ${r.next.needed}, pero ${v + r.next.needed} no sube de categoria`);
      assert.equal(subido.category.label, r.next.label);
    }
  }
});

test('en la plancha «te faltan N segundos» tambien llega', () => {
  for (const sex of ['M', 'F']) {
    for (let s = 1; s <= 240; s += 3) {
      const r = N.classifyPlank({ age: 20, sex, seconds: s });
      if (!r.next) continue;
      assert.ok(r.next.needed >= 1, `${sex} ${s} s: faltan ${r.next.needed}`);
      const subido = N.classifyPlank({ age: 20, sex, seconds: s + r.next.needed });
      assert.equal(subido.category.index, r.category.index + 1, `${sex}: ${s} s + ${r.next.needed}`);
    }
  }
});

test('en la categoria mas alta no promete nada mas', () => {
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 100 }).next, null);
  assert.equal(N.classifySquats({ age: 20, sex: 'M', reps: 200 }).next, null);
  assert.equal(N.classifyPlank({ age: 20, sex: 'M', seconds: 600 }).next, null);
});

/* ------------------------------------------------------------ monotonia */

test('hacer mas nunca da una categoria peor', () => {
  for (const sex of ['M', 'F']) {
    for (const age of [18, 21]) {
      let prev = -1;
      for (let v = 0; v <= 120; v++) {
        const i = N.classifyPushups({ age, sex, reps: v }).category.index;
        assert.ok(i >= prev, `flexiones ${sex} ${age}: ${v} bajo de categoria`);
        prev = i;
      }
      prev = -1;
      for (let v = 0; v <= 120; v++) {
        const i = N.classifySquats({ age, sex, reps: v }).category.index;
        assert.ok(i >= prev, `sentadillas ${sex} ${age}: ${v} bajo de categoria`);
        prev = i;
      }
      prev = -1;
      for (let s = 0; s <= 400; s += 2) {
        const i = N.classifyPlank({ age, sex, seconds: s }).category.index;
        assert.ok(i >= prev, `plancha ${sex} ${age}: ${s} s bajo de categoria`);
        prev = i;
      }
    }
  }
});

test('el percentil de la plancha tampoco baja nunca', () => {
  for (const sex of ['M', 'F']) {
    let prev = -1;
    for (let s = 0; s <= 400; s += 1) {
      const p = N.plankPercentile(s, sex).percentile;
      assert.ok(p >= prev - 1e-9, `${sex}: en ${s} s el percentil bajo de ${prev} a ${p}`);
      prev = p;
    }
  }
});

/* ------------------------------------------------- percentiles de la plancha */

test('en cada decil publicado el percentil da justo ese numero', () => {
  for (const sex of ['M', 'F']) {
    const d = N.NORMS.plank.deciles[sex];
    d.forEach((seg, i) => {
      const p = N.plankPercentile(seg, sex).percentile;
      assert.ok(Math.abs(p - (i + 1) * 10) < 1e-6, `${sex}: P${(i + 1) * 10} es ${seg} s y dio percentil ${p}`);
    });
  }
});

test('fuera de los deciles se avisa que es extrapolacion', () => {
  for (const sex of ['M', 'F']) {
    const d = N.NORMS.plank.deciles[sex];
    assert.equal(N.plankPercentile(d[0] - 1, sex).extrapolated, true);
    assert.equal(N.plankPercentile(d[8] + 1, sex).extrapolated, true);
    assert.equal(N.plankPercentile(d[4], sex).extrapolated, false);
    // Y el resultado lo lleva como bandera, que es lo que llega a la pantalla.
    assert.deepEqual(N.classifyPlank({ age: 20, sex, seconds: d[8] + 50 }).flags, ['extrapolated']);
    assert.deepEqual(N.classifyPlank({ age: 20, sex, seconds: d[4] }).flags, []);
  }
});

test('el percentil nunca se sale de 0 a 99', () => {
  for (const sex of ['M', 'F']) {
    for (const s of [0, 0.1, 1, 30, 400, 1000, 10000]) {
      const p = N.plankPercentile(s, sex).percentile;
      assert.ok(p >= 0 && p <= 99, `${sex} ${s} s: percentil ${p}`);
    }
  }
});

test('el percentil que se muestra nunca contradice la categoria', () => {
  // «Muy bajo (<P10)» con «percentil 10» al lado seria absurdo.
  for (const sex of ['M', 'F']) {
    const d = N.NORMS.plank.deciles[sex];
    const justoAbajo = N.classifyPlank({ age: 20, sex, seconds: d[0] - 0.1 });
    assert.equal(justoAbajo.category.index, 0);
    assert.ok(justoAbajo.percentile < 10, `percentil ${justoAbajo.percentile} con categoria «${justoAbajo.category.label}»`);
  }
});

/* ------------------------------------------------- integridad de las tablas */

test('los cortes de cada tabla van siempre hacia arriba', () => {
  // Un numero mal tecleado deja una categoria a la que no se puede llegar.
  const subiendo = (xs, donde) => xs.forEach((v, i) => {
    if (i) assert.ok(v > xs[i - 1], `${donde}: ${xs[i - 1]} -> ${v} no sube`);
  });
  for (const [banda, porSexo] of Object.entries(N.NORMS.pushup.bands)) {
    for (const [sex, t] of Object.entries(porSexo)) subiendo(t.mins, `flexiones ${banda} ${sex}`);
  }
  for (const [banda, porSexo] of Object.entries(N.NORMS.squat.bands)) for (const [sex, t] of Object.entries(porSexo)) subiendo(t.mins, `sentadillas ${banda} ${sex}`);
  for (const [sex, d] of Object.entries(N.NORMS.plank.deciles)) subiendo(d, `plancha ${sex}`);
  for (const [k, d] of Object.entries(N.NORMS.plank.byAthleticStatus)) subiendo(d, `plancha ${k}`);
});

test('todas las categorias de cada tabla se pueden alcanzar', () => {
  const alcanzadas = (clasificar, max) => {
    const vistas = new Set();
    for (let v = 0; v <= max; v++) vistas.add(clasificar(v).category.index);
    return vistas;
  };
  for (const sex of ['M', 'F']) {
    for (const age of [18, 20]) {
      assert.equal(alcanzadas((v) => N.classifyPushups({ age, sex, reps: v }), 120).size, 5, `flexiones ${sex} ${age}`);
      assert.equal(alcanzadas((v) => N.classifySquats({ age, sex, reps: v }), 120).size, 7, `sentadillas ${sex} ${age}`);
      assert.equal(alcanzadas((v) => N.classifyPlank({ age, sex, seconds: v }), 400).size, 5, `plancha ${sex} ${age}`);
    }
  }
});

test('las categorias marcadas como no verificadas existen de verdad', () => {
  // Si una se escribe mal, la advertencia desaparece sin que nada falle, y la
  // app muestra como firme un corte que no se pudo confirmar.
  const claves = N.NORMS.pushup.categories.map(([k]) => k);
  for (const [banda, porSexo] of Object.entries(N.NORMS.pushup.bands)) {
    for (const [sex, t] of Object.entries(porSexo)) {
      for (const k of t.unverified) {
        assert.ok(claves.includes(k), `flexiones ${banda} ${sex}: «${k}» no es una categoria`);
      }
    }
  }
});

test('la banda 15-19 avisa que el corte no esta verificado, y la 20-29 no', () => {
  // Es la salvedad que esta escrita en NORMS.pushup.caveat: tiene que llegar a
  // la pantalla, no quedarse en el comentario.
  assert.deepEqual(N.classifyPushups({ age: 19, sex: 'M', reps: 40 }).flags, ['unverified_cut']);
  assert.deepEqual(N.classifyPushups({ age: 19, sex: 'M', reps: 25 }).flags, []);
  assert.deepEqual(N.classifyPushups({ age: 20, sex: 'M', reps: 40 }).flags, []);
});

test('las sentadillas siempre avisan de la fuente dudosa', () => {
  // La tabla de ACE coincide cifra por cifra con un baremo de abdominales.
  // Mientras siga en uso, ningun resultado puede salir sin esa advertencia.
  for (const sex of ['M', 'F']) {
    for (const v of [0, 25, 44, 80]) {
      assert.deepEqual(N.classifySquats({ age: 20, sex, reps: v }).flags, ['questionable_source'], `${sex} ${v}`);
    }
  }
});

test('los baremos no se pueden modificar desde fuera', () => {
  assert.throws(() => { N.NORMS.pushup.bands['20–29'].M.mins[0] = 1; }, TypeError);
  assert.throws(() => { N.NORMS.plank.deciles.M[0] = 1; }, TypeError);
});

/* ------------------------------------------------------------- validacion */

test('un valor imposible se rechaza en vez de clasificarse', () => {
  for (const malo of [-1, NaN, Infinity, '20', null, undefined, {}]) {
    assert.throws(() => N.classifyPushups({ age: 20, sex: 'M', reps: malo }), RangeError, `reps=${malo}`);
    assert.throws(() => N.classifyPlank({ age: 20, sex: 'M', seconds: malo }), RangeError, `seconds=${malo}`);
  }
});

test('un sexo que no esta en las tablas se rechaza, no se adivina', () => {
  for (const s of ['X', '', null, undefined, 'm']) {
    assert.throws(() => N.classifyPushups({ age: 20, sex: s, reps: 20 }), RangeError, `sex=${s}`);
  }
});

test('las repeticiones a medias se truncan, no se redondean hacia arriba', () => {
  // Media flexion no es una flexion.
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 21.9 }).value, 21);
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 21.9 }).category.label, 'Regular');
  assert.equal(N.classifyPushups({ age: 20, sex: 'M', reps: 22 }).category.label, 'Bueno');
});

/* ---------------------------------------------------------------- perfil */

test('el indice exploratorio promedia solo lo que hay', () => {
  const p = N.classifyPushups({ age: 20, sex: 'M', reps: 22 });   // posicion 50
  const s = N.classifySquats({ age: 20, sex: 'M', reps: 25 });    // posicion 17
  const solo = N.fitnessProfile({ pushup: p });
  assert.equal(solo.position, p.position);
  assert.equal(solo.parts.length, 1);
  const dos = N.fitnessProfile({ pushup: p, squat: s });
  assert.equal(dos.position, Math.round((p.position + s.position) / 2));
  assert.equal(dos.parts.length, 2);
});

test('sin ninguna prueba el indice no inventa un numero', () => {
  const vacio = N.fitnessProfile({});
  assert.equal(vacio.position, null);
  assert.equal(vacio.label, null);
  assert.deepEqual(vacio.parts, []);
  assert.ok(vacio.note.length > 0, 'la salvedad tiene que estar igual');
});

test('el indice dice siempre que es exploratorio', () => {
  const p = N.classifyPushups({ age: 20, sex: 'M', reps: 22 });
  assert.match(N.fitnessProfile({ pushup: p }).note, /exploratorio|no es un puntaje validado/i);
});
