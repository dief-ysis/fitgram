"""Captura la silueta guía en vivo con la cámara falsa de Chrome.

Uso: python tools/ver_silueta.py <clip.y4m> <carpeta de salida>

- Flexiones con un clip donde la persona NO está en esa posición (p. ej. una plancha): la silueta va sobre ella.
- Sentadillas con la cámara falsa vacía de Chrome: la silueta va al centro, como guía.
El clip .y4m se arma con ffmpeg desde cualquier video (ver tools/e2e.py para más escenarios).
"""
import functools
import pathlib
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
clip, out = sys.argv[1], pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(RAIZ)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/'


def correr(args, prueba, nombre, espera_ms):
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] + args)
        pg = b.new_page(viewport={'width': 412, 'height': 860})
        errores = []
        pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: errores.append('consola: ' + m.text) if m.type == 'error' else None)
        pg.goto(url)
        pg.evaluate('localStorage.clear()')
        pg.reload()
        pg.click('#age-pills .pill:has-text("20")')
        pg.click('#sex-pills .pill:has-text("Hombre")')
        pg.click('#btn-onb')
        pg.wait_for_selector('#scr-hub:not([hidden])')
        pg.locator('#test-list .test-card').nth(prueba).click()
        pg.wait_for_selector('#scr-intro:not([hidden])')
        pg.click('#btn-live')
        pg.wait_for_selector('#scr-run:not([hidden])')
        pg.wait_for_selector('#btn-start:not([hidden])', timeout=120000)
        pg.evaluate("(() => { const R = window.FITGRAM.Runner, o = R.dibujarSilueta; window.__sil = { n: 0, err: null, ok: 0 }; R.dibujarSilueta = function (ctx, f, pr) { window.__sil.n++; const arc = ctx.arc; window.__sil.arcs = []; ctx.arc = function (x, y, r, ...k) { window.__sil.arcs.push([Math.round(x), Math.round(y), Math.round(r)]); return arc.call(this, x, y, r, ...k); }; try { const r = o.call(this, ctx, f, pr); window.__sil.ok++; window.__sil.alpha = ctx.globalAlpha; ctx.arc = arc; window.__sil.cw = R.cw; window.__sil.ch = R.ch; return r; } catch (e) { window.__sil.err = String(e.stack || e); } }; })()")
        pg.wait_for_timeout(espera_ms)
        pg.screenshot(path=str(out / f'{nombre}.png'))
        import base64
        capa = pg.evaluate("document.getElementById('overlay').toDataURL('image/png')")
        (out / f'{nombre}-solo-dibujo.png').write_bytes(base64.b64decode(capa.split(',', 1)[1]))
        print(nombre, 'estado:', pg.evaluate("(() => { const R = window.FITGRAM.Runner; return { sil: window.__sil, fase: R.phase, modo: R.mode, okDesde: R.posOkDesde, girada: R.girada, silueta: window.FITGRAM.S.settings.silueta, lm: R.frame?.lm?.length, aspect: R.frame?.aspect }; })()"))
        print(nombre, '| posición:', pg.text_content('#pos-msg'), '| errores:', errores or 'ninguno')
        b.close()
        return errores


fallas = correr([f'--use-file-for-fake-video-capture={clip}'], 0, 'flexiones-sobre-persona', 9000)
fallas += correr([], 1, 'sentadillas-sin-persona', 6000)
sys.exit(1 if fallas else 0)
