import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, DollarSign, ShoppingBag, Package, AlertTriangle, 
  ArrowUpRight, Users, CheckCircle2, Clock, Truck, ShieldAlert,
  BarChart3, RefreshCw
} from 'lucide-react';

interface AdminOverviewProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = () => {
    setLoading(true);
    fetch('/api/admin/overview')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Calculating real-time retail & financial metrics...
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const statusCounts = data?.statusCounts || [];
  const lowStockProducts = data?.lowStockProducts || [];
  const topSellers = data?.topSellers || [];
  const recentOrders = data?.recentOrders || [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header with Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Executive Retail & Supply Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time sales, landed margins, inventory valuation, and procurement status across Pakistan
          </p>
        </div>
        <button
          onClick={fetchOverview}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {/* Top Financial KPI Metric Cards (Real Calculated Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gross Sales Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {Number(metrics.totalRevenue || 0).toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
            <span className="font-semibold text-slate-800">{metrics.totalOrders || 0}</span> orders completed or processing
          </div>
        </div>

        {/* Cost of Goods Sold (COGS) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Cost of Goods (COGS)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {Number(metrics.totalCOGS || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Direct wholesale supplier procurement cost
          </div>
        </div>

        {/* Gross Profit & Margin */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gross Profit</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            PKR {Number(metrics.grossProfit || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-2">
            {metrics.grossMarginPercent}% Gross Profit Margin
          </div>
        </div>

        {/* Net Profit After Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Profit</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700">
            PKR {Number(metrics.netProfit || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            After PKR {Number(metrics.totalExpenses || 0).toLocaleString()} recorded ops/ads
          </div>
        </div>
      </div>

      {/* Inventory Valuation & Health Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-3xl lg:col-span-1 shadow-lg flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1">
              Active Stock Valuation
            </span>
            <h3 className="text-xl font-bold">Physical Warehouse Ledger</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Calculated dynamically from wholesale cost prices & retail values in our fulfillment warehouse.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex justify-between text-xs border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Total Units in Stock:</span>
                <span className="font-bold text-white">{metrics.totalUnitsInStock} units</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Inventory Cost Value:</span>
                <span className="font-bold text-white">PKR {Number(metrics.inventoryCostValue || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Potential Retail Value:</span>
                <span className="font-bold text-emerald-400">PKR {Number(metrics.inventoryRetailValue || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-4 border-t border-slate-700 flex gap-2">
            <button
              onClick={() => onNavigateTab('inventory')}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Stock Ledger &rarr;
            </button>
            <button
              onClick={() => onNavigateTab('sourcing')}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
            >
              Sourcing Pipeline &rarr;
            </button>
          </div>
        </div>

        {/* Low Stock Alerts & Fast Action Table */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">
                Low-Stock Replenishment Alerts ({lowStockProducts.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('procurement')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Create Purchase Order &rarr;
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              All active catalog items are adequately stocked above alert thresholds.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
              {lowStockProducts.map((p: any) => (
                <div key={p.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <span className="font-bold text-slate-900 block">{p.name}</span>
                    <span className="text-[11px] text-slate-500">SKU: {p.sku} &middot; Threshold: {p.low_stock_threshold}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                      {p.stock_quantity} left
                    </span>
                    <button
                      onClick={() => onNavigateTab('suppliers')}
                      className="text-xs font-semibold text-slate-700 hover:text-blue-600 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white"
                    >
                      Compare Suppliers
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Recent Customer Orders</h3>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View All Orders &rarr;
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
            {recentOrders.map((ord: any) => (
              <div key={ord.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                <div>
                  <span className="font-bold text-slate-900 block">{ord.order_number}</span>
                  <span className="text-[11px] text-slate-500">
                    {ord.customer_name} ({ord.city}) &middot; {ord.payment_method}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-900 block">PKR {ord.total_amount.toLocaleString()}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    ord.status === 'Delivered'
                      ? 'bg-emerald-50 text-emerald-700'
                      : ord.status === 'In Transit'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {ord.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Selling Products & Item Margin */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Top Performing Products</h3>
            <button
              onClick={() => onNavigateTab('financials')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Landed Margins &rarr;
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
            {topSellers.map((item: any) => (
              <div key={item.product_id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                <div>
                  <span className="font-bold text-slate-900 block">{item.product_name}</span>
                  <span className="text-[11px] text-slate-500">
                    {item.units_sold} units sold &middot; Revenue: PKR {Number(item.gross_revenue).toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-600 block">
                    +PKR {Number(item.item_gross_profit).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400">Gross Margin</span>
                </div>
              </div>
            ))}
            {topSellers.length === 0 && (
              <div className="p-6 text-center text-slate-500">
                Sales rankings will populate automatically as customer orders are placed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
