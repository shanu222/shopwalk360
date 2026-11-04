import * as THREE from 'three';
import { StaticBatcher, std, emissive, glass, contactShadowTexture, mat } from './materials';
import { buildProductModel, parseColorMap, parseDims, resolveColor, garmentSilhouette, buildShoe, ProductModel } from './productModels';
import { bayTagTexture, labelTexture, simpleScreenTexture, displaySignTexture, shelfStripTexture } from './signage';
import { StoreShelf, AvatarConfig } from '../../../types';
import { unitsFor } from '../layout/fixtureSpots';
import { createHumanAvatar } from '../avatar/AvatarModel';

export interface FixturePalette {
  body: string; // carcass
  shelf: string; // shelf surfaces
  metal: string; // trims
  accent: string; // department colour
  bodyRough?: number;
}

export interface PackagingRef {
  key: string;
  index: number;
}

/** One unit of a product on a shelf that a shopper can take (see StoreEngine.playPick). */
export interface ShelfUnit {
  matrix: THREE.Matrix4;
  size: THREE.Vector3;
  packaging?: PackagingRef;
}

export interface FixtureBuildContext {
  batch: StaticBatcher;
  /** packaging instances per product (merged into InstancedMeshes by the builder) */
  addPackaging: (shelf: StoreShelf, matrix: THREE.Matrix4, size: THREE.Vector3) => PackagingRef;
  /** a unit the shopper can pick up */
  addUnit: (item: StoreShelf, unit: ShelfUnit) => void;
  /** where an uploaded 3D model (GLB) of the product goes; the engine loads and places it */
  addModelSlot: (item: StoreShelf, matrix: THREE.Matrix4, maxSize: number) => void;
  palette: FixturePalette;
  lowDetail: boolean;
}

/** A product spot on a display, in the display's local space (for clicking and walking to it). */
export interface FixtureSpot {
  tier: number;
  item?: StoreShelf;
  lx: number;
  ly: number;
  lz: number;
  w: number;
  h: number;
  d: number;
  /** the spot faces the back of the display (double-sided gondolas) */
  back: boolean;
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
  spots: FixtureSpot[];
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

/**
 * Place `units` of a product along a shelf line (local coordinates), centred on the line.
 * Uploaded 3D models are placed by the engine; built-in shapes and photo packaging are baked here.
 * Packaged units in the front row are registered so a shopper can take one.
 */
function merchandise(ctx: FixtureCtxInternal, item: StoreShelf | undefined, lx0: number, lx1: number, ly: number, lz: number, faceYaw: number, depth: number, clearance = 0.34) {
  if (!item?.product_id) return;
  const { p, c } = ctx;
  const width = lx1 - lx0;
  const units = unitsFor(ctx.type, item.tier || 1, item.facings);
  const mid = (lx0 + lx1) / 2;
  const front = Math.cos(faceYaw) >= 0 ? 1 : -1;
  if (item.model_3d_url) {
    const step = Math.min(width / units, 0.5);
    for (let i = 0; i < units; i++) {
      // never taller than the gap to the shelf above
      c.addModelSlot(item, p.matrix(mid + (i - (units - 1) / 2) * step, ly, lz + front * 0.02, faceYaw), Math.max(0.1, Math.min(step * 0.88, clearance)));
    }
    return;
  }
  if (isApparel(item)) {
    const cols = colourList(item);
    const step = Math.min(width / units, 0.36);
    for (let i = 0; i < units; i++) {
      const col = cols[i % cols.length];
      const model = buildProductModel({ preset: item.model_preset, colorName: col.name, colorMap: parseColorMap(item.color_hex_map) });
      model.group.applyMatrix4(p.matrix(mid + (i - (units - 1) / 2) * step, ly, lz, faceYaw));
      c.batch.addObject(model.group);
    }
    return;
  }
  if (item.model_preset === 'shoe') {
    const cols = colourList(item);
    const step = Math.min(width / units, 0.34);
    for (let i = 0; i < units; i++) {
      const col = cols[i % cols.length];
      const sole = /gum/i.test(col.name) ? '#b98b55' : '#ecebe6';
      const shoe = buildShoe(col.hex, sole);
      shoe.group.applyMatrix4(p.matrix(mid + (i - (units - 1) / 2) * step, ly, lz, faceYaw + Math.PI / 2 - 0.35));
      c.batch.addObject(shoe.group);
    }
    return;
  }
  if (item.model_preset) {
    // built-in 3D shape of the product
    const step = Math.min(width / units, 0.42);
    for (let i = 0; i < units; i++) {
      const model = heroModel(item, i);
      const s = fitScale(model, Math.min(step * 0.9, clearance));
      model.group.applyMatrix4(p.matrix(mid + (i - (units - 1) / 2) * step, ly, lz, faceYaw, 0, 0, s));
      c.batch.addObject(model.group);
    }
    return;
  }
  // product photo on its packaging; a second row behind when the shelf is deep enough
  const size = packSize(item);
  const step = Math.min(width / units, size.x + 0.05);
  const rows = Math.max(1, Math.min(2, Math.floor(depth / (size.z + 0.02))));
  for (let i = 0; i < units; i++) {
    for (let r = 0; r < rows; r++) {
      // r = 0 is the front row
      const zOff = front * ((rows - 1) / 2 - r) * (size.z + 0.015);
      const m = p.matrix(mid + (i - (units - 1) / 2) * step, ly + size.y / 2, lz + zOff, faceYaw);
      const ref = c.addPackaging(item, m, size);
      if (r === 0) c.addUnit(item, { matrix: m, size, packaging: ref });
    }
  }
}

/** One product shown on its own (cabinets, podiums, tables): built-in shape, or uploaded model. */
function hero(ctx: FixtureCtxInternal, item: StoreShelf, k: number, lx: number, ly: number, lz: number, ry: number, maxSize: number) {
  const { p, c } = ctx;
  if (item.model_3d_url) {
    c.addModelSlot(item, p.matrix(lx, ly, lz, ry), maxSize);
    return;
  }
  const model = heroModel(item, k);
  const s = fitScale(model, maxSize);
  model.group.applyMatrix4(p.matrix(lx, ly, lz, ry, 0, 0, s));
  c.batch.addObject(model.group);
}

interface FixtureCtxInternal {
  p: Placer;
  c: FixtureBuildContext;
  type: string;
  /** the product on a spot (1-based), if the admin put one there */
  at: (tier: number) => StoreShelf | undefined;
  /** every product on the display, in spot order */
  products: StoreShelf[];
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

const cleanName = (n?: string | null) => (n || '').replace(/\s*\(Sample Listing\)/, '').trim();
const priceText = (s: StoreShelf) => {
  const price = s.discount_price || s.regular_price;
  return price ? `PKR ${Number(price).toLocaleString()}` : '';
};

/**
 * What a display's sign says. The admin's name for the display comes first; otherwise the
 * categories of the products on it. The line underneath lists the products themselves.
 */
export function displaySignText(shelf: StoreShelf, products: StoreShelf[]): { title: string; subtitle: string } | null {
  const names = [...new Set(products.map((it) => cleanName(it.product_name)).filter(Boolean))];
  const cats = [...new Set(products.map((it) => (it.product_category || '').trim()).filter(Boolean))];
  const own = (shelf.display_name || '').trim();
  if (!own && !names.length) return null; // nothing on it and no name: no sign
  const title = own || (cats.length ? cats.slice(0, 3).join(' · ') : shelf.department_name || names[0]);
  let subtitle = names.slice(0, 4).join(' · ') + (names.length > 4 ? ` +${names.length - 4} more` : '');
  if (subtitle === title) subtitle = cats[0] && cats[0] !== title ? cats[0] : '';
  return { title, subtitle };
}

/**
 * Backlit sign board on top of a display, naming what it holds — readable from a distance.
 * `both` puts the face on the back too (double-sided gondolas, islands seen from both sides).
 */
function headerSign(ctx: FixtureCtxInternal, shelf: StoreShelf, w: number, h: number, lx: number, ly: number, lz: number, ry = 0, both = false) {
  const text = displaySignText(shelf, ctx.products);
  if (!text) return;
  const { p, c } = ctx;
  const cw = w >= 1.5 ? 1536 : 1024;
  const ch = Math.max(64, Math.round((cw * h) / w));
  const key = `sign:${text.title}|${text.subtitle}|${c.palette.accent}|${cw}x${ch}`;
  const m = mat(key, () => new THREE.MeshBasicMaterial({ map: displaySignTexture(text.title, text.subtitle, c.palette.accent, cw, ch), toneMapped: false }));
  const T = 0.035;
  const board = new THREE.BoxGeometry(w + 0.03, h + 0.03, T);
  c.batch.addMatrix(board, std('#1a1815', 0.5, 0.2), p.matrix(lx, ly, lz, ry));
  board.dispose();
  const face = new THREE.PlaneGeometry(w, h);
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const off = T / 2 + 0.002;
  c.batch.addMatrix(face, m, p.matrix(lx + sn * off, ly, lz + cs * off, ry));
  if (both) c.batch.addMatrix(face, m, p.matrix(lx - sn * off, ly, lz - cs * off, ry + Math.PI));
  face.dispose();
}

/** Flat sign fixed to a panel (no board): end panels of gondolas. */
function endSign(ctx: FixtureCtxInternal, shelf: StoreShelf, w: number, h: number, lx: number, ly: number, lz: number, ry: number) {
  const text = displaySignText(shelf, ctx.products);
  if (!text) return;
  const { p, c } = ctx;
  const cw = 768;
  const ch = Math.round((cw * h) / w);
  const key = `endsign:${text.title}|${text.subtitle}|${c.palette.accent}|${cw}x${ch}`;
  const m = mat(key, () => new THREE.MeshBasicMaterial({ map: displaySignTexture(text.title, text.subtitle, c.palette.accent, cw, ch), toneMapped: false }));
  const g = new THREE.PlaneGeometry(w, h);
  c.batch.addMatrix(g, m, p.matrix(lx, ly, lz, ry));
  g.dispose();
}

/** Strip along the front edge of one shelf level: the product on it and its price, in large type. */
function shelfStrip(ctx: FixtureCtxInternal, item: StoreShelf, w: number, lx: number, ly: number, lz: number, ry = 0) {
  const name = cleanName(item.product_name);
  if (!name) return;
  const { p, c } = ctx;
  const h = 0.085;
  const cw = 1536;
  const ch = Math.round((cw * h) / w);
  const key = `strip:${item.product_id}:${c.palette.accent}:${cw}x${ch}`;
  const m = mat(key, () => new THREE.MeshBasicMaterial({ map: shelfStripTexture(name, priceText(item), c.palette.accent, cw, ch), toneMapped: false }));
  const g = new THREE.PlaneGeometry(w, h);
  c.batch.addMatrix(g, m, p.matrix(lx, ly, lz, ry));
  g.dispose();
}

function priceLabel(c: FixtureBuildContext, p: Placer, shelf: StoreShelf, lx: number, ly: number, lz: number, ry = 0, rx = 0, w = 0.42) {
  if (!shelf.product_name) return;
  const key = `label:${shelf.product_id}`;
  const m = mat(key, () => new THREE.MeshBasicMaterial({ map: labelTexture(cleanName(shelf.product_name), priceText(shelf), c.palette.accent) }));
  const g = new THREE.PlaneGeometry(w, w / 3.2);
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
  const spots: FixtureSpot[] = [];
  [1, -1].forEach((side) => {
    tiers.forEach((y, t) => {
      add(W - 0.06, 0.03, D / 2 - 0.05, 0, y, side * (D / 4 + 0.01), shelfM);
      add(W - 0.06, 0.012, 0.012, 0, y - 0.02, side * (D / 2 - 0.02), emissive('#fff3dd', 1.1));
      // spots 1–3: front shelves bottom → top; 4–6: back shelves
      const tier = side === 1 ? t + 1 : t + 4;
      const item = ctx.at(tier);
      const yaw = side === 1 ? 0 : Math.PI;
      merchandise(ctx, item, -W / 2 + 0.08, W / 2 - 0.08, y + 0.015, side * (D / 4 + 0.01), yaw, D / 2 - 0.08);
      if (item) shelfStrip(ctx, item, 1.9, 0, y - 0.062, side * (D / 2 + 0.004), yaw);
      spots.push({ tier, item, lx: 0, ly: y + 0.18, lz: side * (D / 4), w: W - 0.1, h: 0.36, d: D / 2, back: side === -1 });
    });
  });
  add(W + 0.04, 0.04, D + 0.04, 0, H + 0.02, 0, body);
  [-1, 1].forEach((side) => bayTag(c, p, shelf, side * (W / 2 + 0.03), H - 0.15, 0, side * Math.PI / 2));
  // sign on top, both faces, on two slim posts
  if (displaySignText(shelf, ctx.products)) {
    [-1, 1].forEach((sx) => add(0.035, 0.2, 0.035, sx * (W / 2 - 0.45), H + 0.14, 0, std(c.palette.metal || '#2a2723', 0.35, 0.8)));
    headerSign(ctx, shelf, W - 0.3, 0.36, 0, H + 0.42, 0, 0, true);
    // the same sign on both end panels, so the aisle reads from the walkway
    [-1, 1].forEach((side) => endSign(ctx, shelf, D - 0.14, 0.3, side * (W / 2 + 0.026), 1.02, 0, side * Math.PI / 2));
  }
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: H, dynamic: [], spots };
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
  const spots: FixtureSpot[] = [];
  [0.62, 1.1, 1.58, 2.02].forEach((y, i) => {
    add(W - 0.12, 0.028, D - 0.08, 0, y, 0.02, shelfM);
    add(W - 0.14, 0.01, 0.01, 0, y - 0.018, D / 2 - 0.04, emissive('#fff3dd', 1.1));
    const item = ctx.at(i + 1);
    merchandise(ctx, item, -W / 2 + 0.12, W / 2 - 0.12, y + 0.014, 0.02, 0, D - 0.12, i === 3 ? 0.4 : 0.42);
    if (item) shelfStrip(ctx, item, 1.7, 0, y - 0.058, D / 2 + 0.005);
    spots.push({ tier: i + 1, item, lx: 0, ly: y + 0.2, lz: 0.02, w: W - 0.2, h: 0.4, d: D - 0.1, back: false });
  });
  bayTag(c, p, shelf, W / 2 - 0.3, H - 0.12, D / 2 + 0.005);
  // backlit header strip in department colour, and the sign naming what this wall holds
  add(W - 0.2, 0.05, 0.02, 0, H - 0.04, D / 2 - 0.01, emissive(c.palette.accent, 0.9));
  headerSign(ctx, shelf, W - 0.2, 0.34, 0, H + 0.22, 0);
  return { w: W, d: D, h: H, dynamic: [], spots };
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
  const gm = glass('#e9f1f4', 0.14);
  add(W, 0.4, 0.01, 0, baseH + 0.2, D / 2, gm);
  add(W, 0.4, 0.01, 0, baseH + 0.2, -D / 2, gm);
  add(0.01, 0.4, D, -W / 2, baseH + 0.2, 0, gm);
  add(0.01, 0.4, D, W / 2, baseH + 0.2, 0, gm);
  add(W, 0.01, D, 0, baseH + 0.4, 0, gm);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(0.015, 0.4, 0.015, sx * W / 2, baseH + 0.2, sz * D / 2, std(c.palette.metal, 0.3, 0.9))));
  const spots: FixtureSpot[] = [];
  [-0.4, 0, 0.4].forEach((x, i) => {
    const item = ctx.at(i + 1);
    if (item) {
      hero(ctx, item, 0, x, baseH + 0.06, 0, 0.25, 0.3);
      priceLabel(c, p, item, x, baseH - 0.12, D / 2 + 0.004, 0, 0, 0.38);
    }
    spots.push({ tier: i + 1, item, lx: x, ly: baseH + 0.2, lz: 0, w: 0.4, h: 0.38, d: D - 0.1, back: false });
  });
  bayTag(c, p, shelf, -W / 2 + 0.22, 0.2, D / 2 + 0.004);
  if (displaySignText(shelf, ctx.products)) {
    [-1, 1].forEach((sx) => add(0.02, 0.16, 0.02, sx * (W / 2 - 0.25), baseH + 0.48, 0, std(c.palette.metal, 0.3, 0.9)));
    headerSign(ctx, shelf, W - 0.1, 0.24, 0, baseH + 0.68, 0, 0, true);
  }
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: baseH + 0.4, dynamic: [], spots };
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
  const spots: FixtureSpot[] = [];
  const feature = ctx.at(1);
  if (feature) {
    const furniture = feature.model_preset === 'armchair' || feature.model_preset === 'side_table';
    hero(ctx, feature, 0, -0.12, 0.935, -0.15, 0.4, furniture ? 0.9 : 0.45);
    priceLabel(c, p, feature, 0.35, 0.54, 0.52, 0, -Math.PI / 2.6);
  }
  spots.push({ tier: 1, item: feature, lx: -0.12, ly: 1.15, lz: -0.15, w: 0.8, h: 0.45, d: 0.8, back: false });
  // lower ring: left and right of the front
  [[2, [-1.25, -0.85, -0.45]], [3, [0.45, 0.85, 1.25]]].forEach(([tier, angles]) => {
    const item = ctx.at(tier as number);
    if (item) {
      const n = unitsFor(ctx.type, tier as number, item.facings);
      (angles as number[]).slice(0, n).forEach((a, k) => hero(ctx, item, k, Math.sin(a) * 0.6, 0.53, Math.cos(a) * 0.55, -a * 0.5, 0.26));
    }
    const am = (angles as number[])[1];
    spots.push({ tier: tier as number, item, lx: Math.sin(am) * 0.58, ly: 0.7, lz: Math.cos(am) * 0.5, w: 0.7, h: 0.35, d: 0.4, back: false });
  });
  void shelf;
  shadowDecal(c, p, 1.6, 1.6);
  return { w: 1.6, d: 1.6, h: 1.2, dynamic: [], spots };
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
  const spots: FixtureSpot[] = [];
  [-W / 4, W / 4].forEach((cx, i) => {
    const item = ctx.at(i + 1);
    if (item) {
      const n = unitsFor(ctx.type, i + 1, item.facings);
      for (let k = 0; k < n; k++) hero(ctx, item, k, cx + (k - (n - 1) / 2) * 0.4, H, k === 0 ? 0.05 : -0.15, 0.4, k === 0 ? 0.42 : 0.32);
      priceLabel(c, p, item, cx, H + 0.06, D / 2 - 0.05, 0, -Math.PI / 3);
    }
    spots.push({ tier: i + 1, item, lx: cx, ly: H + 0.22, lz: 0, w: W / 2 - 0.1, h: 0.45, d: D - 0.1, back: false });
  });
  bayTag(c, p, shelf, W / 2 - 0.25, H - 0.16, D / 2 + 0.004);
  shadowDecal(c, p, W, D);
  return { w: W, d: D + 0.1, h: H, dynamic: [], spots };
}

function mannequinFixture(ctx: FixtureCtxInternal, shelf: StoreShelf, palette: FixturePalette): FixtureResult {
  const { p, c } = ctx;
  const plinth = new THREE.CylinderGeometry(0.5, 0.52, 0.12, 40);
  c.batch.addMatrix(plinth, std(palette.body, 0.4, 0.1), p.matrix(0, 0.06, 0));
  plinth.dispose();
  const item = ctx.at(1);
  // an undressed mannequin stays neutral until the admin puts a product on it
  const col = item ? colourList(item)[0] : { name: '', hex: '#e9e6df' };
  const slot = item?.wearable_slot;
  const cfg: AvatarConfig = {
    gender: slot === 'bottom' ? 'female' : 'male',
    skinTone: '#efebe4',
    hairColor: '#efebe4',
    hairStyle: 'buzz',
    outfitColor: slot === 'top' ? col.hex : '#e9e6df',
    pantsColor: slot === 'bottom' ? col.hex : '#d9d6cf',
    shoesColor: '#2a2b2e',
    topStyle: slot === 'top' ? 'shirt' : 'tee',
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
  if (item) priceLabel(c, p, item, 0.35, 0.13, 0.48, 0, -Math.PI / 2.4);
  void shelf;
  return { w: 1.0, d: 1.0, h: 1.9, dynamic: [], spots: [{ tier: 1, item, lx: 0, ly: 1.1, lz: 0, w: 0.7, h: 1.6, d: 0.5, back: false }] };
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
  const spots: FixtureSpot[] = [];
  [-1, 1].forEach((half, i) => {
    const item = ctx.at(i + 1);
    const cx = half * W / 4;
    if (item) {
      const cols = colourList(item);
      const kind = item.wearable_slot === 'bottom' ? 'bottom' : 'top';
      const n = unitsFor(ctx.type, i + 1, item.facings);
      for (let k = 0; k < n; k++) {
        const g = garmentSilhouette(kind, cols[k % cols.length].hex);
        g.applyMatrix4(p.matrix(cx + (k - (n - 1) / 2) * 0.17, 1.5, 0, Math.PI / 2));
        c.batch.addObject(g);
      }
      priceLabel(c, p, item, half * (W / 2 + 0.02), 1.25, 0, half * Math.PI / 2);
    }
    spots.push({ tier: i + 1, item, lx: cx, ly: 1.15, lz: 0, w: W / 2 - 0.05, h: 0.8, d: 0.5, back: false });
  });
  bayTag(c, p, shelf, 0, 1.62, 0.02);
  headerSign(ctx, shelf, 1.3, 0.24, 0, 1.86, 0, 0, true);
  if (displaySignText(shelf, ctx.products)) add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), metal, 0, 1.66, 0);
  return { w: W + 0.1, d: 0.6, h: 1.6, dynamic: [], spots };
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
  [-0.5, 0.5].forEach((x) => {
    const ring = new THREE.TorusGeometry(0.3, 0.018, 8, 48);
    c.batch.addMatrix(ring, emissive('#fff1e2', 1.3), p.matrix(x, H + 0.55, -D / 2 + 0.05));
    ring.dispose();
    const mir = new THREE.CircleGeometry(0.29, 48);
    c.batch.addMatrix(mir, std('#c9d2d8', 0.02, 1.0), p.matrix(x, H + 0.55, -D / 2 + 0.045));
    mir.dispose();
  });
  const spots: FixtureSpot[] = [];
  [-0.5, 0.5].forEach((cx, i) => {
    const item = ctx.at(i + 1);
    merchandise(ctx, item, cx - 0.45, cx + 0.45, H + 0.03, 0.1, 0, D - 0.2, 0.4);
    if (item) priceLabel(c, p, item, cx, H - 0.1, D / 2 + 0.004);
    spots.push({ tier: i + 1, item, lx: cx, ly: H + 0.15, lz: 0.08, w: 0.9, h: 0.3, d: D - 0.1, back: false });
  });
  bayTag(c, p, shelf, -W / 2 + 0.22, 0.2, D / 2 + 0.004);
  headerSign(ctx, shelf, W - 0.3, 0.26, 0, H + 1.05, -D / 2 + 0.04);
  shadowDecal(c, p, W, D);
  return { w: W, d: D, h: 1.6, dynamic: [], spots };
}

function roomSet(ctx: FixtureCtxInternal, shelf: StoreShelf): FixtureResult {
  const { p, c } = ctx;
  const rug = new THREE.PlaneGeometry(2.4, 1.8);
  c.batch.addMatrix(rug, std('#d9d0c1', 0.98), p.matrix(0, 0.008, 0, 0, -Math.PI / 2));
  rug.dispose();
  const border = new THREE.PlaneGeometry(2.5, 1.9);
  c.batch.addMatrix(border, std('#8a7a63', 0.98), p.matrix(0, 0.006, 0, 0, -Math.PI / 2));
  border.dispose();
  const item = ctx.at(1);
  if (item) {
    hero(ctx, item, 0, -0.15, 0.01, -0.1, 0.35, 1.6);
    const dims = parseDims(item.dimensions_json);
    if (dims) {
      const key = `dims:${item.product_id}`;
      const m = mat(key, () => new THREE.MeshBasicMaterial({ map: labelTexture(item.product_name!.replace(/\s*\(Sample Listing\)/, ''), `W ${dims.w} × H ${dims.h} × D ${dims.d} cm`, c.palette.accent) }));
      const g = new THREE.PlaneGeometry(0.42, 0.13);
      c.batch.addMatrix(g, m, p.matrix(0.85, 0.42, 0.75, -0.3, -0.5));
      g.dispose();
      const stand = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8);
      c.batch.addMatrix(stand, std(c.palette.metal, 0.3, 0.9), p.matrix(0.85, 0.2, 0.72));
      stand.dispose();
    } else priceLabel(c, p, item, 0.85, 0.42, 0.75, -0.3, -0.5);
  }
  const pole = new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8);
  c.batch.addMatrix(pole, std('#1f2023', 0.4, 0.6), p.matrix(-1.05, 0.75, -0.7));
  pole.dispose();
  const shade = new THREE.CylinderGeometry(0.16, 0.2, 0.24, 24, 1, true);
  c.batch.addMatrix(shade, emissive('#ffe6c4', 0.85), p.matrix(-1.05, 1.55, -0.7));
  shade.dispose();
  void shelf;
  return { w: 2.5, d: 1.9, h: 1.7, dynamic: [], spots: [{ tier: 1, item, lx: -0.15, ly: 0.5, lz: -0.1, w: 1.6, h: 1.0, d: 1.4, back: false }] };
}

function fittingStation(ctx: FixtureCtxInternal, shelf: StoreShelf, palette: FixturePalette): FixtureResult {
  const { p, c } = ctx;
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    c.batch.addMatrix(g, m, p.matrix(x, y, z, ry));
    g.dispose();
  };
  add(2.8, 0.08, 1.6, 0, 0.04, 0, std(palette.shelf, 0.35, 0.05));
  [-0.95, 0, 0.95].forEach((x, i) => {
    const ry = i === 0 ? 0.35 : i === 2 ? -0.35 : 0;
    add(0.86, 2.1, 0.05, x, 1.13, -0.7 + Math.abs(x) * 0.18, std(palette.metal, 0.3, 0.8), ry);
    add(0.78, 2.0, 0.01, x + Math.sin(ry) * 0.03, 1.13, -0.67 + Math.abs(x) * 0.18, std('#cfd8de', 0.02, 1.0), ry);
  });
  [-1.42, 1.42].forEach((x) => add(0.04, 2.0, 0.04, x, 1.1, -0.55, emissive('#fff2e2', 1.2)));
  const item = ctx.at(1);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.6), new THREE.MeshBasicMaterial({ color: '#111' }));
  screen.applyMatrix4(p.matrix(1.05, 1.35, 0.28, -0.8));
  add(1.12, 0.68, 0.04, 1.06, 1.35, 0.26, std('#0e0f11', 0.4, 0.3), -0.8);
  add(0.05, 1.1, 0.05, 1.1, 0.6, 0.2, std(palette.metal, 0.3, 0.8));
  const name = item?.product_name ? item.product_name.replace(/\s*\(Sample Listing\)/, '') : '';
  const tex = simpleScreenTexture(shelf.featured_label || 'Virtual try-on', [name ? `Try ${name}` : 'Products arrive here soon', 'Choose “Explore Product” → Try-On'], palette.accent, 768, 460);
  (screen.material as THREE.MeshBasicMaterial).map = tex;
  (screen.material as THREE.MeshBasicMaterial).color.set('#ffffff');
  const stool = new THREE.CylinderGeometry(0.2, 0.18, 0.46, 24);
  c.batch.addMatrix(stool, std(palette.accent, 0.8), p.matrix(-1.0, 0.31, 0.45));
  stool.dispose();
  const pod = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 32);
  c.batch.addMatrix(pod, std(palette.body, 0.4, 0.1), p.matrix(0.6, 0.5, 0.45));
  pod.dispose();
  if (item && item.wearable_slot !== 'top' && item.wearable_slot !== 'bottom') hero(ctx, item, 0, 0.6, 1.0, 0.45, 0.3, 0.3);
  return { w: 2.9, d: 1.7, h: 2.2, screen, dynamic: [screen], spots: [{ tier: 1, item, lx: 0.6, ly: 1.15, lz: 0.45, w: 0.5, h: 0.4, d: 0.5, back: false }] };
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
  const spots: FixtureSpot[] = [];
  for (let row = 0; row < 5; row++) {
    const y = 0.45 + row * 0.42;
    const item = ctx.at(row + 1);
    const n = item ? unitsFor(ctx.type, row + 1, item.facings) : 0;
    const cols = item ? colourList(item) : [];
    for (let col = 0; col < 5; col++) {
      const x = -W / 2 + 0.27 + col * 0.49;
      add(0.38, 0.014, 0.24, x, y, -0.02, std(c.palette.shelf, 0.35, 0.05), -0.18);
      add(0.36, 0.008, 0.008, x, y - 0.012, 0.1, emissive('#fff3dd', 1));
      if (item && col < n) {
        if (item.model_3d_url) c.addModelSlot(item, p.matrix(x, y + 0.03, -0.02), 0.32);
        else {
          const cl = cols[col % cols.length];
          const shoe = buildShoe(cl.hex, /gum/i.test(cl.name) ? '#b98b55' : '#ecebe6');
          shoe.group.applyMatrix4(p.matrix(x, y + 0.03, -0.02, Math.PI / 2 - 0.5, -0.18));
          c.batch.addObject(shoe.group);
        }
      }
    }
    if (item) shelfStrip(ctx, item, 1.6, 0, y - 0.07, 0.13);
    spots.push({ tier: row + 1, item, lx: 0, ly: y + 0.15, lz: 0, w: W - 0.1, h: 0.36, d: D, back: false });
  }
  bayTag(c, p, shelf, W / 2 - 0.25, H - 0.1, -D / 2 + 0.03);
  headerSign(ctx, shelf, W - 0.2, 0.34, 0, H + 0.2, -D / 2 + 0.05);
  return { w: W, d: D + 0.1, h: H, dynamic: [], spots };
}

/* ============================================================================================== */

/**
 * Build one display. `items` are the products the admin put on its spots (each row carries the
 * product's data plus `tier` = spot and `facings` = units to show). Empty spots stay empty.
 */
export function buildFixture(c: FixtureBuildContext, shelf: StoreShelf, items: StoreShelf[], x: number, z: number, yaw: number): FixtureResult {
  const type = shelf.shelf_type || 'gondola';
  const ctx: FixtureCtxInternal = {
    p: new Placer(x, z, yaw),
    c,
    type,
    // only real, published products (a row without a product name is never drawn)
    at: (tier) => items.find((it) => it.product_id && it.product_name && (it.tier || 1) === tier),
    products: items.filter((it) => it.product_id && it.product_name).sort((a, b) => (a.tier || 1) - (b.tier || 1)),
  };
  switch (type) {
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
