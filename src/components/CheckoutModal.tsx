import React, { useState } from 'react';
import { X, Check, ShieldCheck, Truck, Building2, CreditCard, Banknote, ArrowRight, Printer, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { CartItem, User } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  currentUser: User | null;
  appliedCoupon?: string;
  initialDiscount?: number;
  onOrderSuccess: (order: any) => void;
  storeSettings: Record<string, string>;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  currentUser,
  appliedCoupon,
  initialDiscount = 0,
  onOrderSuccess,
  storeSettings,
}) => {
  // Form fields
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '+92 ');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Lahore');
  const [province, setProvince] = useState('Punjab');
  const [postalCode, setPostalCode] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'Bank Transfer' | 'Online Gateway'>('COD');

  // Gateway card fields simulation
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  if (!isOpen) return null;

  const subtotal = cart.reduce((acc, item) => {
    const p = item.product.discount_price || item.product.regular_price;
    return acc + p * item.quantity;
  }, 0);

  // Dynamic shipping: Lahore 180, rest of PK 220, Free > 3500
  let shippingFee = 220;
  if (city.toLowerCase().includes('lahore')) {
    shippingFee = 180;
  }
  if (subtotal >= 3500) {
    shippingFee = 0;
  }

  const discountAmount = initialDiscount;
  const grandTotal = Math.max(0, subtotal + shippingFee - discountAmount);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !phone.trim() || !address.trim() || !city.trim()) {
      setError('Please fill in all required delivery information.');
      return;
    }

    if (paymentMethod === 'Online Gateway' && (!cardNumber || !cardExpiry || !cardCvc)) {
      setError('Please provide valid card details for payment gateway processing.');
      return;
    }

    setLoading(true);

    try {
      const orderPayload = {
        customer_name: fullName.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim(),
        shipping_address: address.trim(),
        city: city.trim(),
        province,
        postal_code: postalCode.trim(),
        delivery_instructions: deliveryInstructions.trim(),
        payment_method: paymentMethod,
        coupon_code: appliedCoupon || null,
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          variant_id: i.selectedVariant || null,
        })),
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order.');
      }

      // Celebrate order placement
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setCompletedOrder(data.order);
      onOrderSuccess(data.order);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during checkout.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="relative bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {completedOrder ? 'Order Confirmed!' : 'Secure Express Checkout'}
            </h2>
            <p className="text-xs text-slate-500">
              {completedOrder
                ? 'Your order has been recorded into our fulfillment queue.'
                : 'Verified retail delivery with full consignment tracking across Pakistan'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-6">
          {completedOrder ? (
            /* Order Success View */
            <div className="space-y-6 text-center py-4 print:p-0">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                  Order Successfully Placed
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2">
                  Order #{completedOrder.order_number}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  A verification confirmation has been assigned to{' '}
                  <strong className="text-slate-700">{completedOrder.customer_email}</strong> &{' '}
                  <strong className="text-slate-700">{completedOrder.customer_phone}</strong>.
                </p>
              </div>

              {/* Order Summary Receipt Box */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-left space-y-3 max-w-lg mx-auto text-xs">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Delivery Address:</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {completedOrder.shipping_address}, {completedOrder.city}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Payment Selected:</span>
                  <span className="font-semibold text-slate-800">{completedOrder.payment_method}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="font-semibold text-slate-800">
                    PKR {completedOrder.subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Delivery Fee:</span>
                  <span className="font-semibold text-slate-800">
                    {completedOrder.shipping_fee === 0
                      ? 'FREE'
                      : `PKR ${completedOrder.shipping_fee}`}
                  </span>
                </div>
                {completedOrder.discount_amount > 0 && (
                  <div className="flex justify-between border-b border-slate-200 pb-2 text-emerald-600 font-medium">
                    <span>Discount:</span>
                    <span>-PKR {completedOrder.discount_amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1">
                  <span>Grand Total:</span>
                  <span className="text-blue-700">
                    PKR {completedOrder.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Special Note for Bank Transfer */}
              {completedOrder.payment_method === 'Bank Transfer' && (
                <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl text-left max-w-lg mx-auto text-xs text-amber-900">
                  <span className="font-bold block mb-1">Bank Transfer Next Steps:</span>
                  Please transfer PKR {completedOrder.total_amount.toLocaleString()} to:
                  <div className="mt-2 font-mono text-[11px] bg-white p-2.5 rounded-lg border border-amber-300">
                    Bank: {storeSettings.bank_name}
                    <br />
                    Title: {storeSettings.bank_title}
                    <br />
                    Account: {storeSettings.bank_account}
                    <br />
                    IBAN: {storeSettings.bank_iban}
                  </div>
                  <span className="text-[11px] text-amber-800 mt-1.5 block">
                    Please quote order #{completedOrder.order_number} as the payment reference{storeSettings.contact_whatsapp ? ` and share your receipt on WhatsApp ${storeSettings.contact_whatsapp}` : ''}.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  Print Receipt
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          ) : (
            /* Checkout Form View */
            <form onSubmit={handleSubmitOrder} className="space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1. Customer Information */}
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] flex items-center justify-center">1</span>
                  Customer & Contact Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone (for Courier Tracking) *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+92 300 1234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
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
                </div>
              </div>

              {/* 2. Shipping Address */}
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] flex items-center justify-center">2</span>
                  Delivery Address in Pakistan
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Complete Street Address (House / Flat / Street / Phase / Sector) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. House 42, Street 15, Sector F-8/2"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        City *
                      </label>
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden font-medium"
                      >
                        <option value="Lahore">Lahore (Same-Day / 24h Express)</option>
                        <option value="Karachi">Karachi (24-48h)</option>
                        <option value="Islamabad">Islamabad (24h)</option>
                        <option value="Rawalpindi">Rawalpindi</option>
                        <option value="Faisalabad">Faisalabad</option>
                        <option value="Sialkot">Sialkot</option>
                        <option value="Gujranwala">Gujranwala</option>
                        <option value="Peshawar">Peshawar</option>
                        <option value="Multan">Multan</option>
                        <option value="Quetta">Quetta</option>
                        <option value="Other City">Other City in Pakistan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Province *
                      </label>
                      <select
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      >
                        <option value="Punjab">Punjab</option>
                        <option value="Sindh">Sindh</option>
                        <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                        <option value="Balochistan">Balochistan</option>
                        <option value="Federal">Islamabad Capital Territory</option>
                        <option value="Azad Kashmir">Azad Kashmir</option>
                        <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Postal Code (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 54000"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Delivery Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Call before delivery, leave with guard if not at home"
                      value={deliveryInstructions}
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Payment Method */}
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] flex items-center justify-center">3</span>
                  Payment Option
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('COD')}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === 'COD'
                        ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Banknote className="w-5 h-5 text-emerald-600" />
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm">
                        Most Popular
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-900 block">Cash on Delivery</span>
                    <span className="text-[11px] text-slate-500">Pay courier rider in cash upon receiving package</span>
                  </button>

                  {storeSettings.bank_iban || storeSettings.bank_account ? (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Bank Transfer')}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === 'Bank Transfer'
                        ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 block">Direct Bank Transfer</span>
                    <span className="text-[11px] text-slate-500">{storeSettings.bank_name ? `${storeSettings.bank_name} · IBAN transfer` : 'IBAN transfer'}</span>
                  </button>

                  ) : null}
                </div>
                {/* Card payments are not offered until a real payment gateway is connected */}
              </div>

              {/* Order Final Summary */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Cart Items ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span className="font-semibold text-slate-900">PKR {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery ({city})</span>
                  <span className="font-semibold text-slate-900">
                    {shippingFee === 0 ? (
                      <span className="text-emerald-600 font-bold">FREE Delivery</span>
                    ) : (
                      `PKR ${shippingFee}`
                    )}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Coupon ({appliedCoupon})</span>
                    <span>-PKR {discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>Grand Total to Pay:</span>
                  <span className="text-base text-blue-700">
                    PKR {grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-[0.99]"
              >
                {loading ? 'Processing & Reserving Inventory...' : `Confirm Order (PKR ${grandTotal.toLocaleString()})`}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
