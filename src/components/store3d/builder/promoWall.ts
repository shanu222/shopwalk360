import * as THREE from 'three';
import { FONT } from './signage';

/**
 * Full-wall LED promo screen for a department's back wall.
 *
 * - `screen` covers the whole wall. Admin videos play on it; with no video it shows a lit LED
 *   picture of the department name.
 * - A glowing band across the top carries the department name, scrolling continuously, with a
 *   light sweep and pulsing accent lines.
 *
 * Every texture is drawn once. Motion comes from moving texture offsets and opacities, which costs
 * nothing per frame, so the wall stays smooth even with a video playing behind it.
 */
export interface PromoWall {
  group: THREE.Group;
  /** the full-wall surface the video is shown on */
  screen: THREE.Mesh;
  update: (t: number) => void;
  dispose: () => void;
}

export interface PromoWallOptions {
  width: number;
  height: number;
  name: string;
  number: string;
  tagline?: string;
  accent: string;
  lowDetail?: boolean;
}

export function buildPromoWall(o: PromoWallOptions): PromoWall {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const accent = new THREE.Color(o.accent);
  const bandH = Math.min(0.78, o.height * 0.19);

  // ---------- the screen (LED picture until a video takes over) ----------
  const base = baseTexture(o, bandH, o.lowDetail ? 1024 : 1536);
  disposables.push(base);
  const screenMat = new THREE.MeshBasicMaterial({ map: base, toneMapped: false });
  disposables.push(screenMat);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), screenMat);
  group.add(screen);

  // ---------- top band: dark glass strip ----------
  const bandY = o.height / 2 - bandH / 2;
  const bandBg = new THREE.Mesh(
    new THREE.PlaneGeometry(o.width, bandH),
    new THREE.MeshBasicMaterial({ map: bandGradient(o.accent), transparent: true, depthWrite: false, toneMapped: false }),
  );
  disposables.push((bandBg.material as THREE.MeshBasicMaterial).map!, bandBg.material as THREE.Material);
  bandBg.position.set(0, bandY, 0.004);
  group.add(bandBg);

  // ---------- scrolling department name ----------
  const marquee = marqueeTexture(o);
  disposables.push(marquee.texture);
  const textH = bandH * 0.78;
  const tileW = textH * marquee.aspect;
  marquee.texture.repeat.set(o.width / tileW, 1);
  const textMat = new THREE.MeshBasicMaterial({ map: marquee.texture, transparent: true, depthWrite: false, toneMapped: false });
  disposables.push(textMat);
  const text = new THREE.Mesh(new THREE.PlaneGeometry(o.width, textH), textMat);
  text.position.set(0, bandY, 0.008);
  group.add(text);

  // ---------- light sweep across the band ----------
  const sweepTex = sweepTexture();
  disposables.push(sweepTex);
  const sweepW = 1.6;
  const sweepMat = new THREE.MeshBasicMaterial({ map: sweepTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.9 });
  disposables.push(sweepMat);
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(sweepW, bandH), sweepMat);
  sweep.position.set(0, bandY, 0.012);
  group.add(sweep);

  // ---------- accent lines framing the band ----------
  const lineMat = new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color('#ffffff'), 0.25), transparent: true, toneMapped: false });
  disposables.push(lineMat);
  [o.height / 2 - 0.012, o.height / 2 - bandH].forEach((y) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(o.width, 0.024), lineMat);
    l.position.set(0, y, 0.014);
    group.add(l);
  });

  // ---------- running chaser light along the bottom line ----------
  const chaserMat = new THREE.MeshBasicMaterial({ map: sweepTex, color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  disposables.push(chaserMat);
  const chaser = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.09), chaserMat);
  chaser.position.set(0, o.height / 2 - bandH, 0.016);
  group.add(chaser);

  const speed = 0.06; // marquee tiles per second; ~1 m/s for a typical band
  const span = o.width + sweepW;
  const update = (t: number) => {
    marquee.texture.offset.x = (t * speed) % 1;
    sweep.position.x = -span / 2 + ((t * 0.16) % 1) * span;
    sweepMat.opacity = 0.55 + 0.35 * Math.sin(t * 1.3) ** 2;
    lineMat.opacity = 0.65 + 0.35 * Math.sin(t * 2.2);
    const cs = o.width + 2.4;
    chaser.position.x = cs / 2 - ((t * 0.22) % 1) * cs;
  };
  update(0);

  return {
    group,
    screen,
    update,
    dispose: () => {
      group.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}

/* ------------------------------------------------------------------------------------------ */

function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** The idle LED picture: dot-matrix panel, accent glows and the department name. */
function baseTexture(o: PromoWallOptions, bandH: number, w: number) {
  const h = Math.round(w * (o.height / o.width));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#07080c');
  g.addColorStop(1, '#0d0f15');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // accent light blooms
  [[0.18, 0.6, 0.55], [0.82, 0.45, 0.5], [0.5, 0.95, 0.6]].forEach(([x, y, r]) => {
    const rg = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    rg.addColorStop(0, hexA(o.accent, 0.38));
    rg.addColorStop(1, hexA(o.accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  });
  // LED pixel grid
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  const step = Math.max(5, Math.round(w / 260));
  for (let y = step; y < h; y += step) for (let x = step; x < w; x += step) ctx.fillRect(x, y, 1.5, 1.5);
  // Title block sits just under the band: the lower wall is behind 2.5 m shelving and demo screens.
  const top = (bandH / o.height) * h;
  const clearBottom = (1 - (2.6 - 0.12) / o.height) * h; // canvas y of 2.6 m above the floor
  const room = Math.max(h * 0.12, clearBottom - top);
  let size = Math.round(room * 0.42);
  ctx.font = `800 ${size}px ${FONT}`;
  while (size > 20 && ctx.measureText(o.name).width > w * 0.84) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  const nameY = top + room * 0.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = o.accent;
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(o.name, w / 2, nameY);
  ctx.shadowBlur = 0;
  if (o.tagline) {
    ctx.fillStyle = 'rgba(244,239,228,0.82)';
    let ts = Math.round(room * 0.13);
    ctx.font = `600 ${ts}px ${FONT}`;
    while (ts > 12 && ctx.measureText(o.tagline).width > w * 0.8) {
      ts -= 2;
      ctx.font = `600 ${ts}px ${FONT}`;
    }
    ctx.fillText(o.tagline, w / 2, nameY + size * 0.72);
  }
  // large faint aisle number behind the shelving area, so the lower wall is not empty
  ctx.fillStyle = hexA(o.accent, 0.16);
  ctx.font = `900 ${Math.round((h - clearBottom) * 0.9)}px ${FONT}`;
  ctx.fillText(o.number, w / 2, clearBottom + (h - clearBottom) * 0.52);
  return canvasTex(c);
}

/** One tile of the scrolling band: NAME ✦ AISLE NN ✦ — repeats seamlessly. */
function marqueeTexture(o: PromoWallOptions) {
  const h = 128;
  const probe = document.createElement('canvas').getContext('2d')!;
  const nameFont = `800 ${Math.round(h * 0.62)}px ${FONT}`;
  const subFont = `700 ${Math.round(h * 0.34)}px ${FONT}`;
  const name = o.name.toUpperCase();
  const sub = `AISLE ${o.number}`;
  const gap = h * 0.55;
  probe.font = nameFont;
  const nameW = probe.measureText(name).width;
  probe.font = subFont;
  const subW = probe.measureText(sub).width;
  const star = h * 0.32;
  const w = Math.ceil(nameW + gap + star + gap + subW + gap + star + gap);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.textBaseline = 'middle';
  let x = 0;
  ctx.font = nameFont;
  ctx.shadowColor = o.accent;
  ctx.shadowBlur = h * 0.18;
  const tg = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, mix(o.accent, '#ffffff', 0.55));
  ctx.fillStyle = tg;
  ctx.fillText(name, x, h * 0.53);
  x += nameW + gap;
  drawStar(ctx, x + star / 2, h / 2, star / 2, o.accent);
  x += star + gap;
  ctx.font = subFont;
  ctx.shadowBlur = h * 0.1;
  ctx.fillStyle = mix(o.accent, '#ffffff', 0.35);
  ctx.fillText(sub, x, h * 0.53);
  x += subW + gap;
  drawStar(ctx, x + star / 2, h / 2, star / 2, o.accent);
  const texture = canvasTex(c);
  texture.wrapS = THREE.RepeatWrapping;
  return { texture, aspect: w / h };
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r;
  ctx.fillStyle = mix(color, '#ffffff', 0.3);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bandGradient(accent: string) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(4,5,8,0.92)');
  g.addColorStop(0.5, hexA(mix(accent, '#04050a', 0.78), 0.9));
  g.addColorStop(1, 'rgba(4,5,8,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return canvasTex(c);
}

function sweepTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,246,222,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 16);
  return canvasTex(c);
}

function hexA(hex: string, a: number) {
  const col = new THREE.Color(hex);
  return `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
}

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
