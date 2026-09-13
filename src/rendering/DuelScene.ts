import * as THREE from 'three';
import type { BoardTile, CellPosition, Direction } from '../../shared/index';
import type { ThemeId } from '../config/themes';
import { BattleBoardView } from './battle/BattleBoardView';
import { BattleFeedback } from '../battle/BattleFeedback';

type BoardRole = 'local' | 'remote';
/** Dual viewport only. Both players use the mature Solo board renderer and theme adapters. */
export class DuelScene {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
  private readonly clock = new THREE.Clock();
  readonly local: BattleBoardView;
  readonly remote: BattleBoardView;
  private active = false;
  private raf = 0;
  private readonly resizeObserver: ResizeObserver;
  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'duel-canvas';
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);


    const hemi = new THREE.HemisphereLight(0xfff4d6, 0x33525c, 2.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe1ab, 3.0);
    key.position.set(-4, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(768, 768);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8cccec, 1.15);
    fill.position.set(6, 7, -8);
    this.scene.add(fill);

    this.local = new BattleBoardView('kingdom', 'board', new BattleFeedback(), undefined, true);
    // Opponent uses the same sound language, but never vibrates the local device.
    this.remote = new BattleBoardView('kingdom', 'board', new BattleFeedback(undefined, () => {}), undefined, true);

    // Portrait composition: the local arena owns the lower action zone, opponent stays readable above.
    this.scene.add(this.local.root, this.remote.root);

    this.camera.position.set(0, 24, 12);
    this.camera.lookAt(0, 0.6, 0.18);

    this.local.prewarmTheme('kingdom');
    this.local.prewarmTheme('palace');
    window.addEventListener('resize', this.resize);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }


  setActive(active: boolean): void {
    this.active = active; this.canvas.style.visibility = active ? 'visible' : 'hidden';
    this.clock.getDelta();
  }
  setBoard(role: BoardRole, tiles: readonly BoardTile[], theme: ThemeId, immediate = false): void {
    const board = this[role];
    board.setTheme(theme);
    if (immediate) board.reset(tiles);
    else board.reconcile(tiles);
  }
  setBlockedCells(role: BoardRole, cells: readonly CellPosition[]): void { this[role].setStatus(cells); }
  pulseEnergy(role: BoardRole, gain: number): void { this[role].react(gain); }
  nudge(direction: Direction): void { this.local.rejectDirection(direction); }
  clear(): void { this.local.reset(); this.remote.reset(); }
  dispose(): void {
    cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.resize);
    this.resizeObserver.disconnect();
    this.local.dispose(); this.remote.dispose(); this.renderer.dispose(); this.canvas.remove();
  }
  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.parentElement?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, this.canvas.parentElement?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(width, height, false);
  };


  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate);
    const delta = Math.min(0.05, this.clock.getDelta());
    if (!this.active) return;
    this.local.update(delta); this.remote.update(delta);
    const size = this.renderer.getSize(new THREE.Vector2());
    const localHeight = Math.round(size.y * 0.55);
    this.renderer.setScissorTest(true);
    this.renderBoard('local', 0, size.x, localHeight);
    this.renderBoard('remote', localHeight, size.x, size.y - localHeight);
    this.renderer.setScissorTest(false);
    this.local.root.visible = this.remote.root.visible = true;
  };

  private renderBoard(role: BoardRole, bottom: number, width: number, height: number): void {
    this.local.root.visible = role === 'local';
    this.remote.root.visible = role === 'remote';
    // Fit the playable grid to its screen region. No per-player tile scaling.
    const aspect = width / Math.max(1, height);
    const viewHeight = Math.max(9.3, 9.5 / aspect);
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setViewport(0, bottom, width, height);
    this.renderer.setScissor(0, bottom, width, height);
    this.renderer.render(this.scene, this.camera);
  }
}
