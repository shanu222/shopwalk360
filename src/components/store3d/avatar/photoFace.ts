/**
 * Builds a 3D head from one photo, on this device.
 * MediaPipe finds the face and returns a mesh with depth (nose, jaw, cheeks).
 * The photo is wrapped on that mesh. The original file is not kept.
 */
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { FACE_TRIANGLES } from './faceTriangles';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Top of the face outline, one side to the other across the forehead. */
const CROWN = [234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454];
/** Bottom of the face outline, one side to the other under the chin. */
const JAW = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];

const COUNT = 468;
const STRIDE = 5;

export interface PhotoFace {
  portrait: string;
  faceShape: string;
}

let loading: Promise<FaceLandmarker | null> | null = null;

export function preloadPhotoFace() {
  void getLandmarker();
}

async function getLandmarker() {
  if (!loading) {
    loading = (async () => {
      try {
        const files = await FilesetResolver.forVisionTasks(WASM);
        return await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      } catch (err) {
        console.warn('Face model could not be loaded', err);
        loading = null;
        return null;
      }
    })();
  }
  return loading;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read that photo'));
    img.src = url;
  });
}

function encode(data: Float32Array) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/**
 * Fit a 3D face to the photo. Returns null when no face is found.
 * `portrait` is a head crop used as the mesh texture. `faceShape` is the mesh.
 */
export async function buildPhotoFace(imageUrl: string): Promise<PhotoFace | null> {
  const [img, landmarker] = await Promise.all([loadImage(imageUrl), getLandmarker()]);
  if (!landmarker) throw new Error('The 3D face model could not be loaded. Check your connection and try again.');
  const found = landmarker.detect(img);
  const landmarks = found.faceLandmarks?.[0];
  if (!landmarks || landmarks.length < COUNT) return null;
  return packFace(img, landmarks.slice(0, COUNT));
}

function packFace(img: HTMLImageElement, lms: NormalizedLandmark[]): PhotoFace {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of lms) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const faceW = Math.max(0.02, maxX - minX);
  const faceH = Math.max(0.02, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const left = Math.max(0, cx - faceW * 0.9);
  const right = Math.min(1, cx + faceW * 0.9);
  const top = Math.max(0, minY - faceH * 1.05);
  const bottom = Math.min(1, maxY + faceH * 0.62);
  const cropW = Math.max(0.05, right - left);
  const cropH = Math.max(0.05, bottom - top);

  const s = 0.158 / faceW;
  const data = new Float32Array(COUNT * STRIDE);
  for (let i = 0; i < COUNT; i++) {
    const p = lms[i];
    const o = i * STRIDE;
    data[o] = (p.x - cx) * s;
    data[o + 1] = -(p.y - cy) * s;
    data[o + 2] = -(p.z || 0) * s;
    data[o + 3] = (p.x - left) / cropW;
    data[o + 4] = 1 - (p.y - top) / cropH;
  }

  const cheekZ = (data[234 * STRIDE + 2] + data[454 * STRIDE + 2]) / 2;
  for (let i = 0; i < COUNT; i++) {
    const o = i * STRIDE + 2;
    data[o] = cheekZ + (data[o] - cheekZ) * 1.75;
  }
  const chinY = data[152 * STRIDE + 1];
  const dy = -0.07 - chinY;
  const dz = 0.03 - cheekZ;
  for (let i = 0; i < COUNT; i++) {
    data[i * STRIDE + 1] += dy;
    data[i * STRIDE + 2] += dz;
  }

  const canvas = document.createElement('canvas');
  const maxEdge = 720;
  const sw = cropW * img.width;
  const sh = cropH * img.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  canvas.width = Math.max(32, Math.round(sw * scale));
  canvas.height = Math.max(32, Math.round(sh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, left * img.width, top * img.height, sw, sh, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.9);
  const portrait = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.9);
  return { portrait, faceShape: encode(data) };
}

export interface PhotoHeadMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/** Turn a stored face into a closed head mesh, with the photo continuing over the hair and chin. */
export function decodePhotoHead(encoded: string): PhotoHeadMesh | null {
  let data: Float32Array;
  try {
    const bin = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    if (bin.byteLength !== COUNT * STRIDE * 4) return null;
    data = new Float32Array(bin.buffer);
  } catch {
    return null;
  }

  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    const o = i * STRIDE;
    pos.push(data[o], data[o + 1], data[o + 2]);
    uv.push(data[o + 3], data[o + 4]);
  }
  const idx = FACE_TRIANGLES.slice();

  let nz = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    nz += (pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[b + 1] - pos[a + 1]) * (pos[c] - pos[a]);
  }
  if (nz < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }

  const at = (i: number) => ({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2], u: uv[i * 2], v: uv[i * 2 + 1] });
  const push = (p: { x: number; y: number; z: number; u: number; v: number }) => {
    const id = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    uv.push(Math.min(0.995, Math.max(0.005, p.u)), Math.min(0.995, Math.max(0.005, p.v)));
    return id;
  };
  const forehead = at(10);
  const chin = at(152);
  const faceH = Math.max(0.05, forehead.y - chin.y);
  const vSpan = Math.max(0.2, Math.abs(forehead.v - chin.v));

  const ribbon = (chain: number[], amount: number, ySign: number, back: number, vSign: number) => {
    const row = chain.map((i) => {
      const p = at(i);
      return push({
        x: p.x * (1 + amount * 0.08),
        y: p.y + ySign * faceH * amount,
        z: p.z - back,
        u: p.u,
        v: p.v + vSign * vSpan * amount,
      });
    });
    for (let i = 0; i < chain.length - 1; i++) {
      idx.push(chain[i], row[i], chain[i + 1], row[i], row[i + 1], chain[i + 1]);
    }
    return row;
  };

  const leftToRight = (chain: number[]) => (at(chain[0]).x > at(chain[chain.length - 1]).x ? [...chain].reverse() : chain.slice());
  const hair1 = ribbon(leftToRight(CROWN), 0.36, 1, 0.014, 1);
  const hair2 = ribbon(hair1, 0.3, 1, 0.03, 1);
  const crown = push({
    x: forehead.x,
    y: forehead.y + faceH * 0.72,
    z: forehead.z - 0.06,
    u: forehead.u,
    v: forehead.v + vSpan * 0.95,
  });
  for (let i = 0; i < hair2.length - 1; i++) idx.push(hair2[i], crown, hair2[i + 1]);
  ribbon(leftToRight(JAW), 0.34, -1, 0.012, -1);

  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}
