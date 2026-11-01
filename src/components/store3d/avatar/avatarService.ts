/**
 * Avatar persistence & photo processing.
 *
 * Privacy model
 *  - The original photograph stays in browser memory only while the customer is in the Avatar Studio.
 *    It is never written to localStorage or the database, and is released when they finish or remove it.
 *  - The full photo is kept for the avatar (background removed). It can be remembered
 *    on this device. The account stores colours and clothing only — the server rejects images.
 *  - No identity check is performed. The photo is used only to shape and skin the avatar head.
 *  - If an external photo-to-avatar service is connected, the photo is forwarded once, in memory,
 *    only after a separate explicit consent, and is not stored by this server.
 */
import { AvatarConfig } from '../../../types';
import { normaliseAvatarConfig } from './AvatarModel';

const DEVICE_KEY = 'shopwalk360_avatar_v2';
const LEGACY_KEY = 'shopwalk360_avatar';

export interface SavedAvatar {
  config: AvatarConfig;
  where: 'account' | 'device';
}

function purgeLegacy() {
  // The previous version stored the face photo (as a data URL) inside the saved config without consent.
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage may be blocked */
  }
}

export async function loadSavedAvatar(): Promise<{ saved: SavedAvatar | null; signedIn: boolean }> {
  purgeLegacy();
  let signedIn = false;
  try {
    const r = await fetch('/api/avatar');
    const d = await r.json();
    signedIn = !!d.signedIn;
    if (d.avatar?.config) return { saved: { config: normaliseAvatarConfig(d.avatar.config), where: 'account' }, signedIn };
  } catch {
    /* offline — fall back to device */
  }
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) return { saved: { config: normaliseAvatarConfig(JSON.parse(raw)), where: 'device' }, signedIn };
  } catch {
    /* ignore */
  }
  return { saved: null, signedIn };
}

function forDevice(cfg: AvatarConfig): AvatarConfig {
  const c = { ...cfg };
  delete c.customPhotoUrl;
  return c;
}

function forAccount(cfg: AvatarConfig): AvatarConfig {
  const c = forDevice(cfg);
  delete c.portrait;
  delete c.photoFrame;
  delete c.faceShape;
  return c;
}

export async function saveAvatar(cfg: AvatarConfig, opts: { account: boolean; device: boolean }) {
  const results: string[] = [];
  if (opts.account) {
    const r = await fetch('/api/avatar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: forAccount(cfg), consent: true }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save to your account');
    results.push('account');
  }
  try {
    if (opts.device) {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(forDevice(cfg)));
      results.push('device');
    } else localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* storage blocked */
  }
  return results;
}

export async function deleteSavedAvatar() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
  purgeLegacy();
  await fetch('/api/avatar', { method: 'DELETE' }).catch(() => {});
}

/* ------------------------------------------------------------------ local appearance estimation */

export interface FaceOval {
  /** centre and radii as fractions of the image (0..1) */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface AppearanceEstimate {
  skinTone: string;
  hairColor: string;
  topColor: string | null;
  confidence: 'good' | 'low';
}

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function sample(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, filter?: (r: number, g: number, b: number) => boolean) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const ww = Math.max(1, Math.min(W - x0, Math.floor(w)));
  const hh = Math.max(1, Math.min(H - y0, Math.floor(h)));
  if (x0 >= W || y0 >= H) return null;
  const d = ctx.getImageData(x0, y0, ww, hh).data;
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (filter && !filter(d[i], d[i + 1], d[i + 2])) continue;
    r.push(d[i]);
    g.push(d[i + 1]);
    b.push(d[i + 2]);
  }
  if (r.length < 6) return null;
  return [median(r), median(g), median(b)] as [number, number, number];
}

const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Normalise lighting a little so very dark/bright photos still give a usable tone */
function normaliseSkin(rgb: [number, number, number]): [number, number, number] {
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const target = Math.max(55, Math.min(215, lum));
  const k = lum > 0 ? target / lum : 1;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

/**
 * Estimate skin, hair and clothing colour from regions relative to a face oval the customer positions.
 * Pure pixel statistics — no face detection or recognition is performed.
 */
export async function estimateAppearance(imageUrl: string, oval: FaceOval): Promise<AppearanceEstimate> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imageUrl;
  });
  const maxW = 480;
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const W = c.width;
  const H = c.height;
  const cx = oval.cx * W;
  const cy = oval.cy * H;
  const rx = oval.rx * W;
  const ry = oval.ry * H;
  const notExtreme = (r: number, g: number, b: number) => {
    const l = (r + g + b) / 3;
    return l > 25 && l < 245 && r >= b * 0.85; // skip shadows, highlights and strongly blue pixels
  };
  const cheekL = sample(ctx, cx - rx * 0.55, cy + ry * 0.05, rx * 0.3, ry * 0.25, notExtreme);
  const cheekR = sample(ctx, cx + rx * 0.25, cy + ry * 0.05, rx * 0.3, ry * 0.25, notExtreme);
  const forehead = sample(ctx, cx - rx * 0.25, cy - ry * 0.55, rx * 0.5, ry * 0.15, notExtreme);
  const skins = [cheekL, cheekR, forehead].filter(Boolean) as [number, number, number][];
  const skin: [number, number, number] = skins.length
    ? [median(skins.map((x) => x[0])), median(skins.map((x) => x[1])), median(skins.map((x) => x[2]))]
    : [190, 150, 120];
  const hair = sample(ctx, cx - rx * 0.4, cy - ry * 1.12, rx * 0.8, ry * 0.18) || sample(ctx, cx - rx * 1.05, cy - ry * 0.6, rx * 0.2, ry * 0.5) || [40, 30, 25];
  const top = cy + ry * 1.45 < H ? sample(ctx, cx - rx * 0.9, cy + ry * 1.45, rx * 1.8, Math.min(ry * 0.6, H - (cy + ry * 1.45))) : null;
  return {
    skinTone: toHex(normaliseSkin(skin)),
    hairColor: toHex(hair as [number, number, number]),
    topColor: top ? toHex(top) : null,
    confidence: skins.length >= 2 ? 'good' : 'low',
  };
}

function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imageUrl;
  });
}

/**
 * Crop the head from the face oval into a small feathered portrait.
 * This is the image mapped onto the avatar. The original photo is not kept.
 */
export async function cropPortrait(imageUrl: string, oval: FaceOval): Promise<string> {
  const img = await loadImage(imageUrl);
  const W = img.width;
  const H = img.height;
  let sx = (oval.cx - oval.rx * 1.55) * W;
  let sy = (oval.cy - oval.ry * 1.75) * H;
  let sw = oval.rx * 3.1 * W;
  let sh = oval.ry * 3.35 * H;
  if (sx < 0) { sw += sx; sx = 0; }
  if (sy < 0) { sh += sy; sy = 0; }
  if (sx + sw > W) sw = W - sx;
  if (sy + sh > H) sh = H - sy;
  sw = Math.max(8, sw);
  sh = Math.max(8, sh);

  const paint = (size: number) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = Math.round(size * 1.22);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(c.width / 2, c.height * 0.46);
    ctx.scale(1, 1.18);
    const g = ctx.createRadialGradient(0, 0, c.width * 0.2, 0, 0, c.width * 0.52);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.98)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, c.width * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const webp = c.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  };

  let url = paint(320);
  if (url.length > 220_000) url = paint(220);
  return url;
}

/** Downscale a photo before sending it to an external service (limits payload; strips EXIF metadata) */
export async function photoToJpegBase64(imageUrl: string, max = 768) {
  const img = await loadImage(imageUrl);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

export async function requestProviderAvatar(imageUrl: string): Promise<{ glbUrl: string; appearance?: Partial<AvatarConfig> } | null> {
  const image = await photoToJpegBase64(imageUrl);
  const r = await fetch('/api/avatar/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, consent: true }) });
  if (r.status === 501) return null;
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Avatar service failed');
  return d;
}
