/**
 * Product spots on each kind of display.
 *
 * A display (fixture) has numbered spots — shelf levels, cabinet positions, rail halves. The admin
 * puts one product on each spot and chooses how many units of it are shown there. A spot with no
 * product stays empty: nothing is shown in the store until the admin adds it.
 *
 * Must match SPOT_RULES in server/store3dV2.ts.
 */
export interface SpotDef {
  label: string;
  /** most units that physically fit on the spot */
  maxUnits: number;
}

const tiers = (n: number, prefix: string, max: number): SpotDef[] =>
  Array.from({ length: n }, (_, i) => ({ label: `${prefix} ${i + 1}${i === 0 ? ' (bottom)' : i === n - 1 ? ' (top)' : ''}`, maxUnits: max }));

export const FIXTURE_SPOTS: Record<string, SpotDef[]> = {
  gondola: [...tiers(3, 'Front shelf', 10), ...tiers(3, 'Back shelf', 10)],
  double_tier: [...tiers(3, 'Front shelf', 10), ...tiers(3, 'Back shelf', 10)],
  wall_mount: tiers(4, 'Shelf', 9),
  shoe_wall: tiers(5, 'Row', 5),
  glass_cabinet: [
    { label: 'Left', maxUnits: 1 },
    { label: 'Centre', maxUnits: 1 },
    { label: 'Right', maxUnits: 1 },
  ],
  island_display: [
    { label: 'Top tier (feature)', maxUnits: 1 },
    { label: 'Lower ring, left', maxUnits: 3 },
    { label: 'Lower ring, right', maxUnits: 3 },
  ],
  endcap_promo: [
    { label: 'Top tier (feature)', maxUnits: 1 },
    { label: 'Lower ring, left', maxUnits: 3 },
    { label: 'Lower ring, right', maxUnits: 3 },
  ],
  demo_table: [
    { label: 'Table, left', maxUnits: 3 },
    { label: 'Table, right', maxUnits: 3 },
  ],
  demo_kitchen: [
    { label: 'Counter, left', maxUnits: 3 },
    { label: 'Counter, right', maxUnits: 3 },
  ],
  vanity: [
    { label: 'Counter, left', maxUnits: 5 },
    { label: 'Counter, right', maxUnits: 5 },
  ],
  clothing_rack: [
    { label: 'Rail, left half', maxUnits: 5 },
    { label: 'Rail, right half', maxUnits: 5 },
  ],
  room_set: [{ label: 'Room set', maxUnits: 1 }],
  mannequin: [{ label: 'Mannequin', maxUnits: 1 }],
  fitting_station: [{ label: 'Display pod', maxUnits: 1 }],
};

export function spotsFor(type?: string | null): SpotDef[] {
  return FIXTURE_SPOTS[type || 'gondola'] || FIXTURE_SPOTS.gondola;
}

/** Units to show for a spot: what the admin asked for, within what fits. */
export function unitsFor(type: string | null | undefined, tier: number, facings?: number | null) {
  const def = spotsFor(type)[tier - 1];
  const max = def ? def.maxUnits : 1;
  return Math.max(1, Math.min(max, Math.round(Number(facings) || Math.min(4, max))));
}
