"""UI smoke test: serves site/ locally, swaps Supabase for an in-memory mock, clicks through the main flows."""
import http.server, threading, functools, os, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/masar-shots'); OUT.mkdir(parents=True, exist_ok=True)
MOCK = (ROOT / 'tests/mock-supabase.js').read_text()
CFG = "export const CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'anon',TIMEZONE:'Asia/Riyadh',LEGACY_URL:''};"

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), functools.partial(H, directory=str(ROOT / 'site')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:8765/'
errors = []

def page_for(b, role):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    ctx.route('**/supabase-js@*/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=CFG))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    p = ctx.new_page()
    p.on('pageerror', lambda e: errors.append(f'{role}: {e}'))
    p.on('console', lambda m: m.type == 'error' and errors.append(f'{role} console: {m.text}'))
    return p

def shot(p, name): p.wait_for_timeout(400); p.screenshot(path=str(OUT / f'{name}.png'), full_page=True)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # owner
    p = page_for(b, 'owner'); p.goto(BASE + 'index.html?as=owner#/today'); p.wait_for_selector('.prayers')
    p.click('[data-k="fajr"]'); p.wait_for_timeout(200)
    assert 'في وقتها' in p.inner_text('[data-k="fajr"]'), 'prayer did not toggle'
    shot(p, '1-owner-today')
    # capture with AI → 3 items saved
    p.click('#fab'); p.fill('#cap', 'عميل أكناف عايز تقرير، صرفت 45 غدا، فكرة باقة مخابز'); p.click('[data-act="capAI"]'); p.wait_for_selector('.capitem')
    assert p.locator('.capitem').count() == 3, 'capture did not split into 3'
    p.click('[data-act="capSave"]'); p.wait_for_timeout(600)
    for tab in ['tasks', 'ledger', 'ideas', 'money']:
        p.click(f'[data-act="nav"][data-v="{tab}"]'); p.wait_for_timeout(400); shot(p, f'tab-{tab}')
    p.click('[data-act="nav"][data-v="ideas"]'); p.wait_for_timeout(400); assert 'باقة Odoo' in p.inner_text('#view'), 'idea missing: ' + p.inner_text('#view')[:200]
    p.click('[data-act="nav"][data-v="money"]'); p.wait_for_timeout(300); assert '45' in p.inner_text('#view'), 'expense missing'
    p.click('[data-act="nav"][data-v="tasks"]'); p.wait_for_timeout(300); p.click('.chk >> nth=0'); p.wait_for_timeout(400)
    p.click('[data-act="nav"][data-v="ledger"]'); p.wait_for_timeout(300); assert '1' in p.inner_text('.kpi .v >> nth=0'), 'done count not 1'
    p.goto(BASE + 'index.html?as=owner#/shela'); p.wait_for_selector('.subtabs')
    shot(p, '2-owner-shela-balance')
    bal = p.inner_text('.hero .v'); assert '+120' in bal, f'unexpected owner balance {bal}'
    p.click('#fab'); p.fill('#x-title', 'قهوة'); p.fill('#x-amt', '30'); p.click('[data-act="shSaveExp"]'); p.wait_for_timeout(600)
    p.click('[data-act="shTab"][data-v="log"]'); p.wait_for_timeout(300)
    assert 'قهوة' in p.inner_text('#view'), 'new expense not in log'
    shot(p, '3-owner-shela-log')
    p.click('[data-act="shTab"][data-v="report"]'); shot(p, '4-owner-report')
    p.goto(BASE + 'index.html?as=owner#/settings'); p.wait_for_selector('.code'); shot(p, '5-owner-settings')
    # friend join
    f = page_for(b, 'friend-new'); f.goto(BASE + 'shela.html?as=none#/join/A1B2C3D4'); f.wait_for_selector('.pick')
    f.click('.pick >> nth=0'); f.fill('#j-pin', '1234'); shot(f, '6-friend-join')
    # friend already joined
    g = page_for(b, 'friend'); g.goto(BASE + 'shela.html?as=friend'); g.wait_for_selector('.subtabs'); shot(g, '7-friend-shela')
    b.close()
srv.shutdown()
print('ERRORS:', *errors, sep='\n  ') if errors else print('no page errors')
print('screenshots in', OUT)
