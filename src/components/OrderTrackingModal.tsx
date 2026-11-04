import React, { useState } from 'react';
import { X, Search, Package, CheckCircle2, Clock, Truck, MapPin, AlertCircle, ExternalLink } from 'lucide-react';
import { Order, OrderItem } from '../types';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  initialOrderNumber = '',
}) => {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [allStatuses, setAllStatuses] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;

    setLoading(true);
    setError(null);
    setOrder(null);

    try {
      const query = new URLSearchParams({
        order_number: orderNumber.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });

      const res = await fetch(`/api/orders/track?${query.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Unable to locate order. Please check the order number.');
      } else {
        setOrder(data.order);
        setItems(data.items || []);
        setAllStatuses(data.allStatuses || []);
      }
    } catch (err: any) {
      setError('Network communication error while tracking.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIndex = (currentStatus: string) => {
    return allStatuses.indexOf(currentStatus);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f3ead6] text-[#8a6a2f] flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Track Consignment</h2>
              <p className="text-xs text-slate-500">Live order milestone & courier tracking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Tracking Search Input Form */}
          <form onSubmit={handleTrack} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SW-20261028-1001"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  className="w-full text-xs uppercase px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#c8a96a] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 03219876543"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#c8a96a] focus:outline-hidden"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !orderNumber.trim()}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-[#2c271f] disabled:bg-slate-300 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2"
            >
              {loading ? 'Searching consignment records...' : 'Track Order Progress'}
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tracking Result View */}
          {order && (
            <div className="space-y-6 animate-fade-in">
              {/* Order Banner */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 block">Consignment Number</span>
                  <span className="text-base font-black tracking-wide">{order.order_number}</span>
                  <span className="text-xs text-slate-300 block mt-0.5">
                    Recipient: {order.customer_name} ({order.city})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-[#1a1712] text-white block mb-1">
                    {order.status}
                  </span>
                  <span className="text-xs text-slate-300 font-semibold block">
                    PKR {order.total_amount.toLocaleString()} ({order.payment_method})
                  </span>
                </div>
              </div>

              {/* Courier Partner & Waybill */}
              <div className="p-4 rounded-xl bg-[#faf6ec] border border-[#eadfc4] flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Logistics Partner</span>
                  <span className="font-bold text-slate-900">{order.courier_partner || 'TCS Express'}</span>
                </div>
                {order.tracking_number ? (
                  <div className="text-right">
                    <span className="text-slate-500 block text-[11px]">Courier Tracking ID</span>
                    <span className="font-mono font-bold text-[#8a6a2f] bg-white px-2 py-0.5 rounded border border-[#eadfc4]">
                      {order.tracking_number}
                    </span>
                  </div>
                ) : (
                  <span className="text-amber-700 font-medium">Tracking number being assigned</span>
                )}
              </div>

              {/* Milestone Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                  Fulfillment Timeline
                </h4>
                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {allStatuses.map((st, idx) => {
                    const currentIdx = getStatusIndex(order.status);
                    const isPassed = currentIdx >= idx;
                    const isCurrent = currentIdx === idx;

                    return (
                      <div key={st} className="relative flex items-start gap-3">
                        <div
                          className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] transition-colors ${
                            isCurrent
                              ? 'bg-[#1a1712] ring-4 ring-[#e2c88f] font-bold'
                              : isPassed
                              ? 'bg-emerald-600'
                              : 'bg-slate-300'
                          }`}
                        >
                          {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                        </div>
                        <div className="flex-1">
                          <span
                            className={`text-xs block font-semibold ${
                              isCurrent ? 'text-[#8a6a2f] font-bold' : isPassed ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {st}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {isCurrent
                              ? 'Currently active status. Next update will reflect in dispatch log.'
                              : isPassed
                              ? 'Milestone completed.'
                              : 'Pending previous milestone.'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Items in Consignment */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Consignment Contents ({items.length} items)
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {items.map((it) => (
                    <div key={it.id} className="p-3 bg-white flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800 block">{it.product_name}</span>
                        <span className="text-[11px] text-slate-500">SKU: {it.sku} &middot; Qty: {it.quantity}</span>
                      </div>
                      <span className="font-bold text-slate-900">PKR {it.total_price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
