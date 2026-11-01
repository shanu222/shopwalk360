import React from 'react';
import { Box, LayoutGrid, ArrowRight, Sparkles, Shirt, Map, ShoppingBag } from 'lucide-react';
import { BrandMark } from './Navbar';

interface Props {
  productCount: number;
  departmentCount: number;
  onChoose: (mode: '3d' | '2d') => void;
}

/** First screen of the website: choose the walk-in 3D store or the online store */
export const StoreEntrance: React.FC<Props> = ({ productCount, departmentCount, onChoose }) => (
  <div className="relative min-h-[100dvh] overflow-hidden bg-[#14120f] text-white">
    {/* architectural backdrop: a lit galleria in perspective */}
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(200,169,106,0.22),transparent_60%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] [perspective:600px]">
        <div className="absolute inset-0 origin-bottom [transform:rotateX(62deg)] bg-[linear-gradient(rgba(200,169,106,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(200,169,106,0.18)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:linear-gradient(to_top,black,transparent)]" />
      </div>
      <div className="absolute left-1/2 top-[18%] h-[46%] w-[min(70vw,760px)] -translate-x-1/2 rounded-t-[40px] border border-[#c8a96a]/25 bg-gradient-to-b from-[#c8a96a]/10 to-transparent" />
      <div className="absolute left-1/2 top-[18%] h-[46%] w-px -translate-x-1/2 bg-gradient-to-b from-[#c8a96a]/40 to-transparent" />
    </div>

    <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 py-8 sm:px-8">
      <BrandMark light />
      <div className="flex flex-1 flex-col justify-center py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#e2c88f]">Welcome to ShopWalk 360</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Explore. Experience. <span className="text-[#c8a96a]">Discover.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
          How would you like to shop today? Both stores have the same products, prices and basket — switch at any time.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <button onClick={() => onChoose('3d')} className="group relative overflow-hidden rounded-3xl border border-[#c8a96a]/40 bg-gradient-to-br from-[#2a241b] to-[#16130f] p-7 text-left shadow-2xl transition hover:border-[#c8a96a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#c8a96a]/15 blur-2xl transition group-hover:bg-[#c8a96a]/25" />
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c8a96a] text-[#1a1712]"><Box className="h-6 w-6" /></span>
              <span className="rounded-full bg-[#c8a96a]/15 px-3 py-1 text-[11px] font-semibold text-[#e2c88f]">Immersive</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold">Walk into the 3D store</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Create your avatar, walk through {departmentCount || 'our'} departments, see products up close and try them on before you buy.</p>
            <ul className="mt-5 flex flex-wrap gap-2 text-[11px] text-white/70">
              <li className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1"><Sparkles className="h-3 w-3" /> Your own avatar</li>
              <li className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1"><Shirt className="h-3 w-3" /> Virtual try-on</li>
              <li className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1"><Map className="h-3 w-3" /> Guided navigation</li>
            </ul>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#e2c88f]">Enter the store <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
          </button>

          <button onClick={() => onChoose('2d')} className="group relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.04] p-7 text-left shadow-2xl transition hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#1a1712]"><LayoutGrid className="h-6 w-6" /></span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">Quick & light</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold">Shop the online store</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Browse {productCount ? `all ${productCount} products` : 'the full catalogue'} by category, search and filter, and check out in a few taps. Works on any device.</p>
            <ul className="mt-5 flex flex-wrap gap-2 text-[11px] text-white/70">
              <li className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1"><ShoppingBag className="h-3 w-3" /> Fast checkout</li>
              <li className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1"><LayoutGrid className="h-3 w-3" /> Filters & search</li>
            </ul>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold">Start shopping <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
          </button>
        </div>
      </div>
      <p className="text-xs text-white/40">The 3D store needs a modern browser with 3D graphics. If your device can’t run it, you’ll be taken to the online store.</p>
    </div>
  </div>
);
