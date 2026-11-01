import React, { useState, useEffect } from 'react';
import { mediaUrl } from '../../lib/api';
import { 
  Plus, Search, Edit2, Trash2, Download, Eye, 
  Check, X, AlertCircle, Sparkles, Filter, Image as ImageIcon
} from 'lucide-react';
import { Product, Category } from '../../types';

interface AdminProductsProps {
  categories: Category[];
}

export const AdminProducts: React.FC<AdminProductsProps> = ({ categories }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formCostPrice, setFormCostPrice] = useState<number | ''>('');
  const [formRegularPrice, setFormRegularPrice] = useState<number | ''>('');
  const [formDiscountPrice, setFormDiscountPrice] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>(20);
  const [formLowStock, setFormLowStock] = useState<number | ''>(5);
  const [formBrand, setFormBrand] = useState('');
  const [formShortDesc, setFormShortDesc] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSpecs, setFormSpecs] = useState('{\n  "Origin": "Pakistan",\n  "Material": "Premium Grade"\n}');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgUrlInput, setImgUrlInput] = useState('');
  const [formIsFeatured, setFormIsFeatured] = useState(false);
  const [formIsPublished, setFormIsPublished] = useState(true);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    fetch('/api/admin/products')
      .then((res) => res.json())
      .then((d) => setProducts(d.products || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormSku(`AC-SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormCategory(categories[0]?.id || '');
    setFormCostPrice('');
    setFormRegularPrice('');
    setFormDiscountPrice('');
    setFormStock(25);
    setFormLowStock(5);
    setFormBrand('');
    setFormShortDesc('');
    setFormDesc('');
    setFormSpecs('{}');
    setFormImages([]);
    setFormIsFeatured(false);
    setFormIsPublished(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormCategory(p.category_id || '');
    setFormCostPrice(p.cost_price);
    setFormRegularPrice(p.regular_price);
    setFormDiscountPrice(p.discount_price || '');
    setFormStock(p.stock_quantity);
    setFormLowStock(p.low_stock_threshold || 5);
    setFormBrand(p.brand || '');
    setFormShortDesc(p.short_description || '');
    setFormDesc(p.description || '');
    setFormSpecs(p.specifications || '');
    setFormImages(p.primary_image ? [p.primary_image] : []);
    // load the full gallery so saving never drops extra photos
    fetch(`/api/admin/products/${p.id}/experience`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.images) && d.images.length) {
          const ordered = [...d.images].sort((a: any, b: any) => (b.is_primary - a.is_primary) || (a.display_order - b.display_order));
          setFormImages(ordered.map((x: any) => x.image_url));
        }
      })
      .catch(() => {});
    setFormIsFeatured(p.is_featured === 1);
    setFormIsPublished(p.is_published === 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formSku.trim() || formCostPrice === '' || formRegularPrice === '') {
      setFormError('Please fill in product name, SKU, wholesale cost, and regular price.');
      return;
    }

    setSaving(true);
    const imagesArray = formImages.map((s) => s.trim()).filter((s) => s.length > 0);

    const payload = {
      name: formName.trim(),
      sku: formSku.trim(),
      category_id: formCategory || null,
      cost_price: Number(formCostPrice),
      regular_price: Number(formRegularPrice),
      discount_price: formDiscountPrice !== '' ? Number(formDiscountPrice) : null,
      stock_quantity: Number(formStock || 0),
      low_stock_threshold: Number(formLowStock || 5),
      brand: formBrand.trim(),
      short_description: formShortDesc.trim(),
      description: formDesc.trim(),
      specifications: formSpecs,
      images: imagesArray,
      is_featured: formIsFeatured ? 1 : 0,
      is_published: formIsPublished ? 1 : 0,
    };

    try {
      const url = editingProduct
        ? `/api/admin/products/${editingProduct.id}`
        : '/api/admin/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message || 'Error saving product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from the store catalog?`)) {
      return;
    }
    try {
      await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Product Catalogue & Inventory Pricing
          </h1>
          <p className="text-xs text-slate-500">
            Control retail pricing, wholesale supplier costs, stock thresholds, and specifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/export/products"
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search SKU, name, or brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-hidden"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden font-medium"
          >
            <option value="all">All Categories ({products.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Product & SKU</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Wholesale Cost</th>
                <th className="px-4 py-3 text-right">Retail Price</th>
                <th className="px-4 py-3 text-right">Gross Spread</th>
                <th className="px-4 py-3 text-center">In Stock</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const currentSelling = p.discount_price || p.regular_price;
                const margin = currentSelling - p.cost_price;
                const marginPercent = Math.round((margin / currentSelling) * 100);

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.primary_image ? mediaUrl(p.primary_image) : undefined}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                        <div>
                          <span className="font-semibold text-slate-900 block line-clamp-1 max-w-xs">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            SKU: {p.sku} {p.brand ? `&middot; ${p.brand}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {p.category_name || 'Curated'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      PKR {p.cost_price.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      PKR {currentSelling.toLocaleString()}
                      {p.discount_price && (
                        <span className="block text-[10px] text-slate-400 line-through">
                          PKR {p.regular_price.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-emerald-600 block">
                        +PKR {margin.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {marginPercent}% spread
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.stock_quantity <= (p.low_stock_threshold || 5)
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {p.stock_quantity} units
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.is_published === 1
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {p.is_published === 1 ? 'Live' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-1 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded transition"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-900">
                {editingProduct ? 'Edit Product Details' : 'Add New Curated Product'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="overflow-y-auto flex-1 p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Product name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full text-xs uppercase px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Cost Price (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="1500"
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Regular Retail Price (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="3500"
                    value={formRegularPrice}
                    onChange={(e) => setFormRegularPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Discount Price (PKR, Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="2990"
                    value={formDiscountPrice}
                    onChange={(e) => setFormDiscountPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Stock Units
                  </label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={formLowStock}
                    onChange={(e) => setFormLowStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product photos <span className="font-normal text-slate-500">— the first photo is the main image (shop cards, 3D shelf, basket)</span>
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {formImages.length === 0 ? (
                      <p className="mb-3 text-xs text-slate-500">No photos yet. Upload the real product photographs — customers see these in the 2D store and in the 3D product panel.</p>
                    ) : (
                      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {formImages.map((u, i) => (
                          <div key={u + i} className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-white ${i === 0 ? 'border-blue-500' : 'border-transparent'}`}>
                            <img src={mediaUrl(u)} alt="" className="h-full w-full object-cover" />
                            {i === 0 && <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">MAIN</span>}
                            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 p-1 opacity-0 transition group-hover:opacity-100">
                              {i !== 0 ? (
                                <button type="button" onClick={() => setFormImages([u, ...formImages.filter((_, k) => k !== i)])} className="rounded px-1 text-[10px] font-bold text-white hover:bg-white/20">Make main</button>
                              ) : <span />}
                              <button type="button" onClick={() => setFormImages(formImages.filter((_, k) => k !== i))} className="rounded px-1 text-[10px] font-bold text-rose-200 hover:bg-white/20">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 ${imgBusy ? 'pointer-events-none opacity-60' : ''}`}>
                        {imgBusy ? 'Uploading…' : 'Upload photos'}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            e.target.value = '';
                            if (!files.length) return;
                            setImgBusy(true);
                            setFormError(null);
                            const added: string[] = [];
                            for (const f of files) {
                              try {
                                const res = await fetch(`/api/admin/uploads?kind=image&filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
                                const d = await res.json();
                                if (!res.ok) throw new Error(d.error || 'Upload failed');
                                added.push(d.url);
                              } catch (err: any) {
                                setFormError(`${f.name}: ${err.message}`);
                              }
                            }
                            setFormImages((list) => [...list, ...added]);
                            setImgBusy(false);
                          }}
                        />
                      </label>
                      <input
                        value={imgUrlInput}
                        onChange={(e) => setImgUrlInput(e.target.value)}
                        placeholder="…or paste an image link"
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        disabled={!/^https?:\/\//i.test(imgUrlInput.trim())}
                        onClick={() => { setFormImages([...formImages, imgUrlInput.trim()]); setImgUrlInput(''); }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      >
                        Add link
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">JPG, PNG or WebP up to 10 MB each. Video, 3D model, dimensions, colours and shelf placement are in <b>3D Store &amp; Shelves → Product experience</b>.</p>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Detailed craftsmanship and product specifications..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                  ></textarea>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Specifications (JSON Format)
                  </label>
                  <textarea
                    rows={3}
                    value={formSpecs}
                    onChange={(e) => setFormSpecs(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden font-mono text-[11px]"
                  ></textarea>
                </div>

                <div className="sm:col-span-2 flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsFeatured}
                      onChange={(e) => setFormIsFeatured(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    Featured on Storefront
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsPublished}
                      onChange={(e) => setFormIsPublished(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    Published / Live for Customers
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition"
                >
                  {saving ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
