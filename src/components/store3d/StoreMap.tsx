import React, { useState } from 'react';
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
  /** draw with the entrance on the left (wide panels) */
  landscape?: boolean;
  onPickDept?: (slot: number) => void;
  onPickPoint?: (x: number, z: number) => void;
  onPickShelf?: (shelf: StoreShelf) => void;
  onHoverDept?: (slot: number | null) => void;
  className?: string;
  title?: string;
}

/** Wrap a department name onto at most `max` lines of ~`width` characters */
function wrap(name: string, width: number, max: number): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = kept[max - 1].slice(0, width - 1) + '…';
    return kept;
  }
  return lines;
}

/** Top-down floor plan. Portrait: entrance at the bottom. Landscape: entrance on the left. */
export const StoreMap: React.FC<Props> = ({
  departments, shelves = [], player, route, highlightShelfId, highlightSlot, showLabels = true, showFixtures = false, includePlaza = false,
  landscape = false, onPickDept, onPickPoint, onPickShelf, onHoverDept, className, title = 'Store map',
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const minZ = -51.5;
  const maxZ = includePlaza ? 50 : 39;
  const bySlot: Record<number, StoreDepartment> = {};
  departments.forEach((d) => {
    if (d.slot_index !== undefined && d.slot_index !== null) bySlot[d.slot_index] = d;
  });
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  shelves.forEach((s) => {
    const key = `${s.department_id}:${s.product_id}`;
    if (!s.product_id || seen.has(key)) return;
    seen.add(key);
    counts[s.department_id] = (counts[s.department_id] || 0) + 1;
  });

  /** world (x, z) → screen */
  const P = (x: number, z: number): [number, number] => (landscape ? [-z, x] : [x, z]);
  const viewBox = landscape ? `${-maxZ} -26 ${maxZ - minZ} 52` : `-26 ${minZ} 52 ${maxZ - minZ}`;
  const geoTransform = landscape ? 'rotate(90)' : undefined;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPickPoint) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    if (landscape) onPickPoint(p.y, -p.x);
    else onPickPoint(p.x, p.y);
  };
  const setH = (s: number | null) => {
    setHover(s);
    onHoverDept?.(s);
  };

  const L = STORE.lobby;
  const PR = STORE.promenade;
  // label sizes: landscape rooms are 10 wide × 16 tall on screen, portrait 16 × 10
  const nameSize = landscape ? 1.45 : 1.6;
  const wrapWidth = landscape ? 11 : 14;
  const maxLines = landscape ? 3 : 2;

  const label = (x: number, z: number, text: string, opts: { size: number; fill: string; weight?: number; spacing?: number; dy?: number }) => {
    const [X, Y] = P(x, z);
    return (
      <text x={X} y={Y + (opts.dy || 0)} textAnchor="middle" fontSize={opts.size} fill={opts.fill} fontWeight={opts.weight ?? 700} letterSpacing={opts.spacing}>
        {text}
      </text>
    );
  };

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label={title}
      onClick={handleClick}
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: onPickPoint ? 'crosshair' : 'default', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <title>{title}</title>
      <defs>
        <pattern id="sw-floor" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#24211d" />
          <path d="M2 0H0V2" fill="none" stroke="#2f2b26" strokeWidth="0.06" />
        </pattern>
        <radialGradient id="sw-atrium">
          <stop offset="0%" stopColor="#f3dfb4" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#c8a96a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#c8a96a" stopOpacity="0" />
        </radialGradient>
        <filter id="sw-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.2" stdDeviation="0.3" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* ---------------- geometry (world coordinates) ---------------- */}
      <g transform={geoTransform}>
        {includePlaza && <rect x={-22} y={34} width={44} height={16} fill="#33302b" rx={0.8} />}
        <rect x={L.minX} y={L.minZ} width={L.maxX - L.minX} height={L.maxZ - L.minZ} rx={0.8} fill="url(#sw-floor)" stroke="#5b564e" strokeWidth={0.18} />
        <rect x={PR.minX} y={PR.minZ} width={PR.maxX - PR.minX} height={PR.maxZ - PR.minZ + 0.3} fill="url(#sw-floor)" stroke="#5b564e" strokeWidth={0.18} />
        <line x1={0} y1={PR.minZ + 2} x2={0} y2={PR.maxZ - 1} stroke="#c8a96a" strokeOpacity={0.25} strokeWidth={0.12} strokeDasharray="1 1" />

        {/* lobby features */}
        <circle cx={0} cy={27.5} r={4.2} fill="url(#sw-atrium)" />
        <circle cx={0} cy={27.5} r={2} fill="none" stroke="#e9cf92" strokeWidth={0.18} />
        <circle cx={0} cy={27.5} r={0.7} fill="#e9cf92" />
        <rect x={STORE.reception.x - 3} y={STORE.reception.z - 2.6} width={6} height={1.3} rx={0.65} fill="#4a453d" stroke="#6b655b" strokeWidth={0.1} />
        <rect x={15.8} y={17.4} width={1.4} height={9.2} rx={0.3} fill="#4a453d" stroke="#6b655b" strokeWidth={0.1} />
        <rect x={-16.2} y={28.2} width={2.4} height={1.6} rx={0.3} fill="#8e1b2b" />
        <rect x={-STORE.doorHalfWidth} y={33.5} width={STORE.doorHalfWidth * 2} height={1} rx={0.3} fill="#c8a96a" />
        <path d="M0 34.7 L1.1 36 H0.45 V36.9 H-0.45 V36 H-1.1 Z" fill="#c8a96a" />

        {/* departments */}
        {Array.from({ length: 12 }, (_, slot) => {
          const r = roomForSlot(slot);
          const d = bySlot[slot];
          const active = highlightSlot === slot || hover === slot;
          const clickable = !!(onPickDept && d);
          return (
            <g
              key={slot}
              onClick={(e) => { if (clickable) { e.stopPropagation(); onPickDept!(slot); } }}
              onPointerEnter={() => d && setH(slot)}
              onPointerLeave={() => setH(null)}
              style={{ cursor: clickable ? 'pointer' : undefined }}
              role={clickable ? 'button' : undefined}
              aria-label={d ? `${formatDeptNumber(d.aisle_number)} ${d.name}` : undefined}
            >
              <rect
                x={r.rect.minX + 0.15} y={r.rect.minZ + 0.15} width={r.rect.maxX - r.rect.minX - 0.3} height={r.rect.maxZ - r.rect.minZ - 0.3} rx={0.7}
                fill={d ? d.theme_color : '#34312c'} fillOpacity={d ? (active ? 0.95 : 0.62) : 0.5}
                stroke={active ? '#f6e3b8' : d ? d.theme_color : '#4a463f'} strokeWidth={active ? 0.4 : 0.2}
                style={{ transition: 'fill-opacity .2s' }}
              />
              <rect x={r.facadeX - 0.3} y={r.door.z - r.door.halfWidth} width={0.6} height={r.door.halfWidth * 2} rx={0.2} fill="#f6f1e7" />
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
          return (
            <g pointerEvents="none">
              <circle cx={p.x} cy={p.z} r={1.1} fill="none" stroke="#f3dfb4" strokeWidth={0.35}><animate attributeName="r" values="0.8;1.6;0.8" dur="1.6s" repeatCount="indefinite" /></circle>
              <circle cx={p.x} cy={p.z} r={0.5} fill="#f3dfb4" />
            </g>
          );
        })()}

        {/* route */}
        {route && route.length > 1 && (
          <g pointerEvents="none">
            <polyline points={route.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={route.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#f3dfb4" strokeWidth={0.5} strokeDasharray="1 0.7" strokeLinecap="round" strokeLinejoin="round">
              <animate attributeName="stroke-dashoffset" values="3.4;0" dur="1s" repeatCount="indefinite" />
            </polyline>
            <circle cx={route[route.length - 1].x} cy={route[route.length - 1].z} r={0.8} fill="#f3dfb4" stroke="#1a1712" strokeWidth={0.2} />
          </g>
        )}

        {/* you are here (marker) */}
        {player && (
          <g pointerEvents="none" transform={`translate(${player.x} ${player.z})`}>
            <circle r={1.4} fill="#22c55e" fillOpacity={0.3}>
              <animate attributeName="r" values="1.2;2.4;1.2" dur="2s" repeatCount="indefinite" />
              <animate attributeName="fill-opacity" values="0.35;0;0.35" dur="2s" repeatCount="indefinite" />
            </circle>
            <g transform={`rotate(${(-player.yaw * 180) / Math.PI + 180})`}>
              <circle r={1.05} fill="#16a34a" stroke="#fff" strokeWidth={0.22} />
              <path d="M0,-0.75 L0.5,0.45 L0,0.2 L-0.5,0.45 Z" fill="#fff" />
            </g>
          </g>
        )}
      </g>

      {/* ---------------- labels (screen coordinates, always upright) ---------------- */}
      {showLabels && (
        <g pointerEvents="none" filter="url(#sw-shadow)">
          {includePlaza && label(0, 44, 'PLAZA', { size: 1.6, fill: '#a8a196', weight: 600, spacing: 0.2 })}
          {(() => {
            const [X, Y] = P(0, -20);
            return landscape ? (
              <text x={X} y={Y + 0.5} textAnchor="middle" fontSize={1.3} fill="#8f877a" fontWeight={700} letterSpacing={0.35}>MAIN PROMENADE</text>
            ) : (
              <text x={X} y={Y} textAnchor="middle" fontSize={1.25} fill="#8f877a" fontWeight={700} letterSpacing={0.35} transform={`rotate(-90 ${X} ${Y})`}>MAIN PROMENADE</text>
            );
          })()}
          {landscape ? (
            <>
              {(() => {
                const [X, Y] = P(0, 38.1);
                return <text x={X} y={Y} textAnchor="middle" fontSize={1.5} fill="#e9cf92" fontWeight={800} letterSpacing={0.2} transform={`rotate(-90 ${X} ${Y})`}>ENTRANCE</text>;
              })()}
            </>
          ) : (
            label(0, 38.6, 'ENTRANCE', { size: 1.7, fill: '#e9cf92', spacing: 0.25 })
          )}
          {label(landscape ? -4.6 : 0, landscape ? STORE.reception.z - 1.9 : STORE.reception.z - 4, 'Reception', { size: 1.6, fill: '#f6f1e7' })}
          {label(landscape ? 3.6 : -6.2, landscape ? 27.5 : 28, 'Atrium', { size: 1.4, fill: '#e9cf92' })}
          {label(landscape ? 19.6 : 12.4, 22.6, 'Checkout', { size: 1.6, fill: '#f6f1e7' })}
          {label(-15, landscape ? 32.6 : 27.2, 'Baskets', { size: 1.5, fill: '#f6f1e7' })}
          {label(landscape ? -20 : 0, landscape ? 23 : 14.4, 'LOBBY', { size: 1.3, fill: '#a8a196', spacing: 0.3 })}

          {Array.from({ length: 12 }, (_, slot) => {
            const r = roomForSlot(slot);
            const d = bySlot[slot];
            const [X, Y] = P((r.rect.minX + r.rect.maxX) / 2, r.centerZ);
            if (!d) return <text key={slot} x={X} y={Y + 0.5} textAnchor="middle" fontSize={1.2} fill="#7b756b">Coming soon</text>;
            const lines = wrap(d.name, wrapWidth, maxLines);
            const n = counts[d.id] || 0;
            const lh = nameSize * 1.15;
            const blockTop = Y - ((lines.length - 1) * lh) / 2 + 0.6;
            return (
              <g key={slot}>
                <circle cx={X} cy={blockTop - 2.9} r={1.7} fill="#0e0d0b" fillOpacity={0.55} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.12} />
                <text x={X} y={blockTop - 2.3} textAnchor="middle" fontSize={1.7} fontWeight={800} fill="#fff">{formatDeptNumber(d.aisle_number)}</text>
                {lines.map((ln, i) => (
                  <text key={i} x={X} y={blockTop + i * lh} textAnchor="middle" fontSize={nameSize} fontWeight={700} fill="#fff">{ln}</text>
                ))}
                {shelves.length > 0 && !showFixtures && (
                  <text x={X} y={blockTop + lines.length * lh + 0.4} textAnchor="middle" fontSize={1.15} fill="#fff" fillOpacity={0.8}>
                    {n} product{n === 1 ? '' : 's'}
                  </text>
                )}
              </g>
            );
          })}

          {player && (() => {
            const [X, Y] = P(player.x, player.z);
            return (
              <g transform={`translate(${X} ${Y - 2.3})`}>
                <rect x={-4} y={-1.25} width={8} height={1.9} rx={0.95} fill="#16a34a" stroke="#fff" strokeWidth={0.12} />
                <text y={0.15} textAnchor="middle" fontSize={1.15} fontWeight={800} fill="#fff">You are here</text>
              </g>
            );
          })()}

          {/* compass */}
          {(() => {
            const [X, Y] = landscape ? [-minZ - 2.4, 22.8] : [22.6, minZ + 2.4];
            return (
              <g transform={`translate(${X} ${Y})`}>
                <circle r={1.6} fill="#1a1815" stroke="#5b564e" strokeWidth={0.12} />
                <path d="M0 -1.1 L0.45 0.3 L0 0 L-0.45 0.3 Z" fill="#e9cf92" transform={landscape ? 'rotate(90)' : undefined} />
                <text x={landscape ? 2.4 : 0} y={landscape ? 0.25 : 2.6} textAnchor="middle" fontSize={0.7} fontWeight={800} fill="#a8a196">N</text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
};
