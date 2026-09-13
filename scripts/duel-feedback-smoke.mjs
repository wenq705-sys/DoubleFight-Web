// Optional existing Playwright installation; local Vite only, no production writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE || 'http://127.0.0.1:5173/DoubleFight-Web/';
const output = resolve(process.env.VISUAL_OUTPUT || 'artifacts/duel-feedback');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  for (const width of [390, 430]) {
    const height = width === 390 ? 844 : 932;
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('**/__duel-feedback', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./src/styles.css"><div id="app"></div>' }));
    await page.goto(`${base}__duel-feedback`);
    if (process.env.SAFE_FRAME) await page.addStyleTag({ content: ':root{--safe-top:47px;--safe-bottom:34px}' });
    await page.evaluate(async base => {
      const [{ DuelScreen }, { OnlineClient }, { Board2048 }, { DEFAULT_SKILL_LOADOUT, SKILL_DEFINITIONS }] = await Promise.all([
        import(`${base}src/ui/DuelScreen.ts`), import(`${base}src/network/OnlineClient.ts`),
        import(`${base}shared/game/Board2048.ts`), import(`${base}shared/index.ts`),
      ]);
      const state = { status: 'connected', connectionId: 'local', playerId: 'local', reconnectToken: null, room: null, match: null, matchmaking: { status: 'idle', joinedAt: null, queueSize: 0 }, latencyMs: 40, lastError: null };
      const client = new OnlineClient('ws://fixture.invalid/ws');
      const listeners = [];
      const f = window.fixture = { state, leaves: 0, moves: 0, rematches: 0, vibrations: 0, emit: message => listeners.forEach(fn => fn(state, message)) };
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { f.vibrations++; return true; } });
      client.snapshot = () => state;
      client.connect = client.ping = () => {};
      client.subscribe = fn => { listeners.push(fn); fn(state); return () => {}; };
      client.leaveRoom = () => { f.leaves++; };
      client.move = () => ++f.moves;
      client.setRematchReady = ready => { f.rematches++; state.room.players[0].rematchReady = ready; f.emit(); };
      new DuelScreen(document.querySelector('#app'), client);
      let round = 0;
      f.start = () => {
        const board = new Board2048(() => 0);
        board.load([[2, 2, 0, 0], [8, 16, 0, 0], [32, 64, 0, 0], [0, 0, 0, 0]]);
        const now = Date.now();
        state.status = 'connected'; state.latencyMs = 40;
        state.match = { matchId: `fixture-${++round}`, roomCode: '123456', phase: 'playing', serverTime: now, roundStartedAt: now - 19000, roundEndsAt: now + 161000, durationMs: 180000, winnerId: null, endReason: null, result: null,
          players: ['local', 'remote'].map((playerId, i) => ({ playerId, name: i ? '美女' : 'Frank', theme: i ? 'palace' : 'kingdom', loadout: [...DEFAULT_SKILL_LOADOUT], board: { ...board.publicState(), score: i ? 600 : 640 }, energy: i ? 62 : 45, maxEnergy: 100, shieldActive: false, petrifyExpiresAt: 0, skillCooldowns: Object.fromEntries(Object.keys(SKILL_DEFINITIONS).map(id => [id, 0])), lastSequence: 0, lastSkillSequence: 0, connected: true })) };
        state.room = { code: '123456', phase: 'playing', matchId: state.match.matchId, players: state.match.players.map(p => ({ id: p.playerId, name: p.name, theme: p.theme, loadout: p.loadout, ready: true, rematchReady: false, connected: true, isHost: p.playerId === 'local' })) };
        f.emit({ type: 'match_start', snapshot: state.match });
      };
      f.finish = (reason = 'board_locked', winner = 'local', tieBreaker = null) => {
        state.match.phase = 'finished'; state.match.endReason = reason; state.match.winnerId = winner;
        state.match.result = { winnerId: winner, reason, tieBreaker, finishedAt: Date.now(), players: state.match.players.map((p, i) => ({ playerId: p.playerId, name: p.name, theme: p.theme, score: p.board.score, highest: 64, usableEmptyCells: i ? 3 : 2 })) };
        state.room.phase = 'finished';
        if (reason === 'opponent_left') state.room.players = state.room.players.slice(0, 1);
        f.emit({ type: 'match_end', snapshot: state.match });
      };
      f.start();
    }, base);
    const shot = async name => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(output, `${width}x${height}-${name}.png`) });
      const targets = await page.locator('#duel-result button, #duel-exit-dialog button').evaluateAll(elements => elements.filter(el => el.checkVisibility()).map(el => { const r = el.getBoundingClientRect(); return { id: el.id, width: r.width, height: r.height, bottom: r.bottom }; }));
      assert.ok(targets.every(r => r.width >= 44 && r.height >= 44 && r.bottom <= height), JSON.stringify(targets));
    };
    await page.waitForTimeout(900);
    assert.equal(await page.locator('#duel-connection').getAttribute('data-quality'), 'ok');
    assert.equal(await page.locator('#duel-connection').evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('#duel-remote-energy-value').innerText(), '62');
    assert.equal(await page.locator('[data-skill="random_clear"]').isDisabled(), false);
    assert.equal(await page.locator('[data-skill="petrify"]').isDisabled(), true);
    await shot('battle-normal');
    await page.evaluate(() => { fixture.state.latencyMs = 160; fixture.emit(); });
    assert.equal(await page.locator('#duel-connection').getAttribute('data-quality'), 'warn');
    await page.evaluate(() => { fixture.state.latencyMs = 394; fixture.emit(); });
    assert.equal(await page.locator('#duel-connection').getAttribute('data-quality'), 'bad');
    assert.equal(await page.locator('#duel-latency').isVisible(), false);
    await shot('battle-high-latency');
    await page.locator('#duel-connection').click();
    assert.equal(await page.locator('#duel-latency').innerText(), '394 ms');
    await page.locator('#duel-connection').click();
    await page.evaluate(() => { fixture.state.status = 'reconnecting'; fixture.emit(); });
    assert.equal(await page.locator('#duel-connection').getAttribute('data-quality'), 'bad');
    await page.evaluate(() => { fixture.state.status = 'connected'; fixture.emit(); });
    await page.locator('#duel-exit').click();
    assert.equal(await page.evaluate(() => fixture.leaves), 0);
    assert.equal(await page.locator('#duel-exit-dialog').evaluate(el => el.open), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => fixture.moves), 0);
    await shot('exit-confirmation');
    await page.locator('#duel-exit-cancel').click();
    await page.locator('#duel-exit').click(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => fixture.leaves), 0);
    await page.locator('#duel-exit').click(); await page.locator('#duel-exit-confirm').click();
    assert.equal(await page.evaluate(() => fixture.leaves), 1);
    await page.evaluate(() => { fixture.start(); fixture.vibrations = 0; fixture.finish(); });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#duel-result-local-name').innerText(), 'Frank');
    assert.equal(await page.locator('#duel-result-remote-name').innerText(), '美女');
    assert.equal(await page.locator('#duel-result-rule').innerText(), '胜利原因 · 对手棋盘锁死');
    assert.equal(await page.evaluate(() => fixture.vibrations), 1);
    await page.evaluate(() => fixture.emit());
    assert.equal(await page.evaluate(() => fixture.vibrations), 1);
    await shot('victory');
    await page.locator('#duel-rematch').click();
    assert.equal(await page.evaluate(() => fixture.rematches), 1);
    assert.equal(await page.locator('#duel-rematch-status').innerText(), '等待对手…');
    await shot('rematch-waiting');
    await page.evaluate(() => { fixture.state.room.players[1].rematchReady = true; fixture.emit(); });
    assert.equal(await page.locator('#duel-rematch-status').innerText(), '双方已准备…');
    await page.locator('#duel-rematch').click();
    assert.equal(await page.locator('#duel-rematch-status').innerText(), '对手想再来一局');
    await page.locator('#duel-result-leave').click();
    assert.equal(await page.evaluate(() => fixture.leaves), 2);
    assert.equal(await page.locator('#duel-exit-dialog').evaluate(el => el.open), false);
    await page.evaluate(() => { fixture.start(); fixture.finish('petrified_lock', 'remote'); });
    await shot('defeat');
    await page.evaluate(() => { fixture.start(); fixture.finish('time_limit', null, 'draw'); });
    await shot('draw');
    await page.evaluate(() => { fixture.start(); fixture.finish('opponent_left'); });
    assert.equal(await page.locator('#duel-rematch').isVisible(), false);
    assert.match(await page.locator('#duel-result-leave').getAttribute('class'), /leave--primary/);
    assert.equal(await page.locator('#duel-rematch-status').innerText(), '');
    await shot('opponent-left');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { fixture.start(); fixture.vibrations = 0; fixture.finish(); });
    assert.equal(await page.evaluate(() => fixture.vibrations), 0);
    assert.ok(parseFloat(await page.locator('.duel-result__card').evaluate(el => getComputedStyle(el).animationDuration)) < .001);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}x${height}: result, rematch, exit confirmation, network, energy, reduced motion`);
    await page.close();
  }
} finally { await browser.close(); }
