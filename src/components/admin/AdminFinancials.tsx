import React, { useState, useEffect } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, 
  Plus, Receipt, PieChart, ShieldAlert, CheckCircle2, X
} from 'lucide-react';
import { ProfitabilityRow } from '../../types';

export const AdminFinancials: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Expense Modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [category, setCategory] = useState('Marketing');
  const [amount, setAmount] = useState<number | ''>(5000);
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingExpense, setSavingExpense] = useState(false);

  const fetchFinancials = () => {
    setLoading(true);
    fetch('/api/admin/financials')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFinancials();
  }, []);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    setSavingExpense(true);
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount: Number(amount),
          description,
          date: expenseDate,
        }),
      });

      if (res.ok) {
        setExpenseModalOpen(false);
        setDescription('');
        fetchFinancials();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingExpense(false);
    }
  };

  if (loading && !data) {
    return <div className="p-12 text-center text-xs text-slate-500">Loading financial statements...</div>;
  }

  const summary = data?.summary || {};
  const matrix: ProfitabilityRow[] = data?.profitabilityMatrix || [];
  const expenses = data?.expenses || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Financial Management & Landed Profitability
          </h1>
          <p className="text-xs text-slate-500">
            Rigorous three-tier financial reporting: Gross Profit, Product Contribution Margin, and Net Profit
          </p>
        </div>
        <button
          onClick={() => setExpenseModalOpen(true)}
          className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Record Operating Expense
        </button>
      </div>

      {/* 3-Tier Financial Hierarchy Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Tier 1: Gross Profit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Tier 1: Gross Profit
            </span>
            <span className="text-xs font-bold text-slate-700">{summary.grossMarginPercent}% Margin</span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {Number(summary.grossProfit || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            Revenue (PKR {Number(summary.totalRevenue || 0).toLocaleString()}) &minus; COGS (PKR {Number(summary.totalCOGS || 0).toLocaleString()})
          </div>
        </div>

        {/* Tier 2: Operating Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Recorded Operating Expenses
            </span>
            <span className="text-xs font-semibold text-slate-500">{expenses.length} Entries</span>
          </div>
          <div className="text-2xl font-black text-rose-600">
            PKR {Number(summary.totalExpenses || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            Packaging boxes, Meta marketing, warehouse rent, logistics buffers
          </div>
        </div>

        {/* Tier 3: Real Net Profit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Tier 3: Actual Net Profit
            </span>
            <span className="text-xs font-bold text-emerald-700">{summary.netMarginPercent}% Net</span>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            PKR {Number(summary.netProfit || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            Gross Profit &minus; Actual recorded operational expenditures
          </div>
        </div>
      </div>

      {/* Product-Level Landed Cost & Contribution Margin Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Unit Landed Cost Breakdown & Contribution Margin Matrix
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Landed Cost = Supplier Purchase + Inbound Freight + Packaging | Contribution Profit = Selling Price &minus; Landed Cost &minus; Payment Fee &minus; Courier Subsidy
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">SKU & Item</th>
                <th className="px-4 py-3 text-right">Wholesale Cost</th>
                <th className="px-4 py-3 text-right">Inbound Freight</th>
                <th className="px-4 py-3 text-right">Packaging Box</th>
                <th className="px-4 py-3 text-right">Total Landed Cost</th>
                <th className="px-4 py-3 text-right">Retail Selling</th>
                <th className="px-4 py-3 text-right">Unit Contribution</th>
                <th className="px-4 py-3 text-right">Contribution %</th>
                <th className="px-4 py-3 text-right">Units Sold</th>
                <th className="px-4 py-3 text-right">Total Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block">{row.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">SKU: {row.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {row.supplierCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {row.inboundShipping}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {row.packagingCost}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                    PKR {row.totalLandedCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                    PKR {row.sellingPrice.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                    +PKR {row.contributionProfit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">
                    {row.contributionMarginPercent}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {row.unitsSold}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                    PKR {row.totalGeneratedContribution.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operational Expenses Log */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Operational Expenses Ledger ({expenses.length})
          </h3>
          <span className="text-xs font-bold text-rose-600">
            Total: PKR {Number(summary.totalExpenses || 0).toLocaleString()}
          </span>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {expenses.map((exp: any) => (
            <div key={exp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
              <div>
                <span className="font-bold text-slate-900 block">{exp.description}</span>
                <span className="text-[11px] text-slate-500">
                  Category: <strong className="text-slate-700">{exp.category}</strong> &middot; Date: {exp.date}
                </span>
              </div>
              <span className="font-mono font-bold text-rose-600">
                -PKR {exp.amount.toLocaleString()}
              </span>
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-xs">No operating expenses recorded yet.</div>
          )}
        </div>
      </div>

      {/* Record Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Record Operational Expense</h3>
              <button
                onClick={() => setExpenseModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expense Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium"
                >
                  <option value="Packaging">Packaging (Boxes, Poly Mailers, Bubble Wrap)</option>
                  <option value="Marketing">Marketing & Digital Ads (Meta, Google)</option>
                  <option value="Warehouse Rent">Warehouse & Hub Rent</option>
                  <option value="Utilities">Utilities & Dispatch Electricity</option>
                  <option value="Courier Return Buffer">Courier Freight Return Losses</option>
                  <option value="Software & Tools">Software, Domains & Tooling</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount in PKR *
                </label>
                <input
                  type="number"
                  required
                  placeholder="5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500 branded shipping boxes manufactured in Lahore"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg font-bold"
                >
                  {savingExpense ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
