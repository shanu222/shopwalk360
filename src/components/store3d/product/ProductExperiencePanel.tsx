import { spotsFor } from '../layout/fixtureSpots';
import React, { useEffect, useMemo, useState } from 'react';
import { X, Star, ShoppingBag, Minus, Plus, Play, Box, Image as ImageIcon, Shirt, MapPin, Check, PackageCheck, AlertTriangle, ShieldCheck, Video, Sparkles, Home as HomeIcon } from 'lucide-react';
import { AvatarConfig, Product, ProductImage, ProductVariant, Review, StoreShelf, TryOnOverride, ExperienceIntegrations } from '../../../types';
import { ProductViewer3D } from './ProductViewer3D';
import { DemoVideo, parseVideo } from './DemoVideo';
import { InfoAssistant } from './InfoAssistant';
import { RoomVisualizer } from './RoomVisualizer';
import { FashionTryOn, AccessoryTryOn, FootwearTryOn, BeautyTryOn, ColourOpt } from './TryOnExperiences';
import { parseColorMap, parseDims, resolveColor, DemoDefinition } from '../builder/productModels';
import { slotForProduct } from '../avatar/tryOn';
import { formatDeptNumber } from '../layout/storeLayout';

interface Props {
  shelf: StoreShelf;
  avatar: AvatarConfig;
  integrations: ExperienceIntegrations;
  tryOns: TryOnOverride[];
  onClose: () => void;
  onAdd: (p: Product, qty: number, variant?: string) => void;
  onBuyNow: (p: Product, qty: number, variant?: string) => void;
  onWearInStore: (o: TryOnOverride) => void;
}

type Media = 'photos' | '3d' | 'video' | 'tryon' | 'room';

export const ProductExperiencePanel: React.FC<Props> = ({ shelf, avatar, integrations, tryOns, onClose, onAdd, onBuyNow, onWearInStore }) => {
  const [data, setData] = useState<{ product: Product; images: ProductImage[]; variants: ProductVariant[]; reviews: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Media>('photos');
  const [tab, setTab] = useState<'details' | 'specs' | 'reviews' | 'ask'>('details');
  const [imgIdx, setImgIdx] = useState(0);
  const [colour, setColour] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [demoInfo, setDemoInfo] = useState<DemoDefinition | null>(null);
  const [demoOn, setDemoOn] = useState(false);
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    let off = false;
    setData(null);
    setError(null);
    fetch(`/api/products/${shelf.product_slug || shelf.product_id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Product not found'))))
      .then((raw) => {
        if (off) return;
        if (!raw?.product) throw new Error('Product not found');
        // every list is always present, whatever the server sent
        const d = {
          product: raw.product as Product,
          images: Array.isArray(raw.images) ? raw.images : [],
          variants: Array.isArray(raw.variants) ? raw.variants : [],
          reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
        };
        setData(d);
        const firstColour = d.variants?.find((v: ProductVariant) => v.color)?.color || (d.product.color_options || '').split(',')[0]?.trim() || '';
        setColour(firstColour);
        setSize('');
        setQty(1);
        setImgIdx(0);
        setMedia(d.product.tryon_type && d.product.tryon_type !== 'none' && shelf.zone === 'demo' ? (d.product.tryon_type === 'furniture' ? 'room' : d.product.tryon_type === 'electronics' ? '3d' : 'tryon') : 'photos');
      })
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [shelf.product_slug, shelf.product_id]);

  // close on Escape
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const p = data?.product;
  const specs: Record<string, string> = useMemo(() => {
    try {
      return p?.specifications ? JSON.parse(p.specifications) : {};
    } catch {
      return {};
    }
  }, [p?.specifications]);
  const colorMap = useMemo(() => parseColorMap(p?.color_hex_map), [p?.color_hex_map]);
  const dims = parseDims(p?.dimensions_json);

  const variants = data?.variants || [];
  const colourNames = variants.length ? [...new Set(variants.map((v) => v.color).filter(Boolean) as string[])] : (p?.color_options || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sizeNames = variants.length ? [...new Set(variants.map((v) => v.size).filter(Boolean) as string[])] : (p?.size_options || '').split(',').map((s) => s.trim()).filter(Boolean);
  const colours: ColourOpt[] = colourNames.map((n) => ({ name: n, hex: resolveColor(n, colorMap) }));
  const variant = variants.find((v) => (!colourNames.length || v.color === colour) && (!sizeNames.length || v.size === size));
  const needsSize = sizeNames.length > 1;
  const regular = p?.regular_price || 0;
  const unit = variant && variant.price > 0 ? variant.price : p?.discount_price || regular;
  const discountPct = p?.discount_price && p.discount_price < regular && !(variant && variant.price > 0) ? Math.round((1 - p.discount_price / regular) * 100) : 0;
  const stock = variant ? variant.stock_quantity : p?.stock_quantity ?? 0;
  const low = p?.low_stock_threshold ?? 5;
  const video = parseVideo(p?.demo_video_url, p?.demo_video_type);
  const slot = p ? slotForProduct(p) : null;
  const tryType = p?.tryon_type || 'none';
  const hasTryOn = !!slot && ['fashion', 'watch', 'footwear', 'beauty'].includes(tryType);
  const avg = data?.reviews.length ? data.reviews.reduce((a, r) => a + r.rating, 0) / data.reviews.length : 0;
  const variantLabel = variant ? variant.id : [colour && `Colour: ${colour}`, size && `Size: ${size}`].filter(Boolean).join(' · ') || undefined;
  const wearing = !!slot && tryOns.some((t) => t.slot === slot && t.productId === p?.id);

  const add = (buy = false) => {
    if (!p) return;
    if (needsSize && !size) {
      setTab('details');
      document.getElementById('size-picker')?.focus();
      return;
    }
    // a real variant row may carry its own price — the basket shows the same price checkout charges
    const forCart: Product = variant && variant.price > 0 ? { ...p, discount_price: variant.price, regular_price: Math.max(p.regular_price, variant.price), stock_quantity: variant.stock_quantity } : p;
    if (buy) onBuyNow(forCart, qty, variantLabel);
    else {
      onAdd(forCart, qty, variantLabel);
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  };

  const mediaTabs: { id: Media; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'photos', label: 'Photos', icon: ImageIcon, show: true },
    { id: '3d', label: '3D view', icon: Box, show: true },
    { id: 'video', label: 'Watch How It Works', icon: Video, show: true },
    { id: 'tryon', label: tryType === 'beauty' ? 'Try shades' : 'Try on', icon: Shirt, show: hasTryOn },
    { id: 'room', label: 'In my room', icon: HomeIcon, show: tryType === 'furniture' },
  ];

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={p ? `Explore ${p.name}` : 'Explore product'}>
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-2xl sm:h-[min(900px,94vh)] sm:rounded-[28px]">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ backgroundColor: shelf.theme_color || '#334155' }}>
            <MapPin className="h-3 w-3" /> {formatDeptNumber(shelf.department_number)} {shelf.department_name}
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:inline">{shelf.aisle_label}{shelf.tier ? ` · ${spotsFor(shelf.shelf_type)[shelf.tier - 1]?.label || ''}` : ''}</span>
          {p?.is_sample ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Sample listing</span> : null}
          <button onClick={onClose} aria-label="Close" className="ml-auto rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>

        {!data && !error && <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading product…</div>}
        {error && <div className="flex flex-1 items-center justify-center text-sm text-rose-600">{error}</div>}

        {p && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.25fr_1fr]">
              {/* MEDIA */}
              <div className="min-w-0 space-y-3">
                <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Product views">
                  {mediaTabs.filter((t) => t.show).map((t) => (
                    <button key={t.id} role="tab" aria-selected={media === t.id} onClick={() => setMedia(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${media === t.id ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900'} ${t.id === 'video' && video ? 'text-rose-700' : ''}`}>
                      <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                  ))}
                </div>

                {media === 'photos' && (
                  <div className="space-y-2">
                    <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 sm:aspect-[4/3]">
                      {data!.images.length ? (
                        <img src={data!.images[imgIdx]?.image_url} alt={data!.images[imgIdx]?.alt_text || p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">No photos have been added for this product yet.</div>
                      )}
                    </div>
                    {data!.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {data!.images.map((im, i) => (
                          <button key={im.id} onClick={() => setImgIdx(i)} aria-label={`Photo ${i + 1}`} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${i === imgIdx ? 'border-slate-900' : 'border-transparent'}`}>
                            <img src={im.image_url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {media === '3d' && (
                  <div className="space-y-2">
                    <ProductViewer3D
                      preset={p.model_preset}
                      glbUrl={p.model_3d_url}
                      colorName={colour}
                      colorMap={colorMap}
                      colorOptions={p.color_options}
                      dims={dims}
                      specs={specs}
                      demo={demoOn}
                      demoStep={demoStep}
                      onDemoInfo={setDemoInfo}
                      className="h-[340px] sm:h-[420px]"
                    />
                    <div className="text-[11px] text-slate-500">
                      {p.model_3d_url ? '' : 'Illustrative 3D view — details may differ from the real item.'}
                    </div>
                    {demoInfo && (
                      <div className="rounded-2xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-4 w-4 text-amber-500" /> Interactive demonstration: {demoInfo.title}</div>
                          <button onClick={() => { setDemoOn(!demoOn); setDemoStep(0); }} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white">{demoOn ? 'Stop' : 'Start'}</button>
                        </div>
                        {demoOn && (
                          <ol className="mt-2 space-y-1.5">
                            {demoInfo.steps.map((s, i) => (
                              <li key={i}>
                                <button onClick={() => setDemoStep(i + 1)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${demoStep > i ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 hover:bg-slate-100'}`}>
                                  <b>Step {i + 1}.</b> {s.label}{s.specKey && specs[s.specKey] ? <span className="block text-[11px] text-slate-500">{s.specKey}: {specs[s.specKey]}</span> : null}
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {media === 'video' && (
                  video ? (
                    <div className="space-y-2">
                      <DemoVideo url={p.demo_video_url!} type={p.demo_video_type} poster={p.demo_video_poster} captions={p.demo_video_captions} title={p.demo_video_title || p.name} />
                      {p.demo_video_title && <div className="text-sm font-semibold">{p.demo_video_title}</div>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2 rounded-2xl bg-slate-100 p-4 text-xs text-slate-600"><Video className="h-4 w-4 shrink-0" /> No demonstration video has been added for this product yet. Here is what the listing tells us instead:</div>
                      {data!.images[0] && <img src={data!.images[0].image_url} alt={p.name} className="max-h-64 w-full rounded-2xl object-cover" />}
                      {Object.keys(specs).length > 0 && (
                        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 text-xs">
                          {Object.entries(specs).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-3 gap-2 px-3 py-2"><dt className="font-semibold text-slate-500">{k}</dt><dd className="col-span-2">{v}</dd></div>
                          ))}
                        </dl>
                      )}
                    </div>
                  )
                )}

                {media === 'tryon' && hasTryOn && slot && (
                  tryType === 'fashion' ? (
                    <FashionTryOn product={p} avatar={avatar} colours={colours} colour={colour} setColour={setColour} size={size} slot={slot} colorMap={colorMap} specs={specs} onWearInStore={onWearInStore} wearing={wearing} photoTryOnAvailable={integrations.garmentTryOn} />
                  ) : tryType === 'footwear' ? (
                    <FootwearTryOn product={p} avatar={avatar} colours={colours} colour={colour} setColour={setColour} size={size} slot={slot} colorMap={colorMap} specs={specs} onWearInStore={onWearInStore} wearing={wearing} />
                  ) : tryType === 'beauty' ? (
                    <BeautyTryOn product={p} avatar={avatar} colours={colours} colour={colour} setColour={setColour} slot={slot} colorMap={colorMap} specs={specs} onWearInStore={onWearInStore} wearing={wearing} />
                  ) : (
                    <AccessoryTryOn product={p} avatar={avatar} colours={colours} colour={colour} setColour={setColour} slot={slot} colorMap={colorMap} specs={specs} onWearInStore={onWearInStore} wearing={wearing} />
                  )
                )}

                {media === 'room' && <RoomVisualizer preset={p.model_preset} colorName={colour} colorMap={colorMap} dims={dims} productName={p.name} />}
              </div>

              {/* PURCHASE */}
              <div className="space-y-4">
                <div>
                  {p.brand && <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{p.brand}</div>}
                  <h2 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">{p.name}</h2>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                    {data!.reviews.length ? (
                      <>
                        <span className="flex text-amber-500">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(avg) ? 'fill-amber-400' : ''}`} />)}</span>
                        {avg.toFixed(1)} · {data!.reviews.length} review{data!.reviews.length === 1 ? '' : 's'}
                      </>
                    ) : (
                      'No reviews yet'
                    )}
                    <span>· SKU {variant?.sku || p.sku}</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-extrabold">PKR {Number(unit).toLocaleString()}</span>
                  {discountPct > 0 && (
                    <>
                      <span className="text-sm text-slate-400 line-through">PKR {regular.toLocaleString()}</span>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">−{discountPct}%</span>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${stock <= 0 ? 'text-rose-600' : stock <= low ? 'text-amber-600' : 'text-emerald-700'}`}>
                  {stock <= 0 ? <AlertTriangle className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                  {stock <= 0 ? 'Out of stock' : stock <= low ? `Only ${stock} left in stock` : `In stock (${stock} available)`}
                </div>

                {colours.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-600">Colour: <span className="font-normal">{colour}</span></div>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                      {colours.map((c) => (
                        <button key={c.name} role="radio" aria-checked={colour === c.name} aria-label={c.name} title={c.name} onClick={() => setColour(c.name)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] ${colour === c.name ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
                          {c.hex && <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />} {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sizeNames.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-600">Size{needsSize && !size ? <span className="ml-1 text-rose-600">— please choose</span> : `: ${size || sizeNames[0]}`}</div>
                    <div id="size-picker" tabIndex={-1} className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
                      {sizeNames.map((s) => {
                        const v = variants.find((x) => x.size === s && (!colour || x.color === colour));
                        const out = v ? v.stock_quantity <= 0 : false;
                        return (
                          <button key={s} role="radio" aria-checked={size === s} disabled={out} onClick={() => setSize(s)} className={`min-w-[44px] rounded-xl border px-3 py-2 text-xs font-semibold ${size === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-400'} disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through`}>{s}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="p-2.5"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(Math.max(1, stock), q + 1))} aria-label="Increase quantity" className="p-2.5"><Plus className="h-4 w-4" /></button>
                  </div>
                  <button disabled={stock <= 0} onClick={() => add(false)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:bg-slate-300">
                    {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />} {added ? 'Added to basket' : 'Add to Basket'}
                  </button>
                </div>
                <button disabled={stock <= 0} onClick={() => add(true)} className="w-full rounded-xl border border-slate-900 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-40">Buy now · PKR {(Number(unit) * qty).toLocaleString()}</button>

                <button onClick={() => setMedia('video')} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ${video ? 'bg-rose-50 hover:bg-rose-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${video ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-500'}`}><Play className="ml-0.5 h-5 w-5" /></span>
                  <span>
                    <span className="block text-sm font-bold">Watch How It Works</span>
                    <span className="block text-[11px] text-slate-500">{video ? 'Demonstration video' : 'No video yet — see photos and specifications'}</span>
                  </span>
                </button>

                {p.warranty && <div className="flex items-center gap-2 text-xs text-slate-600"><ShieldCheck className="h-4 w-4 text-slate-500" /> Warranty / returns: {p.warranty}</div>}
              </div>
            </div>

            {/* INFO TABS */}
            <div className="border-t border-slate-100 px-4 pb-8 pt-4 sm:px-6">
              <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist">
                {([['details', 'Details'], ['specs', 'Specifications'], ['reviews', `Reviews (${data!.reviews.length})`], ['ask', 'Ask about this product']] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
                ))}
              </div>
              {tab === 'details' && (
                <div className="grid gap-6 text-sm leading-relaxed text-slate-700 md:grid-cols-2">
                  <div className="space-y-3">
                    <p>{p.description}</p>
                    {p.usage_instructions && <div><div className="font-semibold text-slate-900">How to use</div><p className="whitespace-pre-line">{p.usage_instructions}</p></div>}
                    {p.care_instructions && <div><div className="font-semibold text-slate-900">Care</div><p className="whitespace-pre-line">{p.care_instructions}</p></div>}
                  </div>
                  <div className="space-y-3">
                    {p.features && (
                      <div>
                        <div className="font-semibold text-slate-900">Features</div>
                        <ul className="mt-1 list-disc space-y-1 pl-5">{p.features.split('\n').filter(Boolean).map((f, i) => <li key={i}>{f}</li>)}</ul>
                      </div>
                    )}
                    {p.in_the_box && (
                      <div>
                        <div className="font-semibold text-slate-900">In the box</div>
                        <ul className="mt-1 list-disc space-y-1 pl-5">{p.in_the_box.split('\n').filter(Boolean).map((f, i) => <li key={i}>{f}</li>)}</ul>
                      </div>
                    )}
                    {p.ingredients && <div><div className="font-semibold text-slate-900">Ingredients</div><p>{p.ingredients}</p></div>}
                  </div>
                </div>
              )}
              {tab === 'specs' && (
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 text-sm">
                  {Object.entries(specs).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-3 gap-3 px-4 py-2.5"><dt className="font-semibold text-slate-500">{k}</dt><dd className="col-span-2">{v}</dd></div>
                  ))}
                  {dims && <div className="grid grid-cols-3 gap-3 px-4 py-2.5"><dt className="font-semibold text-slate-500">Dimensions</dt><dd className="col-span-2">W {dims.w} × H {dims.h} × D {dims.d} cm</dd></div>}
                  {p.weight_kg ? <div className="grid grid-cols-3 gap-3 px-4 py-2.5"><dt className="font-semibold text-slate-500">Weight</dt><dd className="col-span-2">{p.weight_kg} kg</dd></div> : null}
                  {p.warranty && <div className="grid grid-cols-3 gap-3 px-4 py-2.5"><dt className="font-semibold text-slate-500">Warranty / returns</dt><dd className="col-span-2">{p.warranty}</dd></div>}
                  {!Object.keys(specs).length && !dims && <div className="px-4 py-3 text-slate-500">No specifications have been listed for this product.</div>}
                </dl>
              )}
              {tab === 'reviews' && (
                data!.reviews.length ? (
                  <div className="space-y-3">
                    {data!.reviews.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-slate-100 p-4">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex text-amber-500">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-3.5 w-3.5 ${s <= r.rating ? 'fill-amber-400' : ''}`} />)}</span>
                          <b>{r.reviewer_name}</b>
                          {r.is_verified_purchase ? <span className="text-emerald-700">Verified purchase</span> : null}
                          <span className="text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="mt-1.5 text-sm font-semibold">{r.title}</div>
                        <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">No customer reviews yet.</div>
                )
              )}
              {tab === 'ask' && <InfoAssistant product={p} specs={specs} aiAvailable={integrations.aiAssistant} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
