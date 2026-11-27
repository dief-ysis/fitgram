/* ====================================================================
   FitGram — guardar y compartir lo que la persona decida (idea de Elías,
   23-nov-2026).

   La app no envía nada sola. Desde el resultado, la persona puede:
   - exportar su esqueleto (solo puntos del cuerpo, sin imagen) para
     compartirlo con el equipo, con su permiso: sirve para afinar y validar
     las reglas de conteo de FitGram (no para entrenar MediaPipe);
   - guardar en su teléfono un video con el esqueleto superpuesto o la
     animación 3D.

   Este módulo es puro (sin DOM): arma el archivo del esqueleto y elige el
   formato de video que el navegador sabe grabar. La grabación vive en app.mjs.
   ==================================================================== */

/** Versión del formato del archivo del esqueleto. */
const ESQUELETO_SCHEMA = 1;

const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * El esqueleto de una serie, listo para compartir. Sin nombre, sin imagen y
 * sin la fecha exacta (solo año y mes); la edad y el sexo van porque sin ellos
 * los datos no sirven para comparar con los baremos.
 * @param {Array<{t:number, p:ArrayLike<number>}>} rec cuadros grabados (17 articulaciones × x,y,z)
 * @param {{test:string, value:number, invalid?:number, date?:string, age?:number, sex?:string,
 *          reglas?:string, nombres?:string[]}} meta
 * @returns {object}
 */
function esqueletoParaCompartir(rec, meta = {}) {
  const cuadros = (rec || []).map((c) => ({ t: Math.round(c.t), p: Array.from(c.p || [], r3) }));
  const dur = cuadros.length > 1 ? cuadros[cuadros.length - 1].t - cuadros[0].t : 0;
  return {
    schema: ESQUELETO_SCHEMA,
    tipo: 'fitgram-esqueleto',
    prueba: meta.test || null,
    resultado: { valor: meta.value ?? null, no_validas: meta.invalid ?? null },
    mes: meta.date ? String(meta.date).slice(0, 7) : null,
    edad: Number.isFinite(meta.age) ? meta.age : null,
    sexo: meta.sex || null,
    reglas: meta.reglas || null,
    articulaciones: meta.nombres || null,
    unidades: 'metros, origen en las caderas, y hacia abajo; t en ms desde el inicio',
    cuadros_por_segundo: dur > 0 ? Math.round((cuadros.length - 1) / (dur / 1000)) : null,
    cuadros,
  };
}

/** Formatos de video en orden de preferencia: mp4 se abre en todos lados (iPhone y galería). */
const FORMATOS_VIDEO = Object.freeze([
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
]);

/**
 * El primer formato que el navegador sabe grabar, o null si no graba video.
 * @param {(mime:string) => boolean} soporta normalmente MediaRecorder.isTypeSupported
 */
function elegirFormatoVideo(soporta) {
  if (typeof soporta !== 'function') return null;
  for (const f of FORMATOS_VIDEO) {
    try { if (soporta(f.mime)) return f; } catch { /* sigue con el próximo */ }
  }
  return null;
}

/** Nombre de archivo sin espacios ni tildes: «fitgram-sentadillas-esqueleto-2026-11-23.json». */
function nombreArchivo(prueba, tipo, ext, fecha = new Date()) {
  const d = fecha instanceof Date && !isNaN(fecha) ? fecha.toISOString().slice(0, 10) : 'sin-fecha';
  const limpio = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fitgram-${limpio(prueba)}-${limpio(tipo)}-${d}.${ext}`;
}

/**
 * Un visor 3D en un solo archivo .html (27-nov-2026, pedido de David): lleva adentro el esqueleto
 * (el mismo de esqueletoParaCompartir) y se abre sin internet en cualquier navegador. Se gira
 * arrastrando con el dedo o el mouse, se acerca con la rueda o pellizcando, y tiene reproducir y
 * una barra de tiempo. Sin librerías: proyección en perspectiva sobre un canvas.
 * @param {object} datos resultado de esqueletoParaCompartir
 * @param {{titulo?:string, huesos:number[][], izq:number[], der:number[]}} op
 * @returns {string}
 */
function visor3dHtml(datos, op) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // `<` escapado: el JSON va dentro de <script> y no puede cerrarlo.
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const titulo = esc(op?.titulo || 'Animación 3D');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · FitGram</title>
<style>
html,body{margin:0;height:100%;background:#0f1419;color:#e6edf3;font:15px system-ui,sans-serif;overflow:hidden}
canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
header{position:fixed;top:0;left:0;right:0;padding:12px 16px;pointer-events:none}
header b{display:block;font-size:17px}header span{opacity:.7;font-size:13px}
footer{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;padding:12px 16px;background:linear-gradient(transparent,#0f1419cc)}
button{background:#2f9bd3;color:#fff;border:0;border-radius:999px;padding:8px 14px;font:inherit;min-width:44px}
button.q{background:#ffffff1f}
input[type=range]{flex:1}
</style></head><body>
<canvas id="c"></canvas>
<header><b>${titulo}</b><span>Arrastra para girar · rueda o pellizco para acercar</span></header>
<footer><button id="pp">❚❚</button><input id="r" type="range" min="0" value="0"><button class="q" id="fr">Frente</button><button class="q" id="la">Lado</button></footer>
<script>
const D=${json(datos)},B=${json(op?.huesos || [])},IZ=new Set(${json(op?.izq || [])}),DE=new Set(${json(op?.der || [])});
const F=(D.cuadros||[]).filter(c=>c.p&&c.p.length>=51),c=document.getElementById('c'),x=c.getContext('2d'),r=document.getElementById('r'),pp=document.getElementById('pp');
r.max=Math.max(0,F.length-1);
let yaw=0.6,pitch=0.25,zoom=1,i=0,play=true,t0=performance.now(),tBase=F.length?F[0].t:0;
// piso: el punto más bajo de toda la serie (y hacia abajo en los datos)
let suelo=-Infinity;for(const f of F)for(let k=1;k<f.p.length;k+=3)if(f.p[k]!=null&&f.p[k]>suelo)suelo=f.p[k];if(!isFinite(suelo))suelo=0.9;
function rs(){const d=devicePixelRatio||1;c.width=innerWidth*d;c.height=innerHeight*d;x.setTransform(d,0,0,d,0,0);}
addEventListener('resize',rs);rs();
function proj(X,Y,Z){Y-=suelo/2;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 let a=X*cy-Z*sy,z=X*sy+Z*cy;let b=Y*cp-z*sp;z=Y*sp+z*cp;const dist=3.2/zoom,k=Math.min(innerWidth,innerHeight)*1.5/(dist+z);
 return[innerWidth/2+a*k,innerHeight*0.5+b*k,z];}
function dibujar(){x.clearRect(0,0,innerWidth,innerHeight);
 x.strokeStyle='#ffffff18';x.lineWidth=1;for(let g=-1;g<=1.001;g+=0.25){let p=proj(g,suelo,-1),q=proj(g,suelo,1);x.beginPath();x.moveTo(p[0],p[1]);x.lineTo(q[0],q[1]);x.stroke();p=proj(-1,suelo,g);q=proj(1,suelo,g);x.beginPath();x.moveTo(p[0],p[1]);x.lineTo(q[0],q[1]);x.stroke();}
 const f=F[i];if(!f)return;const P=[];for(let k=0;k<f.p.length/3;k++){const X=f.p[3*k],Y=f.p[3*k+1],Z=f.p[3*k+2];P.push(X==null?null:proj(X,Y,Z));}
 const L=B.map(([a,b])=>[a,b,P[a]&&P[b]?(P[a][2]+P[b][2])/2:0]).sort((u,v)=>v[2]-u[2]);
 x.lineCap='round';for(const[a,b]of L){if(!P[a]||!P[b])continue;x.strokeStyle=IZ.has(b)?'#2f9bd3':DE.has(b)?'#e8613c':'#c9d1d9';x.lineWidth=7;x.beginPath();x.moveTo(P[a][0],P[a][1]);x.lineTo(P[b][0],P[b][1]);x.stroke();}
 x.fillStyle='#fff';for(const q of P)if(q){x.beginPath();x.arc(q[0],q[1],4,0,7);x.fill();}}
function paso(now){if(play&&F.length>1){const dur=F[F.length-1].t-tBase,t=((now-t0)%(dur+800));let j=0;while(j<F.length-1&&F[j+1].t-tBase<=t)j++;i=j;r.value=i;}dibujar();requestAnimationFrame(paso);}
requestAnimationFrame(paso);
pp.onclick=()=>{play=!play;pp.textContent=play?'❚❚':'▶';if(play)t0=performance.now()-(F[i]?F[i].t-tBase:0);};
r.oninput=()=>{i=+r.value;play=false;pp.textContent='▶';};
document.getElementById('fr').onclick=()=>{yaw=0;pitch=0.1;};document.getElementById('la').onclick=()=>{yaw=Math.PI/2;pitch=0.1;};
const toques=new Map();let d0=0,z0=1;
c.onpointerdown=e=>{c.setPointerCapture(e.pointerId);toques.set(e.pointerId,[e.clientX,e.clientY]);if(toques.size===2){const[a,b]=[...toques.values()];d0=Math.hypot(a[0]-b[0],a[1]-b[1]);z0=zoom;}};
c.onpointermove=e=>{const o=toques.get(e.pointerId);if(!o)return;if(toques.size===2){toques.set(e.pointerId,[e.clientX,e.clientY]);const[a,b]=[...toques.values()];zoom=Math.min(4,Math.max(0.4,z0*Math.hypot(a[0]-b[0],a[1]-b[1])/(d0||1)));return;}
 yaw+=(e.clientX-o[0])*0.01;pitch=Math.min(1.4,Math.max(-1.4,pitch+(e.clientY-o[1])*0.01));toques.set(e.pointerId,[e.clientX,e.clientY]);};
c.onpointerup=c.onpointercancel=e=>toques.delete(e.pointerId);
c.onwheel=e=>{e.preventDefault();zoom=Math.min(4,Math.max(0.4,zoom*Math.exp(-e.deltaY*0.001)));};
</script></body></html>`;
}

export { ESQUELETO_SCHEMA, esqueletoParaCompartir, visor3dHtml, FORMATOS_VIDEO, elegirFormatoVideo, nombreArchivo };
