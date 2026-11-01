import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, CheckCircle2, Clock, Truck, 
  AlertCircle, X, ArrowRight, PackageCheck, DollarSign
} from 'lucide-react';
import { PurchaseOrder, Supplier, Product } from '../../types';

interface AdminProcurementProps {
  suppliers: Supplier[];
  products: Product[];
  onStockUpdated: () => void;
}

export const AdminProcurement: React.FC<AdminProcurementProps> = ({
  suppliers,
  products,
  onStockUpdated,
}) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // New PO Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(suppliers[0]?.id || '');
  const [shippingCost, setShippingCost] = useState<number | ''>(2500);
  const [otherExpenses, setOtherExpenses] = useState<number | ''>(1000);
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>([
    { product_id: products[0]?.id || '', quantity: 20, unit_cost: products[0]?.cost_price || 1500 },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProcurement = () => {
    setLoading(true);
    fetch('/api/admin/procurement')
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProcurement();
  }, []);

  const handleAddItem = () => {
    const firstProd = products[0];
    setPoItems([
      ...poItems,
      { product_id: firstProd?.id || '', quantity: 15, unit_cost: firstProd?.cost_price || 1500 },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setPoItems(poItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    const updated = [...poItems];
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === val);
      updated[idx].product_id = val;
      if (prod) updated[idx].unit_cost = prod.cost_price;
    } else if (field === 'quantity') {
      updated[idx].quantity = Number(val);
    } else if (field === 'unit_cost') {
      updated[idx].unit_cost = Number(val);
    }
    setPoItems(updated);
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedSupplier || !poItems.length) {
      setError('Supplier and at least one line item are required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: selectedSupplier,
          items: poItems,
          shipping_cost: Number(shippingCost || 0),
          other_expenses: Number(otherExpenses || 0),
          notes,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create PO');
      }

      setIsModalOpen(false);
      fetchProcurement();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveStock = async (poId: string, poNum: string) => {
    if (!confirm(`Confirm physical inspection and receipt of all items for ${poNum}? This will immediately update the live inventory ledger.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/procurement/${poId}/receive`, {
        method: 'PUT',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to receive PO');

      fetchProcurement();
      onStockUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Procurement & Purchase Orders (POs)
          </h1>
          <p className="text-xs text-slate-500">
            Issue orders to manufacturers, log landed freight, and receive stock into the inventory ledger
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedSupplier(suppliers[0]?.id || '');
            setShippingCost(2000);
            setOtherExpenses(500);
            setNotes('');
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Create Purchase Order
        </button>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">PO Number</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-right">Items Subtotal</th>
                <th className="px-4 py-3 text-right">Inbound Freight</th>
                <th className="px-4 py-3 text-right">Total Landed Cost</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block font-mono">{po.po_number}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(po.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800 block">{po.supplier_name}</span>
                    <span className="text-[11px] text-slate-500">{po.supplier_phone || ''}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {po.subtotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    PKR {po.shipping_cost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    PKR {po.total_cost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        po.status === 'Received'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {po.status !== 'Received' ? (
                      <button
                        onClick={() => handleReceiveStock(po.id, po.po_number)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto shadow-xs"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        Receive Stock
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> In Inventory
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Purchase Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-900">Issue Purchase Order to Supplier</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="overflow-y-auto flex-1 p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Supplier *
                </label>
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 font-medium"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city}) &middot; {s.payment_terms}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    PO Line Items
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {poItems.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <select
                      value={it.product_id}
                      onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (SKU: {p.sku})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      className="w-20 text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Unit Cost"
                      value={it.unit_cost}
                      onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                      className="w-24 text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                    {poItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Inbound Freight Cost (PKR)
                  </label>
                  <input
                    type="number"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customs / Other Expenses (PKR)
                  </label>
                  <input
                    type="number"
                    value={otherExpenses}
                    onChange={(e) => setOtherExpenses(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Procurement Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inspect batches before dispatch from Lahore Hall Road"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
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
                  {saving ? 'Creating...' : 'Issue PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
