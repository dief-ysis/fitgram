# FitGram — Historias de usuario

Historias escritas por José para FitGram v1 (13-nov-2026), la versión paralela de la app que hizo él. Se **adaptaron y auditaron el 22-nov-2026 contra el código de esta app** (`src/`). El texto de cada historia es el de José salvo donde la app ya cambió o hubo una decisión (está indicado). Cada nota «🔎 Nota» dice en qué difiere la app o qué falta. Formato: «Como <rol> quiero <acción> para <beneficio>», con criterios Dado/Cuando/Entonces. Complementa `ALCANCE_MVP.md` (incluye el glosario) y `ARQUITECTURA.md`. El original está en `docs/jose-v1/`.

**Idea central.** FitGram es diagnóstico, no adherencia: «Te mide el salto, pero no te dice dónde está tu salto». Mide y además compara a la persona con baremos científicos por edad y sexo.

**Cómo leer el estado.**
- **Hecho en código**: la app lo hace según la revisión del código; falta la prueba en equipos reales (Definición de Hecho, punto 4) y la revisión de otra persona (punto 8) (`ALCANCE_MVP.md` §7). Hoy ninguna historia llega a «Hecho» completo.
- **Otra forma**: la app cumple el objetivo de la historia, pero no los criterios tal como están escritos; la nota dice cómo.
- **Parcial**: falta parte de los criterios (la nota dice qué).
- **Pendiente**: entra al MVP y falta hacerlo.
- **Fuera (decidir)**: no está en esta app; que entre es decisión del equipo. («Won't (ahora)» se usa solo como prioridad.)
- **Futuro**: fuera del MVP.

**Prioridad (MoSCoW).** Must = sin esto no hay MVP. Should = importante, pero el MVP sobrevive sin ello. Could = deseable. Won't (ahora) = se decidió dejarlo fuera.

**Sprints.** De 2 semanas (calendario en `ALCANCE_MVP.md`). «Post» = después del MVP.

**Códigos de preguntas (A1, B2…).** Son preguntas abiertas para José y Elías, en `preguntas-para-jose-y-elias.md` (carpeta del proyecto, fuera del repositorio). Las que aparecen aquí:

| Código | Pregunta |
|---|---|
| A1 | ¿Alcanzan 15 personas para la validación? |
| A2 | ¿Qué se hace con una medición que la app marca como poco confiable? |
| A3 | ¿La prueba termina con dos malas seguidas? **Decidido el 22-nov: sí.** |
| A4 | ¿Cuál es la meta de la validación (concordancia ≥ 95 % o CCI y Bland-Altman)? |
| A5 | ¿Cómo se resuelve el consentimiento para guardar video en las series con video subido? |
| A6 | ¿Hace falta comité de ética? |
| A7 | ¿Quién guarda los datos del estudio y cómo? |
| A8 | ¿El análisis por subgrupos es exploratorio? |
| B2 | ¿Se amplía el rango de edad 18–21? |
| B5 | ¿Se sigue usando la tabla de sentadillas de ACE? |
| F1 | ¿Se calibra la profundidad de la sentadilla? |
| F2 | ¿Entran dominadas, fondos y la pregunta de si entrenas o compites? |
| F3 | ¿El modo stand pone una edad mínima o pide autorización a menores? |
| F4 | ¿Se oculta el juego antes del pitch? |
| F5 | ¿La tabla del baremo va de menor a mayor (criterio) o de mayor a menor (app)? |

**Términos de software.** «Épica» = grupo de historias sobre un mismo tema; «backlog» = la lista de historias por hacer; «Dado/Cuando/Entonces» = forma de escribir un criterio: situación, acción y resultado esperado. Los demás están en el glosario de `ALCANCE_MVP.md` §9.

**Nombres del código.** Lo que aparece entre `comillas de código` es el nombre de un archivo o función, para quien programa. Se puede saltar sin perder el sentido.

## Auditoría (22-nov-2026)

**Cuenta.** El alcance del MVP abarca estas historias: HU-01 a HU-52 sin HU-42 (que pasó a Futuro) y HU-61 a HU-66 (57 en total). De ellas, 40 están hechas en código, 6 resueltas de otra forma (HU-01, 03, 04, 07, 41, 49), 6 parciales (HU-32, 46, 48, 50, 51, 52), 1 pendiente (HU-65) y 4 fuera hasta que el equipo decida (HU-02, 26, 27 y 33: esta app no tiene esas pruebas ni esa pregunta). Las 9 de futuro siguen siendo futuro; del modo juego (HU-58) ya hay un prototipo.

**Ya decidido:** dos malas seguidas terminan la prueba (A3, 22-nov; ver HU-11 y HU-25).

**Lo que hay que decidir en equipo:**
1. **Meta de la validación** (HU-50; A1, A2, A4).
2. **Dominadas, fondos y la pregunta de si entrenas o compites** (HU-02, 26, 27, 33; F2).
3. **Rango de edad** (B2): hoy la app usa 18–21. Los criterios dicen «el rango vigente (hoy 18–21)» hasta que se decida.
4. **Sentadilla**: calibración o más rango (F1) y la fuente ACE (B5) cambian los criterios de HU-24.
5. **Menores en el modo stand** (HU-63; F3).
6. **Video, ética y datos del estudio** (HU-50, 51; A5 a A8).

**Problemas de redacción que siguen abiertos:**
- Criterios que no se pueden medir: HU-06 («unos segundos»), HU-15 («sin saltos bruscos»), HU-20 («dispersión alta»), HU-21 («diferencia grande»), HU-22 («más allá de lo esperado»), HU-11 («pausa larga»), HU-46 («mensaje claro»), HU-48 («se leen a 2,5 m»), HU-62 («detección temblorosa»: el umbral existe en la app pero es provisorio), HU-64 («se mantiene») y el requerimiento de batería («incómodo al tacto»). Conviene fijar un número. La app ya usa números (por ejemplo, 5° para «teléfono movido», 3 s entre mensajes de voz); escribirlos en el criterio es lo que falta.
- HU-02 y el README de la v1 describen preguntas distintas («entreno regularmente» frente a «compito en un deporte»).
- HU-09 usa como ejemplo los fondos, que no están en esta app.

**Lo que más pesa para el pitch (30-nov):** probar sensores, voz y rendimiento en la Lenovo Tab P12 (HU-17, 64, 65). En estos documentos, «teléfono» incluye tablets.

## Roles

| Rol | Quién es | Qué necesita |
|---|---|---|
| **Persona que entrena** | Joven del rango vigente, hoy 18 a 21 años (la v1 decía 18 a 30; pregunta B2), que ya entrena en gimnasio, en casa, en una plaza o parque. Es quien usa la app gratis. | Saber en qué nivel está y cómo avanza, sin ser experta en ciencias del deporte. |
| **Entrenador/a** | Profesional que evalúa a varias personas (por ejemplo, evaluar a un equipo de básquetbol de adultos mayores a ojo y escribir el informe a mano). Cliente de pago, futuro. | Dejar de contar a ojo y de armar informes a mano. |
| **Gimnasio o institución** | Gimnasio, colegio o universidad. Cliente de pago, futuro. | Saber cómo están sus usuarios y ofrecerles evaluación objetiva. |
| **Municipio** | Equipo de deporte o salud de una comuna. Cliente de pago, futuro. | Datos anónimos por comuna para sus metas de actividad física (por ejemplo, Elige Vivir Sano). |
| **Equipo FitGram** | José, Elías y David (desarrollo). | Un producto mantenible, documentado y validado. |

## Resumen por épica

| Épica | Historias |
|---|---|
| A. Perfil y onboarding | HU-01 a HU-05 |
| B. Evaluación en vivo | HU-06 a HU-11 |
| C. Video y demostración | HU-12 a HU-16 |
| D. Inclinación y sensores | HU-17 a HU-22 |
| E. Cada prueba | HU-23 a HU-28 |
| F. Resultados y baremos | HU-29 a HU-34 |
| G. Historial y avance | HU-35 a HU-38 |
| H. Datos y privacidad | HU-39 a HU-42 |
| I. Exportar y compartir | HU-43 y HU-44 |
| J. Accesibilidad e idioma | HU-45 a HU-48 |
| K. Calidad y validación | HU-49 a HU-52 |
| L. Futuro | HU-53 a HU-60 |
| M. Agregadas al adaptar | HU-61 a HU-66 |

Total: 66 historias (60 de la v1 de José y 6 agregadas al adaptar, épica M).

---

## A. Perfil y onboarding

### HU-01 · Indicar edad y sexo
**Como** persona que entrena **quiero** ingresar mi edad y mi sexo (y poder corregirlos después) **para** que FitGram me compare con las personas de mi grupo.
- **Dado** que abro la app por primera vez, **cuando** quiero empezar una prueba, **entonces** me pide edad (número entero) y sexo (M/F) antes de iniciarla.
- **Dado** que ingreso una edad dentro del rango vigente (hoy 18–21, pregunta B2), **cuando** guardo, **entonces** el perfil queda guardado en el teléfono y no se vuelve a pedir.
- **Dado** que corrijo mi edad o mi sexo, **cuando** hago una prueba nueva, **entonces** se clasifica con el perfil actualizado.
- Prioridad: **Must** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** La edad se elige con botones (18, 19, 20 o 21), no como número libre como dice el primer criterio; en modo stand se acepta cualquier edad. Se corrige desde Perfil.

### HU-02 · Indicar si entreno
**Como** persona que entrena **quiero** marcar si entreno regularmente **para** que, donde el baremo lo distingue (plancha), me compare con deportistas o con no deportistas.
- **Dado** que marco «entreno», **cuando** termino una plancha, **entonces** el percentil se calcula con el grupo de deportistas.
- **Dado** que no lo marco, **cuando** termino una plancha, **entonces** se usa el grupo de no deportistas (o el general si la tabla no distingue).
- **Dado** una prueba cuyo baremo no distingue por entrenamiento, **cuando** veo el resultado, **entonces** el valor marcado no cambia la categoría.
- Prioridad: **Should** · Sprint: S1 · Estado: **Fuera (decidir)**
- 🔎 **Nota (22-nov):** No existe en esta app: la plancha usa solo el percentil de universitarios por sexo (Strand 2014). Además el README de la v1 de José la llama «¿Compites en algún deporte?» y esta historia «si entreno regularmente»: no es la misma pregunta. Si entra es decisión de José y Elías (pregunta F2).

### HU-03 · Cambiar el rango de edad en un solo lugar
**Como** equipo FitGram **quiero** que el público objetivo (hoy 18 a 21 años) se defina en un único valor de configuración **para** ampliarlo o acotarlo tocando pocas líneas de código.
- **Dado** `AUDIENCE` en `src/config.js`, **cuando** cambio `minAge` o `maxAge`, **entonces** la pantalla de perfil y los mensajes de rango usan los nuevos valores sin editar otros archivos.
- **Dado** que `AUDIENCE` queda fuera de `NORMS_AGE` (18–30), **cuando** corro `node --test test/*.test.mjs`, **entonces** una prueba falla y avisa que no hay baremo para esas edades.
- **Dado** que se quiere ampliar el rango vigente (por ejemplo, hasta 30 años), **cuando** se revisa el cambio, **entonces** queda claro que además hay que cargar los baremos de esas edades en `src/norms.js` (la configuración sola no basta).
- Prioridad: **Must** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** el rango (hoy 18–21, pendiente de la pregunta B2) está en un solo lugar, `AGE_RANGE` en `src/norms.mjs`, junto a los baremos. No existen `src/config.js`, `AUDIENCE` ni `NORMS_AGE`, así que los criterios 1 y 2 no aplican tal como están escritos.

### HU-04 · Aviso si estoy fuera del rango de edad
**Como** persona fuera del rango (por ejemplo, 17 o 35 años) **quiero** que la app me diga con claridad que todavía no tiene baremo para mi edad **para** no recibir una clasificación que no corresponde.
- **Dado** una edad fuera del rango vigente (hoy menor de 18 o mayor de 21), **cuando** se pide clasificar, **entonces** `classify` lanza un `RangeError` con un mensaje en español y no se entrega categoría.
- **Dado** ese error, **cuando** lo muestra la pantalla, **entonces** el mensaje indica el rango válido (hoy 18 a 21 años) tomado del código, no escrito a mano.
- **Dado** que el sexo no es M/F, **cuando** se pide clasificar, **entonces** ocurre lo mismo: error en español y sin categoría.
- Prioridad: **Must** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** Fuera del rango vigente (hoy 18–21) la app **no se niega**: cuenta igual, muestra el resultado sin categoría y explica que no hay tabla para esa edad (en la pantalla de datos y en el resultado). El primer criterio habla de un error interno del código (`RangeError`); para la persona, lo que importa es que no ve una categoría inventada.

### HU-05 · Bienvenida y aviso de alcance
**Como** persona que entrena **quiero** entender en una pantalla qué hace la app, qué no hace y que no es una evaluación médica **para** usarla con expectativas correctas.
- **Dado** que abro la app por primera vez, **cuando** termino de leer la bienvenida (máximo 3 pantallas), **entonces** puedo seguir al perfil.
- **Dado** esa pantalla, **cuando** la leo, **entonces** dice que es una orientación exploratoria, que no reemplaza a un profesional de la salud y que el video no se guarda ni se envía.
- **Dado** que ya la vi, **cuando** vuelvo a abrir la app, **entonces** no se repite (pero puedo reabrirla desde el menú).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: bloque «Qué hace FitGram» en la pantalla de datos, solo la primera vez, y el mismo texto en Ajustes. Una pantalla en vez de las hasta tres del criterio.

---

## B. Evaluación en vivo

### HU-06 · Usar la cámara en vivo
**Como** persona que entrena **quiero** usar la cámara de mi teléfono en vivo **para** evaluarme sin necesitar a otra persona ni equipo especial.
- **Dado** que abro la app en un sitio HTTPS (o `localhost`), **cuando** acepto el permiso de cámara, **entonces** veo mi imagen con el esqueleto dibujado encima.
- **Dado** que rechazo el permiso, **cuando** vuelvo a la pantalla, **entonces** un mensaje en español explica cómo activarlo y ofrece la alternativa de subir un video.
- **Dado** que la cámara no encuentra a una persona, **cuando** pasan unos segundos, **entonces** se avisa que no se me ve completo y la prueba no cuenta.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Los errores de cámara (permiso rechazado, sin cámara, en uso por otra app) tienen mensajes propios y se ofrece subir un video.

### HU-07 · Elegir la prueba y ver el orden
**Como** persona que entrena **quiero** elegir qué prueba hacer, con las pruebas ordenadas en «Evaluación base» y «Pruebas con barra» **para** saber por dónde empezar y qué es opcional.
- **Dado** la lista de pruebas, **cuando** la abro, **entonces** veo primero la evaluación base (flexiones, sentadillas, plancha) y luego las pruebas con barra (dominadas, fondos), marcadas como opcionales.
- **Dado** que no tengo barra, **cuando** hago la evaluación base, **entonces** puedo terminarla y ver mi perfil sin hacer las pruebas con barra.
- **Dado** que cambio el orden en `TEST_ORDER`/`TEST_GROUPS` de la configuración, **cuando** recargo, **entonces** la lista refleja el cambio.
- Prioridad: **Must** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** solo hay evaluación base (3 pruebas, «Prueba 01 de 03»); las pruebas con barra dependen de la pregunta F2. El orden está en el código de la app (`ORDER` en `src/app.mjs`); `TEST_ORDER`/`TEST_GROUPS` no existen.

### HU-08 · Verificar la posición antes de empezar
**Como** persona que entrena **quiero** que la app compruebe que estoy bien puesta frente a la cámara **para** no perder una prueba por mal encuadre.
- **Dado** que elijo una prueba, **cuando** me pongo en la posición de partida, **entonces** la app valida (`check`) que se me ve el cuerpo completo y me dice «OK» o qué corregir (por ejemplo, «Aléjate un poco»).
- **Dado** que la posición no es válida, **cuando** intento empezar, **entonces** la prueba no parte y se muestra el motivo.
- **Dado** una prueba en vivo, **cuando** toco «Iniciar», **entonces** hay una cuenta de 10 s para ponerme en posición, y la prueba parte cuando mantengo la posición válida 1 s (en la plancha, cuando el analizador la confirma).
- **Dado** que la posición es válida, **cuando** empiezo, **entonces** la fase pasa de «esperando» a «activa».
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-09 · Contar repeticiones válidas en vivo
**Como** persona que entrena **quiero** ver el contador subir solo con las repeticiones que cumplen la técnica **para** que el número sea comparable con el baremo.
- **Dado** que la prueba está activa, **cuando** hago una repetición que cumple el protocolo, **entonces** el contador sube 1 de inmediato.
- **Dado** una repetición que no cumple (por ejemplo, no llego a los 90° de codo en fondos), **cuando** termina, **entonces** no suma y queda registrada como inválida con su motivo.
- **Dado** que la prueba termina, **cuando** veo el resumen, **entonces** aparecen las repeticiones válidas y el número de inválidas.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** El ejemplo de los criterios (fondos a 90°) no aplica: en esta app sería «la sentadilla no llega a muslos paralelos» o «la flexión no baja lo suficiente».

### HU-10 · Avisos de técnica mientras hago la prueba
**Como** persona que entrena **quiero** recibir avisos cortos de técnica (bien / cuidado / mal) **para** corregirme sin parar la prueba.
- **Dado** que la prueba está activa, **cuando** mi técnica se desvía (por ejemplo, la cadera cae en la plancha), **entonces** aparece un aviso de nivel «warn» o «bad» con un mensaje corto en español.
- **Dado** que corrijo la postura, **cuando** vuelvo a cumplir, **entonces** el aviso desaparece o pasa a «good».
- **Dado** varios avisos seguidos, **cuando** llegan, **entonces** se muestra uno solo a la vez y los demás quedan en el registro de eventos.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Desde el 22-nov los avisos también se dicen en voz alta (conteo, repetición no válida, técnica, posición antes de empezar, detección inestable, teléfono movido).

### HU-11 · Terminar la prueba «hasta el fallo»
**Como** persona que entrena **quiero** que la prueba termine cuando ya no puedo seguir con buena técnica (o cuando yo la detengo) **para** obtener mi máximo real, sin límite de tiempo.
- **Dado** una prueba de repeticiones o la plancha, **cuando** pierdo la posición o dejo de cumplir la técnica, **entonces** la prueba termina sola y muestra el motivo (técnica, pausa, posición perdida o no se me ve).
- **Dado** que quiero parar, **cuando** toco «Terminar», **entonces** la prueba termina con el motivo «manual» y se conserva lo logrado hasta ahí.
- **Dado** una prueba de repeticiones, **cuando** hago una pausa larga, **entonces** termina con el motivo «pausa» (no hay límite de tiempo total; no se usan tests de 1 minuto).
- **Dado** una prueba de repeticiones, **cuando** hago dos repeticiones no válidas seguidas, **entonces** la prueba termina al final de la segunda con el motivo «técnica» (decisión A3). En la plancha, que no tiene repeticiones, la misma regla es: dos avisos de técnica seguidos sin corregir (ver HU-25).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Criterio agregado por la decisión A3 (22-nov): se prioriza la técnica sobre el máximo y se protege la salud de quien se evalúa. La app ya lo hace.

---

## C. Video y demostración

### HU-12 · Subir un video de mi galería
**Como** persona que entrena **quiero** elegir un video que ya grabé **para** evaluarme sin cámara en vivo (por ejemplo, desde el computador o con un amigo filmando).
- **Dado** un video de mi galería, **cuando** lo elijo, **entonces** se analiza en mi teléfono y veo el esqueleto y el conteo igual que en vivo.
- **Dado** un video donde no aparece el cuerpo completo, **cuando** termina el análisis, **entonces** se avisa que el resultado puede no ser confiable.
- **Dado** que el video no trae sensores, **cuando** se analiza, **entonces** la inclinación se estima con la postura de partida (ver HU-20).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** El aviso de resultado poco confiable sale de cuánto tembló la detección y de los segundos en que la app no te vio.

### HU-13 · Grabar un video desde la app
**Como** persona que entrena **quiero** grabar mi prueba desde la app y analizarla **para** hacerla en un lugar donde no tengo buena señal o donde prefiero ver el resultado después.
- **Dado** que elijo «grabar video», **cuando** termino de grabar, **entonces** el video se analiza en el teléfono y se muestra el resultado.
- **Dado** que el análisis termina, **cuando** cierro el resultado, **entonces** el video no queda guardado en ningún lugar de la app (ver HU-40).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**

### HU-14 · Ver una demostración
**Como** persona que recién conoce la app (o como persona que quiere mostrársela a otra) **quiero** una demostración con una persona sintética **para** entender cómo funciona sin ponerme a hacer ejercicio.
- **Dado** que toco «Demostración», **cuando** elijo una prueba, **entonces** se reproduce una persona sintética haciendo esa prueba, con esqueleto, conteo y resultado.
- **Dado** la demostración, **cuando** termina, **entonces** el resultado NO se guarda en mi historial ni en mi perfil.
- Prioridad: **Could** · Sprint: S1 · Estado: **Hecho en código**

### HU-15 · Ver mi esqueleto 2D sobre el video
**Como** persona que entrena **quiero** ver el esqueleto dibujado sobre mi imagen **para** confirmar que la app me está siguiendo bien.
- **Dado** que la cámara me ve, **cuando** me muevo, **entonces** los 33 puntos de MediaPipe se dibujan sobre mi cuerpo y siguen el movimiento sin saltos bruscos (suavizado con filtro 1€).
- **Dado** que un punto tiene visibilidad baja, **cuando** se dibuja, **entonces** se muestra atenuado o no se muestra, no con una posición inventada.
- **Dado** que se corrige la inclinación, **cuando** se dibuja, **entonces** el esqueleto usa el cuadro crudo (sin corregir), para que coincida con la imagen.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-16 · Ver mi esqueleto en 3D
**Como** persona que entrena **quiero** ver mi esqueleto en 3D (17 articulaciones, formato Human3.6M) **para** entender mejor mi postura y mi movimiento.
- **Dado** que MediaPipe entrega puntos «world», **cuando** abro la vista 3D, **entonces** se muestra el esqueleto de 17 articulaciones que puedo girar.
- **Dado** que no hay puntos 3D en un cuadro (`world = null`), **cuando** se dibuja, **entonces** la vista 3D no se rompe (no muestra nada o mantiene el último cuadro válido).
- **Dado** que esta es la vista de MediaPipe, **cuando** la leo, **entonces** no promete precisión de laboratorio (el 3D con VideoPose3D es fase 2, ver HU-60).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Además: después de la prueba se puede reproducir el movimiento en 3D desde el inicio (frente, lado, arriba). Desde el 22-nov la vista 3D usa la pose enderezada por la inclinación.

---

## D. Inclinación y sensores

### HU-17 · Detectar qué sensores tiene mi teléfono
**Como** persona que entrena **quiero** que la app detecte si mi teléfono tiene giroscopio y acelerómetro **para** usarlos y medir la inclinación de la cámara.
- **Dado** un teléfono con sensores, **cuando** empiezo una evaluación, **entonces** la app informa cuáles hay (orientación, acelerómetro, giroscopio) y empieza a recibir sus datos.
- **Dado** un computador o un teléfono sin sensores, **cuando** empiezo, **entonces** la app lo detecta, sigue funcionando y usa la estimación por imagen (HU-20).
- **Dado** que el teléfono está quieto, **cuando** se toman las lecturas, **entonces** se marca `still = true` y la inclinación se considera confiable.
- **Dado** Ajustes, **cuando** toco «Probar sensores» con el teléfono quieto, **entonces** la app muestra qué sensores respondieron y la inclinación medida (diagnóstico).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: «Probar sensores» muestra también la inclinación medida. Falta probarlo en la Lenovo Tab P12 y en un iPhone. **Lo principal de esta historia solo se confirma en un equipo real; hasta entonces, «Hecho en código» no garantiza que funcione.**

### HU-18 · Pedir el permiso de movimiento en iPhone
**Como** persona con iPhone **quiero** que la app me pida el permiso de sensores de movimiento en el momento correcto **para** que la corrección de inclinación funcione.
- **Dado** un iPhone con iOS 16.4 o superior, **cuando** toco «Comenzar», **entonces** el permiso se solicita dentro de ese toque (requisito de iOS).
- **Dado** que rechazo el permiso, **cuando** sigo, **entonces** la app continúa con la estimación por imagen y lo informa con un mensaje claro.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: con el permiso rechazado, el aviso bajo la imagen dice «Sin permiso de sensores». Falta probarlo en un iPhone. **Lo principal de esta historia solo se confirma en un equipo real; hasta entonces, «Hecho en código» no garantiza que funcione.**

### HU-19 · Corregir la pose según la inclinación del teléfono
**Como** persona que entrena **quiero** que la app mida cuánto está inclinada la cámara y corrija la pose **para** que una toma torcida no se confunda con una persona inclinada.
- **Dado** una cámara con roll de 10° hecha con el teléfono quieto, **cuando** se analiza una sentadilla, **entonces** la pose se rota para alinear la gravedad con el eje vertical de la imagen y el conteo es el mismo que con la cámara derecha.
- **Dado** una pose corregida, **cuando** se revisa el cuadro, **entonces** trae `corrected = true` y los datos de inclinación (roll, pitch si se conocen); el cuadro original no se modifica.
- **Dado** Ajustes, **cuando** desactivo «Corregir la inclinación del teléfono», **entonces** el análisis usa la pose sin corregir (la opción está activada por defecto).
- **Dado** que el roll supera 45°, **cuando** se evalúa, **entonces** se marca la imagen como girada y se avisa que hay que activar la rotación de pantalla o reencuadrar.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Traído de la v1 de José el 22-nov, con el interruptor en Ajustes (activado por defecto). El aviso de «imagen de lado» sale en el indicador bajo la imagen.

### HU-20 · Estimar la inclinación sin sensores
**Como** persona que sube un video (o usa un equipo sin sensores) **quiero** que la app estime la inclinación con mi postura de partida **para** que mi resultado no dependa de si el video salió derecho.
- **Dado** un video sin sensores, **cuando** se analiza el inicio de la prueba, **entonces** la app estima la inclinación a partir de la postura de partida de esa prueba (por ejemplo, el eje del tronco en la posición inicial).
- **Dado** esa estimación, **cuando** se muestra, **entonces** se indica que es una estimación por imagen, menos precisa que la del sensor, con su nivel de confianza.
- **Dado** que la postura de partida es ambigua, **cuando** la dispersión es alta, **entonces** la app no corrige (inclinación «ninguna») y avisa que conviene volver a filmar con el teléfono derecho.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: el aviso muestra la confianza de la estimación por postura.

### HU-21 · Combinar sensor e imagen y avisar si no coinciden
**Como** persona que entrena **quiero** que la app combine la medición del sensor con la estimación por imagen **para** detectar errores de uno de los dos.
- **Dado** que hay sensor e imagen, **cuando** se combinan, **entonces** la inclinación final y la diferencia entre ambos (`conflictDeg`) quedan registradas.
- **Dado** una diferencia grande entre sensor e imagen, **cuando** se muestra la inclinación, **entonces** se entrega un aviso de nivel «warn» o «bad» con un mensaje en español, y no un número sin explicar.
- **Dado** que solo hay uno de los dos, **cuando** se usa, **entonces** se indica cuál fue la fuente (`sensor` o `image`).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Si sensor y postura no coinciden, el indicador muestra el aviso de conflicto. La fuente queda guardada con el resultado (columna `inclinacion_fuente` en el CSV de validación y en el CSV de «Mis mediciones»).

### HU-22 · Avisar si muevo el teléfono durante la prueba
**Como** persona que entrena **quiero** que la app me avise si el teléfono se mueve después de iniciar **para** no invalidar mi resultado sin darme cuenta.
- **Dado** que la inclinación se fija al iniciar la prueba, **cuando** el teléfono se mueve más allá de lo esperado, **entonces** se muestra un aviso en pantalla.
- **Dado** ese aviso, **cuando** termina la prueba, **entonces** el resultado queda marcado con esa advertencia (no se oculta).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: el resultado muestra «El teléfono se movió durante la prueba» y, si estaba inclinado, cuántos grados y si se corrigió.

---

## E. Cada prueba

Todas las pruebas son «hasta el fallo» (máximo continuo, sin tests de 1 o 2 minutos). Cada baremo vale solo con su protocolo.

### HU-23 · Flexiones de brazos (CSEP/ACSM)
**Como** persona que entrena **quiero** medir mis flexiones hasta el fallo **para** compararme con el baremo CSEP por edad y sexo.
- **Dado** que soy hombre, **cuando** hago flexiones, **entonces** se evalúan desde los pies; **dado** que soy mujer, **entonces** con apoyo de rodillas.
- **Dado** una flexión con espalda recta y brazos extendidos arriba, **cuando** completo la bajada y la subida, **entonces** cuenta; si la espalda cae o no extiendo arriba, no cuenta.
- **Dado** que termino, **cuando** veo el resultado, **entonces** se clasifica con el baremo CSEP de mi banda de edad.
- Cámara: horizontal, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-24 · Sentadillas (ACE)
**Como** persona que entrena **quiero** medir mis sentadillas hasta la fatiga **para** compararme con la tabla ACE.
- **Dado** una sentadilla, **cuando** los muslos llegan al paralelo con el suelo y vuelvo a estar de pie, **entonces** cuenta como válida.
- **Dado** una sentadilla que no llega al paralelo, **cuando** subo, **entonces** no cuenta y se avisa «baja más».
- **Dado** que veo el resultado, **cuando** abro las advertencias, **entonces** dice que el origen de esta tabla es dudoso (ver HU-31).
- Cámara: vertical, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Elías propone dar más rango o calibrar la profundidad (22-nov, pregunta F1). Si se acepta, cambia el primer criterio («muslos paralelos»). La advertencia de fuente dudosa sigue en revisión (pregunta B5).

### HU-25 · Plancha en antebrazos (Strand 2014)
**Como** persona que entrena **quiero** cronometrar mi plancha hasta la fatiga **para** compararme con universitarios y con deportistas.
- **Dado** que mantengo la posición, **cuando** pasa el tiempo, **entonces** se muestra el cronómetro en m:ss y al final el tiempo con precisión de 0,1 s.
- **Dado** que pierdo la posición, o recibo dos avisos de técnica seguidos sin corregir (la regla A3 aplicada a la plancha), **cuando** ocurre, **entonces** la prueba termina (un solo intento).
- **Dado** el resultado, **cuando** se muestra, **entonces** incluye percentil (ver HU-32).
- Cámara: horizontal, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Percentil solo entre universitarios por sexo (sin grupo de deportistas: ver HU-02). La regla de los dos avisos seguidos quedó confirmada el 22-nov (A3) y la app ya la aplica.

### HU-26 · Dominadas (prueba opcional con barra)
**Como** persona que entrena y tiene acceso a una barra **quiero** medir mis dominadas **para** compararme con las referencias de China 2014, USMC y Thomas 2020.
- **Dado** que parto en suspensión con agarre prono y brazos extendidos, **cuando** el mentón sobrepasa la barra y vuelvo a extender por completo, **entonces** cuenta 1.
- **Dado** balanceo, impulso con las piernas o extensión incompleta, **cuando** ocurre, **entonces** esa repetición no cuenta.
- **Dado** que suelto la barra o apoyo los pies, **cuando** ocurre, **entonces** la prueba termina con el motivo «posición perdida».
- Cámara: vertical, de lado. Prioridad: **Should** · Sprint: S1 · Estado: **Fuera (decidir)**
- 🔎 **Nota (22-nov):** No existe en esta app. Está en la v1 de José. Agregarla es decisión del equipo (pregunta F2).

### HU-27 · Fondos en paralelas (prueba opcional con barra)
**Como** persona que entrena y tiene paralelas **quiero** medir mis fondos **para** registrar mi marca y compararme con Thomas 2020 cuando haya baremo.
- **Dado** que parto con los brazos extendidos, **cuando** cada codo llega al menos a 90° y vuelvo a extender por completo, **entonces** cuenta 1.
- **Dado** que ayudo con las piernas, **cuando** ocurre, **entonces** esa repetición no cuenta.
- **Dado** que soy mujer, **cuando** termino, **entonces** FitGram registra mi marca sin categoría y lo dice claramente (ver HU-33).
- Cámara: vertical, de lado. Prioridad: **Should** · Sprint: S1 · Estado: **Fuera (decidir)**
- 🔎 **Nota (22-nov):** Igual que HU-26.

### HU-28 · Guía de cómo filmar cada prueba
**Como** persona que entrena **quiero** una guía corta de dónde poner el teléfono y cómo ubicarme **para** no perder el resultado por un mal encuadre.
- **Dado** que elijo una prueba, **cuando** abro «Cómo filmar», **entonces** veo la orientación del teléfono (horizontal para flexiones y plancha; vertical para sentadillas, dominadas y fondos), que debo filmar de lado y la distancia recomendada (2,5–3 m).
- **Dado** que la guía se abre, **cuando** la leo, **entonces** cabe en una pantalla de teléfono sin deslizar más de una vez.
- **Dado** que ya la vi, **cuando** vuelvo a la prueba, **entonces** puedo saltarla con un toque.
- Prioridad: **Should** · Sprint: S1 (revisión) · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** La pantalla «antes de la prueba» trae los pasos y un dibujo de dónde poner el teléfono. En flexiones y plancha el dibujo es una vista desde arriba (para que se vea dónde va el teléfono respecto del cuerpo), pero la cámara igual te filma de lado. Orientación: horizontal en flexiones y plancha, vertical en sentadillas.

---

## F. Resultados y baremos

### HU-29 · Ver mi categoría según edad y sexo
**Como** persona que entrena **quiero** que la app me diga en qué categoría quedo (por ejemplo, «Promedio», 3 de 5) **para** saber dónde estoy parado, no solo cuánto hice.
- **Dado** un resultado válido, **cuando** se muestra la pantalla, **entonces** aparecen mi valor, la categoría con su posición (índice sobre total) y la banda de edad usada (por ejemplo, «20–29»).
- **Dado** el mismo valor, **cuando** cambio de sexo o de banda de edad, **entonces** la categoría puede cambiar, porque el baremo es distinto.
- **Dado** una prueba sin baremo para mi caso, **cuando** se muestra, **entonces** no se inventa una categoría (ver HU-33).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-30 · Ver la tabla del baremo y qué me falta para subir
**Como** persona que entrena **quiero** ver la tabla completa y cuánto me falta para el siguiente nivel **para** tener una meta concreta.
- **Dado** un resultado clasificado, **cuando** abro el detalle, **entonces** veo todas las filas del baremo, de menor a mayor, con mi fila resaltada.
- **Dado** que no estoy en la categoría más alta, **cuando** veo el detalle, **entonces** dice cuántas repeticiones o segundos faltan para la siguiente.
- **Dado** que estoy en la categoría más alta, **cuando** veo el detalle, **entonces** no aparece «siguiente nivel».
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (23-nov):** La app muestra la tabla de mayor a menor (la categoría más alta arriba); el primer criterio dice «de menor a mayor». Si se cambia la app o el criterio lo decide el equipo (pregunta F5).

### HU-31 · Conocer la fuente y las limitaciones del baremo
**Como** persona que entrena (y como equipo FitGram) **quiero** ver de dónde sale cada baremo y qué limitaciones tiene **para** no sobreinterpretar el resultado.
- **Dado** cualquier clasificación, **cuando** abro «Fuente», **entonces** veo la referencia (formato APA) y, si existe, el enlace.
- **Dado** un baremo con advertencias, **cuando** se muestra, **entonces** aparecen en lenguaje simple: corte sin verificar, fuente dudosa (sentadillas ACE), extrapolado, muestra de personas entrenadas, estándar militar (USMC), edad fuera de la muestra, o estimado.
- **Dado** el protocolo de cada prueba, **cuando** se muestra el resultado, **entonces** se recuerda que el baremo vale solo con ese protocolo (hasta el fallo).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Además se marca cada corte de flexiones que no se pudo verificar en una fuente primaria (pendiente de que el equipo lo revise en la biblioteca).

### HU-32 · Percentil en plancha y fondos
**Como** persona que entrena **quiero** ver un percentil cuando el baremo lo permite **para** entender qué porcentaje de las personas de mi grupo tiene una marca igual o menor que la mía.
- **Dado** una plancha, **cuando** termino, **entonces** veo el percentil calculado con el grupo que corresponde (deportistas, no deportistas o todos).
- **Dado** fondos (hombres), **cuando** termino, **entonces** el percentil aparece marcado como estimado.
- **Dado** una prueba que no entrega percentil, **cuando** veo el resultado, **entonces** no hay percentil (no se muestra 0 ni un valor inventado).
- Prioridad: **Should** · Sprint: S1 · Estado: **Parcial**
- 🔎 **Nota (22-nov):** Plancha sí (universitarios por sexo; «estimado» cuando el tiempo queda fuera del rango que midió el estudio, entre el percentil 10 y el 90). Fondos no aplica. Camino para cerrarla: el criterio de fondos y el de grupos de deportistas (HU-02) dependen de F2; si no entran, la historia queda «Hecho en código».

### HU-33 · Fondos en mujeres: registrar la marca sin baremo
**Como** mujer que entrena **quiero** registrar mis fondos aunque todavía no exista baremo para mujeres **para** no quedar fuera y poder ver mi progreso.
- **Dado** una mujer que hace fondos, **cuando** termina, **entonces** se guarda su marca, no se muestra categoría ni percentil y aparece el aviso «sin baremo para mujeres todavía».
- **Dado** esa marca, **cuando** se calcula el perfil general (HU-34), **entonces** no se incluye (no cuenta como 0).
- **Dado** que aparezca un baremo publicado, **cuando** se agregue, **entonces** solo habrá que cargar la tabla en `src/norms.mjs`.
- Prioridad: **Should** · Sprint: S1 · Estado: **Fuera (decidir)**
- 🔎 **Nota (22-nov):** No aplica: no hay fondos.

### HU-34 · Perfil general exploratorio
**Como** persona que entrena **quiero** ver una síntesis de todas mis pruebas **para** tener una idea global de mi condición.
- **Dado** que hice una o más pruebas con baremo, **cuando** abro mi perfil, **entonces** veo la posición promedio (0 a 100) y su etiqueta: menos de 20 «Muy bajo», menos de 40 «Bajo», menos de 60 «Medio», menos de 80 «Alto», desde 80 «Muy alto».
- **Dado** que una prueba no tiene baremo, **cuando** se calcula, **entonces** se omite del promedio.
- **Dado** el perfil, **cuando** se muestra, **entonces** incluye una nota que dice que es un índice exploratorio de FitGram, no un puntaje validado.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Mismas etiquetas y la misma nota de «índice exploratorio».

---

## G. Historial y avance

### HU-35 · Guardar mis resultados en el teléfono
**Como** persona que entrena **quiero** que cada resultado quede guardado en mi teléfono **para** no empezar de cero cada vez.
- **Dado** que termino una prueba, **cuando** acepto el resultado, **entonces** se guarda con fecha, prueba, valor, categoría y la fuente de inclinación usada.
- **Dado** que cierro y abro la app, **cuando** vuelvo, **entonces** mis resultados siguen ahí sin conexión a internet.
- **Dado** una demostración (HU-14), **cuando** termina, **entonces** no se guarda nada.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Se guarda además la calidad de la detección, los segundos sin verte, la versión de las reglas de conteo con que se contó (la «huella») y la inclinación del teléfono.

### HU-36 · Ver mi historial por prueba
**Como** persona que entrena **quiero** ver todos mis resultados de una prueba, ordenados por fecha **para** revisar cómo he evolucionado.
- **Dado** que tengo 2 o más resultados de una prueba, **cuando** abro el historial, **entonces** veo la lista (y un gráfico simple) con fecha y valor, del más reciente al más antiguo.
- **Dado** que no tengo resultados, **cuando** abro el historial, **entonces** veo un mensaje que me invita a hacer la primera prueba.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Hasta 50 resultados por prueba, con gráfico de línea simple. Al guardar el resultado 51 se descarta el más antiguo de esa prueba; para conservarlos todos, exportar (HU-43, 44).

### HU-37 · Ver mi avance entre evaluaciones (cada ~4 semanas)
**Como** persona que entrena **quiero** que la app me muestre el cambio entre mi última evaluación y la anterior **para** saber si estoy mejorando, idealmente repitiendo la evaluación cada 4 semanas.
- **Dado** dos resultados de la misma prueba, **cuando** veo el último, **entonces** aparece la diferencia (por ejemplo, «+3 repeticiones» o «−0:12») y si cambió la categoría.
- **Dado** que pasaron 4 semanas o más desde mi última evaluación, **cuando** abro la app, **entonces** me sugiere repetirla (sin enviar notificaciones externas).
- **Dado** que los dos resultados se midieron con protocolos distintos (por ejemplo, flexiones con y sin rodillas), **cuando** se comparan, **entonces** se avisa que no son comparables.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: aviso de «no comparables» entre flexiones con distinto protocolo o con otras reglas de conteo.

### HU-38 · Borrar mis datos
**Como** persona que entrena **quiero** borrar un resultado, o todos mis datos, desde la app **para** controlar mi información.
- **Dado** un resultado, **cuando** toco «Borrar» y confirmo, **entonces** desaparece del historial y de mi perfil.
- **Dado** «Borrar todos mis datos», **cuando** confirmo (con una pregunta de confirmación explícita), **entonces** se elimina el perfil, los resultados y la configuración del teléfono.
- **Dado** que borro, **cuando** exporto después, **entonces** el archivo ya no incluye lo borrado.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: lista «Mis mediciones» en el perfil, con borrar cada una (con confirmación).

---

## H. Datos y privacidad

### HU-39 · Todo se procesa en el teléfono
**Como** persona que entrena **quiero** que mi video y mis resultados se procesen solo en mi teléfono **para** no exponerme a que mis imágenes viajen por internet.
- **Dado** que uso la app (cámara en vivo, video subido o demostración), **cuando** reviso el tráfico de red del navegador, **entonces** después de cargar la app (y el modelo) no hay ninguna solicitud con datos míos.
- **Dado** MediaPipe, **cuando** se carga, **entonces** viene incluido en el sitio con el envío de estadísticas de uso desactivado.
- **Dado** esta app, **cuando** se revisa el código, **entonces** no existe ninguna llamada de envío de datos a un servidor propio ni de terceros.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto en el código: la copia del detector de pose (MediaPipe) que trae la app tiene apagado el envío de estadísticas de uso a Google (`lib/vision_bundle.mjs`). Comprobado revisando el código y el sitio publicado, que carga el detector desde la propia app; falta mirar el tráfico de red en un teléfono (primer criterio). **Lo principal de esta historia solo se confirma en un equipo real; hasta entonces, «Hecho en código» no garantiza que funcione.**

### HU-40 · El video nunca se guarda
**Como** persona que entrena **quiero** la certeza de que mi video no queda almacenado **para** usar la app incluso en un lugar donde me sentiría incómoda con una grabación.
- **Dado** una prueba en vivo, **cuando** termina, **entonces** no existe ningún archivo de video generado por la app (solo se procesan cuadros en memoria).
- **Dado** un video subido, **cuando** termina el análisis, **entonces** la app no conserva copia; el archivo original sigue solo en mi galería.
- **Dado** el historial y la exportación, **cuando** se revisan, **entonces** contienen números y fechas, nunca imágenes ni video.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (23-nov):** Desde el 23-nov la persona puede **elegir** guardar en su teléfono un video con el esqueleto superpuesto (Ajustes, apagado por defecto) o la animación 3D (HU-66). La app sigue sin guardar video por su cuenta y sin enviarlo; lo que la persona guarde queda en su galería.

### HU-41 · No perder mis datos de v0
**Como** persona que ya probó la versión anterior **quiero** que mis datos se migren **para** no perder mi historial.
- **Dado** datos guardados con un formato anterior, **cuando** abro la versión nueva por primera vez, **entonces** se migran al formato nuevo.
- **Dado** una migración con datos inválidos, **cuando** ocurre, **entonces** la app no se cae: ignora lo inválido y sigue.
- Prioridad: **Could** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** esta app no tuvo una «v1» propia (sus datos siguen bajo `fitgram.v0`). Lo que se migra es el formato antiguo, de un solo resultado por prueba, al historial actual.

### HU-42 · Registro anónimo listo para una futura base central
**Como** equipo FitGram **quiero** que cada resultado se pueda convertir en un registro anónimo **para** poder alimentar, más adelante y con consentimiento, una base de datos central sin exponer a nadie.
- **Dado** un resultado, **cuando** se llama a `toAnonymousRecord`, **entonces** devuelve solo: banda de edad, sexo, prueba, valor y mes (sin nombre, sin video, sin edad exacta ni fecha exacta).
- **Dado** el MVP, **cuando** se usa la app, **entonces** esa función no se ejecuta contra ningún servidor (solo existe el diseño; ver HU-57).
- Prioridad: **Could** · Sprint: Post · Estado: **Futuro**
- 🔎 **Nota (22-nov):** Pasa a Futuro: solo le sirve a la base central (HU-57), que está fuera del MVP (ver `ALCANCE_MVP.md` §3). Si se necesita, se trae de la v1 de José (`toAnonymousRecord`).

---

## I. Exportar y compartir

### HU-43 · Exportar mis datos en JSON
**Como** persona que entrena (o entrenador que quiere revisar los datos) **quiero** descargar todos mis datos en JSON **para** guardarlos o llevarlos a otra herramienta.
- **Dado** que toco «Exportar JSON», **cuando** se genera, **entonces** descarga un archivo con perfil, resultados e historial en el esquema `schema: 1`.
- **Dado** que no tengo resultados, **cuando** exporto, **entonces** el archivo trae el perfil y listas vacías, no falla.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: «Exportar JSON» en el perfil (`schema: 1`, perfil e historial).

### HU-44 · Exportar mis resultados en CSV
**Como** persona que entrena (o entrenador) **quiero** descargar mi historial en CSV **para** abrirlo en una planilla y hacer mis propios gráficos.
- **Dado** que toco «Exportar CSV», **cuando** se genera, **entonces** descarga una fila por resultado con: fecha, prueba, valor, unidad, categoría y banda.
- **Dado** que un valor tiene coma decimal, **cuando** se exporta, **entonces** el archivo se abre bien en Excel en español (sin romper las columnas).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: «Exportar CSV» en el perfil (`;`, coma decimal, incluye categoría, inclinación y teléfono movido).

---

## J. Accesibilidad e idioma

### HU-45 · Español de Chile
**Como** persona que entrena **quiero** que la app me hable en español de Chile, corto y claro **para** entenderla sin esfuerzo.
- **Dado** cualquier pantalla, mensaje o aviso, **cuando** se muestra, **entonces** está en español de Chile.
- **Dado** un número decimal, **cuando** se muestra, **entonces** usa coma (por ejemplo, 12,5); la plancha se muestra en m:ss y las repeticiones como enteros.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-46 · Usar la app sin conexión después de la primera carga
**Como** persona que entrena en una plaza o parque **quiero** que la app funcione sin internet después de prepararla una vez **para** evaluarme donde no hay señal.
- **Dado** que abrí la app con internet y toqué «Preparar para usar sin conexión», **cuando** la abro sin conexión (modo avión), **entonces** carga y permite hacer pruebas, ver el historial y exportar.
- **Dado** que hay una versión nueva, **cuando** vuelvo a tener conexión, **entonces** la app se actualiza y se me avisa.
- **Dado** que nunca abrí la app con internet, **cuando** intento abrirla sin conexión, **entonces** se muestra un mensaje claro de que necesita conexión la primera vez.
- Prioridad: **Should** · Sprint: S3 · Estado: **Parcial**
- 🔎 **Nota (22-nov):** La app se guarda en el teléfono para abrir sin internet, avisa cuando hay una versión nueva y tiene el botón «Preparar para usar sin conexión» (guarda el detector y los modelos, unos 29 MB). Falta el mensaje para quien nunca la abrió con internet.

### HU-47 · Una sola app web para Android, iPhone y computador
**Como** persona que entrena **quiero** abrir FitGram desde un enlace, en cualquier dispositivo **para** no tener que instalar nada ni depender de una tienda de aplicaciones.
- **Dado** un iPhone con iOS Safari 16.4 o superior, o un Android con Chrome, **cuando** abro el enlace de GitHub Pages, **entonces** la app carga y la cámara funciona (HTTPS).
- **Dado** un computador, **cuando** abro el enlace, **entonces** puedo subir un video y ver los resultados (la cámara depende del equipo).
- **Dado** un navegador no soportado, **cuando** abro el enlace, **entonces** se muestra un mensaje que dice qué navegador usar.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Resuelto: aviso para navegadores sin módulos ES o sin WebAssembly.
- 🔎 **Nota (23-nov):** «Sin instalar nada» se cumple: se abre desde el enlace. «Instalar en la pantalla de inicio» (R16) es opcional: el navegador agrega un ícono, sin tienda de aplicaciones, y en iPhone protege los datos guardados.

### HU-48 · Legibilidad y uso a distancia
**Como** persona que entrena **quiero** textos y botones grandes y con buen contraste **para** poder usar la app a 2,5–3 m del teléfono y con luz exterior.
- **Dado** el modo de evaluación, **cuando** estoy a 2,5 m, **entonces** el contador y los avisos se leen sin acercarme (texto grande, alto contraste).
- **Dado** los avisos de técnica, **cuando** aparecen, **entonces** no dependen solo del color: llevan texto o ícono.
- **Dado** cualquier botón, **cuando** lo toco, **entonces** su área mide al menos 44 × 44 px.
- Prioridad: **Should** · Sprint: S3 · Estado: **Parcial**
- 🔎 **Nota (22-nov):** Contador y avisos grandes (barra de avisos dentro de la imagen) y voz para lo que no se lee. Falta revisar contraste y áreas de 44 px con una lista de chequeo. El criterio «se leen a 2,5 m» no es medible tal cual: conviene fijar un tamaño mínimo.
- 🔎 **Nota (25-nov):** Revisión automática en 7 pantallas, tema claro y oscuro: el azul de los botones en tema claro tenía 4,15:1 con el texto blanco (bajo el 4,5:1 de WCAG AA) y pasó a 4,7:1; el logo, la barra de la reproducción 3D y los botones Frente/Lado/Arriba pasaron a 44 px. Lo que queda bajo 44 px está exento: casillas dentro de filas de 44 px, enlaces dentro del texto y selectores de archivo ocultos detrás de su botón. En tablet la interfaz se agranda (Lenovo Tab P12). No revisado: el texto sobre la imagen de la cámara y la lectura real a 2,5 m.

---

## K. Calidad y validación

### HU-49 · Pruebas automáticas
**Como** equipo FitGram **quiero** pruebas automáticas por módulo **para** cambiar el código sin romper lo que ya funciona.
- **Dado** el repositorio, **cuando** corro `npm test`, **entonces** todo pasa en Node 22.
- **Dado** un baremo, **cuando** se cambia, **entonces** una prueba verifica los bordes de cada banda (valor justo en el límite).
- **Dado** `AUDIENCE`, **cuando** se cambia, **entonces** una prueba verifica que sigue dentro de `NORMS_AGE`.
- Prioridad: **Must** · Sprint: S1 · Estado: **Otra forma**
- 🔎 **Nota (22-nov):** `npm test` pasa completo (además comprueba que el archivo publicado corresponda al código fuente) y hay una prueba completa en navegador (`tools/e2e.py`). El criterio 3 no aplica: `AUDIENCE` y `NORMS_AGE` no existen (ver HU-03); los bordes del rango se prueban con las pruebas de los baremos.

### HU-50 · Validar el conteo contra dos evaluadores humanos
**Como** equipo FitGram **quiero** comparar el conteo de la app con el de dos evaluadores en 10 a 15 jóvenes **para** saber si el conteo es confiable (meta: la que se fije en las preguntas A1, A2 y A4; ver `ALCANCE_MVP.md` §6).
- **Dado** 10 a 15 personas del rango vigente (hoy 18–21, pregunta B2), **cuando** hacen las 3 pruebas de la evaluación base (las de barra solo si se aprueban en F2), **entonces** cada serie la cuentan por separado dos evaluadores y la app.
- **Dado** los conteos, **cuando** se calcula el indicador que se fije (concordancia, acuerdo o CCI; método en `ALCANCE_MVP.md` §6), **entonces** el informe muestra el resultado global y por prueba, con los casos en que falló y por qué.
- **Dado** que el resultado queda bajo la meta que se fije, **cuando** se cierra el informe, **entonces** se abre un plan de mejora y se repite la validación antes de afirmar la cifra en público.
- Prioridad: **Must** · Sprint: S5–S6 · Estado: **Parcial**
- 🔎 **Nota (22-nov):** La herramienta ya está: el modo validación registra app + 2 evaluadores, calcula acuerdo, Bland-Altman y CCI con intervalo, y exporta (HU-61). Falta hacer el estudio. La v1 proponía «concordancia ≥ 95 %» con su fórmula. Cuál es la meta oficial lo deciden José y Elías (preguntas A1, A2 y A4).

### HU-51 · Probar la corrección de inclinación con escenas sintéticas y con personas
**Como** equipo FitGram **quiero** comprobar que la corrección de inclinación funciona con la misma escena vista con la cámara torcida **para** confiar en que un teléfono ladeado no cambia el conteo.
- **Dado** una persona sintética con cámara inclinada (`cameraRoll`/`cameraPitch`), **cuando** se corrige, **entonces** el conteo coincide con el de la cámara derecha.
- **Dado** la validación con personas (HU-50), **cuando** se filman al menos 1 de cada 3 series con el teléfono deliberadamente inclinado, **entonces** se reporta aparte el indicador que se fije en esas series, y con sensor versus sin sensor.
- **Dado** que la estimación solo por imagen es menos precisa que el sensor, **cuando** se reporta, **entonces** la diferencia queda documentada como limitación conocida.
- Prioridad: **Must** · Sprint: S5 · Estado: **Parcial**
- 🔎 **Nota (22-nov):** La prueba con persona simulada y cámara inclinada está (traída de la v1 de José). Falta la parte con personas. El CSV de validación ya trae la inclinación y su fuente por serie. El análisis aparte de las series inclinadas y con o sin sensor depende de A1, A5 y A8 (ver `ALCANCE_MVP.md` §6).

### HU-52 · Documentar para que el proyecto no dependa de una persona
**Como** equipo FitGram **quiero** documentar el producto, la arquitectura y las decisiones **para** que, si alguien no está (el «factor camión»), otra persona pueda seguir.
- **Dado** el repositorio, **cuando** alguien nuevo lo abre, **entonces** encuentra `README.md` y, en `docs/`, estas historias, `ALCANCE_MVP.md` y `ARQUITECTURA.md` (su sección 3, «Formatos de datos», reemplaza el `CONTRACT.md` de la v1).
- **Dado** cada archivo de `src/`, **cuando** se abre, **entonces** tiene un encabezado de 3 a 8 líneas con su responsabilidad, y JSDoc en lo exportado.
- **Dado** una decisión de producto (por ejemplo, rango de edad, pruebas incluidas), **cuando** cambia, **entonces** se actualiza el documento correspondiente en el mismo sprint.
- Prioridad: **Must** · Sprint: S1 y continuo · Estado: **Parcial**
- 🔎 **Nota (22-nov):** Este documento, `ALCANCE_MVP.md` y `ARQUITECTURA.md` se adaptaron el 22-nov. Falta que todos los archivos de código tengan su encabezado y sus comentarios de uso parejos.

---

## L. Futuro: entrenadores, base central, juego, más ejercicios

Nada de esta épica entra al MVP. Está aquí para que el diseño del MVP no cierre puertas. El registro anónimo (HU-42) no existe en esta app; está en la v1 de José.

### HU-53 · Vincular a mis atletas
**Como** entrenador/a **quiero** vincular a las personas que entreno a mi cuenta **para** ver sus resultados sin pedírselos uno por uno.
- **Dado** que tengo licencia, **cuando** invito a una persona, **entonces** debe aceptar la vinculación antes de que yo vea sus datos.
- **Dado** una persona vinculada, **cuando** quiere desvincularse, **entonces** puede hacerlo desde su app y dejo de ver sus datos.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

### HU-54 · Enviar pruebas para hacer en casa y ver el reporte del equipo
**Como** entrenador/a **quiero** enviar pruebas para que mis atletas las hagan en casa y ver los resultados de todo el equipo en un informe **para** dejar de contar a ojo y de escribir el informe a mano (por ejemplo, con un equipo de básquetbol de adultos mayores).
- **Dado** que envío una batería de pruebas, **cuando** una persona la completa, **entonces** yo veo su resultado y su categoría.
- **Dado** un equipo, **cuando** pido el informe, **entonces** se genera un resumen con todos los resultados en un solo documento (PDF o CSV).
- **Dado** que la persona está fuera del rango vigente, **cuando** se evalúa, **entonces** depende de que existan baremos para su edad (hoy la app cubre 18–21).
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

### HU-55 · Licencia de uso para gimnasios, colegios y universidades
**Como** gimnasio o institución **quiero** una licencia para que mis usuarios se evalúen con FitGram **para** ofrecer una evaluación objetiva y saber cómo están.
- **Dado** una licencia activa, **cuando** un usuario se une con el código de la institución, **entonces** sus resultados cuentan en el informe de la institución solo si él lo acepta.
- **Dado** el informe, **cuando** se muestra, **entonces** se presenta agregado (sin identificar a nadie) salvo que la persona consienta.
- Prioridad: **Won't (ahora)** · Sprint: Post (piloto con cursos UNAB: oct–dic 2027) · Estado: **Futuro**

### HU-56 · Datos anónimos por comuna
**Como** municipio **quiero** ver datos anónimos de condición física por comuna **para** respaldar mis metas de actividad física (por ejemplo, Elige Vivir Sano).
- **Dado** que existen suficientes registros, **cuando** consulto una comuna, **entonces** veo resultados agregados por banda de edad, sexo y prueba.
- **Dado** una comuna con muy pocos registros, **cuando** consulto, **entonces** no se muestran los datos (evita identificar personas).
- Prioridad: **Won't (ahora)** · Sprint: Post (piloto con una comuna: oct–dic 2027) · Estado: **Futuro**

### HU-57 · Base de datos central con resultados anónimos
**Como** equipo FitGram **quiero** una base central que reciba solo resultados anónimos (banda de edad, sexo, prueba, valor, mes), con consentimiento **para** alimentar los informes por comuna y mejorar los baremos.
- **Dado** una persona que no consiente, **cuando** usa la app, **entonces** no se envía nada.
- **Dado** que consiente, **cuando** se envía un resultado, **entonces** el registro no incluye nombre, correo, video, edad exacta ni fecha exacta.
- **Dado** el diseño actual, **cuando** se revisa, **entonces** el formato está diseñado en la v1 de José (`toAnonymousRecord`, HU-42), pero no existe en esta app; faltan además el servidor, el consentimiento y la seguridad.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

### HU-58 · Modo juego y progresión
**Como** persona que entrena **quiero** un modo de juego (por ejemplo, un «Flappy Bird» controlado con flexiones o press militar), rachas y desbloqueo de ejercicios **para** engancharme y volver cada día.
- **Dado** el modo juego, **cuando** muevo los brazos, **entonces** el personaje se controla con el punto medio entre mis manos.
- **Dado** que llevo varios días seguidos, **cuando** abro la app, **entonces** veo mi racha y puedo desbloquear una prueba nueva (estilo Duolingo).
- **Dado** el MVP, **cuando** se define el alcance, **entonces** este modo queda fuera: es una función de crecimiento. Elías tiene un prototipo.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**
- 🔎 **Nota (22-nov):** Ya existe un prototipo de modo juego dentro de la app (press militar, idea de Elías). Sigue fuera del MVP: no se valida ni se promete. Va dentro de la app publicada (se abre desde la pantalla de evaluación); el riesgo está en `ALCANCE_MVP.md` R15 y si se oculta es la pregunta F4.

### HU-59 · Ejercicios con pesas y mancuernas
**Como** persona que entrena **quiero** evaluar ejercicios con pesas o mancuernas **para** tener un diagnóstico más completo.
- **Dado** un ejercicio nuevo, **cuando** se agrega, **entonces** necesita su protocolo y su baremo publicados antes de salir (sin baremo, solo registra la marca).
- **Dado** las máquinas de polea, **cuando** se evalúa el alcance, **entonces** quedan explícitamente fuera por ahora.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

### HU-60 · 3D más preciso con VideoPose3D (fase 2)
**Como** equipo FitGram **quiero** probar VideoPose3D como segunda etapa del 3D **para** mejorar la vista y los ángulos de articulaciones.
- **Dado** que los pesos de VideoPose3D son de uso no comercial (CC BY-NC 4.0), **cuando** se decide su uso, **entonces** se revisa primero la licencia antes de incluirlo en cualquier producto de pago.
- **Dado** que fue entrenado con Human3.6M (sin ejercicios en el suelo), **cuando** se prueba con flexiones o plancha, **entonces** se mide si mejora o empeora el resultado frente a MediaPipe antes de adoptarlo.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

---

## M. Agregadas al adaptar (no estaban en la v1 de José; son parte del MVP)

### HU-61 · Registrar la validación en la misma app
**Como** equipo FitGram **quiero** anotar junto al conteo de la app los conteos de dos evaluadores, por participante y prueba **para** comparar la app con los evaluadores (acuerdo, Bland-Altman y CCI) sin pasar datos a mano a una planilla.
- **Dado** el modo validación activado, **cuando** termina una prueba, **entonces** puedo registrar la medición con el código del participante y los conteos de los evaluadores, y se guarda lo que la app descartó y por qué.
- **Dado** que ya existe esa persona con esa prueba, **cuando** guardo, **entonces** la app avisa del duplicado y pregunta si reemplazar, guardar ambas o cancelar.
- **Dado** las mediciones, **cuando** exporto, **entonces** obtengo CSV (`;`, coma decimal) y JSON, y puedo volver a cargar el JSON.
- **Dado** menos de 5 participantes, **cuando** veo el CCI, **entonces** la app avisa que no es interpretable.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en código**

### HU-62 · Saber si se puede confiar en una medición
**Como** persona que entrena (y como equipo) **quiero** que la app mida qué tan estable fue la detección durante la serie **para** no confiar en un conteo hecho con mala luz o ropa suelta.
- **Dado** una detección temblorosa, **cuando** pasa durante la prueba, **entonces** se avisa en pantalla y en voz (como máximo cada 12 s).
- **Dado** el resultado, **cuando** se guarda, **entonces** lleva el nivel de calidad y el temblor medido.
- Los umbrales salen de pruebas sintéticas y son provisorios.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**

### HU-63 · Modo stand para mostrar la app
**Como** equipo FitGram **quiero** un modo en que cualquiera pruebe la app sin que se guarde nada **para** mostrarla en ferias, en el ETM o en el pitch.
- **Dado** el modo stand, **cuando** alguien termina, **entonces** ve su resultado y nada queda guardado; un botón pasa a la persona siguiente.
- **Dado** una edad fuera del rango vigente, **cuando** termina, **entonces** ve el conteo sin categoría.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (22-nov):** Hoy acepta cualquier edad, también menores. Si se pone una edad mínima o se pide autorización es decisión del equipo (pregunta F3).

### HU-64 · Instrucciones habladas a distancia
**Como** persona que entrena a 2,5–3 m del teléfono **quiero** que la app me diga en voz alta lo que ve (posición, conteo, técnica, inclinación) **para** no tener que acercarme a leer.
- **Dado** que estoy acomodándome, **cuando** la app detecta un problema de posición que se mantiene, **entonces** lo dice, sin repetir el mismo mensaje y como máximo uno cada 3 s.
- **Dado** que el teléfono quedó demasiado inclinado o de lado, **cuando** todavía no empieza la prueba, **entonces** lo dice.
- **Dado** la voz apagada en Ajustes, **cuando** pasa cualquiera de lo anterior, **entonces** no habla.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (23-nov):** **Lo principal de esta historia solo se confirma en un equipo real; hasta entonces, «Hecho en código» no garantiza que funcione.**

### HU-65 · Medir rendimiento y batería en los equipos reales
**Como** equipo FitGram **quiero** medir en la Lenovo Tab P12 y en 2 teléfonos de gama media los cuadros por segundo, la batería y el calor **para** saber si se cumplen los requerimientos no funcionales antes de prometerlos.
- **Dado** la Lenovo Tab P12, **cuando** se hacen las 3 pruebas en vivo antes del 30-nov, **entonces** se anotan los cuadros por segundo y si hubo cortes.
- **Dado** 2 teléfonos de gama media, **cuando** se hacen 3 pruebas seguidas, **entonces** se anota la batería antes y después y si el equipo se calentó.
- **Dado** los resultados, **cuando** no se cumple una meta, **entonces** se prueba el modelo «Rápido» (el detector liviano, en Ajustes) y se anota la diferencia.
- Prioridad: **Must** · Sprint: S1 (Lenovo) y S2 (teléfonos) · Estado: **Pendiente**
- **Dado** que la Lenovo no alcanza la meta antes del 30-nov, **cuando** se prepara el pitch, **entonces** se usa el modelo «Rápido» y, si igual falla, se muestran los videos de respaldo y la demostración (responsable: David, con Elías).

### HU-66 · Guardar mi video con el esqueleto o compartir mi esqueleto
**Como** persona que entrena **quiero** guardar un video de mi prueba con el esqueleto encima, o la animación 3D, y poder compartir solo mi esqueleto (sin imagen) con el equipo **para** ver mi técnica después y ayudar a mejorar el conteo sin entregar un video mío.
- **Dado** que activé «Grabar video con el esqueleto» en Ajustes, **cuando** termino una prueba en vivo o con video, **entonces** en el resultado aparece «Guardar video con el esqueleto» y el archivo queda en mi teléfono.
- **Dado** el resultado, **cuando** toco «Guardar animación 3D», **entonces** se graba la reproducción 3D de principio a fin y se guarda en mi teléfono.
- **Dado** el resultado, **cuando** toco «Compartir mi esqueleto (sin video)», **entonces** la app me explica qué se comparte (puntos del cuerpo, edad, sexo, resultado; sin nombre, imagen ni fecha exacta) y, si acepto, me entrega el archivo para mandarlo por el medio que yo elija.
- **Dado** el modo stand o la demostración, **cuando** termina la prueba, **entonces** no aparecen estas opciones.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en código**
- 🔎 **Nota (23-nov):** Idea de Elías (WhatsApp, 23-nov). Los datos del esqueleto sirven para afinar y validar las reglas de conteo de FitGram, no para entrenar MediaPipe. Falta probar la grabación en la Lenovo y en un iPhone.

---

## Requerimientos no funcionales

| Área | Requerimiento | Cómo se comprueba |
|---|---|---|
| Privacidad | Todo el procesamiento ocurre en el teléfono. La app no envía video ni resultados a internet (solo descarga la app y el modelo la primera vez). El video no se guarda. | Revisar el tráfico de red tras la carga; revisar el código (HU-39, HU-40). |
| Rendimiento | En un teléfono de gama media (por ejemplo, Android con 4 GB de RAM de hace 3 a 4 años), el análisis corre a **15 cuadros por segundo o más**, y el contador responde en menos de 1 s desde que termina la repetición. Objetivo, por medir (HU-65: la Lenovo antes del 30-nov). | Prueba en la Lenovo y en 2 teléfonos de gama media; se registran los cuadros por segundo. |
| Sin conexión | Después de tocar «Preparar para usar sin conexión», la app funciona sin internet (pruebas, historial, exportar). Hoy es **parcial**: falta el mensaje para quien nunca la abrió con internet (HU-46). | Modo avión tras cargar una vez. |
| Accesibilidad | Textos grandes y legibles a 2,5–3 m; los avisos no dependen solo del color; botones de al menos 44 × 44 px (HU-48). | Revisión manual con lista de chequeo. |
| Navegadores | iOS Safari 16.4 o superior y Chrome en Android. En computador, Chrome. Otros navegadores: sin garantía. | Prueba manual en cada navegador por sprint. |
| Batería y calor | Tres pruebas seguidas (una evaluación completa) no deben bajar la batería más de un 5 % ni dejar el teléfono incómodo al tacto. Que la app pause el análisis con la pantalla inactiva está **sin verificar**. Objetivo, por medir (HU-65). | Medir el porcentaje de batería antes y después de 3 pruebas seguidas. |
| Retención de datos | Los resultados viven solo en el teléfono hasta que la persona los borre (HU-38) o borre los datos del sitio. Además se descarta el más antiguo al pasar de 50 por prueba (HU-36), y Safari en iPhone puede borrarlos si la app no está instalada en la pantalla de inicio (`ALCANCE_MVP.md` R16). No hay copia en un servidor. Si se cambia de teléfono, se usa la exportación JSON. | Revisión manual; prueba de borrado. |
| Idioma y formato | Español de Chile; coma decimal; plancha en m:ss. | Revisión de textos (HU-45). |
| Mantenibilidad | Un archivo por responsabilidad, sin ciclos de dependencias, JSDoc en lo exportado, pruebas por módulo. | `npm test`; revisión de código. |
| Licencias de terceros | MediaPipe (Apache 2.0) sin problema comercial. VideoPose3D (CC BY-NC 4.0) solo para uso no comercial: no entra a un producto de pago sin revisión (HU-60). | Revisión antes de cada nueva dependencia. |

## Limitaciones conocidas

- **Sentadillas (ACE):** el origen de la tabla es dudoso. La app lo advierte; no debe presentarse como un estándar sólido.
- **Inclinación sin sensores:** la estimación solo por imagen es menos precisa que la del sensor. Con videos subidos, la corrección es aproximada.
- **Perfil global:** es un promedio exploratorio de posiciones, no una escala validada.
- **Baremos hasta el fallo:** no se pueden mezclar con tablas de 1 o 2 minutos; por eso se excluyeron.
- **Conteo:** la comparación con evaluadores humanos todavía no se ha medido, y la meta está por fijarse (HU-50).
