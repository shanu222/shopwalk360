import React, { useState, useEffect } from 'react';
import { Tag, Plus, CheckCircle2, Clock, X, AlertCircle } from 'lucide-react';

export const AdminCoupons: React.FC = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>(10);
  const [minOrder, setMinOrder] = useState<number | ''>(2000);
  const [maxDiscount, setMaxDiscount] = useState<number | ''>(1000);
  const [usageLimit, setUsageLimit] = useState<number | ''>(200);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCoupons = () => {
    setLoading(true);
    fetch('/api/admin/coupons')
      .then((res) => res.json())
      .then((d) => setCoupons(d.coupons || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || discountValue === '') return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: Number(discountValue),
          min_order_value: Number(minOrder || 0),
          max_discount: maxDiscount !== '' ? Number(maxDiscount) : null,
          usage_limit: Number(usageLimit || 100),
          expires_at: expiresAt || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create coupon');
      }

      setIsModalOpen(false);
      setCode('');
      fetchCoupons();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Promotions & Coupon Discounts
          </h1>
          <p className="text-xs text-slate-500">
            Create percentage or fixed PKR promotional codes with minimum order thresholds
          </p>
        </div>
        <button
          onClick={() => {
            setCode('');
            setDiscountValue(10);
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {coupons.map((c) => (
          <div
            key={c.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-base text-slate-900 bg-slate-100 px-3 py-1 rounded-xl tracking-wider">
                {c.code}
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Active
              </span>
            </div>

            <div className="text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Discount Offer:</span>
                <span className="font-bold text-blue-700">
                  {c.discount_type === 'percentage'
                    ? `${c.discount_value}% Off`
                    : `PKR ${c.discount_value.toLocaleString()} Off`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Min Order Value:</span>
                <span className="font-semibold text-slate-800">
                  PKR {c.min_order_value.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Times Redeemed:</span>
                <span className="font-semibold text-slate-800">{c.times_used} uses</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Create Promotional Coupon</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WELCOME15"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full text-xs uppercase px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (PKR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Order Value (PKR)
                </label>
                <input
                  type="number"
                  value={minOrder}
                  onChange={(e) => setMinOrder(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg font-bold"
                >
                  {saving ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
