import React, { useState } from 'react';
import { ProductImage } from './ProductImage';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Tag, Truck, Check } from 'lucide-react';
import { CartItem } from '../types';

/** A basket line is one product + one chosen variant (colour / size) */
export const cartLineKey = (item: CartItem) => `${item.product.id}::${item.selectedVariant || ''}`;

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: (couponCode?: string, discountAmount?: number) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  if (!isOpen) return null;

  const subtotal = cart.reduce((acc, item) => {
    const price = item.product.discount_price || item.product.regular_price;
    return acc + price * item.quantity;
  }, 0);

  const freeDeliveryThreshold = 3500;
  const amountNeededForFree = Math.max(0, freeDeliveryThreshold - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / freeDeliveryThreshold) * 100));

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setCouponLoading(true);
    setCouponError(null);

    try {
      const res = await fetch('/api/coupons/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim(), subtotal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error || 'Failed to apply coupon');
      } else {
        setAppliedCoupon(data.code);
        setDiscountAmount(data.calculated_discount);
        setCouponError(null);
      }
    } catch (err: any) {
      setCouponError('Network error while checking coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setCouponInput('');
  };

  const total = Math.max(0, subtotal - discountAmount);

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-950/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-slide-left">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#8a6a2f]" />
            <h2 className="text-base font-bold text-slate-900">Your Shopping Cart</h2>
            <span className="text-xs bg-slate-100 font-bold px-2 py-0.5 rounded-full text-slate-700">
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Meter */}
        <div className="bg-[#faf6ec] px-5 py-3 border-b border-[#eadfc4]">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="flex items-center gap-1.5 text-[#5c4a22]">
              <Truck className="w-3.5 h-3.5 text-[#8a6a2f]" />
              {amountNeededForFree === 0 ? (
                <span className="text-emerald-700 font-bold">You unlocked FREE Nationwide Delivery! 🎉</span>
              ) : (
                <span>Add PKR {amountNeededForFree.toLocaleString()} more for FREE Delivery</span>
              )}
            </span>
            <span className="text-[#8a6a2f]">{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-blue-200/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1a1712] transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Your cart is empty</h3>
              <p className="text-xs text-slate-500 max-w-xs mb-4">
                Explore our curated wholesale-sourced collections across Pakistan and add items to your cart.
              </p>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 hover:bg-[#2c271f] text-white rounded-xl text-xs font-semibold transition"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            cart.map((item) => {
              const unitPrice = item.product.discount_price || item.product.regular_price;
              const itemTotal = unitPrice * item.quantity;
              return (
                <div
                  key={cartLineKey(item)}
                  className="flex gap-3 p-3 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 transition"
                >
                  <ProductImage
                    src={item.product.primary_image}
                    alt={item.product.name}
                    compact
                    className="w-18 h-18 rounded-xl object-cover bg-slate-100 shrink-0"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-900 line-clamp-1 leading-snug">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveItem(cartLineKey(item))}
                          className="text-slate-400 hover:text-rose-600 p-0.5 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-500 block">
                        SKU: {item.product.sku}
                      </span>
                      {item.selectedVariant && item.selectedVariant.includes(':') && (
                        <span className="text-[11px] text-slate-600 block">{item.selectedVariant}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(cartLineKey(item), item.quantity - 1)}
                          className="p-1 hover:bg-white rounded transition"
                        >
                          <Minus className="w-3 h-3 text-slate-600" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(cartLineKey(item), item.quantity + 1)}
                          disabled={item.quantity >= item.product.stock_quantity}
                          className="p-1 hover:bg-white rounded disabled:opacity-30 transition"
                        >
                          <Plus className="w-3 h-3 text-slate-600" />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        PKR {itemTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Coupon & Summary */}
        {cart.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/50 space-y-4">
            {/* Coupon Code Input */}
            <div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>
                      Coupon <strong className="font-bold">{appliedCoupon}</strong> applied (-PKR {discountAmount.toLocaleString()})
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-slate-400 hover:text-rose-600 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Coupon (e.g. WELCOME10)"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="w-full text-xs uppercase px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-[#c8a96a] focus:outline-hidden"
                    />
                    <Tag className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                  <button
                    type="submit"
                    disabled={couponLoading || !couponInput.trim()}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-[#2c271f] disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold transition"
                  >
                    {couponLoading ? '...' : 'Apply'}
                  </button>
                </form>
              )}
              {couponError && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">
                  {couponError}
                </span>
              )}
            </div>

            {/* Calculations */}
            <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-200/80 pt-3">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">PKR {subtotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Promotional Discount</span>
                  <span>-PKR {discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Estimated Shipping</span>
                <span>{amountNeededForFree === 0 ? 'FREE' : 'Calculated at checkout (~PKR 180-220)'}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Order Total</span>
                <span className="text-base text-[#8a6a2f]">PKR {total.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onProceedToCheckout(appliedCoupon || undefined, discountAmount);
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-[#2c271f] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
            >
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
