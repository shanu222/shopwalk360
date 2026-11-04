import * as THREE from 'three';
import { StoreDepartment, PromoScreen } from '../../../types';
import { formatDeptNumber } from '../layout/storeLayout';

export const FONT = '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif';

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  try {
    (ctx as any).letterSpacing = `${px}px`;
  } catch {
    /* older browsers */
  }
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number, size: number, min = 10) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

/** Shop-front fascia: deep bronze band, illuminated lettering, department number badge */
export function fasciaTexture(dept: StoreDepartment) {
  const c = makeCanvas(2048, 256);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#20211f');
  g.addColorStop(1, '#141513');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 256);
  // accent rule
  ctx.fillStyle = dept.theme_color || '#c8a96a';
  ctx.fillRect(0, 238, 2048, 18);
  // number badge
  ctx.fillStyle = '#c8a96a';
  ctx.beginPath();
  ctx.arc(150, 120, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141513';
  ctx.font = `800 92px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatDeptNumber(dept.aisle_number), 150, 124);
  // name
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f6f1e7';
  spaced(ctx, 6);
  fitText(ctx, dept.name.toUpperCase(), 1700, 700, 104, 40);
  ctx.fillText(dept.name.toUpperCase(), 290, 112);
  spaced(ctx, 3);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = '#b9b3a5';
  ctx.fillText((dept.description || '').slice(0, 80), 292, 196);
  return tex(c);
}

/** Projecting double-sided blade sign, readable from far down the promenade */
export function bladeTexture(dept: StoreDepartment) {
  const c = makeCanvas(512, 768);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#151614';
  ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = dept.theme_color || '#c8a96a';
  ctx.fillRect(0, 0, 512, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8a96a';
  ctx.font = `800 210px ${FONT}`;
  ctx.fillText(formatDeptNumber(dept.aisle_number), 256, 230);
  ctx.fillStyle = '#f6f1e7';
  ctx.font = `700 56px ${FONT}`;
  const lines = wrap(ctx, dept.name, 440);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 256, 460 + i * 72));
  return tex(c);
}

/** Hanging aisle marker inside each department */
export function aisleSignTexture(dept: StoreDepartment) {
  const c = makeCanvas(1024, 320);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7f4ee';
  ctx.fillRect(0, 0, 1024, 320);
  ctx.fillStyle = dept.theme_color || '#334155';
  ctx.fillRect(0, 0, 300, 320);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText('AISLE', 150, 92);
  ctx.font = `800 150px ${FONT}`;
  ctx.fillText(formatDeptNumber(dept.aisle_number), 150, 206);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1d1f22';
  fitText(ctx, dept.name, 660, 700, 64, 30);
  ctx.fillText(dept.name, 340, 120);
  ctx.font = `500 38px ${FONT}`;
  ctx.fillStyle = '#5b5f66';
  ctx.fillText('Bays  L · F · R  ·  Demo zone at the front', 340, 214);
  return tex(c);
}

/** Small bay code tag mounted on each fixture header */
export function bayTagTexture(code: string, accent: string) {
  const c = makeCanvas(256, 96);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a1b1d';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 14, 96);
  ctx.fillStyle = '#f5f2ea';
  ctx.font = `800 52px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, 135, 52);
  return tex(c);
}

/** Overhead promenade wayfinding sign: "← 03 Kitchen & Dining    Fashion & Clothing 04 →" */
export function wayfindingTexture(left?: StoreDepartment, right?: StoreDepartment) {
  const c = makeCanvas(2048, 256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#16171a';
  ctx.fillRect(0, 0, 2048, 256);
  ctx.fillStyle = '#c8a96a';
  ctx.fillRect(1022, 30, 4, 196);
  ctx.textBaseline = 'middle';
  const draw = (d: StoreDepartment | undefined, side: 'l' | 'r') => {
    if (!d) return;
    const num = formatDeptNumber(d.aisle_number);
    ctx.fillStyle = '#c8a96a';
    ctx.font = `800 84px ${FONT}`;
    if (side === 'l') {
      ctx.textAlign = 'left';
      ctx.fillText('←', 50, 128);
      ctx.fillText(num, 150, 128);
      ctx.fillStyle = '#f2eee6';
      fitText(ctx, d.name, 720, 600, 64, 30);
      ctx.fillText(d.name, 290, 128);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText('→', 2000, 128);
      ctx.fillText(num, 1900, 128);
      ctx.fillStyle = '#f2eee6';
      fitText(ctx, d.name, 720, 600, 64, 30);
      ctx.fillText(d.name, 1760, 128);
    }
  };
  draw(left, 'l');
  draw(right, 'r');
  return tex(c);
}

export function welcomeWallTexture(subBrand: string) {
  const c = makeCanvas(2048, 768);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 2048, 768);
  g.addColorStop(0, '#101418');
  g.addColorStop(1, '#1b2128');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 768);
  ctx.strokeStyle = 'rgba(200,169,106,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, 1968, 688);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8a96a';
  spaced(ctx, 18);
  ctx.font = `600 54px ${FONT}`;
  ctx.fillText('WELCOME TO', 1024, 210);
  spaced(ctx, 4);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 210px ${FONT}`;
  ctx.fillText('ShopWalk 360', 1024, 380);
  spaced(ctx, 10);
  ctx.fillStyle = '#d9d4ca';
  ctx.font = `500 70px ${FONT}`;
  ctx.fillText('Explore. Experience. Discover.', 1024, 540);
  spaced(ctx, 4);
  ctx.fillStyle = '#8c9097';
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(subBrand, 1024, 650);
  return tex(c);
}

type SignGlyph = { group: THREE.Group; i: number; face: THREE.MeshBasicMaterial; tint: [number, number, number] };

/** Raised channel letters for the street façade. White pearl for the name, gold for 360 and the tagline. */
export async function buildFacadeSign() {
  if (document.fonts?.ready) await document.fonts.ready;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const disposables: { dispose: () => void }[] = [];
  const glyphs: SignGlyph[] = [];
  const group = new THREE.Group();
  group.name = 'facade-sign';

  const probe = document.createElement('canvas').getContext('2d')!;
  const glyphCache = new Map<string, THREE.CanvasTexture>();

  const glyphMap = (ch: string, px: number) => {
    const key = `${px}:${ch}`;
    const cached = glyphCache.get(key);
    if (cached) return cached;
    const c = makeCanvas(px, px);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, px, px);
    ctx.font = `800 ${Math.floor(px * 0.78)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, px / 2, px / 2 + px * 0.03);
    ctx.globalCompositeOperation = 'source-atop';
    const shine = ctx.createLinearGradient(0, 0, 0, px);
    shine.addColorStop(0, 'rgba(255,255,255,0.7)');
    shine.addColorStop(0.42, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(90,50,8,0.35)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, px, px);
    const t = tex(c);
    disposables.push(t);
    glyphCache.set(key, t);
    return t;
  };

  const addRow = (text: string, worldH: number, y: number, tintFor: (ch: string) => [number, number, number]) => {
    probe.font = `800 200px ${FONT}`;
    const gap = worldH * 0.08;
    const parts = [...text].map((ch) => {
      if (ch === ' ') return { ch, w: worldH * 0.42 };
      const aspect = Math.max(0.32, probe.measureText(ch).width / 200);
      return { ch, w: worldH * aspect * 0.96 };
    });
    const total = parts.reduce((s, p) => s + p.w, 0) + gap * Math.max(0, parts.length - 1);
    let x = -total / 2;
    const row = new THREE.Group();
    parts.forEach((part) => {
      if (part.ch !== ' ') {
        const holder = new THREE.Group();
        const map = glyphMap(part.ch, 256);
        const slices = 6;
        const tint = tintFor(part.ch);
        const face = new THREE.MeshBasicMaterial({
          map,
          color: new THREE.Color(tint[0], tint[1], tint[2]),
          transparent: true,
          alphaTest: 0.12,
          toneMapped: false,
          depthWrite: false,
        });
        disposables.push(face);
        const geo = new THREE.PlaneGeometry(part.w, worldH);
        disposables.push(geo);
        for (let s = 0; s < slices; s++) {
          const front = s === slices - 1;
          const mat = front
            ? face
            : new THREE.MeshBasicMaterial({
                map,
                color: new THREE.Color().setHSL(0.1, 0.75, 0.16 + (s / slices) * 0.2),
                transparent: true,
                alphaTest: 0.12,
                toneMapped: false,
                depthWrite: false,
              });
          if (!front) disposables.push(mat);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.z = -((slices - 1 - s) * 0.02);
          mesh.position.y = -((slices - 1 - s) * 0.014);
          mesh.renderOrder = 2 + s;
          holder.add(mesh);
        }
        holder.position.x = x + part.w / 2;
        row.add(holder);
        glyphs.push({ group: holder, i: glyphs.length, face, tint });
      }
      x += part.w + gap;
    });
    row.position.y = y;
    group.add(row);
    return { total, row };
  };

  const title = addRow('SHOPWALK 360', 0.92, 0.38, (ch) => (ch >= '0' && ch <= '9' ? [1, 0.78, 0.28] : [1, 0.97, 0.9]));
  const titleW = title.total;

  // Tagline sits on a dark plaque so the gold stays readable on the pale stone, with a light that travels the line.
  type BannerBit = { holder: THREE.Group; face: THREE.MeshBasicMaterial; x: number };
  const bannerBits: BannerBit[] = [];
  const banner = new THREE.Group();
  banner.name = 'facade-banner';
  const wordH = 0.52;
  const gold: [number, number, number] = [1, 0.84, 0.32];
  const hot: [number, number, number] = [1, 0.98, 0.86];

  const makeWord = (text: string) => {
    probe.font = `800 200px ${FONT}`;
    const gap = wordH * 0.11;
    const parts = [...text].map((ch) => {
      const aspect = Math.max(0.34, probe.measureText(ch).width / 200);
      return { ch, w: wordH * aspect * 0.98 };
    });
    const total = parts.reduce((s, p) => s + p.w, 0) + gap * Math.max(0, parts.length - 1);
    const row = new THREE.Group();
    let x = -total / 2;
    parts.forEach((part) => {
      const holder = new THREE.Group();
      const map = glyphMap(part.ch, 256);
      const slices = 5;
      const face = new THREE.MeshBasicMaterial({
        map,
        color: new THREE.Color(gold[0], gold[1], gold[2]),
        transparent: true,
        alphaTest: 0.08,
        toneMapped: false,
        depthWrite: false,
      });
      disposables.push(face);
      const geo = new THREE.PlaneGeometry(part.w, wordH);
      disposables.push(geo);
      for (let s = 0; s < slices; s++) {
        const front = s === slices - 1;
        const mat = front
          ? face
          : new THREE.MeshBasicMaterial({
              map,
              color: new THREE.Color().setHSL(0.09, 0.9, 0.16 + (s / slices) * 0.2),
              transparent: true,
              alphaTest: 0.08,
              toneMapped: false,
              depthWrite: false,
            });
        if (!front) disposables.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = -((slices - 1 - s) * 0.016);
        mesh.position.y = -((slices - 1 - s) * 0.011);
        mesh.renderOrder = 6 + s;
        holder.add(mesh);
      }
      holder.position.x = x + part.w / 2;
      row.add(holder);
      bannerBits.push({ holder, face, x: 0 });
      x += part.w + gap;
    });
    return { row, total };
  };

  const dotCanvas = makeCanvas(128, 128);
  const dctx = dotCanvas.getContext('2d')!;
  dctx.fillStyle = '#ffffff';
  dctx.beginPath();
  dctx.arc(64, 64, 26, 0, Math.PI * 2);
  dctx.fill();
  const dotMap = tex(dotCanvas);
  disposables.push(dotMap);
  const makeDot = () => {
    const holder = new THREE.Group();
    const face = new THREE.MeshBasicMaterial({
      map: dotMap,
      color: new THREE.Color(gold[0], gold[1], gold[2]),
      transparent: true,
      alphaTest: 0.05,
      toneMapped: false,
      depthWrite: false,
    });
    disposables.push(face);
    const geo = new THREE.PlaneGeometry(0.18, 0.18);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, face);
    mesh.renderOrder = 11;
    holder.add(mesh);
    bannerBits.push({ holder, face, x: 0 });
    return { row: holder, total: 0.18 };
  };

  const chunks = ['EXPLORE', 'EXPERIENCE', 'DISCOVER'].flatMap((word, i, all) => {
    const piece = makeWord(word);
    return i < all.length - 1 ? [piece, makeDot()] : [piece];
  });
  const wordGap = 0.38;
  const lineW = chunks.reduce((s, c) => s + c.total, 0) + wordGap * Math.max(0, chunks.length - 1);
  let cursor = -lineW / 2;
  chunks.forEach((c) => {
    c.row.position.x = cursor + c.total / 2;
    banner.add(c.row);
    cursor += c.total + wordGap;
  });
  bannerBits.forEach((b) => {
    b.x = b.holder.position.x + (b.holder.parent ? b.holder.parent.position.x : 0);
  });

  const plateW = lineW + 1.45;
  const plateH = 0.92;
  const plateGeo = new THREE.BoxGeometry(plateW, plateH, 0.08);
  const plateMat = new THREE.MeshStandardMaterial({
    color: '#1a120c',
    metalness: 0.22,
    roughness: 0.52,
    emissive: '#3a2412',
    emissiveIntensity: 0.45,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(0, 0, -0.12);
  plate.renderOrder = 3;
  banner.add(plate);
  disposables.push(plateGeo, plateMat);

  const trimMat = new THREE.MeshBasicMaterial({ color: 0xf3d48a, toneMapped: false });
  const trimGeo = new THREE.BoxGeometry(plateW + 0.08, 0.04, 0.045);
  disposables.push(trimMat, trimGeo);
  [plateH / 2, -plateH / 2].forEach((y) => {
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(0, y, -0.06);
    banner.add(trim);
  });

  const washGeo = new THREE.PlaneGeometry(lineW + 0.4, wordH * 1.15);
  const washMat = new THREE.MeshBasicMaterial({
    color: 0xffb02e,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const wash = new THREE.Mesh(washGeo, washMat);
  wash.position.set(0, 0, -0.04);
  wash.renderOrder = 4;
  banner.add(wash);
  disposables.push(washGeo, washMat);

  const sheenGeo = new THREE.PlaneGeometry(1.7, 0.05);
  const sheenMat = new THREE.MeshBasicMaterial({
    color: 0xfff4cc,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  });
  const sheen = new THREE.Mesh(sheenGeo, sheenMat);
  sheen.position.set(0, -wordH * 0.52, 0.07);
  sheen.renderOrder = 14;
  sheen.visible = !reduce;
  banner.add(sheen);
  disposables.push(sheenGeo, sheenMat);

  banner.position.set(0, -0.76, 0.04);
  group.add(banner);

  const glowC = makeCanvas(64, 64);
  const gctx = glowC.getContext('2d')!;
  const grd = gctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255, 196, 80, 0.55)');
  grd.addColorStop(1, 'rgba(255, 170, 40, 0)');
  gctx.fillStyle = grd;
  gctx.fillRect(0, 0, 64, 64);
  const glowMap = tex(glowC);
  disposables.push(glowMap);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(titleW + 1.4, 1.35),
    new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.set(0, 0.4, -0.16);
  glow.renderOrder = 1;
  group.add(glow);
  disposables.push(glow.geometry, glow.material);

  const sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 1.05),
    new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  );
  sweep.position.set(-titleW / 2, 0.4, 0.04);
  sweep.renderOrder = 12;
  group.add(sweep);
  disposables.push(sweep.geometry, sweep.material);
  if (reduce) sweep.visible = false;

  return {
    group,
    disposables,
    update(t: number) {
      glyphs.forEach((g) => {
        const wave = reduce ? 0 : Math.sin(t * 1.7 + g.i * 0.42);
        g.group.position.y = wave * 0.034;
        const glowAmt = reduce ? 1 : 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.35 + g.i * 0.55));
        g.face.color.setRGB(g.tint[0] * glowAmt, g.tint[1] * glowAmt, g.tint[2] * glowAmt);
      });
      if (!reduce) {
        const span = titleW + 1.2;
        const u = (t % 5.2) / 5.2;
        sweep.position.x = -span / 2 + u * span;
        (sweep.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI) * 0.42;
        (glow.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.16 * Math.sin(t * 1.1);

        const pad = 1.8;
        const start = -lineW / 2 - pad;
        const end = lineW / 2 + pad;
        const head = start + ((t * 2.15) % (end - start));
        sheen.position.x = head;
        const fadeIn = THREE.MathUtils.smoothstep(head, start, start + 1.1);
        const fadeOut = 1 - THREE.MathUtils.smoothstep(head, end - 1.1, end);
        sheenMat.opacity = 0.95 * fadeIn * fadeOut;
        bannerBits.forEach((b) => {
          const d = b.x - head;
          const k = Math.exp(-d * d * 1.7);
          const idle = Math.sin(t * 1.7 + b.x * 0.9) * 0.014;
          b.holder.position.y = idle + k * 0.07;
          b.holder.scale.setScalar(1 + k * 0.12);
          b.face.color.setRGB(
            gold[0] + (hot[0] - gold[0]) * k,
            gold[1] + (hot[1] - gold[1]) * k,
            gold[2] + (hot[2] - gold[2]) * k,
          );
        });
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.45);
        trimMat.color.setRGB(0.82 + 0.18 * pulse, 0.64 + 0.18 * pulse, 0.28 + 0.12 * pulse);
        washMat.opacity = 0.14 + 0.12 * pulse;
      }
    },
  };
}

/** Department directory totem listing (left / right side per department) */
export function directoryTexture(depts: StoreDepartment[]) {
  const c = makeCanvas(768, 1536);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, 768, 1536);
  ctx.fillStyle = '#c8a96a';
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = 'left';
  spaced(ctx, 8);
  ctx.fillText('DEPARTMENTS', 56, 96);
  spaced(ctx, 0);
  ctx.fillStyle = '#8f939a';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText('Odd numbers on your left · Even on your right', 56, 146);
  const sorted = [...depts].sort((a, b) => a.aisle_number - b.aisle_number);
  sorted.slice(0, 12).forEach((d, i) => {
    const y = 230 + i * 105;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(40, y - 44, 688, 88);
    ctx.fillStyle = d.theme_color || '#64748b';
    ctx.fillRect(40, y - 44, 8, 88);
    ctx.fillStyle = '#c8a96a';
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(formatDeptNumber(d.aisle_number), 70, y + 14);
    ctx.fillStyle = '#f3efe7';
    fitText(ctx, d.name, 470, 600, 36, 22);
    ctx.fillText(d.name, 160, y + 12);
    ctx.fillStyle = '#c8a96a';
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText((d.slot_index ?? 0) < 6 ? '←' : '→', 700, y + 12);
    ctx.textAlign = 'left';
  });
  return tex(c);
}

export function simpleScreenTexture(title: string, lines: string[], accent: string, w = 1024, h = 640) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#15181c');
  g.addColorStop(1, '#0d0f12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 14);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  fitText(ctx, title, w - 120, 800, 64, 28);
  ctx.fillText(title, 60, 120);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = '#c3c6cc';
  let y = 200;
  lines.forEach((l) => {
    wrap(ctx, l, w - 120).forEach((wl) => {
      ctx.fillText(wl, 60, y);
      y += 50;
    });
    y += 10;
  });
  return tex(c);
}

/** Draws an image (if it loads) into a screen texture after creation, without blocking the build */
function drawImageLater(t: THREE.CanvasTexture, url: string | undefined, rect: [number, number, number, number]) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = t.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const [x, y, w, h] = rect;
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s;
    const ih = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    try {
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } catch {
      /* tainted canvas — leave placeholder */
    }
    ctx.restore();
    t.needsUpdate = true;
  };
  img.src = url;
}

export function promoTexture(p: PromoScreen) {
  const w = 1024;
  const h = 1536;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 0, w, h);
  // image area placeholder (tone) — replaced by the real product photo when it loads
  ctx.fillStyle = '#23262c';
  ctx.fillRect(0, 0, w, 900);
  ctx.fillStyle = '#4a4e56';
  ctx.font = `600 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(p.product_name ? p.product_name.slice(0, 32) : 'ShopWalk 360', w / 2, 460);
  ctx.fillStyle = p.accent_color || '#c8a96a';
  ctx.fillRect(0, 900, w, 12);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  fitText(ctx, p.title, w - 120, 800, 76, 34);
  ctx.fillText(p.title, 60, 1010);
  ctx.fillStyle = '#c9ccd2';
  ctx.font = `500 40px ${FONT}`;
  wrap(ctx, p.subtitle || '', w - 120).slice(0, 2).forEach((l, i) => ctx.fillText(l, 60, 1090 + i * 54));
  if (p.product_name) {
    ctx.fillStyle = '#e8e3d8';
    ctx.font = `600 38px ${FONT}`;
    wrap(ctx, p.product_name, w - 120).slice(0, 2).forEach((l, i) => ctx.fillText(l, 60, 1260 + i * 50));
    const price = p.discount_price || p.regular_price;
    if (price) {
      ctx.fillStyle = '#c8a96a';
      ctx.font = `800 58px ${FONT}`;
      ctx.fillText(`PKR ${Number(price).toLocaleString()}`, 60, 1430);
    }
  }
  const t = tex(c);
  drawImageLater(t, p.primary_image, [0, 0, w, 900]);
  return t;
}

/** Department information screen (just inside each entrance) */
export function deptInfoTexture(dept: StoreDepartment, productCount: number, hasDemo: boolean) {
  const lines = [
    dept.info_text || dept.description || '',
    productCount > 0 ? `${productCount} product display${productCount === 1 ? '' : 's'} in this department` : 'No products are listed in this department yet',
    hasDemo ? 'Demonstration zone at the back of the store' : '',
    'Walk up to any display and choose “Explore Product”',
  ].filter(Boolean);
  return simpleScreenTexture(`${formatDeptNumber(dept.aisle_number)} · ${dept.name}`, lines, dept.theme_color || '#c8a96a');
}

/**
 * Retail packaging texture for boxed products on shelves.
 * Uses the product's own name / brand / photo — nothing invented.
 */
export function packagingTexture(name: string, brand: string | undefined, accent: string, imageUrl?: string) {
  const w = 512;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f2ed';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - 70, w, 70);
  ctx.fillStyle = '#e4e1da';
  ctx.fillRect(40, 40, w - 80, 270);
  ctx.fillStyle = '#1c1d20';
  ctx.textAlign = 'left';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText((brand || '').toUpperCase().slice(0, 28), 40, 350);
  ctx.font = `600 30px ${FONT}`;
  wrap(ctx, name, w - 80).slice(0, 2).forEach((l, i) => ctx.fillText(l, 40, 392 + i * 36));
  const t = tex(c);
  drawImageLater(t, imageUrl, [40, 40, w - 80, 270]);
  return t;
}

export function labelTexture(text: string, sub: string, accent: string) {
  const c = makeCanvas(512, 160);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 10, 160);
  ctx.fillStyle = '#1b1c1e';
  ctx.textAlign = 'left';
  fitText(ctx, text, 470, 700, 40, 20);
  ctx.fillText(text, 28, 66);
  ctx.fillStyle = '#4b4f55';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(sub, 28, 124);
  return tex(c);
}

/**
 * Header sign on top of a display: what the display holds, readable from across the department.
 * `w`×`h` is the canvas size; keep it in the same proportion as the sign board.
 */
export function displaySignTexture(title: string, subtitle: string, accent: string, w = 1536, h = 200) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#24211d');
  g.addColorStop(1, '#151311');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // department colour band along the bottom and a thin gold rule along the top
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - Math.round(h * 0.09), w, Math.round(h * 0.09));
  ctx.fillStyle = 'rgba(226,200,143,0.7)';
  ctx.fillRect(0, 0, w, Math.max(2, Math.round(h * 0.02)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pad = w * 0.05;
  const hasSub = !!subtitle;
  ctx.fillStyle = '#fbf8f1';
  spaced(ctx, Math.round(h * 0.012));
  fitText(ctx, title, w - pad * 2, 800, Math.round(h * (hasSub ? 0.46 : 0.58)), 18);
  ctx.fillText(title, w / 2, h * (hasSub ? 0.36 : 0.46));
  if (hasSub) {
    spaced(ctx, 0);
    ctx.fillStyle = '#e2c88f';
    fitText(ctx, subtitle, w - pad * 2, 600, Math.round(h * 0.22), 12);
    ctx.fillText(subtitle, w / 2, h * 0.72);
  }
  spaced(ctx, 0);
  return tex(c);
}

/** Shelf-edge strip under one shelf level: the product on that shelf and its price, in large type. */
export function shelfStripTexture(name: string, price: string, accent: string, w = 1024, h = 72) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, Math.round(h * 0.18), h);
  ctx.textBaseline = 'middle';
  const left = Math.round(h * 0.42);
  let priceW = 0;
  if (price) {
    ctx.font = `800 ${Math.round(h * 0.56)}px ${FONT}`;
    priceW = ctx.measureText(price).width;
    ctx.fillStyle = '#1b1c1e';
    ctx.textAlign = 'right';
    ctx.fillText(price, w - left * 0.8, h * 0.54);
  }
  ctx.fillStyle = '#1b1c1e';
  ctx.textAlign = 'left';
  fitText(ctx, name, w - left - priceW - left * 1.8, 800, Math.round(h * 0.58), 12);
  ctx.fillText(name, left, h * 0.54);
  return tex(c);
}
