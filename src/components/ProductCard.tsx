import React from 'react';
import { Heart, ShoppingBag, Star, CheckCircle, Shield, Eye } from 'lucide-react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  isWishlisted: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onQuickView,
  onToggleWishlist,
  isWishlisted,
}) => {
  const currentPrice = product.discount_price || product.regular_price;
  const hasDiscount = product.discount_price && product.discount_price < product.regular_price;
  const discountPercent = hasDiscount
    ? Math.round(((product.regular_price - product.discount_price!) / product.regular_price) * 100)
    : 0;

  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;
  const isOutOfStock = product.stock_quantity <= 0;

  return (
    <div className="group relative bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
      {/* Image Container with Badges */}
      <div className="relative aspect-square w-full bg-slate-100 overflow-hidden cursor-pointer" onClick={() => onQuickView(product)}>
        <img
          src={product.primary_image || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80'}
          alt={product.name}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start z-10">
          {hasDiscount && (
            <span className="bg-rose-500 text-white font-bold text-[11px] px-2 py-0.5 rounded-full shadow-xs">
              SAVE {discountPercent}%
            </span>
          )}
          {product.is_featured === 1 && (
            <span className="bg-blue-600 text-white font-medium text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
              Curated Choice
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className={`absolute top-3 right-3 p-2 rounded-full transition-all duration-200 z-10 shadow-xs ${
            isWishlisted
              ? 'bg-rose-50 text-rose-600'
              : 'bg-white/90 text-slate-500 hover:text-rose-600 hover:bg-white'
          }`}
          title={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-600 text-rose-600' : ''}`} />
        </button>

        {/* Quick View Overlay Button */}
        <div className="absolute inset-x-0 bottom-3 px-3 hidden group-hover:flex justify-center transition-all duration-300">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            className="w-full bg-white/95 hover:bg-white text-slate-800 text-xs font-semibold py-2 px-3 rounded-xl shadow-lg border border-slate-200 flex items-center justify-center gap-1.5 backdrop-blur-xs transition"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            Quick Inspect & Specs
          </button>
        </div>
      </div>

      {/* Product Content Details */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Category & Verified Source origin */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
            <span className="font-medium text-blue-700 uppercase tracking-wide">
              {product.category_name || 'Curated'}
            </span>
            <span className="flex items-center gap-1 text-slate-600">
              <Shield className="w-3 h-3 text-emerald-600" />
              Verified Sourced
            </span>
          </div>

          {/* Title */}
          <h3
            onClick={() => onQuickView(product)}
            className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition line-clamp-2 cursor-pointer leading-snug mb-2"
            title={product.name}
          >
            {product.name}
          </h3>

          {/* Ratings (only when real reviews exist) */}
          <div className="flex items-center gap-1.5 mb-2.5 min-h-[18px]">
            {product.review_count ? (
              <>
                <div className="flex items-center text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="ml-1 text-xs font-bold text-slate-800">{Number(product.average_rating || 0).toFixed(1)}</span>
                </div>
                <span className="text-[11px] text-slate-600">({product.review_count} review{product.review_count === 1 ? '' : 's'})</span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400">No reviews yet</span>
            )}
          </div>
        </div>

        {/* Pricing, Stock Status, and Add to Cart */}
        <div className="pt-2 border-t border-slate-100 mt-2">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-base font-extrabold text-slate-900">
                PKR {currentPrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="ml-2 text-xs text-slate-600 line-through">
                  PKR {product.regular_price.toLocaleString()}
                </span>
              )}
            </div>

            {/* Stock indicator */}
            {isOutOfStock ? (
              <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                Sold Out
              </span>
            ) : isLowStock ? (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                Only {product.stock_quantity} left
              </span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> In Stock
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => onAddToCart(product)}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-blue-600 text-white shadow-xs active:scale-[0.98]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {isOutOfStock ? 'Temporarily Unavailable' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};
