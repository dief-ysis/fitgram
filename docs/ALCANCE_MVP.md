# FitGram — Alcance del MVP

Equipo: José Golborne y Elías Hermosilla (Ciencias del Deporte, UNAB; Programa Endowment Emprendimiento Innovador UNAB 2026), con David como desarrollador. Basado en el alcance que escribió José para FitGram v1, su versión paralela de la app (12-nov-2026; sus historias son del 13-nov, en `docs/jose-v1/`), **adaptado a esta app el 22-nov-2026**. Requerimientos en `HISTORIAS_DE_USUARIO.md`; detalle técnico en `ARQUITECTURA.md`.

> 🔎 Las marcas «🔎» señalan dónde esta app difiere de lo que definió José o donde hay una decisión abierta. Las decisiones de criterio (pruebas, edades, baremos, cómo se valida) son de José y Elías.
>
> **Códigos de preguntas (A1, B2…):** preguntas abiertas en `preguntas-para-jose-y-elias.md` (carpeta del proyecto, fuera del repositorio). La tabla con una línea por código está al inicio de `HISTORIAS_DE_USUARIO.md`. En este documento, «teléfono» incluye tablets.

## 1. Objetivo del MVP

Probar una sola hipótesis: **una persona joven que ya entrena puede medirse con la cámara de su teléfono y saber dónde está respecto de baremos científicos por edad y sexo**, con un conteo de repeticiones en que se puede confiar.

FitGram es **diagnóstico, no adherencia**: «Te mide el salto, pero no te dice dónde está tu salto». Mide y compara.

## 2. Qué hace el MVP (estado al 22-nov)

| Área | Qué hace |
|---|---|
| Usuarios | Personas de **18 a 21 años** que ya entrenan: es el rango vigente de la app. 🔎 La v1 decía 18 a 30; si se amplía está abierto (pregunta B2). El rango vive en un solo lugar del código (`AGE_RANGE`, `src/norms.mjs`). |
| Pruebas | Flexiones (CSEP/ACSM; hombres desde los pies, mujeres con rodillas), sentadillas (ACE), plancha en antebrazos (Strand 2014). 🔎 Sin dominadas ni fondos (están en la v1; pregunta F2). |
| Protocolo | Todas «hasta el fallo» (sin pruebas de 1 minuto). Se cuentan solo las repeticiones válidas. |
| Cámara y video | Cámara en vivo, video grabado o subido, y demostración con persona sintética. Esqueleto 2D sobre la imagen, vista 3D en vivo y reproducción 3D después de la prueba. Dibujo de dónde poner el teléfono para cada prueba. |
| Inclinación | Traída de la v1 de José: sensores del teléfono + estimación por postura, corrección de la pose, aviso bajo la imagen, aviso si el teléfono se mueve, interruptor y «Probar sensores» en Ajustes. |
| Voz | Conteo, repeticiones no válidas, técnica, posición antes de empezar, detección inestable, teléfono movido o muy inclinado. |
| Resultados | Categoría por edad y sexo, tabla del baremo, qué falta para el siguiente nivel, fuente y advertencias, percentil en plancha, perfil general exploratorio y aviso si el teléfono se movió o estaba inclinado. |
| Confiabilidad | Mide qué tan estable fue la detección en cada serie y lo guarda con el resultado. |
| Historial | Hasta 50 resultados por prueba en el teléfono, avance contra el intento anterior (con aviso cuando dos mediciones no son comparables) y aviso dentro de la app cada 4 semanas (sin notificaciones). Lista «Mis mediciones» con borrar cada una, y exportación CSV/JSON de los resultados personales. |
| Validación | Modo validación: app + 2 evaluadores por participante y prueba, acuerdo, Bland-Altman y CCI con intervalo, exportación CSV/JSON y recarga del JSON. |
| Modo stand | Para ferias y el pitch: cualquier edad, no guarda nada. 🔎 Acepta menores; si se pone un límite es decisión del equipo (pregunta F3). |
| Privacidad | Todo se procesa en el teléfono. No se envía ningún dato de la persona a internet (comprobado revisando el código; falta mirar el tráfico en un teléfono); solo se descargan la app y el modelo la primera vez. La app nunca guarda ni envía video por su cuenta; la persona puede elegir guardar en su teléfono un video con el esqueleto o la animación 3D, y compartir solo su esqueleto (sin imagen) con el equipo (HU-66). |
| Plataforma | Una sola app web (Android, iPhone y computador) en GitHub Pages, instalable y usable sin conexión después de tocar «Preparar para usar sin conexión». Bienvenida corta la primera vez y aviso si el navegador no sirve. |

## 3. Qué NO hace el MVP (fuera de alcance)

- **No** tiene cuentas de usuario, inicio de sesión ni servidor propio.
- **No** tiene base de datos central, ni el registro anónimo pensado para ella (HU-42, que pasó a Futuro).
- **No** tiene funciones para entrenadores, gimnasios, colegios, universidades o municipios. Son el modelo de negocio futuro.
- **No** promete el modo juego. 🔎 Ya hay un prototipo (press militar, idea de Elías) dentro de la app, pero no se valida ni es parte del MVP.
- **No** evalúa ejercicios con pesas, mancuernas ni máquinas de polea.
- **No** clasifica fuera del rango vigente (hoy 18–21 años): muestra el conteo y dice que no hay tabla.
- **No** usa pruebas de 1 o 2 minutos.
- **No** incluye VideoPose3D (pesos de uso no comercial, CC BY-NC 4.0).
- **No** diagnostica ni reemplaza a un profesional de la salud. El perfil general es un índice exploratorio.
- **No** guarda video por su cuenta (solo si la persona lo pide, en su teléfono), ni envía notificaciones, ni se publica en App Store ni Play Store.

## 4. Supuestos

1. Quien se evalúa puede dejar el teléfono apoyado, quieto, a 2,5–3 m y filmarse **de lado** (horizontal para flexiones y plancha; vertical para sentadillas).
2. Los baremos publicados siguen valiendo para jóvenes chilenos del rango vigente (hoy 18 a 21 años). Muchos vienen de otros países y poblaciones. Es un supuesto, no un hecho comprobado.
3. MediaPipe Pose Landmarker en el navegador es suficientemente preciso para contar repeticiones con una sola cámara.
4. Los equipos objetivo son de gama media (iOS Safari 16.4 o superior, Chrome en Android). Para el pitch: Lenovo Tab P12 (Android).
5. Cada baremo vale solo con su protocolo.
6. Es posible reunir 10 a 15 jóvenes y 2 evaluadores antes del 5 de febrero de 2027 (fin de S6). 🔎 Si 15 alcanzan para el CCI está en discusión (pregunta A1).
7. David revisa y mantiene el código. El código base lo escribió el equipo con asistencia de IA.

## 5. Riesgos y mitigación

| # | Riesgo | Efecto | Mitigación |
|---|---|---|---|
| R1 | El conteo no alcanza la meta que se fije (A1, A2, A4) | No se puede afirmar que sea confiable | Validar en S5–S6; revisar umbrales por prueba; reportar la cifra real aunque sea baja. |
| R2 | Baremo dudoso: sentadillas (origen incierto de la tabla ACE) | Clasificación poco sólida | Advertencia visible; buscar un baremo mejor (pregunta B5). |
| R3 | Cortes de flexiones sin verificar en fuente primaria | Categoría dudosa en algunos casos | La app lo advierte; el equipo los revisa en la biblioteca. |
| R4 | La estimación de inclinación solo por imagen es menos precisa que el sensor | Errores en videos subidos | Preferir cámara en vivo con sensores; medir la diferencia en la validación (HU-51). |
| R5 | iOS exige permiso de movimiento | La corrección por sensor no funciona en algunos iPhone | Se pide dentro del toque; con rechazo, estimación por imagen; probar en iPhone real. |
| R6 | Mala iluminación, ropa suelta o mal encuadre | Puntos mal detectados | Guía con dibujo, verificación de posición, avisos en voz, medición de calidad de la detección. |
| R7 | Rendimiento, batería y calor | Se pierden cuadros o el equipo se calienta | Medirlo (HU-65): la Lenovo antes del 30-nov y 2 teléfonos de gama media en S2. Plan B para el pitch: modelo «Rápido»; si igual falla, videos de respaldo y la demostración (David, con Elías). |
| R8 | Tiempo escaso (pitch 30-nov, fin de semestre) | No se llega a validar | Sprints de 2 semanas, backlog con MoSCoW, validación con fecha fija y colchón hasta fin de febrero. |
| R9 | Dependencia de una sola persona | El proyecto se detiene si falta alguien | Documentación (HU-52), pruebas automáticas, reuniones de traspaso. |
| R10 | Dos versiones del código (la v1 de José y esta app) | Trabajo duplicado, decisiones que no calzan | Esta app es la que se publica; lo útil de la v1 se trae por módulo (inclinación y sensores ya traídos). |
| R11 | Licencias: VideoPose3D no comercial | No se puede usar en producto de pago | No incluirlo; revisar antes de la fase 2. |
| R12 | Protección legal: el software se protege por derecho de autor | Idea copiable | Registrar marca y derecho de autor (mar–jun 2027). El código base es del equipo y el repositorio original no declara licencia: definirla. |
| R13 | Datos de salud sensibles | Riesgo reputacional y legal | No se envía ningún dato de la persona; consentimiento explícito antes de cualquier base central. |
| R14 | Validación con personas sin los resguardos éticos y de datos | El estudio no se puede publicar ni presentar | 🔎 Averiguar si la UNAB exige comité de ética; definir quién guarda los CSV y los videos, dónde y cómo se seudonimizan (Ley 19.628 y su reforma, Ley 21.719). Preguntas A6 y A7. |
| R15 | El prototipo de juego va dentro de la app publicada sin validar | Alguien lo toma como parte de la evaluación | Se presenta como prototipo y no se guarda como evaluación; si se oculta antes del pitch lo decide el equipo (pregunta F4). |
| R16 | Safari en iPhone borra los datos de un sitio no instalado tras unos días sin uso | Se pierden el historial y las mediciones de validación | Instalar la app en la pantalla de inicio: es opcional, sin tienda, el navegador solo agrega un ícono, y así Safari no borra los datos y exportar seguido; decirlo en la guía del estudio. |

## 6. Plan de validación

**Pregunta:** ¿cuenta FitGram las repeticiones (y mide los segundos) igual que dos evaluadores humanos?

**Muestra.** 10 a 15 jóvenes del rango vigente (hoy 18 a 21 años) que ya entrenan, con consentimiento informado, haciendo las 3 pruebas (30 a 45 series). Muestra pequeña: se reportan intervalos de confianza. 🔎 Los subgrupos (series inclinadas, con o sin sensor, video subido, por prueba) quedan muy chicos, y las series de una misma persona no son independientes: si ese análisis es exploratorio se decide junto con A1.

**Procedimiento (de José, sin cambios de fondo).**
1. Dos evaluadores cuentan en vivo, cada uno por su cuenta y sin ver la pantalla, las repeticiones válidas según el protocolo. En la plancha cronometran.
2. La app corre en paralelo, en modo validación, con el teléfono apoyado según la guía.
3. Al menos 1 de cada 3 series con el teléfono inclinado a propósito (10–15°); algunas repetidas subiendo el video, para medir el caso sin sensores. El CSV ya guarda la inclinación, su fuente y si el teléfono se movió.
4. No se guarda video salvo consentimiento específico. 🔎 Las series «subiendo el video» del punto 3 necesitan ese consentimiento: cómo se resuelve es decisión del equipo (pregunta A5).

**Cómo se calcula.** 🔎 **Decisión abierta (José y Elías):**
- José definió para la v1 una **concordancia** `1 − Σ|app − R| / Σ R` con meta **≥ 95 %** global y ninguna prueba bajo 90 %, donde R es el promedio de los evaluadores si difieren en 1 o menos (si difieren en 2 o más, se revisa o se descarta).
- El modo validación de esta app calcula **acuerdo exacto y ±1, Bland-Altman y CCI con intervalo de confianza** y compara también evaluador contra evaluador.
- Se pueden reportar ambos, pero hay que fijar **cuál es la meta** y qué hacer con las series en que los evaluadores no coinciden. Ver preguntas A1, A2 y A4.

**Criterio de decisión.** Si se alcanza la meta que se fije, el conteo se declara «validado en una muestra piloto». Si no, se corrige y se repite antes de afirmar la cifra en público.

**Piloto del 30-nov.** José y Elías como evaluadores y David haciendo varias series (códigos D01, D02…). Con una sola persona el CCI no es interpretable; sí el acuerdo y Bland-Altman. Cómo se cuenta en el pitch lo deciden ellos.

## 7. Definición de «Hecho»

Una historia está Hecha cuando se cumple todo lo siguiente. «Hecho en código», en `HISTORIAS_DE_USUARIO.md`, significa: la app lo hace según la revisión del código; falta la prueba en equipos reales (Definición de Hecho, punto 4) y la revisión de otra persona (punto 8).
1. Sus criterios Dado/Cuando/Entonces se cumplen y se probaron (a mano o con prueba automática).
2. `npm test` pasa completo (incluye la comprobación de que el archivo publicado corresponde al código fuente) y, si toca pantallas, también la prueba en navegador (`tools/e2e.py`).
3. Tiene pruebas automáticas si es lógica pura (baremos, inclinación, analizadores, validación).
4. Funciona en iOS Safari 16.4+ y en Chrome Android, en un equipo de gama media.
5. Los textos están en español de Chile.
6. No agrega envío de datos a internet ni guarda video.
7. La documentación afectada está actualizada.
8. Otra persona del equipo la revisó, y está publicada en GitHub Pages.

## 8. Plan de sprints (2 semanas cada uno)

🔎 Ajustado al 22-nov: el pitch final del Endowment es el **30 de noviembre**, el primer día del S2.

| Sprint | Fechas | Objetivo | Historias principales |
|---|---|---|---|
| **S1** | 16–27 nov | Hecho en código: auditoría, inclinación y sensores de la v1, bienvenida, borrar y exportar resultados, aviso de teléfono movido, documentación. Falta: preparar el pitch (probar en la Lenovo Tab P12, videos de respaldo, piloto de validación). | HU-17, 18, 64, 65 (Lenovo), 52 |
| **S2** | 30 nov–11 dic | Pitch (30-nov). Después: medir rendimiento y batería en teléfonos, probar en iPhone, averiguar lo de ética y datos (R14). | HU-65, 18 |
| **S3** | 14–25 dic | Sin conexión completo y legibilidad. Capacidad reducida por fiestas. | HU-46, 48 |
| **S4** | 28 dic–8 ene | Cerrar el MVP: errores, umbrales, congelar el alcance. Materiales de validación (consentimiento, protocolo). 🔎 Cae en vacaciones: si hace falta comité de ética, pedirlo antes. | Corrección de errores |
| **S5** | 11–22 ene | Validación con las primeras 6 a 8 personas; prueba de inclinación. | HU-50, 51 |
| **S6** | 25 ene–5 feb | Validación con el resto, cálculo e informe. | HU-50 |
| Colchón | 8–26 feb | Repetir si no se alcanzó la meta; documentar lo aprendido. | — |

**Después del MVP (hoja de ruta).**
- **Mar–jun 2027:** registro de marca y de derecho de autor.
- **2027:** postulación a Corfo Semilla Inicia cuando haya convocatoria (la última cerró el 18-12-2025; hoy no hay una abierta).
- **Oct–dic 2027:** primeros clientes (piloto con cursos UNAB y con una comuna).

## 9. Glosario

| Término | Significado |
|---|---|
| **Baremo** | Tabla publicada que convierte un resultado en una categoría o percentil según edad y sexo. Vale solo con su protocolo. |
| **Hasta el fallo** | La persona hace el máximo posible sin descanso ni límite de tiempo, hasta que ya no puede mantener la técnica. |
| **Repetición válida** | Repetición que cumple el protocolo. Solo estas suman. |
| **Percentil** | Porcentaje del grupo con un resultado igual o menor. El percentil 70 significa que la persona iguala o supera al 70 % del grupo. |
| **Categoría** | Nivel dentro del baremo (por ejemplo, «Promedio»). |
| **Inclinación (roll / pitch)** | Cuánto está torcida la cámara respecto de la gravedad. Roll: giro en el plano de la imagen. Pitch: cabeceo, solo con sensores. |
| **Landmarks (puntos)** | Los 33 puntos del cuerpo (nariz, hombros, codos, caderas…) que detecta MediaPipe. |
| **MediaPipe Pose Landmarker** | Modelo de Google que detecta los puntos en el navegador, sin enviar nada. |
| **Banda de edad** | Tramo de edades con que un baremo agrupa a las personas (por ejemplo, 20–29 en flexiones). La app solo cubre 18–21 años, pero cada baremo usa sus propias bandas. |
| **Concordancia** | Fórmula de la v1 de José: `1 − Σ|app − R| / Σ R`, donde R es el conteo de referencia de los evaluadores (ver §6). |
| **Acuerdo exacto / ±1** | Porcentaje de series en que la app contó lo mismo que los evaluadores / con una diferencia de hasta 1 repetición. |
| **CCI** | Coeficiente de correlación intraclase: confiabilidad entre la app y los evaluadores; necesita varias personas distintas. |
| **Bland-Altman** | Diferencia media entre app y evaluadores, con sus límites de acuerdo. |
| **MVP** | Mínimo producto viable. |
| **Sprint** | Bloque de trabajo de 2 semanas en Scrum. |
| **Historia de usuario** | «Como <rol> quiero <acción> para <beneficio>». |
| **MoSCoW** | Must, Should, Could, Won't. |
| **Factor camión** | Cuántas personas tendrían que faltar para que el proyecto se detenga. |
| **Modo stand** | Modo para ferias: cualquier edad, no guarda nada. |
| **CSEP / ACSM** | Sociedad Canadiense de Fisiología del Ejercicio y Colegio Americano de Medicina del Deporte: origen del baremo de flexiones. |
| **ACE** | American Council on Exercise: origen de la tabla de sentadillas (dudosa, ver R2). |
| **Strand et al. (2014)** | Estudio con universitarios que da los percentiles de la plancha. |
| **ETM** | Instancia del programa Endowment en que el equipo mostró el proyecto. |
| **Filtro 1€** | Filtro que suaviza el temblor de los puntos sin agregar retraso notorio. |
| **Human3.6M / VideoPose3D** | Formato de esqueleto 3D de 17 articulaciones y un modelo que lo calcula. Fase 2, con licencia no comercial. |
| **CC BY-NC** | Licencia que permite usar algo solo sin fines comerciales. |
| **WebAssembly** | Tecnología del navegador que permite correr el detector de pose rápido, sin instalar nada. |
| **Service worker** | Parte de la app que la guarda en el teléfono para que abra sin internet. |
| **CSV / JSON** | Formatos de archivo para exportar datos: CSV se abre en Excel; JSON sirve para volver a cargar en la app. |
| **Seudonimizar** | Reemplazar el nombre por un código (por ejemplo, P01) para que los datos no identifiquen a nadie. |
| **GitHub Pages** | Servicio gratuito donde está publicada la app (dief-ysis.github.io/fitgram). |
| **`npm test`** | Comando que corre las pruebas automáticas del código. |
| **Modelo «Rápido»** | Versión liviana del detector de pose, para equipos más lentos (en Ajustes). |
| **Semilla Inicia** | Línea de Corfo para prototipar una idea. |
