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

  constructor(listener: Listener) {
    this.listener = listener;
    this.open();
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
      if (this.look) ws.send(JSON.stringify({ t: 'look', look: this.look }));
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
    const { glbUrl, photoUrl, avatarName, ...rest } = cfg as any;
    void glbUrl;
    void photoUrl;
    void avatarName;
    this.look = rest;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'look', look: this.look }));
  }

  sendPosition(x: number, z: number, yaw: number, speed: number, inside: boolean) {
    const now = performance.now();
    if (now - this.lastPos < 180) return;
    this.lastPos = now;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'pos', x, z, yaw, s: speed, in: inside }));
  }

  leave() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' }));
  }

  close() {
    this.closed = true;
    this.leave();
    this.ws?.close();
  }
}
