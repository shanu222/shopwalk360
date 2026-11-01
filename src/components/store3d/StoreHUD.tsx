import React, { useMemo, useState, useEffect } from 'react';
import {
  ShoppingBag, Search, Map as MapIcon, Navigation, Camera, User, LayoutGrid, Zap, Settings, HelpCircle, X, ArrowRight, Footprints, Route,
  Volume2, VolumeX, Store, Shirt, MapPin, ChevronRight, Eye, Users, EyeOff,
} from 'lucide-react';
import { StoreDepartment, StoreShelf, TryOnOverride } from '../../types';
import { InteractiveTarget } from './builder/storeBuilder';
import { StoreMap } from './StoreMap';
import { Joystick } from './Joystick';
import { Zone, formatDeptNumber } from './layout/storeLayout';
import type { Quality, CameraMode } from './engine/StoreEngine';

export interface SearchHit {
  shelf: StoreShelf;
  dept?: StoreDepartment;
}

interface Props {
  initialPanel?: 'map' | 'directory' | null;
  departments: StoreDepartment[];
  shelves: StoreShelf[];
  cartCount: number;
  cartSubtotal: number;
  cameraMode: CameraMode;
  quality: Quality;
  zone: Zone | null;
  nearest: InteractiveTarget | null;
  player: { x: number; z: number; yaw: number } | null;
  others: { id: string; x: number; z: number }[];
  othersCount: number;
  showOthers: boolean;
  onToggleOthers: () => void;
  route: { x: number; z: number }[] | null;
  highlightShelfId: string | null;
  tryOns: TryOnOverride[];
  muted: boolean;
  isTouch: boolean;
  walking: boolean;
  onToggleCamera: () => void;
  onOpenAvatar: () => void;
  onLobby: () => void;
  onExplore: (t: InteractiveTarget) => void;
  onExploreShelf: (s: StoreShelf) => void;
  onGuide: (s: StoreShelf, mode: 'walk' | 'route' | 'jump') => void;
  onDept: (slot: number, mode: 'walk' | 'jump') => void;
  onMapPoint: (x: number, z: number) => void;
  onOpenCart: () => void;
  onCheckout: () => void;
  onQuality: (q: Quality) => void;
  onMute: () => void;
  onSwitch2D: () => void;
  onJoystick: (x: number, y: number) => void;
  onRemoveTryOn: (slot: TryOnOverride['slot']) => void;
  onAddTryOnToBasket: (t: TryOnOverride) => void;
  onSkipWalk: () => void;
  onStopWalk: () => void;
  onClearRoute: () => void;
}

const glassBtn = 'pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/15 bg-[#1a1816]/80 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-[#2a2723]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]';

function zoneLabel(zone: Zone | null, departments: StoreDepartment[]) {
  if (!zone) return '';
  if (zone.kind === 'outside') return 'Outside the entrance';
  if (zone.kind === 'lobby') return 'Reception lobby';
  if (zone.kind === 'promenade') return 'Galleria · odd numbers left, even right';
  const d = departments.find((x) => x.slot_index === zone.slot);
  return d ? `${formatDeptNumber(d.aisle_number)} · ${d.name}` : 'Vacant unit';
}

export const StoreHUD: React.FC<Props> = (p) => {
  const [panel, setPanel] = useState<null | 'directory' | 'map' | 'quick' | 'settings' | 'help' | 'search'>(p.initialPanel ?? null);
  const [query, setQuery] = useState('');
  const [mapHover, setMapHover] = useState<number | null>(null);
  const [mapQuery, setMapQuery] = useState('');
  const [wideMap, setWideMap] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    const on = () => setWideMap(window.innerWidth >= 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const [quickDept, setQuickDept] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const deptById = useMemo(() => Object.fromEntries(p.departments.map((d) => [d.id, d])), [p.departments]);

  // one entry per product (nearest fixture to the shopper)
  const productShelves = useMemo(() => {
    const map = new Map<string, StoreShelf>();
    p.shelves.forEach((s) => {
      if (!s.product_id || !s.product_name) return;
      const prev = map.get(s.product_id);
      if (!prev || (prev.zone === 'demo' && s.zone !== 'demo')) map.set(s.product_id, s);
    });
    return [...map.values()];
  }, [p.shelves]);

  const results: SearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return productShelves
      .filter((s) => [s.product_name, s.product_brand, s.product_sku, s.department_name, s.short_description].some((f) => f?.toLowerCase().includes(q)))
      .slice(0, 8)
      .map((s) => ({ shelf: s, dept: deptById[s.department_id] }));
  }, [query, productShelves, deptById]);

  const deptResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return p.departments.filter((d) => d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)).slice(0, 4);
  }, [query, p.departments]);

  useEffect(() => {
    if (p.nearest) setAnnounce(`Nearby: ${p.nearest.title}. ${p.nearest.kind === 'product' ? 'Choose Explore Product to view details.' : ''}`);
  }, [p.nearest?.id]);
  useEffect(() => {
    if (p.zone) setAnnounce(`You are in ${zoneLabel(p.zone, p.departments)}`);
  }, [p.zone && (p.zone.kind === 'department' ? p.zone.slot : p.zone.kind)]);

  const sortedDepts = [...p.departments].sort((a, b) => a.aisle_number - b.aisle_number);
  const quickList = productShelves.filter((s) => !quickDept || s.department_id === quickDept);
  const nearestShelf = p.nearest?.shelf;
  const price = nearestShelf ? nearestShelf.discount_price || nearestShelf.regular_price : undefined;

  const SearchBox = (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products or departments…"
        aria-label="Search products or departments"
        className="w-full rounded-2xl border border-white/15 bg-[#1a1816]/85 py-2.5 pl-10 pr-9 text-sm text-white placeholder-white/45 shadow-lg backdrop-blur-md focus:border-[#c8a96a] focus:outline-none"
      />
      {query && (
        <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/60 hover:text-white"><X className="h-4 w-4" /></button>
      )}
      {(results.length > 0 || deptResults.length > 0) && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1816]/95 p-2 shadow-2xl backdrop-blur-xl">
          {deptResults.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl p-2.5 hover:bg-white/5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{formatDeptNumber(d.aisle_number)} · {d.name}</div>
                <div className="text-[11px] text-white/50">Department · {(d.slot_index ?? 0) < 6 ? 'left side' : 'right side'} of the galleria</div>
              </div>
              <button onClick={() => { p.onDept(d.slot_index ?? 0, 'walk'); setQuery(''); setPanel(null); }} className="shrink-0 rounded-lg bg-[#c8a96a] px-2.5 py-1.5 text-[11px] font-bold text-[#1a1712]">Guide me</button>
            </div>
          ))}
          {results.map(({ shelf, dept }) => (
            <div key={shelf.id} className="rounded-xl p-2.5 hover:bg-white/5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{shelf.product_name}</div>
                  <div className="flex items-center gap-1 text-[11px] text-[#e2c88f]"><MapPin className="h-3 w-3" /> {dept ? `${formatDeptNumber(dept.aisle_number)} ${dept.name}` : ''} · {shelf.aisle_label}</div>
                </div>
                <div className="shrink-0 text-xs font-bold text-white">PKR {Number(shelf.discount_price || shelf.regular_price || 0).toLocaleString()}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => { p.onGuide(shelf, 'walk'); setQuery(''); setPanel(null); }} className="flex items-center gap-1 rounded-lg bg-[#c8a96a] px-2.5 py-1.5 text-[11px] font-bold text-[#1a1712]"><Footprints className="h-3 w-3" /> Guide me</button>
                <button onClick={() => { p.onGuide(shelf, 'route'); setQuery(''); setPanel(null); }} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Route className="h-3 w-3" /> Show route</button>
                <button onClick={() => { p.onExploreShelf(shelf); setQuery(''); setPanel(null); }} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Eye className="h-3 w-3" /> Explore now</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && !results.length && !deptResults.length && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] rounded-2xl border border-white/10 bg-[#1a1816]/95 p-3 text-xs text-white/60">No products or departments match “{query}”.</div>
      )}
    </div>
  );

  const toolButtons: { id: string; label: string; icon: React.ElementType; onClick: () => void; active?: boolean }[] = [
    { id: 'directory', label: 'Departments', icon: LayoutGrid, onClick: () => setPanel(panel === 'directory' ? null : 'directory'), active: panel === 'directory' },
    { id: 'map', label: 'Map', icon: MapIcon, onClick: () => setPanel(panel === 'map' ? null : 'map'), active: panel === 'map' },
    { id: 'lobby', label: 'Lobby', icon: Navigation, onClick: p.onLobby },
    { id: 'quick', label: 'Quick shop', icon: Zap, onClick: () => setPanel(panel === 'quick' ? null : 'quick'), active: panel === 'quick' },
    { id: 'camera', label: p.cameraMode === 'third_person' ? '3rd person' : '1st person', icon: Camera, onClick: p.onToggleCamera },
    { id: 'avatar', label: 'My avatar', icon: User, onClick: p.onOpenAvatar },
    { id: 'settings', label: 'Settings', icon: Settings, onClick: () => setPanel(panel === 'settings' ? null : 'settings'), active: panel === 'settings' },
    { id: 'help', label: 'Help', icon: HelpCircle, onClick: () => setPanel(panel === 'help' ? null : 'help'), active: panel === 'help' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none text-white">
      <div className="sr-only" aria-live="polite">{announce}</div>

      {/* TOP BAR */}
      <div className="absolute left-0 right-0 top-0 flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/15 bg-[#1a1816]/80 px-3 py-2 shadow-lg backdrop-blur-md">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#c8a96a] text-[11px] font-black text-[#1a1712]">360</div>
          <div className="min-w-0">
            <div className="text-xs font-bold leading-tight">ShopWalk 360</div>
            <div className="max-w-[46vw] truncate text-[11px] leading-tight text-[#e2c88f] sm:max-w-[260px]" title={zoneLabel(p.zone, p.departments)}>{zoneLabel(p.zone, p.departments)}</div>
          </div>
        </div>
        <div className="hidden flex-1 md:block md:max-w-md lg:max-w-lg">{SearchBox}</div>
        <div className="ml-auto flex items-center gap-2">
          <button className={`${glassBtn} md:hidden`} aria-label="Search" onClick={() => setPanel(panel === 'search' ? null : 'search')}><Search className="h-4 w-4" /></button>
          {p.othersCount > 0 && (
            <button
              onClick={p.onToggleOthers}
              className={`${glassBtn} gap-1.5 !w-auto px-3 text-xs font-semibold`}
              aria-pressed={p.showOthers}
              title={p.showOthers ? 'Hide other shoppers' : 'Show other shoppers'}
            >
              {p.showOthers ? <Users className="h-4 w-4 text-[#e2c88f]" /> : <EyeOff className="h-4 w-4" />}
              <span className="hidden sm:inline">{p.othersCount} {p.othersCount === 1 ? 'shopper' : 'shoppers'} here</span>
              <span className="sm:hidden">{p.othersCount}</span>
            </button>
          )}
          <button onClick={p.onOpenCart} className="pointer-events-auto relative flex items-center gap-2 rounded-2xl bg-[#c8a96a] px-3.5 py-2.5 text-xs font-bold text-[#1a1712] shadow-lg hover:bg-[#d6b97c]" aria-label={`Basket, ${p.cartCount} items`}>
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Basket</span>
            <span className="rounded-full bg-[#1a1712] px-1.5 py-0.5 text-[10px] font-black text-[#e2c88f]">{p.cartCount}</span>
            {p.cartSubtotal > 0 && <span className="hidden lg:inline">· PKR {p.cartSubtotal.toLocaleString()}</span>}
          </button>
        </div>
      </div>

      {panel === 'search' && <div className="pointer-events-auto absolute left-3 right-3 top-16 z-40 md:hidden">{SearchBox}</div>}

      {/* try-on chips */}
      {p.tryOns.length > 0 && (
        <div className="absolute left-3 top-[64px] flex max-w-[92vw] flex-col gap-1.5 sm:left-4 sm:top-[72px]">
          {p.tryOns.map((t) => (
            <div key={t.slot} className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#c8a96a]/40 bg-[#1a1816]/85 py-1 pl-2 pr-1 text-[11px] shadow-lg backdrop-blur-md">
              <Shirt className="h-3.5 w-3.5 text-[#e2c88f]" />
              <span className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: t.colorHex }} />
              <span className="max-w-[40vw] truncate">Trying on: {t.productName.replace(/\s*\(Sample Listing\)/, '')} · {t.colorName}{t.size ? ` · ${t.size}` : ''}</span>
              <button onClick={() => p.onAddTryOnToBasket(t)} className="rounded-full bg-[#c8a96a] px-2 py-0.5 font-bold text-[#1a1712]">Add</button>
              <button onClick={() => p.onRemoveTryOn(t.slot)} aria-label="Take off" className="rounded-full p-1 text-white/60 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* LEFT TOOLBAR (desktop) */}
      <div className="absolute left-4 top-[76px] hidden flex-col gap-1.5 md:flex" role="toolbar" aria-label="Store navigation">
        {toolButtons.map((b) => (
          <button key={b.id} onClick={b.onClick} title={b.label} aria-label={b.label} className={`${glassBtn} !py-2 ${b.active ? 'border-[#c8a96a]/70 bg-[#2a2723]/95' : ''}`} aria-pressed={b.active}>
            <b.icon className="h-4 w-4 text-[#e2c88f]" /> <span className="hidden lg:inline">{b.label}</span>
          </button>
        ))}
      </div>

      {/* walking status */}
      {(p.walking || p.route) && (
        <div className="absolute left-1/2 top-[70px] flex -translate-x-1/2 items-center gap-2 sm:top-20">
          {p.walking && (
            <>
              <div className="pointer-events-auto rounded-full bg-[#1a1816]/85 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">Walking you there…</div>
              <button onClick={p.onSkipWalk} className="pointer-events-auto rounded-full bg-[#c8a96a] px-3 py-1.5 text-[11px] font-bold text-[#1a1712]">Skip ahead</button>
              <button onClick={p.onStopWalk} className="pointer-events-auto rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">Stop</button>
            </>
          )}
          {!p.walking && p.route && (
            <button onClick={p.onClearRoute} className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#1a1816]/85 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">Follow the gold arrows · <X className="h-3 w-3" /> clear</button>
          )}
        </div>
      )}

      {/* PROXIMITY CARD */}
      {p.nearest && !panel && (
        <div className="absolute bottom-[208px] left-1/2 w-[min(94vw,460px)] -translate-x-1/2 md:bottom-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-white/15 bg-[#1a1816]/90 p-3 shadow-2xl backdrop-blur-xl">
            {nearestShelf?.primary_image ? (
              <img src={nearestShelf.primary_image} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white/10 object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Store className="h-6 w-6 text-[#e2c88f]" /></div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{p.nearest.title.replace(/\s*\(Sample Listing\)/, '')}</div>
              <div className="truncate text-[11px] text-white/60">{p.nearest.subtitle}</div>
              {price ? <div className="text-xs font-bold text-[#e2c88f]">PKR {Number(price).toLocaleString()}</div> : null}
            </div>
            <button onClick={() => p.onExplore(p.nearest!)} className="shrink-0 rounded-2xl bg-[#c8a96a] px-4 py-3 text-xs font-extrabold text-[#1a1712] hover:bg-[#d6b97c]">
              {p.nearest.kind === 'product' ? 'Explore Product' : p.nearest.kind === 'checkout' ? 'Checkout' : p.nearest.kind === 'basket' ? 'View basket' : 'Open'}
              {!p.isTouch && <span className="ml-1.5 rounded bg-black/15 px-1 font-mono text-[10px]">E</span>}
            </button>
          </div>
        </div>
      )}

      {/* MINIMAP */}
      <button onClick={() => setPanel('map')} aria-label="Open the store map" className="pointer-events-auto absolute bottom-[156px] right-3 hidden overflow-hidden rounded-2xl border border-white/15 bg-[#151311]/85 p-1.5 shadow-xl backdrop-blur-md sm:block md:bottom-4 md:right-4">
        <StoreMap departments={p.departments} shelves={p.shelves} player={p.player} route={p.route} highlightShelfId={p.highlightShelfId} showLabels={false} className="h-48 w-[112px]" title="Mini map" />
      </button>

      {/* MOBILE BOTTOM: joystick + tools */}
      <div className="absolute bottom-0 left-0 right-0 md:hidden">
        <div className="flex items-end justify-between px-3 pb-2">
          {p.isTouch ? <Joystick onChange={p.onJoystick} /> : <div />}
          <button onClick={() => setPanel('map')} aria-label="Open the store map" className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-[#151311]/85 p-1 backdrop-blur-md">
            <StoreMap departments={p.departments} shelves={p.shelves} player={p.player} route={p.route} highlightShelfId={p.highlightShelfId} showLabels={false} className="h-32 w-[74px]" title="Mini map" />
          </button>
        </div>
        <div className="pointer-events-auto flex justify-between gap-1 overflow-x-auto border-t border-white/10 bg-[#151311]/90 px-2 py-1.5 backdrop-blur-xl" role="toolbar" aria-label="Store navigation">
          {toolButtons.map((b) => (
            <button key={b.id} onClick={b.onClick} className={`flex min-w-[58px] flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 text-[10px] font-semibold ${b.active ? 'bg-white/10 text-[#e2c88f]' : 'text-white/80'}`}>
              <b.icon className="h-4 w-4" />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {!p.isTouch && !panel && !p.nearest && (
        <div className="absolute bottom-4 left-4 hidden rounded-2xl border border-white/10 bg-[#1a1816]/70 px-3 py-2 text-[11px] text-white/65 backdrop-blur md:block">
          <b className="text-white/85">Click</b> the floor to walk · <b className="text-white/85">Drag</b> to look · <b className="text-white/85">WASD</b> to walk · <b className="text-white/85">E</b> to explore
        </div>
      )}

      {/* PANELS */}
      {panel && panel !== 'search' && (
        <div className={`pointer-events-auto absolute inset-x-3 bottom-[118px] top-[70px] z-40 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#171513]/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:left-[76px] md:top-20 lg:left-[170px] ${panel === 'map' ? 'md:right-6 lg:right-auto lg:w-[min(1100px,calc(100vw-200px))]' : 'md:w-[520px]'}`}>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <div className="text-sm font-bold">
              {panel === 'directory' && 'Department directory'}
              {panel === 'map' && 'Interactive store map'}
              {panel === 'quick' && 'Quick shopping mode'}
              {panel === 'settings' && 'Settings'}
              {panel === 'help' && 'How to get around'}
            </div>
            <button aria-label="Close panel" onClick={() => setPanel(null)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === 'directory' && (
              <div className="space-y-2">
                <p className="pb-1 text-xs text-white/55">Odd numbers are on your left as you walk in from the lobby, even numbers on your right.</p>
                {sortedDepts.map((d) => {
                  const count = productShelves.filter((s) => s.department_id === d.id).length;
                  return (
                    <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black" style={{ backgroundColor: d.theme_color }}>{formatDeptNumber(d.aisle_number)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{d.name}</div>
                        <div className="truncate text-[11px] text-white/50">{(d.slot_index ?? 0) < 6 ? '← Left side' : 'Right side →'} · {count} product{count === 1 ? '' : 's'}</div>
                      </div>
                      <button onClick={() => { p.onDept(d.slot_index ?? 0, 'walk'); setPanel(null); }} className="rounded-xl bg-[#c8a96a] px-3 py-2 text-[11px] font-bold text-[#1a1712]">Walk there</button>
                      <button onClick={() => { p.onDept(d.slot_index ?? 0, 'jump'); setPanel(null); }} className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-semibold" aria-label={`Go to ${d.name} instantly`}>Go now</button>
                    </div>
                  );
                })}
              </div>
            )}
            {panel === 'map' && (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl bg-[#0f0e0c] p-2 sm:p-3">
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <StoreMap
                      departments={p.departments}
                      shelves={p.shelves}
                      player={p.player}
                      others={p.others}
                      route={p.route}
                      highlightShelfId={p.highlightShelfId}
                      highlightSlot={mapHover}
                      onHoverDept={setMapHover}
                      landscape={wideMap}
                      onPickDept={(slot) => { p.onDept(slot, 'walk'); setPanel(null); }}
                      onPickPoint={(x, z) => { p.onMapPoint(x, z); setPanel(null); }}
                      className="h-full max-h-full w-full"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-white/70">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> You are here</span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[#f3dfb4]" /> Your route</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded bg-[#f6f1e7]" /> Doorway</span>
                    {p.others.length > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Other shoppers</span>}
                    <span className="hidden sm:inline">Tap a department or any open floor point to walk there</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <input
                    value={mapQuery}
                    onChange={(e) => setMapQuery(e.target.value)}
                    placeholder="Find a department"
                    aria-label="Find a department"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#c8a96a] focus:outline-none sm:w-52"
                  />
                  <div className="flex max-h-24 flex-1 flex-wrap gap-1.5 overflow-y-auto">
                    {sortedDepts
                      .filter((d) => !mapQuery || d.name.toLowerCase().includes(mapQuery.toLowerCase()))
                      .map((d) => (
                        <button
                          key={d.id}
                          onMouseEnter={() => setMapHover(d.slot_index ?? null)}
                          onMouseLeave={() => setMapHover(null)}
                          onFocus={() => setMapHover(d.slot_index ?? null)}
                          onBlur={() => setMapHover(null)}
                          onClick={() => { p.onDept(d.slot_index ?? 0, 'walk'); setPanel(null); }}
                          className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-semibold text-white transition ${mapHover === d.slot_index ? 'bg-white/20' : 'bg-white/[0.07] hover:bg-white/15'}`}
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black" style={{ backgroundColor: d.theme_color }}>{formatDeptNumber(d.aisle_number)}</span>
                          {d.name}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}
            {panel === 'quick' && (
              <div className="space-y-3">
                <p className="text-xs text-white/55">Skip the walking: browse every product on display and open it directly, or jump straight to its shelf.</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button onClick={() => setQuickDept(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${!quickDept ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-white/10'}`}>All</button>
                  {sortedDepts.map((d) => (
                    <button key={d.id} onClick={() => setQuickDept(d.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${quickDept === d.id ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-white/10'}`}>{formatDeptNumber(d.aisle_number)} {d.name.split(' ')[0]}</button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quickList.map((s) => (
                    <div key={s.id} className="flex gap-3 rounded-2xl bg-white/[0.04] p-2.5">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/10">
                        {s.primary_image && <img src={s.primary_image} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-semibold leading-snug">{s.product_name}</div>
                        <div className="text-[11px] font-bold text-[#e2c88f]">PKR {Number(s.discount_price || s.regular_price || 0).toLocaleString()}</div>
                        <div className="mt-1.5 flex gap-1.5">
                          <button onClick={() => { p.onExploreShelf(s); setPanel(null); }} className="rounded-lg bg-[#c8a96a] px-2 py-1 text-[10px] font-bold text-[#1a1712]">Explore</button>
                          <button onClick={() => { p.onGuide(s, 'jump'); setPanel(null); }} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">Take me there</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {panel === 'settings' && (
              <div className="space-y-5 text-sm">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Graphics quality</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['high', 'balanced', 'low'] as Quality[]).map((q) => (
                      <button key={q} onClick={() => p.onQuality(q)} aria-pressed={p.quality === q} className={`rounded-xl py-2.5 text-xs font-semibold capitalize ${p.quality === q ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-white/10'}`}>{q === 'low' ? 'Low (battery saver)' : q}</button>
                    ))}
                  </div>
                </div>
                <button onClick={p.onToggleOthers} className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-4 py-3">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Show other shoppers</span>
                  <span className="text-xs text-white/60">{p.showOthers ? 'On' : 'Off'}</span>
                </button>
                <button onClick={p.onMute} className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-4 py-3">
                  <span className="flex items-center gap-2">{p.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} Store sounds</span>
                  <span className="text-xs text-white/60">{p.muted ? 'Off' : 'On'}</span>
                </button>
                <button onClick={p.onSwitch2D} className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-4 py-3">
                  <span className="flex items-center gap-2"><Store className="h-4 w-4" /> Switch to the classic online store</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {panel === 'help' && (
              <div className="space-y-4 text-sm text-white/80">
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <div className="mb-2 font-semibold text-white">On a computer</div>
                  <ul className="space-y-1.5 text-xs">
                    <li><b>Click the floor</b> to walk there, or <b>click a display</b> to walk up to it.</li>
                    <li><b>W A S D</b> or <b>arrow keys</b> walk; hold <b>Shift</b> to walk faster.</li>
                    <li><b>Drag</b> to look around; <b>scroll</b> to zoom.</li>
                    <li>Press <b>E</b> next to a display to explore the product.</li>
                  </ul>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <div className="mb-2 font-semibold text-white">On a phone or tablet</div>
                  <ul className="space-y-1.5 text-xs">
                    <li><b>Tap</b> the floor or a display to walk there.</li>
                    <li>Use the <b>joystick</b> to walk; <b>drag</b> elsewhere to look; <b>pinch</b> to zoom.</li>
                  </ul>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-4 text-xs">
                  <div className="mb-2 font-semibold text-white">Finding things</div>
                  Search any product and choose <b>Guide me</b> — gold arrows on the floor lead you to its exact shelf. Use <b>Quick shop</b> to skip walking entirely, and <b>Lobby</b> to return to reception.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

