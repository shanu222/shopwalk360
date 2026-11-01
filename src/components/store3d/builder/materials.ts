import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------------------------------------
 * Deterministic random so the store looks identical on every visit
 * ---------------------------------------------------------------------------------------------- */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let maxAnisotropy = 4;
export function setMaxAnisotropy(n: number) {
  maxAnisotropy = n;
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAnisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, rnd: () => number, alpha = 0.06) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  void alpha;
}

const texCache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** Polished stone tiles with soft veining — `tile` tiles per texture repeat */
export function marbleTexture(base: string, vein: string, tiles = 2, seed = 7) {
  return cached(`marble:${base}:${vein}:${tiles}:${seed}`, () => {
    const size = 1024;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const cell = size / tiles;
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        // subtle per-tile tone shift so tiles read as individual slabs
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rnd() * 0.03})`;
        ctx.fillRect(tx * cell, ty * cell, cell, cell);
        ctx.save();
        ctx.beginPath();
        ctx.rect(tx * cell, ty * cell, cell, cell);
        ctx.clip();
        for (let v = 0; v < 5; v++) {
          ctx.strokeStyle = vein;
          ctx.globalAlpha = 0.05 + rnd() * 0.16;
          ctx.lineWidth = 0.6 + rnd() * 2.4;
          ctx.beginPath();
          let x = tx * cell + rnd() * cell;
          let y = ty * cell;
          ctx.moveTo(x, y);
          for (let k = 0; k < 7; k++) {
            x += (rnd() - 0.5) * cell * 0.5;
            y += cell / 6;
            ctx.quadraticCurveTo(x + (rnd() - 0.5) * 40, y - cell / 12, x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    noise(ctx, size, 10, rnd);
    // grout joints
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

export function terrazzoTexture(base: string, chips: string[], seed = 3) {
  return cached(`terrazzo:${base}:${chips.join()}:${seed}`, () => {
    const size = 512;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = chips[Math.floor(rnd() * chips.length)];
      ctx.globalAlpha = 0.45 + rnd() * 0.5;
      const r = 0.6 + rnd() * (rnd() > 0.93 ? 5 : 2.2);
      ctx.beginPath();
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.moveTo(x + r, y);
      for (let a = 1; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        const rr = r * (0.6 + rnd() * 0.6);
        ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    noise(ctx, size, 8, rnd);
    return toTexture(c);
  });
}

export function woodTexture(tones: [string, string], opts: { planks?: number; herringbone?: boolean; seed?: number } = {}) {
  const planks = opts.planks ?? 6;
  return cached(`wood:${tones.join()}:${planks}:${opts.herringbone}:${opts.seed}`, () => {
    const size = 1024;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(opts.seed ?? 11);
    const drawPlank = (x: number, y: number, w: number, h: number) => {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      const t = rnd();
      g.addColorStop(0, tones[0]);
      g.addColorStop(0.5 + (t - 0.5) * 0.4, tones[1]);
      g.addColorStop(1, tones[0]);
      ctx.fillStyle = g;
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.08 + rnd() * 0.06;
      ctx.strokeStyle = '#000';
      for (let k = 0; k < 9; k++) {
        ctx.lineWidth = 0.5 + rnd() * 1.4;
        ctx.beginPath();
        const gx = x + rnd() * w;
        ctx.moveTo(gx, y);
        ctx.bezierCurveTo(gx + (rnd() - 0.5) * 12, y + h * 0.3, gx + (rnd() - 0.5) * 12, y + h * 0.7, gx + (rnd() - 0.5) * 8, y + h);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    if (opts.herringbone) {
      const pw = size / 8;
      const pl = pw * 3;
      ctx.fillStyle = tones[0];
      ctx.fillRect(0, 0, size, size);
      for (let row = -2; row < 12; row++) {
        for (let col = -2; col < 10; col++) {
          const ox = col * pw * 2 + (row % 2) * pw;
          const oy = row * pw;
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate(Math.PI / 4);
          drawPlank(0, 0, pw, pl);
          ctx.restore();
          ctx.save();
          ctx.translate(ox + pw * 1.42, oy);
          ctx.rotate(-Math.PI / 4);
          drawPlank(-pw, 0, pw, pl);
          ctx.restore();
        }
      }
    } else {
      const w = size / planks;
      for (let i = 0; i < planks; i++) {
        const off = rnd() * size;
        drawPlank(i * w, -off, w, size);
        drawPlank(i * w, size - off, w, size);
      }
    }
    noise(ctx, size, 8, rnd);
    return toTexture(c);
  });
}

export function concreteTexture(base: string, seed = 5) {
  return cached(`concrete:${base}:${seed}`, () => {
    const size = 512;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i++) {
      const g = ctx.createRadialGradient(rnd() * size, rnd() * size, 0, rnd() * size, rnd() * size, 40 + rnd() * 120);
      const dark = rnd() > 0.5;
      g.addColorStop(0, `rgba(${dark ? '0,0,0' : '255,255,255'},${0.03 + rnd() * 0.04})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    noise(ctx, size, 14, rnd);
    return toTexture(c);
  });
}

export function carpetTexture(base: string, seed = 9) {
  return cached(`carpet:${base}:${seed}`, () => {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    noise(ctx, size, 26, rnd);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    return toTexture(c);
  });
}

export function plasterTexture(base: string, seed = 13) {
  return cached(`plaster:${base}:${seed}`, () => {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    noise(ctx, size, 6, seeded(seed));
    return toTexture(c);
  });
}

export function flutedTexture(base: string, lines = 16) {
  return cached(`fluted:${base}:${lines}`, () => {
    const size = 512;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const w = size / lines;
    for (let i = 0; i < lines; i++) {
      const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.16)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(i * w, 0, w, size);
    }
    return toTexture(c);
  });
}

export function rubberTexture(base: string) {
  return cached(`rubber:${base}`, () => {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const rnd = seeded(21);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.6 ? 'rgba(255,255,255,0.25)' : 'rgba(120,120,120,0.35)';
      ctx.fillRect(rnd() * size, rnd() * size, 1.4, 1.4);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(0, 0, size, size);
    return toTexture(c);
  });
}

/** Additive radial light pool used to fake down-light spill on floors */
export function lightPoolTexture() {
  return cached('lightpool', () => {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return toTexture(c, false);
  });
}

/** Soft contact shadow (multiply) */
export function contactShadowTexture() {
  return cached('contactshadow', () => {
    const size = 128;
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return toTexture(c, false);
  });
}

export function skyTexture() {
  return cached('sky', () => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#5f86b8');
    g.addColorStop(0.45, '#a9c2dc');
    g.addColorStop(0.62, '#e9dfcf');
    g.addColorStop(1, '#cfc6b8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

/* ------------------------------------------------------------------------------------------------
 * Material cache
 * ---------------------------------------------------------------------------------------------- */
const matCache = new Map<string, THREE.Material>();

export function mat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}

export function std(color: string, roughness = 0.6, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const extraKey = Object.entries(extra)
    .map(([k, v]) => `${k}=${v && (v as THREE.Texture).isTexture ? (v as THREE.Texture).uuid : String(v)}`)
    .join(',');
  return mat(`std:${color}:${roughness}:${metalness}:${extraKey}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }),
  );
}

export function emissive(color: string, intensity = 1) {
  return mat(`emis:${color}:${intensity}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }));
}

export function glass(tint = '#dfe9ee', opacity = 0.16) {
  return mat(`glass:${tint}:${opacity}`, () =>
    new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity,
      depthWrite: false,
      envMapIntensity: 1.6,
    }),
  );
}

export function disposeMaterialCache() {
  matCache.forEach((m) => m.dispose());
  matCache.clear();
  texCache.forEach((t) => t.dispose());
  texCache.clear();
}

/* ------------------------------------------------------------------------------------------------
 * UV helpers — scale UVs so textures tile at a real-world size
 * ---------------------------------------------------------------------------------------------- */
export function boxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, tile: number) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 verts each)
  const dims: [number, number][] = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * (dims[f][0] / tile), uv.getY(i) * (dims[f][1] / tile));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function planeUV(geo: THREE.BufferGeometry, w: number, h: number, tile: number, offsetU = 0, offsetV = 0) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile) + offsetU, uv.getY(i) * (h / tile) + offsetV);
  uv.needsUpdate = true;
  return geo;
}

/* ------------------------------------------------------------------------------------------------
 * Static batcher — bakes transforms and merges geometry per material
 * ---------------------------------------------------------------------------------------------- */
export class StaticBatcher {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Object3D();

  add(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.tmp.position.set(x, y, z);
    this.tmp.rotation.set(rx, ry, rz);
    this.tmp.scale.set(sx, sy, sz);
    this.tmp.updateMatrix();
    this.addMatrix(geo, material, this.tmp.matrix);
  }

  addMatrix(geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    // normalise attribute sets so geometries can merge
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    Object.keys(g.attributes).forEach((k) => {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    });
    g.morphAttributes = {};
    g.clearGroups();
    let list = this.buckets.get(material);
    if (!list) {
      list = [];
      this.buckets.set(material, list);
    }
    list.push(g);
  }

  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tile > 0) boxUV(g, w, h, d, tile);
    this.add(g, material, x, y, z, ry);
    g.dispose();
  }

  /** Horizontal plane (floor/ceiling). `up` = true faces +y */
  floor(material: THREE.Material, minX: number, maxX: number, minZ: number, maxZ: number, y: number, tile: number, up = true) {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const g = new THREE.PlaneGeometry(w, d);
    planeUV(g, w, d, tile, minX / tile, minZ / tile);
    this.add(g, material, (minX + maxX) / 2, y, (minZ + maxZ) / 2, 0, up ? -Math.PI / 2 : Math.PI / 2);
    g.dispose();
  }

  /** Bake every mesh of an object tree (with its world transform) into the batches */
  addObject(root: THREE.Object3D, parentMatrix?: THREE.Matrix4) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as any).isInstancedMesh || !mesh.visible) return;
      const m = mesh.matrixWorld.clone();
      if (parentMatrix) m.premultiply(parentMatrix);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      this.addMatrix(mesh.geometry, material, m);
    });
  }

  build(name = 'static', receiveShadow = false): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    this.buckets.forEach((geos, material) => {
      // chunk to keep index sizes and culling reasonable
      for (let i = 0; i < geos.length; i += 400) {
        const merged = mergeGeometries(geos.slice(i, i + 400), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = receiveShadow;
        group.add(mesh);
      }
      geos.forEach((g) => g.dispose());
    });
    this.buckets.clear();
    return group;
  }
}
