import type { ThemeId } from '../config/themes';

type ThemeCard = {
  id: ThemeId | 'candy' | 'snow';
  title: string;
  kicker: string;
  icon: string;
  locked?: boolean;
};

const CARDS: ThemeCard[] = [
  { id: 'kingdom', title: '微缩王国', kicker: 'MINIATURE KINGDOM', icon: '🏰' },
  { id: 'palace', title: '后宫晋升', kicker: 'PALACE ASCENSION', icon: '🏯' },
  { id: 'candy', title: '糖果王国', kicker: 'COMING SOON', icon: '🍭', locked: true },
  { id: 'snow', title: '冰雪神殿', kicker: 'COMING SOON', icon: '❄️', locked: true },
];

export class HomeScreen {
  private readonly root: HTMLElement;
  private readonly track: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly record: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly dots: HTMLElement;
  private index = 0;
  private pointerStart: number | null = null;
  private onStartHandler: ((theme: ThemeId) => void) | null = null;
  private onPreviewHandler: ((theme: ThemeId) => void) | null = null;

  constructor(container: HTMLElement, initialTheme: ThemeId) {
    this.index = Math.max(0, CARDS.findIndex((card) => card.id === initialTheme));

    const islands = CARDS.map((card, index) => `
      <article class="home-island home-island--${card.id} ${card.locked ? 'home-island--locked' : ''}" data-index="${index}">
        <div class="home-island__cloud home-island__cloud--a"></div>
        <div class="home-island__cloud home-island__cloud--b"></div>
        <div class="home-island__land">
          <div class="home-island__rim"></div>
          <div class="home-island__world">
            <span class="home-island__icon">${card.icon}</span>
            <i class="home-island__prop home-island__prop--1"></i>
            <i class="home-island__prop home-island__prop--2"></i>
            <i class="home-island__prop home-island__prop--3"></i>
          </div>
        </div>
        ${card.locked ? '<div class="home-island__lock">🔒 即将开放</div>' : ''}
      </article>`).join('');

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
          <button class="home__start" id="home-start" type="button">进入世界</button>
          <div class="home__tip">左右滑动选择主题</div>
        </div>
      </section>`);

    this.root = container.querySelector('#home-screen') as HTMLElement;
    this.track = container.querySelector('#home-track') as HTMLElement;
    this.title = container.querySelector('#home-title') as HTMLElement;
    this.kicker = container.querySelector('#home-kicker') as HTMLElement;
    this.record = container.querySelector('#home-record') as HTMLElement;
    this.startButton = container.querySelector('#home-start') as HTMLButtonElement;
    this.dots = container.querySelector('#home-dots') as HTMLElement;

    this.bind();
    this.render(false);
  }

  show(theme?: ThemeId): void {
    if (theme) {
      const next = CARDS.findIndex((card) => card.id === theme);
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

  onStart(handler: (theme: ThemeId) => void): void {
    this.onStartHandler = handler;
  }

  onPreview(handler: (theme: ThemeId) => void): void {
    this.onPreviewHandler = handler;
  }

  refreshRecord(): void {
    this.render(false);
  }

  private bind(): void {
    this.startButton.addEventListener('click', () => {
      const card = CARDS[this.index];
      if (card.locked || (card.id !== 'kingdom' && card.id !== 'palace')) return;
      this.onStartHandler?.(card.id);
    });

    this.root.addEventListener('pointerdown', (event) => {
      this.pointerStart = event.clientX;
    });
    this.root.addEventListener('pointerup', (event) => {
      if (this.pointerStart === null) return;
      const dx = event.clientX - this.pointerStart;
      this.pointerStart = null;
      if (Math.abs(dx) < 35) return;
      this.move(dx < 0 ? 1 : -1);
    });

    this.root.querySelectorAll<HTMLElement>('.home-island').forEach((item) => {
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
    this.index = Math.max(0, Math.min(CARDS.length - 1, this.index + delta));
    this.render(true);
  }

  private render(notify: boolean): void {
    this.track.style.setProperty('--home-index', String(this.index));
    const card = CARDS[this.index];
    this.title.textContent = card.title;
    this.kicker.textContent = card.kicker;
    this.startButton.disabled = Boolean(card.locked);
    this.startButton.textContent = card.locked ? '即将开放' : '进入世界';

    if (card.id === 'kingdom' || card.id === 'palace') {
      const best = Number(localStorage.getItem(`doublefight-best-${card.id}`) ?? 0);
      const highest = Number(localStorage.getItem(`doublefight-highest-${card.id}`) ?? 2);
      this.record.textContent = `最高 ${highest}  ·  BEST ${best.toLocaleString('zh-CN')}`;
      if (notify) this.onPreviewHandler?.(card.id);
    } else {
      this.record.textContent = '新的主题世界正在制作中';
    }

    this.dots.innerHTML = CARDS.map((_, index) =>
      `<i class="${index === this.index ? 'is-active' : ''}"></i>`,
    ).join('');

    this.root.dataset.theme = String(card.id);
  }
}
