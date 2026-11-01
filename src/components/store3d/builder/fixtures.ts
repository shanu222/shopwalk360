import * as THREE from 'three';
import { StaticBatcher, std, emissive, glass, contactShadowTexture, mat } from './materials';
import { buildProductModel, parseColorMap, parseDims, resolveColor, garmentSilhouette, buildShoe, ProductModel } from './productModels';
import { bayTagTexture, labelTexture, simpleScreenTexture } from './signage';
import { StoreShelf, AvatarConfig } from '../../../types';
import { createHumanAvatar } from '../avatar/AvatarModel';

export interface FixturePalette {
  body: string; // carcass
  shelf: string; // shelf surfaces
  metal: string; // trims
  accent: string; // department colour
  bodyRough?: number;
}

export interface FixtureBuildContext {
  batch: StaticBatcher;
  /** packaging instances per product (merged into InstancedMeshes by the builder) */
  addPackaging: (shelf: StoreShelf, matrix: THREE.Matrix4, size: THREE.Vector3) => void;
  palette: FixturePalette;
  lowDetail: boolean;
}

export interface FixtureResult {
  /** footprint (local, before yaw) for collision and hit-testing */
  w: number;
  d: number;
  h: number;
  /** demo screen mesh if the fixture has one */
  screen?: THREE.Mesh;
  /** extra dynamic objects that must stay separate (e.g. screens with changing textures) */
  dynamic: THREE.Object3D[];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** local → world helper for a fixture at (x, z) with yaw */
class Placer {
  constructor(public x: number, public z: number, public yaw: number) {}
  matrix(lx: number, ly: number, lz: number, ry = 0, rx = 0, rz = 0, scale = 1) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    _v.set(this.x + lx * c + lz * s, ly, this.z - lx * s + lz * c);
    _e.set(rx, this.yaw + ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    return _m.clone().compose(_v, _q, _s);
  }
}

function colourList(shelf: StoreShelf): { name: string; hex: string }[] {
  const map = parseColorMap(shelf.color_hex_map);
  const names = (shelf.product_color_options || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = names.map((n) => ({ name: n, hex: resolveColor(n, map) || '#6b7078' }));
  return list.length ? list : [{ name: '', hex: '#6b7078' }];
}

function heroModel(shelf: StoreShelf, colourIndex = 0): ProductModel {
  const cols = colourList(shelf);
  return buildProductModel({
    preset: shelf.model_preset,
    colorName: cols[colourIndex % cols.length].name,
    colorMap: parseColorMap(shelf.color_hex_map),
    colorOptions: shelf.product_color_options,
    dims: parseDims(shelf.dimensions_json),
  });
}

function packSize(shelf: StoreShelf): THREE.Vector3 {
  switch (shelf.model_preset) {
    case 'charger': case 'car_mount': return new THREE.Vector3(0.12, 0.16, 0.07);
    case 'kettle': return new THREE.Vector3(0.2, 0.24, 0.2);
    case 'diffuser': return new THREE.Vector3(0.2, 0.22, 0.2);
    case 'laptop_stand': return new THREE.Vector3(0.3, 0.06, 0.25);
    case 'tire_inflator': return new THREE.Vector3(0.11, 0.2, 0.08);
    case 'grip_trainer': return new THREE.Vector3(0.13, 0.19, 0.06);
    case 'packing_cubes': return new THREE.Vector3(0.3, 0.12, 0.22);
    case 'lip_tint': return new THREE.Vector3(0.04, 0.12, 0.04);
    case 'wallet': return new THREE.Vector3(0.13, 0.1, 0.035);
    default: return new THREE.Vector3(0.16, 0.18, 0.1);
  }
}

const isApparel = (s: StoreShelf) => s.wearable_slot === 'top' || s.wearable_slot === 'bottom';

/** Place merchandise along a shelf line (local coordinates) */
function merchandise(ctx: FixtureCtxInternal, shelf: StoreShelf, lx0: number, lx1: number, ly: number, lz: number, faceYaw: number, depth: number) {
  if (!shelf.product_id) return;
  const { p, c } = ctx;
  const width = lx1 - lx0;
  if (isApparel(shelf)) {
    const cols = colourList(shelf);
    const n = Math.max(1, Math.floor(width / 0.36));
    for (let i = 0; i < n; i++) {
      const col = cols[i % cols.length];
      const model = buildProductModel({ preset: shelf.model_preset, colorName: col.name, colorMap: parseColorMap(shelf.color_hex_map) });
      model.group.applyMatrix4(p.matrix(lx0 + (i + 0.5) * (width / n), ly, lz, faceYaw));
      c.batch.addObject(model.group);
    }
    return;
  }
  if (shelf.model_preset === 'shoe') {
    const cols = colourList(shelf);
    const n = Math.max(1, Math.floor(width / 0.34));
    for (let i = 0; i < n; i++) {
      const col = cols[i % cols.length];
      const sole = /gum/i.test(col.name) ? '#b98b55' : '#ecebe6';
      const shoe = buildShoe(col.hex, sole);
      shoe.group.applyMatrix4(p.matrix(lx0 + (i + 0.5) * (width / n), ly, lz, faceYaw + Math.PI / 2 - 0.35));
      c.batch.addObject(shoe.group);
    }
    return;
  }
  const size = packSize(shelf);
  const n = Math.max(1, Math.floor(width / (size.x + 0.03)));
  const rows = Math.max(1, Math.min(3, Math.floor(depth / (size.z + 0.02))));
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < rows; r++) {
      const zOff = (r - (rows - 1) / 2) * (size.z + 0.015);
      const m = p.matrix(lx0 + (i + 0.5) * (width / n), ly + size.y / 2, lz + zOff, faceYaw);
      c.addPackaging(shelf, m, size);
    }
  }
}

interface FixtureCtxInternal {
  p: Placer;
  c: FixtureBuildContext;
}

function shadowDecal(c: FixtureBuildContext, p: Placer, w: number, d: number) {
  const m = mat('contactShadowMat', () => new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true }));
  const g = new THREE.PlaneGeometry(w * 1.3, d * 1.6);
  c.batch.addMatrix(g, m, p.matrix(0, 0.006, 0, 0, -Math.PI / 2));
  g.dispose();
}

function bayTag(c: FixtureBuildContext, p: Placer, shelf: StoreShelf, lx: number, ly: number, lz: number, ry = 0) {
  const code = shelf.slot_code || shelf.shelf_code;
  const m = mat(`baytag:${code}:${c.palette.accent}`, () => new THREE.MeshBasicMaterial({ map: bayTagTexture(code, c.palette.accent) }));
  const g = new THREE.PlaneGeometry(0.34, 0.13);
  c.batch.addMatrix(g, m, p.matrix(lx, ly, lz, ry));
  g.dispose();
}

function priceLabel(c: FixtureBuildContext, p: Placer, shelf: StoreShelf, lx: number, ly: number, lz: number, ry = 0, rx = 0) {
  if (!shelf.product_name) return;
  const price = shelf.discount_price || shelf.regular_price;
  const key = `label:${shelf.product_id}`;
  const m = mat(key, () => new THREE.MeshBasicMaterial({ map: labelTexture(shelf.product_name!.replace(/\s*\(Sample Listing\)/, ''), price ? `PKR ${Number(price).toLocaleString()}` : '', c.palette.accent) }));
  const g = new THREE.PlaneGeometry(0.32, 0.1);
  c.batch.addMatrix(g, m, p.matrix(lx, ly, lz, ry, rx));
  g.dispose();
}

/* ============================================================================================== */

function gondola(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 3.0;
  const D = 0.96;
  const H = 1.55;
  const body = std(c.palette.body, c.palette.bodyRough ?? 0.5, 0.1);
  const shelfM = std(c.palette.shelf, 0.45, 0.05);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z));
    g.dispose();
  };
  add(W, 0.12, D, 0, 0.06, 0, body); // plinth
  add(W, H, 0.05, 0, H / 2, 0, body); // spine
  add(0.05, H, D, -W / 2, H / 2, 0, body);
  add(0.05, H, D, W / 2, H / 2, 0, body);
  const tiers = [0.48, 0.88, 1.28];
  tiers.forEach((y) => {
    [-1, 1].forEach((side) => {
      add(W - 0.06, 0.03, D / 2 - 0.05, 0, y, side * (D / 4 + 0.01), shelfM);
      add(W - 0.06, 0.012, 0.012, 0, y - 0.02, side * (D / 2 - 0.02), emissive('#fff3dd', 1.1));
    });
  });
  add(W + 0.04, 0.04, D + 0.04, 0, H + 0.02, 0, body);
  // merchandise both faces (bottom tier holds stock, upper tiers face-out)
  [-1, 1].forEach((side) => {
    tiers.forEach((y) => merchandise(ctx, shelf, -W / 2 + 0.08, W / 2 - 0.08, y + 0.015, side * (D / 4 + 0.01), side === 1 ? 0 : Math.PI, D / 2 - 0.08));
    priceLabel(c, p, shelf, 0, tiers[1] - 0.06, side * (D / 2 + 0.003), side === 1 ? 0 : Math.PI);
  });
  // end-cap header with bay tag
  [-1, 1].forEach((side) => bayTag(c, p, shelf, side * (W / 2 + 0.03), H - 0.15, 0, side * Math.PI / 2));
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: H, dynamic: [] };
}

function wallMount(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 2.5;
  const H = 2.5;
  const D = 0.42;
  const body = std(c.palette.body, c.palette.bodyRough ?? 0.5, 0.05);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z));
    g.dispose();
  };
  add(W, H, 0.06, 0, H / 2, -D / 2 + 0.03, body);
  add(W, 0.18, D, 0, 0.09, 0, body);
  add(0.06, H, D, -W / 2, H / 2, 0, body);
  add(0.06, H, D, W / 2, H / 2, 0, body);
  add(W, 0.06, D, 0, H, 0, body);
  const shelfM = std(c.palette.shelf, 0.45, 0.05);
  [0.62, 1.1, 1.58, 2.02].forEach((y, i) => {
    add(W - 0.12, 0.028, D - 0.08, 0, y, 0.02, shelfM);
    add(W - 0.14, 0.01, 0.01, 0, y - 0.018, D / 2 - 0.04, emissive('#fff3dd', 1.1));
    if (shelf.model_preset === 'shoe' || isApparel(shelf) || i % 2 === 0) merchandise(ctx, shelf, -W / 2 + 0.12, W / 2 - 0.12, y + 0.014, 0.02, 0, D - 0.12);
    else if (shelf.product_id) {
      // hero items on alternate shelves
      const cols = colourList(shelf);
      const n = Math.min(4, cols.length * 2);
      for (let k = 0; k < n; k++) {
        const model = heroModel(shelf, k);
        const fit = fitScale(model, 0.38);
        model.group.applyMatrix4(p.matrix(-W / 2 + 0.3 + k * ((W - 0.6) / Math.max(1, n - 1)), y + 0.014, 0.04, 0, 0, 0, fit));
        c.batch.addObject(model.group);
      }
    }
  });
  priceLabel(c, p, shelf, 0, 1.1 - 0.07, D / 2 + 0.005);
  bayTag(c, p, shelf, W / 2 - 0.3, H - 0.12, D / 2 + 0.005);
  // backlit header strip in department colour
  add(W - 0.2, 0.05, 0.02, 0, H - 0.04, D / 2 - 0.01, emissive(c.palette.accent, 0.9));
  return { w: W, d: D, h: H, dynamic: [] };
}

/** Uniform scale so the model's largest dimension fits `maxSize` — only ever scales DOWN */
function fitScale(model: ProductModel, maxSize: number) {
  const box = new THREE.Box3().setFromObject(model.group);
  const size = box.getSize(new THREE.Vector3());
  const m = Math.max(size.x, size.y, size.z);
  return m > maxSize ? maxSize / m : 1;
}

function glassCabinet(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 1.3;
  const D = 0.62;
  const baseH = 0.92;
  const body = std(c.palette.body, 0.4, 0.1);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z));
    g.dispose();
  };
  add(W, baseH, D, 0, baseH / 2, 0, body);
  add(W + 0.02, 0.02, D + 0.02, 0, baseH + 0.01, 0, std(c.palette.metal, 0.3, 0.9));
  add(W - 0.1, 0.04, D - 0.12, 0, baseH + 0.04, 0, std('#efe9df', 0.95)); // velvet display bed
  add(W - 0.1, 0.01, 0.01, 0, baseH + 0.36, D / 2 - 0.06, emissive('#fff3dd', 1.2));
  // glass hood
  const gm = glass('#e9f1f4', 0.14);
  add(W, 0.4, 0.01, 0, baseH + 0.2, D / 2, gm);
  add(W, 0.4, 0.01, 0, baseH + 0.2, -D / 2, gm);
  add(0.01, 0.4, D, -W / 2, baseH + 0.2, 0, gm);
  add(0.01, 0.4, D, W / 2, baseH + 0.2, 0, gm);
  add(W, 0.01, D, 0, baseH + 0.4, 0, gm);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(0.015, 0.4, 0.015, sx * W / 2, baseH + 0.2, sz * D / 2, std(c.palette.metal, 0.3, 0.9))));
  if (shelf.product_id) {
    const cols = colourList(shelf);
    const n = Math.min(3, Math.max(1, cols.length));
    for (let k = 0; k < n; k++) {
      const model = heroModel(shelf, k);
      const s = fitScale(model, 0.3);
      model.group.applyMatrix4(p.matrix(-0.4 + k * 0.4, baseH + 0.06, 0, 0.25, 0, 0, s));
      c.batch.addObject(model.group);
    }
    priceLabel(c, p, shelf, 0, baseH - 0.12, D / 2 + 0.004);
  }
  bayTag(c, p, shelf, -W / 2 + 0.22, 0.2, D / 2 + 0.004);
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: baseH + 0.4, dynamic: [] };
}

function islandDisplay(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const body = std(c.palette.body, 0.45, 0.1);
  const top = std(c.palette.shelf, 0.3, 0.05);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    c.batch.addMatrix(geo, m, p.matrix(x, y, z));
    geo.dispose();
  };
  add(new THREE.CylinderGeometry(0.78, 0.8, 0.5, 48), body, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(0.8, 0.8, 0.03, 48), top, 0, 0.515, 0);
  add(new THREE.CylinderGeometry(0.42, 0.44, 0.38, 40), body, -0.12, 0.72, -0.15);
  add(new THREE.CylinderGeometry(0.44, 0.44, 0.025, 40), top, -0.12, 0.92, -0.15);
  add(new THREE.TorusGeometry(0.8, 0.008, 6, 64), emissive('#fff2da', 1.1), 0, 0.5, 0);
  if (shelf.product_id) {
    const furniture = shelf.model_preset === 'armchair' || shelf.model_preset === 'side_table';
    const hero = heroModel(shelf, 0);
    const s = furniture ? fitScale(hero, 0.9) : fitScale(hero, 0.45);
    hero.group.applyMatrix4(p.matrix(-0.12, 0.935, -0.15, 0.4, 0, 0, s));
    c.batch.addObject(hero.group);
    const cols = colourList(shelf);
    if (!furniture) {
      for (let k = 1; k < Math.min(4, cols.length + 1); k++) {
        const m = heroModel(shelf, k);
        const sc = fitScale(m, 0.3);
        const a = -0.6 + k * 0.7;
        m.group.applyMatrix4(p.matrix(Math.sin(a) * 0.55 + 0.1, 0.53, Math.cos(a) * 0.45, -a * 0.5, 0, 0, sc));
        c.batch.addObject(m.group);
      }
    }
    priceLabel(c, p, shelf, 0.35, 0.54, 0.52, 0, -Math.PI / 2.6);
  }
  shadowDecal(c, p, 1.6, 1.6);
  return { w: 1.6, d: 1.6, h: 1.2, dynamic: [] };
}

function demoTable(ctx: FixtureCtxInternal, shelf: StoreShelf, kitchen = false): FixtureResult {
  const { p, c } = ctx;
  const W = kitchen ? 2.9 : 2.6;
  const D = kitchen ? 1.05 : 0.95;
  const H = kitchen ? 0.92 : 0.9;
  const body = std(kitchen ? '#e9e5dc' : c.palette.body, 0.5, 0.05);
  const top = kitchen ? std('#f3f1ec', 0.18, 0.05) : std(c.palette.shelf, 0.3, 0.05);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z));
    g.dispose();
  };
  add(W, H - 0.05, D, 0, (H - 0.05) / 2, 0, body);
  add(W + 0.06, 0.05, D + 0.06, 0, H - 0.025, 0, top);
  add(W - 0.1, 0.012, 0.012, 0, 0.08, D / 2 + 0.01, emissive('#fff2da', 1));
  if (kitchen) {
    add(0.5, 0.02, 0.38, 0.85, H + 0.001, 0, std('#b8bcc0', 0.2, 0.9));
    add(0.03, 0.32, 0.03, 0.85, H + 0.16, -0.25, std('#b8bcc0', 0.2, 0.9));
  }
  if (shelf.product_id) {
    const hero = heroModel(shelf, 0);
    hero.group.applyMatrix4(p.matrix(-0.2, H, 0.05, 0.5));
    c.batch.addObject(hero.group);
    const cols = colourList(shelf);
    for (let k = 1; k < Math.min(3, cols.length); k++) {
      const m = heroModel(shelf, k);
      const s = fitScale(m, 0.35);
      m.group.applyMatrix4(p.matrix(-0.2 - k * 0.45, H, -0.18, 0.3, 0, 0, s));
      c.batch.addObject(m.group);
    }
    priceLabel(c, p, shelf, 0.6, H + 0.06, D / 2 - 0.05, 0, -Math.PI / 3);
  }
  // demonstration screen on a slim stand behind the table
  add(0.06, 1.9, 0.06, 0, 0.95, -D / 2 - 0.25, std(c.palette.metal, 0.3, 0.8));
  const screenFrame = new THREE.BoxGeometry(2.28, 1.32, 0.05);
  c.batch.addMatrix(screenFrame, std('#0d0e10', 0.4, 0.3), p.matrix(0, 2.05, -D / 2 - 0.22));
  screenFrame.dispose();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.22), new THREE.MeshBasicMaterial({ color: '#111' }));
  screen.applyMatrix4(p.matrix(0, 2.05, -D / 2 - 0.194));
  bayTag(c, p, shelf, W / 2 - 0.25, H - 0.16, D / 2 + 0.004);
  shadowDecal(c, p, W, D);
  return { w: W, d: D + 0.55, h: 2.75, screen, dynamic: [screen] };
}

function mannequinFixture(ctx: FixtureCtxInternal, shelf: StoreShelf, palette: FixturePalette): FixtureResult {
  const { p, c } = ctx;
  const plinth = new THREE.CylinderGeometry(0.5, 0.52, 0.12, 40);
  c.batch.addMatrix(plinth, std(palette.body, 0.4, 0.1), p.matrix(0, 0.06, 0));
  plinth.dispose();
  const cols = colourList(shelf);
  const col = cols[0];
  const cfg: AvatarConfig = {
    gender: shelf.wearable_slot === 'bottom' ? 'female' : 'male',
    skinTone: '#efebe4',
    hairColor: '#efebe4',
    hairStyle: 'buzz',
    outfitColor: shelf.wearable_slot === 'top' ? col.hex : '#e9e6df',
    pantsColor: shelf.wearable_slot === 'bottom' ? col.hex : '#2f3238',
    shoesColor: '#2a2b2e',
    topStyle: shelf.wearable_slot === 'top' ? 'shirt' : 'tee',
    bottomStyle: 'trousers',
    shoeStyle: 'formal',
    heightScale: 1.0,
    accessories: { glasses: false, watch: false, shoppingBasket: false },
    avatarName: 'Mannequin',
  };
  const m = createHumanAvatar(cfg, { mannequin: true, lowDetail: c.lowDetail });
  m.root.position.set(0, 0.12, 0);
  m.pose('display');
  const holder = new THREE.Group();
  holder.add(m.root);
  holder.applyMatrix4(p.matrix(0, 0, 0));
  c.batch.addObject(holder);
  m.dispose();
  if (shelf.product_name) priceLabel(c, p, shelf, 0.35, 0.13, 0.48, 0, -Math.PI / 2.4);
  return { w: 1.0, d: 1.0, h: 1.9, dynamic: [] };
}

function clothingRack(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 1.9;
  const metal = std(c.palette.metal, 0.25, 0.9);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    c.batch.addMatrix(geo, m, p.matrix(x, y, z, 0, 0, rz));
    geo.dispose();
  };
  add(new THREE.CylinderGeometry(0.014, 0.014, W, 12), metal, 0, 1.55, 0, Math.PI / 2);
  [-1, 1].forEach((s) => {
    add(new THREE.CylinderGeometry(0.016, 0.016, 1.55, 12), metal, s * W / 2, 0.775, 0);
    add(new THREE.BoxGeometry(0.06, 0.03, 0.5), metal, s * W / 2, 0.015, 0);
  });
  if (shelf.product_id) {
    const cols = colourList(shelf);
    const kind = shelf.wearable_slot === 'bottom' ? 'bottom' : 'top';
    const n = 7;
    for (let i = 0; i < n; i++) {
      const g = garmentSilhouette(kind, cols[i % cols.length].hex);
      g.applyMatrix4(p.matrix(-W / 2 + 0.2 + i * ((W - 0.4) / (n - 1)), 1.5, 0, Math.PI / 2));
      c.batch.addObject(g);
    }
    priceLabel(c, p, shelf, W / 2 + 0.02, 1.25, 0, Math.PI / 2);
  }
  bayTag(c, p, shelf, -W / 2 - 0.02, 1.25, 0, -Math.PI / 2);
  shadowDecal(c, p, W, 0.5);
  return { w: W + 0.1, d: 0.6, h: 1.6, dynamic: [] };
}

function vanity(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 2.0;
  const D = 0.6;
  const H = 0.92;
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z));
    g.dispose();
  };
  add(W, H, D, 0, H / 2, 0, std(c.palette.body, 0.4, 0.05));
  add(W + 0.04, 0.03, D + 0.04, 0, H + 0.015, 0, std(c.palette.shelf, 0.2, 0.05));
  // mirrors
  [-0.5, 0.5].forEach((x) => {
    const ring = new THREE.TorusGeometry(0.3, 0.018, 8, 48);
    c.batch.addMatrix(ring, emissive('#fff1e2', 1.3), p.matrix(x, H + 0.55, -D / 2 + 0.05));
    ring.dispose();
    const mir = new THREE.CircleGeometry(0.29, 48);
    c.batch.addMatrix(mir, std('#c9d2d8', 0.02, 1.0), p.matrix(x, H + 0.55, -D / 2 + 0.045));
    mir.dispose();
  });
  if (shelf.product_id) {
    const cols = colourList(shelf);
    for (let i = 0; i < 8; i++) {
      const m = heroModel(shelf, i);
      m.group.applyMatrix4(p.matrix(-0.8 + i * 0.22, H + 0.03, 0.12));
      c.batch.addObject(m.group);
    }
    void cols;
    priceLabel(c, p, shelf, 0, H - 0.1, D / 2 + 0.004);
  }
  bayTag(c, p, shelf, -W / 2 + 0.22, 0.2, D / 2 + 0.004);
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: 1.6, dynamic: [] };
}

function roomSet(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  // rug
  const rug = new THREE.PlaneGeometry(2.4, 1.8);
  c.batch.addMatrix(rug, std('#d9d0c1', 0.98), p.matrix(0, 0.008, 0, 0, -Math.PI / 2));
  rug.dispose();
  const border = new THREE.PlaneGeometry(2.5, 1.9);
  c.batch.addMatrix(border, std('#8a7a63', 0.98), p.matrix(0, 0.006, 0, 0, -Math.PI / 2));
  border.dispose();
  if (shelf.product_id) {
    const hero = heroModel(shelf, 0);
    hero.group.applyMatrix4(p.matrix(-0.15, 0.01, -0.1, 0.35));
    c.batch.addObject(hero.group);
    // dimension plaque from the product's real dimensions only
    const dims = parseDims(shelf.dimensions_json);
    if (dims) {
      const key = `dims:${shelf.product_id}`;
      const m = mat(key, () => new THREE.MeshBasicMaterial({ map: labelTexture(shelf.product_name!.replace(/\s*\(Sample Listing\)/, ''), `W ${dims.w} × H ${dims.h} × D ${dims.d} cm`, c.palette.accent) }));
      const g = new THREE.PlaneGeometry(0.42, 0.13);
      c.batch.addMatrix(g, m, p.matrix(0.85, 0.42, 0.75, -0.3, -0.5));
      g.dispose();
      const stand = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8);
      c.batch.addMatrix(stand, std(c.palette.metal, 0.3, 0.9), p.matrix(0.85, 0.2, 0.72));
      stand.dispose();
    } else priceLabel(c, p, shelf, 0.85, 0.42, 0.75, -0.3, -0.5);
  }
  // floor lamp for ambience
  const pole = new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8);
  c.batch.addMatrix(pole, std('#1f2023', 0.4, 0.6), p.matrix(-1.05, 0.75, -0.7));
  pole.dispose();
  const shade = new THREE.CylinderGeometry(0.16, 0.2, 0.24, 24, 1, true);
  c.batch.addMatrix(shade, emissive('#ffe6c4', 0.85), p.matrix(-1.05, 1.55, -0.7));
  shade.dispose();
  return { w: 2.5, d: 1.9, h: 1.7, dynamic: [] };
}

function fittingStation(ctx: FixtureCtxInternal, shelf: StoreShelf, palette: FixturePalette): FixtureResult {
  const { p, c } = ctx;
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z, ry));
    g.dispose();
  };
  // platform
  add(2.8, 0.08, 1.6, 0, 0.04, 0, std(palette.shelf, 0.35, 0.05));
  // three-panel full-length mirrors
  [-0.95, 0, 0.95].forEach((x, i) => {
    const ry = i === 0 ? 0.35 : i === 2 ? -0.35 : 0;
    add(0.86, 2.1, 0.05, x, 1.13, -0.7 + Math.abs(x) * 0.18, std(palette.metal, 0.3, 0.8), ry);
    add(0.78, 2.0, 0.01, x + Math.sin(ry) * 0.03, 1.13, -0.67 + Math.abs(x) * 0.18, std('#cfd8de', 0.02, 1.0), ry);
  });
  // vertical light bars
  [-1.42, 1.42].forEach((x) => add(0.04, 2.0, 0.04, x, 1.1, -0.55, emissive('#fff2e2', 1.2)));
  // interactive screen
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.6), new THREE.MeshBasicMaterial({ color: '#111' }));
  screen.applyMatrix4(p.matrix(1.05, 1.35, 0.28, -0.8));
  add(1.12, 0.68, 0.04, 1.06, 1.35, 0.26, std('#0e0f11', 0.4, 0.3), -0.8);
  add(0.05, 1.1, 0.05, 1.1, 0.6, 0.2, std(palette.metal, 0.3, 0.8));
  const tex = simpleScreenTexture(shelf.featured_label || 'Virtual try-on', [shelf.product_name ? `Try ${shelf.product_name.replace(/\s*\(Sample Listing\)/, '')}` : 'Select a product to try', 'Choose “Explore Product” → Try-On'], palette.accent, 768, 460);
  (screen.material as THREE.MeshBasicMaterial).map = tex;
  (screen.material as THREE.MeshBasicMaterial).color.set('#ffffff');
  // stool
  const stool = new THREE.CylinderGeometry(0.2, 0.18, 0.46, 24);
  c.batch.addMatrix(stool, std(palette.accent, 0.8), p.matrix(-1.0, 0.31, 0.45));
  stool.dispose();
  if (shelf.product_id && shelf.wearable_slot !== 'top' && shelf.wearable_slot !== 'bottom') {
    const hero = heroModel(shelf, 0);
    const pod = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 32);
    c.batch.addMatrix(pod, std(palette.body, 0.4, 0.1), p.matrix(0.6, 0.5, 0.45));
    pod.dispose();
    const s = fitScale(hero, 0.3);
    hero.group.applyMatrix4(p.matrix(0.6, 1.0, 0.45, 0.3, 0, 0, s));
    c.batch.addObject(hero.group);
  }
  return { w: 2.9, d: 1.7, h: 2.2, screen, dynamic: [screen] };
}

function shoeWall(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const W = 2.5;
  const H = 2.5;
  const D = 0.32;
  const body = std(c.palette.body, 0.5, 0.05);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z, 0, rx));
    g.dispose();
  };
  add(W, H, 0.05, 0, H / 2, -D / 2, body);
  const cols = colourList(shelf);
  for (let row = 0; row < 5; row++) {
    const y = 0.45 + row * 0.42;
    for (let col = 0; col < 5; col++) {
      const x = -W / 2 + 0.27 + col * 0.49;
      add(0.38, 0.014, 0.24, x, y, -0.02, std(c.palette.shelf, 0.35, 0.05), -0.18);
      add(0.36, 0.008, 0.008, x, y - 0.012, 0.1, emissive('#fff3dd', 1));
      if (shelf.product_id) {
        const cl = cols[(row + col) % cols.length];
        const shoe = buildShoe(cl.hex, /gum/i.test(cl.name) ? '#b98b55' : '#ecebe6');
        shoe.group.applyMatrix4(p.matrix(x, y + 0.03, -0.02, Math.PI / 2 - 0.5, -0.18));
        c.batch.addObject(shoe.group);
      }
    }
  }
  if (shelf.product_id) priceLabel(c, p, shelf, 0, 0.22, 0);
  bayTag(c, p, shelf, W / 2 - 0.25, H - 0.1, -D / 2 + 0.03);
  return { w: W, d: D + 0.1, h: H, dynamic: [] };
}

/* ============================================================================================== */

export function buildFixture(c: FixtureBuildContext, shelf: StoreShelf, x: number, z: number, yaw: number): FixtureResult {
  const ctx: FixtureCtxInternal = { p: new Placer(x, z, yaw), c };
  switch (shelf.shelf_type) {
    case 'wall_mount': return wallMount(ctx, shelf);
    case 'glass_cabinet': return glassCabinet(ctx, shelf);
    case 'island_display': case 'endcap_promo': return islandDisplay(ctx, shelf);
    case 'demo_table': return demoTable(ctx, shelf);
    case 'demo_kitchen': return demoTable(ctx, shelf, true);
    case 'mannequin': return mannequinFixture(ctx, shelf, c.palette);
    case 'clothing_rack': return clothingRack(ctx, shelf);
    case 'shoe_wall': return shoeWall(ctx, shelf);
    case 'vanity': return vanity(ctx, shelf);
    case 'room_set': return roomSet(ctx, shelf);
    case 'fitting_station': return fittingStation(ctx, shelf, c.palette);
    case 'gondola': case 'double_tier': default: return gondola(ctx, shelf);
  }
}
