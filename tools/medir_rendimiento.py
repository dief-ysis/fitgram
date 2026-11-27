"""Mide el rendimiento de la app en vivo con un "teléfono lento" simulado (CPU limitada en Chrome).

Uso: python tools/medir_rendimiento.py <clip.y4m> [lentitud=4] [segundos=12] [modelo=auto|lite|full]

Abre flexiones en vivo con el clip como cámara, limita la CPU (lentitud 4 = 4 veces más lenta) y mide, durante la vista
previa: cuadros por segundo procesados, tiempo del detector por cuadro y tiempo del resto de la app por cuadro (dibujo,
suavizado, análisis...). Graba además un perfil de CPU y muestra las funciones de la app que más tiempo propio gastan.
"""
import collections
import functools
import pathlib
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
clip = sys.argv[1]
lentitud = float(sys.argv[2]) if len(sys.argv) > 2 else 4
segundos = float(sys.argv[3]) if len(sys.argv) > 3 else 12
modelo = sys.argv[4] if len(sys.argv) > 4 else 'auto'
ancho = int(sys.argv[5]) if len(sys.argv) > 5 else 0   # experimento: achicar la imagen antes del detector (0 = no)


class Silencioso(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Silencioso, directory=str(RAIZ)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/'

MEDIR = """(() => {
  const R = window.FITGRAM.Runner, oP = R.process, oE = R.processEmpty;
  window.__m = { cuadros: 0, msApp: [], t0: performance.now() };
  R.process = function (raw) { const a = performance.now(); const r = oP.call(this, raw); window.__m.msApp.push(performance.now() - a); window.__m.cuadros++; return r; };
  R.processEmpty = function (t) { const r = oE.call(this, t); window.__m.cuadros++; return r; };
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                f'--use-file-for-fake-video-capture={clip}'])
    pg = b.new_page(viewport={'width': 412, 'height': 860})
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.goto(url)
    pg.evaluate('localStorage.clear()')
    pg.reload()
    pg.evaluate(f"(() => {{ const st = JSON.parse(localStorage.getItem('fitgram.v0') || '{{}}'); }})()")
    pg.click('#age-pills .pill:has-text("20")')
    pg.click('#sex-pills .pill:has-text("Hombre")')
    pg.click('#btn-onb')
    pg.wait_for_selector('#scr-hub:not([hidden])')
    if modelo != 'auto':
        pg.evaluate(f"window.FITGRAM.S.settings.model = '{modelo}'; window.FITGRAM.S.settings.modeloElegido = true;")
    pg.locator('#test-list .test-card').nth(0).click()
    pg.wait_for_selector('#scr-intro:not([hidden])')
    pg.click('#btn-live')
    pg.wait_for_selector('#btn-start:not([hidden])', timeout=180000)
    pg.wait_for_timeout(2000)                       # que el detector entre en régimen
    cdp = pg.context.new_cdp_session(pg)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': lentitud})
    cdp.send('Profiler.enable')
    cdp.send('Profiler.setSamplingInterval', {'interval': 500})
    pg.evaluate(MEDIR)
    if ancho:
        pg.evaluate(f"""(() => {{ const E = window.FITGRAM.Engine, o = E.detect, c = document.createElement('canvas'), x = c.getContext('2d');
          E.detect = function (src, t, a) {{ if (src && src.videoWidth) {{ const w = {ancho}, h = Math.round(w * src.videoHeight / src.videoWidth);
            if (c.width !== w) {{ c.width = w; c.height = h; }} x.drawImage(src, 0, 0, w, h); return o.call(this, c, t, a); }} return o.call(this, src, t, a); }}; }})()""")
    cdp.send('Profiler.start')
    pg.wait_for_timeout(int(segundos * 1000))
    perfil = cdp.send('Profiler.stop')['profile']
    m = pg.evaluate("""(() => { const m = window.__m, R = window.FITGRAM.Runner, d = R.detectMs.slice();
      const prom = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      return { fps: m.cuadros / ((performance.now() - m.t0) / 1000), msDetector: prom(d), msApp: prom(m.msApp),
        modelo: window.FITGRAM.Engine.variant }; })()""")
    print(f"lentitud x{lentitud:g} · modelo {m['modelo']}: {m['fps']:.1f} cuadros/s · detector {m['msDetector']:.0f} ms · resto de la app {m['msApp']:.1f} ms por cuadro")
    # funciones de la app con más tiempo propio
    nodos = {n['id']: n for n in perfil['nodes']}
    propio = collections.Counter()
    dt = perfil.get('timeDeltas', [])
    for sid, d in zip(perfil.get('samples', []), dt):
        cf = nodos[sid]['callFrame']
        nombre = cf['functionName'] or '(anónima)'
        lugar = 'app' if cf['url'].endswith('/') or cf['url'].endswith('index.html') else ('mediapipe' if 'vision' in cf['url'] else (cf['url'].rsplit('/', 1)[-1] or cf['url'] or 'nativo'))
        propio[(lugar, nombre)] += d
    total = sum(propio.values()) or 1
    print('tiempo propio (más alto primero):')
    for (lugar, nombre), us in propio.most_common(18):
        print(f'  {100 * us / total:5.1f} %  {lugar:10s} {nombre}')
    print('errores:', errores or 'ninguno')
    b.close()
