import React, { useState, useEffect } from 'react';
import { mediaUrl } from '../../lib/api';
import { 
  Sparkles, Plus, Search, Filter, ArrowRight, Award, 
  CheckCircle2, AlertCircle, X, Sliders, ExternalLink, TrendingUp, DollarSign
} from 'lucide-react';
import { SourcingResearch, Category } from '../../types';

interface AdminSourcingProps {
  categories: Category[];
}

export const AdminSourcing: React.FC<AdminSourcingProps> = ({ categories }) => {
  const [researchList, setResearchList] = useState<SourcingResearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SourcingResearch | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sourceCity, setSourceCity] = useState('Lahore');
  const [sourceCountry, setSourceCountry] = useState('Pakistan');
  const [supplierName, setSupplierName] = useState('');
  const [sampleCost, setSampleCost] = useState<number | ''>('');
  const [wholesaleCost, setWholesaleCost] = useState<number | ''>('');
  const [moq, setMoq] = useState<number | ''>(50);
  const [estShipping, setEstShipping] = useState<number | ''>('');
  const [expectedSelling, setExpectedSelling] = useState<number | ''>('');
  const [competitorPrices, setCompetitorPrices] = useState('');
  const [demand, setDemand] = useState('High');
  const [competition, setCompetition] = useState('Moderate');
  const [qualityAssessment, setQualityAssessment] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('New Idea');
  const [imageUrl, setImageUrl] = useState('');

  // 7-Factor Weighted Scores (0 - 100)
  const [scoreQuality, setScoreQuality] = useState(85);
  const [scoreProfit, setScoreProfit] = useState(85);
  const [scoreDemand, setScoreDemand] = useState(80);
  const [scoreCompetition, setScoreCompetition] = useState(70);
  const [scoreShipping, setScoreShipping] = useState(85);
  const [scoreSupplier, setScoreSupplier] = useState(80);
  const [scoreRepeat, setScoreRepeat] = useState(65);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchResearch = () => {
    setLoading(true);
    fetch('/api/admin/sourcing')
      .then((res) => res.json())
      .then((data) => setResearchList(data.research || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchResearch();
  }, []);

  // Compute live weighted score
  const computedScore = Number((
    (scoreQuality * 0.25) +
    (scoreProfit * 0.20) +
    (scoreDemand * 0.20) +
    (scoreCompetition * 0.10) +
    (scoreShipping * 0.10) +
    (scoreSupplier * 0.10) +
    (scoreRepeat * 0.05)
  ).toFixed(1));

  const openAddModal = () => {
    setEditingItem(null);
    setTitle('');
    setCategoryId(categories[0]?.id || '');
    setSourceCity('Lahore');
    setSourceCountry('Pakistan');
    setSupplierName('');
    setSampleCost('');
    setWholesaleCost('');
    setMoq(50);
    setEstShipping('');
    setExpectedSelling('');
    setCompetitorPrices('');
    setDemand('Medium');
    setCompetition('Moderate');
    setQualityAssessment('');
    setNotes('');
    setStatus('New Idea');
    setImageUrl('');
    setScoreQuality(85);
    setScoreProfit(85);
    setScoreDemand(80);
    setScoreCompetition(70);
    setScoreShipping(85);
    setScoreSupplier(80);
    setScoreRepeat(65);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SourcingResearch) => {
    setEditingItem(item);
    setTitle(item.title);
    setCategoryId(item.category_id || '');
    setSourceCity(item.source_city);
    setSourceCountry(item.source_country);
    setSupplierName(item.supplier_name || '');
    setSampleCost(item.sample_cost);
    setWholesaleCost(item.wholesale_cost);
    setMoq(item.moq);
    setEstShipping(item.est_shipping_cost);
    setExpectedSelling(item.expected_selling_price);
    setCompetitorPrices(item.competitor_prices || '');
    setDemand(item.estimated_demand);
    setCompetition(item.competition_level);
    setQualityAssessment(item.quality_assessment || '');
    setNotes(item.notes || '');
    setStatus(item.status);
    setImageUrl(item.image_url || '');
    setScoreQuality(item.score_quality);
    setScoreProfit(item.score_profit);
    setScoreDemand(item.score_demand);
    setScoreCompetition(item.score_competition);
    setScoreShipping(item.score_shipping);
    setScoreSupplier(item.score_supplier);
    setScoreRepeat(item.score_repeat);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || wholesaleCost === '' || expectedSelling === '') {
      setFormError('Title, Wholesale Cost, and Expected Selling Price are required');
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      category_id: categoryId || null,
      source_city: sourceCity,
      source_country: sourceCountry,
      supplier_name: supplierName,
      sample_cost: Number(sampleCost || 0),
      wholesale_cost: Number(wholesaleCost),
      moq: Number(moq || 50),
      est_shipping_cost: Number(estShipping || 0),
      expected_selling_price: Number(expectedSelling),
      competitor_prices: competitorPrices,
      estimated_demand: demand,
      competition_level: competition,
      quality_assessment: qualityAssessment,
      notes,
      status,
      image_url: imageUrl,
      score_quality: scoreQuality,
      score_profit: scoreProfit,
      score_demand: scoreDemand,
      score_competition: scoreCompetition,
      score_shipping: scoreShipping,
      score_supplier: scoreSupplier,
      score_repeat: scoreRepeat,
    };

    try {
      const url = editingItem ? `/api/admin/sourcing/${editingItem.id}` : '/api/admin/sourcing';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save research item');
      }

      setIsModalOpen(false);
      fetchResearch();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // One-Click Promote to Live Catalog
  const handlePromoteToStore = async (id: string, name: string) => {
    if (!confirm(`Launch "${name}" directly to the live customer store catalog with an initial 25-unit batch?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/sourcing/${id}/promote-to-store`, {
        method: 'POST',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to promote');

      setActionSuccess(`"${name}" successfully launched to live store catalogue!`);
      fetchResearch();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const allStatuses = [
    'New Idea',
    'Under Research',
    'Supplier Contacted',
    'Sample Ordered',
    'Sample Received',
    'Quality Approved',
    'Ready to Purchase',
    'Added to Store',
    'Rejected',
  ];

  const filteredResearch = researchList.filter((r) => {
    return statusFilter === 'all' || r.status === statusFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Product Research & Sourcing Pipeline
          </h1>
          <p className="text-xs text-slate-500">
            7-factor algorithmic evaluation: Quality (25%), Profit (20%), Demand (20%), Competition (10%), Shipping (10%), Supplier (10%), Repeat (5%)
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Add Research Candidate
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Stages ({researchList.length})
        </button>
        {allStatuses.map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
              statusFilter === st
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {st} ({researchList.filter((r) => r.status === st).length})
          </button>
        ))}
      </div>

      {/* Sourcing Candidate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredResearch.map((item) => {
          const estimatedSpread = item.expected_selling_price - (item.wholesale_cost + item.est_shipping_cost);
          const spreadPercent = Math.round((estimatedSpread / item.expected_selling_price) * 100);

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div>
                {/* Status Badge & Score */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      item.status === 'Added to Store'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'Ready to Purchase'
                        ? 'bg-blue-100 text-blue-800'
                        : item.status === 'Rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.status}
                  </span>

                  <div className="flex items-center gap-1.5 bg-slate-900 text-white px-2.5 py-1 rounded-xl text-xs font-black shadow-xs">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>{item.total_score} / 100</span>
                  </div>
                </div>

                {/* Candidate Image & Title */}
                <div className="flex items-start gap-3 mb-3">
                  {item.image_url ? (
                    <img src={mediaUrl(item.image_url)} alt="" className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0" />
                  ) : (
                    <div className="flex w-16 h-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-semibold text-slate-400">No photo</div>
                  )}
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">
                      {item.title}
                    </h3>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Source: {item.source_city}, {item.source_country}
                    </span>
                  </div>
                </div>

                {/* Unit Cost vs Expected Retail */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 my-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Wholesale Unit:</span>
                    <span className="font-bold text-slate-900">
                      PKR {item.wholesale_cost.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inbound Shipping:</span>
                    <span className="text-slate-800">PKR {item.est_shipping_cost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Target Selling Price:</span>
                    <span className="font-bold text-blue-700">
                      PKR {item.expected_selling_price.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200 pt-1.5">
                    <span>Gross Unit Spread:</span>
                    <span>+PKR {estimatedSpread.toLocaleString()} ({spreadPercent}%)</span>
                  </div>
                </div>

                {/* Demand & Competition Metrics */}
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Demand</span>
                    <span className="font-semibold text-slate-800">{item.estimated_demand}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Competition</span>
                    <span className="font-semibold text-slate-800">{item.competition_level}</span>
                  </div>
                </div>

                {item.quality_assessment && (
                  <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                    "{item.quality_assessment}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => openEditModal(item)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition"
                >
                  Adjust Scores &rarr;
                </button>

                {item.status !== 'Added to Store' ? (
                  <button
                    onClick={() => handlePromoteToStore(item.id, item.title)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    title="Promote directly to live customer store"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Launch to Store
                  </button>
                ) : (
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Live in Store
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Sourcing Candidate Modal with 7-Factor Sliders */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">
                  {editingItem ? 'Edit Sourcing Evaluation' : 'New Sourcing Candidate Assessment'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Basic Candidate Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  1. Sourcing Specifications
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ultrasonic Contact Lens Cleaner"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Source City *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lahore / Sialkot / Shenzhen"
                      value={sourceCity}
                      onChange={(e) => setSourceCity(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supplier / Factory Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Al-Haram Electronics"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Wholesale Cost per Unit (PKR) *
                    </label>
                    <input
                      type="number"
                      required
                      value={wholesaleCost}
                      onChange={(e) => setWholesaleCost(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expected Retail Selling Price (PKR) *
                    </label>
                    <input
                      type="number"
                      required
                      value={expectedSelling}
                      onChange={(e) => setExpectedSelling(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden font-bold text-blue-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Min Order Qty (MOQ)
                    </label>
                    <input
                      type="number"
                      value={moq}
                      onChange={(e) => setMoq(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Est. Inbound Shipping per Unit (PKR)
                    </label>
                    <input
                      type="number"
                      value={estShipping}
                      onChange={(e) => setEstShipping(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sourcing Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden font-semibold"
                    >
                      {allStatuses.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 7-Factor Weighted Scoring Sliders */}
              <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      2. Sourcing Evaluation Scoring Engine
                    </h3>
                  </div>
                  <div className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Total Score: {computedScore} / 100</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Product Quality (25% weight)</span>
                      <span className="font-bold text-blue-700">{scoreQuality}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreQuality}
                      onChange={(e) => setScoreQuality(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Profit Potential (20% weight)</span>
                      <span className="font-bold text-blue-700">{scoreProfit}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreProfit}
                      onChange={(e) => setScoreProfit(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Customer Demand (20% weight)</span>
                      <span className="font-bold text-blue-700">{scoreDemand}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreDemand}
                      onChange={(e) => setScoreDemand(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Competition Ease (10% weight)</span>
                      <span className="font-bold text-blue-700">{scoreCompetition}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreCompetition}
                      onChange={(e) => setScoreCompetition(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Shipping & Storage (10% weight)</span>
                      <span className="font-bold text-blue-700">{scoreShipping}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreShipping}
                      onChange={(e) => setScoreShipping(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Supplier Reliability (10% weight)</span>
                      <span className="font-bold text-blue-700">{scoreSupplier}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreSupplier}
                      onChange={(e) => setScoreSupplier(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Repeat Potential (5% weight)</span>
                      <span className="font-bold text-blue-700">{scoreRepeat}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scoreRepeat}
                      onChange={(e) => setScoreRepeat(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition"
                >
                  {saving ? 'Saving...' : 'Save Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
