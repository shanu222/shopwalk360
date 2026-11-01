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
  ctx.fillText('Bays  L · F · R · BW  ·  Demo zone at the back', 340, 214);
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

export function facadeSignTexture() {
  const c = makeCanvas(2048, 384);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 2048, 384);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  spaced(ctx, 26);
  ctx.font = `800 210px ${FONT}`;
  ctx.fillText('SHOPWALK 360', 1024, 170);
  spaced(ctx, 14);
  ctx.fillStyle = '#e7d3a6';
  ctx.font = `500 52px ${FONT}`;
  ctx.fillText('EXPLORE · EXPERIENCE · DISCOVER', 1024, 318);
  const t = tex(c);
  return t;
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
