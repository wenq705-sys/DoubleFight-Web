import * as THREE from 'three';
import { tierScale } from '../../config/tierProgression';
import type { TileVisual } from './TileFactory';

const gradient = (() => {
  const data = new Uint8Array([40, 118, 180, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
})();

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
const metal = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.28,
  metalness: 0.46,
  ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.42 } : {}),
});
const glossy = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.18,
  metalness: 0.06,
  ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.28 } : {}),
});
const soft = (color: number) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.58,
  metalness: 0.02,
});

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}
const sphere = (p: THREE.Object3D, r: number, c: number, pos: [number, number, number], seg = 10) =>
  mesh(p, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), toon(c), pos);
const box = (p: THREE.Object3D, size: [number, number, number], c: number, pos: [number, number, number], metallic = false) =>
  mesh(p, new THREE.BoxGeometry(...size), metallic ? metal(c) : toon(c), pos);
const cylinder = (p: THREE.Object3D, rt: number, rb: number, h: number, c: number, pos: [number, number, number], seg = 10, metallic = false) =>
  mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg), metallic ? metal(c) : toon(c), pos);
const cone = (p: THREE.Object3D, r: number, h: number, c: number, pos: [number, number, number], seg = 10) =>
  mesh(p, new THREE.ConeGeometry(r, h, seg), toon(c), pos);
const torus = (p: THREE.Object3D, r: number, tube: number, c: number, pos: [number, number, number], metallic = false) =>
  mesh(p, new THREE.TorusGeometry(r, tube, 8, 28), metallic ? metal(c) : glossy(c), pos);
const orb = (p: THREE.Object3D, r: number, c: number, pos: [number, number, number], emissive = 0) =>
  mesh(p, new THREE.SphereGeometry(r, 12, 9), glossy(c, emissive), pos);

function addEyes(parent: THREE.Object3D, y: number, z: number, spread = 0.12): void {
  for (const x of [-spread, spread]) orb(parent, 0.045, 0x251d1b, [x, y, z]);
}

function addPedestal(parent: THREE.Object3D, upper: number, lower: number, elite = false): void {
  cylinder(parent, 0.83, 0.92, 0.12, lower, [0, 0.06, 0], 20, elite);
  cylinder(parent, 0.72, 0.78, 0.12, upper, [0, 0.17, 0], 20, elite);
  const trim = torus(parent, 0.72, 0.035, elite ? 0xf4ce66 : 0xe7bd72, [0, 0.23, 0], true);
  trim.rotation.x = Math.PI / 2;
}

type Builder = (value: number) => TileVisual;

class CachedLaunchFactory {
  private readonly templates = new Map<number, THREE.Group>();
  constructor(private readonly builder: Builder) {}

  create(value: number): TileVisual {
    let template = this.templates.get(value);
    if (!template) {
      const built = this.builder(value);
      built.animatedParts.forEach(part => { part.userData.tileAnimated = true; });
      template = built.root;
      this.templates.set(value, template);
    }
    const root = template.clone(true);
    const animatedParts: THREE.Object3D[] = [];
    root.traverse(node => {
      if (node.userData.tileAnimated) animatedParts.push(node);
      if (node instanceof THREE.Mesh) node.frustumCulled = true;
    });
    return { root, animatedParts };
  }

  warmup(values: number[]): void {
    values.forEach(value => {
      if (this.templates.has(value)) return;
      const built = this.builder(value);
      built.animatedParts.forEach(part => { part.userData.tileAnimated = true; });
      this.templates.set(value, built.root);
    });
  }
}

const ZODIAC = {
  2: { body: 0x9c8d82, accent: 0xf2c4aa, kind: 'rat' },
  4: { body: 0xc94d3d, accent: 0xf2bd47, kind: 'rooster' },
  8: { body: 0xe7dfca, accent: 0xa88d70, kind: 'goat' },
  16: { body: 0xb56f46, accent: 0xf0c087, kind: 'monkey' },
  32: { body: 0xb98352, accent: 0x463428, kind: 'dog' },
  64: { body: 0x6e5149, accent: 0xe0b292, kind: 'boar' },
  128: { body: 0x3e8e72, accent: 0xe4c753, kind: 'snake' },
  256: { body: 0x8d4a35, accent: 0x2f2522, kind: 'horse' },
  512: { body: 0x5c4a3b, accent: 0xe6c256, kind: 'ox' },
  1024: { body: 0xf0ede3, accent: 0xd79b35, kind: 'tiger' },
  2048: { body: 0xd34b37, accent: 0xf2c64b, kind: 'dragon' },
} as const;

function buildZodiac(value: number): TileVisual {
  const cfg = ZODIAC[value as keyof typeof ZODIAC] ?? ZODIAC[2048];
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  const elite = value >= 512;
  addPedestal(root, elite ? 0x244f46 : 0x77382f, elite ? 0x6f241f : 0x4b2e26, elite);

  const armor = (y: number, scale = 1): void => {
    const chest = torus(root, 0.37 * scale, 0.065, elite ? 0xf0c452 : 0xd9a64c, [0, y, 0.03], true);
    chest.rotation.x = Math.PI / 2;
    box(root, [0.18 * scale, 0.12, 0.08], 0x2d7564, [0, y + 0.02, 0.38], true);
  };

  if (cfg.kind === 'snake') {
    const coil = torus(root, 0.47, 0.15, cfg.body, [0, 0.55, 0]);
    coil.rotation.x = Math.PI / 2;
    sphere(root, 0.30, cfg.body, [0.22, 0.98, 0.20], 12);
    for (const side of [-1, 1]) {
      const hood = sphere(root, 0.19, cfg.accent, [side * 0.18, 0.98, 0.05], 9);
      hood.scale.set(0.75, 1.1, 0.45);
    }
    addEyes(root, 1.03, 0.46, 0.09);
    armor(0.73, .82);
  } else if (cfg.kind === 'dragon') {
    for (let i = 0; i < 6; i += 1) {
      const part = orb(root, 0.31 - i * 0.018, i % 2 ? 0xc73f32 : cfg.body, [-0.55 + i * 0.21, 0.63 + Math.sin(i * 0.9) * 0.14, -0.24 + i * 0.10], cfg.body);
      part.userData.tileAnimated = true;
      animatedParts.push(part);
    }
    orb(root, 0.39, cfg.body, [0.48, 1.05, 0.30], cfg.body);
    sphere(root, 0.25, 0xf3b442, [0.48, 0.98, 0.52], 10);
    addEyes(root, 1.12, 0.62, 0.13);
    for (const x of [0.26, 0.70]) {
      const horn = cone(root, 0.085, 0.52, 0xf4d27a, [x, 1.50, 0.20], 8);
      horn.rotation.z = x < 0.5 ? -0.30 : 0.30;
    }
    for (const side of [-1, 1]) {
      const whisker = torus(root, 0.38, 0.018, 0xf5d16b, [0.50, 0.98, 0.44 + side * 0.03], true);
      whisker.rotation.z = side * 0.52;
      whisker.userData.tileAnimated = true;
      animatedParts.push(whisker);
    }
    const crown = torus(root, 0.82, 0.045, 0xffd15a, [0, 0.96, -0.34], true);
    crown.rotation.x = Math.PI / 2;
    crown.userData.tileAnimated = true;
    animatedParts.push(crown);
  } else {
    const bodyScale = value >= 512 ? 0.55 : value >= 64 ? 0.50 : 0.45;
    sphere(root, bodyScale, cfg.body, [0, 0.74, -0.08], 12);
    sphere(root, bodyScale * 0.72, cfg.body, [0, 1.18, 0.26], 11);
    addEyes(root, 1.23, 0.52, 0.12);

    if (cfg.kind === 'rat' || cfg.kind === 'monkey') {
      for (const x of [-0.27, 0.27]) sphere(root, cfg.kind === 'rat' ? 0.16 : 0.19, cfg.accent, [x, 1.39, 0.18], 9);
    }
    if (cfg.kind === 'dog') {
      for (const x of [-0.28, 0.28]) {
        const ear = cone(root, 0.15, 0.43, cfg.accent, [x, 1.42, 0.19], 7);
        ear.rotation.z = x < 0 ? 0.34 : -0.34;
      }
    }
    if (cfg.kind === 'rooster') {
      for (const x of [-0.12, 0, 0.12]) sphere(root, 0.11, 0xe64c3b, [x, 1.56 + (x === 0 ? .05 : 0), 0.18], 8);
      const beak = cone(root, 0.11, 0.30, 0xf0b431, [0, 1.19, 0.59], 7);
      beak.rotation.x = Math.PI / 2;
      for (let i = -1; i <= 1; i += 1) {
        const feather = cone(root, 0.13, 0.68, i === 0 ? 0x286d78 : cfg.accent, [i * 0.15, 0.97, -0.57], 8);
        feather.rotation.x = -0.68;
      }
    }
    if (cfg.kind === 'goat' || cfg.kind === 'ox') {
      for (const side of [-1, 1]) {
        const horn = cone(root, cfg.kind === 'ox' ? 0.13 : 0.095, cfg.kind === 'ox' ? 0.62 : 0.46, cfg.accent, [side * 0.31, 1.52, 0.18], 9);
        horn.rotation.z = side * -0.58;
      }
    }
    if (cfg.kind === 'horse') {
      for (const x of [-0.19, 0.19]) cone(root, 0.105, 0.35, cfg.body, [x, 1.52, 0.19], 8);
      for (let i = 0; i < 5; i += 1) sphere(root, 0.105, cfg.accent, [0, 1.43 - i * 0.15, -0.19], 8);
    }
    if (cfg.kind === 'boar') {
      for (const x of [-0.23, 0.23]) {
        const tusk = cone(root, 0.06, 0.29, 0xf5e3bf, [x, 1.12, 0.61], 8);
        tusk.rotation.x = Math.PI / 2;
      }
    }
    if (cfg.kind === 'tiger') {
      for (const x of [-0.21, 0.21]) cone(root, 0.13, 0.29, cfg.accent, [x, 1.52, 0.19], 8);
      for (let i = -1; i <= 1; i += 1) box(root, [0.075, 0.48, 0.032], 0x352522, [i * 0.18, 0.82, 0.42]);
      for (const x of [-0.17, 0.17]) box(root, [0.055, 0.34, 0.03], 0x352522, [x, 1.19, 0.50]);
    }
    if (cfg.kind === 'monkey') {
      const staff = cylinder(root, 0.045, 0.045, 1.45, 0xe3b04d, [0.58, 0.82, 0.08], 8, true);
      staff.rotation.z = -0.18;
    }
    if (cfg.kind === 'rat' || cfg.kind === 'monkey' || cfg.kind === 'dog') {
      const tail = torus(root, 0.40, 0.045, cfg.accent, [-0.15, 0.70, -0.44]);
      tail.rotation.x = Math.PI / 2;
      tail.userData.tileAnimated = true;
      animatedParts.push(tail);
    }
    armor(0.77, bodyScale / .5);
  }

  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  root.scale.setScalar(tierScale(value, 0.74, 1.17));
  if (tier >= 8 && cfg.kind !== 'dragon') {
    const aura = torus(root, 0.83, 0.035, cfg.accent, [0, 0.60, 0], true);
    aura.rotation.x = Math.PI / 2;
    aura.userData.tileAnimated = true;
    animatedParts.push(aura);
  }
  return { root, animatedParts };
}

const CANDY_COLORS = [0xff6f9c, 0xffc84c, 0x73d8ce, 0xa889e8, 0xff8b5d, 0x7ac36b, 0xffa8d6, 0x6eb7e8, 0xf27498, 0xa45cc5, 0xffcf50];

function buildCandy(value: number): TileVisual {
  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  const index = Math.min(10, tier - 1);
  const color = CANDY_COLORS[index];
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  addPedestal(root, 0xfff0d9, 0xeeb47e, index >= 8);

  const sprinkle = (x: number, y: number, z: number, c: number): void => {
    const s = box(root, [0.055, 0.18, 0.055], c, [x, y, z]);
    s.rotation.z = x * 0.9;
  };

  if (index === 0) {
    const cube = mesh(root, new THREE.BoxGeometry(.88, .88, .88), glossy(color), [0, .68, 0]);
    cube.rotation.y = .18;
    for (const x of [-.24, .22]) sprinkle(x, 1.12, .35, x < 0 ? 0xffffff : 0xffd55e);
  } else if (index === 1) {
    orb(root, .47, color, [0, .78, 0]);
    for (const x of [-.60, .60]) {
      const wrap = cone(root, .24, .42, x < 0 ? 0xfff4df : 0xffffff, [x, .78, 0], 8);
      wrap.rotation.z = Math.PI / 2;
    }
  } else if (index === 2) {
    orb(root, .43, color, [0, .72, 0]);
    for (const x of [-.27, .27]) orb(root, .20, color, [x, 1.12, 0]);
    orb(root, .06, 0x532d2f, [-.12, .82, .39]);
    orb(root, .06, 0x532d2f, [.12, .82, .39]);
    box(root, [.16, .08, .05], 0xffd0db, [0, .66, .42]);
  } else if (index === 3) {
    cylinder(root, .055, .055, .90, 0xfff2db, [0, .55, 0], 8);
    const disc = cylinder(root, .52, .52, .18, color, [0, 1.12, 0], 24);
    disc.rotation.x = Math.PI / 2;
    const spiral = torus(root, .26, .055, 0xffffff, [0, 1.13, .10]);
    spiral.rotation.x = Math.PI / 2;
  } else if (index === 4) {
    const donut = torus(root, .50, .22, 0xd49a64, [0, .80, 0]);
    donut.rotation.x = Math.PI / 2;
    const glaze = torus(root, .50, .15, color, [0, .84, .08]);
    glaze.rotation.x = Math.PI / 2;
    [-.26, -.08, .12, .29].forEach((x, i) => sprinkle(x, .96 + (i % 2) * .04, .39, [0xffd957,0x64d7cc,0xffffff,0x8d79e7][i]));
  } else if (index === 5) {
    for (const [y,c] of [[.50,color],[.72,0xfff3dd],[.94,color]] as const) cylinder(root, .50, .50, .18, c, [0, y, 0], 24);
    const cream = torus(root, .38, .055, 0xffffff, [0, .84, 0]);
    cream.rotation.x = Math.PI / 2;
  } else if (index === 6) {
    cone(root, .43, .88, 0xd19a5a, [0, .57, 0], 14);
    orb(root, .48, color, [0, 1.16, 0]);
    orb(root, .34, 0xfff3de, [0, 1.39, -.03]);
    sprinkle(-.12, 1.58, .15, 0xff6f9c);
    sprinkle(.14, 1.57, .12, 0x70d8ce);
  } else if (index === 7) {
    cylinder(root, .52, .42, .60, 0xe4a66a, [0, .58, 0], 18);
    orb(root, .49, color, [0, 1.00, 0]);
    orb(root, .34, 0xfff4df, [0, 1.23, 0]);
    orb(root, .13, 0xe95062, [0, 1.52, .05]);
  } else if (index === 8) {
    for (let i = 0; i < 3; i += 1) {
      cylinder(root, .68 - i * .10, .72 - i * .10, .27, i % 2 ? 0xfff2db : color, [0, .43 + i * .28, 0], 24);
      const icing = torus(root, .56 - i * .09, .04, 0xffffff, [0, .56 + i * .28, 0]);
      icing.rotation.x = Math.PI / 2;
    }
    orb(root, .15, 0xe84f65, [0, 1.30, 0]);
  } else {
    const floors = index === 9 ? 3 : 4;
    for (let i = 0; i < floors; i += 1) {
      const w = .72 - i * .09;
      cylinder(root, w, w + .04, .25, i % 2 ? 0xfff0d7 : color, [0, .40 + i * .26, 0], 24);
      for (const side of [-1,1]) {
        const turret = cylinder(root, .12, .14, .34, i % 2 ? color : 0xfff0d7, [side * (w - .08), .48 + i * .26, 0], 12);
        if (i === floors - 1) cone(root, .15, .28, 0xffcf50, [side * (w - .08), .78 + i * .26, 0], 10);
        turret.userData.tileAnimated = false;
      }
    }
    const topper = orb(root, index === 10 ? .27 : .18, index === 10 ? 0xffcf50 : 0xff6f9c, [0, .58 + floors * .26, 0], 0xffcf50);
    topper.userData.tileAnimated = true;
    animatedParts.push(topper);
    const ring = torus(root, .72, .035, 0xffcf50, [0, 1.20, 0], true);
    ring.rotation.x = Math.PI / 2;
    ring.userData.tileAnimated = true;
    animatedParts.push(ring);
  }
  root.scale.setScalar(tierScale(value, 0.80, 1.16));
  return { root, animatedParts };
}

function roof(parent: THREE.Object3D, width: number, y: number, color: number): THREE.Mesh {
  const value = cone(parent, width * 0.72, width * 0.55, color, [0, y, 0], 4);
  value.rotation.y = Math.PI / 4;
  return value;
}

function buildDreamhouse(value: number): TileVisual {
  const tier = Math.max(1, Math.log2(Math.max(2, value)));
  const index = Math.min(10, tier - 1);
  const root = new THREE.Group();
  const animatedParts: THREE.Object3D[] = [];
  const walls = [0xb8875d,0xc49b71,0xf1d4a3,0xf4dfbf,0xe6edf0,0xefc18d,0xf3dfc4,0xf4ead7,0xf5f1e6,0xe7eef4,0xf0dfb6];
  const roofs = [0x774637,0x5d8a67,0xc76548,0x477f9d,0x566f89,0x97603f,0x4f836c,0x74527d,0x3e6685,0x486a8c,0xa86f2f];
  const wall = walls[index];
  const accent = roofs[index];

  // Every property sits on a landscaped lot instead of a bare token pedestal.
  cylinder(root, .82, .88, .12, 0x6f9e67, [0, .06, 0], 20);
  box(root, [1.40, .05, .34], 0xd8c6a7, [0, .13, .72]);
  for (const x of [-.62,.62]) {
    cylinder(root, .06, .08, .34, 0x76513a, [x, .28, -.50], 7);
    sphere(root, .20, index >= 7 ? 0x5d9d70 : 0x7db66d, [x, .54, -.50], 9);
  }

  if (index === 0) {
    box(root, [1.04,.68,.88], wall, [0,.49,0]);
    box(root, [.43,.48,.045], accent, [0,.48,.46]);
    roof(root, 1.00, .98, 0x8b5a3e);
  } else if (index === 1) {
    const tent = cone(root, .76, 1.12, wall, [0,.67,0], 4);
    tent.rotation.y = Math.PI / 4;
    box(root, [.34,.46,.045], accent, [0,.45,.54]);
    const camp = cylinder(root, .16, .20, .12, 0xc57d45, [.56,.20,.12], 10);
    camp.userData.tileAnimated = true;
    animatedParts.push(camp);
  } else {
    const floors = index >= 9 ? 3 : index >= 4 ? 2 : 1;
    const width = index >= 8 ? 1.42 : index >= 5 ? 1.24 : 1.08;
    const depth = index >= 7 ? 1.02 : .90;
    for (let floor = 0; floor < floors; floor += 1) {
      box(root, [width - floor * .07,.55,depth], floor % 2 ? 0xf9f3e7 : wall, [0,.47 + floor * .55,0]);
      for (const x of [-.33,.33]) {
        const window = box(root, [.20,.20,.04], 0x77b9d4, [x,.50 + floor * .55,depth / 2 + .025]);
        if (index >= 8) {
          window.userData.tileAnimated = true;
          animatedParts.push(window);
        }
      }
      if (floor > 0 || index >= 6) {
        box(root, [width * .72,.08,.28], 0xd8c6a7, [0,.28 + floor * .55,depth / 2 + .18]);
      }
    }
    box(root, [.27,.43,.05], 0x704630, [0,.35,depth / 2 + .03]);

    if (index <= 5) roof(root, width, .86 + floors * .55, accent);
    else if (index <= 8) {
      roof(root, width * .62, .84 + floors * .55, accent);
      for (const side of [-1,1]) {
        const wing = box(root, [.34,.44,.72], 0xf8efe0, [side * (width * .48),.39,.02]);
        wing.rotation.y = side * .06;
      }
    } else {
      // Estate tiers use a modern terrace crown instead of another identical roof.
      box(root, [width * .74,.10,.72], accent, [0,.78 + floors * .55,0]);
      for (const x of [-.40,.40]) cylinder(root,.045,.055,.44,0xe9d3a0,[x,.98 + floors*.55,.20],8,true);
    }

    if (index >= 5) {
      for (const x of [-.76,.76]) {
        cylinder(root,.06,.075,.40,0x76543a,[x,.34,0],7);
        sphere(root,.25,index >= 8 ? 0x5b9e72 : 0x76b66d,[x,.72,0],9);
      }
    }
    if (index >= 6) {
      box(root, [.58,.05,.34], 0xe8dfc5, [-.48,.15,-.68]);
      for (const x of [-.70,-.48,-.26]) sphere(root,.09,0xf2a7ae,[x,.23,-.80],8);
    }
    if (index >= 7) {
      const pool = box(root,[1.18,.07,.40],0x55bed8,[0,.17,-.75]);
      pool.userData.tileAnimated = true;
      animatedParts.push(pool);
      box(root,[1.26,.04,.48],0xece4ce,[0,.13,-.75]);
    }
    if (index >= 8) {
      for (const side of [-1,1]) {
        box(root,[.06,.62,.06],0xe9d5ab,[side*.62,.48,.57],true);
        orb(root,.10,0xffdd83,[side*.62,.82,.57],0xffb84c);
      }
    }
    if (index >= 9) {
      const fountain = cylinder(root,.24,.30,.09,0xe4d6b9,[0,.17,.82],18);
      const water = orb(root,.10,0x73cfe3,[0,.34,.82],0x73cfe3);
      fountain.userData.tileAnimated = false;
      water.userData.tileAnimated = true;
      animatedParts.push(water);
    }
    if (index === 10) {
      for (const side of [-1,1]) {
        cylinder(root,.16,.18,.72,0xf1e4c8,[side*.60,.55,-.18],12);
        cone(root,.19,.36,0xa86f2f,[side*.60,1.08,-.18],10);
      }
      const halo = torus(root,.68,.035,0xf0bd4c,[0,1.48,0],true);
      halo.rotation.x = Math.PI / 2;
      halo.userData.tileAnimated = true;
      animatedParts.push(halo);
    }
  }

  root.scale.setScalar(tierScale(value, 0.78, 1.17));
  return { root, animatedParts };
}

export class ZodiacTileFactory extends CachedLaunchFactory {
  constructor() { super(buildZodiac); }
}
export class CandyTileFactory extends CachedLaunchFactory {
  constructor() { super(buildCandy); }
}
export class DreamhouseTileFactory extends CachedLaunchFactory {
  constructor() { super(buildDreamhouse); }
}
