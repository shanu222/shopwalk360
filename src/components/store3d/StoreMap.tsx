import React from 'react';
import { StoreDepartment, StoreShelf } from '../../types';
import { STORE, roomForSlot, placeFixture, formatDeptNumber, SLOTS } from './layout/storeLayout';

interface Props {
  departments: StoreDepartment[];
  shelves?: StoreShelf[];
  player?: { x: number; z: number; yaw: number } | null;
  route?: { x: number; z: number }[] | null;
  highlightShelfId?: string | null;
  highlightSlot?: number | null;
  showLabels?: boolean;
  showFixtures?: boolean;
  includePlaza?: boolean;
  onPickDept?: (slot: number) => void;
  onPickPoint?: (x: number, z: number) => void;
  onPickShelf?: (shelf: StoreShelf) => void;
  className?: string;
  title?: string;
}

/** Top-down floor plan. North (−z) is at the top; the entrance is at the bottom. */
export const StoreMap: React.FC<Props> = ({
  departments, shelves = [], player, route, highlightShelfId, highlightSlot, showLabels = true, showFixtures = false, includePlaza = false,
  onPickDept, onPickPoint, onPickShelf, className, title = 'Store map',
}) => {
  const minZ = -51;
  const maxZ = includePlaza ? 50 : 36;
  const bySlot: Record<number, StoreDepartment> = {};
  departments.forEach((d) => {
    if (d.slot_index !== undefined && d.slot_index !== null) bySlot[d.slot_index] = d;
  });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPickPoint) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    onPickPoint(p.x, p.y);
  };

  return (
    <svg
      viewBox={`-25.5 ${minZ - 0.5} 51 ${maxZ - minZ + 1}`}
      className={className}
      role="img"
      aria-label={title}
      onClick={handleClick}
      style={{ cursor: onPickPoint ? 'crosshair' : 'default' }}
    >
      <title>{title}</title>
      {includePlaza && <rect x={-22} y={34} width={44} height={16} fill="#3a3732" rx={0.6} />}
      {/* lobby & promenade */}
      <rect x={STORE.lobby.minX} y={STORE.lobby.minZ} width={48} height={22} fill="#2b2925" stroke="#5b564e" strokeWidth={0.15} />
      <rect x={STORE.promenade.minX} y={STORE.promenade.minZ} width={16} height={62} fill="#2b2925" stroke="#5b564e" strokeWidth={0.15} />
      {/* entrance */}
      <rect x={-2.1} y={33.6} width={4.2} height={0.8} fill="#c8a96a" />
      {showLabels && (
        <>
          <text x={0} y={31.8} textAnchor="middle" fontSize={1.5} fill="#c8a96a" fontWeight={700}>ENTRANCE</text>
          <text x={0} y={26} textAnchor="middle" fontSize={1.5} fill="#e8e3d9" fontWeight={600}>Reception</text>
          <text x={15.5} y={27.4} textAnchor="middle" fontSize={1.3} fill="#e8e3d9">Checkout</text>
          <text x={-15} y={31.4} textAnchor="middle" fontSize={1.2} fill="#e8e3d9">Baskets</text>
        </>
      )}
      <circle cx={STORE.reception.x} cy={STORE.reception.z - 2} r={1.2} fill="#4a453d" />
      <rect x={15.8} y={17.4} width={1.2} height={9.2} fill="#4a453d" />
      {/* rooms */}
      {Array.from({ length: 12 }, (_, slot) => {
        const r = roomForSlot(slot);
        const d = bySlot[slot];
        const active = highlightSlot === slot;
        return (
          <g key={slot} onClick={(e) => { if (onPickDept && d) { e.stopPropagation(); onPickDept(slot); } }} style={{ cursor: onPickDept && d ? 'pointer' : undefined }}>
            <rect
              x={r.rect.minX} y={r.rect.minZ} width={r.rect.maxX - r.rect.minX} height={r.rect.maxZ - r.rect.minZ}
              fill={d ? d.theme_color : '#3a3833'} fillOpacity={active ? 0.75 : d ? 0.32 : 0.4}
              stroke={active ? '#f3dfb4' : '#6b655b'} strokeWidth={active ? 0.35 : 0.15}
            />
            {/* door */}
            <rect x={r.facadeX - 0.25} y={r.door.z - r.door.halfWidth} width={0.5} height={r.door.halfWidth * 2} fill="#e8e3d9" />
            {showLabels && d && (
              <>
                <text x={(r.rect.minX + r.rect.maxX) / 2} y={r.centerZ - 0.6} textAnchor="middle" fontSize={2.2} fontWeight={800} fill="#f6f1e7">{formatDeptNumber(d.aisle_number)}</text>
                <text x={(r.rect.minX + r.rect.maxX) / 2} y={r.centerZ + 1.9} textAnchor="middle" fontSize={1.05} fill="#e8e3d9">{d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name}</text>
              </>
            )}
            {showFixtures && d && SLOTS.map((s) => {
              const p = placeFixture(r, s.code);
              if (!p) return null;
              const shelf = shelves.find((x) => x.department_id === d.id && x.slot_code === s.code);
              return (
                <rect
                  key={s.code}
                  x={p.x - 0.55} y={p.z - 0.55} width={1.1} height={1.1} rx={0.2}
                  fill={shelf ? (shelf.id === highlightShelfId ? '#f3dfb4' : '#c8a96a') : 'transparent'}
                  stroke="#c8a96a" strokeWidth={0.12} strokeDasharray={shelf ? undefined : '0.3 0.3'}
                  onClick={(e) => { if (shelf && onPickShelf) { e.stopPropagation(); onPickShelf(shelf); } }}
                />
              );
            })}
          </g>
        );
      })}
      {/* highlighted fixture */}
      {highlightShelfId && !showFixtures && (() => {
        const s = shelves.find((x) => x.id === highlightShelfId);
        const d = s && departments.find((x) => x.id === s.department_id);
        if (!s || !d || d.slot_index === undefined || d.slot_index === null) return null;
        const p = placeFixture(roomForSlot(d.slot_index), s.slot_code);
        if (!p) return null;
        return <circle cx={p.x} cy={p.z} r={1.1} fill="none" stroke="#f3dfb4" strokeWidth={0.35}><animate attributeName="r" values="0.8;1.5;0.8" dur="1.6s" repeatCount="indefinite" /></circle>;
      })()}
      {/* route */}
      {route && route.length > 1 && (
        <polyline points={route.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#f3dfb4" strokeWidth={0.45} strokeDasharray="1 0.6" strokeLinecap="round" />
      )}
      {/* player */}
      {player && (
        <g transform={`translate(${player.x} ${player.z}) rotate(${(-player.yaw * 180) / Math.PI + 180})`}>
          <circle r={1.3} fill="#22c55e" fillOpacity={0.25} />
          <path d="M0,-1.3 L0.9,0.9 L0,0.4 L-0.9,0.9 Z" fill="#4ade80" stroke="#0b0b0b" strokeWidth={0.15} />
        </g>
      )}
    </svg>
  );
};
