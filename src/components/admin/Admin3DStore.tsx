import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, Layers, Plus, Trash2, CheckCircle2, AlertCircle, Eye, Save, Upload, Video, Box, Ruler, Shirt, Image as ImageIcon, Megaphone, Map as MapIcon, X, ArrowUp, ArrowDown,
} from 'lucide-react';
import { StoreDepartment, StoreShelf, Product, Category, PromoScreen, LedScreen, ProductVariant, TryOnType } from '../../types';
import { StoreMap } from '../store3d/StoreMap';
import { SLOTS, SLOT_BY_CODE, roomForSlot, formatDeptNumber, INTERIOR_LABELS } from '../store3d/layout/storeLayout';
import { MODEL_PRESETS } from '../store3d/builder/productModels';
import { ProductViewer3D } from '../store3d/product/ProductViewer3D';
import { DemoVideo } from '../store3d/product/DemoVideo';

interface Props {
  products: Product[];
  onPreviewStore?: () => void;
}

type Tab = 'floor' | 'departments' | 'fixtures' | 'products' | 'promos';

const FIXTURE_LABELS: Record<string, string> = {
  gondola: 'Gondola shelving (double-sided)',
  wall_mount: 'Wall-mounted shelving',
  glass_cabinet: 'Glass display cabinet',
  island_display: 'Round promotional podium',
  demo_table: 'Product demonstration table + screen',
  demo_kitchen: 'Kitchen demonstration counter',
  mannequin: 'Mannequin',
  clothing_rack: 'Clothing rail',
  shoe_wall: 'Shoe wall',
  vanity: 'Beauty vanity counter',
  room_set: 'Room set (furniture vignette)',
  fitting_station: 'Virtual try-on / fitting station',
};

const slotName = (i: number) => (i < 6 ? `Left side, unit ${i + 1}` : `Right side, unit ${i - 5}`) + (i % 6 === 0 ? ' (next to lobby)' : '');

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none';
const label = 'mb-1 block text-xs font-semibold text-slate-700';

async function upload(file: File, kind: 'video' | 'image' | 'model' | 'captions') {
  const r = await fetch(`/api/admin/uploads?kind=${kind}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Upload failed');
  return d.url as string;
}

function UploadButton({ kind, accept, onUploaded, text }: { kind: 'video' | 'image' | 'model' | 'captions'; accept: string; onUploaded: (url: string) => void; text: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${busy ? 'opacity-50' : ''}`}>
        <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : text}
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              onUploaded(await upload(f, kind));
            } catch (x: any) {
              setErr(x.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {err && <span className="mt-1 text-[11px] text-rose-600">{err}</span>}
    </span>
  );
}

export const Admin3DStore: React.FC<Props> = ({ products, onPreviewStore }) => {
  const [tab, setTab] = useState<Tab>('floor');
  const [departments, setDepartments] = useState<StoreDepartment[]>([]);
  const [shelves, setShelves] = useState<StoreShelf[]>([]);
  const [promos, setPromos] = useState<PromoScreen[]>([]);
  const [leds, setLeds] = useState<LedScreen[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>(products);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const load = async () => {
    const [lay, depts, pr, cats, prods] = await Promise.all([
      fetch('/api/store3d/v2/layout').then((r) => r.json()),
      fetch('/api/admin/store3d/departments').then((r) => r.json()),
      fetch('/api/admin/store3d/promos').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/admin/products').then((r) => r.json()),
    ]);
    setDepartments(depts.departments || []);
    setShelves(lay.shelves || []);
    setPromos(pr.promos || []);
    setLeds(lay.leds || []);
    setCategories(cats.categories || []);
    if (prods.products) setAllProducts(prods.products);
  };
  useEffect(() => {
    load().catch(() => flash(false, 'Could not load the 3D store configuration (admin access required).'));
  }, []);

  const call = async (url: string, method: string, body?: unknown) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'floor', label: 'Store floor', icon: MapIcon },
    { id: 'departments', label: 'Departments & entrances', icon: Building2 },
    { id: 'fixtures', label: 'Shelves & displays', icon: Layers },
    { id: 'products', label: 'Product experience', icon: Box },
    { id: 'promos', label: 'Promotional screens', icon: Megaphone },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">ShopWalk 360 · Virtual Store</h1>
          <p className="text-xs text-slate-500">Departments, shelf positions, product media, 3D models, demonstration videos and try-on settings. All product data comes from the same catalogue as the online store.</p>
        </div>
        {onPreviewStore && (
          <button onClick={onPreviewStore} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500">
            <Eye className="h-4 w-4" /> Preview the virtual store
          </button>
        )}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {msg.text}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'floor' && <FloorTab departments={departments} shelves={shelves} onPickDept={() => setTab('departments')} onPickShelf={() => setTab('fixtures')} />}
      {tab === 'departments' && <DepartmentsTab departments={departments} categories={categories} call={call} reload={load} flash={flash} />}
      {tab === 'fixtures' && <FixturesTab departments={departments} shelves={shelves} products={allProducts} call={call} reload={load} flash={flash} />}
      {tab === 'products' && <ProductTab products={allProducts} departments={departments} shelves={shelves} call={call} reload={load} flash={flash} />}
      {tab === 'promos' && <PromosTab promos={promos} leds={leds} departments={departments} products={allProducts} call={call} reload={load} flash={flash} />}
    </div>
  );
};

type Call = (url: string, method: string, body?: unknown) => Promise<any>;
type Flash = (ok: boolean, t: string) => void;

/* ---------------------------------------------------------------------------------------------- */
function FloorTab({ departments, shelves, onPickDept, onPickShelf }: { departments: StoreDepartment[]; shelves: StoreShelf[]; onPickDept: () => void; onPickShelf: () => void }) {
  const active = departments.filter((d) => d.is_active !== 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-[#1b1916] p-4">
        <StoreMap departments={active} shelves={shelves} showFixtures includePlaza onPickDept={onPickDept} onPickShelf={onPickShelf} className="mx-auto h-[640px] w-auto" title="Store floor plan" />
        <p className="mt-2 text-center text-[11px] text-white/60">Gold squares = fixtures holding products · dashed = free positions</p>
      </div>
      <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...departments].sort((a, b) => a.aisle_number - b.aisle_number).map((d) => {
          const fx = shelves.filter((s) => s.department_id === d.id);
          return (
            <div key={d.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black text-white" style={{ backgroundColor: d.theme_color }}>{formatDeptNumber(d.aisle_number)}</span>
                  <span className="font-bold text-slate-900">{d.name}</span>
                </div>
                {d.is_active === 0 && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">Inactive</span>}
              </div>
              <div className="text-slate-500">{d.slot_index !== undefined && d.slot_index !== null ? slotName(d.slot_index) : 'No room assigned'} · {INTERIOR_LABELS[d.interior_style || ''] || d.interior_style} · {d.lighting} light</div>
              <div className="text-slate-700">{fx.length} fixtures · {fx.filter((s) => s.product_id).length} with products · {fx.filter((s) => s.zone === 'demo').length ? 'has demo zone' : 'no demo zone'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
function DepartmentsTab({ departments, categories, call, reload, flash }: { departments: StoreDepartment[]; categories: Category[]; call: Call; reload: () => Promise<void>; flash: Flash }) {
  const [edit, setEdit] = useState<Partial<StoreDepartment> | null>(null);
  const used = new Map(departments.filter((d) => d.slot_index !== null && d.slot_index !== undefined).map((d) => [d.slot_index!, d]));
  const save = async () => {
    if (!edit) return;
    try {
      if (edit.id) await call(`/api/admin/store3d/departments/${edit.id}`, 'PUT', edit);
      else await call('/api/admin/store3d/departments', 'POST', edit);
      setEdit(null);
      await reload();
      flash(true, 'Department saved. Changes appear in the store the next time it loads.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ name: '', theme_color: '#64748b', interior_style: 'gallery', lighting: 'neutral', is_active: 1 })} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Add department</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          <thead className="bg-slate-50 text-left font-bold text-slate-700">
            <tr><th className="px-4 py-3">No.</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Entrance position</th><th className="px-4 py-3">Interior & lighting</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...departments].sort((a, b) => a.aisle_number - b.aisle_number).map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3"><span className="rounded-md px-2 py-1 font-black text-white" style={{ backgroundColor: d.theme_color }}>{formatDeptNumber(d.aisle_number)}</span></td>
                <td className="px-4 py-3"><div className="font-semibold">{d.name}</div><div className="text-slate-500">{d.description}</div></td>
                <td className="px-4 py-3">{d.slot_index !== null && d.slot_index !== undefined ? slotName(d.slot_index) : '—'}</td>
                <td className="px-4 py-3">{INTERIOR_LABELS[d.interior_style || ''] || d.interior_style} · {d.lighting}</td>
                <td className="px-4 py-3">{categories.find((c) => c.id === d.category_id)?.name || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEdit(d)} className="rounded-lg px-2.5 py-1 font-semibold text-blue-600 hover:bg-blue-50">Edit</button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete “${d.name}” and all of its fixtures from the virtual store? Products stay in the catalogue.`)) return;
                      await call(`/api/admin/store3d/departments/${d.id}`, 'DELETE');
                      await reload();
                      flash(true, 'Department removed.');
                    }}
                    className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'New department'} onClose={() => setEdit(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={label}>Name</label><input className={input} value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value, sign_label: e.target.value })} /></div>
            <div><label className={label}>Department number</label><input type="number" min={1} className={input} value={edit.aisle_number || ''} onChange={(e) => setEdit({ ...edit, aisle_number: Number(e.target.value) })} /></div>
            <div>
              <label className={label}>Entrance position on the galleria</label>
              <select className={input} value={edit.slot_index ?? ''} onChange={(e) => setEdit({ ...edit, slot_index: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">— next free position —</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i} disabled={used.has(i) && used.get(i)!.id !== edit.id}>{slotName(i)}{used.has(i) && used.get(i)!.id !== edit.id ? ` — ${used.get(i)!.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div><label className={label}>Theme colour (signage & accents)</label><input type="color" className="h-9 w-full rounded-xl border border-slate-300" value={edit.theme_color || '#64748b'} onChange={(e) => setEdit({ ...edit, theme_color: e.target.value })} /></div>
            <div>
              <label className={label}>Linked catalogue category</label>
              <select className={input} value={edit.category_id || ''} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Interior design</label>
              <select className={input} value={edit.interior_style || 'gallery'} onChange={(e) => setEdit({ ...edit, interior_style: e.target.value as StoreDepartment['interior_style'] })}>
                {Object.entries(INTERIOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Lighting</label>
              <select className={input} value={edit.lighting || 'neutral'} onChange={(e) => setEdit({ ...edit, lighting: e.target.value as 'warm' | 'neutral' | 'cool' })}>
                <option value="warm">Warm</option><option value="neutral">Neutral</option><option value="cool">Cool</option>
              </select>
            </div>
            <div className="sm:col-span-2"><label className={label}>Short description (fascia & directory)</label><input className={input} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={label}>Information screen message</label><textarea rows={3} className={input} value={edit.info_text || ''} onChange={(e) => setEdit({ ...edit, info_text: e.target.value })} placeholder="Shown as moving text on the department LED when no video is set" /></div>
            <div className="sm:col-span-2">
              <label className={label}>Information screen video</label>
              <div className="flex flex-wrap items-center gap-2">
                <input className={input} value={edit.info_video_url || ''} onChange={(e) => setEdit({ ...edit, info_video_url: e.target.value })} placeholder="MP4 or WebM URL, or upload" />
                <UploadButton kind="video" accept="video/mp4,video/webm" text="Upload" onUploaded={(url) => setEdit({ ...edit, info_video_url: url })} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">MP4 or WebM. The file is saved on Cloudflare and plays full-screen on this department’s LED. Leave it empty to keep the scrolling message.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={edit.is_active !== 0} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })} /> Open to shoppers</label>
          </div>
          <ModalActions onCancel={() => setEdit(null)} onSave={save} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
function FixturesTab({ departments, shelves, products, call, reload, flash }: { departments: StoreDepartment[]; shelves: StoreShelf[]; products: Product[]; call: Call; reload: () => Promise<void>; flash: Flash }) {
  const sorted = [...departments].sort((a, b) => a.aisle_number - b.aisle_number);
  const [deptId, setDeptId] = useState<string>(sorted[0]?.id || '');
  const [slot, setSlot] = useState<string | null>(null);
  const dept = departments.find((d) => d.id === deptId) || sorted[0];
  const existing = shelves.find((s) => s.department_id === dept?.id && s.slot_code === slot);
  const [form, setForm] = useState<Partial<StoreShelf>>({});
  useEffect(() => {
    if (!slot) return;
    const def = SLOT_BY_CODE[slot];
    setForm(existing ? { ...existing } : { shelf_type: def.fits[0] as StoreShelf['shelf_type'], shelf_level: 2, facing_count: 4, zone: def.kind === 'demo' ? 'demo' : 'display' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, deptId, shelves]);
  if (!dept) return <div className="text-xs text-slate-500">Add a department first.</div>;
  const room = dept.slot_index !== null && dept.slot_index !== undefined ? roomForSlot(dept.slot_index) : null;

  const save = async () => {
    try {
      const body = { ...form, department_id: dept.id, slot_code: slot };
      if (existing) await call(`/api/admin/store3d/fixtures/${existing.id}`, 'PUT', body);
      else await call('/api/admin/store3d/fixtures', 'POST', body);
      await reload();
      flash(true, 'Display saved.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  // simple room plan: shop front at the bottom
  const plan = (
    <svg viewBox="-6 -1 12 18" className="h-[460px] w-auto rounded-2xl bg-[#1b1916]">
      <rect x={-5} y={0} width={10} height={16} fill="#2b2925" stroke="#5b564e" strokeWidth={0.05} />
      <rect x={-1.7} y={15.9} width={3.4} height={0.25} fill="#e8e3d9" />
      <text x={0} y={16.8} textAnchor="middle" fontSize={0.45} fill="#c8a96a">SHOP FRONT / ENTRANCE</text>
      {SLOTS.map((s) => {
        const has = shelves.find((x) => x.department_id === dept.id && x.slot_code === s.code);
        const x = s.v;
        const y = 16 - s.u;
        const w = s.kind === 'wall' ? (s.code.startsWith('BW') ? 2.4 : 0.5) : s.kind === 'demo' ? 2.6 : s.kind === 'window' ? 1.5 : 1;
        const h = s.kind === 'wall' ? (s.code.startsWith('BW') ? 0.45 : 2.4) : s.kind === 'demo' ? 1.2 : s.kind === 'window' ? 1.5 : 3;
        return (
          <g key={s.code} onClick={() => setSlot(s.code)} style={{ cursor: 'pointer' }}>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={0.15} fill={slot === s.code ? '#f3dfb4' : has ? '#c8a96a' : 'transparent'} stroke="#c8a96a" strokeWidth={0.06} strokeDasharray={has ? undefined : '0.15 0.12'} />
            <text x={x} y={y + 0.15} textAnchor="middle" fontSize={0.4} fill={has || slot === s.code ? '#1b1916' : '#c8a96a'} fontWeight={700}>{s.code}</text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${input} max-w-xs`} value={dept.id} onChange={(e) => { setDeptId(e.target.value); setSlot(null); }}>
          {sorted.map((d) => <option key={d.id} value={d.id}>{formatDeptNumber(d.aisle_number)} · {d.name}</option>)}
        </select>
        <span className="text-xs text-slate-500">{room ? `${room.side === 'west' ? 'Left' : 'Right'} side of the galleria` : 'No room position assigned'} · click a position on the plan</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {plan}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!slot ? (
            <div className="text-xs text-slate-500">Select a position on the plan to add or change a display. Window displays are visible from the galleria; the demonstration zone sits at the back of the store.</div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="text-sm font-bold">{SLOT_BY_CODE[slot].label} <span className="font-mono text-slate-400">({slot})</span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Display type</label>
                  <select className={input} value={form.shelf_type || ''} onChange={(e) => setForm({ ...form, shelf_type: e.target.value as StoreShelf['shelf_type'] })}>
                    {SLOT_BY_CODE[slot].fits.filter((f) => FIXTURE_LABELS[f]).map((f) => <option key={f} value={f}>{FIXTURE_LABELS[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Product</label>
                  <select className={input} value={form.product_id || ''} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                    <option value="">— empty —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Shelf position (level shown in the store)</label>
                  <select className={input} value={form.shelf_level || 2} onChange={(e) => setForm({ ...form, shelf_level: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Shelf {n}{n === 2 ? ' (eye level)' : ''}</option>)}
                  </select>
                </div>
                <div><label className={label}>Badge (optional)</label><input className={input} value={form.featured_label || ''} onChange={(e) => setForm({ ...form, featured_label: e.target.value })} placeholder="e.g. NEW IN" /></div>
                <div><label className={label}>Aisle label</label><input className={input} value={form.aisle_label || ''} onChange={(e) => setForm({ ...form, aisle_label: e.target.value })} placeholder={`Aisle ${formatDeptNumber(dept.aisle_number)} · Bay ${slot}`} /></div>
                <div><label className={label}>Shelf code</label><input className={input} value={form.shelf_code || ''} onChange={(e) => setForm({ ...form, shelf_code: e.target.value })} placeholder={`D${formatDeptNumber(dept.aisle_number)}-${slot}`} /></div>
                <label className="flex items-center gap-2 font-semibold sm:col-span-2"><input type="checkbox" checked={form.zone === 'demo'} onChange={(e) => setForm({ ...form, zone: e.target.checked ? 'demo' : 'display' })} /> Product demonstration zone (opens the product’s 3D / try-on / room view first)</label>
              </div>
              <div className="flex justify-between pt-2">
                {existing ? (
                  <button onClick={async () => { await call(`/api/admin/store3d/fixtures/${existing.id}`, 'DELETE'); setSlot(null); await reload(); flash(true, 'Display removed.'); }} className="flex items-center gap-1 rounded-xl px-3 py-2 font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Remove display</button>
                ) : <span />}
                <button onClick={save} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white"><Save className="h-3.5 w-3.5" /> Save display</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
function ProductTab({ products, departments, shelves, call, reload, flash }: { products: Product[]; departments: StoreDepartment[]; shelves: StoreShelf[]; call: Call; reload: () => Promise<void>; flash: Flash }) {
  const [pid, setPid] = useState<string>(products[0]?.id || '');
  const [p, setP] = useState<Product | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<Partial<ProductVariant>[]>([]);
  const [specs, setSpecs] = useState<[string, string][]>([]);
  const [dims, setDims] = useState({ w: '', h: '', d: '' });
  const [hex, setHex] = useState<Record<string, string>>({});
  const [placement, setPlacement] = useState({ dept: '', slot: '' });
  const samples = products.filter((x) => x.is_sample);

  useEffect(() => {
    if (!pid) return;
    fetch(`/api/admin/products/${pid}/experience`).then((r) => r.json()).then((d) => {
      setP(d.product);
      setImages((d.images || []).map((i: any) => i.image_url));
      setVariants(d.variants || []);
      try {
        setSpecs(Object.entries(JSON.parse(d.product.specifications || '{}')));
      } catch {
        setSpecs([]);
      }
      try {
        const dd = JSON.parse(d.product.dimensions_json || 'null');
        setDims(dd ? { w: String(dd.w), h: String(dd.h), d: String(dd.d) } : { w: '', h: '', d: '' });
      } catch {
        setDims({ w: '', h: '', d: '' });
      }
      try {
        setHex(JSON.parse(d.product.color_hex_map || '{}') || {});
      } catch {
        setHex({});
      }
    });
  }, [pid]);

  const colourNames = useMemo(() => (p?.color_options || '').split(',').map((s) => s.trim()).filter(Boolean), [p?.color_options]);
  const where = shelves.filter((s) => s.product_id === pid);
  const set = (patch: Partial<Product>) => setP((x) => (x ? { ...x, ...patch } : x));

  const save = async () => {
    if (!p) return;
    const w = Number(dims.w);
    const h = Number(dims.h);
    const d = Number(dims.d);
    const hasDims = w > 0 && h > 0 && d > 0;
    if ((dims.w || dims.h || dims.d) && !hasDims) return flash(false, 'Enter all three dimensions (width, height, depth) in centimetres, or leave all empty.');
    try {
      await call(`/api/admin/products/${p.id}/experience`, 'PUT', {
        dimensions_json: hasDims ? { w, h, d } : '',
        model_3d_url: p.model_3d_url || '',
        model_preset: p.model_preset || '',
        demo_video_url: p.demo_video_url || '',
        demo_video_type: p.demo_video_type || '',
        demo_video_poster: p.demo_video_poster || '',
        demo_video_captions: p.demo_video_captions || '',
        demo_video_title: p.demo_video_title || '',
        features: p.features || '', in_the_box: p.in_the_box || '', usage_instructions: p.usage_instructions || '', care_instructions: p.care_instructions || '', ingredients: p.ingredients || '',
        warranty: p.warranty || '', weight_kg: p.weight_kg || null,
        tryon_type: p.tryon_type || 'none', wearable_slot: p.wearable_slot || '',
        color_options: p.color_options || '', size_options: p.size_options || '',
        color_hex_map: Object.fromEntries(Object.entries(hex).filter(([k]) => colourNames.includes(k))),
        specifications: Object.fromEntries(specs.filter(([k]) => k.trim())),
        images,
        variants,
      });
      await reload();
      flash(true, 'Product experience saved.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  const place = async () => {
    if (!placement.dept || !placement.slot) return;
    try {
      await call('/api/admin/store3d/fixtures', 'POST', { department_id: placement.dept, slot_code: placement.slot, product_id: pid, shelf_type: SLOT_BY_CODE[placement.slot].fits[0] });
      await reload();
      flash(true, 'Product placed in the store.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  const dimsObj = Number(dims.w) > 0 && Number(dims.h) > 0 && Number(dims.d) > 0 ? { w: Number(dims.w), h: Number(dims.h), d: Number(dims.d) } : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${input} max-w-md`} value={pid} onChange={(e) => setPid(e.target.value)}>
          {products.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_sample ? ' — sample' : ''}</option>)}
        </select>
        {samples.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm(`Remove the ${samples.length} sample listings? (Samples that already appear in orders are unpublished instead of deleted.)`)) return;
              const d = await call('/api/admin/sample-products', 'DELETE');
              await reload();
              flash(true, `Removed ${d.removed} sample listings${d.unpublished ? `, unpublished ${d.unpublished}` : ''}.`);
            }}
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
          >
            Remove {samples.length} sample listings
          </button>
        )}
      </div>
      {p && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Location in the store" icon={MapIcon}>
            {where.length ? (
              <ul className="space-y-1 text-xs">
                {where.map((s) => <li key={s.id}>• {s.department_name} · {s.aisle_label} · {FIXTURE_LABELS[s.shelf_type] || s.shelf_type} · Shelf {s.shelf_level || 2}{s.zone === 'demo' ? ' · demo zone' : ''}</li>)}
              </ul>
            ) : <div className="text-xs text-amber-700">This product is not on display in the virtual store yet.</div>}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div><label className={label}>Department</label>
                <select className={input} value={placement.dept} onChange={(e) => setPlacement({ dept: e.target.value, slot: '' })}>
                  <option value="">—</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{formatDeptNumber(d.aisle_number)} {d.name}</option>)}
                </select>
              </div>
              <div><label className={label}>Free position</label>
                <select className={input} value={placement.slot} onChange={(e) => setPlacement({ ...placement, slot: e.target.value })}>
                  <option value="">—</option>
                  {SLOTS.filter((s) => !shelves.some((x) => x.department_id === placement.dept && x.slot_code === s.code)).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
              <button onClick={place} disabled={!placement.dept || !placement.slot} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Place here</button>
            </div>
          </Card>

          <Card title="Product images" icon={ImageIcon}>
            <div className="space-y-2">
              {images.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <img src={u} alt="" className="h-10 w-10 rounded-lg bg-slate-100 object-cover" />
                  <input className={input} value={u} onChange={(e) => setImages(images.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button aria-label="Move up" disabled={i === 0} onClick={() => setImages(images.map((x, k) => (k === i - 1 ? images[i] : k === i ? images[i - 1] : x)))} className="p-1 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button aria-label="Move down" disabled={i === images.length - 1} onClick={() => setImages(images.map((x, k) => (k === i + 1 ? images[i] : k === i ? images[i + 1] : x)))} className="p-1 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button aria-label="Remove image" onClick={() => setImages(images.filter((_, k) => k !== i))} className="p-1 text-rose-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setImages([...images, ''])} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Add image URL</button>
                <UploadButton kind="image" accept="image/jpeg,image/png,image/webp" text="Upload image" onUploaded={(u) => setImages([...images, u])} />
              </div>
              <p className="text-[11px] text-slate-500">The first image is the primary photo (used on shelves, packaging and the classic store).</p>
            </div>
          </Card>

          <Card title="3D Product Configuration" icon={Ruler}>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['w', 'h', 'd'] as const).map((k) => (
                <div key={k}><label className={label}>{k === 'w' ? 'Width' : k === 'h' ? 'Height' : 'Depth'} (cm)</label><input type="number" min={0} step="0.1" className={input} value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value })} /></div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Used for the room preview, AR placement and the assistant’s “What are its dimensions?” answer. Leave empty if unknown — the store will not guess.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Generated preview model</label>
                <select className={input} value={p.model_preset || ''} onChange={(e) => set({ model_preset: e.target.value })}>
                  <option value="">— none —</option>
                  {MODEL_PRESETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div><label className={label}>Uploaded 3D model (GLB)</label>
                <div className="flex gap-2"><input className={input} value={p.model_3d_url || ''} onChange={(e) => set({ model_3d_url: e.target.value })} placeholder="/uploads/model/…glb" />
                  <UploadButton kind="model" accept=".glb,model/gltf-binary" text="GLB" onUploaded={(u) => set({ model_3d_url: u })} /></div>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">For best performance upload a Draco- or Meshopt-compressed GLB with KTX2 textures, modelled in metres. An uploaded model replaces the generated one.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Display scale ({Number(p.model_scale ?? 1).toFixed(2)}×)</label>
                <input type="range" min={0.25} max={3} step={0.05} className="w-full accent-blue-600" value={p.model_scale ?? 1} onChange={(e) => set({ model_scale: Number(e.target.value) })} />
              </div>
              <div>
                <label className={label}>Rotation on the display ({Math.round(p.model_rotation_deg ?? 0)}°)</label>
                <input type="range" min={-180} max={180} step={5} className="w-full accent-blue-600" value={p.model_rotation_deg ?? 0} onChange={(e) => set({ model_rotation_deg: Number(e.target.value) })} />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">An uploaded model is shown on a display stand in front of its shelf in the 3D store, sized from the dimensions above (or a standard display size if none are given) and then multiplied by the scale.</p>
            <div className="mt-3"><ProductViewer3D preset={p.model_preset} glbUrl={p.model_3d_url} colorName={colourNames[0]} colorMap={hex} colorOptions={p.color_options} dims={dimsObj} specs={Object.fromEntries(specs)} className="h-64" /></div>
          </Card>

          <Card title="Demonstration video (“Watch How It Works”)" icon={Video}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Source</label>
                <select className={input} value={p.demo_video_type || (p.demo_video_url ? 'file' : '')} onChange={(e) => set({ demo_video_type: e.target.value })}>
                  <option value="">— no video —</option><option value="file">Uploaded MP4 / WebM</option><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option>
                </select>
              </div>
              <div><label className={label}>Title</label><input className={input} value={p.demo_video_title || ''} onChange={(e) => set({ demo_video_title: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label}>Video URL</label>
                <div className="flex gap-2"><input className={input} value={p.demo_video_url || ''} onChange={(e) => set({ demo_video_url: e.target.value })} placeholder="/uploads/video/… or https://youtu.be/…" />
                  <UploadButton kind="video" accept="video/mp4,video/webm" text="MP4" onUploaded={(u) => set({ demo_video_url: u, demo_video_type: 'file' })} /></div>
              </div>
              <div><label className={label}>Thumbnail</label>
                <div className="flex gap-2"><input className={input} value={p.demo_video_poster || ''} onChange={(e) => set({ demo_video_poster: e.target.value })} />
                  <UploadButton kind="image" accept="image/jpeg,image/png,image/webp" text="Image" onUploaded={(u) => set({ demo_video_poster: u })} /></div>
              </div>
              <div><label className={label}>Captions (WebVTT)</label>
                <div className="flex gap-2"><input className={input} value={p.demo_video_captions || ''} onChange={(e) => set({ demo_video_captions: e.target.value })} />
                  <UploadButton kind="captions" accept=".vtt,text/vtt" text="VTT" onUploaded={(u) => set({ demo_video_captions: u })} /></div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Videos should cover what the product is, what it’s for, its main features, how it works and is used, key specifications, what’s in the box and care. Uploaded videos also play on the department’s demonstration screen.</p>
            {p.demo_video_url && <div className="mt-3"><DemoVideo url={p.demo_video_url} type={p.demo_video_type} poster={p.demo_video_poster} captions={p.demo_video_captions} title={p.name} /></div>}
          </Card>

          <Card title="Virtual try-on" icon={Shirt}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Experience type</label>
                <select className={input} value={p.tryon_type || 'none'} onChange={(e) => set({ tryon_type: e.target.value as TryOnType })}>
                  <option value="none">None (3D view only)</option>
                  <option value="fashion">Clothing / bags on the avatar</option>
                  <option value="footwear">Footwear (3D + on avatar)</option>
                  <option value="watch">Watches & eyewear (3D + on avatar)</option>
                  <option value="beauty">Lip / colour cosmetics (shade preview)</option>
                  <option value="furniture">Furniture & home (room preview + AR)</option>
                  <option value="electronics">Electronics (3D details + demonstration)</option>
                </select>
              </div>
              <div><label className={label}>Worn on the avatar as</label>
                <select className={input} value={p.wearable_slot || ''} onChange={(e) => set({ wearable_slot: (e.target.value || null) as Product['wearable_slot'] })}>
                  <option value="">— not wearable —</option><option value="top">Top</option><option value="bottom">Bottoms</option><option value="shoes">Shoes</option><option value="watch">Watch</option><option value="glasses">Glasses</option><option value="bag">Bag</option>
                </select>
              </div>
              <div className="sm:col-span-2"><label className={label}>Colours (comma separated)</label><input className={input} value={p.color_options || ''} onChange={(e) => set({ color_options: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label}>Sizes (comma separated)</label><input className={input} value={p.size_options || ''} onChange={(e) => set({ size_options: e.target.value })} /></div>
            </div>
            {colourNames.length > 0 && (
              <div className="mt-3">
                <div className={label}>Exact colour for each option (used by 3D, try-on and shade previews)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {colourNames.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-xs">
                      <input type="color" value={hex[c] || '#888888'} onChange={(e) => setHex({ ...hex, [c]: e.target.value })} className="h-8 w-10 rounded border border-slate-300" />
                      {c}{!hex[c] && <span className="text-amber-600">(not set)</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="Specifications" icon={Layers}>
            {specs.map(([k, v], i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input className={`${input} w-1/3`} value={k} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} placeholder="Name" />
                <input className={input} value={v} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} placeholder="Value" />
                <button aria-label="Remove specification" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="p-1 text-rose-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button onClick={() => setSpecs([...specs, ['', '']])} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Add specification</button>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Weight (kg)</label><input type="number" step="0.01" className={input} value={p.weight_kg ?? ''} onChange={(e) => set({ weight_kg: e.target.value ? Number(e.target.value) : undefined })} /></div>
              <div><label className={label}>Warranty / returns</label><input className={input} value={p.warranty || ''} onChange={(e) => set({ warranty: e.target.value })} /></div>
            </div>
          </Card>

          <Card title="Product information (used by the assistant)" icon={Box}>
            {([['features', 'Features (one per line)'], ['in_the_box', 'In the box (one per line)'], ['usage_instructions', 'How to use'], ['care_instructions', 'Care instructions'], ['ingredients', 'Ingredients (beauty)']] as const).map(([k, l]) => (
              <div key={k} className="mb-2"><label className={label}>{l}</label><textarea rows={2} className={input} value={(p as any)[k] || ''} onChange={(e) => set({ [k]: e.target.value } as Partial<Product>)} /></div>
            ))}
          </Card>

          <Card title="Variants (colour / size with own price & stock)" icon={Layers}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th>Title</th><th>Colour</th><th>Size</th><th>SKU</th><th>Price</th><th>Stock</th><th /></tr></thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={i}>
                      {(['title', 'color', 'size', 'sku', 'price', 'stock_quantity'] as const).map((f) => (
                        <td key={f} className="p-0.5"><input className={`${input} px-2`} value={(v as any)[f] ?? ''} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, [f]: f === 'price' || f === 'stock_quantity' ? Number(e.target.value) : e.target.value } : x)))} /></td>
                      ))}
                      <td><button aria-label="Remove variant" onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="p-1 text-rose-500"><X className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setVariants([...variants, { title: '', sku: `${p.sku}-${variants.length + 1}`, price: p.discount_price || p.regular_price, stock_quantity: 0 }])} className="mt-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Add variant</button>
            <p className="mt-1 text-[11px] text-slate-500">If variants exist, shoppers pick from them and checkout charges the variant’s price and checks its stock.</p>
          </Card>
        </div>
      )}
      <div className="sticky bottom-3 flex justify-end">
        <button onClick={save} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white shadow-lg"><Save className="h-4 w-4" /> Save product experience</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
const LED_NAMES: Record<string, string> = {
  avatar: 'Avatar Studio totem',
  welcome: 'Welcome wall',
  directory: 'Department directory',
  map: 'Store map',
  checkout: 'Checkout',
  baskets: 'Basket station',
};

function PromosTab({ promos, leds, departments, products, call, reload, flash }: { promos: PromoScreen[]; leds: LedScreen[]; departments: StoreDepartment[]; products: Product[]; call: Call; reload: () => Promise<void>; flash: Flash }) {
  const [edit, setEdit] = useState<Partial<PromoScreen> | null>(null);
  const [led, setLed] = useState<LedScreen | null>(null);
  const saveLed = async () => {
    if (!led) return;
    try {
      await call(`/api/admin/store3d/leds/${led.id}`, 'PUT', led);
      setLed(null);
      await reload();
      flash(true, 'LED screen saved. Reload the virtual store to see it.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };
  const save = async () => {
    if (!edit) return;
    try {
      if (edit.id) await call(`/api/admin/store3d/promos/${edit.id}`, 'PUT', edit);
      else await call('/api/admin/store3d/promos', 'POST', edit);
      setEdit(null);
      await reload();
      flash(true, 'Promotional screen saved.');
    } catch (e: any) {
      flash(false, e.message);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Store screens are large LEDs. The message scrolls. Add a video and that screen plays it instead. Without a video, the text below is what shoppers see.</p>
        <button onClick={() => setEdit({ location: 'lobby', accent_color: '#c8a96a', is_active: 1 })} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Add screen</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leds.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#c8a96a]">{LED_NAMES[s.id] || s.id}</div>
            <div className="mt-1 font-bold">{s.title}</div>
            <div className="mt-1 line-clamp-2 text-slate-300">{s.body || 'Department names scroll here'}</div>
            <div className="mt-2 text-[11px] text-slate-400">{s.video_url ? 'Video set' : 'Text only'}</div>
            <button onClick={() => setLed(s)} className="mt-2 font-semibold text-[#e2c88f]">Edit screen</button>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {promos.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
            <div className="mb-1 h-1.5 w-10 rounded" style={{ backgroundColor: p.accent_color }} />
            <div className="font-bold">{p.title}</div>
            <div className="text-slate-500">{p.subtitle}</div>
            <div className="mt-1 text-slate-700">Product: {products.find((x) => x.id === p.product_id)?.name || '—'}</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEdit(p)} className="font-semibold text-blue-600">Edit</button>
              <button onClick={async () => { await call(`/api/admin/store3d/promos/${p.id}`, 'DELETE'); await reload(); }} className="font-semibold text-rose-600">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit screen' : 'New promotional screen'} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <div><label className={label}>Title</label><input className={input} value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div><label className={label}>Subtitle</label><input className={input} value={edit.subtitle || ''} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></div>
            <div><label className={label}>Location</label>
              <select className={input} value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })}>
                <option value="lobby">Reception lobby</option>
                {departments.map((d) => <option key={d.id} value={d.id} disabled>{d.name} (coming soon)</option>)}
              </select>
            </div>
            <div><label className={label}>Product</label>
              <select className={input} value={edit.product_id || ''} onChange={(e) => setEdit({ ...edit, product_id: e.target.value })}>
                <option value="">— none —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Screen video</label>
              <div className="flex flex-wrap items-center gap-2">
                <input className={input} value={edit.video_url || ''} onChange={(e) => setEdit({ ...edit, video_url: e.target.value })} placeholder="Optional MP4 or WebM" />
                <UploadButton kind="video" accept="video/mp4,video/webm" text="Upload" onUploaded={(url) => setEdit({ ...edit, video_url: url })} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">MP4 or WebM, saved on Cloudflare. It plays on the totem. Leave empty to scroll the title and subtitle.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Accent colour</label><input type="color" className="h-9 w-full rounded-xl border border-slate-300" value={edit.accent_color || '#c8a96a'} onChange={(e) => setEdit({ ...edit, accent_color: e.target.value })} /></div>
              <div><label className={label}>Order</label><input type="number" className={input} value={edit.display_order ?? 0} onChange={(e) => setEdit({ ...edit, display_order: Number(e.target.value) })} /></div>
            </div>
          </div>
          <ModalActions onCancel={() => setEdit(null)} onSave={save} />
        </Modal>
      )}
      {led && (
        <Modal title={LED_NAMES[led.id] || led.title} onClose={() => setLed(null)}>
          <div className="grid gap-3">
            <div><label className={label}>Headline</label><input className={input} value={led.title} onChange={(e) => setLed({ ...led, title: e.target.value })} /></div>
            <div><label className={label}>Scrolling message</label><textarea rows={4} className={input} value={led.body || ''} onChange={(e) => setLed({ ...led, body: e.target.value })} placeholder="One line per row. This moves across the LED when no video is set." /></div>
            <div>
              <label className={label}>Video</label>
              <div className="flex flex-wrap items-center gap-2">
                <input className={input} value={led.video_url || ''} onChange={(e) => setLed({ ...led, video_url: e.target.value })} placeholder="MP4 or WebM on Cloudflare" />
                <UploadButton kind="video" accept="video/mp4,video/webm" text="Upload" onUploaded={(url) => setLed({ ...led, video_url: url })} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">The upload is stored on Cloudflare and loops on this screen. A YouTube link will not play on the 3D screen.</p>
              {led.video_url && <button type="button" onClick={() => setLed({ ...led, video_url: '' })} className="mt-2 text-xs font-semibold text-rose-600">Remove video</button>}
            </div>
          </div>
          <ModalActions onCancel={() => setLed(null)} onSave={saveLed} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-blue-600" /> {title}</h3>
      {children}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-black">{title}</h3><button aria-label="Close" onClick={onClose} className="rounded-full p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold">Cancel</button>
      <button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white">Save</button>
    </div>
  );
}

export default Admin3DStore;
