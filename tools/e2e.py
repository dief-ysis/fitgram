"""Prueba completa de FitGram en Chrome sin pantalla (idea y partes de tools/e2e.py de fitgram-v1, de Jose).

Escenarios:
  A. Datos (20 años, hombre) y la demostración de las 3 pruebas -> pantalla de resultado, aviso de inclinación.
  B. Cámara en vivo (cámara falsa de Chrome): aparece el aviso de inclinación. (La fuente «Sensores» no se
     puede probar aquí: ver el comentario del escenario.)
  C. Ajustes: interruptor de la inclinación y «Probar sensores» con sensores simulados.
  D. (opcional) Cada video que se pase como argumento: se analiza en modo video y se informa el resultado.
Falla si hay errores en la consola. Las capturas van a SALIDA.

Uso:  python3 tools/e2e.py SALIDA [video1.mp4 ...]
Necesita:  pip install playwright && playwright install chromium   (y `npm run build` antes)
"""
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/fitgram-e2e')
VIDEOS = [Path(v).resolve() for v in sys.argv[2:]]
OUT.mkdir(parents=True, exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript',
                      '.wasm': 'application/wasm', '.task': 'application/octet-stream',
                      '.webmanifest': 'application/manifest+json'}

    def log_message(self, *args):
        pass


def serve():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'


# Sensores simulados a 60 Hz: teléfono de pie y ladeado `gamma` grados, quieto.
SENSORS_JS = """(gamma) => {
  // up en ejes del equipo (W3C): [-cos b sin g, sin b, cos b cos g]. b = 75 (de pie, algo echado atrás): con
  // b = 90 exacto gamma no ladea nada (bloqueo de cardán).
  const g = 9.81, b = 75 * Math.PI / 180, r = gamma * Math.PI / 180;
  const up = [-Math.cos(b) * Math.sin(r), Math.sin(b), Math.cos(b) * Math.cos(r)];
  // Chrome sin pantalla también manda eventos reales (en cero) que romperían la quietud: se descartan.
  if (!window.__sensBlock) {
    window.__sensBlock = true;
    for (const ev of ['deviceorientation', 'devicemotion']) window.addEventListener(ev, (e) => { if (e.isTrusted) e.stopImmediatePropagation(); }, true);
  }
  // Con MediaPipe en CPU los temporizadores casi no corren: se mandan eventos durante 3 s, cediendo el hilo entre
  // tandas para que la app alcance a procesar cuadros (y a leer los sensores) entremedio.
  return (async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 3000) {
    await new Promise((res) => setTimeout(res, 0));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 75, gamma }));
    const e = new Event('devicemotion');
    e.accelerationIncludingGravity = { x: g * up[0], y: g * up[1], z: g * up[2] };
    e.acceleration = { x: 0, y: 0, z: 0 };
    e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
    window.dispatchEvent(e);
  }
  })();
}"""

failures = []


def check(cond, msg):
    print(('ok   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        failures.append(msg)


def start_profile(page, url):
    page.goto(url)
    page.evaluate('localStorage.clear()')
    page.reload()
    page.click('#age-pills .pill:has-text("20")')
    page.click('#sex-pills .pill:has-text("Hombre")')
    page.click('#btn-onb')
    page.wait_for_selector('#scr-hub:not([hidden])')


def open_test(page, i):
    page.click('#btn-intro-back') if page.is_visible('#btn-intro-back') else None
    page.evaluate("document.querySelector('[data-tab=hub]')?.click()")
    page.wait_for_selector('#scr-hub:not([hidden])')
    page.locator('#test-list .test-card').nth(i).click()
    page.wait_for_selector('#scr-intro:not([hidden])')


def main():
    srv, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                          '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': 412, 'height': 900}, device_scale_factor=2, accept_downloads=True,
                                  permissions=['camera', 'accelerometer', 'gyroscope'], service_workers='block')
        page = ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(str(e)))

        # A. demos
        start_profile(page, url)
        for i, name in enumerate(['flexiones', 'sentadillas', 'plancha']):
            open_test(page, i)
            page.click('#btn-demo')
            page.wait_for_selector('#scr-run:not([hidden])')
            page.wait_for_selector('#btn-start:not([hidden])')
            page.click('#btn-start')
            page.wait_for_timeout(6000)
            page.screenshot(path=str(OUT / f'A-{name}-corriendo.png'))
            chip = page.text_content('#level-msg') or ''
            check(page.is_hidden('#level-chip'), 'demo {}: sin aviso de inclinación'.format(name))
            page.wait_for_selector('#scr-result:not([hidden])', timeout=180000)
            val = (page.text_content('#res-value') or '').strip()
            check(val != '', f'demo {name}: resultado {val} {page.text_content("#res-unit") or ""}')
            page.screenshot(path=str(OUT / f'A-{name}-resultado.png'), full_page=True)

        # B. en vivo con sensores (sentadillas)
        open_test(page, 1)
        page.click('#btn-live')
        page.wait_for_selector('#scr-run:not([hidden])')
        # Con MediaPipe corriendo en la GPU por software de Chrome sin pantalla, los eventos de sensores llegan a
        # ~2 por segundo (se necesitan ≥6 en 0,8 s), así que la fuente «Sensores» no se puede comprobar aquí: eso
        # queda para el teléfono real («Probar sensores» y el aviso bajo la imagen). Aquí: el aviso existe y habla.
        page.wait_for_function("document.getElementById('level-msg').textContent !== 'Inclinación del teléfono'", timeout=90000)
        check(page.is_visible('#level-chip'), f"en vivo: aviso de inclinación «{page.text_content('#level-msg')}» · «{page.text_content('#level-src')}»")
        page.screenshot(path=str(OUT / 'B-vivo-sensores.png'))
        page.click('#btn-close')

        # C. ajustes
        page.click('#btn-settings')
        page.wait_for_selector('#sheet:not([hidden])')
        check(page.is_checked('#set-tilt'), 'ajustes: corrección de inclinación activada por defecto')
        page.click('#btn-probe')
        page.evaluate(SENSORS_JS, 8)
        page.wait_for_function("document.getElementById('probe-out').textContent.includes('Orientación')", timeout=10000)
        check('Orientación: sí' in page.text_content('#probe-out'), f"probar sensores: {page.text_content('#probe-out')}")
        if VIDEOS:
            page.check('#set-grabar')   # para probar el video con esqueleto en el escenario D
        page.screenshot(path=str(OUT / 'C-ajustes.png'))
        page.click('#sheet-close')

        # P. perfil: mediciones de ejemplo, exportar y borrar una
        page.goto(url + '?demo=historial')
        page.wait_for_selector('#scr-profile:not([hidden])')
        n0 = page.locator('#prof-hist-list [data-del-test]').count()
        check(n0 > 0, f'perfil: {n0} mediciones listadas')
        for b, ext in (('#btn-exp-csv', 'csv'), ('#btn-exp-json', 'json')):
            with page.expect_download() as dl:
                page.click(b)
            check(dl.value.suggested_filename.endswith(ext), f'exportar {ext}: {dl.value.suggested_filename}')
        page.once('dialog', lambda d: d.accept())
        page.locator('#prof-hist-list [data-del-test]').first.click()
        page.wait_for_timeout(300)
        n1 = page.locator('#prof-hist-list [data-del-test]').count()
        check(n1 == n0 - 1, f'borrar una medición: {n0} -> {n1}')
        page.screenshot(path=str(OUT / 'P-perfil.png'), full_page=True)

        # D. videos
        for v in VIDEOS:
            name = v.stem.lower()
            idx = 0 if 'flex' in name or 'push' in name else 2 if 'planch' in name or 'plank' in name else 1
            open_test(page, idx)
            page.set_input_files('#file-pick', str(v))
            page.wait_for_selector('#scr-run:not([hidden])')
            page.wait_for_selector('#btn-start:not([hidden])', timeout=120000)
            page.click('#btn-start')
            try:
                page.wait_for_selector('#scr-result:not([hidden])', timeout=600000)
                check(True, f"video {v.name}: {page.text_content('#res-value')} {page.text_content('#res-unit')}"
                            f" · {page.text_content('#level-msg')}")
                page.screenshot(path=str(OUT / f'D-{v.stem}.png'), full_page=True)
                # Guardar o compartir: video con esqueleto, esqueleto y animación 3D (se descargan en Chrome de escritorio)
                page.wait_for_timeout(1500)
                for b, ext, wait in (('#btn-save-video', '.mp4', 10000), ('#btn-share-skel', '.json', 10000), ('#btn-save-3d', '', 120000)):
                    if not page.is_visible(b):
                        check(False, f'video {v.name}: falta el botón {b}')
                        continue
                    page.once('dialog', lambda d: d.accept())
                    with page.expect_download(timeout=wait) as dl:
                        page.click(b)
                    name = dl.value.suggested_filename
                    size = Path(dl.value.path()).stat().st_size
                    check(name.endswith(ext) and size > 1000, f'{b}: {name} ({size // 1024} KB)')
            except Exception as e:
                page.screenshot(path=str(OUT / f'D-{v.stem}-falla.png'))
                check(False, f'video {v.name}: no llegó al resultado ({e})')

        browser.close()
    srv.shutdown()
    check(not errors, 'consola sin errores' + ('' if not errors else ': ' + ' | '.join(errors[:5])))
    print(f'\n{len(failures)} fallas · capturas en {OUT}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
