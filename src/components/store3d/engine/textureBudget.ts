import * as THREE from 'three';

/**
 * Graphics-memory budget for phones and tablets.
 *
 * Phones (iPhone Safari above all) give a web page far less graphics memory than a computer and
 * drop the whole 3D view when it runs out ("The 3D view was paused by your device"). The store's
 * signs, paintings, LED pictures and product photos are drawn at desktop resolution; on a phone
 * the screen is small, so each picture is stored at a lower resolution instead — about a quarter
 * of the memory, with no visible difference at phone size.
 *
 * Computers are left exactly as they are: the budget is only switched on for touch devices.
 */

export interface TextureBudget {
  /** resize factor for each side of a picture */
  scale: number;
  /** longest side any picture may have */
  maxDim: number;
}

let budget: TextureBudget | null = null;

/** Phone or tablet: a touch screen is the main pointer (iPadOS reports itself as a Mac). */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const ipad = /Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1;
  const mobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return coarse || ipad || mobileUA;
}

export function setTextureBudget(b: TextureBudget | null) {
  budget = b;
}

export function getTextureBudget() {
  return budget;
}

/** Store this picture at the budget's resolution (no-op on computers and for changing pictures). */
export function shrinkTexture(t: THREE.Texture | null | undefined) {
  if (!budget || !t) return;
  const ud = t.userData || (t.userData = {});
  if (ud.shrunk || ud.dynamic || ud.pending) return;
  const any = t as any;
  if (any.isVideoTexture || any.isDataTexture || any.isCubeTexture || any.isCompressedTexture || any.isDepthTexture || any.isRenderTargetTexture) return;
  const img = t.image as any;
  if (!img) return;
  const w = img.naturalWidth || img.videoWidth || img.width || 0;
  const h = img.naturalHeight || img.videoHeight || img.height || 0;
  if (!w || !h || typeof img.getContext === 'undefined' && !(img instanceof HTMLImageElement) && !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) return;
  ud.shrunk = true;
  ud.origW = w;
  if (w * h <= 160 * 160) return; // tags and small icons are already cheap
  const side = Math.max(w, h);
  let k = budget.scale;
  if (side * k > budget.maxDim) k = budget.maxDim / side;
  if (k >= 0.98) return;
  const nw = Math.max(8, Math.round(w * k));
  const nh = Math.max(8, Math.round(h * k));
  try {
    const c = document.createElement('canvas');
    c.width = nw;
    c.height = nh;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, nw, nh);
    t.image = c;
    t.needsUpdate = true;
    if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
    else if (typeof img.getContext === 'function') {
      // free the large drawing buffer right away (canvases are often still referenced elsewhere)
      img.width = 1;
      img.height = 1;
    }
  } catch {
    /* a picture from another site without permission: keep it as it is */
  }
}

function texturesOf(m: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const k of Object.keys(m)) {
    const v = (m as any)[k];
    if (v && v.isTexture) out.push(v);
  }
  const u = (m as any).uniforms;
  if (u) for (const k of Object.keys(u)) if (u[k]?.value?.isTexture) out.push(u[k].value);
  return out;
}

/** Apply the budget to every picture used inside `root`. */
export function shrinkObjectTextures(root: THREE.Object3D) {
  if (!budget) return;
  root.traverse((o: any) => {
    const ms: THREE.Material[] = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => texturesOf(m).forEach(shrinkTexture));
  });
}
