"""Interaction tests for the persistent canvas, quick navigation and comparison."""
import json,sys
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright, expect
sys.stdout.reconfigure(encoding='utf8')
OUT=Path(__file__).resolve().parents[1]/'artifacts'/('observatory-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True, exist_ok=True)
checks=[]
def passed(s):checks.append(s);print('PASS',s)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1050});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/?demo=1#/list',wait_until='networkidle')
 page.wait_for_timeout(900)
 assert page.evaluate('ProbeGlobe.inspect().dots')>1500
 assert page.evaluate('ProbeGlobe.inspect().frames')>10
 passed('canvas renders sampled continents and live frames')
 page.evaluate('window.originalCanvas=document.querySelector("canvas.globe-canvas")')
 page.locator('[data-globe-control="in"]').click()
 assert page.evaluate('ProbeGlobe.inspect().zoom')>1
 page.wait_for_timeout(5100)
 assert page.evaluate('window.originalCanvas===document.querySelector("canvas.globe-canvas")')
 assert page.evaluate('ProbeGlobe.inspect().zoom')>1
 passed('canvas identity and zoom survive periodic data refresh')
 page.locator('[data-globe-control="reset"]').click(); page.wait_for_timeout(900)
 canvas=page.locator('.globe-canvas');box=canvas.bounding_box()
 before=page.evaluate('ProbeGlobe.inspect().lon')
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
 page.mouse.down();page.mouse.move(box['x']+box['width']/2+100,box['y']+box['height']/2+20,steps=8);page.mouse.up()
 assert abs(page.evaluate('ProbeGlobe.inspect().lon')-before)>15
 passed('pointer drag rotates the globe')
 canvas.focus();before=page.evaluate('ProbeGlobe.inspect().lat');page.keyboard.press('ArrowUp')
 assert page.evaluate('ProbeGlobe.inspect().lat')>before
 passed('globe supports keyboard rotation')
 page.locator('.region-entry[data-region="JP"]').click()
 expect(page.locator('.row:not(.row-h)')).to_have_count(3)
 expect(page.locator('.region-clear')).to_contain_text('JP')
 page.wait_for_timeout(1200)
 assert abs(page.evaluate('ProbeGlobe.inspect().lon')-139.69)<3
 passed('region selection filters nodes and smoothly aims the globe')
 page.locator('.region-clear').click();expect(page.locator('.row:not(.row-h)')).to_have_count(6)
 page.keyboard.press('Control+k');expect(page.locator('#workbench-dialog')).to_be_visible()
 page.locator('#command-query').fill('JP-02')
 expect(page.locator('.command-result')).to_have_count(1)
 page.keyboard.press('Enter');expect(page.locator('#win-title')).to_have_text('JP-02')
 passed('command palette finds a node and opens its detail')
 page.keyboard.press('Control+k');expect(page.locator('#workbench-dialog')).to_be_visible()
 page.keyboard.press('Escape');expect(page.locator('#workbench-dialog')).not_to_be_visible()
 expect(page.locator('#overlay')).to_be_visible()
 passed('Escape closes the top dialog without closing node details')
 page.locator('#compare-node').click();expect(page.locator('#compare-node')).to_have_attribute('aria-pressed','true')
 page.locator('[data-node-step="1"]').click();expect(page.locator('#win-title')).not_to_have_text('JP-02')
 page.locator('#compare-node').click()
 page.locator('[data-node-step="1"]').click();page.locator('#compare-node').click()
 page.locator('[data-node-step="1"]').click();expect(page.locator('#compare-node')).to_be_disabled()
 passed('detail stepping works and comparison caps selection at three')
 page.keyboard.press('Escape')
 expect(page.locator('#compare-dock')).to_be_visible()
 page.locator('[data-compare-go]').click()
 expect(page.locator('#workbench-dialog table thead th')).to_have_count(4)
 expect(page.locator('#workbench-dialog table tbody tr')).to_have_count(11)
 page.screenshot(path=str(OUT/'observatory-compare.png'))
 page.wait_for_timeout(5100)
 expect(page.locator('#workbench-dialog')).to_be_visible()
 expect(page.locator('#workbench-dialog [data-wb-close]')).to_be_focused()
 passed('comparison displays current metrics and retains focus after refresh')
 page.keyboard.press('Escape');page.locator('[data-compare-remove]').first.click()
 expect(page.locator('[data-compare-remove]')).to_have_count(2)
 passed('comparison selections can be removed')
 page.locator('#fx-launcher').click();page.locator('[data-preset="none"]').click()
 page.locator('.fx-min').click()
 page.locator('.globe-canvas').scroll_into_view_if_needed();page.wait_for_timeout(300)
 initial=page.evaluate('ProbeGlobe.inspect()');page.wait_for_timeout(400)
 after=page.evaluate('ProbeGlobe.inspect()')
 assert initial['lon']==after['lon'] and initial['frames']==after['frames']
 passed('all-off leaves a static canvas without a continuous drawing loop')
 page.locator('#fx-launcher').click();page.locator('[data-preset="recommended"]').click();page.locator('.fx-min').click()
 page.locator('#theme-toggle').click();page.wait_for_timeout(1500)
 assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(212, 192, 150)'
 page.screenshot(path=str(OUT/'observatory-light.png'),full_page=True)
 passed('original warm-paper light palette retained')
 for width in [360,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':900})
  for view in ['grid','column','list']:
   page.locator('[data-view="'+view+'"]').click();page.wait_for_timeout(80)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,view)
 passed('all three node layouts fit 360 through 1440px')
 page.set_viewport_size({'width':390,'height':844})
 page.locator('.row:not(.row-h)').first.click()
 expect(page.locator('#win-close')).to_be_visible()
 page.wait_for_timeout(700)
 page.screenshot(path=str(OUT/'observatory-mobile-detail.png'))
 page.keyboard.press('Escape');page.locator('[data-compare-go]').click()
 assert page.locator('#workbench-dialog').bounding_box()['width']<=390
 page.wait_for_timeout(700)
 page.screenshot(path=str(OUT/'observatory-mobile-compare.png'))
 passed('mobile detail controls and comparison dialog fit viewport')
 page.keyboard.press('Escape')
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(500)
 initial=page.evaluate('ProbeGlobe.inspect()');page.wait_for_timeout(350)
 assert page.evaluate('ProbeGlobe.inspect().lon')==initial['lon']
 passed('reduced motion stops automatic rotation')
 assert not errors,errors
 passed('no browser JavaScript errors')
 b.close()
(OUT/'observatory-test-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print('ALL PASS',len(checks))
