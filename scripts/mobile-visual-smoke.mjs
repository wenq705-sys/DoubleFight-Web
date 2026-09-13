// Optional browser tooling stays outside production dependencies.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation (file URL).
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE || 'http://127.0.0.1:5173/DoubleFight-Web/';
const output = resolve(process.env.VISUAL_OUTPUT || 'artifacts/mobile-visual');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const results = [];
try {
  const viewports = [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }];
  for (const viewport of process.env.SAFE_FRAME ? viewports.slice(0, 2) : viewports) {
    if (process.env.VISUAL_WIDTH && viewport.width !== Number(process.env.VISUAL_WIDTH)) continue;
    for (const mode of ['home', 'solo-early', 'solo-crowded', 'duel', 'setup']) {
      for (const theme of mode === 'setup' ? ['kingdom'] : ['kingdom', 'palace']) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/__visual-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./src/styles.css"><div id="app"></div>' }));
        await page.goto(`${base}__visual-fixture`);
        if (process.env.SAFE_FRAME) await page.addStyleTag({ content: ':root{--safe-top:47px;--safe-bottom:34px}' });
        await page.evaluate(async ({ mode, theme, base }) => {
          const [{ THEMES }, { Board2048 }, { DEFAULT_SKILL_LOADOUT, SKILL_DEFINITIONS }] = await Promise.all([
            import(`${base}src/config/themes.ts`), import(`${base}shared/game/Board2048.ts`), import(`${base}shared/index.ts`),
          ]);
          const app = document.querySelector('#app');
          // Deterministic presentation fixtures, never shipped to the game entry point.
          const board = new Board2048(() => 0);
          board.load(mode === 'solo-early' ? [[2, 0, 0, 0], [0, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] : [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 2], [4, 8, 16, 32]]);
          if (mode === 'home') {
            const { HomeScreen } = await import(`${base}src/ui/HomeScreen.ts`);
            new HomeScreen(app, theme);
          } else if (mode.startsWith('solo')) {
            const [{ GameScene }, { Hud }] = await Promise.all([import(`${base}src/rendering/GameScene.ts`), import(`${base}src/ui/Hud.ts`)]);
            const scene = new GameScene(app); scene.setTheme(theme, board.tiles());
            const hud = new Hud(app); hud.setTheme(THEMES[theme]); hud.setScore(3456); hud.setHighest(2048, theme);
            window.fixtureScene = scene;
          } else {
            const { OnlineClient } = await import(`${base}src/network/OnlineClient.ts`);
            const client = new OnlineClient('ws://fixture.invalid/ws');
            const state = { status: 'connected', connectionId: 'local', playerId: 'local', reconnectToken: null, room: null, match: null, matchmaking: { status: 'idle', joinedAt: null, queueSize: 0 }, latencyMs: 50, lastError: null };
            const listeners = [];
            client.snapshot = () => state;
            client.connect = client.ping = () => {};
            client.subscribe = fn => { listeners.push(fn); fn(state); return () => {}; };
            window.fixture = { client, state, emit: message => listeners.forEach(fn => fn(state, message)) };
            localStorage.setItem('doublefight-player-name', 'Frank');
            if (mode === 'setup') {
              const { OnlineLobby } = await import(`${base}src/ui/OnlineLobby.ts`);
              new OnlineLobby(app, client, true).show(theme);
            } else {
              const { DuelScreen } = await import(`${base}src/ui/DuelScreen.ts`);
              const screen = new DuelScreen(app, client);
              const now = Date.now();
              state.match = { matchId: 'fixture', roomCode: '123456', phase: 'playing', serverTime: now, roundStartedAt: now - 19000, roundEndsAt: now + 161000, durationMs: 180000, winnerId: null, endReason: null, result: null,
                players: ['local', 'remote'].map((playerId, i) => ({ playerId, name: i ? '美女' : 'Frank', theme: i ? theme === 'kingdom' ? 'palace' : 'kingdom' : theme, loadout: [...DEFAULT_SKILL_LOADOUT], board: { ...board.publicState(), score: i ? 2048 : 3456 }, energy: i ? 30 : 70, maxEnergy: 100, shieldActive: i === 1, petrifyExpiresAt: 0, skillCooldowns: Object.fromEntries(Object.keys(SKILL_DEFINITIONS).map(id => [id, 0])), lastSequence: 0, lastSkillSequence: 0, connected: true })) };
              window.fixture.emit({ type: 'match_start', snapshot: state.match });
              window.fixtureScene = screen.scene;
            }
          }
        }, { mode, theme, base });
        await page.waitForTimeout(1800);
        if (process.env.GRAYSCALE && mode.startsWith('solo')) await page.addStyleTag({ content: '.game-canvas{filter:grayscale(1)}' });
        const name = `${viewport.width}x${viewport.height}-${mode}-${theme}${process.env.SAFE_FRAME ? '-safe' : ''}`;
        await page.screenshot({ path: resolve(output, `${name}.png`) });
        const metrics = await page.evaluate(() => {
          const visible = el => {
            if (el.closest('.sr-only')) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            for (let n = el; n instanceof HTMLElement; n = n.parentElement) {
              const s = getComputedStyle(n);
              if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
            }
            return true;
          };
          const smallText = [...document.querySelectorAll('body *')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => `${el.className}: ${getComputedStyle(el).fontSize}`);
          const smallTargets = [...document.querySelectorAll('button,summary,input')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(el => el.id || el.className);
          const cta = document.querySelector('#online-matchmake');
          return { smallText, smallTargets, ctaInViewport: !cta || cta.getBoundingClientRect().bottom <= innerHeight };
        });
        if (mode === 'setup') {
          await page.locator('[data-loadout-slot="1"]').click();
          assert.equal(await page.locator('#skill-library').evaluate(el => el.open), true);
          await page.locator('[data-skill-choice="shuffle"]').click();
          assert.match(await page.locator('[data-loadout-slot="1"]').innerText(), /洗牌/);
          await page.locator('[data-loadout-slot="0"]').click();
          await page.locator('[data-skill-choice="shuffle"]').click();
          assert.equal(new Set(await page.locator('[data-loadout-slot] b').allTextContents()).size, 3);
          await page.locator('#change-skills').click();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#skill-library').evaluate(el => el.open), false);
          await page.evaluate(() => { window.fixture.state.matchmaking.status = 'searching'; window.fixture.emit(); });
          assert.equal(await page.locator('#change-skills').isDisabled(), true);
        }
        results.push({ name, ...metrics, errors });
        console.log(JSON.stringify(results.at(-1)));
        await page.close();
      }
    }
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  assert.ok(results.every(r => r.errors.length === 0 && r.smallText.length === 0 && r.smallTargets.length === 0 && r.ctaInViewport), 'Mobile layout checks failed; see results.json');
} finally { await browser.close(); }
