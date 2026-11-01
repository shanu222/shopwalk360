import { API_BASE } from './api';
import type { AvatarConfig } from '../types';

export interface RemoteShopper {
  id: string;
  x: number;
  z: number;
  yaw: number;
  s: number;
  look: Partial<AvatarConfig> & Record<string, unknown>;
}

type Listener = (list: RemoteShopper[], online: number) => void;

function wsUrl() {
  const base = API_BASE || window.location.origin;
  return base.replace(/^http/i, 'ws').replace(/\/$/, '') + '/presence';
}

/**
 * Connection to the live-shoppers channel. Only real visitors who are inside
 * the 3D store are relayed by the server — nothing is simulated.
 */
export class PresenceClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 1000;
  private look: Record<string, unknown> | null = null;
  private listener: Listener;
  private lastPos = 0;
  private state: { x: number; z: number; yaw: number; s: number; in: boolean } | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  connected = false;
  onStatus?: (connected: boolean) => void;

  constructor(listener: Listener) {
    this.listener = listener;
    this.open();
    // keep reporting where we stand even when not moving or when this tab is in the background
    // (background tabs pause rendering, but timers still run)
    this.heartbeat = setInterval(() => this.flush(), 2000);
  }

  private open() {
    if (this.closed || typeof WebSocket === 'undefined') return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.connected = true;
      this.onStatus?.(true);
      if (this.look) ws.send(JSON.stringify({ t: 'look', look: this.look }));
      this.flush();
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.t === 'shoppers' && Array.isArray(m.list)) this.listener(m.list, Number(m.online) || 0);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      this.connected = false;
      this.onStatus?.(false);
      this.listener([], 0);
      if (this.closed) return;
      setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 30000);
    };
    ws.onerror = () => ws.close();
  }

  setLook(cfg: AvatarConfig | null) {
    if (!cfg) return;
    // never send photos, generated model links or names
    const { glbUrl, photoUrl, portrait, photoFrame, faceShape, customPhotoUrl, avatarName, ...rest } = cfg as any;
    void glbUrl;
    void photoUrl;
    void portrait;
    void photoFrame;
    void faceShape;
    void customPhotoUrl;
    void avatarName;
    this.look = rest;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'look', look: this.look }));
  }

  sendPosition(x: number, z: number, yaw: number, speed: number, inside: boolean) {
    this.state = { x, z, yaw, s: speed, in: inside };
    const now = performance.now();
    if (now - this.lastPos < 150) return;
    this.flush();
  }

  private flush() {
    if (!this.state || this.ws?.readyState !== WebSocket.OPEN) return;
    this.lastPos = performance.now();
    this.ws.send(JSON.stringify({ t: 'pos', ...this.state }));
  }

  leave() {
    this.state = this.state ? { ...this.state, in: false } : null;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' }));
  }

  close() {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.leave();
    this.ws?.close();
  }
}
