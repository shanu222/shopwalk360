import * as THREE from 'three';

const FONT = '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif';

export interface LedBoard {
  texture: THREE.CanvasTexture;
  update: (t: number) => void;
  dispose: () => void;
}

/**
 * Large LED board. Title stays put; the message scrolls. A light sweeps the title.
 * The canvas is modest on purpose: the mesh is large, and a full-size canvas
 * uploaded every frame was freezing the page.
 */
export function createLedBoard(opts: { title: string; lines: string[]; accent?: string; wide?: boolean; scale?: number }): LedBoard {
  const wide = opts.wide !== false;
  const w = wide ? 640 : 384;
  const h = wide ? 360 : 640;
  const accent = opts.accent || '#c8a96a';
  // `scale` draws the same layout at higher resolution (for very large screens)
  const k = Math.max(1, Math.min(2, opts.scale || 1));
  const base = document.createElement('canvas');
  base.width = Math.round(w * k);
  base.height = Math.round(h * k);
  const bctx = base.getContext('2d')!;
  bctx.setTransform(k, 0, 0, k, 0, 0);
  paintBase(bctx, w, h, accent);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const message = opts.lines.map((l) => l.trim()).filter(Boolean).join('    ·    ') || opts.title;
  const title = opts.title.trim() || 'ShopWalk 360';
  const titleSize = wide ? 48 : 46;
  const titlePx = fitSize(ctx, title, w - 48, titleSize, wide ? 26 : 24);
  ctx.font = `700 ${wide ? 34 : 30}px ${FONT}`;
  const textW = ctx.measureText(message).width;
  const span = textW + w * 0.45;
  const titleY = wide ? h * 0.34 : h * 0.28;
  const bandY = wide ? h * 0.62 : h * 0.5;
  const bandH = wide ? h * 0.28 : h * 0.34;
  const speed = wide ? 70 : 55;

  const draw = (t: number) => {
    ctx.drawImage(base, 0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${titlePx}px ${FONT}`;
    ctx.fillText(title, w / 2, titleY);
    const sweep = ((t * 0.18) % 1) * (w + 120) - 60;
    const glow = ctx.createLinearGradient(sweep - 40, 0, sweep + 40, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.5, 'rgba(255,244,214,0.55)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, titleY - titlePx, w, titlePx * 2);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(18, bandY, w - 36, bandH);
    ctx.font = `700 ${wide ? 34 : 30}px ${FONT}`;
    const x = w - ((t * speed) % span);
    ctx.save();
    ctx.beginPath();
    ctx.rect(24, bandY, w - 48, bandH);
    ctx.clip();
    ctx.fillStyle = '#f4efe4';
    ctx.textAlign = 'left';
    ctx.fillText(message, x, bandY + bandH / 2);
    ctx.fillText(message, x + span, bandY + bandH / 2);
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SHOPWALK 360', w / 2, h - (wide ? 18 : 24));
    texture.needsUpdate = true;
  };
  draw(0);

  return {
    texture,
    update: draw,
    dispose: () => texture.dispose(),
  };
}

function fitSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number) {
  let s = size;
  ctx.font = `800 ${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `800 ${s}px ${FONT}`;
  }
  return s;
}

function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  const step = 10;
  for (let y = step; y < h; y += step) {
    for (let x = step; x < w; x += step) ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = accent;
  ctx.fillRect(8, 8, w - 16, 8);
}
