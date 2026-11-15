# FitGram

Evaluación de condición física con la cámara del teléfono: tres pruebas
(flexiones, sentadillas, plancha), conteo de repeticiones válidas y comparación
con baremos publicados. Todo corre en el navegador; el video no sale del
teléfono.

## De dónde viene este repositorio

El primer commit es una copia sin cambios del código de **Jose Golborne**
([github.com/Joselille/fitgram](https://github.com/Joselille/fitgram), commit
`30467c9`, 27-10-2026), desarrollado con asistencia de IA por el equipo de
FitGram (Elias Hermosilla y Jose Golborne, Ciencias del Deporte, UNAB).

Está aparte a propósito, para que siempre se pueda distinguir el código base del
equipo de lo que vino después. **La propiedad del código base es de ellos; el
repositorio original no tiene licencia declarada.**

## Cómo correrlo

El archivo usa módulos ES, así que `file://` no sirve: hay que servirlo por HTTP.

```bash
npm run serve        # http://127.0.0.1:8787
```

Para la cámara en un teléfono hace falta HTTPS (`getUserMedia` lo exige).
GitHub Pages sirve para eso.

## Cómo probarlo

```bash
npm test
```

Las pruebas recortan el pseudo-módulo `history` de `index.html` y lo evalúan en
Node. No necesitan navegador porque ese módulo es lógica pura.

## Estructura

Todo vive en `index.html`, en pseudo-módulos dentro de un solo `<script type="module">`:

| Módulo | Qué hace |
|---|---|
| `norms` | Baremos y clasificación (CSEP/ACSM, ACE, Strand et al. 2014). Solo 18–21 años. |
| `skeleton` | Landmarks de MediaPipe a articulaciones, suavizado, dibujo 2D y 3D. |
| `synth` | Personas sintéticas para probar el pipeline sin cámara. |
| `exercises` | Máquinas de estado que validan y cuentan cada repetición. |
| `history` | **Nuevo.** La serie de resultados de cada prueba y el cálculo del avance. |
| `app` | Pantallas, navegación y persistencia. |

Las dependencias (`lib/`, `models/`, `wasm/`) están versionadas para que la app
funcione sin CDN y sin conexión.

## Qué cambió respecto del base

El código base guardaba **un solo resultado por prueba y lo sobreescribía** al
repetirla (`S.results[test] = result`). No había historial ni comparación, que
es justo lo que promete el pitch: *«repítela cada 4 semanas y mira cuánto
avanzas»*.

Ahora:

- `S.history` guarda la **serie completa** de cada prueba, ordenada por fecha.
  `S.results` queda como el último de cada serie, para no tocar el resto de las
  pantallas.
- Al terminar una prueba se **agrega** a la serie en vez de reemplazar.
- La pantalla de resultado muestra un bloque **«Qué cambió»**: la diferencia
  contra la medición anterior, cuántos días pasaron, si cambió de categoría del
  baremo y si es su mejor marca. En la primera medición dice que es el punto de
  partida, sin inventar una comparación.
- El perfil tiene una tarjeta **«Tu avance»**: cuándo toca repetir (cada 28
  días), el índice FitGram de cada evaluación con su variación, y por cada
  prueba un gráfico de la serie con las fechas y valores.
- El hub muestra la variación de cada prueba junto al resultado.
- Lo guardado de la versión anterior se migra solo: nadie pierde su medición.
- Tope de 50 mediciones por prueba, y el log de repeticiones se conserva solo en
  la última (localStorage ronda los 5 MB).

### Datos de demostración

El avance solo se ve con varias mediciones separadas en el tiempo. Para mirarlo
—o mostrarlo en una presentación— sin esperar dos meses:

| URL | Abre |
|---|---|
| `index.html?demo=historial` | El perfil con tres evaluaciones de ejemplo |
| `index.html?demo=pushup` | La pantalla de resultado de flexiones con el avance |
| `index.html?demo=squat` · `?demo=plank` | Lo mismo para las otras dos |

También desde la consola: `FITGRAM.seedDemoHistory()`.

Quedan marcados en pantalla como datos de demostración. Se borran con «Borrar
mis datos de este teléfono».

## Qué falta

- **Los baremos cubren solo 18 a 21 años.** El pitch menciona escolares y
  mayores de 60; para eso hacen falta otras tablas.
- **No hay validación contra evaluadores humanos.** La hoja de ruta la pone como
  etapa de hoy (15 personas, meta de 95 % de acuerdo) y no hay forma de
  registrarla en la app.
- **No hay backend ni cuentas.** Todo vive en el `localStorage` de ese teléfono:
  si se cambia de teléfono o se borra el navegador, el historial se pierde.
- `createLifter('videopose3d')` es un stub que devuelve `null`.
