import React, { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, ShoppingBag, Star, Info, Undo2, MousePointer2 } from 'lucide-react';
import { Product, ProductVariant, StoreShelf } from '../../../types';
import { ProductViewer3D } from './ProductViewer3D';
import { parseColorMap, parseDims, resolveColor } from '../builder/productModels';

interface Props {
  shelf: StoreShelf;
  onAdd: (p: Product, qty: number, variant?: string) => void;
  onBuyNow: (p: Product, qty: number, variant?: string) => void;
  /** open the full product page (photos, video, reviews, try-on) */
  onDetails: () => void;
  /** put the product back on the shelf */
  onPutBack: () => void;
}

const clean = (n?: string | null) => (n || '').replace(/\s*\(Sample Listing\)/, '');

/**
 * The product the shopper just took off the shelf, up close: a large 3D view they can turn and
 * zoom, with the essentials beside it. Add to basket, buy, read everything, or put it back.
 */
export function ProductCloseup({ shelf, onAdd, onBuyNow, onDetails, onPutBack }: Props) {
  const [data, setData] = useState<{ product: Product; variants: ProductVariant[]; rating: number; reviews: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [qty, setQty] = useState(1);
  const [colour, setColour] = useState('');
  const [size, setSize] = useState('');

  useEffect(() => {
    let off = false;
    fetch(`/api/products/${shelf.product_slug || shelf.product_id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Product not found'))))
      .then((raw) => {
        if (off) return;
        if (!raw?.product) throw new Error('Product not found');
        const variants: ProductVariant[] = Array.isArray(raw.variants) ? raw.variants : [];
        const reviews = Array.isArray(raw.reviews) ? raw.reviews : [];
        const rating = reviews.length ? reviews.reduce((a: number, r: any) => a + Number(r.rating || 0), 0) / reviews.length : 0;
        setData({ product: raw.product, variants, rating, reviews: reviews.length });
        setColour(variants.find((v) => v.color)?.color || (raw.product.color_options || '').split(',')[0]?.trim() || '');
      })
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [shelf.product_slug, shelf.product_id]);

  // the close-up eases in, like bringing the product closer to look at it
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onPutBack();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onPutBack]);

  const p = data?.product;
  const colorMap = useMemo(() => parseColorMap(p?.color_hex_map ?? shelf.color_hex_map), [p?.color_hex_map, shelf.color_hex_map]);
  const dims = parseDims(p?.dimensions_json ?? shelf.dimensions_json);
  const variants = data?.variants || [];
  const colourNames = variants.length
    ? [...new Set(variants.map((v) => v.color).filter(Boolean) as string[])]
    : (p?.color_options || shelf.product_color_options || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sizeNames = variants.length
    ? [...new Set(variants.map((v) => v.size).filter(Boolean) as string[])]
    : (p?.size_options || '').split(',').map((s) => s.trim()).filter(Boolean);
  const variant = variants.find((v) => (!colourNames.length || v.color === colour) && (!sizeNames.length || v.size === size));
  const needsSize = sizeNames.length > 1;
  const regular = p?.regular_price ?? shelf.regular_price ?? 0;
  const sale = variant && variant.price > 0 ? variant.price : p?.discount_price ?? shelf.discount_price ?? 0;
  const unit = sale || regular;
  const stock = variant ? variant.stock_quantity : p?.stock_quantity ?? shelf.stock_quantity ?? 0;
  const variantLabel = variant ? variant.id : [colour && `Colour: ${colour}`, size && `Size: ${size}`].filter(Boolean).join(' · ') || undefined;
  const ready = !!p && (!needsSize || !!size) && stock > 0;

  const forCart = (): Product | null => {
    if (!p) return null;
    return variant && variant.price > 0 ? { ...p, discount_price: variant.price, regular_price: Math.max(p.regular_price, variant.price), stock_quantity: variant.stock_quantity } : p;
  };

  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center p-3 transition-[background-color,backdrop-filter] duration-300 sm:p-6 ${shown ? 'bg-[#0d0c0b]/55 backdrop-blur-[3px]' : 'bg-transparent'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${clean(shelf.product_name)}, in your hand`}
      onClick={(e) => e.target === e.currentTarget && onPutBack()}
    >
      <div
        className={`grid max-h-full w-full max-w-5xl overflow-hidden rounded-[28px] bg-[#f7f4ee] shadow-[0_40px_120px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out md:grid-cols-[1.25fr_1fr] ${shown ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
      >
        {/* the product in 3D */}
        <div className="relative min-h-[300px] bg-[#f1eee8]">
          <ProductViewer3D
            preset={p?.model_preset ?? shelf.model_preset}
            glbUrl={p?.model_3d_url ?? shelf.model_3d_url}
            colorName={colour}
            colorMap={colorMap}
            colorOptions={p?.color_options ?? shelf.product_color_options}
            dims={dims}
            specs={{}}
            showHotspots={false}
            className="h-[42vh] min-h-[300px] md:h-[min(68vh,620px)]"
          />
          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 shadow-sm">
            In your hand
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white">
            <MousePointer2 className="h-3 w-3" /> Drag to turn · scroll or pinch to zoom
          </div>
        </div>

        {/* what it is */}
        <div className="flex max-h-[46vh] flex-col overflow-y-auto p-5 md:max-h-[min(68vh,620px)] md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {shelf.department_name}{shelf.aisle_label ? ` · ${shelf.aisle_label}` : ''}
            </div>
            <button onClick={onPutBack} aria-label="Put it back" className="-mr-2 -mt-2 rounded-full p-2 text-slate-500 hover:bg-black/5">
              <X className="h-5 w-5" />
            </button>
          </div>
          <h2 className="mt-1 text-xl font-black leading-tight text-slate-900 md:text-2xl">{clean(p?.name || shelf.product_name)}</h2>
          {p?.brand && <div className="mt-0.5 text-xs text-slate-500">{p.brand}</div>}
          {data && data.reviews > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {data.rating.toFixed(1)} · {data.reviews} review{data.reviews === 1 ? '' : 's'}
            </div>
          )}
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">PKR {Number(unit).toLocaleString()}</span>
            {sale > 0 && sale < regular && <span className="text-sm text-slate-400 line-through">PKR {Number(regular).toLocaleString()}</span>}
          </div>
          {(p?.short_description || shelf.short_description) && (
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{p?.short_description || shelf.short_description}</p>
          )}
          {error && <p className="mt-3 text-sm text-rose-600">The product details could not be loaded. You can still put it back or try again.</p>}

          {colourNames.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-700">Colour{colour ? `: ${colour}` : ''}</div>
              <div className="flex flex-wrap gap-2">
                {colourNames.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColour(c)}
                    aria-label={c}
                    aria-pressed={colour === c}
                    className={`h-8 w-8 rounded-full border-2 ${colour === c ? 'border-slate-900' : 'border-white shadow'}`}
                    style={{ background: resolveColor(c, colorMap) || '#ccc' }}
                  />
                ))}
              </div>
            </div>
          )}
          {sizeNames.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-700">Size</div>
              <div className="flex flex-wrap gap-2">
                {sizeNames.map((sz) => (
                  <button key={sz} onClick={() => setSize(sz)} aria-pressed={size === sz} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${size === sz ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{sz}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-slate-300 bg-white">
              <button aria-label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2.5"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center text-sm font-bold">{qty}</span>
              <button aria-label="One more" onClick={() => setQty((q) => Math.min(Math.max(1, stock), q + 1))} className="p-2.5"><Plus className="h-4 w-4" /></button>
            </div>
            <span className={`text-xs font-semibold ${stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{p ? (stock > 0 ? `${stock} in stock` : 'Out of stock') : ''}</span>
          </div>
          {needsSize && !size && <p className="mt-2 text-xs text-amber-700">Choose a size to add it to your basket.</p>}

          <div className="mt-5 grid gap-2">
            <button
              disabled={!ready}
              onClick={() => {
                const it = forCart();
                if (it) onAdd(it, qty, variantLabel);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#1a1712] px-4 py-3.5 text-sm font-extrabold text-white hover:bg-black disabled:opacity-40"
            >
              <ShoppingBag className="h-4 w-4" /> Put in basket
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!ready}
                onClick={() => {
                  const it = forCart();
                  if (it) onBuyNow(it, qty, variantLabel);
                }}
                className="rounded-2xl bg-[#c8a96a] px-4 py-3 text-sm font-extrabold text-[#1a1712] hover:bg-[#d6b97c] disabled:opacity-40"
              >
                Buy now
              </button>
              <button onClick={onDetails} className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">
                <Info className="h-4 w-4" /> Full details
              </button>
            </div>
            <button onClick={onPutBack} className="flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-black/5">
              <Undo2 className="h-3.5 w-3.5" /> Put it back on the shelf
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
