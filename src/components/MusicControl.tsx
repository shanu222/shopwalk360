import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, SkipBack, SkipForward, Music2, Check } from 'lucide-react';
import { music, useMusic } from '../lib/music';

/** Animated equaliser bars shown while music plays */
const Bars: React.FC<{ on: boolean }> = ({ on }) => (
  <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span key={i} className={`w-[3px] rounded-full bg-current ${on ? 'sw-eq' : ''}`} style={{ height: on ? undefined : 4, animationDelay: `${i * 0.18}s` }} />
    ))}
  </span>
);

/** Compact control for the header: turn sound on/off, skip, choose a track. */
export const MusicControl: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const s = useMusic();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    music.load();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  if (!s.tracks.length) return null;
  const current = s.tracks[s.index];
  const on = s.enabled && s.playing;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-2 transition ${dark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
        aria-label="Music"
        title={s.enabled ? `Playing: ${current?.title}` : 'Music is off'}
      >
        {s.enabled ? <Bars on={on} /> : <VolumeX className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-72 overflow-hidden rounded-2xl border border-black/5 bg-[#16130f] text-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c8a96a] text-[#1a1712]"><Music2 className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{current?.title}</p>
              <p className="truncate text-xs text-white/50">{current?.artist || (s.enabled ? (s.playing ? 'Now playing' : 'Starting…') : 'Sound off')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              <button onClick={() => music.prev()} className="rounded-full p-2 hover:bg-white/10" aria-label="Previous track"><SkipBack className="h-4 w-4" /></button>
              <button onClick={() => music.next()} className="rounded-full p-2 hover:bg-white/10" aria-label="Next track"><SkipForward className="h-4 w-4" /></button>
            </div>
            <button
              onClick={() => music.toggle()}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${s.enabled ? 'bg-white/10 hover:bg-white/20' : 'bg-[#c8a96a] text-[#1a1712]'}`}
            >
              {s.enabled ? <><VolumeX className="h-3.5 w-3.5" /> Turn off</> : <><Volume2 className="h-3.5 w-3.5" /> Turn on</>}
            </button>
          </div>
          {s.tracks.length > 1 && (
            <ul className="max-h-56 overflow-y-auto border-t border-white/10 py-1">
              {s.tracks.map((t, i) => (
                <li key={t.id}>
                  <button onClick={() => music.select(i)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 ${i === s.index ? 'text-[#e2c88f]' : 'text-white/80'}`}>
                    <span className="w-4">{i === s.index && <Check className="h-3.5 w-3.5" />}</span>
                    <span className="truncate">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/** Large glass player for the welcome screen */
export const EntranceMusic: React.FC = () => {
  const s = useMusic();
  const [list, setList] = useState(false);
  useEffect(() => {
    music.load();
  }, []);
  if (!s.tracks.length) return null;
  const current = s.tracks[s.index];
  const on = s.enabled && s.playing;
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {list && s.tracks.length > 1 && (
        <ul className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-black/70 p-1 backdrop-blur-xl">
          {s.tracks.map((t, i) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  music.select(i);
                  setList(false);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10 ${i === s.index ? 'text-[#e2c88f]' : 'text-white/80'}`}
              >
                <span className="w-4">{i === s.index && <Check className="h-3.5 w-3.5" />}</span>
                <span className="truncate">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] p-1.5 pl-2 text-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <button
          onClick={() => music.toggle()}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.enabled ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-white/10'}`}
          aria-label={s.enabled ? 'Turn music off' : 'Turn music on'}
        >
          {s.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <button onClick={() => setList((l) => !l)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="Choose a song">
          <span className="text-[#e2c88f]"><Bars on={on} /></span>
          <span className="truncate text-sm">{current?.title}</span>
        </button>
        <button onClick={() => music.prev()} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Previous track"><SkipBack className="h-4 w-4" /></button>
        <button onClick={() => music.next()} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Next track"><SkipForward className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
