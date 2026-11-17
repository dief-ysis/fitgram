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

`npm test` arma el archivo publicado y comprueba que coincida con `src/` antes
de correr nada; si no coincide, falla ahí mismo y dice que corras `npm run
build`.

El script usa `test/*.test.mjs`, no la carpeta: `node --test test/` intenta
resolver el directorio como módulo y falla. Con el comodín, un archivo de
pruebas nuevo entra solo y no se queda sin correr por olvido.

```bash
npm run build     # escribe index.html desde src/
```

## Estructura

El código se escribe en **módulos ES de verdad**, uno por archivo en `src/`,
con `import` y `export`. Lo que se publica sigue siendo **un solo
`index.html`**, que arma `build.mjs`.

```
src/                    el código fuente
  index.template.html   el HTML y el CSS, con <!--MODULOS--> donde va el código
  norms.mjs  skeleton.mjs  synth.mjs  calidad.mjs  exercises.mjs
  history.mjs  validation.mjs  game.mjs  camara-errores.mjs
  app.mjs               la entrada: pantallas, cámara, runner
build.mjs               pega los módulos dentro del HTML
index.html              GENERADO. No editar a mano.
sw.js  manifest.webmanifest
```

| Módulo | Qué hace |
|---|---|
| `norms` | Baremos y clasificación (CSEP/ACSM, ACE, Strand et al. 2014). Solo 18–21 años. |
| `skeleton` | Landmarks de MediaPipe a articulaciones, suavizado, dibujo 2D y 3D. |
| `synth` | Personas sintéticas para probar el pipeline sin cámara. |
| `exercises` | Máquinas de estado que validan y cuentan cada repetición. |
| `history` | La serie de resultados de cada prueba y el cálculo del avance. |
| `validation` | Comparación con evaluadores humanos: acuerdo, Bland-Altman y CCI(2,1) con su intervalo. |
| `game` | Modo juego: recorrido, corredores y puntaje. Idea de Elias Hermosilla. |
| `calidad` | Mide el temblor de la detección y el tiempo sin ver, para saber si se puede confiar en el conteo. |
| `camara-errores` | Qué decir cuando la cámara no abre. Puro, sin DOM. |
| `app` | Pantallas, navegación, cámara y persistencia. |

### Por qué un build y no módulos sueltos

Servir `src/*.mjs` directamente sería más simple, pero el archivo único se gana
tres cosas que acá importan: funciona abierto desde el disco (los módulos ES no,
por CORS), el service worker no tiene que cachear diez rutas más para que la app
ande sin conexión, y el pitch promete «todo ocurre en el teléfono», cosa que se
comprueba abriendo un archivo.

El build no minifica, no transpila y no reordena nada: solo traduce los
`import`/`export` a la forma que ya usaba el archivo publicado y pega los
módulos en orden de dependencias.

```
import { a } from './x.mjs';   ->  const { a } = __mods["x"];
import * as N from './x.mjs';  ->  const N = __mods["x"];
export { a, b };               ->  return { a, b };
```

Así el archivo publicado se puede leer y comparar con la fuente línea por
línea. El orden lo calcula el build desde los `import`: cada módulo después de
los que importa, y entre módulos independientes, alfabético —para que el
archivo publicado no cambie de forma según el orden en que uno escriba los
`import`—. Si hay un ciclo, falla.

### Lo que no deja que esto se pudra

Un archivo generado dentro del repositorio tiene un riesgo obvio: que alguien
edite `index.html` a mano. El cambio funciona, se sube, y el siguiente build lo
borra sin decir nada. `test/construccion.test.mjs` no lo permite —compara el
`index.html` publicado con el que sale de `src/` y dice en qué línea
difieren—, y `npm test` corre `build.mjs --check` antes que las pruebas.

También falla si un módulo de `src/` no lo importa nadie: código que parece
vivo y no corre.

### Lo que esto arregló de las pruebas

Antes, `test/_load.mjs` **recortaba el texto de un pseudo-módulo de
`index.html`** y lo evaluaba con `new Function`. Funcionaba, pero se rompía con
cualquier cambio de formato y no servía para nada que tocara el DOM. Ahora las
pruebas hacen `import ... from '../src/x.mjs'`, como cualquiera.

Queda `loadFunction` solo para lo que no es un módulo: `sw.js`, que es un
service worker.

Las dependencias (`lib/`, `models/`, `wasm/`) están versionadas para que la app
funcione sin CDN. Las tipografías (`fonts/`, Barlow y Barlow Condensed, SIL OFL)
están auto-hospedadas: antes venían de Google Fonts, así que sin conexión no
cargaban y cada apertura de la app le avisaba a Google.

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

## Modo validación

La hoja de ruta compromete, como etapa de hoy: *«comparar FitGram con 2
evaluadores en 15 personas, meta de 95 % de acuerdo»*. Esto deja registrar esas
comparaciones y calcula el acuerdo.

Se activa en Ajustes → «Modo validación», o directo en
`index.html?modo=validacion`. Está apagado por omisión: es una herramienta para
el equipo, no para quien se evalúa.

Para cada persona y cada prueba se anota el conteo de FitGram y el de cada
evaluador sobre **la misma serie**. Después de una prueba real aparece un enlace
en la pantalla de resultado que abre el formulario con el conteo de la app ya
puesto.

Qué calcula, y por qué:

- **Acuerdo relativo (%)**: 100 % menos la diferencia contra el promedio de los
  evaluadores, relativa a ese promedio. Es el titular porque no tiene unidad y
  se puede promediar entre repeticiones y segundos.
- **Referencia = promedio de los evaluadores**, no uno de ellos. No hay motivo
  para tratar a un humano como la verdad.
- **Acuerdo entre los evaluadores.** Si los dos humanos no coinciden entre sí no
  existe patrón contra el cual comparar la app, y el 95 % no significa nada. La
  pantalla avisa cuando difieren más que la meta. Es la primera pregunta que
  hace cualquiera que sepa del tema.
- **Sesgo y límites de acuerdo** (Bland y Altman): si la app cuenta de más o de
  menos de forma sistemática, y cuánto puede desviarse en un caso cualquiera.
- **CCI(2,1)**: dos vías, efectos aleatorios, acuerdo absoluto, evaluador único
  (Shrout y Fleiss, 1979). Es lo que se reporta en la literatura del área. Con
  menos de 5 sujetos la pantalla lo muestra con una advertencia, porque no
  significa gran cosa.
- En las pruebas **cronometradas** no se informa el acuerdo exacto ni el «±1»:
  acertar el segundo exacto en un sostenido de 60 s no quiere decir nada.
- Cuando falta un dato se devuelve vacío, nunca un número inventado.

Las mediciones se guardan en su propia llave (`fitgram.validation.v1`) y
«Borrar mis datos de este teléfono» **no** las toca, para que una limpieza del
perfil no se lleve los datos del estudio. Igual viven solo en ese navegador: hay
que exportar seguido, con los botones de CSV (separado con `;`, decimales con
coma, para Excel) y JSON.

El CCI está verificado contra el ejemplo publicado de Shrout y Fleiss (1979):
6 sujetos, 4 jueces, CCI(2,1) = 0,29.

### Por qué no coinciden los conteos

Un 95 % de acuerdo no dice nada por sí solo: lo que hay que poder responder es
**qué pasa en el resto**. No es lo mismo que a la app se le escape una
repetición a que la haya visto, la haya rechazado por técnica y el evaluador
humano la haya contado igual. Lo primero es un error de detección; lo segundo es
una diferencia de criterio, y se discute con quien puso los criterios.

Por eso, cuando la medición se anota desde la pantalla de resultado, viaja con
el resumen de esa corrida: cuántos intentos descartó la app, con qué motivo cada
uno y por qué terminó la serie. El formulario lo dice antes de guardar. Una
medición tecleada a mano no lo lleva, y se marca como tal en vez de suponerlo.

Con eso cada diferencia queda clasificada:

| | |
|---|---|
| `acuerdo` | el mismo conteo. Media repetición de diferencia solo aparece cuando los dos evaluadores no coinciden entre sí, así que tampoco es un fallo de la app |
| `criterio` | la app contó menos, pero descartó al menos esa cantidad por técnica: las vio y las rechazó |
| `interrumpida` | contó menos y hubo un rato en que no estaba mirando (alguien se cruzó, se cortó la imagen) |
| `noDetectadas` | contó menos sin ninguna de las dos excusas: se le escaparon |
| `deMas` | contó más que los evaluadores |
| `sinDato` | hay diferencia, pero la medición se tecleó sin la corrida |

En las pruebas cronometradas no se clasifica: una diferencia de segundos no es
una repetición.

La pantalla resume el desglose y nombra **el criterio que más veces choca con
los evaluadores**, que es la pregunta útil para ajustar el protocolo. El CSV
lleva las columnas `descartadas`, `motivo_principal`, `termino` y
`clasificacion`; el JSON lleva además los motivos uno por uno.

Esto hay que tenerlo **antes** de tomar los datos: si el estudio se corre sin
adjuntar las corridas, después no hay forma de saber en qué consistía cada
diferencia.

Columnas que la corrida aporta al CSV: `descartadas`, `motivo_principal`,
`termino`, `clasificacion`, `temblor`, `calidad`, `sin_ver` y `reglas`.

### Con qué reglas se tomó cada medición

Si cambio un umbral de conteo mientras el estudio se está tomando, las
mediciones de antes y las de después dejan de ser comparables — y el CSV
saldría con 45 filas que parecen una sola tanda. Un número de versión puesto a
mano no sirve, porque lo que se olvida es justamente subirlo.

Cada medición se sella con una **huella de las reglas**: un hash corto de tres
cosas.

| qué entra | por qué |
|---|---|
| `EX_CONFIG` | los umbrales con los que se cuenta |
| `SKELETON_CONFIG` | el suavizado cambia la señal sobre la que se mide |
| el código que decide qué cuenta | una corrección en la máquina de estados cambia el resultado sin tocar ni una constante |

La tercera la agregué después de que pasara: arreglar cómo se cierra una prueba
cuando la cámara se queda pegada cambió lo que mide la plancha, y la huella
anterior —que solo miraba la configuración— no se habría movido ni un carácter.
Habría dicho que las mediciones de antes y las de después son comparables. Una
garantía que falla justo cuando importa es peor que no tenerla.

El código entra como texto normalizado: sin comentarios y con los espacios
colapsados. Así, reindentar un bloque o arreglar una falta de ortografía en un
comentario no vuelve incomparables las mediciones de ayer, pero cambiar una
condición sí.

Quedan fuera a propósito los textos de los avisos, los colores, los parámetros
de dibujo y todo lo que no cuenta nada: la pantalla de validación, el modo
juego, el historial. Reordenar un objeto tampoco cambia la huella.

La pantalla de validación avisa sola cuando entre las mediciones guardadas hay
más de una huella, y el CSV la lleva en la columna `reglas`.

### El CCI no viene solo

El CCI es el número con el que se defiende el estudio, y darlo solo —«CCI =
0,89»— suena más firme de lo que es. La guía que se usa habitualmente (Koo y
Li, 2016) juzga la reliabilidad por **el extremo bajo del intervalo de
confianza**, no por la estimación puntual.

La app ahora calcula ese intervalo: McGraw y Wong (1996), tabla 7, caso
CCI(A,1) — el mismo que `irr::icc` en R con `model="twoway"`,
`type="agreement"`, `unit="single"`. Hace falta el cuantil de la F, que no
viene en JavaScript: son unas cuarenta líneas (beta incompleta por fracción
continua, invertida por bisección), comprobadas contra las tablas publicadas.

La prueba que de verdad lo valida no es ninguna de esas: una fórmula mal
copiada da un intervalo que parece razonable y cubre el 70 % o el 100 % de las
veces. Así que `test/intervalo.test.mjs` **simula 400 estudios** con un CCI
conocido, del tamaño del real, y cuenta cuántas veces el intervalo acierta.
Tiene que dar 95 %.

Y lo que ese intervalo contesta, simulando 600 estudios de 15 personas con 3
mediciones cada una:

| Si el CCI de verdad es… | con 15 personas el piso queda en | con 30 |
|---|---|---|
| 0,95 | 0,88 | 0,91 |
| 0,90 | 0,78 | 0,83 |
| 0,85 | 0,68 | 0,74 |
| 0,75 | 0,52 | 0,60 |

Con los cortes habituales (0,75 «bueno», 0,90 «excelente»), 15 personas
alcanzan **solo si el acuerdo sale muy alto**. Está anotado para decidirlo con
el equipo antes de tomar los datos: cuánta gente medir es decisión de ellos,
y decidirlo después de ver los números es lo que un jurado puede objetar.

### Tomar los datos en terreno

La pantalla se armó probándola con el mouse, y tomar los datos es otra cosa:
teléfono en una mano, dos evaluadores cantando el conteo y una persona
esperando al frente. Lo que se cambió con ese uso en mente:

- **Borrar se puede deshacer.** La `×` queda al lado del dato en una pantalla de
  teléfono. Antes un toque mal puesto borraba la medición para siempre y sin
  avisar; ahora aparece «Deshacer» con el código y la prueba de lo que se borró.
- **Avisa si la persona ya tiene esa prueba.** Dos mediciones del mismo
  participante en la misma prueba pesan doble en el acuerdo. Puede ser una
  repetición legítima o puede ser que se perdió la cuenta: la pantalla muestra
  la medición anterior y deja elegir entre reemplazarla o guardar las dos. No lo
  decide el código.
- **El código del participante se queda** después de guardar, el formulario
  salta solo a la prueba que le falta a esa misma persona y el foco cae en el
  primer número. Volver a escribir el código en cada prueba es la forma más
  fácil de inventar un participante que no existe: `P1` y `P01` serían dos
  personas distintas. El campo además sugiere los códigos ya usados y dice qué
  pruebas lleva esa persona. «Otro participante» parte en limpio.
- **Enter pasa al campo siguiente** y, en el último, guarda. Con el teclado del
  teléfono abierto, cada toque de más es un toque sobre un dato a la vista.
- **Avisa de lo que no está respaldado**: cuántas mediciones se guardaron desde
  la última exportación. Después de exportar queda la hora a la vista, no un
  «listo»: que el navegador haya iniciado la descarga no prueba que el archivo
  quedó guardado, sobre todo en iOS.
- **El respaldo se puede volver a cargar.** Ver abajo.

Esto se verificó manejando la pantalla desde el navegador como lo haría un dedo
—19 comprobaciones sobre el flujo completo: guardar con Enter, duplicado,
reemplazo, borrado, deshacer, cambio de participante y exportación—, además de
las pruebas de `node --test` sobre la lógica.

### El respaldo tiene que poder volver

Las 45 mediciones del estudio viven en el `localStorage` de un teléfono. Había
cómo sacarlas (CSV y JSON) y no había cómo volver a meterlas: el respaldo era
una puerta de salida sin entrada. Si el navegador limpia los datos del sitio,
si alguien toca «borrar todo», si el teléfono se resetea o si hay que seguir
desde otro equipo, el archivo exportado no servía de nada.

«Cargar respaldo» lee el mismo JSON que exporta el botón de al lado. La regla
de la que cuelga todo lo demás es **juntar, nunca reemplazar**: cargar un
respaldo de ayer encima de un día de trabajo no puede borrarlo.

| caso | qué hace |
|---|---|
| medición que ya está (mismo `id`) | la deja como está, así cargar dos veces el mismo archivo no duplica nada |
| choque: mismo participante y prueba, otra medición | **la agrega igual** y avisa cuáles son |
| fila rota | la cuenta y sigue: una línea mala no puede costar las otras cuarenta |
| archivo que no es el JSON | lo dice y no toca nada |

Lo del choque es la decisión que importa. Perder una medición en silencio es
peor que tener dos: la pantalla ya sabe avisar de los duplicados, y cuál vale
lo decide quien tomó los datos. El código no descarta nada.

El viaje completo está verificado en el navegador —exportar, borrar todo,
cargar, y que las mediciones vuelvan con su diagnóstico intacto (lo que la app
descartó, el tiempo sin ver, la huella de las reglas)— además de
`test/respaldo.test.mjs`.

### Rescatar la corrida de una medición ya tomada

La corrida de la app —qué descartó, por qué, cuánto rato no vio, con qué
reglas contó— se adjuntaba **solo** desde la pantalla de resultado, en el
momento. Si se salía de ahí (alguien tocó «Volver», se recargó la página, el
teléfono pasó a otra mano), no había forma de volver a ella: la medición
quedaba clasificada `sinDato` aunque el resultado siguiera guardado en el
teléfono. El dato estaba; faltaba el camino.

Ahora, al entrar a la validación sin venir de un resultado, la pantalla ofrece
la última medición de esa prueba guardada en el teléfono, con **la hora y el
número** para poder reconocerla: «La última Flexiones medida en este teléfono
fue a las 16:44 y dio 20 rep». No se adjunta sola, porque cuál persona hizo esa
serie la app no lo sabe.

Rescatar abre un riesgo que antes no existía: adjuntar la misma corrida a dos
participantes dejaría el diagnóstico mal en las dos, y en silencio. Por eso
cada corrida guarda ahora **cuándo midió la app** (distinto de cuándo se tecleó
la medición), y si esa corrida ya está en otra medición, la pantalla lo dice
con el código de esa persona. Avisa; no prohíbe.

Esa fecha va también al CSV, en la columna `fecha_corrida`: para revisar un
dato raro después hace falta saber a qué hora se tomó, no solo qué día se
anotó.

## Los baremos, contra las tablas publicadas

`norms` produce la categoría que ve la persona y que va a ver el jurado. Un
error ahí no se nota: la app sigue dando un número y una palabra con la misma
seguridad de siempre, solo que la palabra no corresponde. Tenía cinco pruebas
que casi no tocaban la clasificación.

`test/baremos.test.mjs` escribe de nuevo los cortes de CSEP y de ACE a partir
de las tablas publicadas —no copiados de lo que el código hace hoy, porque
entonces no comprobarían nada— y verifica cada corte por los dos lados. Además:

- La tabla que se muestra en pantalla y la categoría que se entrega se calculan
  por separado, así que pueden contradecirse. Ahora se comprueba que no.
- «Te faltan N repeticiones» lleva exactamente a la categoría siguiente, para
  todos los valores de 0 a 60 de las cuatro tablas.
- Hacer más nunca baja de categoría, y el percentil de la plancha nunca baja.
- En cada decil publicado, el percentil da ese número exacto.
- Los cortes de cada tabla suben siempre y todas las categorías se pueden
  alcanzar: un número mal tecleado dejaría una categoría inalcanzable.
- Las categorías marcadas como «no verificadas» existen de verdad. Si una se
  escribiera mal, la advertencia desaparecería sin que nada fallara y un corte
  sin confirmar se mostraría como firme.
- Las sentadillas nunca salen sin la advertencia de la fuente dudosa.

**Resultado: ningún error.** Los 26 casos pasan, cortes CSEP y ACE incluidos.
El módulo estaba bien; lo que faltaba era poder afirmarlo.

Lo que sí apareció fue al lado. La etiqueta de la tabla («Baremo CSEP/ACSM ·
hombres 20–29 · desde los pies») se armaba con el perfil **actual**, mientras
que la clasificación usa el perfil con el que se midió. Después de «Cambiar
edad o sexo» en Ajustes, un resultado viejo podía mostrar «mujeres · con apoyo
de rodillas» encima de una medición clasificada con la tabla de hombres. En
flexiones no es un matiz: el protocolo de CSEP es físicamente otro ejercicio.

### El esqueleto, que alimenta a todo lo demás

`skeleton` convierte los puntos de MediaPipe en articulaciones y los suaviza.
Las pruebas sintéticas lo ejercitan de paso, pero solo verían un error grueso:
si el filtro se arrastrara medio segundo, o si un `NaN` le envenenara el
estado, lo que se ve después es un conteo raro, no un error, y la culpa parece
del analizador.

`test/esqueleto.test.mjs` lo mide en vez de suponerlo:

| | medido | por qué importa |
|---|---|---|
| ruido en reposo | lo divide por **2,7** | menos que eso y el filtro no está haciendo su trabajo |
| retraso en una bajada de flexión | **0,35 cuadros** | si se arrastrara, el fondo del movimiento llegaría tarde y la repetición podría no alcanzar el umbral de profundidad |
| tras un hueco de 3 s | sigue el dato nuevo, error < 0,02 | el paso de tiempo grande hace que casi no promedie con lo viejo, que es lo correcto cuando ya hay poca información |

Y las propiedades que, si se rompieran, no darían error sino números
equivocados: un `NaN` pasa de largo sin quedarse guardado (si se guardara, ese
punto quedaría ciego para siempre); cada punto se filtra por su cuenta (si se
mezclaran, el temblor de una mano movería la cadera); `smooth()` no toca el
cuadro que recibe (el temblor se mide sobre los puntos **sin** suavizar, así
que mutarlo dejaría esa medición midiendo lo suavizado); la corrección de
proporción va solo en el eje horizontal (en los dos, los ángulos dependerían
de la forma de la imagen y el conteo dependería del teléfono); y mover a la
persona entera mueve el esqueleto entero igual, que es la forma de comprobar
que los pesos de cada articulación derivada suman 1.

**Resultado: ningún error** en los 27 casos. Lo que sí corregí fue un
comentario: decía «about one frame of lag» y la medición da 0,35 cuadros, y
remitía a unas pruebas que en este repositorio no existían.

## ¿Se puede confiar en esta medición?

La app contaba repeticiones con la misma seguridad, viera lo que viera. Midiendo
el generador sintético con el motor real se ve que el conteo **no se degrada de
a poco**: aguanta sin despeinarse y después se cae entero.

Dos resultados del barrido (12 semillas × fps × ruido, el analizador de verdad):

**Los cuadros por segundo no son el problema.** El mismo conteo exacto a 30, 20,
15, 10 y hasta 6 fps. Un teléfono lento no arruina la medición.

**El ruido en los puntos del cuerpo sí.** Con ruido alto la app llega a contar
**cero de trece repeticiones**, y antes de eso pasa por una zona peor: cuenta
cuatro de trece y las entrega como si nada, con su categoría y todo.

| temblor | qué pasaba con el conteo |
|---|---|
| hasta 0,025 | exacto en 24 de 24 corridas |
| 0,031 | empieza a perder alguna (23/24) |
| 0,037 | pierde en la mitad de los casos (18/24) |
| 0,046 | pierde casi siempre (11/24), 6 % de las repeticiones |
| 0,061 | catastrófico: 2/24, más de la mitad de las repeticiones perdidas |
| 0,076 | cuenta cero |

El módulo `calidad` mide ese temblor en vivo con la **segunda diferencia** de los
puntos clave: un movimiento rápido pero limpio tiene primera diferencia grande y
segunda chica, mientras que el ruido invierte la dirección cuadro a cuadro y
dispara la segunda. Por eso la medida da casi lo mismo a 30 que a 15 fps (0,0092
contra 0,0093): mide ruido, no velocidad. Se toma la mediana de la ventana para
que un cuadro perdido no la dispare, y se calcula sobre los puntos **sin
suavizar**, porque el filtro es justamente lo que se come el temblor.

Con eso la app:

- **avisa antes de empezar**, mientras la persona se acomoda, que conviene más
  luz o ropa ajustada — ahí todavía se puede arreglar. El aviso va aparte del
  estado de posición: la posición puede estar bien y la detección igual
  temblar, y decir que la posición está mal sería mentira;
- **avisa durante la prueba** si está francamente mal, una vez cada 12 s;
- en vivo **solo interrumpe el nivel grave**. El intermedio se marca en el
  resultado y nada más, porque los umbrales son provisorios y un aviso que
  salta de más deja de leerse;
- **marca el resultado** cuando la detección no fue confiable, antes que
  cualquier otra advertencia, porque cambia cómo hay que leer el número;
- **guarda el temblor con la medición de validación**, en las columnas `temblor`
  y `calidad` del CSV.

### Lo que probé y resultó no ser problema

Vale la pena dejarlo escrito, porque son las preguntas que hace cualquiera:

- **Teléfono lento.** Conteo exacto a 30, 20, 15, 10 y hasta 6 fps.
- **Orientación de la imagen.** Vertical, horizontal y cuadrada: idénticas.
- **Hacia qué lado mira la persona.** Izquierda o derecha: idénticas.
- **Variante de rodillas** (la que el protocolo CSEP usa con mujeres): cuenta
  igual de bien que la de puntas, en los dos sentidos.

Barridos con el analizador de verdad. Nada de esto necesitó un arreglo; lo que
sí lo necesitaba son el temblor (arriba) y las interrupciones (abajo). Quedan
fijados en `test/robustez.test.mjs`, para que la respuesta siga siendo cierta
y no quede solo escrita acá.

### Cuando la app no estaba mirando

Otra cosa que medí, y esta sí dejaba un número malo sin avisar: **alguien que
se cruza delante de la cámara**. Es el escenario del stand, con el teléfono en
un trípode y gente pasando.

Tapando a la persona en medio de una serie de 15 flexiones:

| tapada | repeticiones contadas | cómo termina |
|---|---|---|
| 0,3 s | 15, siempre | normal |
| 0,8 s | 13 a 15 | normal |
| 1,5 s | 13 a 14 | normal |
| 3 s | 12 a 14 | normal |
| 5 s o más | la prueba se aborta (`not_visible`) | avisa |

El problema no son las repeticiones perdidas —no se puede contar lo que no se
ve— sino que **la prueba terminaba «normal»** y entregaba 12 de 15 con la misma
seguridad de siempre.

El analizador ya llevaba la cuenta de ese tiempo (`S.frozen`), nunca lo
mostraba. Ahora sale en el resultado, en el aviso y en la columna `sin_ver`
del CSV. Y la validación lo distingue: una diferencia con una interrupción de
por medio se clasifica como `interrumpida`, no como `noDetectadas`; culpar al
detector por algo que pasó delante de la cámara serían dos arreglos distintos.

La plancha se comporta al revés y hay que decirlo así: su reloj corre sobre el
tiempo real a propósito, de modo que un corte corto **no** le quita segundos —
se los cuenta sin poder comprobar la posición. Aguanta hasta 3 s sin inmutarse
y a los 5 s aborta. El aviso de la plancha dice eso, no lo otro.

Para no tener que adivinar, Ajustes → «Mostrar la estabilidad de la detección»
pone el número crudo en la imagen y en el resultado. Con eso se pueden comparar
condiciones reales —luz, ropa, distancia, teléfono, el lugar del pitch— y mover
los umbrales con datos en vez de con la intuición. Durante la demostración
sintética la vista previa muestra «—», y está bien: ahí se repite siempre el
mismo cuadro, así que no hay temblor que medir.

Los umbrales (0,030 y 0,045) son **provisorios**: salen del generador sintético,
que mete ruido independiente en cada punto y cada cuadro, mientras que el de
MediaPipe real está correlacionado. No hace falta adivinarlos: como cada medición
del estudio queda guardada con su temblor, las 45 corridas reales los van a
calibrar solas.

Verificado también con el motor real en el navegador: una corrida sintética
limpia da temblor 0,0093, nivel «bien», 13 repeticiones y ningún aviso — el mismo
número que el barrido offline.

### Y cuando la cámara se queda pegada

«No te veo» y «no me llegan cuadros» se ven igual desde la persona que está
haciendo la prueba, pero el analizador solo sabía contar la primera. Su cuenta
del tiempo sin ver vive dentro de `update()`, que es justo lo que deja de
pasar cuando la cámara se cuelga.

El caso concreto: la plancha son 60 segundos con el teléfono apoyado y nadie
tocándolo. Si la cámara se queda pegada en el segundo 20 y la persona toca
«Terminar» en el 60:

| | antes | ahora |
|---|---|---|
| segundos que informa | 60 | 20 |
| `sin_ver` | 0 | 40 |
| cómo termina | normal | `not_visible` |

Lo grave no era el número sino el `sin_ver` en cero: el diagnóstico que existe
para cazar justamente esto decía que la medición había salido limpia. En el
CSV habría quedado una fila de 60 segundos sin nada que la distinguiera.

Tres cambios, ninguno toca un umbral:

- **El analizador mira cuánto hace que no le llega un cuadro.** Al cerrar la
  prueba, un hueco cuenta como tiempo sin ver, y el reloj no pasa del último
  cuadro que de verdad llegó. Si el hueco supera `invisibleEndSec` —el mismo
  criterio que ya rige para no ver a nadie— la prueba termina como
  `not_visible`.
- **Un vigilante en la app.** Revisa cada segundo que sigan llegando cuadros,
  así la prueba no se queda esperando para siempre con la imagen congelada. Se
  revisa también al volver a la app, porque con la app en segundo plano los
  temporizadores se frenan y puede no haber alcanzado a correr.
- **La prueba se cierra con el reloj de pared, no con la marca del último
  cuadro.** Era lo que escondía el hueco: en vivo los cuadros vienen sellados
  con `performance.now()`, así que los dos relojes son comparables. En video no,
  y ahí se sigue usando la marca del cuadro.

Fijado en `test/camara-pegada.test.mjs`, incluidos los dos casos que **no**
tienen que cambiar: terminar una prueba normal, y un tropezón de 0,4 s, que es
un teléfono con calor y no una cámara colgada.

### Que un fallo no quede en silencio

Esto es la continuación del caso de la cámara pegada: lo que le pasa a la
persona cuando algo se rompe no es ver un error, es ver una pantalla que ya no
responde y no saber por qué.

**El bucle de cuadros moría con una sola excepción.** El reagendado del
siguiente cuadro iba *después* de procesar el actual, así que cualquier error
ahí adentro cortaba el bucle para siempre: el video seguía corriendo, el
esqueleto y el conteo quedaban congelados y nada lo decía. Ahora se aguanta un
tropezón y se sigue; si falla diez veces seguidas (o sesenta en toda la
corrida) se detiene **diciendo la causa real**, y si era durante una serie, la
medición se cierra como `not_visible` en vez de darse por buena.

**El vigilante de cuadros ahora corre también en la vista previa**, no solo
durante la serie. Si la cámara se queda pegada mientras la persona se acomoda,
antes quedaba la imagen congelada sin un mensaje. No se dispara hasta que haya
llegado un primer cuadro: la cámara puede estar todavía encendiéndose y
declararla muerta ahí sería un falso aviso.

**Y una red de seguridad para lo que nadie atrapó**: un error no capturado o
una promesa rechazada ponen un aviso arriba con el mensaje real. Si estaba en
curso una prueba, agrega que ese resultado no es confiable. El aviso tiene su
propio estilo y no el de la barra del modo stand, porque esa se oculta en modo
prueba, que es justo cuando más importa verlo. Solo informa: no toca el estado
de la app, porque el error pudo venir de cualquier parte —una extensión del
navegador, por ejemplo— y cerrar una prueba buena por algo ajeno sería peor que
el aviso.

Verificado en el navegador: 19 comprobaciones, incluidas que cinco tropezones
seguidos no matan el bucle y que el aviso se ve con la app en modo prueba.

## Sin conexión

`sw.js` guarda la app en el teléfono. Con Ajustes → «Preparar para usar sin
conexión» se bajan el detector y los dos modelos (unos 29 MB) y después la app
**abre y mide en modo avión**, sin pedirle nada a ningún servidor.

Vale para una feria con WiFi mala, y de paso convierte la promesa del pitch
—«el video no sale del celular»— en algo que se puede comprobar en vez de solo
afirmarlo: se pone el teléfono en modo avión y la medición sigue funcionando.

Tres políticas de caché, según el archivo:

| Clase | Qué | Estrategia | Por qué |
|---|---|---|---|
| `document` | `index.html` | primero la red, caché si falla | al revés quedarían pegados en una versión vieja |
| `shell` | código, tipografías, iconos | caché primero, refresco en segundo plano | arranque instantáneo |
| `heavy` | `.wasm` y `.task` | caché primero, sin refrescar | binarios inmutables de 6 a 13 MB |

Los pesados **no** se bajan al instalar: son 29 MB y quien solo entra a mirar no
debería pagarlos. Se guardan cuando se usan, o todos de una con el botón.

Con `manifest.webmanifest` la app se puede agregar a la pantalla de inicio y
abre a pantalla completa, sin barra del navegador. Útil para el teléfono del
stand.

`index.html` **no** se precarga a propósito: si se precargara, cada publicación
obligaría a subir `VERSION` para no servir una copia vieja, y olvidarlo es el
error clásico con los service workers. Como el documento va primero a la red,
cada visita con conexión refresca la copia guardada sola.

> `VERSION` en `sw.js` solo hay que subirlo cuando cambian las listas de
> archivos o la lógica de `sw.js`. Cuando hay una versión nueva la app muestra
> una barra «Actualizar», en vez de cambiarla por debajo mientras alguien está
> en medio de una prueba.

Verificado de verdad: se instala, se apaga el servidor y la app sigue abriendo
y mostrando todo, tipografías incluidas.

## Modo juego

Idea de **Elias Hermosilla**, del prototipo KineVision AI. Un «flappy» manejado
por la altura del press militar: las muñecas mueven el avatar y hay que pasar
por corredores abiertos a alturas fijas.

Lo que lo hace algo más que un juego es que las secuencias son metodología de
entrenamiento. Hipertrofia pide sostenidos arriba y bajadas controladas; fuerza
máxima, isométricos largos; potencia, empujes rápidos. Un tramo isométrico es
un corredor largo, así que sostener la altura y pasar el corredor son la misma
regla.

Se llega desde la tarjeta al final de la pantalla «Evaluar». El pitch dice que
el juego va en el stand *«como gancho, no como parte de la solución»*, y acá se
respeta: **no entrega nivel, no usa baremos y no se guarda nada** en el perfil.

Detalles de la adaptación:

- Portado de React/TypeScript a la arquitectura de un solo archivo, con la
  lógica en un pseudo-módulo puro y probado, y el dibujo en el módulo de la app.
- **Reusa el detector de pose que la app ya tiene.** No hay un segundo motor.
- Calibración en dos pasos (manos en los hombros, brazos estirados arriba) con
  mediana, en vez de los modales del original.
- Tolerancia de 0,12 s fuera del corredor antes de perderlo: con tolerancia
  cero, un solo cuadro de ruido del detector arruinaba la partida.
- Aspecto de FitGram, no de KineVision: esquinas rectas, la misma paleta.

### Lo que no se portó, y por qué

| Del prototipo de Elias | Por qué no |
|---|---|
| Módulo de flexiones en 30 s | FitGram ya mide flexiones, pero con otro protocolo (hasta la fatiga, CSEP). Tener las dos daría dos números distintos para el mismo ejercicio, sin forma de compararlos. |
| Motor de ROM | Se solapa con la validación angular que la app ya hace en cada repetición. |
| Evaluadores de CMJ y FMS | Son código muerto en el original: no los importa nadie, pese a que la descripción los promete. |
| `@google/genai` | Declarado en `package.json` con una variable de API, cero usos en el código. |

## Modo stand

Para una feria, donde el teléfono pasa de mano en mano. Se activa en Ajustes →
«Modo stand», o en `index.html?modo=stand`. Resuelve tres cosas que hacían
inusable la app en ese contexto:

1. **Las tablas son de 18 a 21 años**, y la pantalla de inicio solo ofrecía esas
   cuatro edades. Alguien de 40 no podía ni pasar de ahí. En modo stand se puede
   escribir cualquier edad; fuera del rango la app **cuenta las repeticiones y
   corrige la técnica igual, pero no muestra categoría**, y dice por qué. Nunca
   clasifica con una tabla de otra población.
2. **Los resultados de una persona quedaban guardados** y la siguiente veía un
   «avance» que no era suyo. En modo stand `saveStore` y `saveValid` salen antes
   de tocar `localStorage`: no se escribe nada. Hay un botón «Siguiente persona»
   siempre visible, y a los 4 minutos sin tocar nada se reinicia solo.
3. **El detector pesa varios MB.** Al entrar en modo stand se precarga, con el
   avance a la vista, para que nadie espere con gente mirando.

Al salir del modo stand la página se recarga, así que los datos reales que
hubiera guardados en ese teléfono vuelven intactos.

## Qué falta

- **Los baremos cubren solo 18 a 21 años** (`AGE_RANGE` en el módulo `norms`, la
  única fuente de verdad del rango). El pitch menciona escolares y mayores de
  60; para eso hacen falta otras tablas. Dato para el equipo: la tabla CSEP de
  flexiones **ya trae una banda 20–29**, y la de sentadillas de ACE dice
  **18–25**; la que limita el conjunto es la de plancha, que es de
  universitarios. Subir el rango es una decisión de ciencias del deporte, no del
  código, y por eso no la tomé.
- **La validación todavía no se corre.** La herramienta está; los datos no. Hay
  que medir a las 15 personas.
- **No hay backend ni cuentas.** Todo vive en el `localStorage` de ese teléfono:
  si se cambia de teléfono o se borra el navegador, el historial se pierde.
- `createLifter('videopose3d')` es un stub que devuelve `null`.
