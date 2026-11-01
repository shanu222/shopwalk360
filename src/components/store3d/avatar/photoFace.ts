/**
 * Turns the whole uploaded photo into the avatar picture, on this device.
 * A person segmenter lifts the subject out of the background. The full frame is kept.
 */
import { FaceLandmarker, FilesetResolver, ImageSegmenter, type NormalizedLandmark } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEGMENT_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

export interface PhotoOval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface PhotoFace {
  /** Full photo of the person, background removed. */
  portrait: string;
  /** faceCentreY, faceHeight, image aspect (width / height), all in the portrait. */
  photoFrame: string;
  oval: PhotoOval;
}

let filesPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let facePromise: Promise<FaceLandmarker | null> | null = null;
let segmentPromise: Promise<ImageSegmenter | null> | null = null;

function files() {
  if (!filesPromise) filesPromise = FilesetResolver.forVisionTasks(WASM);
  return filesPromise;
}

export function preloadPhotoFace() {
  void getFace();
  void getSegmenter();
}

async function getFace() {
  if (!facePromise) {
    facePromise = (async () => {
      try {
        return await FaceLandmarker.createFromOptions(await files(), {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      } catch (err) {
        console.warn('Face model could not be loaded', err);
        facePromise = null;
        return null;
      }
    })();
  }
  return facePromise;
}

async function getSegmenter() {
  if (!segmentPromise) {
    segmentPromise = (async () => {
      try {
        return await ImageSegmenter.createFromOptions(await files(), {
          baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      } catch (err) {
        console.warn('Person model could not be loaded', err);
        segmentPromise = null;
        return null;
      }
    })();
  }
  return segmentPromise;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read that photo'));
    img.src = url;
  });
}

function faceBox(landmarks: NormalizedLandmark[] | undefined): PhotoOval {
  if (!landmarks?.length) return { cx: 0.5, cy: 0.4, rx: 0.22, ry: 0.28 };
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of landmarks) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: Math.max(0.08, (maxX - minX) / 2),
    ry: Math.max(0.1, (maxY - minY) / 2),
  };
}

/**
 * Keep the entire photo. The person is cut out of the background when the
 * segmenter is available. Nothing is reduced to a face circle.
 */
export async function buildPhotoFace(imageUrl: string): Promise<PhotoFace> {
  const [img, faceModel, segmenter] = await Promise.all([loadImage(imageUrl), getFace(), getSegmenter()]);
  if (!faceModel && !segmenter) throw new Error('The photo model could not be loaded. Check your connection and try again.');
  const landmarks = faceModel?.detect(img).faceLandmarks?.[0];
  const oval = faceBox(landmarks);
  const mask = segmenter ? readMask(segmenter, img) : null;
  const cut = cutout(img, mask, oval);
  return { portrait: cut.portrait, photoFrame: cut.photoFrame, oval };
}

function readMask(segmenter: ImageSegmenter, img: HTMLImageElement) {
  try {
    const result = segmenter.segment(img);
    const mask = result.confidenceMasks?.[0];
    if (!mask?.hasFloat32Array()) return null;
    const data = mask.getAsFloat32Array();
    let sum = 0;
    const step = Math.max(1, Math.floor(data.length / 4000));
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      sum += data[i];
      n++;
    }
    if (n === 0 || sum / n < 0.03 || sum / n > 0.97) return null;
    return { data, width: mask.width, height: mask.height };
  } catch {
    return null;
  }
}

function sample(mask: { data: Float32Array; width: number; height: number }, x: number, y: number) {
  const fx = Math.min(mask.width - 1, Math.max(0, x));
  const fy = Math.min(mask.height - 1, Math.max(0, y));
  return mask.data[Math.round(fy) * mask.width + Math.round(fx)] || 0;
}

function cutout(img: HTMLImageElement, mask: { data: Float32Array; width: number; height: number } | null, oval: PhotoOval) {
  const maxSide = 900;
  const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
  const W = Math.max(2, Math.round(img.width * sc));
  const H = Math.max(2, Math.round(img.height * sc));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const pix = ctx.getImageData(0, 0, W, H);
  const d = pix.data;
  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let a = 255;
      if (mask) {
        const mx = ((x + 0.5) / W) * mask.width - 0.5;
        const my = ((y + 0.5) / H) * mask.height - 0.5;
        const m = sample(mask, mx, my);
        a = m >= 0.55 ? 255 : m <= 0.25 ? 0 : Math.round(((m - 0.25) / 0.3) * 255);
      }
      d[i + 3] = a;
      if (a > 24) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(pix, 0, 0);
  if (maxX <= minX || maxY <= minY) {
    minX = 0;
    minY = 0;
    maxX = W - 1;
    maxY = H - 1;
  }
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  out.getContext('2d')!.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);

  const fx = (oval.cx * W - minX) / tw;
  const fy = (oval.cy * H - minY) / th;
  const fh = Math.min(0.95, Math.max(0.12, (oval.ry * 2 * H) / th));
  const aspect = tw / th;
  const webp = out.toDataURL('image/webp', 0.9);
  const portrait = webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/png');
  return {
    portrait,
    photoFrame: `${clamp01(fy).toFixed(4)},${fh.toFixed(4)},${aspect.toFixed(4)}`,
  };
}

function clamp01(n: number) {
  return Math.min(0.98, Math.max(0.02, n));
}
