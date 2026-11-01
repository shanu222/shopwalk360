import React, { useState, useEffect } from 'react';
import { 
  Package, TrendingDown, TrendingUp, SlidersHorizontal, 
  RotateCcw, AlertTriangle, CheckCircle2, History, X
} from 'lucide-react';

export const AdminInventory: React.FC = () => {
  const [stockList, setStockList] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);
  const [movementType, setMovementType] = useState('Manual Adjustment');
  const [reason, setReason] = useState('Physical count reconciliation');
  const [adjusting, setAdjusting] = useState(false);

  const fetchInventory = () => {
    setLoading(true);
    fetch('/api/admin/inventory')
      .then((res) => res.json())
      .then((data) => {
        setStockList(data.stockList || []);
        setMovements(data.recentMovements || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || adjustmentQty === 0) return;

    setAdjusting(true);
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          adjustment_qty: Number(adjustmentQty),
          movement_type: movementType,
          reason,
        }),
      });
      if (res.ok) {
        setAdjustModalOpen(false);
        fetchInventory();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdjusting(false);
    }
  };

  const totalCostValuation = stockList.reduce((acc, p) => acc + (p.total_cost_value || 0), 0);
  const totalRetailValuation = stockList.reduce((acc, p) => acc + (p.total_retail_value || 0), 0);
  const totalUnits = stockList.reduce((acc, p) => acc + (p.stock_quantity || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Inventory Ledger & Stock Movement Audit
          </h1>
          <p className="text-xs text-slate-500">
            Real physical inventory counts, valuation ledger, write-offs, and automated reservation audit trail
          </p>
        </div>
      </div>

      {/* Valuation Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Total Units in Warehouse
          </span>
          <span className="text-2xl font-black text-slate-900">{totalUnits} Units</span>
          <span className="text-xs text-slate-500 block mt-1">Ready for dispatch</span>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Total Inventory Cost Value
          </span>
          <span className="text-2xl font-black text-slate-900">
            PKR {totalCostValuation.toLocaleString()}
          </span>
          <span className="text-xs text-slate-500 block mt-1">Based on supplier purchase costs</span>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Potential Retail Realization
          </span>
          <span className="text-2xl font-black text-emerald-600">
            PKR {totalRetailValuation.toLocaleString()}
          </span>
          <span className="text-xs text-emerald-700 block mt-1">
            +PKR {(totalRetailValuation - totalCostValuation).toLocaleString()} gross unrealized profit
          </span>
        </div>
      </div>

      {/* Stock Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Live SKU Stock Levels ({stockList.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">SKU & Item</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Available Qty</th>
                <th className="px-4 py-3 text-right">Wholesale Cost</th>
                <th className="px-4 py-3 text-right">Cost Value</th>
                <th className="px-4 py-3 text-right">Sold To Date</th>
                <th className="px-4 py-3 text-right">Stock Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockList.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block">{p.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">SKU: {p.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.category_name}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full font-bold ${
                        p.stock_quantity <= p.low_stock_threshold
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {p.stock_quantity} units
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {p.cost_price.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    PKR {p.total_cost_value.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {p.total_units_sold} units
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setSelectedProduct(p);
                        setAdjustmentQty(0);
                        setReason('Stock count adjustment');
                        setAdjustModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                    >
                      Adjust Qty
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Movement Audit Log */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Automated Inventory Movement Audit Trail
          </h3>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {movements.map((m) => (
            <div key={m.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
              <div>
                <span className="font-semibold text-slate-900">{m.product_name}</span>
                <span className="text-[11px] text-slate-500 block">
                  {m.movement_type} &middot; {m.reason || 'System logged'}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={`font-mono font-bold block ${
                    m.change_qty > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {m.change_qty > 0 ? `+${m.change_qty}` : m.change_qty} units
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {movements.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-xs">
              No stock movements recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Adjust Modal */}
      {adjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Adjust Stock for {selectedProduct.name}
              </h3>
              <button
                onClick={() => setAdjustModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity Change (+ to add, - to write off)
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. +10 or -2"
                  value={adjustmentQty}
                  onChange={(e) => setAdjustmentQty(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Movement Category
                </label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                >
                  <option value="Manual Adjustment">Manual Audit Adjustment</option>
                  <option value="Damage Write-off">Damage Write-off</option>
                  <option value="Returned Restock">Returned Restock</option>
                  <option value="Purchase Receive">Direct Purchase Receive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Reason / Notes
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting || adjustmentQty === 0}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg font-bold"
                >
                  {adjusting ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
