import React from 'react';
import { ArrowRight, Sparkles, Trash2, User, Pencil, Store } from 'lucide-react';
import { AvatarConfig } from '../../types';

interface Props {
  ready: boolean;
  progress: number;
  progressLabel: string;
  saved: { config: AvatarConfig; where: 'account' | 'device' } | null;
  onCreate: () => void;
  onGuest: () => void;
  onContinueSaved: () => void;
  onEditSaved: () => void;
  onDeleteSaved: () => void;
  onClassic: () => void;
}

/** Overlay shown on the plaza in front of the glass doors */
export const EntranceGate: React.FC<Props> = ({ ready, progress, progressLabel, saved, onCreate, onGuest, onContinueSaved, onEditSaved, onDeleteSaved, onClassic }) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4 sm:justify-center sm:bg-gradient-to-r sm:from-black/75 sm:via-black/35 sm:to-transparent sm:p-10">
      <div className="pointer-events-auto w-full max-w-md text-white">
        <img src="/brand/logo-128.webp" alt="" width={72} height={72} className="mb-4 h-[72px] w-[72px] rounded-full shadow-[0_10px_28px_rgba(200,169,106,0.4)]" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#e2c88f]">Welcome to</div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">ShopWalk 360</h1>
        <p className="mt-3 text-base font-medium text-white/85 sm:text-lg">Step Inside. Your Shopping Journey Begins Here.</p>

        {!ready ? (
          <div className="mt-8 space-y-2" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#c8a96a] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="text-xs text-white/60">{progressLabel || 'Preparing the store…'}</div>
          </div>
        ) : saved ? (
          <div className="mt-7 space-y-3 rounded-3xl border border-white/15 bg-black/45 p-5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              {saved.config.portrait ? (
                <img src={saved.config.portrait} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-[#c8a96a]" />
              ) : (
                <div className="flex -space-x-1.5">
                  {[saved.config.skinTone, saved.config.hairColor, saved.config.outfitColor].map((c, i) => (
                    <span key={i} className="h-7 w-7 rounded-full border-2 border-black/60" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
              <div>
                <div className="text-lg font-bold">Welcome back</div>
                <div className="text-sm text-white/70">{saved.config.portrait ? 'Continue with your photo face' : 'Continue with your virtual self'}</div>
              </div>
            </div>
            <button onClick={onContinueSaved} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8a96a] py-3.5 text-sm font-extrabold tracking-[0.1em] text-[#1a1712] hover:bg-[#d6b97c]">
              CONTINUE <ArrowRight className="h-4 w-4" />
            </button>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button onClick={onEditSaved} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/15"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              <button onClick={onGuest} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/15"><User className="h-3.5 w-3.5" /> Guest</button>
              <button onClick={onDeleteSaved} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 font-semibold text-rose-200 hover:bg-white/15"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            </div>
            <div className="text-[11px] text-white/45">
              {saved.config.portrait
                ? 'Saved on this device, including your photo face.'
                : `Saved ${saved.where === 'account' ? 'to your account' : 'on this device'} · colours and clothing.`}
            </div>
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            <button onClick={onCreate} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#c8a96a] py-4 text-sm font-extrabold tracking-[0.14em] text-[#1a1712] shadow-xl shadow-black/30 hover:bg-[#d6b97c]">
              <Sparkles className="h-4 w-4" /> CREATE MY VIRTUAL SELF
            </button>
            <button onClick={onGuest} className="w-full rounded-2xl border border-white/25 bg-black/30 py-3 text-sm font-semibold backdrop-blur hover:bg-black/50">Continue as a guest</button>
          </div>
        )}
        <button onClick={onClassic} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-white/60 underline-offset-4 hover:text-white hover:underline">
          <Store className="h-3.5 w-3.5" /> Prefer a regular online store? Shop the classic catalogue
        </button>
      </div>
    </div>
  );
};
