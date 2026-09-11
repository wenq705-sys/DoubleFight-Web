import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TileVisual } from './TileFactory';
import { tierScale } from '../../config/tierProgression';

const gradient = (() => {
  const data = new Uint8Array([38, 88, 154, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const C = {
  jade: 0x70b6a0,
  jadeDark: 0x356d65,
  lacquer: 0x8f1f24,
  lacquerDark: 0x55151a,
  gold: 0xf3bd48,
  goldDeep: 0xad6d16,
  ivory: 0xffdda5,
  hair: 0x241719,
  skin: 0xffd8c5,
  white: 0xfff1dd,
  black: 0x25191b,
};

type Palette = {
  robe: number;
  robeLight: number;
  accent: number;
  metal: number;
};

type TierProfile = {
  scale: number;
  skirtWidth: number;
  torsoWidth: number;
  sleeve: number;
  crown: number;
  cape: boolean;
  halo: boolean;
  throne: boolean;
  prop: 'tray' | 'fan' | 'openFan' | 'scepter' | 'none';
};

const PALETTES: Record<number, Palette> = {
  // Every tier uses a deliberately different hue family. Do not collapse these into
  // light/dark variants of the same hue: color is a primary gameplay identifier.
  2: { robe: 0x54c7b0, robeLight: 0xbce9dd, accent: 0x247b70, metal: 0xb99861 },       // mint / teal
  4: { robe: 0xf2c94c, robeLight: 0xffe9a6, accent: 0xc97826, metal: 0xd8a63b },       // amber / yellow
  8: { robe: 0x9a72df, robeLight: 0xd8c8f4, accent: 0x5d3ca7, metal: 0xd9b04c },       // violet
  16: { robe: 0xf08a3e, robeLight: 0xffc08b, accent: 0xb64c24, metal: 0xe0b044 },      // orange
  32: { robe: 0xd9414f, robeLight: 0xf28b91, accent: 0x8b2034, metal: 0xe8ba46 },      // true red
  64: { robe: 0x3f78d7, robeLight: 0x93b5ef, accent: 0x234a99, metal: 0xf0c24d },      // sapphire blue
  128: { robe: 0x3fa66a, robeLight: 0x8bd0a4, accent: 0x216b45, metal: 0xf1c44f },     // emerald green
  256: { robe: 0xd052a5, robeLight: 0xea9dcc, accent: 0x792b78, metal: 0xf2c752 },     // magenta
  512: { robe: 0x303744, robeLight: 0x68717f, accent: 0xc49a36, metal: 0xffd45a },     // obsidian / gold
  1024: { robe: 0xf1eee2, robeLight: 0xffffff, accent: 0x59a7b8, metal: 0xf4cf62 },    // ivory / cyan
  2048: { robe: 0xf0c642, robeLight: 0xffe991, accent: 0xb26b1e, metal: 0xffe06a },    // sacred gold
};

const PROFILES: Record<number, TierProfile> = {
  // Size progression is a cross-theme gameplay rule: every higher tier is physically larger.
  2: { scale: 0.70, skirtWidth: 0.40, torsoWidth: 0.43, sleeve: 0.14, crown: 0, cape: false, halo: false, throne: false, prop: 'tray' },
  4: { scale: 0.79, skirtWidth: 0.47, torsoWidth: 0.48, sleeve: 0.20, crown: 2, cape: false, halo: false, throne: false, prop: 'fan' },
  8: { scale: 0.88, skirtWidth: 0.54, torsoWidth: 0.52, sleeve: 0.26, crown: 3, cape: false, halo: false, throne: false, prop: 'openFan' },
  16: { scale: 0.97, skirtWidth: 0.61, torsoWidth: 0.57, sleeve: 0.32, crown: 4, cape: false, halo: false, throne: false, prop: 'openFan' },
  32: { scale: 1.04, skirtWidth: 0.66, torsoWidth: 0.60, sleeve: 0.35, crown: 5, cape: false, halo: false, throne: false, prop: 'scepter' },
  64: { scale: 1.10, skirtWidth: 0.70, torsoWidth: 0.63, sleeve: 0.37, crown: 6, cape: false, halo: true, throne: false, prop: 'scepter' },
  128: { scale: 1.16, skirtWidth: 0.74, torsoWidth: 0.66, sleeve: 0.39, crown: 7, cape: true, halo: true, throne: false, prop: 'openFan' },
  256: { scale: 1.22, skirtWidth: 0.78, torsoWidth: 0.69, sleeve: 0.41, crown: 8, cape: true, halo: true, throne: false, prop: 'scepter' },
  512: { scale: 1.28, skirtWidth: 0.82, torsoWidth: 0.72, sleeve: 0.43, crown: 9, cape: true, halo: true, throne: false, prop: 'scepter' },
  1024: { scale: 1.34, skirtWidth: 0.86, torsoWidth: 0.75, sleeve: 0.45, crown: 10, cape: true, halo: true, throne: true, prop: 'none' },
  2048: { scale: 1.40, skirtWidth: 0.90, torsoWidth: 0.78, sleeve: 0.47, crown: 11, cape: true, halo: true, throne: true, prop: 'none' },
};

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const metal = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.58 });

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}

function rounded(
  parent: THREE.Object3D,
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  radius = 0.08,
  metallic = false,
): THREE.Mesh {
  return mesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(radius, size[1] * 0.32)),
    metallic ? metal(color) : toon(color),
    position,
  );
}

function sphere(
  parent: THREE.Object3D,
  radius: number,
  color: number,
  position: [number, number, number],
  segments = 12,
): THREE.Mesh {
  return mesh(parent, new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), toon(color), position);
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 14,
  metallic = false,
): THREE.Mesh {
  return mesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    metallic ? metal(color) : toon(color),
    position,
  );
}

function addFace(parent: THREE.Object3D): void {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 128, 96);
  ctx.fillStyle = '#281718';
  ctx.beginPath();
  ctx.arc(42, 42, 8, 0, Math.PI * 2);
  ctx.arc(86, 42, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b35b5f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 62, 16, 0.15, Math.PI - 0.15);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.25),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.position.set(0, 1.5, 0.272);
  plane.renderOrder = 20;
  parent.add(plane);
}

function addCrown(parent: THREE.Object3D, palette: Palette, profile: TierProfile, animated: THREE.Object3D[]): void {
  if (profile.crown <= 0) return;

  const width = 0.3 + profile.crown * 0.055;
  const bar = rounded(parent, [width, 0.075, 0.08], palette.metal, [0, 1.83 + profile.crown * 0.012, 0.015], 0.025, true);
  if (profile.crown >= 5) {
    bar.userData.tileAnimated = true;
    animated.push(bar);
  }

  const gemCount = Math.min(5, 1 + Math.floor(profile.crown / 2));
  for (let index = 0; index < gemCount; index += 1) {
    const x = (index - (gemCount - 1) / 2) * 0.13;
    const gem = mesh(
      parent,
      new THREE.OctahedronGeometry(0.045 + profile.crown * 0.004, 0),
      metal(index % 2 ? C.gold : palette.metal),
      [x, 1.9 + (index % 2) * 0.055 + profile.crown * 0.008, 0.02],
    );
    if (profile.crown >= 6 && index % 2 === 0) {
      gem.userData.tileAnimated = true;
      animated.push(gem);
    }
  }

  if (profile.crown >= 7) {
    for (const x of [-width * 0.42, width * 0.42]) {
      const tassel = cylinder(parent, 0.018, 0.024, 0.32, C.gold, [x, 1.72, 0.025], 7, true);
      tassel.userData.tileAnimated = true;
      animated.push(tassel);
    }
  }
}

function addProp(parent: THREE.Object3D, profile: TierProfile, palette: Palette): void {
  if (profile.prop === 'tray') {
    const tray = cylinder(parent, 0.31, 0.31, 0.045, 0xb98d56, [0.35, 1.0, 0.34], 12);
    tray.rotation.z = -0.18;
    return;
  }

  if (profile.prop === 'fan') {
    const fan = rounded(parent, [0.42, 0.33, 0.045], C.ivory, [0.39, 1.05, 0.34], 0.07);
    fan.rotation.z = -0.3;
    return;
  }

  if (profile.prop === 'openFan') {
    const fan = new THREE.Group();
    fan.position.set(0.40, 1.04, 0.36);
    parent.add(fan);
    for (let i = 0; i < 4; i += 1) {
      const blade = rounded(fan, [0.09, 0.46, 0.032], i % 2 ? C.ivory : palette.metal, [(i - 1.5) * 0.064, 0, 0], 0.026);
      blade.rotation.z = (i - 1.5) * 0.16;
    }
    return;
  }

  if (profile.prop === 'scepter') {
    const staff = cylinder(parent, 0.025, 0.035, 0.58, C.goldDeep, [0.36, 1.04, 0.25], 8, true);
    staff.rotation.z = -0.28;
    mesh(parent, new THREE.OctahedronGeometry(0.08, 0), metal(palette.metal), [0.49, 1.3, 0.29]);
  }
}

function addCharacter(parent: THREE.Object3D, value: number, animated: THREE.Object3D[]): void {
  const palette = PALETTES[value] ?? PALETTES[2048];
  const profile = PROFILES[value] ?? PROFILES[2048];
  const character = new THREE.Group();
  character.scale.setScalar(tierScale(value, 0.70, 1.40));
  character.position.y = 0.02;
  parent.add(character);

  if (profile.throne) {
    rounded(character, [1.0, 0.13, 0.7], C.goldDeep, [0, 0.41, -0.08], 0.07, true);
    rounded(character, [0.82, 0.92, 0.12], palette.accent, [0, 1.05, -0.26], 0.08);
    for (const x of [-0.42, 0.42]) {
      cylinder(character, 0.055, 0.07, 1.15, C.gold, [x, 1.15, -0.24], 9, true);
    }
  }

  if (profile.cape) {
    const cape = rounded(character, [0.9, 0.88, 0.1], palette.accent, [0, 1.0, -0.22], 0.12);
    cape.rotation.x = -0.12;
  }

  cylinder(character, 0.3, profile.skirtWidth, 0.72, palette.robe, [0, 0.77, 0], 16);
  rounded(character, [profile.torsoWidth, 0.52, 0.42], palette.robeLight, [0, 1.16, 0], 0.14);
  rounded(character, [profile.torsoWidth + 0.05, 0.1, 0.43], palette.accent, [0, 0.98, 0.02], 0.04);

  const leftSleeve = cylinder(character, 0.1, profile.sleeve, 0.58, palette.robeLight, [-0.38, 1.09, 0.02], 12);
  leftSleeve.rotation.z = -0.46;
  const rightSleeve = cylinder(character, 0.1, profile.sleeve, 0.58, palette.robeLight, [0.38, 1.09, 0.02], 12);
  rightSleeve.rotation.z = 0.46;

  sphere(character, 0.28, C.skin, [0, 1.52, 0.02], 14);
  sphere(character, 0.292, C.hair, [0, 1.61, -0.065], 14);
  sphere(character, 0.245, C.skin, [0, 1.51, 0.13], 14);
  rounded(character, [0.42, 0.11, 0.11], C.hair, [0, 1.7, 0.18], 0.05);

  const bunSize = profile.crown >= 6 ? 0.16 : 0.12;
  if (value === 2) {
    // Palace maid: one low bun and an intentionally plain silhouette.
    sphere(character, 0.13, C.hair, [0, 1.78, -0.08], 10);
  } else if (value === 4) {
    // Daying: obvious twin buns, readable even as a black silhouette.
    sphere(character, 0.15, C.hair, [-0.22, 1.79, -0.02], 10);
    sphere(character, 0.15, C.hair, [0.22, 1.79, -0.02], 10);
  } else if (value === 8) {
    // Changzai: tall center bun plus long lateral hairpins.
    sphere(character, 0.18, C.hair, [0, 1.89, -0.04], 11);
    const pinLeft = rounded(character, [0.42, 0.055, 0.055], palette.metal, [-0.22, 1.91, 0.01], 0.018, true);
    pinLeft.rotation.z = 0.18;
    const pinRight = rounded(character, [0.42, 0.055, 0.055], palette.metal, [0.22, 1.91, 0.01], 0.018, true);
    pinRight.rotation.z = -0.18;
  } else {
    sphere(character, bunSize, C.hair, [-0.2, 1.82, -0.02], 10);
    sphere(character, bunSize, C.hair, [0.2, 1.82, -0.02], 10);
    if (value >= 16) {
      // Noble tiers gain a tall center crest.
      sphere(character, 0.15 + Math.min(0.04, Math.log2(value) * 0.003), C.hair, [0, 1.95, -0.04], 10);
    }
  }

  addFace(character);
  addCrown(character, palette, profile, animated);
  addProp(character, profile, palette);

  if (value >= 32) {
    for (const x of [-0.43, 0.43]) {
      sphere(character, 0.075 + Math.min(0.04, Math.log2(value) * 0.004), palette.metal, [x, 1.34, 0], 9);
    }
  }

  if (value >= 16) {
    const shoulderWidth = value >= 128 ? 0.34 : value >= 64 ? 0.30 : 0.27;
    for (const side of [-1, 1]) {
      const shoulder = rounded(
        character,
        [shoulderWidth, 0.16, 0.32],
        value >= 32 ? palette.metal : palette.accent,
        [side * 0.43, 1.35, 0.02],
        0.06,
        value >= 32,
      );
      shoulder.rotation.z = side * -0.12;
    }
  }

  if (value === 16) {
    // First unmistakably noble silhouette: wide ceremonial back fan.
    const backFan = new THREE.Group();
    backFan.position.set(0, 1.52, -0.20);
    character.add(backFan);
    for (let i = 0; i < 5; i += 1) {
      const rib = rounded(backFan, [0.09, 0.66, 0.035], i % 2 ? palette.metal : palette.accent, [(i - 2) * 0.12, 0, 0], 0.025);
      rib.rotation.z = (i - 2) * 0.18;
    }
  }

  const chestGem = mesh(
    character,
    new THREE.OctahedronGeometry(value >= 256 ? 0.1 : 0.07, 0),
    metal(palette.metal),
    [0, 1.2, 0.24],
  );
  if (value >= 64) {
    chestGem.userData.tileAnimated = true;
    animated.push(chestGem);
  }

  if (profile.halo) {
    const halo = mesh(character, new THREE.TorusGeometry(value >= 512 ? 0.72 : 0.62, 0.025, 8, 32), metal(C.gold), [0, 1.28, -0.18]);
    halo.rotation.x = Math.PI / 2;
    halo.userData.tileAnimated = true;
    animated.push(halo);
  }

  if (value >= 1024) {
    for (const side of [-1, 1]) {
      const wing = rounded(character, [0.62, 0.08, 0.22], C.gold, [side * 0.58, 1.58, -0.1], 0.03, true);
      wing.rotation.z = side * 0.42;
      wing.userData.tileAnimated = true;
      animated.push(wing);
    }
  }

  if (value >= 2048) {
    const crownHalo = mesh(character, new THREE.TorusGeometry(0.83, 0.045, 8, 36), metal(C.gold), [0, 1.95, -0.16]);
    crownHalo.rotation.x = Math.PI / 2;
    crownHalo.userData.tileAnimated = true;
    animated.push(crownHalo);
  }
}

export class PalaceTileFactory {
  private readonly templates = new Map<number, THREE.Group>();

  create(value: number): TileVisual {
    let template = this.templates.get(value);
    if (!template) {
      const built = this.build(value);
      built.animatedParts.forEach((part) => { part.userData.tileAnimated = true; });
      template = built.root;
      this.templates.set(value, template);
    }

    const root = template.clone(true);
    const animatedParts: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.tileAnimated) animatedParts.push(node);
      if (node instanceof THREE.Mesh) node.frustumCulled = true;
    });
    return { root, animatedParts };
  }

  warmup(values: number[]): void {
    values.forEach((value) => {
      if (!this.templates.has(value)) {
        const built = this.build(value);
        built.animatedParts.forEach((part) => { part.userData.tileAnimated = true; });
        this.templates.set(value, built.root);
      }
    });
  }

  private build(value: number): TileVisual {
    const root = new THREE.Group();
    const animatedParts: THREE.Object3D[] = [];
    const prestige = value >= 32;
    const palette = PALETTES[value] ?? PALETTES[2048];
    const profile = PROFILES[value] ?? PROFILES[2048];
    const tier = Math.max(1, Math.log2(value));
    const baseOuter = Math.min(0.87, 0.61 + tier * 0.026);
    const baseSize = Math.min(1.50, 1.04 + tier * 0.043);

    cylinder(root, baseOuter, baseOuter + 0.08, 0.13, prestige ? C.goldDeep : palette.accent, [0, 0.07, 0], 18, prestige);
    cylinder(root, baseOuter - 0.07, baseOuter, 0.09, prestige ? palette.metal : palette.accent, [0, 0.18, 0], 18, prestige);
    rounded(
      root,
      [baseSize, 0.09, baseSize * 0.93],
      palette.robe,
      [0, 0.27, 0],
      0.12,
      value >= 512,
    );

    // The base grows more subtly than the character so pieces stay inside a 4x4 cell.
    root.userData.tierScale = tierScale(value, 0.70, 1.40);

    addCharacter(root, value, animatedParts);

    return { root, animatedParts };
  }
}
