import React, { useState } from 'react';
import { 
  LayoutDashboard, Package, Truck, Sparkles, Building2, 
  FileText, DollarSign, Tag, Settings, Store, Menu, X, ArrowLeft, Layers
} from 'lucide-react';
import { User } from '../../types';

interface AdminLayoutProps {
  currentUser: User | null;
  onExitAdmin: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
  storeName: string;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentUser,
  onExitAdmin,
  activeTab,
  setActiveTab,
  children,
  storeName,
}) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'overview', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: '3dstore', label: '3D Store & Shelves (ShopWalk)', icon: Layers, badge: '3D' },
    { id: 'products', label: 'Product Catalogue', icon: Package },
    { id: 'sourcing', label: 'Sourcing Pipeline & AI Score', icon: Sparkles, badge: 'Sourcing' },
    { id: 'suppliers', label: 'Suppliers & Comparison', icon: Building2 },
    { id: 'procurement', label: 'Purchase Orders (POs)', icon: FileText },
    { id: 'inventory', label: 'Inventory Ledger & Movements', icon: Truck },
    { id: 'orders', label: 'Orders & Fulfillment', icon: Truck },
    { id: 'financials', label: 'Landed Costs & P&L', icon: DollarSign, badge: 'Finance' },
    { id: 'coupons', label: 'Promotions & Coupons', icon: Tag },
    { id: 'settings', label: 'Store & Courier Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-800">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            {mobileSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="font-bold text-sm">Admin Business Suite</span>
        </div>
        <button
          onClick={onExitAdmin}
          className="text-xs font-semibold bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-1"
        >
          <Store className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-64 bg-slate-950 text-slate-300 flex flex-col justify-between shrink-0 transition-transform duration-300 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Logo & Store identity */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">
                A
              </div>
              <div>
                <span className="font-bold text-sm text-white block leading-tight">
                  {storeName}
                </span>
                <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider block">
                  Operations Control
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Switch back to Store */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Logged in as:</span>
            <span className="font-bold text-slate-200">{currentUser?.full_name?.split(' ')[0]}</span>
          </div>
          <button
            onClick={onExitAdmin}
            className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition border border-slate-800"
          >
            <Store className="w-3.5 h-3.5 text-emerald-400" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};
