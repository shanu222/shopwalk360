import React, { useEffect, useRef, useState } from 'react';
import { music } from '../../../lib/music';
import { Play, Maximize, Captions } from 'lucide-react';
import { mediaUrl } from '../../../lib/api';

export type VideoKind = 'file' | 'youtube' | 'vimeo';

export function parseVideo(url?: string | null, declared?: string | null): { kind: VideoKind; id?: string; src: string } | null {
  if (!url) return null;
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt || declared === 'youtube') return yt ? { kind: 'youtube', id: yt[1], src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&playsinline=1&cc_load_policy=1&autoplay=1` } : null;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm || declared === 'vimeo') return vm ? { kind: 'vimeo', id: vm[1], src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&texttrack=en` } : null;
  return { kind: 'file', src: mediaUrl(u) };
}

interface Props {
  url: string;
  type?: string | null;
  poster?: string | null;
  captions?: string | null;
  title: string;
}

/** Product demonstration player: uploaded MP4/WebM (with captions) or privacy-enhanced YouTube / Vimeo embeds */
export const DemoVideo: React.FC<Props> = ({ url, type, poster, captions, title }) => {
  const v = parseVideo(url, type);
  const [started, setStarted] = useState(false);
  useEffect(() => () => music.duck(false), []);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  if (!v) return null;

  const fullscreen = () => {
    const el: any = vid.current || box.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); // iOS Safari
  };

  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {v.kind === 'file' ? (
        <>
          <video
            ref={vid}
            src={v.src}
            poster={poster || undefined}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            onPlay={() => music.duck(true)}
            onPause={() => music.duck(false)}
            onEnded={() => music.duck(false)}
            className="h-full w-full bg-black object-contain"
            aria-label={`Demonstration video: ${title}`}
          >
            {captions && <track kind="captions" src={mediaUrl(captions)} srcLang="en" label="English" default />}
          </video>
          <button onClick={fullscreen} aria-label="Full screen" className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><Maximize className="h-4 w-4" /></button>
          {captions && <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"><Captions className="h-3 w-3" /> Captions available</div>}
        </>
      ) : started ? (
        <iframe
          src={v.src}
          title={`Demonstration video: ${title}`}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button onClick={() => setStarted(true)} className="group absolute inset-0 flex items-center justify-center" aria-label={`Play demonstration video: ${title}`}>
          {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : v.kind === 'youtube' ? <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-xl transition group-hover:scale-105"><Play className="ml-1 h-7 w-7" /></span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white">Plays from {v.kind === 'youtube' ? 'YouTube (privacy-enhanced)' : 'Vimeo'} — loads only when you press play</span>
        </button>
      )}
    </div>
  );
};
