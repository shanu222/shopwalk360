import React, { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { EntranceMusic } from './MusicControl';

interface Props {
  productCount?: number;
  departmentCount?: number;
  onChoose: (mode: '3d' | '2d') => void;
}

/** Card that tilts toward the pointer, with layers floating at different depths */
const TiltCard: React.FC<{ onClick: () => void; label: string; children: React.ReactNode; accent: 'gold' | 'ivory' }> = ({ onClick, label, children, accent }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  return (
    <div className="[perspective:1100px]">
      <button
        ref={ref}
        onClick={onClick}
        onPointerMove={move}
        onPointerLeave={leave}
        aria-label={label}
        className={`sw-tilt group relative block aspect-[16/11] w-full min-[520px]:aspect-[4/5] rounded-[32px] text-left outline-none focus-visible:ring-4 ${
          accent === 'gold' ? 'focus-visible:ring-[#c8a96a]/60' : 'focus-visible:ring-white/50'
        } sm:aspect-[5/6]`}
      >
        {/* thickness: stacked edge layers */}
        <span aria-hidden className="absolute inset-0 rounded-[32px] bg-black/60 [transform:translateZ(-18px)] blur-[2px]" />
        <span aria-hidden className={`absolute inset-0 rounded-[32px] [transform:translateZ(-9px)] ${accent === 'gold' ? 'bg-[#6b5530]' : 'bg-[#5d5a55]'}`} />
        {/* face */}
        <span
          aria-hidden
          className={`absolute inset-0 overflow-hidden rounded-[32px] border ${
            accent === 'gold' ? 'border-[#e2c88f]/50 bg-gradient-to-br from-[#3a301f] via-[#221c14] to-[#120f0b]' : 'border-white/30 bg-gradient-to-br from-[#34322f] via-[#1f1e1c] to-[#0f0f0e]'
          }`}
        >
          <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(circle_at_var(--gx,50%)_var(--gy,30%),rgba(255,236,190,0.22),transparent_55%)]" />
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
        </span>
        <span className="absolute inset-0 flex flex-col items-center justify-between p-5 [transform-style:preserve-3d] sm:p-8">{children}</span>
      </button>
    </div>
  );
};

/** A slowly turning glass cube */
const Cube3D: React.FC = () => (
  <span className="sw-cube-wrap relative block h-16 w-16 [transform:translateZ(60px)] min-[520px]:h-28 min-[520px]:w-28 sm:h-36 sm:w-36">
    <span className="sw-cube absolute inset-0 [transform-style:preserve-3d]">
      {['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'].map((t, i) => (
        <span
          key={i}
          className="absolute inset-0 rounded-2xl border-2 border-[#f3dca6] bg-gradient-to-br from-[#e2c88f]/70 to-[#8a6b35]/60 shadow-[inset_0_0_30px_rgba(255,240,200,0.45)]"
          style={{ transform: `${t} translateZ(calc(var(--cube) / 2))` }}
        />
      ))}
    </span>
  </span>
);

/** Floating stack of product tiles */
const Tiles3D: React.FC = () => (
  <span className="relative block h-16 w-16 [transform:translateZ(60px)] min-[520px]:h-28 min-[520px]:w-28 sm:h-36 sm:w-36">
    <span className="sw-float absolute inset-0 grid grid-cols-2 gap-2.5 [transform:rotateX(52deg)_rotateZ(-38deg)] [transform-style:preserve-3d]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="rounded-xl border border-white/70 bg-gradient-to-br from-white to-[#cfcac0] shadow-[0_14px_0_#6d6860,0_22px_30px_rgba(0,0,0,0.6)]"
          style={{ transform: `translateZ(${(i % 3) * 10}px)` }}
        />
      ))}
    </span>
  </span>
);

/** First screen of the website: choose the 3D store or the 2D online store */
export const StoreEntrance: React.FC<Props> = ({ onChoose }) => (
  <div className="relative min-h-[100dvh] overflow-hidden bg-[#0d0b09] text-white">
    {/* backdrop */}
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="sw-orb absolute -left-32 top-[-10%] h-[520px] w-[520px] rounded-full bg-[#c8a96a]/25 blur-[120px]" />
      <div className="sw-orb absolute -right-40 bottom-[-15%] h-[560px] w-[560px] rounded-full bg-[#7a5a2a]/30 blur-[130px] [animation-delay:-6s]" />
      <div className="absolute inset-x-0 bottom-0 h-[50%] [perspective:500px]">
        <div className="sw-grid absolute inset-[-50%_-50%_0_-50%] origin-bottom [transform:rotateX(65deg)] bg-[linear-gradient(rgba(226,200,143,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(226,200,143,0.22)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_top,black_10%,transparent)]" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.75))]" />
    </div>

    <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-6 px-4 py-8 sm:gap-9">
      <div className="sw-emblem relative h-[150px] w-[150px] select-none sm:h-[200px] sm:w-[200px] md:h-[220px] md:w-[220px]" aria-hidden>
        <span className="sw-emblem-halo absolute -inset-6 rounded-full" />
        <span className="absolute -inset-2 rounded-full bg-[#c8a96a]/25 blur-2xl" />
        <img src="/brand/logo-512.webp" alt="" width={512} height={512} className="sw-emblem-logo relative h-full w-full drop-shadow-[0_18px_40px_rgba(0,0,0,0.7)]" />
        <span className="sw-emblem-shine pointer-events-none absolute inset-0 overflow-hidden rounded-full" />
      </div>

      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">ShopWalk 360</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-base">The official online store at shopwalk360.com. Shop the catalogue, or walk the 3D store with your avatar and buy in the same cart.</p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 min-[520px]:grid-cols-2 sm:gap-8">
        <TiltCard onClick={() => onChoose('3d')} label="Enter the 3D store" accent="gold">
          <span className="pt-2 [transform:translateZ(40px)]">
            <Cube3D />
          </span>
          <span className="flex flex-col items-center gap-3 min-[520px]:gap-5 [transform:translateZ(70px)]">
            <span className="sw-label text-4xl font-black tracking-tight min-[520px]:text-5xl sm:text-6xl">3D</span>
            <span className="sw-btn sw-btn-gold">
              Enter store <ArrowRight className="h-4 w-4" />
            </span>
          </span>
        </TiltCard>

        <TiltCard onClick={() => onChoose('2d')} label="Open the 2D store" accent="ivory">
          <span className="pt-2 [transform:translateZ(40px)]">
            <Tiles3D />
          </span>
          <span className="flex flex-col items-center gap-3 min-[520px]:gap-5 [transform:translateZ(70px)]">
            <span className="sw-label sw-label-ivory text-4xl font-black tracking-tight min-[520px]:text-5xl sm:text-6xl">2D</span>
            <span className="sw-btn sw-btn-ivory">
              Start shopping <ArrowRight className="h-4 w-4" />
            </span>
          </span>
        </TiltCard>
      </div>

      <EntranceMusic />
    </div>
  </div>
);
