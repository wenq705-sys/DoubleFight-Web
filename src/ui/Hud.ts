import { KINGDOM_RANKS, PALACE_RANKS, type ThemeId, type ThemeMeta } from '../config/themes';

export class Hud {
  readonly root: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly bestValue: HTMLElement;
  private readonly highestValue: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly themeButton: HTMLButtonElement;
  private readonly skillButton: HTMLButtonElement;
  private readonly skillCount: HTMLElement;
  private readonly skillFx: HTMLElement;

  constructor(container: HTMLElement) {
    const petals = Array.from({ length: 18 }, (_, index) =>
      `<i class="skill-fx__petal" style="--i:${index}"></i>`,
    ).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="hud" aria-label="游戏状态">
        <button class="hud__new" id="new-game" type="button">↻ 新局</button>

        <div class="hud__stats">
          <div class="stat-card" aria-label="分数"><span>分数</span><strong id="score-value">0</strong></div>
        </div>

        <button class="hud__theme" id="theme-toggle" type="button" aria-label="返回主题岛">← 主题岛</button>

        <button class="hud__skill" id="clear-skill" type="button" aria-label="随机清块技能">
          <span class="hud__skill-icon">◇</span>
          <span class="hud__skill-name">随机清块</span>
          <strong class="hud__skill-count" id="skill-count">3</strong>
        </button>

        <div class="hud__toast" id="merge-toast">MERGE!</div>
      </div>

      <div class="skill-fx" id="skill-fx" aria-hidden="true">
        <div class="skill-fx__flash"></div>
        <div class="skill-fx__wing skill-fx__wing--left"></div>
        <div class="skill-fx__wing skill-fx__wing--right"></div>
        <div class="skill-fx__ring"></div>
        <div class="skill-fx__calligraphy">凤舞九天</div>
        <div class="skill-fx__sub">随机清块</div>
        <div class="skill-fx__petals">${petals}</div>
      </div>

      <div class="game-over" id="game-over" role="dialog" aria-modal="true">
        <div class="game-over__card">
          <div class="game-over__crown">♛</div>
          <h2>棋盘已满</h2>
          <p>没有可移动的格子了，再开一局继续晋升吧。</p>
          <p>最佳分数 <strong id="best-value">0</strong> · <strong id="highest-value"></strong></p>
          <button id="retry-game" type="button">再来一局</button>
        </div>
      </div>`);

    this.root = container.querySelector('.hud') as HTMLElement;
    this.scoreValue = container.querySelector('#score-value') as HTMLElement;
    this.bestValue = container.querySelector('#best-value') as HTMLElement;
    this.highestValue = container.querySelector('#highest-value') as HTMLElement;
    this.toast = container.querySelector('#merge-toast') as HTMLElement;
    this.gameOver = container.querySelector('#game-over') as HTMLElement;
    this.restartButton = container.querySelector('#new-game') as HTMLButtonElement;
    this.retryButton = container.querySelector('#retry-game') as HTMLButtonElement;
    this.themeButton = container.querySelector('#theme-toggle') as HTMLButtonElement;
    this.skillButton = container.querySelector('#clear-skill') as HTMLButtonElement;
    this.skillCount = container.querySelector('#skill-count') as HTMLElement;
    this.skillFx = container.querySelector('#skill-fx') as HTMLElement;
  }

  setScore(score: number): void {
    this.scoreValue.textContent = score.toLocaleString('zh-CN');
    const best = Math.max(score, Number(localStorage.getItem('doublefight-best') ?? 0));
    localStorage.setItem('doublefight-best', String(best));
    this.bestValue.textContent = best.toLocaleString('zh-CN');
  }

  setHighest(value: number, theme: ThemeId): void {
    this.highestValue.textContent = theme === 'palace'
      ? (PALACE_RANKS[value] ?? '凤仪')
      : (KINGDOM_RANKS[value] ?? '王国奇观');
  }

  setTheme(theme: ThemeMeta): void {
    this.themeButton.textContent = '← 主题岛';
    this.root.dataset.theme = theme.id;
    document.body.dataset.theme = theme.id;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hud--hidden', !visible);
    if (!visible) this.hideGameOver();
  }

  setSkillCharges(charges: number): void {
    this.skillCount.textContent = String(charges);
    this.skillButton.disabled = charges <= 0;
    this.skillButton.classList.toggle('hud__skill--empty', charges <= 0);
  }

  showMerge(value: number, chain: number, theme: ThemeId): void {
    if (theme === 'palace') {
      this.toast.textContent =
        value >= 2048 ? '母仪天下!' :
        value >= 512 ? '凤仪晋升!' :
        chain >= 2 ? `连升 ×${chain}` :
        '晋升!';
    } else {
      this.toast.textContent =
        value >= 2048 ? 'KINGDOM WONDER!' :
        value >= 1024 ? 'ROYAL ASCENSION!' :
        chain >= 2 ? `COMBO ×${chain}` :
        'MERGE!';
    }
    this.toast.classList.remove('hud__toast--show');
    void this.toast.offsetWidth;
    this.toast.classList.add('hud__toast--show');
  }

  playSkillFx(theme: ThemeId): void {
    this.skillFx.classList.remove('skill-fx--show', 'skill-fx--palace', 'skill-fx--kingdom');
    this.skillFx.classList.add(theme === 'palace' ? 'skill-fx--palace' : 'skill-fx--kingdom');
    void this.skillFx.offsetWidth;
    this.skillFx.classList.add('skill-fx--show');
    window.setTimeout(() => this.skillFx.classList.remove('skill-fx--show'), 1450);
  }

  showSkillEmpty(): void {
    this.skillButton.classList.remove('hud__skill--deny');
    void this.skillButton.offsetWidth;
    this.skillButton.classList.add('hud__skill--deny');
  }

  showGameOver(): void { this.gameOver.classList.add('game-over--show'); }
  hideGameOver(): void { this.gameOver.classList.remove('game-over--show'); }

  onRestart(handler: () => void): void {
    this.restartButton.addEventListener('click', handler);
    this.retryButton.addEventListener('click', handler);
  }

  onHome(handler: () => void): void {
    this.themeButton.addEventListener('click', handler);
  }

  onThemeToggle(handler: () => void): void {
    this.themeButton.addEventListener('click', handler);
  }

  onSkill(handler: () => void): void {
    this.skillButton.addEventListener('click', handler);
  }
}
