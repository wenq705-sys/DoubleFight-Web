import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TileVisual } from './TileFactory';

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
  2: { robe: 0xc7ddd8, robeLight: 0xe9f2ec, accent: 0x6f8791, metal: 0xc7a76a },
  4: { robe: 0xa9d3b5, robeLight: 0xdcebd0, accent: 0x4f9a79, metal: 0xd2ad58 },
  8: { robe: 0xc3b2e7, robeLight: 0xe3d8f3, accent: 0x8b65bd, metal: 0xd9b052 },
  16: { robe: 0xf0a082, robeLight: 0xf7c5a9, accent: 0xc6544b, metal: 0xdfb34b },
  32: { robe: 0xd85258, robeLight: 0xf08a79, accent: 0x9e2e3d, metal: 0xe9bd4b },
  64: { robe: 0xc92535, robeLight: 0xe95e59, accent: 0x7d1830, metal: 0xf2c34c },
  128: { robe: 0x8d3f9f, robeLight: 0xc174bd, accent: 0x612a78, metal: 0xf2c34c },
  256: { robe: 0x253f75, robeLight: 0x597eb2, accent: 0x9b2237, metal: 0xf2c34c },
  512: { robe: 0x9b1828, robeLight: 0xd33839, accent: 0x1c1a2d, metal: 0xffd251 },
  1024: { robe: 0x51182a, robeLight: 0x9b2444, accent: 0x18182d, metal: 0xffd65e },
  2048: { robe: 0xc0262d, robeLight: 0xf05a43, accent: 0x16151d, metal: 0xffde6b },
};

const PROFILES: Record<number, TierProfile> = {
  2: { scale: 0.78, skirtWidth: 0.46, torsoWidth: 0.48, sleeve: 0.18, crown: 0, cape: false, halo: false, throne: false, prop: 'tray' },
  4: { scale: 0.81, skirtWidth: 0.49, torsoWidth: 0.5, sleeve: 0.2, crown: 1, cape: false, halo: false, throne: false, prop: 'fan' },
  8: { scale: 0.85, skirtWidth: 0.53, torsoWidth: 0.52, sleeve: 0.22, crown: 2, cape: false, halo: false, throne: false, prop: 'openFan' },
  16: { scale: 0.9, skirtWidth: 0.57, torsoWidth: 0.55, sleeve: 0.26, crown: 2, cape: false, halo: false, throne: false, prop: 'openFan' },
  32: { scale: 0.96, skirtWidth: 0.62, torsoWidth: 0.58, sleeve: 0.3, crown: 3, cape: false, halo: false, throne: false, prop: 'scepter' },
  64: { scale: 1.0, skirtWidth: 0.66, torsoWidth: 0.6, sleeve: 0.32, crown: 4, cape: false, halo: true, throne: false, prop: 'scepter' },
  128: { scale: 1.04, skirtWidth: 0.7, torsoWidth: 0.62, sleeve: 0.34, crown: 5, cape: true, halo: true, throne: false, prop: 'openFan' },
  256: { scale: 1.08, skirtWidth: 0.74, torsoWidth: 0.64, sleeve: 0.36, crown: 6, cape: true, halo: true, throne: false, prop: 'scepter' },
  512: { scale: 1.12, skirtWidth: 0.78, torsoWidth: 0.67, sleeve: 0.38, crown: 7, cape: true, halo: true, throne: false, prop: 'scepter' },
  1024: { scale: 1.17, skirtWidth: 0.82, torsoWidth: 0.7, sleeve: 0.4, crown: 8, cape: true, halo: true, throne: true, prop: 'none' },
  2048: { scale: 1.22, skirtWidth: 0.86, torsoWidth: 0.72, sleeve: 0.42, crown: 9, cape: true, halo: true, throne: true, prop: 'none' },
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

function numberTexture(value: number, prestige: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is required for palace number badges.');

  context.clearRect(0, 0, 192, 192);
  context.beginPath();
  context.arc(96, 96, 78, 0, Math.PI * 2);
  context.fillStyle = prestige ? '#8e2025' : '#fff0c5';
  context.fill();
  context.lineWidth = 12;
  context.strokeStyle = prestige ? '#ffd45e' : '#9c5a2d';
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `1000 ${value >= 1024 ? 66 : value >= 128 ? 78 : 88}px ui-rounded,"Arial Rounded MT Bold",sans-serif`;
  context.lineWidth = 8;
  context.strokeStyle = prestige ? '#5a1019' : '#fff8e1';
  context.strokeText(String(value), 96, 101);
  context.fillStyle = prestige ? '#ffe07b' : '#542d1c';
  context.fillText(String(value), 96, 101);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function addNumberMedallion(parent: THREE.Object3D, value: number): void {
  const prestige = value >= 32;
  const base = cylinder(
    parent,
    0.2,
    0.23,
    0.07,
    prestige ? C.goldDeep : C.ivory,
    [0.48, 0.42, 0.48],
    18,
    prestige,
  );
  base.rotation.x = Math.PI / 2;

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.38),
    new THREE.MeshBasicMaterial({
      map: numberTexture(value, prestige),
      transparent: true,
      depthWrite: false,
    }),
  );
  label.position.set(0.48, 0.42, 0.523);
  label.renderOrder = 30;
  parent.add(label);
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
    const tray = cylinder(parent, 0.22, 0.22, 0.035, 0xb98d56, [0.34, 1.0, 0.25], 12);
    tray.rotation.z = -0.18;
    return;
  }

  if (profile.prop === 'fan') {
    const fan = rounded(parent, [0.3, 0.24, 0.035], C.ivory, [0.36, 1.05, 0.26], 0.05);
    fan.rotation.z = -0.3;
    return;
  }

  if (profile.prop === 'openFan') {
    const fan = new THREE.Group();
    fan.position.set(0.38, 1.03, 0.28);
    parent.add(fan);
    for (let i = 0; i < 4; i += 1) {
      const blade = rounded(fan, [0.07, 0.34, 0.025], i % 2 ? C.ivory : palette.metal, [(i - 1.5) * 0.052, 0, 0], 0.022);
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
  character.scale.setScalar(profile.scale);
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
  sphere(character, bunSize, C.hair, [-0.19, 1.8, -0.02], 10);
  if (value >= 4) sphere(character, bunSize, C.hair, [0.19, 1.82, -0.02], 10);
  if (value >= 64) sphere(character, 0.13, C.hair, [0, 1.92, -0.04], 10);

  addFace(character);
  addCrown(character, palette, profile, animated);
  addProp(character, profile, palette);

  if (value >= 32) {
    for (const x of [-0.43, 0.43]) {
      sphere(character, 0.075 + Math.min(0.04, Math.log2(value) * 0.004), palette.metal, [x, 1.34, 0], 9);
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

    cylinder(root, 0.78, 0.86, 0.13, prestige ? C.goldDeep : C.lacquerDark, [0, 0.07, 0], 18, prestige);
    cylinder(root, 0.71, 0.78, 0.09, prestige ? C.lacquer : C.jadeDark, [0, 0.18, 0], 18);
    rounded(root, [1.34, 0.09, 1.24], prestige ? C.lacquer : C.jade, [0, 0.27, 0], 0.12);

    addCharacter(root, value, animatedParts);
    addNumberMedallion(root, value);

    return { root, animatedParts };
  }
}
