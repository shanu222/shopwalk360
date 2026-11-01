import React, { useState, useEffect } from 'react';
import { ProductImage as ProductPhoto } from './ProductImage';
import { DemoVideo } from './store3d/product/DemoVideo';
import { X, Star, ShoppingBag, ShieldCheck, Truck, RotateCcw, Heart, Check, Plus, Minus, Info } from 'lucide-react';
import { Product, ProductImage, Review } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  onToggleWishlist: (productId: string) => void;
  isWishlisted: boolean;
  onSelectProduct?: (p: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  isWishlisted,
  onSelectProduct,
}) => {
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [full, setFull] = useState<any>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'details' | 'specs' | 'reviews'>('details');

  // Review form state
  const [reviewerName, setReviewerName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    if (!product || !isOpen) return;

    setSelectedImage(product.primary_image || '');
    setFull(null);
    setRelated([]);
    setQuantity(1);
    setActiveTab('details');

    // Fetch full images and reviews
    fetch(`/api/products/${product.slug || product.id}`)
      .then((res) => res.json())
      .then((data) => {
        setFull(data.product || null);
        setRelated(Array.isArray(data.related) ? data.related : []);
        if (data.images && data.images.length > 0) {
          setImages(data.images);
          setSelectedImage(data.images[0].image_url);
        } else if (product.primary_image) {
          setSelectedImage(product.primary_image);
        }
        if (data.reviews) {
          setReviews(data.reviews);
        }
      })
      .catch((err) => console.error('Error fetching details:', err));
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const currentPrice = product.discount_price || product.regular_price;
  const hasDiscount = product.discount_price && product.discount_price < product.regular_price;
  const discountPercent = hasDiscount
    ? Math.round(((product.regular_price - product.discount_price!) / product.regular_price) * 100)
    : 0;

  let parsedSpecs: Record<string, string> = {};
  try {
    if (product.specifications) {
      parsedSpecs = typeof product.specifications === 'string'
        ? JSON.parse(product.specifications)
        : product.specifications;
    }
  } catch (e) {
    parsedSpecs = {};
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName || !reviewTitle || !reviewComment) return;

    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/products/${product.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_name: reviewerName,
          rating: reviewRating,
          title: reviewTitle,
          comment: reviewComment,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReviewSuccess(true);
        setReviews([
          {
            id: `rev_${Date.now()}`,
            product_id: product.id,
            reviewer_name: reviewerName,
            rating: reviewRating,
            title: reviewTitle,
            comment: reviewComment,
            is_verified_purchase: 1,
            created_at: new Date().toISOString(),
          },
          ...reviews,
        ]);
        setReviewTitle('');
        setReviewComment('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto flex-1 p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Gallery & Zoom Preview */}
            <div className="flex flex-col gap-4">
              <div className="relative aspect-square w-full rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                <ProductPhoto
                  key={selectedImage || product.primary_image || 'none'}
                  src={selectedImage || product.primary_image}
                  alt={product.name}
                  loading="eager"
                  className="w-full h-full object-cover object-center transition-all duration-300 animate-[fadeIn_.3s_ease]"
                />
                {hasDiscount && (
                  <span className="absolute top-3 left-3 bg-rose-500 text-white font-bold text-xs px-2.5 py-1 rounded-full shadow-md">
                    SAVE {discountPercent}%
                  </span>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImage(img.image_url)}
                      className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition shrink-0 ${
                        selectedImage === img.image_url
                          ? 'border-[#c8a96a] ring-2 ring-[#e2c88f]'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <ProductPhoto src={img.image_url} alt="" compact className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

            </div>

            {/* Right: Product Details, Actions, Pricing */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-[#8a6a2f] uppercase tracking-wider mb-2">
                  <span>{product.category_name || 'Curated Collection'}</span>
                  <span className="text-slate-600 font-normal">SKU: {product.sku}</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight mb-3">
                  {product.name}
                </h1>

                {/* Rating Overview */}
                <div className="flex items-center gap-2 mb-4">
                  {reviews.length ? (
                    <>
                      <div className="flex items-center text-amber-400">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-4 h-4 text-amber-400 ${s <= Math.round(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) ? 'fill-amber-400' : ''}`} />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-900">{(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)}</span>
                      <span className="text-xs text-slate-600">({reviews.length} review{reviews.length === 1 ? '' : 's'})</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">No reviews yet</span>
                  )}
                </div>

                {/* Pricing Box */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900">
                      PKR {currentPrice.toLocaleString()}
                    </span>
                    {hasDiscount && (
                      <span className="text-sm text-slate-600 line-through">
                        PKR {product.regular_price.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Pay cash on delivery when your order arrives.
                  </p>
                </div>

                {/* Stock Status */}
                <div className="flex items-center gap-2 mb-5 text-xs font-medium">
                  {product.stock_quantity > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      In Stock ({product.stock_quantity} available for dispatch)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                      Sold Out
                    </span>
                  )}
                  <span className="text-slate-600">Brand: {product.brand || '—'}</span>
                </div>

                {/* Quantity Selector & Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                  <div className="flex items-center border border-slate-300 rounded-xl bg-white p-1 shrink-0">
                    <button
                      type="button"
                      disabled={quantity <= 1}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center font-bold text-sm text-slate-900">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      disabled={quantity >= product.stock_quantity}
                      onClick={() => setQuantity((q) => Math.min(product.stock_quantity, q + 1))}
                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={product.stock_quantity <= 0}
                    onClick={() => {
                      onAddToCart(product, quantity);
                    }}
                    className="flex-1 py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Add to Cart
                  </button>

                  <button
                    type="button"
                    disabled={product.stock_quantity <= 0}
                    onClick={() => {
                      onBuyNow(product, quantity);
                    }}
                    className="flex-1 py-3 px-5 rounded-xl bg-[#1a1712] hover:bg-[#2c271f] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    Buy Now
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleWishlist(product.id)}
                    className={`p-3 rounded-xl border transition ${
                      isWishlisted
                        ? 'border-rose-300 bg-rose-50 text-rose-600'
                        : 'border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-900'
                    }`}
                    title={isWishlisted ? 'Saved in wishlist' : 'Save to wishlist'}
                  >
                    <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-rose-600' : ''}`} />
                  </button>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                  <Truck className="h-4 w-4 shrink-0 text-[#8a6a2f]" />
                  <span>Cash on delivery available · Track your order any time from the header</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabbed Section: Details, Specs, Verified Reviews */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
              <button
                onClick={() => setActiveTab('details')}
                className={`pb-3 text-sm font-semibold transition border-b-2 ${
                  activeTab === 'details'
                    ? 'border-[#c8a96a] text-[#8a6a2f]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview & Description
              </button>
              <button
                onClick={() => setActiveTab('specs')}
                className={`pb-3 text-sm font-semibold transition border-b-2 ${
                  activeTab === 'specs'
                    ? 'border-[#c8a96a] text-[#8a6a2f]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Detailed Specifications
              </button>
              <button
                onClick={() => setActiveTab('reviews')}
                className={`pb-3 text-sm font-semibold transition border-b-2 ${
                  activeTab === 'reviews'
                    ? 'border-[#c8a96a] text-[#8a6a2f]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Customer Reviews ({reviews.length})
              </button>
            </div>

            {/* Tab 1: Overview */}
            {activeTab === 'details' && (
              <div className="text-sm text-slate-700 leading-relaxed space-y-4">
                {product.description ? <p>{product.description}</p> : <p className="text-slate-500">No description has been added for this product yet.</p>}
                {product.short_description && (
                  <div className="p-4 bg-[#faf6ec] border border-[#eadfc4] rounded-xl text-[#5c4a22] text-xs leading-normal">
                    <span className="font-bold block mb-1">In short</span>
                    {product.short_description}
                  </div>
                )}
                {full?.demo_video_url && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-900">Watch how it works</h4>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
                      <DemoVideo url={full.demo_video_url} type={full.demo_video_type} poster={full.demo_video_poster} captions={full.demo_video_captions} title={full.demo_video_title || product.name} />
                    </div>
                  </div>
                )}
                {full?.features && (
                  <div>
                    <h4 className="mb-2 text-sm font-bold text-slate-900">Features</h4>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {String(full.features).split('\n').map((f: string) => f.trim()).filter(Boolean).map((f: string) => (
                        <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(() => {
                  let d: any = null;
                  try { d = full?.dimensions_json ? JSON.parse(full.dimensions_json) : null; } catch { d = null; }
                  const info: [string, string | null][] = [
                    ['Dimensions', d && (d.w || d.h || d.d) ? `${d.w ?? '–'} × ${d.h ?? '–'} × ${d.d ?? '–'} cm (W × H × D)` : null],
                    ['Weight', full?.weight_kg ? `${full.weight_kg} kg` : null],
                    ['In the box', full?.in_the_box || null],
                    ['How to use', full?.usage_instructions || null],
                    ['Care', full?.care_instructions || null],
                    ['Warranty & returns', full?.warranty || null],
                  ];
                  const rows = info.filter(([, v]) => v);
                  if (!rows.length) return null;
                  return (
                    <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                      {rows.map(([k, v]) => (
                        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
                          <dt className="text-xs font-semibold text-slate-800">{k}</dt>
                          <dd className="whitespace-pre-line text-xs text-slate-600 sm:col-span-2">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                })()}
              </div>
            )}

            {/* Tab 2: Specifications */}
            {activeTab === 'specs' && (
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(parsedSpecs).map(([key, value], idx) => (
                      <tr key={key} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 w-1/3">{key}</td>
                        <td className="px-4 py-2.5 text-slate-600">{String(value)}</td>
                      </tr>
                    ))}
                    {Object.keys(parsedSpecs).length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-slate-500">
                          The seller hasn’t listed specifications for this product yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Customer Reviews */}
            {activeTab === 'reviews' && (
              <div className="space-y-6">
                {/* Submit Review Card */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Write a Verified Review</h4>
                  {reviewSuccess ? (
                    <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      Thank you! Your verified customer review has been added.
                    </div>
                  ) : (
                    <form onSubmit={handleReviewSubmit} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Your Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Asad Rehman"
                            value={reviewerName}
                            onChange={(e) => setReviewerName(e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-[#c8a96a] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Rating
                          </label>
                          <select
                            value={reviewRating}
                            onChange={(e) => setReviewRating(Number(e.target.value))}
                            className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-[#c8a96a] focus:outline-hidden"
                          >
                            <option value={5}>⭐⭐⭐⭐⭐ (5/5) - Outstanding</option>
                            <option value={4}>⭐⭐⭐⭐ (4/5) - Very Good</option>
                            <option value={3}>⭐⭐⭐ (3/5) - Average</option>
                            <option value={2}>⭐⭐ (2/5) - Below Expectation</option>
                            <option value={1}>⭐ (1/5) - Disappointed</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Review Headline
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Excellent build quality, tested in Lahore"
                          value={reviewTitle}
                          onChange={(e) => setReviewTitle(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-[#c8a96a] focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Your Experience
                        </label>
                        <textarea
                          required
                          rows={2}
                          placeholder="Write honest feedback about packaging, durability, performance..."
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-[#c8a96a] focus:outline-hidden"
                        ></textarea>
                      </div>
                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="px-4 py-2 bg-slate-900 hover:bg-[#2c271f] text-white rounded-lg text-xs font-semibold transition"
                      >
                        {submittingReview ? 'Posting...' : 'Submit Review'}
                      </button>
                    </form>
                  )}
                </div>

                {/* Reviews List */}
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{rev.reviewer_name}</span>
                          {rev.is_verified_purchase === 1 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Verified Purchase
                            </span>
                          )}
                        </div>
                        <div className="flex text-amber-400">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </div>
                      <h5 className="text-xs font-semibold text-slate-800 mb-1">{rev.title}</h5>
                      <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                    </div>
                  ))}
                  {reviews.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No reviews yet. Bought this product? Be the first to review it.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {related.length > 0 && (
            <div className="mt-10 border-t border-slate-200 pt-6">
              <h4 className="mb-4 text-sm font-bold text-slate-900">You may also like</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {related.map((r) => {
                  const price = r.discount_price || r.regular_price;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelectProduct?.(r)}
                      disabled={!onSelectProduct}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div className="aspect-square overflow-hidden bg-slate-100">
                        <ProductPhoto src={r.primary_image} alt={r.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-2 text-xs font-semibold text-slate-900">{r.name}</div>
                        <div className="mt-1 text-xs font-bold text-slate-900">PKR {price.toLocaleString()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
