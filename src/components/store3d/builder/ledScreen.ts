import * as THREE from 'three';

const FONT = '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif';

export interface LedBoard {
  texture: THREE.CanvasTexture;
  update: (t: number) => void;
  dispose: () => void;
}

/** Large LED board. Title stays put; the message scrolls. A light sweeps the title. */
export function createLedBoard(opts: { title: string; lines: string[]; accent?: string; wide?: boolean }): LedBoard {
  const wide = opts.wide !== false;
  const w = wide ? 1280 : 768;
  const h = wide ? 720 : 1280;
  const accent = opts.accent || '#c8a96a';
  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  paintBase(base.getContext('2d')!, w, h, accent);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const message = opts.lines.map((l) => l.trim()).filter(Boolean).join('    ·    ') || opts.title;
  const title = opts.title.trim() || 'ShopWalk 360';

  const draw = (t: number) => {
    ctx.drawImage(base, 0, 0);
    const titleSize = wide ? 96 : 92;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fitSize(ctx, title, w - 100, titleSize, wide ? 52 : 48)}px ${FONT}`;
    const titleY = wide ? h * 0.34 : h * 0.28;
    ctx.fillText(title, w / 2, titleY);
    // moving light across the title
    const sweep = ((t * 0.18) % 1) * (w + 240) - 120;
    const glow = ctx.createLinearGradient(sweep - 80, 0, sweep + 80, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.5, 'rgba(255,244,214,0.55)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, titleY - titleSize, w, titleSize * 2);

    const bandY = wide ? h * 0.62 : h * 0.5;
    const bandH = wide ? h * 0.28 : h * 0.34;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(36, bandY, w - 72, bandH);
    ctx.font = `700 ${wide ? 68 : 62}px ${FONT}`;
    const textW = ctx.measureText(message).width;
    const span = textW + w * 0.45;
    const x = w - ((t * (wide ? 140 : 110)) % span);
    ctx.save();
    ctx.beginPath();
    ctx.rect(48, bandY, w - 96, bandH);
    ctx.clip();
    ctx.fillStyle = '#f4efe4';
    ctx.textAlign = 'left';
    ctx.fillText(message, x, bandY + bandH / 2);
    ctx.fillText(message, x + span, bandY + bandH / 2);
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.font = `700 ${wide ? 22 : 20}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SHOPWALK 360', w / 2, h - (wide ? 36 : 48));
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
    s -= 4;
    ctx.font = `800 ${s}px ${FONT}`;
  }
  return s;
}

function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let y = 8; y < h; y += 8) {
    for (let x = 8; x < w; x += 8) ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.fillStyle = accent;
  ctx.fillRect(16, 16, w - 32, 14);
}
