import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Filter, Printer, Truck, Download, 
  CheckCircle2, Clock, Eye, AlertCircle, X, Check, RotateCcw
} from 'lucide-react';
import { Order, OrderItem } from '../../types';

export const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Order Details / Status Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Status Update state
  const [newStatus, setNewStatus] = useState('');
  const [courierPartner, setCourierPartner] = useState('TCS Express');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchOrders = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (searchTerm.trim()) params.append('search', searchTerm.trim());

    fetch(`/api/admin/orders?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const openOrderDetail = async (ord: Order) => {
    setSelectedOrder(ord);
    setNewStatus(ord.status);
    setCourierPartner(ord.courier_partner || 'TCS Express');
    setTrackingNumber(ord.tracking_number || '');
    setIsDetailOpen(true);

    try {
      const res = await fetch(`/api/admin/orders/${ord.id}`);
      const data = await res.json();
      setOrderItems(data.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          courier_partner: courierPartner,
          tracking_number: trackingNumber.trim() || null,
        }),
      });

      if (res.ok) {
        setIsDetailOpen(false);
        fetchOrders();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const allStatuses = [
    'Order Placed',
    'Confirmed',
    'Processing',
    'Packed',
    'Dispatched',
    'In Transit',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
    'Return Requested',
    'Refunded',
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Order Fulfillment & Logistics Dispatch
          </h1>
          <p className="text-xs text-slate-500">
            Process incoming orders, assign Pakistani courier tracking numbers (TCS/Trax/Call Courier), and print invoices
          </p>
        </div>
        <a
          href="/api/admin/export/orders"
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
        >
          <Download className="w-3.5 h-3.5" />
          Export Orders CSV
        </a>
      </div>

      {/* Filter / Search Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchOrders();
          }}
          className="relative w-full sm:w-80"
        >
          <input
            type="text"
            placeholder="Search order number, phone, customer, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-hidden"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium"
          >
            <option value="all">All Order Statuses ({orders.length})</option>
            {allStatuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Order & Date</th>
                <th className="px-4 py-3 text-left">Customer & Phone</th>
                <th className="px-4 py-3 text-left">City & Delivery</th>
                <th className="px-4 py-3 text-right">Total Amount</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block font-mono">{ord.order_number}</span>
                    <span className="text-[10px] text-slate-400">
                      {ord.created_at ? new Date(ord.created_at).toLocaleDateString() : 'Recent'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900 block">{ord.customer_name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{ord.customer_phone}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800 block">{ord.city}</span>
                    <span className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">
                      {ord.shipping_address}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    PKR {ord.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800 block">{ord.payment_method}</span>
                    <span className="text-[10px] text-slate-500">{ord.payment_status}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ord.status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : ord.status === 'In Transit' || ord.status === 'Dispatched'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : ord.status === 'Cancelled'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openOrderDetail(ord)}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg transition"
                    >
                      Process & Waybill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Fulfillment & Courier Waybill Modal */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Manage Order #{selectedOrder.order_number}
                </h2>
                <p className="text-xs text-slate-500">
                  Recipient: {selectedOrder.customer_name} &middot; {selectedOrder.city}
                </p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6 text-xs">
              {/* Order Status & Courier Form */}
              <form onSubmit={handleUpdateStatus} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Fulfillment Status & Courier Consignment
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Order Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-blue-700"
                    >
                      {allStatuses.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Courier Partner</label>
                    <select
                      value={courierPartner}
                      onChange={(e) => setCourierPartner(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-xl"
                    >
                      <option value="TCS Express">TCS Express</option>
                      <option value="Trax Logistics">Trax Logistics</option>
                      <option value="Call Courier">Call Courier</option>
                      <option value="Leopards Courier">Leopards Courier</option>
                      <option value="PostEx">PostEx</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Tracking / Waybill ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TCS-99821841"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-xl font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceOpen(true)}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold flex items-center gap-1.5 text-slate-700"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Pack Slip / Invoice
                  </button>

                  <button
                    type="submit"
                    disabled={updatingStatus}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg font-bold"
                  >
                    {updatingStatus ? 'Updating...' : 'Save Fulfillment Changes'}
                  </button>
                </div>
              </form>

              {/* Order Items List */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Order Items ({orderItems.length})
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {orderItems.map((it) => (
                    <div key={it.id} className="p-3 bg-white flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 block">{it.product_name}</span>
                        <span className="text-[11px] text-slate-500">
                          SKU: {it.sku} &middot; Qty: {it.quantity} &middot; Cost: PKR {it.cost_price.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">
                          PKR {it.total_price.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          Gross Margin: +PKR {(it.total_price - (it.cost_price * it.quantity)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Delivery Information */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px] mb-1">
                  Delivery Destination Details
                </span>
                <div>
                  <strong className="text-slate-700">Address:</strong> {selectedOrder.shipping_address}, {selectedOrder.city}, {selectedOrder.province}
                </div>
                <div>
                  <strong className="text-slate-700">Contact:</strong> {selectedOrder.customer_name} ({selectedOrder.customer_phone}) &middot; {selectedOrder.customer_email}
                </div>
                {selectedOrder.delivery_instructions && (
                  <div>
                    <strong className="text-slate-700">Instructions:</strong> {selectedOrder.delivery_instructions}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal for Printing */}
      {isInvoiceOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 flex items-center justify-center p-3 sm:p-6 animate-fade-in print:p-0 print:bg-white">
          <div className="relative bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 print:shadow-none print:border-none">
            <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900">AURA RETAIL</h2>
                <p className="text-xs text-slate-500">Commercial Consignment Invoice</p>
                <p className="text-xs text-slate-400 mt-1">Level 4, Tricon Corporate Centre, Gulberg, Lahore</p>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-sm text-slate-900 block">{selectedOrder.order_number}</span>
                <span className="text-slate-500">Date: {new Date(selectedOrder.created_at).toLocaleDateString()}</span>
                <span className="text-slate-500 block">Payment: {selectedOrder.payment_method}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs mb-6">
              <div>
                <strong className="text-slate-800 block mb-1">Billed & Shipped To:</strong>
                <p className="text-slate-700 font-bold">{selectedOrder.customer_name}</p>
                <p className="text-slate-600">{selectedOrder.shipping_address}</p>
                <p className="text-slate-600">{selectedOrder.city}, {selectedOrder.province}</p>
                <p className="text-slate-600">Phone: {selectedOrder.customer_phone}</p>
              </div>
              <div className="text-right">
                <strong className="text-slate-800 block mb-1">Courier Routing:</strong>
                <p className="text-slate-700 font-semibold">{selectedOrder.courier_partner || 'TCS Express'}</p>
                <p className="font-mono text-blue-700">{selectedOrder.tracking_number || 'Awaiting Dispatch'}</p>
              </div>
            </div>

            <table className="w-full text-xs border border-slate-200 divide-y divide-slate-200 mb-6">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="p-2.5 text-left">Item Description</th>
                  <th className="p-2.5 text-center">Qty</th>
                  <th className="p-2.5 text-right">Unit Price</th>
                  <th className="p-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderItems.map((it) => (
                  <tr key={it.id}>
                    <td className="p-2.5">{it.product_name}</td>
                    <td className="p-2.5 text-center">{it.quantity}</td>
                    <td className="p-2.5 text-right font-mono">PKR {it.unit_price.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono font-bold">PKR {it.total_price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-xs space-y-1 text-right max-w-xs ml-auto border-t border-slate-200 pt-3">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">PKR {selectedOrder.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge:</span>
                <span>PKR {selectedOrder.shipping_fee.toLocaleString()}</span>
              </div>
              {selectedOrder.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount:</span>
                  <span>-PKR {selectedOrder.discount_amount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
                <span>Grand Total:</span>
                <span className="text-blue-700">PKR {selectedOrder.total_amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 flex justify-end gap-3 print:hidden">
              <button
                onClick={() => setIsInvoiceOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
