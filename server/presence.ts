/**
 * Live shoppers in the 3D store (WebSocket at /presence).
 *
 * Only real, connected visitors are shared — there are no simulated shoppers.
 * Each client sends its avatar look once and its position a few times a second;
 * the server relays a snapshot of everyone else in the store. Nothing is stored.
 * No names, emails or photos are shared: only an anonymous id, avatar colours/style and position.
 */
import type { Server } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

interface Shopper {
  id: string;
  ws: WebSocket;
  look: Record<string, unknown> | null;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  inside: boolean;
  updated: number;
  lastMsg: number;
  msgCount: number;
}

const MAX_SHOPPERS = 300;
const TICK_MS = 200;

// avatar fields that are safe to share (no photo, no generated model URL, no name)
const LOOK_KEYS = [
  'gender', 'bodyType', 'skinTone', 'hairColor', 'hairStyle', 'eyeColor', 'facialHair', 'topStyle', 'outfitColor',
  'bottomStyle', 'pantsColor', 'shoeStyle', 'shoesColor', 'heightScale', 'glassesStyle', 'glassesColor',
  'watchCaseColor', 'watchStrap', 'watchStrapColor',
];

function cleanLook(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) {
    const v = raw[k];
    if (typeof v === 'string' && v.length <= 32 && /^[#\w-]+$/.test(v)) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0.8, Math.min(1.2, v));
  }
  out.accessories = {
    glasses: !!raw.accessories?.glasses,
    watch: !!raw.accessories?.watch,
    shoppingBasket: true,
  };
  return out;
}

const num = (v: any, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null);

const shoppers = new Map<string, Shopper>();

/** live counts for the admin dashboard */
export function presenceStats() {
  let inside = 0;
  for (const s of shoppers.values()) if (s.inside) inside++;
  return { online: shoppers.size, inStore3d: inside };
}

export function attachPresence(server: Server, isOriginAllowed: (origin: string | undefined) => boolean) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/presence')) return socket.destroy();
    if (!isOriginAllowed(req.headers.origin) || shoppers.size >= MAX_SHOPPERS) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    const id = crypto.randomBytes(6).toString('hex');
    (ws as any).alive = true;
    ws.on('pong', () => ((ws as any).alive = true));
    const me: Shopper = { id, ws, look: null, x: 0, z: 0, yaw: 0, speed: 0, inside: false, updated: Date.now(), lastMsg: Date.now(), msgCount: 0 };
    shoppers.set(id, me);
    ws.send(JSON.stringify({ t: 'hello', id }));

    ws.on('message', (data) => {
      const now = Date.now();
      // simple flood control: at most ~20 messages per second
      if (now - me.lastMsg > 1000) {
        me.lastMsg = now;
        me.msgCount = 0;
      }
      if (++me.msgCount > 20) return;
      let m: any;
      try {
        m = JSON.parse(String(data));
      } catch {
        return;
      }
      if (m?.t === 'look') me.look = cleanLook(m.look);
      if (m?.t === 'pos') {
        const x = num(m.x, -30, 30);
        const z = num(m.z, -60, 60);
        if (x === null || z === null) return;
        me.x = x;
        me.z = z;
        me.yaw = num(m.yaw, -100, 100) ?? 0;
        me.speed = num(m.s, 0, 5) ?? 0;
        me.inside = !!m.in;
        me.updated = now;
      }
      if (m?.t === 'leave') me.inside = false;
    });
    ws.on('close', () => shoppers.delete(id));
    ws.on('error', () => shoppers.delete(id));
  });

  // broadcast: every client receives everyone else who is inside the store and has a look
  setInterval(() => {
    const visible: Shopper[] = [];
    for (const s of shoppers.values()) {
      if (s.inside && s.look) visible.push(s);
    }
    for (const s of shoppers.values()) {
      if (s.ws.readyState !== WebSocket.OPEN) continue;
      const others = visible
        .filter((o) => o.id !== s.id)
        .map((o) => ({ id: o.id, x: +o.x.toFixed(2), z: +o.z.toFixed(2), yaw: +o.yaw.toFixed(2), s: +o.speed.toFixed(2), look: o.look }));
      s.ws.send(JSON.stringify({ t: 'shoppers', list: others, online: shoppers.size }));
    }
  }, TICK_MS).unref();

  // keep connections alive through proxies; drop dead ones
  // a shopper stays visible while their page is open (even standing still or in a background tab);
  // connections that stop answering pings are dropped
  setInterval(() => {
    for (const s of shoppers.values()) {
      const ws = s.ws as any;
      if (s.ws.readyState !== WebSocket.OPEN || ws.alive === false) {
        try {
          s.ws.terminate();
        } catch {
          /* already closed */
        }
        shoppers.delete(s.id);
        continue;
      }
      ws.alive = false;
      s.ws.ping();
    }
  }, 20000).unref();
}
