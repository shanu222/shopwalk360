import React, { useMemo, useState } from 'react';
import { MessageCircle, Send, Loader2, BookOpen, Sparkles } from 'lucide-react';
import { Product } from '../../../types';
import { parseDims } from '../builder/productModels';

interface Answer {
  text: string;
  sources: string[];
  found: boolean;
}

const QUESTIONS = [
  'What is this product used for?',
  'How does it work?',
  'What are its main features?',
  'What is included?',
  'What are its dimensions?',
  'How do I use it?',
  'What makes it different?',
] as const;

const NOT_LISTED = 'The product listing does not include that information yet.';

function sentences(text?: string) {
  return (text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Answers built ONLY from the product record. Nothing is generated or assumed. */
export function groundedAnswer(q: string, p: Product, specs: Record<string, string>): Answer {
  const specEntries = Object.entries(specs);
  const findSpecs = (re: RegExp) => specEntries.filter(([k]) => re.test(k));
  const lines = (t?: string) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const ql = q.toLowerCase();

  if (ql.includes('used for')) {
    const t = p.short_description || sentences(p.description)[0];
    return t ? { text: t, sources: ['Product description'], found: true } : { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('how does it work')) {
    const how = sentences(p.description).filter((s) => /work|power|charg|deliver|detect|sensor|magnet|spring|swivel|pressure|heat|ultrason|quartz|cushion|absorb|shield|block|compress/i.test(s));
    if (p.usage_instructions) how.unshift(p.usage_instructions.split('\n')[0]);
    return how.length ? { text: how.slice(0, 3).join(' '), sources: p.usage_instructions ? ['Usage instructions', 'Product description'] : ['Product description'], found: true } : { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('features')) {
    const f = lines(p.features);
    if (f.length) return { text: f.map((x) => `• ${x}`).join('\n'), sources: ['Features'], found: true };
    if (specEntries.length) return { text: specEntries.slice(0, 6).map(([k, v]) => `• ${k}: ${v}`).join('\n'), sources: ['Specifications'], found: true };
    return { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('included') || ql.includes('in the box')) {
    const box = lines(p.in_the_box);
    if (box.length) return { text: box.map((x) => `• ${x}`).join('\n'), sources: ['In the box'], found: true };
    const s = findSpecs(/includ|in the box|attachment|cable|set pieces|package/i);
    if (s.length) return { text: s.map(([k, v]) => `• ${k}: ${v}`).join('\n'), sources: s.map(([k]) => `Specification › ${k}`), found: true };
    return { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('dimension') || ql.includes('size')) {
    const d = parseDims(p.dimensions_json);
    const s = findSpecs(/dimension|size|diameter|thickness|capacity|volume|weight|width|height|length/i);
    const parts: string[] = [];
    const src: string[] = [];
    if (d) {
      parts.push(`Width ${d.w} cm × Height ${d.h} cm × Depth ${d.d} cm`);
      src.push('Product dimensions');
    }
    s.forEach(([k, v]) => {
      parts.push(`${k}: ${v}`);
      src.push(`Specification › ${k}`);
    });
    if (p.weight_kg) {
      parts.push(`Weight: ${p.weight_kg} kg`);
      src.push('Product weight');
    }
    if (p.size_options) {
      parts.push(`Available sizes: ${p.size_options}`);
      src.push('Size options');
    }
    return parts.length ? { text: parts.join('\n'), sources: src, found: true } : { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('how do i use')) {
    const u = lines(p.usage_instructions);
    const care = lines(p.care_instructions);
    if (u.length || care.length) {
      return {
        text: [...u.map((x) => `• ${x}`), ...(care.length ? ['Care:', ...care.map((x) => `• ${x}`)] : [])].join('\n'),
        sources: [u.length ? 'Usage instructions' : '', care.length ? 'Care instructions' : ''].filter(Boolean),
        found: true,
      };
    }
    return { text: NOT_LISTED, sources: [], found: false };
  }
  if (ql.includes('different')) {
    const f = lines(p.features);
    const d = sentences(p.description).slice(1, 3);
    if (f.length || d.length) return { text: [...d, ...f.slice(0, 3).map((x) => `• ${x}`)].join('\n'), sources: [d.length ? 'Product description' : '', f.length ? 'Features' : ''].filter(Boolean), found: true };
    return { text: NOT_LISTED, sources: [], found: false };
  }
  // free text: keyword match against specification names and description sentences
  const words = ql.split(/\W+/).filter((w) => w.length > 3);
  const specHits = specEntries.filter(([k, v]) => words.some((w) => k.toLowerCase().includes(w) || v.toLowerCase().includes(w)));
  const descHits = sentences(p.description).filter((s) => words.some((w) => s.toLowerCase().includes(w)));
  if (specHits.length || descHits.length) {
    return {
      text: [...specHits.map(([k, v]) => `• ${k}: ${v}`), ...descHits.slice(0, 2)].join('\n'),
      sources: [...specHits.map(([k]) => `Specification › ${k}`), ...(descHits.length ? ['Product description'] : [])],
      found: true,
    };
  }
  return { text: NOT_LISTED, sources: [], found: false };
}

export const InfoAssistant: React.FC<{ product: Product; specs: Record<string, string>; aiAvailable: boolean }> = ({ product, specs, aiAvailable }) => {
  const [chat, setChat] = useState<{ q: string; a: Answer & { ai?: boolean } }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const asked = useMemo(() => new Set(chat.map((c) => c.q)), [chat]);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setInput('');
    if (useAi && aiAvailable) {
      setBusy(true);
      try {
        const r = await fetch('/api/assistant/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, question: q }) });
        const d = await r.json();
        if (r.ok) {
          setChat((c) => [...c, { q, a: { text: d.answer, sources: ['AI answer constrained to this product’s listing'], found: true, ai: true } }]);
          return;
        }
      } catch {
        /* fall back */
      } finally {
        setBusy(false);
      }
    }
    setChat((c) => [...c, { q, a: groundedAnswer(q, product, specs) }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <BookOpen className="h-5 w-5 shrink-0 text-slate-500" />
        <div>
          Answers come only from this product’s listing — its description, specifications, dimensions and instructions. If something isn’t in the listing, the assistant says so instead of guessing.
          {aiAvailable && (
            <label className="mt-2 flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="accent-slate-800" />
              <Sparkles className="h-3.5 w-3.5" /> Use the AI assistant (still limited to the listing)
            </label>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.filter((q) => !asked.has(q)).map((q) => (
          <button key={q} onClick={() => ask(q)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400">{q}</button>
        ))}
      </div>
      <div className="space-y-3" aria-live="polite">
        {chat.map((c, i) => (
          <div key={i} className="space-y-1.5">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-xs text-white">{c.q}</div>
            <div className={`w-fit max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs leading-relaxed ${c.a.found ? 'bg-slate-100 text-slate-800' : 'bg-amber-50 text-amber-900'}`}>
              {c.a.text}
              {c.a.sources.length > 0 && <div className="mt-1.5 text-[10px] text-slate-500">Source: {c.a.sources.join(' · ')}</div>}
            </div>
          </div>
        ))}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <div className="relative flex-1">
          <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={300} placeholder="Ask about this product…" aria-label="Ask about this product" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-slate-500 focus:outline-none" />
        </div>
        <button type="submit" aria-label="Ask" className="rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-700"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
};
