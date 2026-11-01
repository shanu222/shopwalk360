import React, { useState } from 'react';
import { MusicControl } from './MusicControl';
import { ShoppingBag, Heart, Search, User as UserIcon, X, Menu, Box, LayoutGrid, Truck } from 'lucide-react';
import { User, Category, CartItem } from '../types';

interface NavbarProps {
  currentUser: User | null;
  categories: Category[];
  cart: CartItem[];
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenAuth: () => void;
  onOpenTracking: () => void;
  onSelectCategory: (slug: string | null) => void;
  selectedCategory: string | null;
  onSearch: (term: string) => void;
  searchTerm: string;
  storeSettings: Record<string, string>;
  activeView: 'store' | 'about' | 'faq';
  setActiveView: (view: 'store' | 'about' | 'faq') => void;
  shoppingMode: '3d' | '2d';
  onToggleShoppingMode: (mode: '3d' | '2d') => void;
  onHome: () => void;
}

export const BrandMark: React.FC<{ light?: boolean; size?: 'sm' | 'md' }> = ({ light, size = 'md' }) => (
  <span className="flex items-center gap-2.5">
    <span className={`${size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-[11px]'} flex items-center justify-center rounded-xl bg-[#c8a96a] font-black tracking-tight text-[#1a1712] shadow-sm`}>360</span>
    <span className={`${size === 'sm' ? 'text-base' : 'text-lg sm:text-xl'} font-extrabold tracking-tight ${light ? 'text-white' : 'text-[#1a1712]'}`}>
      ShopWalk<span className="text-[#b08d4f]"> 360</span>
    </span>
  </span>
);

export const Navbar: React.FC<NavbarProps> = ({
  currentUser, categories, cart, wishlistCount, onOpenCart, onOpenWishlist, onOpenAuth, onOpenTracking, onSelectCategory, selectedCategory,
  onSearch, searchTerm, activeView, setActiveView, shoppingMode, onToggleShoppingMode, onHome,
}) => {
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [menuOpen, setMenuOpen] = useState(false);
  const count = cart.reduce((a, i) => a + i.quantity, 0);
  const is3D = shoppingMode === '3d' && activeView === 'store';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchInput);
    setMenuOpen(false);
  };

  const ModeSwitch = (
    <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-1 text-xs font-semibold" role="group" aria-label="Store view">
      {([['3d', 'Walk-in 3D', Box], ['2d', 'Online store', LayoutGrid]] as const).map(([m, label, Icon]) => (
        <button
          key={m}
          onClick={() => {
            onToggleShoppingMode(m);
            setActiveView('store');
          }}
          aria-pressed={shoppingMode === m}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${shoppingMode === m ? 'bg-[#1a1712] text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onHome} aria-label="ShopWalk 360 home" className="shrink-0">
          <BrandMark />
        </button>
        <div className="ml-2 hidden md:block">{ModeSwitch}</div>

        <form onSubmit={submit} className="relative ml-auto hidden max-w-sm flex-1 lg:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-[#b08d4f] focus:bg-white focus:outline-none"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 lg:ml-2" aria-label="Account">
          <MusicControl />
          <button onClick={onOpenTracking} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 xl:flex">
            <Truck className="h-4 w-4" /> Track order
          </button>
          <button onClick={onOpenAuth} aria-label={currentUser ? 'My account' : 'Sign in'} className="flex items-center gap-2 rounded-full px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            <UserIcon className="h-5 w-5" />
            <span className="hidden max-w-[110px] truncate sm:inline">{currentUser ? currentUser.full_name.split(' ')[0] : 'Sign in'}</span>
          </button>
          <button onClick={onOpenWishlist} aria-label={`Wishlist, ${wishlistCount} items`} className="relative hidden rounded-full p-2 text-slate-700 hover:bg-slate-100 sm:block">
            <Heart className="h-5 w-5" />
            {wishlistCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{wishlistCount}</span>}
          </button>
          <button onClick={onOpenCart} aria-label={`Basket, ${count} items`} className="relative flex items-center gap-2 rounded-full bg-[#1a1712] px-3.5 py-2 text-xs font-bold text-white hover:bg-black">
            <ShoppingBag className="h-4 w-4" /> <span className="hidden sm:inline">Basket</span>
            <span className="rounded-full bg-[#c8a96a] px-1.5 text-[10px] font-black text-[#1a1712]">{count}</span>
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen} className="rounded-full p-2 text-slate-700 hover:bg-slate-100 lg:hidden">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {/* category row (online store only — the 3D store has its own wayfinding) */}
      {!is3D && (
        <div className="hidden border-t border-slate-100 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2 lg:px-8">
            <button onClick={() => { onSelectCategory(null); setActiveView('store'); }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${!selectedCategory && activeView === 'store' ? 'bg-[#1a1712] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>All products</button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => { onSelectCategory(c.slug); setActiveView('store'); }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${selectedCategory === c.slug ? 'bg-[#1a1712] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="border-t border-slate-100 bg-white px-4 pb-5 pt-3 lg:hidden">
          <div className="mb-3 md:hidden">{ModeSwitch}</div>
          <form onSubmit={submit} className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products" aria-label="Search products" className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm" />
          </form>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button key={c.id} onClick={() => { onSelectCategory(c.slug); setActiveView('store'); setMenuOpen(false); }} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{c.name}</button>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-sm font-semibold text-slate-700">
            <button onClick={() => { onOpenTracking(); setMenuOpen(false); }}>Track order</button>
            <button onClick={() => { onOpenWishlist(); setMenuOpen(false); }}>Wishlist ({wishlistCount})</button>
          </div>
        </div>
      )}
    </header>
  );
};
