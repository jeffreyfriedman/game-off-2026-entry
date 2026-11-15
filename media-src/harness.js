/* Shared headless-Chrome harness for The Outgoing Log.
 * Uses the recorder Chrome (SwiftShader) via gif-tools' puppeteer-core.
 * Marks its own traffic as telemetry probe traffic before page load.
 */
'use strict';
const puppeteer = require('/home/hatch/workspace/gif-tools/node_modules/puppeteer-core');

const CHROME = '/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome';
const GAME_URL = 'file:///home/hatch/workspace/the-outgoing-log/dist/index.html';

async function launch(width, height) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--mute-audio', '--hide-scrollbars',
      '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument(() => { window.TC_TELEMETRY_PROBE = true; });
  return { browser, page, errors };
}

/* Click a choice button by its data-opt id. Returns false if absent. */
async function clickOpt(page, id) {
  const handle = await page.$('[data-opt="' + id + '"]');
  if (!handle) return false;
  await handle.click();
  return true;
}

/* Drive a full playthrough through the real DOM.
 * policy: { asks: 'all'|'none', maren: 'open'|'bar', vane: 'open'|'bar',
 *           write: [optId, optId, optId] } */
async function playThrough(page, policy) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let step = 0; step < 300; step++) {
    const info = await page.evaluate(() => {
      const ending = document.querySelector('.endingtitle');
      if (ending) return { done: true, title: ending.textContent };
      const btns = Array.from(document.querySelectorAll('#choices .choice')).map((b) => b.dataset.opt);
      return { done: false, btns };
    });
    if (info.done) return info.title;
    const btns = info.btns;
    if (!btns.length) throw new Error('no choices on screen at step ' + step);
    let pick = null;
    if (btns.includes('continue')) pick = 'continue';
    else {
      // desk docs and asks first (they stay in the node)
      const stay = btns.find((b) => b.startsWith('doc_')) ||
        btns.find((b) => ['maren_pell', 'maren_debt', 'maren_horse', 'sella_bell', 'sella_rook',
          'sella_causeway', 'vane_debt', 'vane_pell', 'vane_tally', 'rook_boy', 'rook_bell',
          'rook_asking', 'rook_cart', 'wick_bell', 'wick_asking', 'wick_cart'].includes(b));
      if (policy.asks === 'all' && stay) pick = stay;
      else if (btns.includes('desk_done')) pick = 'desk_done';
      else if (btns.includes('maren_open') || btns.includes('maren_bar')) pick = policy.maren === 'open' ? 'maren_open' : 'maren_bar';
      else if (btns.includes('vane_open') || btns.includes('vane_bar')) pick = policy.vane === 'open' ? 'vane_open' : 'vane_bar';
      else {
        const go = btns.find((b) => b.endsWith('_done'));
        if (go) pick = go;
        else {
          // write node: pick the next wanted option id that is on screen
          const want = policy.write.find((w) => btns.includes(w));
          pick = want || btns[0];
        }
      }
    }
    if (!pick) throw new Error('driver stuck at step ' + step + ' with buttons ' + btns.join(','));
    const clicked = await clickOpt(page, pick);
    if (!clicked) throw new Error('button vanished: ' + pick);
    await sleep(120);
  }
  throw new Error('playthrough exceeded 300 steps');
}

module.exports = { launch, clickOpt, playThrough, GAME_URL };
