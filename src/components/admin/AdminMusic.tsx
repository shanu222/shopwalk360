import React, { useEffect, useRef, useState } from 'react';
import { Music, Upload, Trash2, Play, Pause, ArrowUp, ArrowDown, Loader2, Eye, EyeOff } from 'lucide-react';
import { mediaUrl } from '../../lib/api';

interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  sort_order: number;
  is_active: boolean;
}

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

/** Admin: background music / ambient sound played for shoppers on the entrance and while shopping */
export const AdminMusic: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const r = await fetch('/api/admin/music');
    const d = await r.json();
    setTracks(d.tracks || []);
    setLoading(false);
  };
  useEffect(() => {
    load().catch(() => setLoading(false));
    return () => audio.current?.pause();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) return setError('Choose an audio file (MP3, M4A, OGG or WAV).');
    if (!title.trim()) return setError('Give the track a title.');
    setBusy(true);
    try {
      const up = await fetch(`/api/admin/uploads?kind=audio&filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      const u = await up.json();
      if (!up.ok) throw new Error(u.error || 'Upload failed');
      const r = await fetch('/api/admin/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist, url: u.url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save the track');
      setTitle('');
      setArtist('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (t: Track, patch: Partial<Track>) => {
    await fetch(`/api/admin/music/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    await load();
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tracks.length) return;
    const a = tracks[i];
    const b = tracks[j];
    await fetch(`/api/admin/music/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: j + 1 }) });
    await fetch(`/api/admin/music/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: i + 1 }) });
    await load();
  };

  const remove = async (t: Track) => {
    if (!window.confirm(`Remove “${t.title}” from the store playlist?`)) return;
    if (playing === t.id) audio.current?.pause();
    await fetch(`/api/admin/music/${t.id}`, { method: 'DELETE' });
    await load();
  };

  const preview = (t: Track) => {
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(mediaUrl(t.url));
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
    audio.current = a;
    setPlaying(t.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Music className="h-5 w-5 text-blue-600" /> Store music</h2>
        <p className="mt-1 text-sm text-slate-600">
          Active tracks play in order on the welcome screen and while customers shop, then repeat. Customers can pick a track, skip, or turn the sound off at any time.
          Only upload music you own or are licensed to play publicly.
        </p>
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Title</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evening lounge" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Artist (optional)</span>
          <input className={input} value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Audio file (MP3, M4A, OGG, WAV · max 40 MB)</span>
          <input
            ref={fileInput}
            type="file"
            accept=".mp3,.m4a,.aac,.ogg,.oga,.wav,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
            }}
            className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold"
          />
        </label>
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Add track
        </button>
        {error && <p className="text-sm text-red-600 md:col-span-4">{error}</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : tracks.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No music yet. Customers will shop in silence until you add a track.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tracks.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button onClick={() => preview(t)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white" aria-label={playing === t.id ? 'Pause preview' : 'Play preview'}>
                  {playing === t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-[10rem] flex-1">
                  <input aria-label="Track title"
                    defaultValue={t.title}
                    onBlur={(e) => e.target.value.trim() !== t.title && update(t, { title: e.target.value })}
                    className="w-full truncate bg-transparent text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                  <p className="text-xs text-slate-500">{t.artist || '—'}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                <span className={`mr-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {t.is_active ? 'Playing in store' : 'Hidden'}
                </span>
                <button onClick={() => update(t, { is_active: !t.is_active })} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title={t.is_active ? 'Hide from store' : 'Show in store'} aria-label={t.is_active ? 'Hide from store' : 'Show in store'}>
                  {t.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30" title="Move up" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === tracks.length - 1} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30" title="Move down" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => remove(t)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Remove" aria-label="Remove track"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminMusic;
