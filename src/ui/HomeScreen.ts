import { THEME_IDS, THEMES, pieceName, pieceTier, type ThemeId } from '../config/themes';
import { themePreviews } from '../rendering/themes/ThemePreview';
import { browserPlatform } from '../platform/browser/BrowserPlatform';

type ThemeCard = {
  id: ThemeId;
  icon: string;
};

const ICONS: Record<ThemeId, string> = {
  kingdom: '♜',
  palace: '♛',
  zodiac: '◉',
  candy: '◆',
  dreamhouse: '⌂',
};

const CARDS: ThemeCard[] = THEME_IDS.map(id => ({ id, icon: ICONS[id] }));

export class HomeScreen {
  private readonly root: HTMLElement;
  private readonly track: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly record: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly onlineButton: HTMLButtonElement;
  private readonly dots: HTMLElement;
  private index = 0;
  private pointerStart: number | null = null;
  private onStartHandler: ((theme: ThemeId) => void) | null = null;
  private onOnlineHandler: ((theme: ThemeId) => void) | null = null;
  private onPreviewHandler: ((theme: ThemeId) => void) | null = null;

  constructor(container: HTMLElement, initialTheme: ThemeId) {
    this.index = Math.max(0, CARDS.findIndex(card => card.id === initialTheme));
    const previews = themePreviews();

    const islands = CARDS.map((card, index) => {
      const meta = THEMES[card.id];
      return `
        <article class="home-island home-island--${card.id}" data-index="${index}">
          <div class="home-island__cloud home-island__cloud--a"></div>
          <div class="home-island__cloud home-island__cloud--b"></div>
          <div class="home-island__land">
            <div class="home-island__rim"></div>
            <div class="home-island__world">
              <img class="home-island__hero" src="${previews[card.id]}" alt="${meta.label}主题终阶棋子" />
              <i class="home-island__prop home-island__prop--1"></i>
              <i class="home-island__prop home-island__prop--2"></i>
              <i class="home-island__prop home-island__prop--3"></i>
            </div>
          </div>
        </article>`;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <section class="home" id="home-screen" aria-label="主题选择">
        <div class="home__sky-glow"></div>
        <header class="home__brand">
          <div class="home__logo">双数对决</div>
          <div class="home__logo-sub">DOUBLE FIGHT · 3D 2048</div>
        </header>

        <div class="home__carousel" id="home-carousel">
          <div class="home__track" id="home-track">${islands}</div>
        </div>

        <div class="home__meta">
          <div class="home__kicker" id="home-kicker"></div>
          <h1 class="home__title" id="home-title"></h1>
          <div class="home__record" id="home-record"></div>
          <div class="home__dots" id="home-dots"></div>
          <button class="home__start" id="home-start" type="button">开始挑战</button>
          <button class="home__online" id="home-online" type="button" hidden disabled aria-hidden="true">在线对决</button>
          <div class="home__tip">左右滑动选择世界 · 合成至 11/11 登顶</div>
        </div>
      </section>`);

    this.root = container.querySelector('#home-screen') as HTMLElement;
    this.track = container.querySelector('#home-track') as HTMLElement;
    this.title = container.querySelector('#home-title') as HTMLElement;
    this.kicker = container.querySelector('#home-kicker') as HTMLElement;
    this.record = container.querySelector('#home-record') as HTMLElement;
    this.startButton = container.querySelector('#home-start') as HTMLButtonElement;
    this.onlineButton = container.querySelector('#home-online') as HTMLButtonElement;
    this.dots = container.querySelector('#home-dots') as HTMLElement;

    this.bind();
    this.render(false);
  }

  show(theme?: ThemeId): void {
    if (theme) {
      const next = CARDS.findIndex(card => card.id === theme);
      if (next >= 0) this.index = next;
    }
    this.root.classList.remove('home--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.render(false);
  }

  hide(): void {
    this.root.classList.add('home--hidden');
    this.root.setAttribute('aria-hidden', 'true');
  }

  onStart(handler: (theme: ThemeId) => void): void { this.onStartHandler = handler; }
  onOnline(handler: (theme: ThemeId) => void): void { this.onOnlineHandler = handler; }
  onPreview(handler: (theme: ThemeId) => void): void { this.onPreviewHandler = handler; }
  refreshRecord(): void { this.render(false); }

  private bind(): void {
    this.startButton.addEventListener('click', () => {
      const card = CARDS[this.index];
      this.onStartHandler?.(card.id);
    });

    // PvP stays wired for future reactivation, but the launch shell never exposes this button.
    this.onlineButton.addEventListener('click', () => {
      if (this.onlineButton.disabled) return;
      this.onOnlineHandler?.(CARDS[this.index].id);
    });

    this.root.addEventListener('pointerdown', event => { this.pointerStart = event.clientX; });
    this.root.addEventListener('pointerup', event => {
      if (this.pointerStart === null) return;
      const dx = event.clientX - this.pointerStart;
      this.pointerStart = null;
      if (Math.abs(dx) < 35) return;
      this.move(dx < 0 ? 1 : -1);
    });

    this.root.querySelectorAll<HTMLElement>('.home-island').forEach(item => {
      item.addEventListener('click', () => {
        const index = Number(item.dataset.index ?? 0);
        if (Number.isFinite(index) && index !== this.index) {
          this.index = index;
          this.render(true);
        }
      });
    });
  }

  private move(delta: number): void {
    this.index = (this.index + delta + CARDS.length) % CARDS.length;
    this.render(true);
  }

  private render(notify: boolean): void {
    this.track.style.transform = `translate3d(${-this.index * 100}%,0,0)`;
    const card = CARDS[this.index];
    const meta = THEMES[card.id];
    this.title.textContent = meta.label;
    this.kicker.textContent = meta.subtitle;
    this.startButton.disabled = false;
    this.startButton.textContent = '开始挑战';

    const best = Number(browserPlatform.storage.getItem(`doublefight-best-${card.id}`) ?? 0);
    const highest = Number(browserPlatform.storage.getItem(`doublefight-highest-${card.id}`) ?? 2);
    this.record.textContent = `${pieceName(card.id, highest)} · ${pieceTier(highest)}/11 · 最高分 ${best.toLocaleString('zh-CN')}`;
    if (notify) this.onPreviewHandler?.(card.id);

    this.dots.innerHTML = CARDS.map((_, index) =>
      `<i class="${index === this.index ? 'is-active' : ''}"></i>`,
    ).join('');

    this.root.dataset.theme = card.id;
  }
}
