import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Phone, MessageSquare, MapPin, Star, 
  Scale, CheckCircle2, AlertCircle, X, ExternalLink, ChevronRight
} from 'lucide-react';
import { Supplier, Product } from '../../types';

interface AdminSuppliersProps {
  products: Product[];
}

export const AdminSuppliers: React.FC<AdminSuppliersProps> = ({ products }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Supplier Add Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('+92 ');
  const [whatsapp, setWhatsapp] = useState('+92 ');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Lahore');
  const [country, setCountry] = useState('Pakistan');
  const [address, setAddress] = useState('');
  const [supplierType, setSupplierType] = useState('Wholesaler');
  const [terms, setTerms] = useState('30% Advance, 70% Upon Dispatch');
  const [policy, setPolicy] = useState('14-Day Defect Replacement Guarantee');
  const [relRating, setRelRating] = useState(4.8);
  const [qualRating, setQualRating] = useState(4.7);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Comparison Tool State
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const fetchSuppliers = () => {
    setLoading(true);
    fetch('/api/admin/suppliers')
      .then((res) => res.json())
      .then((data) => setSuppliers(data.suppliers || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleOpenComparison = (prodId?: string) => {
    const id = prodId || products[0]?.id;
    if (!id) return;
    setSelectedProductId(id);
    setComparisonModalOpen(true);
    loadComparison(id);
  };

  const loadComparison = (prodId: string) => {
    setLoadingComparison(true);
    fetch(`/api/admin/suppliers/comparison/${prodId}`)
      .then((res) => res.json())
      .then((data) => setComparisonData(data))
      .catch((err) => console.error(err))
      .finally(() => setLoadingComparison(false));
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name || !businessName || !contactPerson || !phone || !city) {
      setFormError('Name, Business Name, Contact Person, Phone, and City are required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          business_name: businessName,
          contact_person: contactPerson,
          phone,
          whatsapp,
          email,
          city,
          country,
          address,
          supplier_type: supplierType,
          payment_terms: terms,
          return_policy: policy,
          reliability_rating: relRating,
          quality_rating: qualRating,
          notes,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save supplier');
      }

      setIsAddModalOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Wholesale Supplier Network & Comparison
          </h1>
          <p className="text-xs text-slate-500">
            Certified manufacturers, wholesale market importers, and multi-supplier price comparison
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenComparison()}
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
          >
            <Scale className="w-4 h-4" />
            Compare Suppliers Tool
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Register Supplier
          </button>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 block">{s.code}</span>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">{s.name}</h3>
                  <span className="text-xs text-slate-500 block">{s.business_name}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                  {s.supplier_type}
                </span>
              </div>

              {/* Location & Contact */}
              <div className="space-y-1.5 text-xs text-slate-600 my-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{s.city}, {s.country}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{s.contact_person} &middot; {s.phone}</span>
                </div>
                {s.whatsapp && (
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>WhatsApp: {s.whatsapp}</span>
                  </div>
                )}
              </div>

              {/* Quality & Reliability Scores */}
              <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Quality Rating</span>
                  <div className="flex items-center gap-1 font-bold text-slate-900">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{s.quality_rating} / 5.0</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Reliability</span>
                  <div className="flex items-center gap-1 font-bold text-slate-900">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{s.reliability_rating} / 5.0</span>
                  </div>
                </div>
              </div>

              {/* Terms & Policy */}
              <div className="text-[11px] text-slate-500 space-y-1 border-t border-slate-100 pt-2.5">
                <div>
                  <strong className="text-slate-700">Terms:</strong> {s.payment_terms}
                </div>
                <div>
                  <strong className="text-slate-700">Warranty:</strong> {s.return_policy}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {s.supplied_products_count || 1} Products Cataloged
              </span>
              <a
                href={`https://wa.me/${(s.whatsapp || s.phone).replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold"
              >
                Chat on WhatsApp &rarr;
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Supplier Comparison Modal */}
      {comparisonModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Supplier Multi-Quotation Comparison Engine
                  </h2>
                  <p className="text-xs text-slate-500">
                    Compare wholesale unit prices, MOQs, transit costs, and select the preferred procurement partner
                  </p>
                </div>
              </div>
              <button
                onClick={() => setComparisonModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Product Selector */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Select Product:
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    loadComparison(e.target.value);
                  }}
                  className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (SKU: {p.sku})
                    </option>
                  ))}
                </select>
              </div>

              {loadingComparison ? (
                <div className="p-12 text-center text-xs text-slate-500">Loading quotes...</div>
              ) : comparisonData?.comparison?.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
                  No linked supplier quotes found for this product yet. Add suppliers or quotes below.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {comparisonData?.comparison?.map((quote: any) => (
                      <div
                        key={quote.id}
                        className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                          quote.is_preferred === 1
                            ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-100 shadow-sm'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div>
                          {quote.is_preferred === 1 && (
                            <span className="absolute top-3 right-3 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Preferred Supplier
                            </span>
                          )}

                          <h4 className="font-bold text-sm text-slate-900 pr-16">{quote.supplier_name}</h4>
                          <span className="text-xs text-slate-500 block mb-3">
                            {quote.city}, {quote.country}
                          </span>

                          <div className="space-y-2 text-xs border-t border-slate-100 pt-2.5">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Wholesale Unit Price:</span>
                              <span className="font-bold text-slate-900">
                                PKR {quote.wholesale_price.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Est. Freight per Unit:</span>
                              <span className="text-slate-800">
                                PKR {quote.shipping_cost_estimate || 0}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Min. Order Qty (MOQ):</span>
                              <span className="font-bold text-slate-900">{quote.moq} units</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Lead Time:</span>
                              <span className="text-slate-800">{quote.lead_time_days} days</span>
                            </div>
                            <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200 pt-2">
                              <span>Total Landed Unit Cost:</span>
                              <span>PKR {quote.estimated_landed_unit_cost.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-slate-500">
                            ⭐ Quality {quote.quality_rating} &middot; Rel {quote.reliability_rating}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Register Supplier Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-900">Register New Wholesale Supplier</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="overflow-y-auto flex-1 p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier / Trade Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Haram Electronics & Imports"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Haram Trading Corporation"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Person Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haji Muhammad Rizwan"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+92 300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp (for Quotations)
                  </label>
                  <input
                    type="tel"
                    placeholder="+92 300 1234567"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Wholesale Hub / City *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Lahore / Karachi / Sialkot / Shenzhen"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Classification
                  </label>
                  <select
                    value={supplierType}
                    onChange={(e) => setSupplierType(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Wholesaler">Wholesaler</option>
                    <option value="Direct Importer">Direct Importer</option>
                    <option value="Artisan Cooperative">Artisan Cooperative</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Physical Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Shop 42, Madina Market, Hall Road, Lahore"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition"
                >
                  {saving ? 'Registering...' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
