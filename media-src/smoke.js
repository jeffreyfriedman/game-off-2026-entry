/* Smoke test: load dist/index.html, play a full game through the real
 * DOM at 960x600, assert the expected ending and zero page errors.
 * Also checks the volume slider and the document overlay work.
 * Run: node media-src/smoke.js   (from the game folder)
 */
'use strict';
const { launch, clickOpt, playThrough, GAME_URL } = require('./harness');

(async () => {
  const { browser, page, errors } = await launch(960, 600);
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));

  // Title screen is up with a Begin button.
  const hasBegin = await page.$('[data-opt="continue"]');
  if (!hasBegin) throw new Error('no Begin button on the title screen');

  // Volume slider exists and moves the engine's gain value.
  const volBefore = await page.evaluate(() => window.OLAudio.getVolume());
  await page.evaluate(() => {
    const s = document.getElementById('volume');
    s.value = '25';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const volAfter = await page.evaluate(() => window.OLAudio.getVolume());
  if (Math.abs(volAfter - 0.25) > 0.001) throw new Error('volume slider did not set 0.25 (got ' + volAfter + ')');
  console.log('volume slider: ' + volBefore + ' -> ' + volAfter + ' OK');

  // Full playthrough: ask everything, open for Maren, bar Vane,
  // write the admission accounts -> ROOK CARRIES IT.
  const title = await playThrough(page, {
    asks: 'all', maren: 'open', vane: 'bar',
    write: ['bell_rung_admission', 'ask_begged', 'cart_favor_admission']
  });
  console.log('ending reached:', title);
  if (title !== 'ROOK CARRIES IT') throw new Error('unexpected ending: ' + title);

  // The written log is printed on the ending screen.
  const logText = await page.evaluate(() => {
    const box = document.querySelector('.logdoc');
    return box ? box.textContent : '';
  });
  if (!logText.includes('heard the second ring')) throw new Error('ending log missing the bell entry');
  if (!logText.includes('took money')) throw new Error('ending log missing the cart entry');
  console.log('ending log printed OK');

  // Document overlay opens and closes from the desk bar.
  await page.click('.deskbtn[data-doc="tally"]');
  await new Promise((r) => setTimeout(r, 150));
  const overlayVisible = await page.evaluate(() => !document.getElementById('docoverlay').hidden);
  if (!overlayVisible) throw new Error('tally overlay did not open');
  await page.click('#docclose');
  console.log('document overlay OK');

  // Restart returns to the title.
  await clickOpt(page, 'restart');
  await new Promise((r) => setTimeout(r, 200));
  const backAtTitle = await page.evaluate(() =>
    document.getElementById('transcript').textContent.includes('Kestrel Gate, on the north road'));
  if (!backAtTitle) throw new Error('restart did not return to the title');

  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE PASS, zero page errors');
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
