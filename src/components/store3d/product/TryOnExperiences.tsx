import React, { useRef, useState } from 'react';
import { Camera, Upload, Info, Footprints, Shirt, Columns, Trash2, Loader2 } from 'lucide-react';
import { AvatarConfig, Product, TryOnOverride, WearableSlot } from '../../../types';
import { AvatarPreview, AvatarPreviewHandle, PreviewFocus } from '../avatar/AvatarPreview';
import { applyTryOns } from '../avatar/tryOn';
import { ProductViewer3D } from './ProductViewer3D';
import { parseDims } from '../builder/productModels';
import { photoToJpegBase64 } from '../avatar/avatarService';

export interface ColourOpt {
  name: string;
  hex: string | null;
}

interface Common {
  product: Product;
  avatar: AvatarConfig;
  colours: ColourOpt[];
  colour: string;
  setColour: (c: string) => void;
  size?: string;
  slot: WearableSlot;
  colorMap: Record<string, string>;
  specs: Record<string, string>;
  onWearInStore: (o: TryOnOverride) => void;
  wearing: boolean;
}

export const Disclaimer: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2 rounded-xl bg-slate-100 p-3 text-[11px] leading-relaxed text-slate-600">
    <Info className="h-4 w-4 shrink-0 text-slate-500" />
    <span>{children || 'Simulated preview on your avatar. It shows colour and style only — it is not a fit guarantee and does not reproduce your exact body or appearance.'}</span>
  </div>
);

function ColourPicker({ colours, colour, setColour }: { colours: ColourOpt[]; colour: string; setColour: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {colours.map((c) => (
        <button key={c.name} role="radio" aria-checked={colour === c.name} onClick={() => setColour(c.name)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${colour === c.name ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
          {c.hex && <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />}
          {c.name}
        </button>
      ))}
    </div>
  );
}

function WearButton({ wearing, onClick }: { wearing: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold ${wearing ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
      <Shirt className="h-4 w-4" /> {wearing ? 'Wearing it in the store ✓ (update)' : 'Wear it while I walk around the store'}
    </button>
  );
}

const override = (p: Product, slot: WearableSlot, colour: ColourOpt | undefined, size?: string): TryOnOverride => ({
  productId: p.id,
  productName: p.name,
  slot,
  colorName: colour?.name || '',
  colorHex: colour?.hex || '#6b7078',
  size,
  price: p.discount_price || p.regular_price,
});

/* ---------------------------------------------------------------- clothing & bags */
export const FashionTryOn: React.FC<Common & { photoTryOnAvailable: boolean }> = (props) => {
  const { product, avatar, colours, colour, setColour, size, slot, colorMap, onWearInStore, wearing, photoTryOnAvailable } = props;
  const prev = useRef<AvatarPreviewHandle>(null);
  const [looks, setLooks] = useState<{ img: string; label: string }[]>([]);
  const cur = colours.find((c) => c.name === colour) || colours[0];
  const cfg = applyTryOns(avatar, [override(product, slot, cur, size)], colorMap);
  const focus: PreviewFocus = slot === 'top' ? 'upper' : 'full';

  return (
    <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
      <div className="space-y-2">
        <AvatarPreview ref={prev} config={cfg} focus={focus} className="h-[380px] rounded-2xl sm:h-[440px]" label="Your avatar · virtual fitting" />
        <div className="flex flex-wrap gap-2">
          {(['front', 'side', 'back'] as const).map((a) => (
            <button key={a} onClick={() => prev.current?.setAngle(a)} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold capitalize hover:bg-slate-50">{a} view</button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Colour</div>
          {cur?.hex ? <ColourPicker colours={colours} colour={colour} setColour={setColour} /> : <div className="text-xs text-amber-700">Colour swatches haven’t been configured for this product, so the preview colour is approximate.</div>}
        </div>
        {size && <div className="text-xs text-slate-600">Selected size: <b>{size}</b>. The avatar isn’t a body scan, so size doesn’t change the preview — please check the size guide in the specifications.</div>}
        <WearButton wearing={wearing} onClick={() => onWearInStore(override(product, slot, cur, size))} />
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Columns className="h-4 w-4" /> Compare outfits</div>
            <button
              onClick={() => {
                const img = prev.current?.snapshot();
                if (img) setLooks((l) => [...l.slice(-2), { img, label: `${colour}${size ? ` · ${size}` : ''}` }]);
              }}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white"
            >
              Save this look
            </button>
          </div>
          {looks.length ? (
            <div className="grid grid-cols-3 gap-2">
              {looks.map((l, i) => (
                <figure key={i} className="relative">
                  <img src={l.img} alt={`Saved look ${l.label}`} className="aspect-[3/4] w-full rounded-lg object-cover" />
                  <figcaption className="mt-1 truncate text-[10px] text-slate-600">{l.label}</figcaption>
                  <button onClick={() => setLooks((x) => x.filter((_, k) => k !== i))} aria-label="Remove look" className="absolute right-1 top-1 rounded-full bg-white/90 p-1"><Trash2 className="h-3 w-3" /></button>
                </figure>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">Save up to three looks (different colours or items) to compare side by side. Looks are kept only on this screen.</div>
          )}
        </div>
        {(slot === 'top' || slot === 'bottom') && <PhotoTryOn product={product} colour={colour} available={photoTryOnAvailable} />}
        <Disclaimer />
      </div>
    </div>
  );
};

/** Photo-based garment try-on through an external AI service (only when the store has connected one) */
const PhotoTryOn: React.FC<{ product: Product; colour: string; available: boolean }> = ({ product, colour, available }) => {
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!available) {
    return (
      <div className="flex gap-2 rounded-2xl border border-dashed border-slate-300 p-3 text-[11px] leading-relaxed text-slate-600">
        <Camera className="h-4 w-4 shrink-0" />
        <span><b>Try it on my photo</b> needs an AI virtual try-on service, which this store hasn’t connected yet. The avatar preview above is available now.</span>
      </div>
    );
  }
  const run = async () => {
    if (!photo) return;
    setBusy(true);
    setErr(null);
    try {
      const image = await photoToJpegBase64(photo);
      const r = await fetch('/api/tryon/garment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, productId: product.id, colour, consent: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Try-on failed');
      setResult(d.image.startsWith('http') ? d.image : `data:image/png;base64,${d.image}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (photo.startsWith('blob:')) URL.revokeObjectURL(photo);
      setPhoto(null);
    }
  };
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 p-3 text-xs">
      <div className="font-semibold text-slate-800">Try it on my photo (AI-generated)</div>
      <label className="flex items-start gap-2 text-[11px] text-slate-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-slate-900" />
        I agree to send my photo once to the store’s try-on service to generate this image. It isn’t stored by the store or used for training.
      </label>
      <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 ${consent ? 'cursor-pointer border-slate-300 hover:bg-slate-50' : 'cursor-not-allowed opacity-40'}`}>
        <Upload className="h-4 w-4" /> {photo ? 'Photo ready' : 'Choose a full-length photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!consent} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)); }} />
      </label>
      {photo && <button onClick={run} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 font-bold text-white">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Generate preview</button>}
      {err && <div className="text-rose-600">{err}</div>}
      {result && (
        <figure>
          <img src={result} alt="AI-generated try-on preview" className="w-full rounded-xl" />
          <figcaption className="mt-1 text-[10px] text-slate-500">AI-generated simulation — not a photograph and not a fit guarantee.</figcaption>
        </figure>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- watches & eyewear */
export const AccessoryTryOn: React.FC<Common> = (props) => {
  const { product, avatar, colours, colour, setColour, slot, colorMap, specs, onWearInStore, wearing } = props;
  const cur = colours.find((c) => c.name === colour) || colours[0];
  const cfg = applyTryOns(avatar, [override(product, slot, cur)], colorMap);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ProductViewer3D preset={product.model_preset} glbUrl={product.model_3d_url} colorName={colour} colorMap={colorMap} colorOptions={product.color_options} dims={parseDims(product.dimensions_json)} specs={specs} className="h-[300px] sm:h-[340px]" />
        <AvatarPreview config={cfg} focus={slot === 'watch' ? 'wrist' : 'face'} className="h-[300px] rounded-2xl sm:h-[340px]" label={slot === 'watch' ? 'On your avatar’s wrist' : 'On your avatar'} />
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{slot === 'watch' ? 'Case / strap' : 'Frame colour'}</div>
        <ColourPicker colours={colours} colour={colour} setColour={setColour} />
      </div>
      <WearButton wearing={wearing} onClick={() => onWearInStore(override(product, slot, cur))} />
      <Disclaimer>
        {slot === 'watch'
          ? 'Watch preview on your avatar’s wrist. Proportions are approximate. Camera-based wrist AR is not available yet (it needs a hand-tracking integration).'
          : 'Eyewear preview on your avatar. Fit and lens tint are approximate. Camera-based face AR is not available yet.'}
      </Disclaimer>
    </div>
  );
};

/* ---------------------------------------------------------------- footwear */
export const FootwearTryOn: React.FC<Common> = (props) => {
  const { product, avatar, colours, colour, setColour, size, colorMap, specs, onWearInStore, wearing } = props;
  const cur = colours.find((c) => c.name === colour) || colours[0];
  const cfg = applyTryOns(avatar, [override(product, 'shoes', cur, size)], colorMap);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ProductViewer3D preset={product.model_preset} glbUrl={product.model_3d_url} colorName={colour} colorMap={colorMap} colorOptions={product.color_options} dims={parseDims(product.dimensions_json)} specs={specs} className="h-[300px] sm:h-[340px]" />
        <AvatarPreview config={cfg} focus="feet" className="h-[300px] rounded-2xl sm:h-[340px]" label="On your avatar" />
      </div>
      <ColourPicker colours={colours} colour={colour} setColour={setColour} />
      <WearButton wearing={wearing} onClick={() => onWearInStore(override(product, 'shoes', cur, size))} />
      <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
        <Footprints className="h-4 w-4 shrink-0" />
        <span>We don’t predict your size — there is no validated sizing system connected. Please use the brand’s size guide. AR foot placement isn’t available yet (it needs a foot-tracking integration).</span>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- beauty */
export const BeautyTryOn: React.FC<Common> = (props) => {
  const { product, avatar, colours, colour, setColour, colorMap, onWearInStore, wearing } = props;
  const cur = colours.find((c) => c.name === colour) || colours[0];
  const cfg = applyTryOns(avatar, [override(product, 'lips', cur)], colorMap);
  const shadesConfigured = colours.some((c) => c.hex);
  if (!shadesConfigured) {
    return <Disclaimer>Shade colours haven’t been configured for this product, so a virtual shade preview isn’t offered (it could show the wrong colour).</Disclaimer>;
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <AvatarPreview config={cfg} focus="face" className="h-[340px] rounded-2xl" label="Shade on your avatar" />
      <div className="space-y-4">
        <ColourPicker colours={colours} colour={colour} setColour={setColour} />
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Swatches on your avatar’s skin tone</div>
          <div className="flex h-16 overflow-hidden rounded-xl" style={{ backgroundColor: avatar.skinTone }}>
            {colours.filter((c) => c.hex).map((c) => (
              <div key={c.name} className="flex flex-1 items-center justify-center">
                <div className="h-6 w-14 rounded-full opacity-90" style={{ backgroundColor: c.hex! }} title={c.name} />
              </div>
            ))}
          </div>
        </div>
        <WearButton wearing={wearing} onClick={() => onWearInStore(override(product, 'lips', cur))} />
        {product.ingredients && <div className="text-xs text-slate-600"><b>Ingredients:</b> {product.ingredients}</div>}
        {product.usage_instructions && <div className="text-xs text-slate-600"><b>How to use:</b> {product.usage_instructions}</div>}
        <Disclaimer>Colour preview only. Shades look different on screens and on real skin. Camera make-up try-on isn’t available yet (it needs a face-landmark integration).</Disclaimer>
      </div>
    </div>
  );
};

