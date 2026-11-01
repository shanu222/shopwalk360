import React, { useState } from 'react';
import { Phone, Mail, MapPin, MessageCircle, ArrowRight, Check } from 'lucide-react';
import { Category } from '../types';
import { BrandMark } from './Navbar';

interface FooterProps {
  categories: Category[];
  onSelectCategory: (slug: string) => void;
  onOpenPage: (page: 'about' | 'faq') => void;
  onOpenTracking: () => void;
  onOpen3D: () => void;
  storeSettings: Record<string, string>;
}

export const Footer: React.FC<FooterProps> = ({ categories, onSelectCategory, onOpenPage, onOpenTracking, onOpen3D, storeSettings }) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const s = storeSettings;

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    setState('busy');
    try {
      const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setState(r.ok ? 'done' : 'error');
      if (r.ok) setEmail('');
    } catch {
      setState('error');
    }
  };

  const linkCls = 'text-sm text-white/60 transition hover:text-white';
  const contacts = [
    s.contact_phone && { icon: Phone, text: s.contact_phone, href: `tel:${s.contact_phone.replace(/\s/g, '')}` },
    s.contact_whatsapp && { icon: MessageCircle, text: `WhatsApp ${s.contact_whatsapp}`, href: `https://wa.me/${s.contact_whatsapp.replace(/\D/g, '')}` },
    s.contact_email && { icon: Mail, text: s.contact_email, href: `mailto:${s.contact_email}` },
    s.office_address && { icon: MapPin, text: s.office_address },
  ].filter(Boolean) as { icon: React.ElementType; text: string; href?: string }[];

  return (
    <footer className="bg-[#14120f] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:px-8">
        <div className="space-y-4">
          <BrandMark light />
          <p className="max-w-xs text-sm leading-relaxed text-white/60">{s.store_tagline || 'Explore. Experience. Discover.'} Shop online, or walk through our 3D store and try products on your own avatar.</p>
          <button onClick={onOpen3D} className="inline-flex items-center gap-2 rounded-full border border-[#c8a96a]/50 px-4 py-2 text-xs font-semibold text-[#e2c88f] hover:bg-[#c8a96a]/10">Enter the 3D store <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#c8a96a]">Shop</h3>
          <ul className="space-y-2.5">
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}><button onClick={() => onSelectCategory(c.slug)} className={linkCls}>{c.name}</button></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#c8a96a]">Help</h3>
          <ul className="space-y-2.5">
            <li><button onClick={onOpenTracking} className={linkCls}>Track your order</button></li>
            <li><button onClick={() => onOpenPage('faq')} className={linkCls}>Delivery, returns & FAQs</button></li>
            <li><button onClick={() => onOpenPage('about')} className={linkCls}>About us</button></li>
          </ul>
          {contacts.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {contacts.map((c) => (
                <li key={c.text} className="flex items-start gap-2 text-sm text-white/60">
                  <c.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#c8a96a]" />
                  {c.href ? <a href={c.href} className="hover:text-white">{c.text}</a> : <span>{c.text}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#c8a96a]">New arrivals by email</h3>
          <p className="mb-4 text-sm text-white/60">Hear about new products and store events. Unsubscribe any time.</p>
          {state === 'done' ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300"><Check className="h-4 w-4" /> You’re subscribed.</div>
          ) : (
            <form onSubmit={subscribe} className="flex gap-2">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 focus:border-[#c8a96a] focus:outline-none" />
              <button disabled={state === 'busy'} className="rounded-full bg-[#c8a96a] px-4 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c]">Join</button>
            </form>
          )}
          {state === 'error' && <p className="mt-2 text-xs text-rose-300">Couldn’t subscribe right now. Please try again.</p>}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} ShopWalk 360. All rights reserved.</span>
          <span>Prices in PKR · Secure checkout</span>
        </div>
      </div>
    </footer>
  );
};
