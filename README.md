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

`test/_load.mjs` recorta un pseudo-módulo de `index.html` y lo evalúa en Node.
Solo sirve con módulos de lógica pura: los que tocan el DOM o `localStorage` no
se pueden cargar así.

## Estructura

Todo vive en `index.html`, en pseudo-módulos dentro de un solo `<script type="module">`:

| Módulo | Qué hace |
|---|---|
| `norms` | Baremos y clasificación (CSEP/ACSM, ACE, Strand et al. 2014). Solo 18–21 años. |
| `skeleton` | Landmarks de MediaPipe a articulaciones, suavizado, dibujo 2D y 3D. |
| `synth` | Personas sintéticas para probar el pipeline sin cámara. |
| `exercises` | Máquinas de estado que validan y cuentan cada repetición. |
| `history` | **Nuevo.** La serie de resultados de cada prueba y el cálculo del avance. |
| `validation` | **Nuevo.** Comparación con evaluadores humanos: acuerdo, Bland-Altman y CCI(2,1). |
| `game` | **Nuevo.** Modo juego: recorrido, corredores y puntaje. Idea de Elias Hermosilla. |
| `calidad` | **Nuevo.** Mide el temblor de la detección para saber si se puede confiar en el conteo. |
| `app` | Pantallas, navegación y persistencia. |

Las dependencias (`lib/`, `models/`, `wasm/`) están versionadas para que la app
funcione sin CDN. Las tipografías (`fonts/`, Barlow y Barlow Condensed, SIL OFL)
están auto-hospedadas: antes venían de Google Fonts, así que sin conexión no
cargaban y cada apertura de la app le avisaba a Google.

Fuera de `index.html` hay solo dos archivos de código: `sw.js` (el service
worker) y `manifest.webmanifest`.

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
| `noDetectadas` | contó menos y no descartó suficientes: se le escaparon |
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

Esto se verificó manejando la pantalla desde el navegador como lo haría un dedo
—19 comprobaciones sobre el flujo completo: guardar con Enter, duplicado,
reemplazo, borrado, deshacer, cambio de participante y exportación—, además de
las pruebas de `node --test` sobre la lógica.

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
  luz o ropa menos suelta — ahí todavía se puede arreglar;
- **avisa durante la prueba** si está francamente mal, una vez cada 12 s;
- **marca el resultado** cuando la detección no fue confiable, antes que
  cualquier otra advertencia, porque cambia cómo hay que leer el número;
- **guarda el temblor con la medición de validación**, en las columnas `temblor`
  y `calidad` del CSV.

Los umbrales (0,030 y 0,045) son **provisorios**: salen del generador sintético,
que mete ruido independiente en cada punto y cada cuadro, mientras que el de
MediaPipe real está correlacionado. No hace falta adivinarlos: como cada medición
del estudio queda guardada con su temblor, las 45 corridas reales los van a
calibrar solas.

Verificado también con el motor real en el navegador: una corrida sintética
limpia da temblor 0,0093, nivel «bien», 13 repeticiones y ningún aviso — el mismo
número que el barrido offline.

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
