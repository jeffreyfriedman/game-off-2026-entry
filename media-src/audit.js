/* Full-state surface audit for The Outgoing Log.
 *
 * For each viewport size, drives the real DOM through four full
 * playthroughs (different policies -> different gates, write stances,
 * and endings), and at EVERY state checks:
 *   - every choice button is fully inside the viewport
 *   - elementFromPoint at each button's center hits the button itself
 *     (nothing covers it)
 *   - no horizontal document overflow
 *   - the document overlay (opened once per size) fits and its close
 *     button is hittable
 * Run with --break to inject a sabotage style (choices footer pushed
 * 260px down) after load: the audit MUST fail then. That failure is
 * the evidence the audit can see.
 *
 * Run: node media-src/audit.js [--break]   (from the game folder)
 * Exit code 0 = pass, 1 = failures found.
 */
'use strict';
const { launch, GAME_URL } = require('./harness');

const SIZES = [[960, 600], [960, 540], [1280, 720], [1920, 1080], [390, 844]];
const BREAK = process.argv.includes('--break');

const RUNS = [
  { name: 'A full-ask, rook ending', asks: 'all', maren: 'open', vane: 'bar',
    write: ['bell_rung_admission', 'ask_begged', 'cart_favor_admission'] },
  { name: 'B silent, gate-closed ending', asks: 'none', maren: 'bar', vane: 'open',
    write: ['bell_notrung', 'ask_asked_log', 'cart_omit'] },
  { name: 'C full-ask, open record ending', asks: 'all', maren: 'bar', vane: 'bar',
    write: ['bell_open', 'ask_open', 'cart_open'] },
  { name: 'D partial, sella ending', asks: 'all', maren: 'open', vane: 'open',
    write: ['bell_notrung', 'ask_notasked', 'cart_mistake'] }
];

const ASK_IDS = ['maren_pell', 'maren_debt', 'maren_horse', 'sella_bell', 'sella_rook',
  'sella_causeway', 'vane_debt', 'vane_pell', 'vane_tally', 'rook_boy', 'rook_bell',
  'rook_asking', 'rook_cart', 'wick_bell', 'wick_asking', 'wick_cart'];

async function checkState(page, sizeLabel, runName, failures, statesSeen) {
  const report = await page.evaluate(() => {
    const out = { buttons: [], docOverflowX: false, key: '' };
    out.docOverflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const btns = Array.from(document.querySelectorAll('#choices .choice'));
    out.key = btns.map((b) => b.dataset.opt).join('|') +
      '::' + (document.querySelector('.endingtitle') ? 'ending' : '');
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      out.buttons.push({
        id: b.dataset.opt,
        inside: r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
        hitOk: hit === b || b.contains(hit),
        rect: [Math.round(r.top), Math.round(r.bottom), Math.round(window.innerHeight)]
      });
    }
    return out;
  });
  const stateKey = sizeLabel + ' ' + report.key;
  if (!statesSeen.has(stateKey)) {
    statesSeen.add(stateKey);
    if (report.docOverflowX) failures.push(sizeLabel + ' [' + runName + '] horizontal document overflow at state ' + report.key);
    for (const b of report.buttons) {
      if (!b.inside) failures.push(sizeLabel + ' [' + runName + '] button ' + b.id + ' outside viewport (top ' + b.rect[0] + ', bottom ' + b.rect[1] + ', vh ' + b.rect[2] + ') at state ' + report.key);
      if (!b.hitOk) failures.push(sizeLabel + ' [' + runName + '] button ' + b.id + ' covered at its center at state ' + report.key);
    }
  }
  return report.key.startsWith('restart') || report.key.includes('ending');
}

async function runOne(page, run, sizeLabel, failures, statesSeen) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await sleep(350);
  if (BREAK) {
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#choices { transform: translateY(260px); }';
      document.head.appendChild(s);
    });
  }
  let overlayChecked = false;
  for (let step = 0; step < 300; step++) {
    const done = await checkState(page, sizeLabel, run.name, failures, statesSeen);
    if (done) return;
    if (!overlayChecked && step === 3) {
      overlayChecked = true;
      await page.click('.deskbtn[data-doc="tally"]');
      await sleep(150);
      const ov = await page.evaluate(() => {
        const panel = document.getElementById('docpanel');
        const close = document.getElementById('docclose');
        const r = panel.getBoundingClientRect();
        const cr = close.getBoundingClientRect();
        const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        return {
          fits: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
          closeHit: hit === close
        };
      });
      if (!ov.fits) failures.push(sizeLabel + ' [' + run.name + '] document overlay panel does not fit the viewport');
      if (!ov.closeHit) failures.push(sizeLabel + ' [' + run.name + '] overlay close button covered');
      await page.click('#docclose');
      await sleep(100);
    }
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#choices .choice')).map((b) => b.dataset.opt));
    if (!btns.length) { failures.push(sizeLabel + ' [' + run.name + '] no choices on screen at step ' + step); return; }
    let pick = null;
    if (btns.includes('continue')) pick = 'continue';
    else {
      const stay = btns.find((b) => b.startsWith('doc_')) || btns.find((b) => ASK_IDS.includes(b));
      if (run.asks === 'all' && stay) pick = stay;
      else if (btns.includes('desk_done')) pick = 'desk_done';
      else if (btns.includes('maren_open')) pick = run.maren === 'open' ? 'maren_open' : 'maren_bar';
      else if (btns.includes('vane_open')) pick = run.vane === 'open' ? 'vane_open' : 'vane_bar';
      else {
        const go = btns.find((b) => b.endsWith('_done'));
        if (go) pick = go;
        else pick = run.write.find((w) => btns.includes(w)) || btns[0];
      }
    }
    await page.click('[data-opt="' + pick + '"]');
    await sleep(90);
  }
  failures.push(sizeLabel + ' [' + run.name + '] playthrough did not finish in 300 steps');
}

(async () => {
  const failures = [];
  const statesSeen = new Set();
  for (const [w, h] of SIZES) {
    const { browser, page, errors } = await launch(w, h);
    for (const run of RUNS) {
      await runOne(page, run, w + 'x' + h, failures, statesSeen);
    }
    if (errors.length) failures.push(w + 'x' + h + ' page errors: ' + errors.join('; '));
    await browser.close();
    console.log('size ' + w + 'x' + h + ' done (' + statesSeen.size + ' distinct states so far)');
  }
  console.log('distinct states checked: ' + statesSeen.size);
  if (failures.length) {
    console.log('AUDIT FAIL (' + failures.length + '):');
    failures.slice(0, 40).forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('AUDIT PASS: every control visible and hittable at first sight, all sizes, all runs');
})().catch((e) => { console.error('AUDIT ERROR:', e.message); process.exit(2); });
