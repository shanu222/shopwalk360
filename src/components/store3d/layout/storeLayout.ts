/**
 * ShopWalk 360 floor plan — pure geometry, no Three.js.
 *
 * Shared by the 3D builder, pathfinding, the minimap and the admin floor-plan editor so all of them agree.
 *
 *  z+  (south)                PLAZA  (outside, z 34 → 50)
 *          ┌──────────── glass façade + automatic doors (z = 34) ────────────┐
 *          │                      RECEPTION LOBBY (z 12 → 34)                │
 *          ├──────────┬──────────────────────────────────────┬──────────────┤ z = 12
 *          │ 01 West  │                                      │ 02 East      │
 *          │ 03       │          GALLERIA PROMENADE          │ 04           │
 *          │ 05       │           (x −8 → 8)                 │ 06           │
 *          │ 07       │                                      │ 08           │
 *          │ 09       │                                      │ 10           │
 *          │ 11       │                                      │ 12           │
 *          └──────────┴──────────────────────────────────────┴──────────────┘ z = −50
 *  Odd department numbers are on the LEFT (west), even numbers on the RIGHT (east) — like street numbers.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const STORE = {
  plaza: { minX: -22, maxX: 22, minZ: 34, maxZ: 52 } as Rect,
  lobby: { minX: -24, maxX: 24, minZ: 12, maxZ: 34 } as Rect,
  promenade: { minX: -8, maxX: 8, minZ: -50, maxZ: 12 } as Rect,
  facadeZ: 34,
  doorHalfWidth: 2.1,
  lobbyHeight: 10,
  promenadeHeight: 7.5,
  roomHeight: 4.4,
  roomFrontage: 10,
  roomDepth: 16,
  roomsPerSide: 6,
  bounds: { minX: -25, maxX: 25, minZ: -51, maxZ: 52 } as Rect,
  spawnOutside: { x: 0, z: 45 },
  spawnInside: { x: 0, z: 29.5 },
  lobbyCenter: { x: 0, z: 24 },
  reception: { x: 0, z: 21.2 },
  checkout: { x: 15.2, z: 22 },
  basketStation: { x: -15, z: 29 },
  mapKiosk: { x: -5.5, z: 26.5 },
};

export type SlotCode =
  | 'WIN1' | 'WIN2' | 'F1' | 'F2' | 'F3' | 'F4' | 'L1' | 'L2' | 'R1' | 'R2' | 'BW1' | 'BW2' | 'BW3' | 'D1';

export interface SlotDef {
  code: SlotCode;
  label: string;
  /** u = metres inward from the shop front, v = metres along the frontage (world z offset from room centre) */
  u: number;
  v: number;
  /** facing direction in local (u, v) space */
  fu: number;
  fv: number;
  kind: 'window' | 'floor' | 'wall' | 'demo';
  /** fixture types that physically fit this position */
  fits: string[];
}

const FLOOR_FITS = ['gondola', 'double_tier', 'island_display', 'glass_cabinet', 'clothing_rack', 'vanity', 'room_set', 'mannequin', 'endcap_promo'];
const WALL_FITS = ['wall_mount', 'shoe_wall', 'glass_cabinet'];
const WINDOW_FITS = ['island_display', 'mannequin', 'room_set', 'glass_cabinet'];
const DEMO_FITS = ['demo_table', 'demo_kitchen', 'fitting_station', 'room_set', 'island_display'];

export const SLOTS: SlotDef[] = [
  { code: 'WIN1', label: 'Window display (left)', u: 1.15, v: -3.2, fu: -1, fv: 0, kind: 'window', fits: WINDOW_FITS },
  { code: 'WIN2', label: 'Window display (right)', u: 1.15, v: 3.2, fu: -1, fv: 0, kind: 'window', fits: WINDOW_FITS },
  { code: 'F1', label: 'Floor bay F1', u: 6.2, v: -2.35, fu: 0, fv: 1, kind: 'floor', fits: FLOOR_FITS },
  { code: 'F2', label: 'Floor bay F2', u: 6.2, v: 2.35, fu: 0, fv: -1, kind: 'floor', fits: FLOOR_FITS },
  { code: 'F3', label: 'Floor bay F3', u: 10.4, v: -2.35, fu: 0, fv: 1, kind: 'floor', fits: FLOOR_FITS },
  { code: 'F4', label: 'Floor bay F4', u: 10.4, v: 2.35, fu: 0, fv: -1, kind: 'floor', fits: FLOOR_FITS },
  { code: 'L1', label: 'Side wall L1', u: 6.4, v: -4.62, fu: 0, fv: 1, kind: 'wall', fits: WALL_FITS },
  { code: 'L2', label: 'Side wall L2', u: 10.6, v: -4.62, fu: 0, fv: 1, kind: 'wall', fits: WALL_FITS },
  { code: 'R1', label: 'Side wall R1', u: 6.4, v: 4.62, fu: 0, fv: -1, kind: 'wall', fits: WALL_FITS },
  { code: 'R2', label: 'Side wall R2', u: 10.6, v: 4.62, fu: 0, fv: -1, kind: 'wall', fits: WALL_FITS },
  { code: 'BW1', label: 'Back wall BW1', u: 15.62, v: -3.3, fu: -1, fv: 0, kind: 'wall', fits: WALL_FITS },
  { code: 'BW2', label: 'Back wall BW2', u: 15.62, v: 0, fu: -1, fv: 0, kind: 'wall', fits: WALL_FITS },
  { code: 'BW3', label: 'Back wall BW3', u: 15.62, v: 3.3, fu: -1, fv: 0, kind: 'wall', fits: WALL_FITS },
  { code: 'D1', label: 'Demonstration zone', u: 13.3, v: 0, fu: -1, fv: 0, kind: 'demo', fits: DEMO_FITS },
];

export const SLOT_BY_CODE: Record<string, SlotDef> = Object.fromEntries(SLOTS.map((s) => [s.code, s]));

/** Legacy fixture codes from the v1 layout map onto the closest v2 slot */
export function normaliseSlot(code?: string | null): SlotDef | null {
  if (!code) return null;
  return SLOT_BY_CODE[code.toUpperCase()] || null;
}

export interface RoomGeometry {
  slot: number;
  side: 'west' | 'east';
  rect: Rect;
  facadeX: number;
  /** +1 if the room extends towards +x from its façade, −1 towards −x */
  inward: 1 | -1;
  centerZ: number;
  door: { x: number; z: number; halfWidth: number };
  /** point just outside the doorway on the promenade */
  approach: { x: number; z: number };
  /** point just inside the room */
  inside: { x: number; z: number };
  /** world yaw that faces from the promenade into the room */
  yawInto: number;
}

export function roomForSlot(slot: number): RoomGeometry {
  const s = Math.max(0, Math.min(11, Math.floor(slot)));
  const west = s < STORE.roomsPerSide;
  const i = west ? s : s - STORE.roomsPerSide;
  const southZ = STORE.lobby.minZ - i * STORE.roomFrontage;
  const northZ = southZ - STORE.roomFrontage;
  const centerZ = (southZ + northZ) / 2;
  const facadeX = west ? STORE.promenade.minX : STORE.promenade.maxX;
  const inward: 1 | -1 = west ? -1 : 1;
  const farX = facadeX + inward * STORE.roomDepth;
  return {
    slot: s,
    side: west ? 'west' : 'east',
    rect: { minX: Math.min(facadeX, farX), maxX: Math.max(facadeX, farX), minZ: northZ, maxZ: southZ },
    facadeX,
    inward,
    centerZ,
    door: { x: facadeX, z: centerZ, halfWidth: 1.7 },
    approach: { x: facadeX - inward * 1.8, z: centerZ },
    inside: { x: facadeX + inward * 2.6, z: centerZ },
    // yaw such that the object's local +z points along (inward, 0)
    yawInto: Math.atan2(inward, 0),
  };
}

/** Convert department-local (u, v) to world (x, z) */
export function localToWorld(room: RoomGeometry, u: number, v: number) {
  return { x: room.facadeX + room.inward * u, z: room.centerZ + v };
}

/** World yaw (rotation.y) so that an object's local +z faces local direction (fu, fv) */
export function localFacingToYaw(room: RoomGeometry, fu: number, fv: number) {
  const dx = room.inward * fu;
  const dz = fv;
  return Math.atan2(dx, dz);
}

export interface PlacedFixture {
  slot: SlotDef;
  x: number;
  z: number;
  yaw: number;
  /** spot where a shopper stands to look at this fixture */
  standX: number;
  standZ: number;
}

export function placeFixture(room: RoomGeometry, slotCode?: string | null): PlacedFixture | null {
  const slot = normaliseSlot(slotCode);
  if (!slot) return null;
  const p = localToWorld(room, slot.u, slot.v);
  const yaw = localFacingToYaw(room, slot.fu, slot.fv);
  // stand 1.45 m in front of the fixture face (window displays are viewed from inside the room as well)
  let standDist = slot.kind === 'demo' ? 1.9 : slot.kind === 'wall' ? 1.3 : 1.45;
  let fu = slot.fu;
  let fv = slot.fv;
  if (slot.kind === 'window') {
    // shopper looks at window displays from inside the shop
    fu = 1;
    fv = 0;
    standDist = 1.5;
  }
  const s = localToWorld(room, slot.u + fu * standDist, slot.v + fv * standDist);
  return { slot, x: p.x, z: p.z, yaw, standX: s.x, standZ: s.z };
}

export function pointInRect(x: number, z: number, r: Rect, pad = 0) {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}

export type Zone =
  | { kind: 'outside' }
  | { kind: 'lobby' }
  | { kind: 'promenade' }
  | { kind: 'department'; slot: number };

export function zoneAt(x: number, z: number): Zone {
  if (z > STORE.facadeZ) return { kind: 'outside' };
  if (pointInRect(x, z, STORE.lobby)) return { kind: 'lobby' };
  if (pointInRect(x, z, STORE.promenade)) return { kind: 'promenade' };
  for (let s = 0; s < 12; s++) {
    if (pointInRect(x, z, roomForSlot(s).rect)) return { kind: 'department', slot: s };
  }
  return { kind: 'promenade' };
}

export function formatDeptNumber(n?: number) {
  return String(n ?? 0).padStart(2, '0');
}

export const INTERIOR_LABELS: Record<string, string> = {
  tech: 'Graphite tech studio',
  warm_wood: 'Warm oak living room',
  kitchen: 'Stone & sage kitchen',
  boutique: 'Herringbone boutique',
  concrete: 'Polished concrete',
  luxury: 'Dark marble & brass',
  spa: 'Terrazzo spa',
  gym: 'Performance rubber floor',
  garage: 'Automotive showroom',
  travel: 'Terrazzo travel lounge',
  study: 'Quiet study',
  gallery: 'Light gallery',
};
