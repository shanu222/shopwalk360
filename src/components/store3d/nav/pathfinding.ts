import { Rect, STORE } from '../layout/storeLayout';

/**
 * Grid navigation over the store floor. Obstacles are the same axis-aligned colliders used for movement,
 * inflated by the avatar radius. A* with octile heuristic, then line-of-sight smoothing ("string pulling").
 */
export class NavGrid {
  readonly cell = 0.25;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(colliders: Rect[], radius = 0.34) {
    const b = STORE.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.cols = Math.ceil((b.maxX - b.minX) / this.cell);
    this.rows = Math.ceil((b.maxZ - b.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    colliders.forEach((r) => {
      const c0 = Math.max(0, Math.floor((r.minX - radius - this.minX) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.floor((r.maxX + radius - this.minX) / this.cell));
      const r0 = Math.max(0, Math.floor((r.minZ - radius - this.minZ) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.floor((r.maxZ + radius - this.minZ) / this.cell));
      for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) this.blocked[y * this.cols + x] = 1;
    });
  }

  private idx(x: number, z: number) {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  isWalkable(x: number, z: number) {
    const i = this.idx(x, z);
    return i >= 0 && !this.blocked[i];
  }

  /** nearest walkable point (spiral search) */
  nearestWalkable(x: number, z: number, maxR = 4): { x: number; z: number } | null {
    if (this.isWalkable(x, z)) return { x, z };
    for (let r = this.cell; r <= maxR; r += this.cell) {
      const steps = Math.max(8, Math.ceil((2 * Math.PI * r) / this.cell));
      let best: { x: number; z: number } | null = null;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) {
          best = { x: px, z: pz };
          break;
        }
      }
      if (best) return best;
    }
    return null;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      if (!this.isWalkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const start = this.nearestWalkable(sx, sz, 1.5);
    const goal = this.nearestWalkable(tx, tz, 3);
    if (!start || !goal) return null;
    if (this.lineOfSight(start.x, start.z, goal.x, goal.z)) return [goal];
    const s = this.idx(start.x, start.z);
    const g = this.idx(goal.x, goal.z);
    const N = this.cols * this.rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const gc = g % this.cols;
    const gr = Math.floor(g / this.cols);
    const h = (i: number) => {
      const dx = Math.abs((i % this.cols) - gc);
      const dy = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    gScore[s] = 0;
    heap.push(s, h(s));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let iter = 0;
    while (heap.size && iter++ < 200000) {
      const cur = heap.pop();
      if (cur === g) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (const [dx, dy, cost] of dirs) {
        const nc = cc + dx;
        const nr = cr + dy;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.blocked[ni] || closed[ni]) continue;
        // no corner cutting
        if (dx && dy && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
    }
    if (came[g] === -1 && g !== s) return null;
    const raw: { x: number; z: number }[] = [];
    for (let i = g; i !== -1 && i !== s; i = came[i]) {
      raw.push({ x: this.minX + ((i % this.cols) + 0.5) * this.cell, z: this.minZ + (Math.floor(i / this.cols) + 0.5) * this.cell });
    }
    raw.reverse();
    raw[raw.length - 1] = goal;
    // string pulling
    const out: { x: number; z: number }[] = [];
    let ax = start.x;
    let az = start.z;
    let k = 0;
    while (k < raw.length) {
      let far = k;
      for (let j = raw.length - 1; j > k; j--) {
        if (this.lineOfSight(ax, az, raw[j].x, raw[j].z)) {
          far = j;
          break;
        }
      }
      out.push(raw[far]);
      ax = raw[far].x;
      az = raw[far].z;
      k = far + 1;
    }
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, p: number) {
    this.ids.push(id);
    this.pri.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      [this.ids[parent], this.ids[i]] = [this.ids[i], this.ids[parent]];
      [this.pri[parent], this.pri[i]] = [this.pri[i], this.pri[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.pri.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.ids.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        [this.ids[m], this.ids[i]] = [this.ids[i], this.ids[m]];
        [this.pri[m], this.pri[i]] = [this.pri[i], this.pri[m]];
        i = m;
      }
    }
    return top;
  }
}
