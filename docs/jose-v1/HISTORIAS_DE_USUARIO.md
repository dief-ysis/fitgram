# FitGram — Historias de usuario

Documento de requerimientos de FitGram v1. Formato propuesto por David (Scrum): «Como <rol> quiero <acción> para <beneficio>», con criterios de aceptación en Dado/Cuando/Entonces. Complementa a `CONTRACT.md` (qué hace v1 técnicamente) y a `ALCANCE_MVP.md` (qué entra y qué no en el MVP).

**Idea central.** FitGram es diagnóstico, no adherencia: «Te mide el salto, pero no te dice dónde está tu salto». Mide y además compara a la persona con baremos científicos por edad y sexo.

**Cómo leer el estado.**
- **Hecho en v1**: está en el código de v1 (revisado contra `src/` el 13 de nov. de 2026, junto con `CONTRACT.md`). Aun así, en el Sprint 1 se prueba cada historia contra sus criterios de aceptación y, si algo no cumple, pasa a «Pendiente». Ojo: nada se ha probado todavía en teléfonos reales.
- **Pendiente**: entra al MVP, pero falta construirlo o validarlo. Si una historia está hecha a medias, el estado lo dice («Pendiente, parcial») y qué falta.
- **Futuro**: fuera del MVP (entrenadores, base central, juego, más ejercicios). Está diseñado o solo anotado; no se construye hasta después de febrero de 2027.

**Prioridad (MoSCoW).** Must = sin esto no hay MVP. Should = importante, pero el MVP sobrevive sin ello. Could = deseable. Won't (ahora) = se decidió dejarlo fuera.

**Sprints.** Son de 2 semanas (S1 a S6, de noviembre de 2026 a febrero de 2027; calendario en `ALCANCE_MVP.md`). En las historias ya hechas, el sprint indica cuándo se revisa y se acepta. «Post» = después del MVP.

## Roles

| Rol | Quién es | Qué necesita |
|---|---|---|
| **Persona que entrena** | Joven de 18 a 30 años que ya entrena en gimnasio, en casa, en una plaza o parque. Es quien usa la app gratis. | Saber en qué nivel está y cómo avanza, sin ser experta en ciencias del deporte. |
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

Total: 60 historias.

---

## A. Perfil y onboarding

### HU-01 · Indicar edad y sexo
**Como** persona que entrena **quiero** ingresar mi edad y mi sexo (y poder corregirlos después) **para** que FitGram me compare con las personas de mi grupo.
- **Dado** que abro la app por primera vez, **cuando** quiero empezar una prueba, **entonces** me pide edad (número entero) y sexo (M/F) antes de iniciarla.
- **Dado** que ingreso una edad entre 18 y 30, **cuando** guardo, **entonces** el perfil queda guardado en el teléfono y no se vuelve a pedir.
- **Dado** que corrijo mi edad o mi sexo, **cuando** hago una prueba nueva, **entonces** se clasifica con el perfil actualizado.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-02 · Indicar si entreno
**Como** persona que entrena **quiero** marcar si entreno regularmente **para** que, donde el baremo lo distingue (plancha), me compare con deportistas o con no deportistas.
- **Dado** que marco «entreno», **cuando** termino una plancha, **entonces** el percentil se calcula con el grupo de deportistas.
- **Dado** que no lo marco, **cuando** termino una plancha, **entonces** se usa el grupo de no deportistas (o el general si la tabla no distingue).
- **Dado** una prueba cuyo baremo no distingue por entrenamiento, **cuando** veo el resultado, **entonces** el valor marcado no cambia la categoría.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-03 · Cambiar el rango de edad en un solo lugar
**Como** equipo FitGram **quiero** que el público objetivo (hoy 18 a 30 años) se defina en un único valor de configuración **para** ampliarlo o acotarlo tocando pocas líneas de código.
- **Dado** `AUDIENCE` en `src/config.js`, **cuando** cambio `minAge` o `maxAge`, **entonces** la pantalla de perfil y los mensajes de rango usan los nuevos valores sin editar otros archivos.
- **Dado** que `AUDIENCE` queda fuera de `NORMS_AGE` (18–30), **cuando** corro `node --test test/*.test.mjs`, **entonces** una prueba falla y avisa que no hay baremo para esas edades.
- **Dado** que se quiere pasar de 30 a 40 años, **cuando** se revisa el cambio, **entonces** queda claro que además hay que cargar los baremos de esas edades en `src/norms.js` (la configuración sola no basta).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-04 · Aviso si estoy fuera del rango de edad
**Como** persona fuera del rango (por ejemplo, 17 o 35 años) **quiero** que la app me diga con claridad que todavía no tiene baremo para mi edad **para** no recibir una clasificación que no corresponde.
- **Dado** una edad menor de 18 o mayor de 30, **cuando** se pide clasificar, **entonces** `classify` lanza un `RangeError` con un mensaje en español y no se entrega categoría.
- **Dado** ese error, **cuando** lo muestra la pantalla, **entonces** el mensaje indica el rango válido (18 a 30 años) tomado de la configuración, no escrito a mano.
- **Dado** que el sexo no es M/F, **cuando** se pide clasificar, **entonces** ocurre lo mismo: error en español y sin categoría.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-05 · Bienvenida y aviso de alcance
**Como** persona que entrena **quiero** entender en una pantalla qué hace la app, qué no hace y que no es una evaluación médica **para** usarla con expectativas correctas.
- **Dado** que abro la app por primera vez, **cuando** termino de leer la bienvenida (máximo 3 pantallas), **entonces** puedo seguir al perfil.
- **Dado** esa pantalla, **cuando** la leo, **entonces** dice que es una orientación exploratoria, que no reemplaza a un profesional de la salud y que el video no se guarda ni se envía.
- **Dado** que ya la vi, **cuando** vuelvo a abrir la app, **entonces** no se repite (pero puedo reabrirla desde el menú).
- Hoy existe solo una línea en la pantalla «Evaluación»: «Resultados referenciales. No reemplazan una evaluación profesional.» Falta la bienvenida de hasta 3 pantallas.
- Prioridad: **Should** · Sprint: S2 · Estado: **Pendiente, parcial**

---

## B. Evaluación en vivo

### HU-06 · Usar la cámara en vivo
**Como** persona que entrena **quiero** usar la cámara de mi teléfono en vivo **para** evaluarme sin necesitar a otra persona ni equipo especial.
- **Dado** que abro la app en un sitio HTTPS (o `localhost`), **cuando** acepto el permiso de cámara, **entonces** veo mi imagen con el esqueleto dibujado encima.
- **Dado** que rechazo el permiso, **cuando** vuelvo a la pantalla, **entonces** un mensaje en español explica cómo activarlo y ofrece la alternativa de subir un video.
- **Dado** que la cámara no encuentra a una persona, **cuando** pasan unos segundos, **entonces** se avisa que no se me ve completo y la prueba no cuenta.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-07 · Elegir la prueba y ver el orden
**Como** persona que entrena **quiero** elegir qué prueba hacer, con las pruebas ordenadas en «Evaluación base» y «Pruebas con barra» **para** saber por dónde empezar y qué es opcional.
- **Dado** la lista de pruebas, **cuando** la abro, **entonces** veo primero la evaluación base (flexiones, sentadillas, plancha) y luego las pruebas con barra (dominadas, fondos), marcadas como opcionales.
- **Dado** que no tengo barra, **cuando** hago la evaluación base, **entonces** puedo terminarla y ver mi perfil sin hacer las pruebas con barra.
- **Dado** que cambio el orden en `TEST_ORDER`/`TEST_GROUPS` de la configuración, **cuando** recargo, **entonces** la lista refleja el cambio.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-08 · Verificar la posición antes de empezar
**Como** persona que entrena **quiero** que la app compruebe que estoy bien puesta frente a la cámara **para** no perder una prueba por mal encuadre.
- **Dado** que elijo una prueba, **cuando** me pongo en la posición de partida, **entonces** la app valida (`check`) que se me ve el cuerpo completo y me dice «OK» o qué corregir (por ejemplo, «Aléjate un poco»).
- **Dado** que la posición no es válida, **cuando** intento empezar, **entonces** la prueba no parte y se muestra el motivo.
- **Dado** una prueba en vivo, **cuando** toco «Iniciar», **entonces** hay una cuenta de 10 s para ponerme en posición, y la prueba parte cuando mantengo la posición válida 1 s (en la plancha, cuando el analizador la confirma).
- **Dado** que la posición es válida, **cuando** empiezo, **entonces** la fase pasa de «esperando» a «activa».
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-09 · Contar repeticiones válidas en vivo
**Como** persona que entrena **quiero** ver el contador subir solo con las repeticiones que cumplen la técnica **para** que el número sea comparable con el baremo.
- **Dado** que la prueba está activa, **cuando** hago una repetición que cumple el protocolo, **entonces** el contador sube 1 de inmediato.
- **Dado** una repetición que no cumple (por ejemplo, no llego a los 90° de codo en fondos), **cuando** termina, **entonces** no suma y queda registrada como inválida con su motivo.
- **Dado** que la prueba termina, **cuando** veo el resumen, **entonces** aparecen las repeticiones válidas y el número de inválidas.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-10 · Avisos de técnica mientras hago la prueba
**Como** persona que entrena **quiero** recibir avisos cortos de técnica (bien / cuidado / mal) **para** corregirme sin parar la prueba.
- **Dado** que la prueba está activa, **cuando** mi técnica se desvía (por ejemplo, la cadera cae en la plancha), **entonces** aparece un aviso de nivel «warn» o «bad» con un mensaje corto en español.
- **Dado** que corrijo la postura, **cuando** vuelvo a cumplir, **entonces** el aviso desaparece o pasa a «good».
- **Dado** varios avisos seguidos, **cuando** llegan, **entonces** se muestra uno solo a la vez y los demás quedan en el registro de eventos.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-11 · Terminar la prueba «hasta el fallo»
**Como** persona que entrena **quiero** que la prueba termine cuando ya no puedo seguir con buena técnica (o cuando yo la detengo) **para** obtener mi máximo real, sin límite de tiempo.
- **Dado** una prueba de repeticiones o la plancha, **cuando** pierdo la posición o dejo de cumplir la técnica, **entonces** la prueba termina sola y muestra el motivo (técnica, pausa, posición perdida o no se me ve).
- **Dado** que quiero parar, **cuando** toco «Terminar», **entonces** la prueba termina con el motivo «manual» y se conserva lo logrado hasta ahí.
- **Dado** una prueba de repeticiones, **cuando** hago una pausa larga, **entonces** termina con el motivo «pausa» (no hay límite de tiempo total; v1 no usa tests de 1 minuto).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

---

## C. Video y demostración

### HU-12 · Subir un video de mi galería
**Como** persona que entrena **quiero** elegir un video que ya grabé **para** evaluarme sin cámara en vivo (por ejemplo, desde el computador o con un amigo filmando).
- **Dado** un video de mi galería, **cuando** lo elijo, **entonces** se analiza en mi teléfono y veo el esqueleto y el conteo igual que en vivo.
- **Dado** un video donde no aparece el cuerpo completo, **cuando** termina el análisis, **entonces** se avisa que el resultado puede no ser confiable.
- **Dado** que el video no trae sensores, **cuando** se analiza, **entonces** la inclinación se estima con la postura de partida (ver HU-20).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-13 · Grabar un video desde la app
**Como** persona que entrena **quiero** grabar mi prueba desde la app y analizarla **para** hacerla en un lugar donde no tengo buena señal o donde prefiero ver el resultado después.
- **Dado** que elijo «grabar video», **cuando** termino de grabar, **entonces** el video se analiza en el teléfono y se muestra el resultado.
- **Dado** que el análisis termina, **cuando** cierro el resultado, **entonces** el video no queda guardado en ningún lugar de la app (ver HU-40).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-14 · Ver una demostración
**Como** persona que recién conoce la app (o como persona que quiere mostrársela a otra) **quiero** una demostración con una persona sintética **para** entender cómo funciona sin ponerme a hacer ejercicio.
- **Dado** que toco «Demostración», **cuando** elijo una prueba, **entonces** se reproduce una persona sintética haciendo esa prueba, con esqueleto, conteo y resultado.
- **Dado** la demostración, **cuando** termina, **entonces** el resultado NO se guarda en mi historial ni en mi perfil.
- Prioridad: **Could** · Sprint: S1 · Estado: **Hecho en v1**

### HU-15 · Ver mi esqueleto 2D sobre el video
**Como** persona que entrena **quiero** ver el esqueleto dibujado sobre mi imagen **para** confirmar que la app me está siguiendo bien.
- **Dado** que la cámara me ve, **cuando** me muevo, **entonces** los 33 puntos de MediaPipe se dibujan sobre mi cuerpo y siguen el movimiento sin saltos bruscos (suavizado con filtro 1€).
- **Dado** que un punto tiene visibilidad baja, **cuando** se dibuja, **entonces** se muestra atenuado o no se muestra, no con una posición inventada.
- **Dado** que se corrige la inclinación, **cuando** se dibuja, **entonces** el esqueleto usa el cuadro crudo (sin corregir), para que coincida con la imagen.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-16 · Ver mi esqueleto en 3D
**Como** persona que entrena **quiero** ver mi esqueleto en 3D (17 articulaciones, formato Human3.6M) **para** entender mejor mi postura y mi movimiento.
- **Dado** que MediaPipe entrega puntos «world», **cuando** abro la vista 3D, **entonces** se muestra el esqueleto de 17 articulaciones que puedo girar.
- **Dado** que no hay puntos 3D en un cuadro (`world = null`), **cuando** se dibuja, **entonces** la vista 3D no se rompe (no muestra nada o mantiene el último cuadro válido).
- **Dado** que esta es la vista de MediaPipe, **cuando** la leo, **entonces** no promete precisión de laboratorio (el 3D con VideoPose3D es fase 2, ver HU-60).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

---

## D. Inclinación y sensores

### HU-17 · Detectar qué sensores tiene mi teléfono
**Como** persona que entrena **quiero** que la app detecte si mi teléfono tiene giroscopio y acelerómetro **para** usarlos y medir la inclinación de la cámara.
- **Dado** un teléfono con sensores, **cuando** empiezo una evaluación, **entonces** la app informa cuáles hay (orientación, acelerómetro, giroscopio) y empieza a recibir sus datos.
- **Dado** un computador o un teléfono sin sensores, **cuando** empiezo, **entonces** la app lo detecta, sigue funcionando y usa la estimación por imagen (HU-20).
- **Dado** que el teléfono está quieto, **cuando** se toman las lecturas, **entonces** se marca `still = true` y la inclinación se considera confiable.
- **Dado** Ajustes, **cuando** toco «Probar sensores» con el teléfono quieto, **entonces** la app muestra qué sensores respondieron y la inclinación medida (diagnóstico).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-18 · Pedir el permiso de movimiento en iPhone
**Como** persona con iPhone **quiero** que la app me pida el permiso de sensores de movimiento en el momento correcto **para** que la corrección de inclinación funcione.
- **Dado** un iPhone con iOS 16.4 o superior, **cuando** toco «Comenzar», **entonces** el permiso se solicita dentro de ese toque (requisito de iOS).
- **Dado** que rechazo el permiso, **cuando** sigo, **entonces** la app continúa con la estimación por imagen y lo informa con un mensaje claro.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-19 · Corregir la pose según la inclinación del teléfono
**Como** persona que entrena **quiero** que la app mida cuánto está inclinada la cámara y corrija la pose **para** que una toma torcida no se confunda con una persona inclinada.
- **Dado** una cámara con roll de 10° hecha con el teléfono quieto, **cuando** se analiza una sentadilla, **entonces** la pose se rota para alinear la gravedad con el eje vertical de la imagen y el conteo es el mismo que con la cámara derecha.
- **Dado** una pose corregida, **cuando** se revisa el cuadro, **entonces** trae `corrected = true` y los datos de inclinación (roll, pitch si se conocen); el cuadro original no se modifica.
- **Dado** Ajustes, **cuando** desactivo «Corregir la inclinación del teléfono», **entonces** el análisis usa la pose sin corregir (la opción está activada por defecto).
- **Dado** que el roll supera 45°, **cuando** se evalúa, **entonces** se marca la imagen como girada y se avisa que hay que activar la rotación de pantalla o reencuadrar.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-20 · Estimar la inclinación sin sensores
**Como** persona que sube un video (o usa un equipo sin sensores) **quiero** que la app estime la inclinación con mi postura de partida **para** que mi resultado no dependa de si el video salió derecho.
- **Dado** un video sin sensores, **cuando** se analiza el inicio de la prueba, **entonces** la app estima la inclinación a partir de la postura de partida de esa prueba (por ejemplo, el eje del tronco en la posición inicial).
- **Dado** esa estimación, **cuando** se muestra, **entonces** se indica que es una estimación por imagen, menos precisa que la del sensor, con su nivel de confianza.
- **Dado** que la postura de partida es ambigua, **cuando** la dispersión es alta, **entonces** la app no corrige (inclinación «ninguna») y avisa que conviene volver a filmar con el teléfono derecho.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-21 · Combinar sensor e imagen y avisar si no coinciden
**Como** persona que entrena **quiero** que la app combine la medición del sensor con la estimación por imagen **para** detectar errores de uno de los dos.
- **Dado** que hay sensor e imagen, **cuando** se combinan, **entonces** la inclinación final y la diferencia entre ambos (`conflictDeg`) quedan registradas.
- **Dado** una diferencia grande entre sensor e imagen, **cuando** se muestra la inclinación, **entonces** se entrega un aviso de nivel «warn» o «bad» con un mensaje en español, y no un número sin explicar.
- **Dado** que solo hay uno de los dos, **cuando** se usa, **entonces** se indica cuál fue la fuente (`sensor` o `image`).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-22 · Avisar si muevo el teléfono durante la prueba
**Como** persona que entrena **quiero** que la app me avise si el teléfono se mueve después de iniciar **para** no invalidar mi resultado sin darme cuenta.
- **Dado** que la inclinación se fija al iniciar la prueba, **cuando** el teléfono se mueve más allá de lo esperado, **entonces** se muestra un aviso en pantalla.
- **Dado** ese aviso, **cuando** termina la prueba, **entonces** el resultado queda marcado con esa advertencia (no se oculta).
- Prioridad: **Should** · Sprint: S2 · Estado: **Hecho en v1**

---

## E. Cada prueba

Todas las pruebas son «hasta el fallo» (máximo continuo, sin tests de 1 o 2 minutos). Cada baremo vale solo con su protocolo.

### HU-23 · Flexiones de brazos (CSEP/ACSM)
**Como** persona que entrena **quiero** medir mis flexiones hasta el fallo **para** compararme con el baremo CSEP por edad y sexo.
- **Dado** que soy hombre, **cuando** hago flexiones, **entonces** se evalúan desde los pies; **dado** que soy mujer, **entonces** con apoyo de rodillas.
- **Dado** una flexión con espalda recta y brazos extendidos arriba, **cuando** completo la bajada y la subida, **entonces** cuenta; si la espalda cae o no extiendo arriba, no cuenta.
- **Dado** que termino, **cuando** veo el resultado, **entonces** se clasifica con el baremo CSEP de mi banda de edad.
- Cámara: horizontal, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-24 · Sentadillas (ACE)
**Como** persona que entrena **quiero** medir mis sentadillas hasta la fatiga **para** compararme con la tabla ACE.
- **Dado** una sentadilla, **cuando** los muslos llegan al paralelo con el suelo y vuelvo a estar de pie, **entonces** cuenta como válida.
- **Dado** una sentadilla que no llega al paralelo, **cuando** subo, **entonces** no cuenta y se avisa «baja más».
- **Dado** que veo el resultado, **cuando** abro las advertencias, **entonces** dice que el origen de esta tabla es dudoso (ver HU-31).
- Cámara: vertical, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-25 · Plancha en antebrazos (Strand 2014)
**Como** persona que entrena **quiero** cronometrar mi plancha hasta la fatiga **para** compararme con universitarios y con deportistas.
- **Dado** que mantengo la posición, **cuando** pasa el tiempo, **entonces** se muestra el cronómetro en m:ss y al final el tiempo con precisión de 0,1 s.
- **Dado** que pierdo la posición, o hago dos correcciones seguidas sin cumplir, **cuando** ocurre, **entonces** la prueba termina (un solo intento).
- **Dado** el resultado, **cuando** se muestra, **entonces** incluye percentil (ver HU-32).
- Cámara: horizontal, de lado. Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-26 · Dominadas (prueba opcional con barra)
**Como** persona que entrena y tiene acceso a una barra **quiero** medir mis dominadas **para** compararme con las referencias de China 2014, USMC y Thomas 2020.
- **Dado** que parto en suspensión con agarre prono y brazos extendidos, **cuando** el mentón sobrepasa la barra y vuelvo a extender por completo, **entonces** cuenta 1.
- **Dado** balanceo, impulso con las piernas o extensión incompleta, **cuando** ocurre, **entonces** esa repetición no cuenta.
- **Dado** que suelto la barra o apoyo los pies, **cuando** ocurre, **entonces** la prueba termina con el motivo «posición perdida».
- Cámara: vertical, de lado. Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-27 · Fondos en paralelas (prueba opcional con barra)
**Como** persona que entrena y tiene paralelas **quiero** medir mis fondos **para** registrar mi marca y compararme con Thomas 2020 cuando haya baremo.
- **Dado** que parto con los brazos extendidos, **cuando** cada codo llega al menos a 90° y vuelvo a extender por completo, **entonces** cuenta 1.
- **Dado** que ayudo con las piernas, **cuando** ocurre, **entonces** esa repetición no cuenta.
- **Dado** que soy mujer, **cuando** termino, **entonces** FitGram registra mi marca sin categoría y lo dice claramente (ver HU-33).
- Cámara: vertical, de lado. Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-28 · Guía de cómo filmar cada prueba
**Como** persona que entrena **quiero** una guía corta de dónde poner el teléfono y cómo ubicarme **para** no perder el resultado por un mal encuadre.
- **Dado** que elijo una prueba, **cuando** abro «Cómo filmar», **entonces** veo la orientación del teléfono (horizontal para flexiones y plancha; vertical para sentadillas, dominadas y fondos), que debo filmar de lado y la distancia recomendada (2,5–3 m).
- **Dado** que la guía se abre, **cuando** la leo, **entonces** cabe en una pantalla de teléfono sin deslizar más de una vez.
- **Dado** que ya la vi, **cuando** vuelvo a la prueba, **entonces** puedo saltarla con un toque.
- Hoy la guía es la pantalla «antes de la prueba» (`openIntro`): pasos de colocación del teléfono, dibujo de la ubicación y cómo mide FitGram cada prueba.
- Prioridad: **Should** · Sprint: S1 (revisión) · Estado: **Hecho en v1**

---

## F. Resultados y baremos

### HU-29 · Ver mi categoría según edad y sexo
**Como** persona que entrena **quiero** que la app me diga en qué categoría quedo (por ejemplo, «Promedio», 3 de 5) **para** saber dónde estoy parado, no solo cuánto hice.
- **Dado** un resultado válido, **cuando** se muestra la pantalla, **entonces** aparecen mi valor, la categoría con su posición (índice sobre total) y la banda de edad usada (por ejemplo, «20–29»).
- **Dado** el mismo valor, **cuando** cambio de sexo o de banda de edad, **entonces** la categoría puede cambiar, porque el baremo es distinto.
- **Dado** una prueba sin baremo para mi caso, **cuando** se muestra, **entonces** no se inventa una categoría (ver HU-33).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-30 · Ver la tabla del baremo y qué me falta para subir
**Como** persona que entrena **quiero** ver la tabla completa y cuánto me falta para el siguiente nivel **para** tener una meta concreta.
- **Dado** un resultado clasificado, **cuando** abro el detalle, **entonces** veo todas las filas del baremo, de menor a mayor, con mi fila resaltada.
- **Dado** que no estoy en la categoría más alta, **cuando** veo el detalle, **entonces** dice cuántas repeticiones o segundos faltan para la siguiente.
- **Dado** que estoy en la categoría más alta, **cuando** veo el detalle, **entonces** no aparece «siguiente nivel».
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-31 · Conocer la fuente y las limitaciones del baremo
**Como** persona que entrena (y como equipo FitGram) **quiero** ver de dónde sale cada baremo y qué limitaciones tiene **para** no sobreinterpretar el resultado.
- **Dado** cualquier clasificación, **cuando** abro «Fuente», **entonces** veo la referencia (formato APA) y, si existe, el enlace.
- **Dado** un baremo con advertencias, **cuando** se muestra, **entonces** aparecen en lenguaje simple: corte sin verificar, fuente dudosa (sentadillas ACE), extrapolado, muestra de personas entrenadas, estándar militar (USMC), edad fuera de la muestra, o estimado.
- **Dado** el protocolo de cada prueba, **cuando** se muestra el resultado, **entonces** se recuerda que el baremo vale solo con ese protocolo (hasta el fallo).
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-32 · Percentil en plancha y fondos
**Como** persona que entrena **quiero** ver un percentil cuando el baremo lo permite **para** entender qué porcentaje de personas de mi grupo supera mi marca.
- **Dado** una plancha, **cuando** termino, **entonces** veo el percentil calculado con el grupo que corresponde (deportistas, no deportistas o todos).
- **Dado** fondos (hombres), **cuando** termino, **entonces** el percentil aparece marcado como estimado.
- **Dado** una prueba que no entrega percentil, **cuando** veo el resultado, **entonces** no hay percentil (no se muestra 0 ni un valor inventado).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-33 · Fondos en mujeres: registrar la marca sin baremo
**Como** mujer que entrena **quiero** registrar mis fondos aunque todavía no exista baremo para mujeres **para** no quedar fuera y poder ver mi progreso.
- **Dado** una mujer que hace fondos, **cuando** termina, **entonces** se guarda su marca, no se muestra categoría ni percentil y aparece el aviso «sin baremo para mujeres todavía».
- **Dado** esa marca, **cuando** se calcula el perfil general (HU-34), **entonces** no se incluye (no cuenta como 0).
- **Dado** que aparezca un baremo publicado, **cuando** se agregue, **entonces** solo habrá que cargar la tabla en `src/norms.js`.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-34 · Perfil general exploratorio
**Como** persona que entrena **quiero** ver una síntesis de todas mis pruebas **para** tener una idea global de mi condición.
- **Dado** que hice una o más pruebas con baremo, **cuando** abro mi perfil, **entonces** veo la posición promedio (0 a 100) y su etiqueta: menos de 20 «Muy bajo», menos de 40 «Bajo», menos de 60 «Medio», menos de 80 «Alto», desde 80 «Muy alto».
- **Dado** que una prueba no tiene baremo, **cuando** se calcula, **entonces** se omite del promedio.
- **Dado** el perfil, **cuando** se muestra, **entonces** incluye una nota que dice que es un índice exploratorio de FitGram, no un puntaje validado.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

---

## G. Historial y avance

### HU-35 · Guardar mis resultados en el teléfono
**Como** persona que entrena **quiero** que cada resultado quede guardado en mi teléfono **para** no empezar de cero cada vez.
- **Dado** que termino una prueba, **cuando** acepto el resultado, **entonces** se guarda con fecha, prueba, valor, categoría y la fuente de inclinación usada.
- **Dado** que cierro y abro la app, **cuando** vuelvo, **entonces** mis resultados siguen ahí sin conexión a internet.
- **Dado** una demostración (HU-14), **cuando** termina, **entonces** no se guarda nada.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-36 · Ver mi historial por prueba
**Como** persona que entrena **quiero** ver todos mis resultados de una prueba, ordenados por fecha **para** revisar cómo he evolucionado.
- **Dado** que tengo 2 o más resultados de una prueba, **cuando** abro el historial, **entonces** veo la lista (y un gráfico simple) con fecha y valor, del más reciente al más antiguo.
- **Dado** que no tengo resultados, **cuando** abro el historial, **entonces** veo un mensaje que me invita a hacer la primera prueba.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-37 · Ver mi avance entre evaluaciones (cada ~4 semanas)
**Como** persona que entrena **quiero** que la app me muestre el cambio entre mi última evaluación y la anterior **para** saber si estoy mejorando, idealmente repitiendo la evaluación cada 4 semanas.
- **Dado** dos resultados de la misma prueba, **cuando** veo el último, **entonces** aparece la diferencia (por ejemplo, «+3 repeticiones» o «−0:12») y si cambió la categoría.
- **Dado** que pasaron 4 semanas o más desde mi última evaluación, **cuando** abro la app, **entonces** me sugiere repetirla (sin enviar notificaciones externas).
- **Dado** que los dos resultados se midieron con protocolos distintos (por ejemplo, flexiones con y sin rodillas), **cuando** se comparan, **entonces** se avisa que no son comparables.
- Hoy está hecho el avance contra el intento anterior (incluye el aviso de «no comparable» en flexiones con pies vs rodillas) y los últimos intentos por prueba en el perfil. **Falta** el recordatorio a las 4 semanas.
- Prioridad: **Should** · Sprint: S3 · Estado: **Pendiente, parcial**

### HU-38 · Borrar mis datos
**Como** persona que entrena **quiero** borrar un resultado, o todos mis datos, desde la app **para** controlar mi información.
- **Dado** un resultado, **cuando** toco «Borrar» y confirmo, **entonces** desaparece del historial y de mi perfil.
- **Dado** «Borrar todos mis datos», **cuando** confirmo (con una pregunta de confirmación explícita), **entonces** se elimina el perfil, los resultados y la configuración del teléfono.
- **Dado** que borro, **cuando** exporto después, **entonces** el archivo ya no incluye lo borrado.
- Hoy está hecho «Borrar mis datos de este teléfono» (todo, con confirmación). **Falta** borrar un solo resultado.
- Prioridad: **Must** · Sprint: S2 · Estado: **Pendiente, parcial**

---

## H. Datos y privacidad

### HU-39 · Todo se procesa en el teléfono
**Como** persona que entrena **quiero** que mi video y mis resultados se procesen solo en mi teléfono **para** no exponerme a que mis imágenes viajen por internet.
- **Dado** que uso la app (cámara en vivo, video subido o demostración), **cuando** reviso el tráfico de red del navegador, **entonces** después de cargar la app (y el modelo) no hay ninguna solicitud con datos míos.
- **Dado** MediaPipe, **cuando** se carga, **entonces** viene incluido en el sitio con el envío de estadísticas de uso desactivado.
- **Dado** v1, **cuando** se revisa el código, **entonces** no existe ninguna llamada de envío de datos a un servidor propio ni de terceros.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-40 · El video nunca se guarda
**Como** persona que entrena **quiero** la certeza de que mi video no queda almacenado **para** usar la app incluso en un lugar donde me sentiría incómoda con una grabación.
- **Dado** una prueba en vivo, **cuando** termina, **entonces** no existe ningún archivo de video generado por la app (solo se procesan cuadros en memoria).
- **Dado** un video subido, **cuando** termina el análisis, **entonces** la app no conserva copia; el archivo original sigue solo en mi galería.
- **Dado** el historial y la exportación, **cuando** se revisan, **entonces** contienen números y fechas, nunca imágenes ni video.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-41 · No perder mis datos de v0
**Como** persona que ya probó la versión anterior **quiero** que mis datos se migren **para** no perder mi historial.
- **Dado** datos guardados bajo la clave `fitgram.v0`, **cuando** abro v1 por primera vez, **entonces** se migran al esquema nuevo (`fitgram.v1`).
- **Dado** una migración con datos inválidos, **cuando** ocurre, **entonces** la app no se cae: ignora lo inválido y sigue.
- Prioridad: **Could** · Sprint: S1 · Estado: **Hecho en v1**

### HU-42 · Registro anónimo listo para una futura base central
**Como** equipo FitGram **quiero** que cada resultado se pueda convertir en un registro anónimo **para** poder alimentar, más adelante y con consentimiento, una base de datos central sin exponer a nadie.
- **Dado** un resultado, **cuando** se llama a `toAnonymousRecord`, **entonces** devuelve solo: banda de edad, sexo, prueba, valor y mes (sin nombre, sin video, sin edad exacta ni fecha exacta).
- **Dado** v1, **cuando** se usa la app, **entonces** esa función no se ejecuta contra ningún servidor (solo existe el diseño; ver HU-57).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

---

## I. Exportar y compartir

### HU-43 · Exportar mis datos en JSON
**Como** persona que entrena (o entrenador que quiere revisar los datos) **quiero** descargar todos mis datos en JSON **para** guardarlos o llevarlos a otra herramienta.
- **Dado** que toco «Exportar JSON», **cuando** se genera, **entonces** descarga un archivo con perfil, resultados e historial en el esquema `schema: 1`.
- **Dado** que no tengo resultados, **cuando** exporto, **entonces** el archivo trae el perfil y listas vacías, no falla.
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

### HU-44 · Exportar mis resultados en CSV
**Como** persona que entrena (o entrenador) **quiero** descargar mi historial en CSV **para** abrirlo en una planilla y hacer mis propios gráficos.
- **Dado** que toco «Exportar CSV», **cuando** se genera, **entonces** descarga una fila por resultado con: fecha, prueba, valor, unidad, categoría y banda.
- **Dado** que un valor tiene coma decimal, **cuando** se exporta, **entonces** el archivo se abre bien en Excel en español (sin romper las columnas).
- Prioridad: **Should** · Sprint: S1 · Estado: **Hecho en v1**

---

## J. Accesibilidad e idioma

### HU-45 · Español de Chile
**Como** persona que entrena **quiero** que la app me hable en español de Chile, corto y claro **para** entenderla sin esfuerzo.
- **Dado** cualquier pantalla, mensaje o aviso, **cuando** se muestra, **entonces** está en español de Chile.
- **Dado** un número decimal, **cuando** se muestra, **entonces** usa coma (por ejemplo, 12,5); la plancha se muestra en m:ss y las repeticiones como enteros.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-46 · Usar la app sin conexión después de la primera carga
**Como** persona que entrena en una plaza o parque **quiero** que la app funcione sin internet después de abrirla una vez **para** evaluarme donde no hay señal.
- **Dado** que abrí la app con internet una vez, **cuando** la abro sin conexión (modo avión), **entonces** carga y permite hacer pruebas, ver el historial y exportar.
- **Dado** que hay una versión nueva, **cuando** vuelvo a tener conexión, **entonces** la app se actualiza y se me avisa.
- **Dado** que nunca abrí la app con internet, **cuando** intento abrirla sin conexión, **entonces** se muestra un mensaje claro de que necesita conexión la primera vez.
- Prioridad: **Should** · Sprint: S3 · Estado: **Pendiente**

### HU-47 · Una sola app web para Android, iPhone y computador
**Como** persona que entrena **quiero** abrir FitGram desde un enlace, en cualquier dispositivo **para** no tener que instalar nada ni depender de una tienda de aplicaciones.
- **Dado** un iPhone con iOS Safari 16.4 o superior, o un Android con Chrome, **cuando** abro el enlace de GitHub Pages, **entonces** la app carga y la cámara funciona (HTTPS).
- **Dado** un computador, **cuando** abro el enlace, **entonces** puedo subir un video y ver los resultados (la cámara depende del equipo).
- **Dado** un navegador no soportado, **cuando** abro el enlace, **entonces** se muestra un mensaje que dice qué navegador usar.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-48 · Legibilidad y uso a distancia
**Como** persona que entrena **quiero** textos y botones grandes y con buen contraste **para** poder usar la app a 2,5–3 m del teléfono y con luz exterior.
- **Dado** el modo de evaluación, **cuando** estoy a 2,5 m, **entonces** el contador y los avisos se leen sin acercarme (texto grande, alto contraste).
- **Dado** los avisos de técnica, **cuando** aparecen, **entonces** no dependen solo del color: llevan texto o ícono.
- **Dado** cualquier botón, **cuando** lo toco, **entonces** su área mide al menos 44 × 44 px.
- Prioridad: **Should** · Sprint: S3 · Estado: **Pendiente**

---

## K. Calidad y validación

### HU-49 · Pruebas automáticas
**Como** equipo FitGram **quiero** pruebas automáticas por módulo **para** cambiar el código sin romper lo que ya funciona.
- **Dado** el repositorio, **cuando** corro `node --test test/*.test.mjs`, **entonces** todo pasa en Node 22.
- **Dado** un baremo, **cuando** se cambia, **entonces** una prueba verifica los bordes de cada banda (valor justo en el límite).
- **Dado** `AUDIENCE`, **cuando** se cambia, **entonces** una prueba verifica que sigue dentro de `NORMS_AGE`.
- Prioridad: **Must** · Sprint: S1 · Estado: **Hecho en v1**

### HU-50 · Validar el conteo contra dos evaluadores humanos
**Como** equipo FitGram **quiero** comparar el conteo de la app con el de dos evaluadores en 10 a 15 jóvenes **para** saber si el conteo es confiable (meta: concordancia ≥ 95 %).
- **Dado** 10 a 15 personas de 18 a 30 años, **cuando** hacen las 3 pruebas de la evaluación base (y las de barra si pueden), **entonces** cada serie la cuentan por separado dos evaluadores y la app.
- **Dado** los conteos, **cuando** se calcula la concordancia (método en `ALCANCE_MVP.md`), **entonces** el informe muestra el resultado global y por prueba, con los casos en que falló y por qué.
- **Dado** que la concordancia global queda bajo 95 %, **cuando** se cierra el informe, **entonces** se abre un plan de mejora y se repite la validación antes de afirmar la cifra en público.
- Prioridad: **Must** · Sprint: S5–S6 · Estado: **Pendiente**

### HU-51 · Probar la corrección de inclinación con escenas sintéticas y con personas
**Como** equipo FitGram **quiero** comprobar que la corrección de inclinación funciona con la misma escena vista con la cámara torcida **para** confiar en que un teléfono ladeado no cambia el conteo.
- **Dado** una persona sintética con cámara inclinada (`cameraRoll`/`cameraPitch`), **cuando** se corrige, **entonces** el conteo coincide con el de la cámara derecha.
- **Dado** la validación con personas (HU-50), **cuando** se filman al menos 1 de cada 3 series con el teléfono deliberadamente inclinado, **entonces** se reporta aparte la concordancia en esas series y con sensor versus sin sensor.
- **Dado** que la estimación solo por imagen es menos precisa que el sensor, **cuando** se reporta, **entonces** la diferencia queda documentada como limitación conocida.
- Prioridad: **Must** · Sprint: S5 · Estado: **Pendiente**

### HU-52 · Documentar para que el proyecto no dependa de una persona
**Como** equipo FitGram **quiero** documentar el producto, la arquitectura y las decisiones **para** que, si alguien no está (el «factor camión»), otra persona pueda seguir.
- **Dado** el repositorio, **cuando** alguien nuevo lo abre, **entonces** encuentra `CONTRACT.md`, `README`, estas historias, `ALCANCE_MVP.md` y `docs/ARQUITECTURA.md`.
- **Dado** cada archivo de `src/`, **cuando** se abre, **entonces** tiene un encabezado de 3 a 8 líneas con su responsabilidad, y JSDoc en lo exportado.
- **Dado** una decisión de producto (por ejemplo, rango de edad, pruebas incluidas), **cuando** cambia, **entonces** se actualiza el documento correspondiente en el mismo sprint.
- Prioridad: **Must** · Sprint: S1 y continuo · Estado: **Pendiente**

---

## L. Futuro: entrenadores, base central, juego, más ejercicios

Nada de esta épica entra al MVP. Está aquí para que el diseño de v1 no cierre puertas (por ejemplo, el registro anónimo de HU-42).

### HU-53 · Vincular a mis atletas
**Como** entrenador/a **quiero** vincular a las personas que entreno a mi cuenta **para** ver sus resultados sin pedírselos uno por uno.
- **Dado** que tengo licencia, **cuando** invito a una persona, **entonces** debe aceptar la vinculación antes de que yo vea sus datos.
- **Dado** una persona vinculada, **cuando** quiere desvincularse, **entonces** puede hacerlo desde su app y dejo de ver sus datos.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

### HU-54 · Enviar pruebas para hacer en casa y ver el reporte del equipo
**Como** entrenador/a **quiero** enviar pruebas para que mis atletas las hagan en casa y ver los resultados de todo el equipo en un informe **para** dejar de contar a ojo y de escribir el informe a mano (por ejemplo, con un equipo de básquetbol de adultos mayores).
- **Dado** que envío una batería de pruebas, **cuando** una persona la completa, **entonces** yo veo su resultado y su categoría.
- **Dado** un equipo, **cuando** pido el informe, **entonces** se genera un resumen con todos los resultados en un solo documento (PDF o CSV).
- **Dado** que la persona es mayor de 30 años, **cuando** se evalúa, **entonces** depende de que existan baremos para su edad (v1 solo cubre 18–30).
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
- **Dado** el diseño actual, **cuando** se revisa, **entonces** `toAnonymousRecord` (HU-42) ya entrega el formato; falta el servidor, el consentimiento y la seguridad.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro** (diseñado, no construido)

### HU-58 · Modo juego y progresión
**Como** persona que entrena **quiero** un modo de juego (por ejemplo, un «Flappy Bird» controlado con flexiones o press militar), rachas y desbloqueo de ejercicios **para** engancharme y volver cada día.
- **Dado** el modo juego, **cuando** muevo los brazos, **entonces** el personaje se controla con el punto medio entre mis manos.
- **Dado** que llevo varios días seguidos, **cuando** abro la app, **entonces** veo mi racha y puedo desbloquear una prueba nueva (estilo Duolingo).
- **Dado** el MVP, **cuando** se define el alcance, **entonces** este modo queda fuera: es una función de crecimiento. Elías tiene un prototipo.
- Prioridad: **Won't (ahora)** · Sprint: Post · Estado: **Futuro**

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

## Requerimientos no funcionales

| Área | Requerimiento | Cómo se comprueba |
|---|---|---|
| Privacidad | Todo el procesamiento ocurre en el teléfono. v1 no envía video ni resultados a internet. El video no se guarda. | Revisar el tráfico de red tras la carga; revisar el código (HU-39, HU-40). |
| Rendimiento | En un teléfono de gama media (por ejemplo, Android con 4 GB de RAM de hace 3 a 4 años), el análisis corre a **15 cuadros por segundo o más**, y el contador responde en menos de 1 s desde que termina la repetición. Objetivo, por medir en S2. | Prueba en 2 o 3 teléfonos de gama media; se registra el FPS. |
| Sin conexión | Después de la primera carga, la app funciona sin internet (pruebas, historial, exportar). Hoy es **Pendiente** (HU-46). | Modo avión tras cargar una vez. |
| Accesibilidad | Textos grandes y legibles a 2,5–3 m; los avisos no dependen solo del color; botones de al menos 44 × 44 px (HU-48). | Revisión manual con lista de chequeo. |
| Navegadores | iOS Safari 16.4 o superior y Chrome en Android. En computador, Chrome. Otros navegadores: sin garantía. | Prueba manual en cada navegador por sprint. |
| Batería y calor | Una prueba típica (máximo 5 minutos de cámara y análisis) no debe subir el consumo de batería más de un 5 % ni dejar el teléfono incómodo al tacto. La app pausa el análisis cuando la pantalla no está activa. Objetivo, por medir en S2. | Medir el porcentaje de batería antes y después de 3 pruebas seguidas. |
| Retención de datos | Los resultados viven solo en el teléfono hasta que la persona los borre (HU-38) o borre los datos del sitio. No hay copia en un servidor. Si se cambia de teléfono, se usa la exportación JSON. | Revisión manual; prueba de borrado. |
| Idioma y formato | Español de Chile; coma decimal; plancha en m:ss. | Revisión de textos (HU-45). |
| Mantenibilidad | Un archivo por responsabilidad, sin ciclos de dependencias, JSDoc en lo exportado, pruebas por módulo. | `node --test test/*.test.mjs`; revisión de código. |
| Licencias de terceros | MediaPipe (Apache 2.0) sin problema comercial. VideoPose3D (CC BY-NC 4.0) solo para uso no comercial: no entra a un producto de pago sin revisión (HU-60). | Revisión antes de cada nueva dependencia. |

## Limitaciones que hay que decir con honestidad

- **Sentadillas (ACE):** el origen de la tabla es dudoso. La app lo advierte (`questionable_source`); no debe presentarse como un estándar sólido.
- **Fondos en mujeres:** no existe baremo publicado. FitGram solo registra la marca (HU-33).
- **Inclinación sin sensores:** la estimación solo por imagen es menos precisa que la del sensor. Con videos subidos, la corrección es aproximada.
- **Perfil global:** es un promedio exploratorio de posiciones, no una escala validada.
- **Baremos hasta el fallo:** no se pueden mezclar con tablas de 1 o 2 minutos; por eso se excluyeron.
- **Conteo:** la meta de ≥ 95 % de concordancia con evaluadores humanos todavía no se ha medido (HU-50).
