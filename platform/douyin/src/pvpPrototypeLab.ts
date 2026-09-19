/** Experimental local rules only. No account, network, Solo or reward dependencies. */
export type LabMode = 'steal' | 'arena' | 'locks';
export type Owner = 'you' | 'ai';
export type Ball = { id: number; value: number; owner: Owner; x: number; y: number; vx: number; vy: number };
export type LabResult = { winner: Owner | 'draw'; reason: string; you: number; ai: number };
export const ROUND_MS = 45_000;
export const MAX_BALLS = 24;
const R = 22, AW = 320, AH = 360;
const titles: Record<LabMode, string> = { steal: '抢数合成', arena: '数字弹射', locks: '破锁竞速' };
const hooks: Record<LabMode, string> = { steal: '抢走对手需要的数，率先合成 64', arena: '瞄准同数合并，把球抢成你的', locks: '合出钥匙，抢先占领两把锁' };
export function mergeRack(values: readonly number[]): number[] {
  const result = [...values];
  for (;;) {
    const a = result.findIndex((v, i) => result.indexOf(v) !== i);
    if (a < 0) return result.sort((a, b) => b - a);
    const b = result.indexOf(result[a]);
    result[b] *= 2;
    result.splice(a, 1);
  }
}
export function preferredSupply(supply: readonly number[], rack: readonly number[]): number {
  return supply.reduce((best, value, i) => {
    const score = (n: number) => n + (rack.includes(n) ? 100 : 0);
    return score(value) > score(supply[best]) ? i : best;
  }, 0);
}
export class LabRound {
  readonly endsAt: number;
  result: LabResult | null = null;
  supply: number[];
  racks: Record<Owner, number[]> = { you: [], ai: [] };
  hands: Record<Owner, number[]> = { you: [2, 2, 4, 4, 2, 4], ai: [2, 2, 4, 4, 2, 4] };
  locks = [8, 16, 32, 64].map(value => ({ value, owner: null as Owner | null }));
  balls: Ball[] = [];
  next: Record<Owner, number> = { you: 4, ai: 4 };
  selected = -1;
  message = '';
  private lastAt: number;
  private aiAt: number;
  private shotAt: Record<Owner, number> = { you: 0, ai: 0 };
  private serial = 0;
  constructor(readonly mode: LabMode, now: number, private readonly random = Math.random) {
    this.endsAt = now + ROUND_MS;
    this.lastAt = now;
    this.aiAt = now + 1100;
    this.supply = Array.from({ length: 5 }, () => this.seed());
    if (mode === 'arena') for (let i = 0; i < 6; i++) this.balls.push({ id: ++this.serial, value: i < 4 ? 4 : 8, owner: i % 2 ? 'ai' : 'you', x: 65 + (i % 3) * 95, y: 125 + Math.floor(i / 3) * 95, vx: 0, vy: 0 });
  }
  private seed(): number { const n = this.random(); return n < .55 ? 2 : n < .92 ? 4 : 8; }
  standing(owner: Owner): number {
    if (this.mode === 'locks') return this.locks.filter(lock => lock.owner === owner).length;
    return Math.max(0, ...(this.mode === 'steal' ? this.racks[owner] : this.balls.filter(b => b.owner === owner).map(b => b.value)));
  }
  private finish(reason: string): void {
    const you = this.standing('you'), ai = this.standing('ai');
    this.result = { winner: you === ai ? 'draw' : you > ai ? 'you' : 'ai', reason, you, ai };
  }
  private check(): void {
    const target = this.mode === 'locks' ? 2 : 64;
    if (this.standing('you') >= target || this.standing('ai') >= target) this.finish(this.mode === 'locks' ? '率先占领 2 把锁' : '率先合成 64');
  }
  take(owner: Owner, index: number): boolean {
    if (this.result || this.mode !== 'steal' || this.supply[index] === undefined) return false;
    const value = this.supply[index];
    if (this.racks[owner].length >= 5 && !this.racks[owner].includes(value)) {
      if (owner === 'you') this.message = '槽位已满，只能抢可立即合并的数字';
      return false;
    }
    this.racks[owner] = mergeRack([...this.racks[owner], value]);
    this.supply[index] = this.seed();
    this.message = `${owner === 'you' ? '你' : 'AI'} 抢走 ${value}`;
    this.check(); return true;
  }
  mergeCards(owner: Owner, a: number, b: number): boolean {
    const hand = this.hands[owner];
    if (this.result || this.mode !== 'locks' || a === b || hand[a] === undefined || hand[a] !== hand[b]) return false;
    hand[a] *= 2; hand[b] = this.seed(); this.check(); return true;
  }
  claim(owner: Owner, card: number, index: number): boolean {
    const lock = this.locks[index];
    if (this.result || this.mode !== 'locks' || !lock || lock.owner || this.hands[owner][card] !== lock.value) return false;
    lock.owner = owner; this.hands[owner][card] = this.seed();
    this.message = `${owner === 'you' ? '你' : 'AI'} 占领 ${lock.value}`;
    this.check(); return true;
  }
  refreshCard(owner: Owner): void {
    if (this.result || this.mode !== 'locks') return;
    const hand = this.hands[owner];
    hand[hand.indexOf(Math.min(...hand))] = this.seed();
    if (owner === 'you') { this.selected = -1; this.message = '已换一张最低牌'; }
  }
  shoot(owner: Owner, x: number, y: number, now: number): boolean {
    if (this.result || this.mode !== 'arena' || now >= this.endsAt || now < this.shotAt[owner]) return false;
    const sy = owner === 'you' ? AH - R - 1 : R + 1;
    // The collision solver resolves occupied launchers, so stationary balls cannot soft-lock firing.
    if (this.balls.length >= MAX_BALLS) this.balls.splice(this.balls.reduce((old, b, i, all) => b.id < all[old].id ? i : old, 0), 1);
    const dx = x - AW / 2, dy = owner === 'you' ? Math.min(-30, y - sy) : Math.max(30, y - sy);
    const length = Math.hypot(dx, dy);
    this.balls.push({ id: ++this.serial, value: this.next[owner], owner, x: AW / 2, y: sy, vx: dx / length * 430, vy: dy / length * 430 });
    this.next[owner] = this.seed(); this.shotAt[owner] = now + 420;
    if (owner === 'you') this.message = '命中同数即可合并夺取';
    return true;
  }
  /** Small fixed substeps avoid tunneling; bounded catch-up prevents resume stalls. */
  physics(seconds: number): void {
    let remaining = Math.min(.25, Math.max(0, seconds));
    while (remaining > 0 && !this.result) {
      const dt = Math.min(1 / 120, remaining); remaining -= dt;
      for (const b of this.balls) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.vx *= Math.exp(-.65 * dt); b.vy *= Math.exp(-.65 * dt);
        if (b.x < R || b.x > AW - R) { b.x = Math.max(R, Math.min(AW - R, b.x)); b.vx *= -1; }
        if (b.y < R || b.y > AH - R) { b.y = Math.max(R, Math.min(AH - R, b.y)); b.vy *= -1; }
      }
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        if (distance >= R * 2) continue;
        if (a.value === b.value) {
          const newer = a.id > b.id ? a : b;
          a.value *= 2; a.owner = newer.owner; a.id = newer.id;
          a.vx = newer.vx; a.vy = newer.vy;
          a.x = (a.x + b.x) / 2; a.y = (a.y + b.y) / 2;
          this.balls.splice(j--, 1); this.check();
          if (this.result) return;
        } else {
          const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
          const overlap = (R * 2 - distance) / 2 + .01;
          a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
          const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (speed < 0) { a.vx += speed * nx; a.vy += speed * ny; b.vx -= speed * nx; b.vy -= speed * ny; }
        }
      }
    }
  }
  update(now: number): void {
    if (this.result) return;
    if (now >= this.endsAt) { this.finish(this.mode === 'locks' ? '时间到，比较占锁数' : '时间到，比较最高数字'); return; }
    if (this.mode === 'arena') this.physics((now - this.lastAt) / 1000);
    this.lastAt = now;
    if (this.result || now < this.aiAt) return;
    this.aiAt = now + (this.mode === 'steal' ? 850 : this.mode === 'arena' ? 1050 : 1250);
    if (this.mode === 'steal') this.take('ai', preferredSupply(this.supply, this.racks.ai));
    if (this.mode === 'arena') {
      const target = this.balls.filter(b => b.value === this.next.ai).sort((a, b) => a.y - b.y)[0];
      this.shoot('ai', target?.x ?? 40 + this.random() * 240, target?.y ?? 220, now);
    }
    if (this.mode === 'locks') {
      const hand = this.hands.ai;
      for (let i = 0; i < this.locks.length; i++) if (this.claim('ai', hand.indexOf(this.locks[i].value), i)) return;
      for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) if (this.mergeCards('ai', i, j)) return;
      this.refreshCard('ai');
    }
  }
}

type Rect = { x: number; y: number; width: number; height: number };
type Target = Rect & { action: () => void };
const ink = '#182431', paper = '#f4f1e8', blue = '#075ab5', red = '#ad3025';
export class PvpPrototypeLab {
  round: LabRound | null = null;
  private targets: Target[] = [];
  constructor(private readonly home: () => void, private readonly legacy: () => void, private readonly now = Date.now) {}
  open(): void { this.round = null; this.targets = []; }
  start(mode: LabMode): void { this.round = new LabRound(mode, this.now()); this.targets = []; }
  update(): void { this.round?.update(this.now()); }
  tap(x: number, y: number): void {
    this.update();
    // The previous frame's gameplay targets must not act after the deadline.
    const target = this.targets.find(t => x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height);
    target?.action();
  }
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, top: number, bottom: number): void {
    this.targets = [];
    this.arenaTap = null;
    ctx.save(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = (value: string, x: number, y: number, size = 18, color = ink) => {
      ctx.fillStyle = color; ctx.font = `bold ${size}px sans-serif`; ctx.fillText(value, x, y, width - 24);
    };
    const box = (r: Rect, label: string, action?: () => void, color = '#ffffff', border = ink, size = 20) => {
      ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
      text(label, r.x + r.width / 2, r.y + r.height / 2, size, border);
      if (action) this.targets.push({ ...r, action });
    };
    const left = 12, w = width - 24, y = top + 68;
    const r = this.round;
    box({ x: left, y: top, width: 100, height: 56 }, '‹ 返回', () => { if (this.round) this.open(); else this.home(); });
    if (!r) {
      text('PvP 玩法实验室', width / 2, y + 20, 26);
      text('本地对 AI · 每局 45 秒', width / 2, y + 54, 16);
      const cardH = Math.max(76, Math.min(116, (height - bottom - y - 184) / 3));
      (['steal', 'arena', 'locks'] as LabMode[]).forEach((mode, i) => {
        const cy = y + 84 + i * (cardH + 12);
        box({ x: left, y: cy, width: w, height: cardH }, '', () => this.start(mode));
        text(`${i + 1}  ${titles[mode]}   ›`, width / 2, cy + 26, 23);
        text(hooks[mode], width / 2, cy + 58, 15);
      });
      box({ x: width / 2 - 110, y: height - bottom - 64, width: 220, height: 56 }, '旧 PvP 对比 · Legacy PvP', this.legacy, paper, ink, 14);
      ctx.restore(); return;
    }
    box({ x: width - 100, y: top, width: 88, height: 56 }, '重开', () => this.start(r.mode));
    text(`${Math.max(0, Math.ceil((r.endsAt - this.now()) / 1000))} 秒`, width / 2, top + 28, 24);
    text(titles[r.mode], width / 2, y + 12, 24);
    text(`你 ${r.standing('you')}  :  ${r.standing('ai')} AI`, width / 2, y + 42, 18);
    const body = y + 66;
    if (r.mode === 'steal') {
      const tileW = (w - 16) / 5;
      const row = (values: number[], ry: number, owner?: Owner) => {
        for (let i = 0; i < 5; i++) box({ x: left + i * (tileW + 4), y: ry, width: tileW, height: 64 }, values[i]?.toString() ?? '—', owner ? undefined : () => r.take('you', i), owner ? '#fff' : '#ffdc72', owner === 'ai' ? red : blue);
      };
      text('AI 的槽位', width / 2, body + 14, 17, red); row(r.racks.ai, body + 34, 'ai');
      text('共享供给 · 点击抢走', width / 2, body + 128, 18); row(r.supply, body + 150);
      text(r.racks.you.length >= 5 ? '槽位已满 · 只能抢能立刻合并的数字' : '你的槽位 · 同数自动合并', width / 2, body + 234, 17, blue); row(r.racks.you, body + 256, 'you');
    } else if (r.mode === 'arena') {
      const ah = Math.min(height - bottom - body - 110, w * AH / AW);
      const rect = { x: left, y: body + 22, width: w, height: ah };
      text(`AI 下一球 ${r.next.ai}`, width / 2, body + 6, 15, red);
      box(rect, '');
      // The arena itself is one large aiming surface, not individual ball buttons.
      this.arenaTap = { rect, shoot: (x, y) => r.shoot('you', (x - rect.x) / rect.width * AW, (y - rect.y) / rect.height * AH, this.now()) };
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
      for (const ball of r.balls) {
        const bx = rect.x + ball.x / AW * w, by = rect.y + ball.y / AH * ah;
        ctx.beginPath(); ctx.ellipse(bx, by, R / AW * w, R / AH * ah, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ball.owner === 'you' ? blue : red; ctx.lineWidth = 4; ctx.stroke();
        text(String(ball.value), bx, by - 4, 19); text(ball.owner === 'you' ? '你' : 'AI', bx, by + 12, 10, ctx.strokeStyle);
      }
      ctx.restore();
      text('▼ AI', width / 2, rect.y + 12, 14, red);
      text('▲ 你', width / 2, rect.y + ah - 12, 14, blue);
      text(`下一球 ${r.next.you} · 点击场内瞄准发射`, width / 2, rect.y + ah + 24, 17, blue);
      text('满 24 球移除最旧球 · 同数夺取', width / 2, rect.y + ah + 48, 14);
    } else {
      text(`AI 手牌  ${r.hands.ai.join(' · ')}`, width / 2, body + 10, 15, red);
      const cellW = (w - 12) / 4;
      r.locks.forEach((lock, i) => {
        box({ x: left + i * (cellW + 4), y: body + 34, width: cellW, height: 56 }, String(lock.value), () => {
          if (!r.claim('you', r.selected, i)) r.message = '选中数字必须与未占的锁相同';
          else r.selected = -1;
        }, lock.owner ? '#e4e5e4' : '#fff', lock.owner === 'ai' ? red : blue, 22);
        text(lock.owner === 'you' ? '你已占' : lock.owner === 'ai' ? 'AI已占' : '待抢', left + i * (cellW + 4) + cellW / 2, body + 101, 13, lock.owner === 'ai' ? red : blue);
      });
      text('点两张同数合并 · 选牌后点锁占领', width / 2, body + 124, 15);
      const cardW = (w - 16) / 3;
      r.hands.you.forEach((value, i) => box({ x: left + (i % 3) * (cardW + 8), y: body + 140 + Math.floor(i / 3) * 66, width: cardW, height: 58 }, `${r.selected === i ? '✓ ' : ''}${value}`, () => {
        if (r.result) return;
        if (r.selected === i) r.selected = -1;
        else if (r.mergeCards('you', r.selected, i)) { r.selected = -1; r.message = '合并成功，空位补入低数'; }
        else r.selected = i;
      }, r.selected === i ? '#ffdc72' : '#fff', blue));
      box({ x: left, y: body + 272, width: w, height: 56 }, '换一张最低牌', () => r.refreshCard('you'), paper, ink, 17);
    }
    text(r.message || (r.mode === 'locks' ? '先占 2 把锁获胜' : '先到 64 获胜'), width / 2, height - bottom - 16, 16);
    if (r.result) {
      this.targets = this.targets.slice(0, 2); this.arenaTap = null;
      const oy = Math.max(top + 68, height / 2 - 132);
      box({ x: left, y: oy, width: w, height: 264 }, '', undefined, '#ffdc72');
      text(r.result.winner === 'draw' ? '平局' : r.result.winner === 'you' ? '你赢了！' : 'AI 获胜', width / 2, oy + 38, 30);
      text(r.result.reason, width / 2, oy + 84, 18);
      text(`你 ${r.result.you}  :  ${r.result.ai} AI`, width / 2, oy + 122, 22);
      box({ x: left + 16, y: oy + 166, width: w - 32, height: 64 }, '再来一局', () => this.start(r.mode), '#fff', blue);
    }
    ctx.restore();
  }
  private arenaTap: { rect: Rect; shoot: (x: number, y: number) => void } | null = null;
  handleTap(x: number, y: number): void {
    this.update();
    const a = this.arenaTap;
    if (this.round?.mode === 'arena' && !this.round.result && a && x >= a.rect.x && x <= a.rect.x + a.rect.width && y >= a.rect.y && y <= a.rect.y + a.rect.height) a.shoot(x, y);
    else this.tap(x, y);
  }
}
