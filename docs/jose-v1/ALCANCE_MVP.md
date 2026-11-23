# FitGram — Alcance del MVP (v1)

Equipo: José Golborne y Elías Hermosilla (UNAB, Programa Endowment Emprendimiento Innovador UNAB 2026), con David como desarrollador. Última actualización: 12 de noviembre de 2026. Detalle técnico en `CONTRACT.md`; requerimientos en `HISTORIAS_DE_USUARIO.md`.

## 1. Objetivo del MVP

Probar una sola hipótesis: **una persona de 18 a 30 años que ya entrena puede medirse con la cámara de su teléfono y saber dónde está respecto de baremos científicos por edad y sexo**, con un conteo de repeticiones en que se puede confiar.

FitGram es **diagnóstico, no adherencia**: «Te mide el salto, pero no te dice dónde está tu salto». Mide y compara.

## 2. Qué hace v1

| Área | Qué hace |
|---|---|
| Usuarios | Personas de 18 a 30 años que ya entrenan (gimnasio, casa, plaza, parque). El rango está en `AUDIENCE` (`src/config.js`), un solo lugar. |
| Pruebas base (sin equipamiento) | Flexiones (CSEP/ACSM), sentadillas (ACE), plancha en antebrazos (Strand 2014). |
| Pruebas opcionales con barra | Dominadas (China 2014 / USMC / Thomas 2020) y fondos (Thomas 2020; sin baremo para mujeres: se registra la marca). |
| Protocolo | Todas «hasta el fallo» (sin pruebas de 1 minuto). Se cuentan solo las repeticiones válidas. |
| Cámara y video | Cámara en vivo, video grabado o subido, y demostración con persona sintética. Esqueleto 2D y vista 3D (17 articulaciones). |
| Inclinación | Detecta giroscopio/acelerómetro, mide la inclinación de la cámara y corrige la pose. Sin sensores (videos subidos) la estima con la postura de partida. |
| Resultados | Categoría por edad y sexo, tabla del baremo, qué falta para el siguiente nivel, fuente y advertencias, percentil (plancha; fondos estimado) y perfil general exploratorio. |
| Historial | Resultados guardados en el teléfono, historial por prueba (para ver el avance cada ~4 semanas) y exportación a JSON y CSV. |
| Privacidad | Todo se procesa en el teléfono. No se envía nada a internet. El video nunca se guarda. |
| Plataforma | Una sola app web (Android, iPhone y computador), publicada en GitHub Pages. |

## 3. Qué NO hace v1 (fuera de alcance)

- **No** tiene cuentas de usuario, inicio de sesión ni servidor propio.
- **No** tiene base de datos central. Se diseñó el registro anónimo (`toAnonymousRecord`), pero no se envía ni se recibe nada.
- **No** tiene funciones para entrenadores (vincular atletas, enviar pruebas, informes de equipo), ni licencias para gimnasios, colegios, universidades o municipios. Son el modelo de negocio futuro.
- **No** tiene modo juego, rachas ni desbloqueo de ejercicios («Flappy Bird», estilo Duolingo). Es una función de crecimiento; Elías tiene un prototipo.
- **No** evalúa ejercicios con pesas o mancuernas, ni máquinas de polea (explícitamente fuera por ahora).
- **No** tiene baremos para menores de 18 ni mayores de 30 años. La app lo dice y no clasifica.
- **No** usa pruebas de 1 o 2 minutos (se excluyen las tablas de Golding, USMC en 2 min y Topend en 60 s).
- **No** incluye VideoPose3D (fase 2; los pesos son de uso no comercial, CC BY-NC 4.0).
- **No** diagnostica ni reemplaza a un profesional de la salud. El perfil general es un índice exploratorio, no un puntaje validado.
- **No** guarda video, ni envía notificaciones, ni se publica en App Store ni Play Store.
- **No** es una app nativa; es web.

## 4. Supuestos

1. Quien se evalúa puede dejar el teléfono apoyado, quieto, a 2,5–3 m y filmarse **de lado** (horizontal para flexiones y plancha; vertical para sentadillas, dominadas y fondos).
2. Los baremos publicados siguen valiendo para jóvenes chilenos de 18 a 30 años. Muchos vienen de otros países y poblaciones (universitarios, militares, personas que entrenan). Es un supuesto, no un hecho comprobado.
3. MediaPipe Pose Landmarker en el navegador es suficientemente preciso para contar repeticiones con una sola cámara.
4. Los teléfonos objetivo son de gama media (iOS Safari 16.4 o superior, Chrome en Android).
5. Cada baremo vale solo con su protocolo; si la persona no sigue el protocolo, la categoría no es válida.
6. Es posible reunir 10 a 15 jóvenes y 2 evaluadores humanos antes de febrero de 2027.
7. David se suma al equipo y revisa y mantiene el código (hoy v1 la escribieron agentes de IA; hay que revisarlo a mano).

## 5. Riesgos y mitigación

| # | Riesgo | Efecto | Mitigación |
|---|---|---|---|
| R1 | El conteo no alcanza ≥ 95 % de concordancia | No se puede afirmar que sea confiable | Validar en S5–S6; revisar los umbrales por prueba; reportar la cifra real aunque sea baja. |
| R2 | Baremo dudoso: sentadillas (origen incierto de la tabla ACE) | Clasificación poco sólida | Advertencia visible (`questionable_source`); buscar un baremo mejor; no presentarlo como estándar. |
| R3 | Fondos sin baremo para mujeres | Una parte del público no recibe categoría | Se registra la marca; se avisa; se busca literatura nueva. |
| R4 | La estimación de inclinación solo por imagen es menos precisa que el sensor | Errores de conteo en videos subidos | Preferir cámara en vivo con sensores; aviso de baja confianza; medir la diferencia en la validación (HU-51). |
| R5 | iOS exige permiso de movimiento y limita algunas funciones del navegador | La corrección por sensor no funciona en algunos iPhone | Pedir el permiso dentro del toque del usuario; con rechazo, usar la estimación por imagen; probar en iPhone real. |
| R6 | Mala iluminación, ropa suelta o mal encuadre | Puntos mal detectados | Guía de filmado (HU-28), verificación de posición antes de empezar, avisos de cuerpo no visible. |
| R7 | Rendimiento, batería y calor en teléfonos de gama media | Se pierde cuadros o el equipo se calienta | Medir en S2; bajar la resolución o la frecuencia de análisis si hace falta. |
| R8 | Tiempo escaso (fin de semestre, el pitch, Corfo) | No se llega a validar | Sprints de 2 semanas, backlog priorizado con MoSCoW, la validación tiene fecha fija (S5–S6) y un colchón hasta fin de febrero. |
| R9 | Dependencia de una sola persona (factor camión) | El proyecto se detiene si falta alguien | Documentar todo (HU-52), código modular, reuniones de traspaso. |
| R10 | Licencias: VideoPose3D es no comercial | No se puede usar en un producto de pago | No incluirlo en el MVP; revisar licencia antes de la fase 2. |
| R11 | Protección legal: el software se protege por derecho de autor, no por patente | Idea copiable | Registrar marca y derecho de autor (mar–jun 2027); cuidar qué se muestra antes de registrar. |
| R12 | Datos de salud sensibles | Riesgo reputacional y legal | v1 no envía nada; consentimiento explícito antes de cualquier base central; revisar la normativa de datos personales antes de construirla. |

## 6. Plan de validación

**Pregunta:** ¿cuenta FitGram las repeticiones (y mide los segundos) igual que dos evaluadores humanos?

**Muestra.** 10 a 15 jóvenes de 18 a 30 años que ya entrenan, con consentimiento informado. Cada una hace la evaluación base (flexiones, sentadillas, plancha) y, si puede, dominadas y fondos. Así salen entre 30 y 45 series (más si hay pruebas con barra). Es una muestra pequeña: se reportan intervalos de confianza y no se generaliza más allá de esa muestra.

**Procedimiento.**
1. Dos evaluadores (A y B) cuentan en vivo, cada uno por su cuenta y sin ver la pantalla, las repeticiones válidas según el protocolo de cada prueba. En la plancha cronometran con cronómetro.
2. La app corre en paralelo con el teléfono apoyado, siguiendo la guía de filmado.
3. Al menos 1 de cada 3 series se filma con el teléfono deliberadamente inclinado (unos 10–15°), y algunas se repiten subiendo el video para medir el caso «sin sensores».
4. No se guarda video, salvo con consentimiento específico, y se borra al terminar la validación.

**Cálculo de la concordancia.**
- **Referencia por serie (R):** si A y B difieren en 1 repetición o menos, R es el promedio de ambos (redondeado hacia arriba). Si difieren en 2 o más, se revisan juntos y, si no hay acuerdo, la serie se descarta y se informa.
- **Concordancia por serie:** `1 − |app − R| / max(R, 1)`.
- **Concordancia global (meta):** `1 − Σ|app − R| / Σ R`, sumando todas las series de repeticiones. **Meta: ≥ 95 %.**
- **Por prueba:** se calcula lo mismo en cada prueba; ninguna debería quedar bajo 90 % sin explicación.
- **Plancha:** se compara el tiempo de la app con el cronómetro; se informa el error absoluto medio y el porcentaje de series con diferencia de hasta 2 s.
- **Referencia de comparación:** se calcula también el acuerdo entre A y B con la misma fórmula; la app no debería ser menos consistente que dos humanos entre sí.
- **Informe:** tabla por persona y prueba, error medio con su intervalo de confianza, y análisis de cada serie con diferencia mayor a 1 repetición (causa probable: encuadre, iluminación, técnica, inclinación).

**Criterio de decisión.** Con ≥ 95 % global y sin prueba bajo 90 %, el conteo se declara «validado en una muestra piloto». Si no, se corrige y se repite antes de afirmar la cifra públicamente.

## 7. Definición de «Hecho» (Definition of Done) de una historia

Una historia está Hecha cuando:
1. Sus criterios de aceptación Dado/Cuando/Entonces se cumplen y se probaron (a mano o con prueba automática).
2. El código respeta `CONTRACT.md` (módulos, importaciones, JSDoc, umbrales documentados) y `node --test test/*.test.mjs` pasa completo.
3. Tiene pruebas automáticas si es lógica pura (baremos, inclinación, analizadores).
4. Funciona en iOS Safari 16.4 o superior y en Chrome Android, y en un teléfono de gama media.
5. Los textos de usuario están en español de Chile.
6. No agrega envío de datos a internet ni guarda video.
7. La documentación afectada está actualizada (historias, contrato, arquitectura).
8. Otra persona del equipo la revisó y la aceptó, y está publicada en GitHub Pages.

## 8. Plan de sprints (2 semanas cada uno)

Hoy es 12 de noviembre de 2026. Los sprints parten el lunes 16 de noviembre. **S1 define el MVP** (método propuesto por David: Scrum).

| Sprint | Fechas | Objetivo | Historias principales |
|---|---|---|---|
| **S1** | 16–27 nov | Fijar el alcance, revisar lo hecho en v1 contra los criterios de aceptación y empezar la documentación. David revisa y compila el código. | Revisar las historias «Hecho en v1»; HU-52 (documentación). |
| **S2** | 30 nov–11 dic | Pendientes de entrada y uso: bienvenida y borrar un resultado. Medir rendimiento y batería en teléfonos de gama media. | HU-05 (bienvenida), HU-38 (borrar un resultado). HU-28 y HU-22 ya están hechas en v1 y solo se revisan. |
| **S3** | 14–25 dic | Historial útil y uso sin conexión. Capacidad reducida por fiestas. | HU-37 (recordatorio de 4 semanas), HU-46, HU-48. |
| **S4** | 28 dic–8 ene | Cerrar el MVP: corregir errores, afinar umbrales con pruebas internas y congelar el alcance. Preparar los materiales de validación (consentimiento, planilla de conteo, protocolo). | Corrección de errores; planilla y consentimiento. |
| **S5** | 11–22 ene | Validación con las primeras 6 a 8 personas; prueba de inclinación (con sensor, sin sensor, inclinado). | HU-50 (primera mitad), HU-51. |
| **S6** | 25 ene–5 feb | Validación con el resto (hasta 15), cálculo de la concordancia, informe y ajustes. | HU-50 (cierre), informe. |
| Colchón | 8–26 feb | Repetir validación si no se alcanzó el 95 %, preparar el prototipo para entregar y documentar lo aprendido. | — |

**Después del MVP (hoja de ruta de 12 meses desde nov. 2026).**
- **Hasta feb. 2027:** prototipo y validación con 10–15 jóvenes frente a dos evaluadores (meta ≥ 95 %); desarrollador en el equipo.
- **Mar–jun 2027:** registro de marca y de derecho de autor.
- **Jul–sep 2027:** postulación a Corfo Semilla Inicia (fechas por confirmar en corfo.cl). En la conversación con David se mencionó que habría una convocatoria abierta entre el 11 de noviembre y el 11 de diciembre de este año; está sin confirmar. Si se confirma, hay que decidir si se postula ahora con el prototipo actual.
- **Oct–dic 2027:** primeros clientes (piloto con cursos UNAB y con una comuna).

## 9. Glosario

| Término | Significado |
|---|---|
| **Baremo** | Tabla publicada que convierte un resultado (repeticiones o segundos) en una categoría o percentil según edad y sexo. Vale solo con el protocolo con que se construyó. |
| **Hasta el fallo** | Protocolo en que la persona hace el máximo posible sin descanso ni límite de tiempo, hasta que ya no puede mantener la técnica. |
| **Repetición válida** | Repetición que cumple el protocolo de la prueba (por ejemplo, codo a 90° o menos en fondos, mentón sobre la barra en dominadas). Solo estas suman. |
| **Percentil** | Porcentaje del grupo de comparación que tiene un resultado igual o menor. El percentil 70 significa que la persona supera al 70 % del grupo. |
| **Categoría** | Nivel dentro del baremo (por ejemplo, «Promedio», 3 de 5). |
| **Inclinación** | Cuánto está torcida la cámara respecto de la gravedad. |
| **Roll** | Giro de la imagen en su propio plano (como inclinar la cabeza hacia el hombro); 0° es derecho. |
| **Pitch** | Cabeceo de la cámara: positivo si mira hacia arriba del horizonte. Solo se conoce con sensores. |
| **Giroscopio y acelerómetro** | Sensores del teléfono que miden su orientación y su movimiento; sirven para saber hacia dónde está la gravedad. |
| **Landmarks (puntos)** | Los 33 puntos del cuerpo que detecta MediaPipe (nariz, hombros, codos, caderas, etc.), en 2D y en 3D. |
| **MediaPipe Pose Landmarker** | Modelo de Google que detecta los landmarks en el navegador, sin enviar nada a internet. |
| **Human3.6M / VideoPose3D** | Formato de esqueleto de 17 articulaciones y modelo que lleva puntos 2D a 3D. Fase 2; pesos de uso no comercial. |
| **Concordancia** | Qué tan parecido es el conteo de la app al de los evaluadores humanos (fórmula en la sección 6). |
| **MVP** | Mínimo producto viable: lo más importante para que funcione y se pueda probar. |
| **Sprint** | Bloque de trabajo de 2 semanas en Scrum. |
| **Historia de usuario** | Requerimiento en la forma «Como <rol> quiero <acción> para <beneficio>». |
| **Criterio de aceptación** | Condición concreta (Dado/Cuando/Entonces) que debe cumplirse para dar por buena una historia. |
| **MoSCoW** | Priorización: Must (debe), Should (debería), Could (podría), Won't (no por ahora). |
| **Factor camión** | Cuántas personas tendrían que faltar para que el proyecto se detenga. Se reduce documentando todo. |
| **GitHub Pages** | Hosting gratuito de sitios estáticos con HTTPS, que usa FitGram. |
| **Semilla Inicia** | Línea de Corfo para empezar a desarrollar y prototipar una idea. Montos y fechas por confirmar. |
