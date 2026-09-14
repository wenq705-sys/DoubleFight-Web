import * as THREE from 'three';
import { Board2048 } from '../../../shared/game/Board2048';
import type { Direction } from '../../../shared/game/types';
import { TileFactory } from '../../../src/rendering/tiles/TileFactory';
import { fitTile, KINGDOM_SIZING } from '../../../src/rendering/tiles/TileSizingPolicy';
import type { DouyinApi, DouyinCanvas } from './api';

/** Gate 1 reuses the existing Kingdom tile factory and sizing, without a DOM scene or UI. */
export class DouyinBoardProbe {
  readonly board = new Board2048(() => 0.42);
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly tiles = new THREE.Group();
  private readonly factory = new TileFactory();

  constructor(api: DouyinApi, canvas: DouyinCanvas, context: WebGLRenderingContext) {
    // Three.js needs these canvas event hooks. This is a canvas-only shim, not a DOM facade.
    canvas.addEventListener ??= () => {};
    canvas.removeEventListener ??= () => {};
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, context, antialias: true });
    const info = api.getSystemInfoSync();
    const width = Math.max(1, info.screenWidth || canvas.width);
    const height = Math.max(1, info.screenHeight || canvas.height);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x244558);
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(-5.3, 5.3, 5.3 / aspect, -5.3 / aspect, 0.1, 60);
    this.camera.position.set(0, 13, 9);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff1c7, 0x365b65, 3));
    const light = new THREE.DirectionalLight(0xffd68c, 2);
    light.position.set(-4, 10, 7);
    this.scene.add(light);
    const boardBase = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.35, 9.5), new THREE.MeshStandardMaterial({ color: 0xb9864b }));
    boardBase.position.y = -0.27;
    this.scene.add(boardBase);
    const padGeometry = new THREE.BoxGeometry(1.9, 0.12, 1.9);
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0xeac897 });
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const pad = new THREE.Mesh(padGeometry, padMaterial);
      pad.position.set((col - 1.5) * 2.18, -0.02, (row - 1.5) * 2.18);
      this.scene.add(pad);
    }
    this.scene.add(this.tiles);
    this.board.reset();
    this.syncTiles();
    console.log(`[M2.9 gate1] WebGL ${context.getParameter(context.VERSION)}; Three.js ${THREE.REVISION}; ${width}x${height}`);
  }

  move(direction: Direction): boolean {
    const result = this.board.move(direction);
    if (result.changed) this.syncTiles();
    console.log(`[M2.9 gate2] ${direction} changed=${result.changed} score=${this.board.score} tiles=${this.board.tiles().length}`);
    return result.changed;
  }
  render(): void { this.renderer.render(this.scene, this.camera); }
  dispose(): void { this.renderer.dispose(); }

  private syncTiles(): void {
    this.tiles.clear();
    for (const tile of this.board.tiles()) {
      const visual = fitTile(this.factory.create(tile.value), tile.value, KINGDOM_SIZING);
      visual.root.position.set((tile.col - 1.5) * 2.18, 0.05, (tile.row - 1.5) * 2.18);
      this.tiles.add(visual.root);
    }
  }
}
