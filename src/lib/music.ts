import { useSyncExternalStore } from 'react';
import { mediaUrl } from './api';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
}

interface MusicState {
  tracks: MusicTrack[];
  index: number;
  playing: boolean;
  /** shopper wants sound (remembered on this device) */
  enabled: boolean;
  /** browser blocked autoplay — waiting for the first tap/click */
  waitingForGesture: boolean;
}

const KEY = 'shopwalk360_sound';

function readEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * One audio element for the whole site, so music keeps playing from the welcome
 * screen into the store and between the 2D and 3D views. Plays the admin's
 * playlist in order and repeats it.
 */
class MusicController {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<() => void>();
  private loaded = false;
  private failures = 0;
  private gestureArmed = false;
  state: MusicState = { tracks: [], index: 0, playing: false, enabled: readEnabled(), waitingForGesture: false };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<MusicState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private el() {
    if (!this.audio && typeof window !== 'undefined') {
      const a = new Audio();
      a.preload = 'auto';
      a.volume = 0.45;
      a.addEventListener('ended', () => this.next());
      a.addEventListener('playing', () => {
        this.failures = 0;
        this.set({ playing: true, waitingForGesture: false });
      });
      a.addEventListener('pause', () => this.set({ playing: false }));
      a.addEventListener('error', () => {
        // skip a broken file, but stop if every track fails
        this.failures++;
        if (this.failures < this.state.tracks.length) this.next();
        else this.set({ playing: false });
      });
      this.audio = a;
    }
    return this.audio;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const r = await fetch('/api/music');
      const d = await r.json();
      const tracks: MusicTrack[] = Array.isArray(d.tracks) ? d.tracks : [];
      this.set({ tracks, index: 0 });
      if (tracks.length && this.state.enabled) this.play();
    } catch {
      /* no music available */
    }
  }

  private armGesture() {
    if (this.gestureArmed || typeof window === 'undefined') return;
    this.gestureArmed = true;
    this.set({ waitingForGesture: true });
    const start = () => {
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('keydown', start, true);
      this.gestureArmed = false;
      if (this.state.enabled) this.play();
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('keydown', start, true);
  }

  private play() {
    const a = this.el();
    const t = this.state.tracks[this.state.index];
    if (!a || !t) return;
    const src = mediaUrl(t.url);
    if (a.dataset.src !== src) {
      a.src = src;
      a.dataset.src = src;
    }
    a.play().catch((e) => {
      if (e?.name === 'NotAllowedError') this.armGesture();
    });
  }

  select(i: number) {
    if (!this.state.tracks[i]) return;
    this.set({ index: i });
    this.setEnabled(true);
    this.play();
  }

  next() {
    const n = this.state.tracks.length;
    if (!n) return;
    this.set({ index: (this.state.index + 1) % n });
    if (this.state.enabled) this.play();
  }

  prev() {
    const n = this.state.tracks.length;
    if (!n) return;
    this.set({ index: (this.state.index - 1 + n) % n });
    if (this.state.enabled) this.play();
  }

  setEnabled(on: boolean) {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    this.set({ enabled: on });
    if (on) this.play();
    else this.audio?.pause();
  }

  toggle() {
    this.setEnabled(!this.state.enabled);
  }

  /** briefly step aside, e.g. while a product video with sound is playing */
  duck(on: boolean) {
    if (this.audio) this.audio.volume = on ? 0.08 : 0.45;
  }
}

export const music = new MusicController();

export function useMusic() {
  return useSyncExternalStore(music.subscribe, music.getState, music.getState);
}
