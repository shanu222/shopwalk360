import React, { useState } from 'react';
import { Check, Send } from 'lucide-react';

const TOPICS = ['General inquiry', 'Product question', 'Order help', 'Delivery', 'Returns'];

/** Customer message to info@shopwalk360.com. `tone` matches the surrounding surface. */
export const InquiryForm: React.FC<{ tone?: 'dark' | 'light' }> = ({ tone = 'light' }) => {
  const dark = tone === 'dark';
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: TOPICS[0], message: '', website: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    setError('');
    try {
      const r = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setState('error');
        setError(data.error || 'Could not send your message. Please email info@shopwalk360.com.');
        return;
      }
      setState('done');
      setForm({ name: '', email: '', phone: '', topic: TOPICS[0], message: '', website: '' });
    } catch {
      setState('error');
      setError('Could not send your message. Please email info@shopwalk360.com.');
    }
  };

  if (state === 'done') {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border p-5 text-sm ${dark ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        <Check className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Message received. We will reply to your email from info@shopwalk360.com.</p>
      </div>
    );
  }

  const label = dark ? 'text-white/70' : 'text-slate-600';
  const field = dark
    ? 'w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-[#c8a96a] focus:outline-none'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[#b08d4f] focus:outline-none';

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold">
        <span className={label}>Name</span>
        <input required value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className={`mt-1 ${field}`} />
      </label>
      <label className="block text-xs font-semibold">
        <span className={label}>Email</span>
        <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className={`mt-1 ${field}`} />
      </label>
      <label className="block text-xs font-semibold">
        <span className={label}>Phone <span className="font-normal">(optional)</span></span>
        <input value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" className={`mt-1 ${field}`} />
      </label>
      <label className="block text-xs font-semibold">
        <span className={label}>Topic</span>
        <select value={form.topic} onChange={(e) => set('topic', e.target.value)} className={`mt-1 ${field}`}>
          {TOPICS.map((t) => <option key={t} value={t} className="text-slate-900">{t}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold sm:col-span-2">
        <span className={label}>Message</span>
        <textarea required minLength={10} rows={4} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="How can we help?" className={`mt-1 resize-y ${field}`} />
      </label>
      <input tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => set('website', e.target.value)} className="hidden" />
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button disabled={state === 'busy'} className="inline-flex items-center gap-2 rounded-full bg-[#c8a96a] px-5 py-2.5 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c] disabled:opacity-60">
          <Send className="h-4 w-4" /> {state === 'busy' ? 'Sending…' : 'Send message'}
        </button>
        {state === 'error' && <p className={`text-xs ${dark ? 'text-rose-300' : 'text-rose-600'}`}>{error}</p>}
      </div>
    </form>
  );
};
