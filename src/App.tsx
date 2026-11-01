import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { ProductImage } from './components/ProductImage';
import { Sofa, CookingPot, Cable, Smartphone, CarFront, Luggage, Laptop, Shirt, Footprints, Watch, Dumbbell, Gift } from 'lucide-react';
import { 
  Sparkles, ShieldCheck, Truck, RotateCcw, ArrowRight, 
  Star, ShoppingBag, Eye, Heart, Filter, ChevronRight, CheckCircle2,
  SlidersHorizontal, Package, Tag, Building2, LayoutDashboard
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { CustomerAccountModal } from './components/CustomerAccountModal';
import { InformationalPages } from './components/InformationalPages';

// Admin Suite Components
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLogin } from './components/admin/AdminLogin';
import { StoreEntrance } from './components/StoreEntrance';
import { AdminOverview } from './components/admin/AdminOverview';
import { AdminProducts } from './components/admin/AdminProducts';
import { AdminSuppliers } from './components/admin/AdminSuppliers';
import { AdminSourcing } from './components/admin/AdminSourcing';
import { AdminProcurement } from './components/admin/AdminProcurement';
import { AdminInventory } from './components/admin/AdminInventory';
import { AdminOrders } from './components/admin/AdminOrders';
import { AdminFinancials } from './components/admin/AdminFinancials';
import { AdminCoupons } from './components/admin/AdminCoupons';
import { AdminSettings } from './components/admin/AdminSettings';
const Admin3DStore = lazy(() => import('./components/admin/Admin3DStore'));
const AdminMusic = lazy(() => import('./components/admin/AdminMusic'));

// 3D Virtual Retail Store (loaded on demand so the classic store stays light)
const ShopWalkExperience = lazy(() => import('./components/store3d/ShopWalkExperience'));
import { cartLineKey } from './components/CartDrawer';

import { Product, Category, CartItem, User, Supplier, Review } from './types';


function categoryIcon(slug: string) {
  const s = slug.toLowerCase();
  if (s.includes('home')) return Sofa;
  if (s.includes('kitchen')) return CookingPot;
  if (s.includes('electronic')) return Cable;
  if (s.includes('mobile')) return Smartphone;
  if (s.includes('car')) return CarFront;
  if (s.includes('travel')) return Luggage;
  if (s.includes('office') || s.includes('study')) return Laptop;
  if (s.includes('fashion') || s.includes('cloth')) return Shirt;
  if (s.includes('shoe') || s.includes('foot')) return Footprints;
  if (s.includes('watch')) return Watch;
  if (s.includes('beauty') || s.includes('care')) return Sparkles;
  if (s.includes('fitness') || s.includes('sport')) return Dumbbell;
  if (s.includes('gift')) return Gift;
  return Tag;
}

export default function App() {
  // Navigation & View States
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '').startsWith('/admin');
  const [activeView, setActiveView] = useState<'store' | 'about' | 'faq'>('store');
  const [adminTab, setAdminTab] = useState<string>('overview');
  const [authChecked, setAuthChecked] = useState(false);
  // null = the shopper hasn't chosen yet → show the entrance page
  const [chosenMode, setChosenMode] = useState<'3d' | '2d' | null>(() => {
    try {
      return (sessionStorage.getItem('shopwalk360_mode') as '3d' | '2d' | null) || null;
    } catch {
      return null;
    }
  });
  const shoppingMode: '3d' | '2d' = chosenMode || '2d';
  const setShoppingMode = (m: '3d' | '2d') => {
    setChosenMode(m);
    try {
      sessionStorage.setItem('shopwalk360_mode', m);
    } catch {
      /* ignore */
    }
  };
  const [departmentCount, setDepartmentCount] = useState(0);

  // Department to walk to when a category is chosen from the navbar while in 3D
  const [focusCategory, setFocusCategory] = useState<string | null>(null);
  const clearFocusCategory = useCallback(() => setFocusCategory(null), []);
  const [featuredReviews, setFeaturedReviews] = useState<(Review & { product_name?: string })[]>([]);

  // Application Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [storeSettings, setStoreSettings] = useState<Record<string, string>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('featured');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(10000);

  // Customer Shopping States
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('shopwalk360_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shopwalk360_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Modals
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState('');
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Active coupon in cart
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);

  // Sync cart & wishlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('shopwalk360_cart', JSON.stringify(cart));
    } catch (e) {}
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('shopwalk360_wishlist', JSON.stringify(wishlistIds));
    } catch (e) {}
  }, [wishlistIds]);

  // Initial Data Fetch
  const fetchInitialData = () => {
    // Current User
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((d) => setCurrentUser(d.user))
      .catch((e) => console.error(e))
      .finally(() => setAuthChecked(true));

    fetch('/api/store3d/v2/layout')
      .then((res) => res.json())
      .then((d) => setDepartmentCount((d.departments || []).length))
      .catch(() => {});

    // Categories
    fetch('/api/categories')
      .then((res) => res.json())
      .then((d) => setCategories(d.categories || []))
      .catch((e) => console.error(e));

    // Settings
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((d) => setStoreSettings(d.settings || {}))
      .catch((e) => console.error(e));


    // Real customer reviews from the database (none are hard-coded)
    fetch('/api/reviews/featured')
      .then((res) => res.json())
      .then((d) => setFeaturedReviews(d.reviews || []))
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch Products whenever filters change
  const fetchProducts = () => {
    setLoadingProducts(true);
    const params = new URLSearchParams();
    if (selectedCategory) params.append('category', selectedCategory);
    if (searchTerm.trim()) params.append('search', searchTerm.trim());
    if (selectedBrand !== 'all') params.append('brand', selectedBrand);
    if (inStockOnly) params.append('inStock', 'true');
    if (maxPriceFilter < 10000) params.append('maxPrice', String(maxPriceFilter));
    if (sortOption) params.append('sort', sortOption);

    fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        if (data.brands) setBrands(data.brands);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingProducts(false));
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchTerm, selectedBrand, inStockOnly, maxPriceFilter, sortOption]);

  // Cart operations — a basket line is one product + one chosen variant (colour / size)
  const handleAddToCart = (product: Product, quantity = 1, selectedVariant?: string) => {
    setCart((prev) => {
      const key = cartLineKey({ product, quantity, selectedVariant });
      const existing = prev.find((i) => cartLineKey(i) === key);
      if (existing) {
        return prev.map((i) => (cartLineKey(i) === key ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...prev, { product, quantity, selectedVariant }];
    });
    if (shoppingMode !== '3d') setIsCartOpen(true);
  };

  const handleUpdateCartQty = (lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => cartLineKey(i) !== lineKey));
    } else {
      setCart((prev) => prev.map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity } : i)));
    }
  };

  const handleRemoveFromCart = (lineKey: string) => {
    setCart((prev) => prev.filter((i) => cartLineKey(i) !== lineKey));
  };

  const handleToggleWishlist = (productId: string) => {
    setWishlistIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleBuyNow = (product: Product, quantity = 1, selectedVariant?: string) => {
    handleAddToCart(product, quantity, selectedVariant);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const wishlistedProducts = products.filter((p) => wishlistIds.includes(p.id));

  // Store title
  const storeName = 'ShopWalk 360';

  // Suppliers are only needed (and only readable) inside the admin area
  useEffect(() => {
    if (isAdminPath && (currentUser?.role === 'admin' || currentUser?.role === 'manager')) {
      fetch('/api/admin/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.suppliers || [])).catch(() => {});
    }
  }, [isAdminPath, currentUser]);

  // ---------------- Admin area (separate URL: /admin) ----------------
  if (isAdminPath) {
    if (!authChecked) return <div className="min-h-screen bg-slate-50" />;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'manager') {
      return <AdminLogin onSignedIn={(u) => setCurrentUser(u)} />;
    }
    return (
      <AdminLayout
        currentUser={currentUser}
        onExitAdmin={async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          setCurrentUser(null);
        }}
        activeTab={adminTab}
        setActiveTab={setAdminTab}
        storeName={storeName}
      >
        {adminTab === 'overview' && <AdminOverview onNavigateTab={setAdminTab} />}
        {adminTab === '3dstore' && (
          <Suspense fallback={<div className="p-6 text-xs text-slate-500">Loading virtual store tools…</div>}>
          <Admin3DStore
            products={products}
            onPreviewStore={() => {
              try {
                sessionStorage.setItem('shopwalk360_mode', '3d');
              } catch {
                /* ignore */
              }
              window.open('/', '_blank', 'noopener');
            }}
          />
          </Suspense>
        )}
        {adminTab === 'music' && (
          <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
            <AdminMusic />
          </Suspense>
        )}
        {adminTab === 'products' && <AdminProducts categories={categories} />}
        {adminTab === 'sourcing' && <AdminSourcing categories={categories} />}
        {adminTab === 'suppliers' && <AdminSuppliers products={products} />}
        {adminTab === 'procurement' && (
          <AdminProcurement
            suppliers={suppliers}
            products={products}
            onStockUpdated={fetchProducts}
          />
        )}
        {adminTab === 'inventory' && <AdminInventory />}
        {adminTab === 'orders' && <AdminOrders />}
        {adminTab === 'financials' && <AdminFinancials />}
        {adminTab === 'coupons' && <AdminCoupons />}
        {adminTab === 'settings' && (
          <AdminSettings
            initialSettings={storeSettings}
            onSettingsUpdated={(newS) => setStoreSettings(newS)}
          />
        )}
      </AdminLayout>
    );
  }

  // ---------------- Website entrance: choose 3D or online store ----------------
  if (!chosenMode) {
    return <StoreEntrance productCount={products.length} departmentCount={departmentCount} onChoose={(m) => setShoppingMode(m)} />;
  }

  return (
    <div className={`bg-[#f8fafc] text-slate-900 flex flex-col font-sans ${activeView === 'store' && shoppingMode === '3d' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      {/* Primary Top Navbar */}
      <Navbar
        currentUser={currentUser}
        categories={categories}
        cart={cart}
        wishlistCount={wishlistIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsAccountOpen(true)}
        onOpenAuth={() => setIsAccountOpen(true)}
        onOpenTracking={() => {
          setTrackingOrderNumber('');
          setIsTrackingOpen(true);
        }}
        onSelectCategory={(slug) => {
          setSelectedCategory(slug);
          setActiveView('store');
          if (slug && shoppingMode === '3d') setFocusCategory(slug);
        }}
        selectedCategory={selectedCategory}
        onSearch={(term) => {
          setSearchTerm(term);
          setActiveView('store');
        }}
        searchTerm={searchTerm}
        storeSettings={storeSettings}
        activeView={activeView}
        setActiveView={setActiveView}
        onHome={() => {
          setActiveView('store');
          setSelectedCategory(null);
          setSearchTerm('');
        }}
        shoppingMode={shoppingMode}
        onToggleShoppingMode={(mode) => setShoppingMode(mode)}
      />

      {/* Main Page Routing */}
      {activeView === 'about' || activeView === 'faq' ? (
        <main className="flex-1">
          <InformationalPages
            page={activeView}
            onBackToShop={() => setActiveView('store')}
            storeSettings={storeSettings}
          />
        </main>
      ) : shoppingMode === '3d' ? (
        <main className="relative flex min-h-0 flex-1 flex-col bg-[#151311]">
          <div className="relative h-full min-h-[420px] w-full overflow-hidden">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-white/70">Opening ShopWalk 360…</div>
              }
            >
              <ShopWalkExperience
                cart={cart}
                focusCategorySlug={focusCategory}
                onFocusHandled={clearFocusCategory}
                externalModalOpen={isCartOpen || isCheckoutOpen || isAccountOpen || isTrackingOpen}
                onAddToCart={(p, q, v) => handleAddToCart(p, q, v)}
                onBuyNow={(p, q, v) => handleBuyNow(p, q, v)}
                onOpenCart={() => setIsCartOpen(true)}
                onOpenCheckout={() => {
                  if (cart.length === 0) setIsCartOpen(true);
                  else setIsCheckoutOpen(true);
                }}
                onSwitchTo2D={() => setShoppingMode('2d')}
              />
            </Suspense>
          </div>
        </main>
      ) : (
        <main className="flex-1">
          {/* Online store hero (featured products come from the catalogue) */}
          {!selectedCategory && !searchTerm && (
            <section className="relative overflow-hidden bg-[#14120f] py-14 text-white sm:py-20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(200,169,106,0.18),transparent_55%)]" />
              <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
                <div className="space-y-6 lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#e2c88f]">ShopWalk 360 online store</p>
                  <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Explore. Experience. <span className="text-[#c8a96a]">Discover.</span></h1>
                  <p className="max-w-lg text-base leading-relaxed text-white/70">Everything in our 3D store, in a fast online catalogue. Same products, same prices, one basket.</p>
                  <div className="flex flex-wrap gap-3">
                    <a href="#catalog-section" className="flex items-center gap-2 rounded-full bg-[#c8a96a] px-6 py-3 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c]">Browse products <ArrowRight className="h-4 w-4" /></a>
                    <button onClick={() => { setShoppingMode('3d'); window.scrollTo(0, 0); }} className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold hover:bg-white/5">Walk the 3D store</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:col-span-6">
                  {products.filter((p) => p.is_featured).slice(0, 4).map((p) => (
                    <button key={p.id} onClick={() => setQuickViewProduct(p)} className="sw-rise group overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c8a96a]/60 hover:shadow-[0_20px_50px_-20px_rgba(200,169,106,0.5)]">
                      <div className="aspect-[4/3] overflow-hidden bg-white/5">
                        <ProductImage src={p.primary_image} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-1 text-xs font-semibold">{p.name}</div>
                        <div className="mt-0.5 text-xs font-bold text-[#e2c88f]">PKR {(p.discount_price || p.regular_price).toLocaleString()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Shop by category Carousel / Grid */}
          {!searchTerm && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-b border-slate-200/80">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    Shop by category
                  </h2>
                  <p className="text-xs text-slate-500">
                    Choose a category to browse
                  </p>
                </div>
                {selectedCategory && (
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="text-xs font-semibold text-[#8a6a2f] hover:text-[#1a1712]"
                  >
                    Show all categories &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {categories.map((c) => {
                  const Icon = categoryIcon(c.slug);
                  const active = selectedCategory === c.slug;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(active ? null : c.slug)}
                      className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition duration-300 hover:-translate-y-0.5 ${
                        active ? 'border-[#c8a96a] bg-[#faf6ec] shadow-sm' : 'border-slate-200/80 bg-white hover:border-[#e2c88f] hover:shadow-md'
                      }`}
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${active ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-[#1a1712] text-[#e9cf92] group-hover:bg-[#c8a96a] group-hover:text-[#1a1712]'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-xs font-bold leading-snug text-slate-800">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Product Catalogue & Filtering Section */}
          <section id="catalog-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {/* Filter Controls Row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {selectedCategory
                    ? `${categories.find((c) => c.slug === selectedCategory)?.name || 'Category'} Catalog`
                    : searchTerm
                    ? `Search results for "${searchTerm}"`
                    : 'All products'}
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {products.length} products
                </p>
              </div>

              {/* Sorting & Filter controls */}
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {/* Brand Filter */}
                {brands.length > 0 && (
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-blue-500 font-medium"
                  >
                    <option value="all">All Brands</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}

                {/* Sort Option */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-slate-800"
                >
                  <option value="featured">Featured Curations</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="rating">Highest Rated</option>
                  <option value="newest">Newest Arrivals</option>
                </select>

                {/* Stock Toggle */}
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white px-3 py-2 rounded-xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="rounded accent-[#c8a96a]"
                  />
                  <span>In Stock Only</span>
                </label>
              </div>
            </div>

            {/* Product Grid */}
            <div className="pt-8">
              {loadingProducts ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="bg-white rounded-2xl border border-slate-200 p-4 h-80 animate-pulse"></div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 max-w-lg mx-auto">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-900 mb-1">No products match your criteria</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Try adjusting your search terms, removing filters, or exploring all curated categories.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setSearchTerm('');
                      setSelectedBrand('all');
                      setInStockOnly(false);
                    }}
                    className="px-4 py-2 bg-[#1a1712] hover:bg-[#c8a96a] hover:text-[#1a1712] text-white rounded-xl text-xs font-semibold transition"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onAddToCart={(prod) => handleAddToCart(prod, 1)}
                      onQuickView={(prod) => setQuickViewProduct(prod)}
                      onToggleWishlist={handleToggleWishlist}
                      isWishlisted={wishlistIds.includes(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Customer reviews — loaded from the reviews table; hidden when there are none */}
          {featuredReviews.length > 0 && (
            <section className="bg-slate-100/70 border-t border-slate-200/80 py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900">What customers say</h2>
                  <p className="text-xs text-slate-500">Recent reviews submitted on our product pages.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {featuredReviews.map((r) => (
                    <div key={r.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-4 h-4 text-amber-400 ${n <= r.rating ? 'fill-amber-400' : ''}`} />
                        ))}
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{r.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{r.comment}</p>
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-800">{r.reviewer_name}</span>
                        {r.is_verified_purchase ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified purchase
                          </span>
                        ) : null}
                      </div>
                      {r.product_name && <div className="text-[11px] text-slate-400">on {r.product_name}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {/* Primary Footer (shown in 2D catalog mode or informational views) */}
      {(shoppingMode === '2d' || activeView !== 'store') && (
        <Footer
          categories={categories}
          onSelectCategory={(slug) => {
            setSelectedCategory(slug);
            setActiveView('store');
          }}
          onOpenPage={(page) => setActiveView(page)}
          onOpen3D={() => {
            setActiveView('store');
            setShoppingMode('3d');
            window.scrollTo(0, 0);
          }}
          onOpenTracking={() => {
            setTrackingOrderNumber('');
            setIsTrackingOpen(true);
          }}
          storeSettings={storeSettings}
        />
      )}

      {/* Modals & Overlays */}
      <ProductDetailModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={(prod, qty) => {
          handleAddToCart(prod, qty);
          setQuickViewProduct(null);
        }}
        onBuyNow={(prod, qty) => {
          handleBuyNow(prod, qty);
          setQuickViewProduct(null);
        }}
        onSelectProduct={(p) => setQuickViewProduct(p)}
        onToggleWishlist={handleToggleWishlist}
        isWishlisted={quickViewProduct ? wishlistIds.includes(quickViewProduct.id) : false}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveFromCart}
        onProceedToCheckout={(coupon, discount) => {
          setAppliedCoupon(coupon);
          setAppliedDiscount(discount || 0);
          setIsCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        currentUser={currentUser}
        appliedCoupon={appliedCoupon}
        initialDiscount={appliedDiscount}
        onOrderSuccess={(order) => {
          setCart([]);
          fetchProducts();
        }}
        storeSettings={storeSettings}
      />

      <OrderTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        initialOrderNumber={trackingOrderNumber}
      />

      <CustomerAccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={(u) => setCurrentUser(u)}
        onLogout={() => {
          fetch('/api/auth/logout', { method: 'POST' });
          setCurrentUser(null);
        }}
        wishlist={wishlistedProducts}
        onAddToCart={(p) => handleAddToCart(p, 1)}
        onRemoveFromWishlist={handleToggleWishlist}
        onTrackOrder={(orderNum) => {
          setTrackingOrderNumber(orderNum);
          setIsTrackingOpen(true);
        }}
      />
    </div>
  );
}
