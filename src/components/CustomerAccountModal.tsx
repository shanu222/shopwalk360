import React, { useState, useEffect } from 'react';
import { X, User as UserIcon, Package, Heart, LogOut, CheckCircle2, AlertCircle, ShoppingBag, ArrowRight } from 'lucide-react';
import { User, Order, Product } from '../types';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
  wishlist: Product[];
  onAddToCart: (product: Product) => void;
  onRemoveFromWishlist: (productId: string) => void;
  onTrackOrder: (orderNumber: string) => void;
}

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
  wishlist,
  onAddToCart,
  onRemoveFromWishlist,
  onTrackOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist'>('orders');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Auth form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (currentUser) {
      setOrdersLoading(true);
      fetch('/api/orders/my-orders')
        .then((res) => res.json())
        .then((data) => setOrders(data.orders || []))
        .catch((err) => console.error(err))
        .finally(() => setOrdersLoading(false));
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegisterMode
      ? { email, password, full_name: fullName, phone }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
      } else {
        onLoginSuccess(data.user);
        setActiveTab('orders');
      }
    } catch (err: any) {
      setAuthError('Connection error with authentication server.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
              {currentUser ? currentUser.full_name.charAt(0) : <UserIcon className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {currentUser ? currentUser.full_name : 'Customer Account'}
              </h2>
              <p className="text-xs text-slate-500">
                {currentUser ? currentUser.email : 'Sign in to access order history & saved wishlist'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation if Logged In */}
        {currentUser && (
          <div className="flex items-center gap-6 px-6 border-b border-slate-200 text-xs font-semibold bg-white">
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-3 transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              Order History ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`py-3 transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'wishlist'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Heart className="w-4 h-4" />
              Saved Wishlist ({wishlist.length})
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-3 transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'profile'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              Profile Details
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-6">
          {!currentUser ? (
            /* Auth Form (Login / Register) */
            <div className="max-w-md mx-auto py-2">
              <div className="flex bg-slate-100 p-1 rounded-xl mb-5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(false)}
                  className={`flex-1 py-2 rounded-lg transition ${
                    !isRegisterMode ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(true)}
                  className={`flex-1 py-2 rounded-lg transition ${
                    isRegisterMode ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Create New Account
                </button>
              </div>

              {authError && (
                <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {isRegisterMode && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Asad Rehman"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone (for SMS updates)
                      </label>
                      <input
                        type="tel"
                        placeholder="+92 300 1234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-3 px-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  {authLoading
                    ? 'Processing...'
                    : isRegisterMode
                    ? 'Complete Registration'
                    : 'Sign In to Account'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

            </div>
          ) : activeTab === 'orders' ? (
            /* Orders History */
            <div className="space-y-4">
              {ordersLoading ? (
                <p className="text-xs text-slate-500 text-center py-6">Loading your orders...</p>
              ) : orders.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-800">No orders placed yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Orders you place will appear here with live tracking.
                  </p>
                </div>
              ) : (
                orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{ord.order_number}</span>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {ord.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 text-[11px]">
                      <span>{ord.created_at ? new Date(ord.created_at).toLocaleDateString() : 'Recent'}</span>
                      <span className="font-bold text-slate-900">
                        PKR {ord.total_amount.toLocaleString()} ({ord.payment_method})
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        Delivery to {ord.city} &middot; {ord.item_count || 1} items
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onTrackOrder(ord.order_number);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-bold text-xs"
                      >
                        Track Milestone &rarr;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === 'wishlist' ? (
            /* Wishlist */
            <div className="space-y-3">
              {wishlist.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Heart className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-800">Your wishlist is empty</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Click the heart icon on any curated product card to save it here.
                  </p>
                </div>
              ) : (
                wishlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={item.primary_image}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover bg-slate-100"
                      />
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">{item.name}</h4>
                        <span className="text-xs font-bold text-blue-700">
                          PKR {(item.discount_price || item.regular_price).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAddToCart(item)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        Add
                      </button>
                      <button
                        onClick={() => onRemoveFromWishlist(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Profile Details */
            <div className="space-y-4 max-w-md mx-auto text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-bold text-slate-900">{currentUser.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-900">{currentUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-900">{currentUser.phone || 'Not recorded'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Role:</span>
                  <span className="font-bold text-blue-700 uppercase tracking-wide">
                    {currentUser.role}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
