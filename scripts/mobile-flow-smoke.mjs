import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE || 'http://127.0.0.1:5173/DoubleFight-Web/';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const a = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const b = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  for (const [index, page] of [a, b].entries()) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?ws=ws://127.0.0.1:8787/ws`);
    await page.locator('#home-online').click();
    await page.locator('#online-name').fill(index ? 'Palace' : 'Kingdom');
    await page.locator(`[data-theme-choice="${index ? 'palace' : 'kingdom'}"]`).click();
    await page.locator('#online-matchmake').waitFor({ state: 'visible' });
  }
  await a.locator('#online-matchmake').click();
  await b.locator('#online-matchmake').click();
  for (const page of [a, b]) await page.locator('#duel-screen').waitFor({ state: 'visible' });
  assert.equal(await a.locator('#duel-local-theme').innerText(), '微缩王国');
  assert.equal(await b.locator('#duel-local-theme').innerText(), '后宫晋升');
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
    await a.keyboard.press(key); await a.waitForTimeout(150);
  }
  assert.ok(Number((await a.locator('#duel-local-score').innerText()).replaceAll(',', '')) > 0);
  console.log('PASS real browser quick match, mixed themes, desktop keyboard movement');
  await a.locator('#duel-exit').click();
  await a.locator('#duel-exit-confirm').click();
  await b.locator('#duel-result-leave').click();
  for (const page of [a, b]) await page.locator('.online-private summary').click();
  await a.locator('#online-create').click();
  await a.waitForFunction(() => /^\d{6}$/.test(document.querySelector('#online-room-code').textContent));
  const code = await a.locator('#online-room-code').innerText();
  await b.locator('#online-code-input').fill(code);
  await b.locator('#online-join').click();
  await b.locator('#online-ready').waitFor({ state: 'visible' });
  await a.locator('#online-ready').click(); await b.locator('#online-ready').click();
  for (const page of [a, b]) await page.locator('#duel-screen').waitFor({ state: 'visible' });
  // A real mobile pointer gesture reaches the same local prediction path.
  const zone = await b.locator('#duel-input-zone').boundingBox();
  await b.mouse.move(zone.x + zone.width * .8, zone.y + zone.height * .5);
  await b.mouse.down(); await b.mouse.move(zone.x + zone.width * .2, zone.y + zone.height * .5, { steps: 4 }); await b.mouse.up();
  console.log('PASS real browser private create/join/ready and swipe input');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
