import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface InformationalPagesProps {
  page: 'about' | 'faq';
  onBackToShop: () => void;
  storeSettings: Record<string, string>;
}

/**
 * About & FAQ. Business-specific facts (delivery fees, returns, contact details) come from the store
 * settings the admin enters — nothing here is invented.
 */
export const InformationalPages: React.FC<InformationalPagesProps> = ({ page, onBackToShop, storeSettings: s }) => {
  const threshold = Number(s.free_delivery_threshold || 0);
  const rate = Number(s.standard_shipping_rate || 0);
  const faqs: { q: string; a: React.ReactNode }[] = [
    { q: 'What is the difference between the 3D store and the online store?', a: 'They are the same shop. The 3D store lets you walk through departments with your avatar, see products in 3D and try some of them on; the online store is a fast catalogue. Products, prices, stock and your basket are shared.' },
    { q: 'Do I need to upload a photo to use the 3D store?', a: 'No. You can choose a ready-made avatar. If you do use a photo, it is processed in your browser to estimate colours and is not stored.' },
    { q: 'Is virtual try-on accurate for size and fit?', a: 'No. Try-on previews show colour and style on an avatar. Please use the size information in each product’s specifications.' },
    {
      q: 'How much is delivery?',
      a: rate || threshold
        ? `${rate ? `Standard delivery is PKR ${rate.toLocaleString()}.` : ''} ${threshold ? `Orders above PKR ${threshold.toLocaleString()} qualify for free delivery.` : ''} The exact charge is shown at checkout before you confirm.`
        : 'The delivery charge is shown at checkout before you confirm your order.',
    },
    { q: 'How do I pay?', a: `Cash on delivery${s.bank_iban || s.bank_account ? ' or bank transfer (details are shown after you place the order)' : ''}.` },
    { q: 'How can I track my order?', a: 'Use “Track order” with your order number and phone number. You will see each status update the store makes.' },
    { q: 'What is the returns policy?', a: s.returns_policy || 'Each product page shows its warranty / returns terms. Contact us with your order number for help with a return.' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <button onClick={onBackToShop} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to the store
      </button>
      {page === 'about' ? (
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b08d4f]">About us</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">ShopWalk 360</h1>
          <p className="text-base leading-relaxed text-slate-600">{s.about_text || 'ShopWalk 360 brings the feeling of visiting a real store to online shopping. Walk through our 3D store with your own avatar, look at products from every angle, try clothing and accessories on, and check out in the same basket as our online store.'}</p>
          {(s.contact_email || s.contact_phone || s.office_address) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
              <div className="mb-2 font-bold text-slate-900">Contact</div>
              {s.contact_phone && <div>Phone: {s.contact_phone}</div>}
              {s.contact_whatsapp && <div>WhatsApp: {s.contact_whatsapp}</div>}
              {s.contact_email && <div>Email: {s.contact_email}</div>}
              {s.office_address && <div>Address: {s.office_address}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b08d4f]">Help</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Delivery, returns & FAQs</h1>
          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
