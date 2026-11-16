/* ====================================================================
   FitGram — service worker.

   Objetivo: que la app funcione con el teléfono en modo avión. Importa por
   dos razones. En una feria la WiFi se cae justo cuando hay alguien mirando;
   y el pitch promete que todo ocurre en el teléfono, cosa que así se puede
   comprobar en vez de solo afirmarla.

   Tres clases de archivo, con política distinta:

     document  index.html → primero la red, y si no hay, la copia guardada.
               Al revés se quedarían pegados para siempre en una versión vieja.
     shell     código, tipografías, iconos → primero la copia guardada, y se
               refresca en segundo plano (stale-while-revalidate).
     heavy     .wasm y .task → primero la copia guardada, sin refrescar: son
               binarios inmutables de 6 a 13 MB.

   Los pesados NO se bajan al instalar: son unos 29 MB y nadie que solo entra a
   mirar debería pagar eso. Se guardan cuando se usan, o todos de una desde
   Ajustes → «Preparar para usar sin conexión».
   ==================================================================== */

const VERSION = 'fitgram-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const HEAVY_CACHE = `${VERSION}-heavy`;

/* `index.html` NO va acá a propósito. Si se precargara, cada publicación
   obligaria a subir VERSION para no servir una copia vieja, y olvidarlo es el
   error clásico con los service workers. Como el documento va primero a la red,
   networkFirst guarda la copia fresca en cada visita con conexión, y la copia
   guardada solo se usa cuando no hay red. Asi VERSION solo hay que subirlo
   cuando cambian estas listas o la logica de este archivo. */
const SHELL = [
  './manifest.webmanifest',
  './icono.svg',
  './icono-180.png',
  './icono-192.png',
  './icono-512.png',
  './lib/vision_bundle.mjs',
  './lib/vision_wasm_internal.js',
  './fonts/barlow-400.woff2',
  './fonts/barlow-500.woff2',
  './fonts/barlow-600.woff2',
  './fonts/barlow-condensed-500.woff2',
  './fonts/barlow-condensed-600.woff2',
  './fonts/barlow-condensed-700.woff2',
];

const HEAVY = [
  './wasm/vision_wasm_internal.wasm',
  './models/pose_landmarker_lite.task',
  './models/pose_landmarker_full.task',
];

/** Qué política le toca a una ruta. Pura a propósito: se prueba en Node. */
function policyFor(pathname) {
  if (/\.(wasm|task)$/i.test(pathname)) return 'heavy';
  if (/\/$/.test(pathname) || /\.html$/i.test(pathname)) return 'document';
  return 'shell';
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (!k.startsWith(VERSION)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(req, cacheName, revalidate) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) {
    if (revalidate) {
      // Se refresca en segundo plano; el usuario ya recibió la copia guardada.
      fetch(req).then((r) => (r.ok ? cache.put(req, r.clone()) : null)).catch(() => {});
    }
    return hit;
  }
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // nada de terceros
  const policy = policyFor(url.pathname);
  if (policy === 'heavy') e.respondWith(cacheFirst(req, HEAVY_CACHE, false));
  else if (policy === 'document') e.respondWith(networkFirst(req, SHELL_CACHE));
  else e.respondWith(cacheFirst(req, SHELL_CACHE, true));
});

/** Baja los archivos pesados, avisando el avance a la página. */
async function prepararOffline(source) {
  const cache = await caches.open(HEAVY_CACHE);
  const total = HEAVY.length;
  let hechos = 0;
  const avisar = (estado, detalle) => source?.postMessage({ type: 'offline', estado, hechos, total, detalle });
  for (const path of HEAVY) {
    const url = new URL(path, self.location).toString();
    try {
      if (!(await cache.match(url))) {
        const res = await fetch(url, { cache: 'reload' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cache.put(url, res.clone());
      }
      hechos++;
      avisar('avance', path);
    } catch (err) {
      avisar('error', `${path}: ${err?.message || err}`);
      return;
    }
  }
  avisar('listo');
}

/** Cuántos de los pesados ya están guardados. */
async function estadoOffline(source) {
  const cache = await caches.open(HEAVY_CACHE);
  let hechos = 0;
  for (const path of HEAVY) {
    if (await cache.match(new URL(path, self.location).toString())) hechos++;
  }
  source?.postMessage({ type: 'offline', estado: hechos === HEAVY.length ? 'listo' : 'parcial', hechos, total: HEAVY.length });
}

self.addEventListener('message', (e) => {
  const t = e.data?.type;
  if (t === 'prepararOffline') e.waitUntil(prepararOffline(e.source));
  else if (t === 'estadoOffline') e.waitUntil(estadoOffline(e.source));
  else if (t === 'activarAhora') self.skipWaiting();
});
