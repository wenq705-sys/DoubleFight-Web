import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALACE_RANKS } from '../../config/themes';
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
};

type Palette = {
  robe: number;
  robeLight: number;
  accent: number;
  metal: number;
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

function sphere(parent: THREE.Object3D, radius: number, color: number, position: [number, number, number], segments = 14): THREE.Mesh {
  return mesh(parent, new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), toon(color), position);
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 16,
  metallic = false,
): THREE.Mesh {
  return mesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    metallic ? metal(color) : toon(color),
    position,
  );
}

function cone(parent: THREE.Object3D, radius: number, height: number, color: number, position: [number, number, number], segments = 14): THREE.Mesh {
  return mesh(parent, new THREE.ConeGeometry(radius, height, segments), toon(color), position);
}

function plaqueTexture(rank: string, value: number, prestige: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is required for palace rank plaques.');

  const background = prestige ? '#8c192b' : '#fff0c5';
  const border = prestige ? '#f6c84b' : '#9f5b28';
  const ink = prestige ? '#fff3c1' : '#4d2818';

  context.fillStyle = background;
  context.strokeStyle = border;
  context.lineWidth = 18;
  context.beginPath();
  context.roundRect(18, 18, 476, 264, 44);
  context.fill();
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 68px "PingFang SC","Microsoft YaHei",sans-serif';
  context.fillStyle = ink;
  context.fillText(rank, 256, 92);

  context.font = `1000 ${value >= 1024 ? 82 : 108}px ui-rounded,"Arial Rounded MT Bold",sans-serif`;
  context.lineWidth = 13;
  context.strokeStyle = prestige ? '#6d1222' : '#fff7dc';
  context.strokeText(String(value), 256, 205);
  context.fillStyle = prestige ? '#ffd86a' : '#5a2f1b';
  context.fillText(String(value), 256, 205);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function addRankPlaque(parent: THREE.Object3D, value: number, y: number): void {
  const prestige = value >= 32;
  rounded(parent, [1.26, 0.7, 0.09], prestige ? C.lacquer : C.ivory, [0, y, 0.77], 0.14, prestige);
  const material = new THREE.MeshBasicMaterial({
    map: plaqueTexture(PALACE_RANKS[value] ?? '凤仪', value, prestige),
    transparent: true,
    depthWrite: false,
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.69), material);
  label.position.set(0, y, 0.825);
  label.renderOrder = 30;
  parent.add(label);
}

function addHairOrnaments(parent: THREE.Object3D, palette: Palette, tier: number, animated: THREE.Object3D[]): void {
  const count = tier >= 8 ? 5 : tier >= 5 ? 3 : tier >= 3 ? 2 : 1;
  for (let index = 0; index < count; index += 1) {
    const x = (index - (count - 1) / 2) * 0.13;
    const gem = mesh(
      parent,
      new THREE.OctahedronGeometry(tier >= 7 ? 0.07 : 0.05, 0),
      metal(index % 2 ? palette.metal : C.gold),
      [x, 1.73 + (index % 2) * 0.045, 0.02],
    );
    gem.rotation.z = index * 0.22;
    if (tier >= 7 && index % 2 === 0) {
      gem.userData.tileAnimated = true;
      animated.push(gem);
    }
  }
}

function addCharacter(parent: THREE.Object3D, value: number, animated: THREE.Object3D[]): void {
  const tier = Math.max(1, Math.min(11, Math.round(Math.log2(value))));
  const palette = PALETTES[value] ?? PALETTES[2048];

  // Skirt and torso: exaggerated toy proportions for phone readability.
  cylinder(parent, 0.3, 0.55, 0.66, palette.robe, [0, 0.75, 0], 18);
  rounded(parent, [0.56, 0.5, 0.42], palette.robeLight, [0, 1.14, 0], 0.14);
  rounded(parent, [0.6, 0.11, 0.45], palette.accent, [0, 0.96, 0.02], 0.04);

  // Sleeves.
  const leftSleeve = cylinder(parent, 0.11, 0.18, 0.54, palette.robeLight, [-0.37, 1.08, 0.02], 12);
  leftSleeve.rotation.z = -0.42;
  const rightSleeve = cylinder(parent, 0.11, 0.18, 0.54, palette.robeLight, [0.37, 1.08, 0.02], 12);
  rightSleeve.rotation.z = 0.42;

  // Head / hair.
  sphere(parent, 0.28, C.skin, [0, 1.5, 0.02], 16);
  sphere(parent, 0.292, C.hair, [0, 1.58, -0.06], 16);
  // Face patch hides front of full hair sphere.
  sphere(parent, 0.245, C.skin, [0, 1.49, 0.12], 16);
  // Fringe.
  rounded(parent, [0.42, 0.12, 0.12], C.hair, [0, 1.68, 0.18], 0.055);

  // Hair buns become increasingly elaborate.
  sphere(parent, tier >= 6 ? 0.16 : 0.12, C.hair, [-0.18, 1.78, -0.02], 12);
  if (tier >= 3) sphere(parent, 0.14, C.hair, [0.18, 1.8, -0.02], 12);
  if (tier >= 7) {
    sphere(parent, 0.13, C.hair, [0, 1.9, -0.04], 12);
    const crownBar = rounded(parent, [0.72, 0.08, 0.1], palette.metal, [0, 1.84, 0.02], 0.03, true);
    crownBar.userData.tileAnimated = true;
    animated.push(crownBar);
  }
  addHairOrnaments(parent, palette, tier, animated);

  // Tiny eyes for character readability.
  for (const x of [-0.09, 0.09]) {
    const eye = sphere(parent, 0.026, 0x241313, [x, 1.52, 0.345], 8);
    eye.castShadow = false;
  }

  // Rank props.
  if (tier <= 3) {
    // Fan / broom silhouette.
    const prop = rounded(parent, [0.32, 0.22, 0.035], tier === 1 ? 0xb78c58 : C.ivory, [0.39, 1.0, 0.28], 0.05);
    prop.rotation.z = -0.25;
  } else if (tier <= 6) {
    const fan = new THREE.Group();
    fan.position.set(0.38, 1.02, 0.28);
    parent.add(fan);
    for (let i = 0; i < 5; i += 1) {
      const blade = rounded(fan, [0.08, 0.36, 0.025], i % 2 ? C.ivory : palette.metal, [(i - 2) * 0.052, 0, 0], 0.025);
      blade.rotation.z = (i - 2) * 0.13;
    }
  } else {
    // High ranks get shoulder ornaments and hanging beads.
    for (const x of [-0.43, 0.43]) {
      sphere(parent, 0.08, palette.metal, [x, 1.33, 0], 10);
      const tassel = cylinder(parent, 0.025, 0.035, 0.38, C.gold, [x, 1.12, 0.04], 8, true);
      tassel.userData.tileAnimated = true;
      animated.push(tassel);
    }
  }

  // Embroidery/gem center.
  const chestGem = mesh(
    parent,
    new THREE.OctahedronGeometry(tier >= 8 ? 0.11 : 0.075, 0),
    metal(palette.metal),
    [0, 1.18, 0.24],
  );
  if (tier >= 6) {
    chestGem.userData.tileAnimated = true;
    animated.push(chestGem);
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

  private build(value: number): TileVisual {
    const root = new THREE.Group();
    const animatedParts: THREE.Object3D[] = [];
    const prestige = value >= 32;

    cylinder(root, 0.83, 0.9, 0.15, prestige ? C.goldDeep : C.lacquerDark, [0, 0.08, 0], 20, prestige);
    cylinder(root, 0.76, 0.82, 0.1, prestige ? C.lacquer : C.jadeDark, [0, 0.2, 0], 20);
    rounded(root, [1.42, 0.11, 1.28], prestige ? C.lacquer : C.jade, [0, 0.29, 0], 0.14);

    addCharacter(root, value, animatedParts);
    addRankPlaque(root, value, 0.56);

    if (value >= 64) {
      const halo = mesh(root, new THREE.TorusGeometry(0.7, 0.025, 8, 36), metal(C.gold), [0, 1.26, -0.08]);
      halo.rotation.x = Math.PI / 2;
      halo.userData.tileAnimated = true;
      animatedParts.push(halo);
    }

    return { root, animatedParts };
  }
}
