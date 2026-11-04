import { AvatarConfig, TryOnOverride } from '../../types';
import { CameraMode } from './engine/StoreEngine';
import { normaliseAvatarConfig } from './avatar/AvatarModel';

/**
 * Where the shopper is in the 3D store, kept for this browser tab so a page refresh puts them
 * back where they were instead of at the entrance. Session storage: it survives a reload but a
 * new tab or a new visit starts fresh at the entrance.
 */
export interface StoreVisit {
  v: 1;
  x: number;
  z: number;
  yaw: number;
  camYaw: number;
  cameraMode: CameraMode;
  avatar: AvatarConfig;
  tryOns: TryOnOverride[];
  /** product panel that was open, reopened after the reload */
  openShelfId?: string | null;
  savedAt: number;
}

const KEY = 'shopwalk360_visit';
const MAX_AGE = 12 * 60 * 60 * 1000;

export function readVisit(): StoreVisit | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoreVisit;
    const finite = [v.x, v.z, v.yaw, v.camYaw].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (v.v !== 1 || !finite || !v.avatar || Date.now() - (v.savedAt || 0) > MAX_AGE) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return {
      ...v,
      // stored data can be stale or damaged: never let it break the store
      avatar: normaliseAvatarConfig(v.avatar),
      tryOns: Array.isArray(v.tryOns) ? v.tryOns.filter((t) => t && typeof t.slot === 'string' && typeof t.productId === 'string') : [],
      cameraMode: v.cameraMode === 'first_person' ? 'first_person' : 'third_person',
      openShelfId: typeof v.openShelfId === 'string' ? v.openShelfId : null,
    };
  } catch {
    return null;
  }
}

export function writeVisit(v: Omit<StoreVisit, 'v' | 'savedAt'>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...v, v: 1, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked: the shopper just starts at the entrance next time */
  }
}

export function clearVisit() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
