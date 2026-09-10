export class Hud {
  readonly root: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly bestValue: HTMLElement;
  private readonly highestValue: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;

  constructor(container: HTMLElement) {
    container.insertAdjacentHTML('beforeend', `
      <div class="hud" aria-label="游戏状态">
        <div class="hud__brand"><div class="hud__title">双数对决</div><div class="hud__subtitle">MINIATURE KINGDOM · 2048</div></div>
        <button class="hud__new" id="new-game" type="button">↻ 新局</button>
        <div class="hud__stats">
          <div class="stat-card"><span>SCORE</span><strong id="score-value">0</strong></div>
          <div class="stat-card stat-card--secondary"><span>BEST</span><strong id="best-value">0</strong></div>
        </div>
        <div class="hud__highest">王国地标 <strong id="highest-value">4</strong></div>
        <div class="hud__hint">手机滑动 · 电脑方向键 / WASD</div>
        <div class="hud__toast" id="merge-toast">MERGE!</div>
      </div>
      <div class="game-over" id="game-over" role="dialog" aria-modal="true">
        <div class="game-over__card"><div class="game-over__crown">♛</div><h2>王国满员</h2><p>没有可移动的格子了，再建一座新王国吧。</p><button id="retry-game" type="button">再来一局</button></div>
      </div>`);
    this.root=container.querySelector('.hud') as HTMLElement;
    this.scoreValue=container.querySelector('#score-value') as HTMLElement;
    this.bestValue=container.querySelector('#best-value') as HTMLElement;
    this.highestValue=container.querySelector('#highest-value') as HTMLElement;
    this.toast=container.querySelector('#merge-toast') as HTMLElement;
    this.gameOver=container.querySelector('#game-over') as HTMLElement;
    this.restartButton=container.querySelector('#new-game') as HTMLButtonElement;
    this.retryButton=container.querySelector('#retry-game') as HTMLButtonElement;
  }

  setScore(score:number):void{this.scoreValue.textContent=score.toLocaleString('zh-CN');const best=Math.max(score,Number(localStorage.getItem('doublefight-best')??0));localStorage.setItem('doublefight-best',String(best));this.bestValue.textContent=best.toLocaleString('zh-CN');}
  setHighest(value:number):void{this.highestValue.textContent=String(value);}
  showMerge(value:number,chain:number):void{this.toast.textContent=value>=2048?'KINGDOM WONDER!':value>=1024?'ROYAL ASCENSION!':chain>=2?`COMBO ×${chain}`:'MERGE!';this.toast.classList.remove('hud__toast--show');void this.toast.offsetWidth;this.toast.classList.add('hud__toast--show');}
  showGameOver():void{this.gameOver.classList.add('game-over--show');}
  hideGameOver():void{this.gameOver.classList.remove('game-over--show');}
  onRestart(handler:()=>void):void{this.restartButton.addEventListener('click',handler);this.retryButton.addEventListener('click',handler);}
}
