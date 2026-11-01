import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, Building2, Truck, Shield, Sparkles } from 'lucide-react';

interface AdminSettingsProps {
  initialSettings: Record<string, string>;
  onSettingsUpdated: (newSettings: Record<string, string>) => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  initialSettings,
  onSettingsUpdated,
}) => {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (res.ok) {
        setSuccess(true);
        onSettingsUpdated(settings);
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Storefront & Logistics Configuration
          </h1>
          <p className="text-xs text-slate-500">
            Control business branding, Pakistani shipping thresholds, Meezan Bank details, and sourcing weights
          </p>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Website settings updated successfully! Storefront reflecting changes.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* 1. Brand & Contact Information */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-blue-700 font-bold uppercase tracking-wider text-[11px] pb-2 border-b border-slate-100">
            <Sparkles className="w-4 h-4" />
            1. Brand & Contact Identity
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Store Brand Name</label>
              <input
                type="text"
                value={settings.store_name || ''}
                onChange={(e) => handleChange('store_name', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Brand Tagline</label>
              <input
                type="text"
                value={settings.store_tagline || ''}
                onChange={(e) => handleChange('store_tagline', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Support Phone</label>
              <input
                type="text"
                value={settings.contact_phone || ''}
                onChange={(e) => handleChange('contact_phone', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Support WhatsApp</label>
              <input
                type="text"
                value={settings.contact_whatsapp || ''}
                onChange={(e) => handleChange('contact_whatsapp', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Business address
              </label>
              <input
                type="text"
                value={settings.office_address || ''}
                onChange={(e) => handleChange('office_address', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Support email</label>
              <input type="email" value={settings.contact_email || ''} onChange={(e) => handleChange('contact_email', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">About us (shown on the About page)</label>
              <textarea rows={3} value={settings.about_text || ''} onChange={(e) => handleChange('about_text', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Returns policy (shown in FAQs)</label>
              <textarea rows={3} value={settings.returns_policy || ''} onChange={(e) => handleChange('returns_policy', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl" />
            </div>
          </div>
        </div>

        {/* 2. Pakistani Logistics & Free Shipping Thresholds */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 font-bold uppercase tracking-wider text-[11px] pb-2 border-b border-slate-100">
            <Truck className="w-4 h-4" />
            2. Delivery & Logistics Configuration
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nationwide Free Delivery Threshold (PKR)
              </label>
              <input
                type="number"
                value={settings.free_delivery_threshold || '3500'}
                onChange={(e) => handleChange('free_delivery_threshold', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-emerald-700"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Lahore Local Delivery Rate (PKR)
              </label>
              <input
                type="number"
                value={settings.standard_shipping_rate ? '180' : '180'}
                onChange={(e) => handleChange('standard_shipping_rate', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nationwide Standard Courier Rate (PKR)
              </label>
              <input
                type="number"
                value={settings.standard_shipping_rate || '220'}
                onChange={(e) => handleChange('standard_shipping_rate', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* 3. Direct Bank Transfer Bank Details */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-purple-700 font-bold uppercase tracking-wider text-[11px] pb-2 border-b border-slate-100">
            <Building2 className="w-4 h-4" />
            3. Corporate Bank Account Details (for Customer Bank Transfer)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bank Name & Branch</label>
              <input
                type="text"
                value={settings.bank_name || ''}
                onChange={(e) => handleChange('bank_name', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Title</label>
              <input
                type="text"
                value={settings.bank_title || ''}
                onChange={(e) => handleChange('bank_title', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Number</label>
              <input
                type="text"
                value={settings.bank_account || ''}
                onChange={(e) => handleChange('bank_account', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">IBAN Number</label>
              <input
                type="text"
                value={settings.bank_iban || ''}
                onChange={(e) => handleChange('bank_iban', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono uppercase"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving Settings...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
};
