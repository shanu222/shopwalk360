export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'admin' | 'manager' | 'customer';
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image_url?: string;
  display_order: number;
  product_count?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  sku: string;
  category_id?: string;
  category_name?: string;
  category_slug?: string;
  description: string;
  short_description?: string;
  specifications?: string;
  cost_price: number;
  regular_price: number;
  discount_price?: number;
  stock_quantity: number;
  low_stock_threshold?: number;
  is_featured: number;
  is_published: number;
  brand?: string;
  primary_image?: string;
  review_count?: number;
  average_rating?: number;
  demo_video_url?: string;
  demo_video_type?: 'file' | 'youtube' | 'vimeo' | string;
  demo_video_poster?: string;
  demo_video_captions?: string;
  demo_video_title?: string;
  tryon_type?: TryOnType;
  color_options?: string;
  size_options?: string;
  dimensions_json?: string;
  model_3d_url?: string;
  model_scale?: number | null;
  model_rotation_deg?: number | null;
  model_preset?: string;
  features?: string;
  in_the_box?: string;
  usage_instructions?: string;
  care_instructions?: string;
  ingredients?: string;
  wearable_slot?: WearableSlot | null;
  color_hex_map?: string;
  is_sample?: number;
  warranty?: string;
  weight_kg?: number;
  created_at?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  color?: string;
  size?: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text?: string;
  display_order: number;
  is_primary: number;
}

export interface Review {
  id: string;
  product_id: string;
  reviewer_name: string;
  rating: number;
  title: string;
  comment: string;
  is_verified_purchase: number;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  unit_price: number;
  cost_price: number;
  quantity: number;
  total_price: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  province: string;
  postal_code?: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total_amount: number;
  coupon_code?: string;
  delivery_instructions?: string;
  courier_partner?: string;
  tracking_number?: string;
  created_at: string;
  item_count?: number;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  business_name: string;
  contact_person: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  city: string;
  country: string;
  address: string;
  supplier_type: string;
  payment_terms: string;
  return_policy: string;
  reliability_rating: number;
  quality_rating: number;
  notes?: string;
  supplied_products_count?: number;
  total_purchase_orders?: number;
}

export interface SourcingResearch {
  id: string;
  title: string;
  category_id?: string;
  category_name?: string;
  description?: string;
  image_url?: string;
  source_city: string;
  source_country: string;
  supplier_name?: string;
  sample_cost: number;
  wholesale_cost: number;
  moq: number;
  est_shipping_cost: number;
  expected_selling_price: number;
  competitor_prices?: string;
  estimated_demand: string;
  competition_level: string;
  quality_assessment?: string;
  notes?: string;
  status: string;
  score_quality: number;
  score_profit: number;
  score_demand: number;
  score_competition: number;
  score_shipping: number;
  score_supplier: number;
  score_repeat: number;
  total_score: number;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_phone?: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  other_expenses: number;
  total_cost: number;
  payment_status: string;
  expected_date?: string;
  notes?: string;
  item_count?: number;
  created_at: string;
}

export interface ProfitabilityRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  supplierCost: number;
  inboundShipping: number;
  packagingCost: number;
  totalLandedCost: number;
  sellingPrice: number;
  paymentFee: number;
  deliverySubsidy: number;
  contributionProfit: number;
  contributionMarginPercent: number;
  unitsSold: number;
  totalGeneratedContribution: number;
}

export type TryOnType = 'fashion' | 'footwear' | 'watch' | 'furniture' | 'beauty' | 'electronics' | 'none';

export type WearableSlot = 'top' | 'bottom' | 'shoes' | 'watch' | 'glasses' | 'bag' | 'lips';

export type HairStyle =
  | 'short' | 'parted' | 'curly' | 'bun' | 'bob' | 'long' | 'buzz' | 'ponytail' | 'waves' | 'headscarf';

export interface AvatarConfig {
  version?: 2;
  gender: 'neutral' | 'female' | 'male'; // body frame used for proportions only
  bodyType?: 'slim' | 'average' | 'broad' | 'curvy';
  skinTone: string;
  hairColor: string; // also used as headscarf colour when hairStyle = 'headscarf'
  hairStyle: HairStyle;
  eyeColor?: string;
  facialHair?: 'none' | 'stubble' | 'beard' | 'moustache';
  lipColor?: string;
  topStyle?: 'tee' | 'shirt' | 'jacket' | 'knit';
  outfitColor: string; // top colour
  bottomStyle?: 'trousers' | 'jeans' | 'skirt' | 'shorts';
  pantsColor: string;
  shoeStyle?: 'sneakers' | 'formal' | 'boots';
  shoesColor: string;
  heightScale: number; // 0.9 – 1.12
  accessories: {
    glasses: boolean;
    watch: boolean;
    shoppingBasket: boolean;
    bag?: boolean;
  };
  glassesStyle?: 'optical' | 'sun';
  glassesColor?: string;
  watchCaseColor?: string;
  watchStrap?: 'leather' | 'metal' | 'silicone';
  watchStrapColor?: string;
  bagColor?: string;
  /** GLB model produced by an external photo-to-avatar service (optional) */
  glbUrl?: string;
  source?: 'preset' | 'photo-estimate' | 'custom' | 'provider';
  avatarName: string;
  /** @deprecated photographs are never stored; kept only so old saved configs still parse */
  customPhotoUrl?: string;
}

/** Garment / accessory currently being tried on by the in-store avatar */
export interface TryOnOverride {
  productId: string;
  productName: string;
  slot: WearableSlot;
  colorName: string;
  colorHex: string;
  size?: string;
  price?: number;
}

export interface StoreDepartment {
  id: string;
  category_id?: string;
  category_slug?: string;
  slug?: string;
  name: string;
  sign_label: string;
  aisle_number: number;
  pos_x: number;
  pos_z: number;
  theme_color: string;
  description?: string;
  shelf_count?: number;
  portal_x?: number;
  portal_z?: number;
  icon?: string;
  demo_pedestal_label?: string;
  slot_index?: number;
  interior_style?: InteriorStyle;
  lighting?: 'warm' | 'neutral' | 'cool';
  info_text?: string;
  entrance_style?: string;
  is_active?: number;
  category_name?: string;
}

export type InteriorStyle =
  | 'tech' | 'warm_wood' | 'kitchen' | 'boutique' | 'concrete' | 'luxury'
  | 'spa' | 'gym' | 'garage' | 'travel' | 'study' | 'gallery';

export type FixtureType =
  | 'gondola' | 'double_tier' | 'endcap_promo' | 'wall_mount' | 'glass_cabinet' | 'demo_table' | 'demo_kitchen'
  | 'island_display' | 'mannequin' | 'clothing_rack' | 'shoe_wall' | 'vanity' | 'room_set' | 'fitting_station';

export interface StoreShelf {
  id: string;
  department_id: string;
  shelf_code: string;
  aisle_label: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  rotation_y: number;
  shelf_type: FixtureType;
  slot_code?: string;
  shelf_level?: number;
  facing_count?: number;
  zone?: 'display' | 'demo';
  product_id?: string;
  featured_label?: string;
  demo_video_url?: string;
  tryon_type?: TryOnType;
  color_options?: string;
  size_options?: string;
  // Joined product fields
  product_name?: string;
  product_slug?: string;
  product_sku?: string;
  regular_price?: number;
  discount_price?: number;
  cost_price?: number;
  stock_quantity?: number;
  product_brand?: string;
  short_description?: string;
  primary_image?: string;
  average_rating?: number;
  review_count?: number;
  department_name?: string;
  department_sign?: string;
  theme_color?: string;
  department_number?: number;
  product_tryon_type?: TryOnType;
  model_preset?: string;
  model_3d_url?: string;
  model_scale?: number | null;
  model_rotation_deg?: number | null;
  wearable_slot?: WearableSlot | null;
  product_color_options?: string;
  color_hex_map?: string;
  dimensions_json?: string;
  product_video_url?: string;
  product_video_type?: string;
  product_video_poster?: string;
  is_sample?: number;
}

export interface PromoScreen {
  id: string;
  location: string;
  title: string;
  subtitle?: string;
  product_id?: string;
  product_name?: string;
  product_slug?: string;
  regular_price?: number;
  discount_price?: number;
  primary_image?: string;
  accent_color?: string;
  display_order?: number;
  is_active?: number;
}

export interface StoreLayoutV2 {
  storeName: string;
  departments: StoreDepartment[];
  shelves: StoreShelf[];
  promos: PromoScreen[];
  layoutVersion: number;
}

export interface ExperienceIntegrations {
  avatarGeneration: boolean;
  garmentTryOn: boolean;
  aiAssistant: boolean;
}

export interface Store3DLayout {
  storeMeta: {
    name: string;
    tagline: string;
    entrance: { x: number; z: number };
    reception: { x: number; z: number };
    checkout: { x: number; z: number };
    infoDesk: { x: number; z: number };
    dimensions: { width: number; length: number; height: number };
  };
  departments: StoreDepartment[];
  shelves: StoreShelf[];
}
