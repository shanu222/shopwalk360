/**
 * ShopWalk 360 — décor: tiled floors, realistic planted greenery, department paintings and wall lettering.
 *
 * Everything is generated once (canvas textures, merged geometry), so none of it costs anything per frame.
 */
import * as THREE from 'three';
import { seeded, StaticBatcher } from './materials';
import { FONT } from './signage';

/* ============================================================================================== *
 * Small helpers
 * ============================================================================================== */

const texCache = new Map<string, THREE.CanvasTexture>();

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; mips?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.mips === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  return t;
}

function cachedTex(key: string, make: () => THREE.CanvasTexture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** Release every décor texture (called when the store is torn down). */
export function disposeDecorCache() {
  texCache.forEach((t) => t.dispose());
  texCache.clear();
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rnd: () => number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function veins(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, color: string, count: number, rnd: () => number, strength = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  for (let v = 0; v < count; v++) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = (0.05 + rnd() * 0.18) * strength;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    let x = x0 + rnd() * w;
    let y = y0 - 10;
    ctx.moveTo(x, y);
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const nx = x + (rnd() - 0.5) * w * 0.45;
      const ny = y + (h + 20) / steps;
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * w * 0.3, (y + ny) / 2, nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

const C = (hex: string) => new THREE.Color(hex);
function shade(hex: string, l: number, s = 0) {
  const c = C(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s + s, 0, 1), THREE.MathUtils.clamp(hsl.l + l, 0, 1));
  return '#' + c.getHexString();
}
function hue(hex: string, dh: number, s?: number, l?: number) {
  const c = C(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + dh + 1) % 1, s ?? hsl.s, l ?? hsl.l);
  return '#' + c.getHexString();
}
function rgba(hex: string, a: number) {
  const c = C(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/* ============================================================================================== *
 * Floors
 * ============================================================================================== */

/**
 * Lobby: polished marble slabs with small dark cabochon insets at the corners — the classic
 * hotel-lobby pattern. One texture = 2 × 2 slabs.
 */
export function cabochonMarbleTexture() {
  return cachedTex('floor:cabochon', () => {
    const S = 1024;
    const c = canvasOf(S, S);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(101);
    const cell = S / 2;
    const tones = ['#efe9df', '#e9e2d6', '#f2ede4', '#e6dfd2'];
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const x = tx * cell;
        const y = ty * cell;
        const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
        g.addColorStop(0, tones[(tx + ty * 2) % 4]);
        g.addColorStop(1, shade(tones[(tx + ty * 2 + 1) % 4], -0.015));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cell, cell);
        veins(ctx, x, y, cell, cell, '#a8987c', 6, rnd);
        veins(ctx, x, y, cell, cell, '#cfc2ab', 4, rnd, 1.4);
      }
    }
    grain(ctx, S, S, 7, rnd);
    // grout
    ctx.strokeStyle = 'rgba(70,58,44,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, S);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(S, i * cell);
      ctx.stroke();
    }
    // cabochons: dark marble diamonds with a brass edge, on every slab corner
    const cab = cell * 0.13;
    for (let iy = 0; iy <= 2; iy++) {
      for (let ix = 0; ix <= 2; ix++) {
        const cx = ix * cell;
        const cy = iy * cell;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        const dg = ctx.createLinearGradient(-cab, -cab, cab, cab);
        dg.addColorStop(0, '#2b2c30');
        dg.addColorStop(1, '#16171a');
        ctx.fillStyle = dg;
        ctx.fillRect(-cab, -cab, cab * 2, cab * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(-cab, -cab + rnd() * cab * 2);
          ctx.quadraticCurveTo(0, (rnd() - 0.5) * cab, cab, -cab + rnd() * cab * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = '#b48e57';
        ctx.lineWidth = 4;
        ctx.strokeRect(-cab, -cab, cab * 2, cab * 2);
        ctx.restore();
      }
    }
    return tex(c, { repeat: true });
  });
}

/** Galleria: harlequin — diamonds of warm cream and taupe marble set on the diagonal. */
export function harlequinMarbleTexture() {
  return cachedTex('floor:harlequin', () => {
    const S = 1024;
    const c = canvasOf(S, S);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(202);
    ctx.fillStyle = '#ece6db';
    ctx.fillRect(0, 0, S, S);
    const h = S / 2;
    // diamonds centred on a half-step grid tile seamlessly
    const pts: [number, number, boolean][] = [];
    for (let iy = -1; iy <= 2; iy++) for (let ix = -1; ix <= 2; ix++) pts.push([ix * h, iy * h, (ix + iy) % 2 === 0]);
    for (const [cx, cy, light] of pts) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2);
      ctx.lineTo(cx + h / 2, cy);
      ctx.lineTo(cx, cy + h / 2);
      ctx.lineTo(cx - h / 2, cy);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx - h / 2, cy - h / 2, cx + h / 2, cy + h / 2);
      g.addColorStop(0, light ? '#f1ebe1' : '#c9b9a0');
      g.addColorStop(1, light ? '#e7dfd2' : '#bba98d');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      veins(ctx, cx - h / 2, cy - h / 2, h, h, light ? '#b3a284' : '#8e7a5c', 4, rnd);
      ctx.restore();
      ctx.strokeStyle = 'rgba(80,64,46,0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2);
      ctx.lineTo(cx + h / 2, cy);
      ctx.lineTo(cx, cy + h / 2);
      ctx.lineTo(cx - h / 2, cy);
      ctx.closePath();
      ctx.stroke();
    }
    grain(ctx, S, S, 6, rnd);
    return tex(c, { repeat: true });
  });
}

/**
 * Large-format porcelain / stone tiles (department floors). `cols`×`rows` tiles per texture,
 * optionally running-bond staggered, with soft stone veining or terrazzo chips and crisp grout.
 */
export function porcelainTileTexture(base: string, opts: { vein?: string; chips?: string[]; cols?: number; rows?: number; stagger?: boolean; grout?: string; inlay?: string; seed?: number } = {}) {
  const key = `floor:tile:${base}:${JSON.stringify(opts)}`;
  return cachedTex(key, () => {
    const S = 1024;
    const c = canvasOf(S, S);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(opts.seed ?? 31);
    const cols = opts.cols ?? 2;
    const rows = opts.rows ?? 2;
    const tw = S / cols;
    const th = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = opts.stagger && r % 2 ? tw / 2 : 0;
      for (let k = -1; k <= cols; k++) {
        const x = k * tw + off;
        const y = r * th;
        ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.035);
        ctx.fillRect(x, y, tw, th);
        if (opts.vein) veins(ctx, x, y, tw, th, opts.vein, 3, rnd, 0.8);
        if (opts.chips) {
          for (let i = 0; i < 260; i++) {
            ctx.fillStyle = opts.chips[Math.floor(rnd() * opts.chips.length)];
            ctx.globalAlpha = 0.55 + rnd() * 0.4;
            const s = 1.5 + rnd() * 7;
            ctx.beginPath();
            ctx.ellipse(x + rnd() * tw, y + rnd() * th, s, s * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        // a soft sheen across each tile so they read as individual pieces
        const sh = ctx.createLinearGradient(x, y, x + tw, y + th);
        sh.addColorStop(0, 'rgba(255,255,255,0.05)');
        sh.addColorStop(1, 'rgba(0,0,0,0.04)');
        ctx.fillStyle = sh;
        ctx.fillRect(x, y, tw, th);
      }
    }
    grain(ctx, S, S, 6, rnd);
    ctx.strokeStyle = opts.grout || 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * th);
      ctx.lineTo(S, r * th);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const off = opts.stagger && r % 2 ? tw / 2 : 0;
      for (let k = 0; k <= cols; k++) {
        ctx.beginPath();
        ctx.moveTo(k * tw + off, r * th);
        ctx.lineTo(k * tw + off, (r + 1) * th);
        ctx.stroke();
      }
    }
    if (opts.inlay) {
      // thin metal inlay framing each texture repeat
      ctx.strokeStyle = opts.inlay;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, S - 6, S - 6);
    }
    return tex(c, { repeat: true });
  });
}

/* ============================================================================================== *
 * Plants
 * ============================================================================================== */

function leafTexture() {
  return cachedTex('plant:leaf', () => {
    const W = 256;
    const H = 512;
    const c = canvasOf(W, H);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(7);
    // fiddle-leaf / ficus: broad, wavy, rounded tip
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 4);
    ctx.bezierCurveTo(W * 0.08, H * 0.82, W * -0.02, H * 0.25, W * 0.28, H * 0.08);
    ctx.bezierCurveTo(W * 0.4, H * 0.0, W * 0.6, H * 0.0, W * 0.72, H * 0.08);
    ctx.bezierCurveTo(W * 1.02, H * 0.25, W * 0.92, H * 0.82, W / 2, H - 4);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#5f8f43');
    g.addColorStop(0.55, '#3e6f2c');
    g.addColorStop(1, '#2b5220');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // sheen
    const sh = ctx.createRadialGradient(W * 0.35, H * 0.3, 10, W * 0.35, H * 0.3, W * 0.7);
    sh.addColorStop(0, 'rgba(220,255,190,0.22)');
    sh.addColorStop(1, 'rgba(220,255,190,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, H);
    // veins
    ctx.strokeStyle = 'rgba(200,230,150,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.quadraticCurveTo(W * 0.52, H * 0.5, W * 0.5, H * 0.06);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      const y = H * (0.18 + i * 0.085);
      [-1, 1].forEach((s) => {
        ctx.strokeStyle = 'rgba(190,225,140,0.38)';
        ctx.beginPath();
        ctx.moveTo(W / 2, y);
        ctx.quadraticCurveTo(W / 2 + s * W * 0.2, y - 18, W / 2 + s * W * (0.38 + rnd() * 0.06), y - 50 - rnd() * 20);
        ctx.stroke();
      });
    }
    ctx.restore();
    // lighter rim
    ctx.strokeStyle = 'rgba(160,200,110,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return tex(c, { mips: true });
  });
}

function frondTexture() {
  return cachedTex('plant:frond', () => {
    const W = 256;
    const H = 1024;
    const c = canvasOf(W, H);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(11);
    // kentia / areca palm frond: arching rachis with many narrow leaflets
    for (let i = 0; i < 34; i++) {
      const t = i / 34;
      const y = H * (0.06 + t * 0.9);
      const len = W * (0.48 - Math.abs(t - 0.45) * 0.42) * (0.9 + rnd() * 0.2);
      [-1, 1].forEach((s) => {
        const g = ctx.createLinearGradient(W / 2, y, W / 2 + s * len, y - 60);
        g.addColorStop(0, '#2f5a22');
        g.addColorStop(1, rnd() > 0.5 ? '#5f9441' : '#4f8436');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(W / 2, y);
        ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - 30, W / 2 + s * len, y - 70 - rnd() * 30);
        ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - 18, W / 2, y + 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,230,140,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2, y);
        ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - 26, W / 2 + s * len * 0.95, y - 66);
        ctx.stroke();
      });
    }
    ctx.strokeStyle = '#6d8a3f';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(W / 2, H * 0.03);
    ctx.stroke();
    return tex(c, { mips: true });
  });
}

function foliageTexture(seed: number, tones: string[]) {
  return cachedTex(`plant:foliage:${seed}:${tones.join()}`, () => {
    const S = 512;
    const c = canvasOf(S, S);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    // a rounded cloud of small leaves, densest in the middle
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * S * 0.45 * (0.82 + 0.18 * Math.sin(a * 5 + seed));
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r * 0.9;
      const depth = r / (S * 0.45);
      const t = tones[Math.floor(rnd() * tones.length)];
      ctx.fillStyle = shade(t, (0.5 - depth) * 0.08 + (y < S / 2 ? 0.04 : -0.04));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI * 2);
      const L = 9 + rnd() * 10;
      ctx.beginPath();
      ctx.ellipse(0, 0, L, L * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return tex(c, { mips: true });
  });
}

function leafMaterial(map: THREE.Texture, key: string) {
  return mat2(`leafmat:${key}`, () => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 }));
}

const matCache2 = new Map<string, THREE.Material>();
function mat2(key: string, make: () => THREE.Material) {
  let m = matCache2.get(key);
  if (!m) {
    m = make();
    matCache2.set(key, m);
  }
  return m;
}
export function disposeDecorMaterials() {
  matCache2.forEach((m) => m.dispose());
  matCache2.clear();
}

/** A plane bent along its length (arching fronds / cupped leaves). */
function bentCard(w: number, h: number, bend: number, cup = 0, segs = 8) {
  const g = new THREE.PlaneGeometry(w, h, 2, segs);
  g.translate(0, h / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = y / h;
    const ang = bend * t;
    // walk along an arc in the y–z plane
    const r = Math.abs(bend) > 1e-3 ? h / bend : 0;
    const ny = r ? Math.sin(ang) * r : y;
    const nz = r ? (1 - Math.cos(ang)) * r : 0;
    const cupZ = cup * (x / (w / 2)) ** 2 * w * 0.25;
    p.setXYZ(i, x, ny, nz + cupZ);
  }
  g.computeVertexNormals();
  return g;
}

function planter(b: StaticBatcher, x: number, z: number, r: number, h: number, color: string, ry = 0) {
  // elegant tapered planter with a rolled lip (lathe profile)
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.7, 0),
    new THREE.Vector2(r * 0.78, h * 0.08),
    new THREE.Vector2(r * 0.94, h * 0.55),
    new THREE.Vector2(r, h * 0.92),
    new THREE.Vector2(r * 1.04, h),
    new THREE.Vector2(r * 0.92, h * 1.0),
    new THREE.Vector2(r * 0.9, h * 0.93),
  ];
  const lathe = new THREE.LatheGeometry(pts, 40);
  b.add(lathe, mat2(`pot:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 })), x, 0, z, ry);
  lathe.dispose();
  const soil = new THREE.CircleGeometry(r * 0.9, 32);
  b.add(soil, mat2('soil', () => new THREE.MeshStandardMaterial({ color: '#3a2b20', roughness: 1 })), x, h * 0.9, z, 0, -Math.PI / 2);
  soil.dispose();
  // a few river pebbles on the soil
  const rnd = seeded(Math.round(x * 13 + z * 7));
  for (let i = 0; i < 9; i++) {
    const pb = new THREE.SphereGeometry(0.025 + rnd() * 0.02, 8, 6);
    const a = rnd() * Math.PI * 2;
    const rr = rnd() * r * 0.75;
    b.add(pb, mat2('pebble', () => new THREE.MeshStandardMaterial({ color: '#d9d4cb', roughness: 0.5 })), x + Math.cos(a) * rr, h * 0.9 + 0.01, z + Math.sin(a) * rr, 0, 0, 0, 1, 0.55, 1);
    pb.dispose();
  }
}

/** Kentia palm in a tall planter (galleria). Footprint radius ≈ 0.5 m. */
export function addPalm(b: StaticBatcher, x: number, z: number, seed = 1, potColor = '#ece8e1') {
  const rnd = seeded(seed * 97 + 3);
  const potH = 0.78;
  planter(b, x, z, 0.42, potH, potColor);
  const fm = leafMaterial(frondTexture(), 'frond');
  const stem = mat2('palmstem', () => new THREE.MeshStandardMaterial({ color: '#6b7d3c', roughness: 0.8 }));
  const n = 11;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const tilt = 0.25 + rnd() * 0.5; // outward lean from vertical
    const len = 1.35 + rnd() * 0.55;
    const card = bentCard(0.62, len, 1.3 + rnd() * 0.6);
    const o = new THREE.Object3D();
    o.position.set(x + Math.cos(az) * 0.05, potH * 0.9 + 0.25 + rnd() * 0.25, z + Math.sin(az) * 0.05);
    o.rotation.set(0, 0, 0);
    o.rotateY(-az + Math.PI / 2);
    o.rotateX(tilt);
    o.rotateY((rnd() - 0.5) * 0.4); // slight twist of the frond
    o.updateMatrix();
    b.addMatrix(card, fm, o.matrix);
    card.dispose();
    // bare stem from the soil to where the leaflets begin
    const s = new THREE.CylinderGeometry(0.012, 0.018, 0.45, 5);
    const so = new THREE.Object3D();
    so.position.set(x + Math.cos(az) * 0.04, potH * 0.9 + 0.2, z + Math.sin(az) * 0.04);
    so.rotateY(-az + Math.PI / 2);
    so.rotateX(tilt * 0.6);
    so.updateMatrix();
    b.addMatrix(s, stem, so.matrix);
    s.dispose();
  }
}

/** Fiddle-leaf fig: slim trunk with large glossy leaves (lobby corners). */
export function addFiddleFig(b: StaticBatcher, x: number, z: number, seed = 1, potColor = '#2b2c30') {
  const rnd = seeded(seed * 53 + 9);
  const potH = 0.72;
  planter(b, x, z, 0.44, potH, potColor);
  const bark = mat2('bark', () => new THREE.MeshStandardMaterial({ color: '#6a5442', roughness: 0.9 }));
  const lm = leafMaterial(leafTexture(), 'fig');
  const top = 2.6 + rnd() * 0.3;
  // trunk with a gentle lean and two branches
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, top - potH * 0.9, 7);
  b.add(trunk, bark, x, potH * 0.9 + (top - potH * 0.9) / 2, z, 0, 0, 0.05);
  trunk.dispose();
  const anchors: THREE.Vector3[] = [];
  for (let k = 0; k < 2; k++) {
    const az = rnd() * Math.PI * 2;
    const by = 1.7 + k * 0.35;
    const br = new THREE.CylinderGeometry(0.02, 0.028, 0.8, 6);
    const o = new THREE.Object3D();
    o.position.set(x + Math.cos(az) * 0.18, by + 0.3, z + Math.sin(az) * 0.18);
    o.rotateY(-az);
    o.rotateZ(0.55);
    o.updateMatrix();
    b.addMatrix(br, bark, o.matrix);
    br.dispose();
    anchors.push(new THREE.Vector3(x + Math.cos(az) * 0.36, by + 0.62, z + Math.sin(az) * 0.36));
  }
  anchors.push(new THREE.Vector3(x, top, z));
  // leaves spiral up the upper trunk and branches, facing outwards and upwards
  const leaves = 46;
  for (let i = 0; i < leaves; i++) {
    const a = anchors[i % anchors.length];
    const t = rnd();
    const az = rnd() * Math.PI * 2;
    const spread = 0.12 + t * 0.32;
    const px = a.x + Math.cos(az) * spread;
    const pz = a.z + Math.sin(az) * spread;
    const py = a.y - 0.75 + t * 0.85;
    const size = 0.26 + rnd() * 0.12;
    const card = bentCard(size, size * 1.5, 0.5 + rnd() * 0.5, 0.35);
    const o = new THREE.Object3D();
    o.position.set(px, py, pz);
    o.rotateY(-az + Math.PI / 2);
    o.rotateX(0.5 + rnd() * 0.6);
    o.rotateZ((rnd() - 0.5) * 0.8);
    o.updateMatrix();
    b.addMatrix(card, lm, o.matrix);
    card.dispose();
  }
}

/** Street tree for the plaza: branching trunk with layered foliage clouds. */
export function addTree(b: StaticBatcher, x: number, z: number, seed = 1) {
  const rnd = seeded(seed * 31 + 5);
  const bark = mat2('treebark', () => new THREE.MeshStandardMaterial({ color: '#5d4a3a', roughness: 0.95 }));
  const trunkH = 2.4;
  const trunk = new THREE.CylinderGeometry(0.1, 0.15, trunkH, 9);
  b.add(trunk, bark, x, 0.55 + trunkH / 2, z);
  trunk.dispose();
  const tones = [['#3f6a32', '#4f7d3b', '#5e8c45', '#355b2a'], ['#456f35', '#5a8742', '#6b9650', '#3a5f2c']];
  const fol = leafMaterial(foliageTexture(41 + (seed % 2), tones[seed % 2]), `tree:${seed % 2}`);
  // limbs
  for (let k = 0; k < 4; k++) {
    const az = (k / 4) * Math.PI * 2 + rnd();
    const limb = new THREE.CylinderGeometry(0.04, 0.07, 1.3, 6);
    const o = new THREE.Object3D();
    o.position.set(x + Math.cos(az) * 0.35, 0.55 + trunkH + 0.25, z + Math.sin(az) * 0.35);
    o.rotateY(-az);
    o.rotateZ(0.7);
    o.updateMatrix();
    b.addMatrix(limb, bark, o.matrix);
    limb.dispose();
  }
  // crown: clusters of crossed foliage cards
  const clusters = 16;
  for (let i = 0; i < clusters; i++) {
    const az = rnd() * Math.PI * 2;
    const r = 0.3 + rnd() * 0.95;
    const cy = 0.55 + trunkH + 0.5 + rnd() * 1.7 - r * 0.25;
    const s = 1.1 + rnd() * 0.7;
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(s, s);
      const o = new THREE.Object3D();
      o.position.set(x + Math.cos(az) * r, cy, z + Math.sin(az) * r);
      o.rotation.set(k === 2 ? -Math.PI / 2 + (rnd() - 0.5) * 0.4 : 0, (k * Math.PI) / 3 + rnd(), 0);
      o.updateMatrix();
      b.addMatrix(p, fol, o.matrix);
      p.dispose();
    }
  }
}

/* ============================================================================================== *
 * Paintings
 * ============================================================================================== */

export type PaintStyle = 'circuit' | 'landscape' | 'geometric' | 'colorfield' | 'gestural' | 'goldleaf' | 'fluid' | 'motion';

interface Palette {
  accent: string;
  deep: string;
  soft: string;
  comp: string;
  cream: string;
  ink: string;
}

function paletteFor(accent: string): Palette {
  return {
    accent,
    deep: shade(accent, -0.22),
    soft: shade(accent, 0.25, -0.15),
    comp: hue(accent, 0.5, 0.35, 0.55),
    cream: '#f1e9da',
    ink: '#1d1c1f',
  };
}

const STYLE_PAINTERS: Record<string, PaintStyle[]> = {
  tech: ['circuit', 'geometric', 'motion'],
  kitchen: ['landscape', 'colorfield', 'fluid'],
  warm_wood: ['landscape', 'colorfield', 'gestural'],
  boutique: ['gestural', 'fluid', 'colorfield'],
  luxury: ['goldleaf', 'gestural', 'colorfield'],
  spa: ['colorfield', 'fluid', 'landscape'],
  gym: ['motion', 'geometric', 'gestural'],
  garage: ['motion', 'circuit', 'geometric'],
  travel: ['landscape', 'geometric', 'colorfield'],
  study: ['geometric', 'colorfield', 'landscape'],
  gallery: ['fluid', 'geometric', 'gestural'],
  concrete: ['geometric', 'motion', 'colorfield'],
};

const TITLES: Record<PaintStyle, string[]> = {
  circuit: ['Signal', 'Current', 'Wavelength'],
  landscape: ['Golden Hour', 'Far Hills', 'Morning Light'],
  geometric: ['Composition No. 7', 'Balance', 'Form & Light'],
  colorfield: ['Quiet Room', 'Warmth', 'Still'],
  gestural: ['Movement', 'Flourish', 'Grace'],
  goldleaf: ['Gilded', 'Aurum', 'Midnight Gold'],
  fluid: ['Tides', 'Bloom', 'Flow'],
  motion: ['Velocity', 'Rush', 'Momentum'],
};

/** The paintings a department shows, chosen from its interior style. */
export function paintingsFor(style: string | undefined, count: number) {
  const list = STYLE_PAINTERS[style || 'gallery'] || STYLE_PAINTERS.gallery;
  return Array.from({ length: count }, (_, i) => {
    const s = list[i % list.length];
    return { style: s, title: TITLES[s][Math.floor(i / list.length) % TITLES[s].length] };
  });
}

export function paintingTexture(style: PaintStyle, accent: string, seed: number, lowDetail = false) {
  return cachedTex(`paint:${style}:${accent}:${seed}:${lowDetail}`, () => {
    const W = lowDetail ? 640 : 1024;
    const H = Math.round(W * 0.66);
    const c = canvasOf(W, H);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    const p = paletteFor(accent);
    PAINTERS[style](ctx, W, H, p, rnd);
    // canvas weave + grain so it reads as paint on linen, not a screen
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = 0; x < W; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    grain(ctx, W, H, 12, rnd);
    return tex(c, { mips: true });
  });
}

type Painter = (ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, rnd: () => number) => void;

const PAINTERS: Record<PaintStyle, Painter> = {
  landscape: (ctx, W, H, p, rnd) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, shade(p.soft, 0.12));
    sky.addColorStop(0.6, '#f6dcc0');
    sky.addColorStop(1, '#f4c99e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // sun with halo
    const sx = W * (0.25 + rnd() * 0.5);
    const sy = H * 0.36;
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.3);
    halo.addColorStop(0, 'rgba(255,240,210,0.9)');
    halo.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fbe7c6';
    ctx.beginPath();
    ctx.arc(sx, sy, W * 0.06, 0, Math.PI * 2);
    ctx.fill();
    // layered hills, receding into haze
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const t = l / (layers - 1);
      const base = H * (0.48 + t * 0.12);
      const col = THREE.MathUtils.lerp(0.18, -0.25, t);
      ctx.fillStyle = shade(l % 2 ? p.deep : p.accent, col, -0.1 * (1 - t));
      ctx.beginPath();
      ctx.moveTo(0, H);
      let y = base + (rnd() - 0.5) * 40;
      ctx.lineTo(0, y);
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const x = (W / steps) * s;
        const ny = base + (rnd() - 0.5) * H * 0.18 * (1 - t * 0.4);
        ctx.quadraticCurveTo(x - W / steps / 2, Math.min(y, ny) - 30 * rnd(), x, ny);
        y = ny;
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // haze between layers
      ctx.fillStyle = 'rgba(255,236,214,0.12)';
      ctx.fillRect(0, 0, W, H);
    }
  },
  colorfield: (ctx, W, H, p, rnd) => {
    ctx.fillStyle = shade(p.cream, -0.05);
    ctx.fillRect(0, 0, W, H);
    const bands = [
      [0.07, 0.08, 0.86, 0.42, p.accent],
      [0.07, 0.54, 0.86, 0.36, p.deep],
    ] as const;
    for (const [x, y, w, h, col] of bands) {
      // many translucent glazes with soft, uneven edges
      for (let k = 0; k < 26; k++) {
        ctx.fillStyle = rgba(shade(col, (rnd() - 0.5) * 0.08), 0.08);
        const j = 6 + rnd() * 10;
        ctx.beginPath();
        ctx.roundRect(W * x + (rnd() - 0.5) * j, H * y + (rnd() - 0.5) * j, W * w + (rnd() - 0.5) * j, H * h + (rnd() - 0.5) * j, 18);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgba(p.comp, 0.18);
    ctx.fillRect(W * 0.07, H * 0.5, W * 0.86, H * 0.035);
  },
  geometric: (ctx, W, H, p, rnd) => {
    ctx.fillStyle = p.cream;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(W * 0.36, H * 0.48, H * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.ink;
    ctx.fillRect(W * 0.56, H * 0.12, W * 0.08, H * 0.76);
    ctx.fillStyle = p.comp;
    ctx.beginPath();
    ctx.arc(W * 0.74, H * 0.7, H * 0.18, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = shade(p.accent, 0.25);
    ctx.fillRect(W * 0.66, H * 0.18, W * 0.22, H * 0.2);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W * 0.1, H * 0.86);
    ctx.lineTo(W * 0.9, H * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W * 0.36, H * 0.48, H * 0.4, -0.4, 1.2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? p.deep : p.ink;
      ctx.beginPath();
      ctx.arc(W * (0.12 + i * 0.03), H * 0.18, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    void rnd;
  },
  gestural: (ctx, W, H, p, rnd) => {
    ctx.fillStyle = '#f3ede3';
    ctx.fillRect(0, 0, W, H);
    const cols = [p.accent, p.deep, p.comp, p.ink];
    for (let s = 0; s < 7; s++) {
      const col = cols[s % cols.length];
      const x0 = rnd() * W * 0.4;
      const y0 = H * (0.2 + rnd() * 0.6);
      const x1 = W * (0.55 + rnd() * 0.45);
      const y1 = H * (0.2 + rnd() * 0.6);
      const cx = W * (0.3 + rnd() * 0.4);
      const cy = H * (rnd() * 1.0);
      const width = H * (0.05 + rnd() * 0.12);
      // a bristle brush: many thin parallel lines with gaps
      for (let k = 0; k < 40; k++) {
        const o = (k / 40 - 0.5) * width;
        ctx.strokeStyle = rgba(shade(col, (rnd() - 0.5) * 0.1), 0.25 + rnd() * 0.4);
        ctx.lineWidth = 1 + rnd() * 2.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + o);
        ctx.quadraticCurveTo(cx, cy + o, x1 - rnd() * 40, y1 + o);
        ctx.stroke();
      }
    }
  },
  goldleaf: (ctx, W, H, p, rnd) => {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#16171b');
    bg.addColorStop(1, shade(p.deep, -0.25));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // gold leaf flakes torn along a sweeping diagonal
    for (let i = 0; i < 160; i++) {
      const t = rnd();
      const x = W * t + (rnd() - 0.5) * W * 0.25;
      const y = H * (0.75 - t * 0.5) + (rnd() - 0.5) * H * 0.3;
      const s = 8 + rnd() * 38;
      const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
      g.addColorStop(0, '#f6dc94');
      g.addColorStop(0.5, '#c8a050');
      g.addColorStop(1, '#8a6a2a');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.55 + rnd() * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.6);
      for (let k = 0; k < 6; k++) ctx.lineTo(x + (rnd() - 0.5) * s * 2, y + (rnd() - 0.5) * s * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(246,220,148,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.08, H * 0.9);
    ctx.bezierCurveTo(W * 0.4, H * 0.7, W * 0.6, H * 0.4, W * 0.94, H * 0.12);
    ctx.stroke();
  },
  fluid: (ctx, W, H, p, rnd) => {
    // concentric poured rings, then a swirl distortion
    const cols = [p.cream, p.accent, '#ffffff', p.deep, p.comp, p.soft];
    ctx.fillStyle = p.cream;
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r++) {
      const cx = W * (0.2 + rnd() * 0.6);
      const cy = H * (0.2 + rnd() * 0.6);
      for (let k = 14; k > 0; k--) {
        ctx.fillStyle = cols[(k + r) % cols.length];
        ctx.beginPath();
        ctx.ellipse(cx, cy, k * W * 0.022, k * H * 0.03, rnd(), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const src = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const a = 18 + rnd() * 10;
    const f = 0.012 + rnd() * 0.006;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, Math.round(x + Math.sin(y * f) * a + Math.sin((x + y) * f * 0.6) * a * 0.6)));
        const sy = Math.min(H - 1, Math.max(0, Math.round(y + Math.cos(x * f) * a)));
        const si = (sy * W + sx) * 4;
        const di = (y * W + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    // cells / lacing highlights
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  circuit: (ctx, W, H, p, rnd) => {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1118');
    bg.addColorStop(1, shade(p.deep, -0.3));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const step = W / 24;
    for (let i = 0; i < 46; i++) {
      let x = Math.round((rnd() * W) / step) * step;
      let y = Math.round((rnd() * H) / step) * step;
      const col = rnd() > 0.3 ? p.accent : p.comp;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (rnd() > 0.5) x += (rnd() > 0.5 ? 1 : -1) * step * (1 + Math.floor(rnd() * 4));
        else y += (rnd() > 0.5 ? 1 : -1) * step * (1 + Math.floor(rnd() * 3));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // a large luminous ring as the focal point
    ctx.strokeStyle = rgba(p.accent, 0.8);
    ctx.lineWidth = 6;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(W * 0.62, H * 0.46, H * 0.27, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  motion: (ctx, W, H, p, rnd) => {
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, '#121317');
    bg.addColorStop(1, '#24262c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.32);
    for (let i = 0; i < 70; i++) {
      const y = (rnd() - 0.5) * H * 1.4;
      const len = W * (0.2 + rnd() * 0.8);
      const x = (rnd() - 0.5) * W;
      const col = rnd() > 0.35 ? p.accent : rnd() > 0.5 ? p.comp : '#f2efe8';
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(1, rgba(col, 0.9));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, len, 2 + rnd() * 9);
    }
    ctx.restore();
  },
};

/**
 * A framed, lit painting with a small brass plaque, baked into the room batcher.
 * `out` points away from the wall; the painting faces that way.
 */
export function addPainting(
  b: StaticBatcher,
  o: { x: number; y: number; z: number; yaw: number; w: number; h: number; style: PaintStyle; title: string; accent: string; seed: number; frame: 'black' | 'oak' | 'gold'; lowDetail?: boolean },
) {
  const holder = new THREE.Object3D();
  holder.position.set(o.x, o.y, o.z);
  holder.rotation.y = o.yaw;
  holder.updateMatrix();
  const M = holder.matrix;
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const t = new THREE.Matrix4().makeTranslation(x, y, z);
    b.addMatrix(geo, m, M.clone().multiply(t));
    geo.dispose();
  };
  const frameCol = o.frame === 'gold' ? '#b8924f' : o.frame === 'oak' ? '#a47b52' : '#141416';
  const frameM = mat2(`frame:${o.frame}`, () => new THREE.MeshStandardMaterial({ color: frameCol, roughness: o.frame === 'gold' ? 0.3 : 0.5, metalness: o.frame === 'gold' ? 0.8 : 0.05 }));
  const fw = 0.07;
  put(new THREE.BoxGeometry(o.w + fw * 2, fw, 0.06), frameM, 0, o.h / 2 + fw / 2, 0.03);
  put(new THREE.BoxGeometry(o.w + fw * 2, fw, 0.06), frameM, 0, -o.h / 2 - fw / 2, 0.03);
  put(new THREE.BoxGeometry(fw, o.h, 0.06), frameM, -o.w / 2 - fw / 2, 0, 0.03);
  put(new THREE.BoxGeometry(fw, o.h, 0.06), frameM, o.w / 2 + fw / 2, 0, 0.03);
  // white mat board
  put(new THREE.PlaneGeometry(o.w, o.h), mat2('matboard', () => new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 })), 0, 0, 0.012);
  const art = paintingTexture(o.style, o.accent, o.seed, o.lowDetail);
  const artM = mat2(`art:${art.uuid}`, () => new THREE.MeshStandardMaterial({ map: art, roughness: 0.75 }));
  put(new THREE.PlaneGeometry(o.w * 0.86, o.h * 0.82), artM, 0, 0, 0.016);
  // picture light: brass bar with a warm glow on its underside
  const brass = mat2('brass', () => new THREE.MeshStandardMaterial({ color: '#b48e57', roughness: 0.3, metalness: 0.9 }));
  put(new THREE.BoxGeometry(o.w * 0.5, 0.04, 0.06), brass, 0, o.h / 2 + fw + 0.1, 0.14);
  put(new THREE.BoxGeometry(0.02, 0.12, 0.12), brass, 0, o.h / 2 + fw + 0.06, 0.07);
  const glowM = mat2('picglow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d6').multiplyScalar(1.3), toneMapped: false }));
  put(new THREE.PlaneGeometry(o.w * 0.48, 0.02).rotateX(Math.PI / 2), glowM, 0, o.h / 2 + fw + 0.078, 0.14);
  // a soft wash of light on the painting
  const washM = mat2('picwash', () => new THREE.MeshBasicMaterial({ map: washTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.45 }));
  put(new THREE.PlaneGeometry(o.w * 1.1, o.h * 0.9), washM, 0, o.h * 0.12, 0.02);
  // brass plaque with the title
  const plaque = plaqueTexture(o.title);
  const plM = mat2(`plaque:${o.title}`, () => new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.35, metalness: 0.6 }));
  put(new THREE.PlaneGeometry(0.36, 0.09), plM, 0, -o.h / 2 - fw - 0.12, 0.005);
}

function washTexture() {
  return cachedTex('picwash', () => {
    const c = canvasOf(128, 128);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 0, 4, 64, 20, 110);
    g.addColorStop(0, 'rgba(255,236,200,0.6)');
    g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return tex(c, { mips: false });
  });
}

function plaqueTexture(title: string) {
  return cachedTex(`plaque:${title}`, () => {
    const c = canvasOf(512, 128);
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 512, 128);
    g.addColorStop(0, '#cfae6e');
    g.addColorStop(0.5, '#e8cf94');
    g.addColorStop(1, '#a8874a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#3b2c18';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 600 46px Georgia, "Times New Roman", serif`;
    ctx.fillText(title, 256, 56);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText('SHOPWALK 360 COLLECTION', 256, 102);
    return tex(c, { mips: true });
  });
}

/* ============================================================================================== *
 * Wall lettering
 * ============================================================================================== */

const QUOTES: [RegExp, string][] = [
  [/electr|gadget|tech|phone/i, 'Power your every day'],
  [/kitchen|dining|cook/i, 'Good food, good mood'],
  [/shoe|foot/i, 'Every step tells a story'],
  [/beauty|care|cosmetic/i, 'Glow from within'],
  [/car|auto|motor/i, 'Enjoy the open road'],
  [/office|study|station/i, 'Great ideas start here'],
  [/home|living|furni/i, 'Home is where the heart is'],
  [/fashion|cloth|apparel/i, 'Wear your story'],
  [/watch|jewel|accessor/i, 'Make every moment count'],
  [/fitness|sport|gym/i, 'Stronger every day'],
  [/travel|luggage/i, 'Collect moments, not things'],
  [/gift|lifestyle/i, 'Little things, big smiles'],
];

export function quoteFor(name: string, description?: string) {
  const hit = QUOTES.find(([re]) => re.test(name) || (description ? re.test(description) : false));
  return hit ? hit[1] : 'Explore. Experience. Discover.';
}

/** Transparent canvas with an elegant hand-set quote and a small caption, for mounting on a wall. */
export function letteringTexture(text: string, caption: string, ink: string, accent: string, w = 2048, h = 420) {
  return cachedTex(`letter:${text}:${caption}:${ink}:${accent}:${w}`, () => {
    const c = canvasOf(w, h);
    const ctx = c.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(h * 0.42);
    const fontOf = (s: number) => `italic 600 ${s}px Georgia, "Times New Roman", serif`;
    ctx.font = fontOf(size);
    while (size > 24 && ctx.measureText(text).width > w * 0.92) {
      size -= 4;
      ctx.font = fontOf(size);
    }
    ctx.fillStyle = ink;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.shadowColor = 'transparent';
    // flourish rule with a diamond
    const tw = Math.min(w * 0.6, ctx.measureText(text).width * 0.7);
    const ry = h * 0.72;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 - tw / 2, ry);
    ctx.lineTo(w / 2 - 22, ry);
    ctx.moveTo(w / 2 + 22, ry);
    ctx.lineTo(w / 2 + tw / 2, ry);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(w / 2, ry - 10);
    ctx.lineTo(w / 2 + 10, ry);
    ctx.lineTo(w / 2, ry + 10);
    ctx.lineTo(w / 2 - 10, ry);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.8;
    ctx.font = `700 ${Math.round(h * 0.085)}px ${FONT}`;
    const spaced = caption.toUpperCase().split('').join(' ');
    ctx.fillText(spaced, w / 2, h * 0.88);
    ctx.globalAlpha = 1;
    return tex(c, { mips: true });
  });
}

/** Mount a lettering texture flat on a wall. */
export function addLettering(root: THREE.Object3D, texture: THREE.Texture, x: number, y: number, z: number, yaw: number, w: number, h: number) {
  const m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  root.add(mesh);
  return { dispose: () => { mesh.geometry.dispose(); m.dispose(); } };
}
