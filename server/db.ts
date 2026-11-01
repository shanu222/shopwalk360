import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

// Initialize SQLite Database with WAL mode for high concurrency
import fs from 'fs';

// DATABASE_PATH lets Railway keep the database on a persistent volume (e.g. /data/shopwalk360.db).
// On first boot the bundled catalogue database is copied there.
const bundled = path.resolve(process.cwd(), 'ecommerce.db');
const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : bundled;
if (dbPath !== bundled && !fs.existsSync(dbPath)) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(bundled)) fs.copyFileSync(bundled, dbPath);
}
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** scrypt with a random per-user salt: "scrypt$<salt>$<hash>" */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function legacyHash(password: string): string {
  return crypto.pbkdf2Sync(password, 'auracommerce_salt_2026', 1000, 64, 'sha512').toString('hex');
}

/** Constant-time check; also accepts hashes created by the previous scheme. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  let candidate: Buffer;
  let expected: Buffer;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    expected = Buffer.from(hash || '', 'hex');
    candidate = crypto.scryptSync(password, salt, expected.length || 64, { N: 16384, r: 8, p: 1 });
  } else {
    expected = Buffer.from(stored, 'hex');
    candidate = Buffer.from(legacyHash(password), 'hex');
  }
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function isLegacyHash(stored: string | null | undefined) {
  return !!stored && !stored.startsWith('scrypt$');
}

export function initDatabase() {
  db.exec(`
    -- 1. Users & Roles
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'customer', -- 'admin', 'manager', 'customer'
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      default_address_id TEXT,
      notes TEXT,
      total_spent REAL DEFAULT 0,
      orders_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT DEFAULT 'Home',
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT,
      is_default INTEGER DEFAULT 0
    );

    -- 2. Categories & Products
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      short_description TEXT,
      specifications TEXT, -- JSON string
      cost_price REAL NOT NULL, -- Supplier purchase price
      regular_price REAL NOT NULL,
      discount_price REAL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      is_featured INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      brand TEXT,
      weight_kg REAL DEFAULT 0.5,
      warranty TEXT DEFAULT '7-Day Return Guarantee',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      alt_text TEXT,
      display_order INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT,
      size TEXT,
      price REAL NOT NULL,
      cost_price REAL NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0
    );

    -- 3. Supplier Management
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      city TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Pakistan',
      address TEXT NOT NULL,
      supplier_type TEXT DEFAULT 'Wholesaler', -- 'Manufacturer', 'Wholesaler', 'Importer', 'Distributor'
      payment_terms TEXT DEFAULT '30% Advance, 70% Delivery',
      return_policy TEXT DEFAULT 'Replacement on defective goods within 14 days',
      reliability_rating REAL DEFAULT 4.5,
      quality_rating REAL DEFAULT 4.5,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supplier_sku TEXT,
      wholesale_price REAL NOT NULL,
      moq INTEGER NOT NULL DEFAULT 10,
      sample_available INTEGER DEFAULT 1,
      sample_cost REAL DEFAULT 0,
      lead_time_days INTEGER DEFAULT 3,
      shipping_cost_estimate REAL DEFAULT 0,
      is_preferred INTEGER DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. Sourcing Research & Evaluation
    CREATE TABLE IF NOT EXISTS sourcing_research (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      image_url TEXT,
      source_city TEXT NOT NULL,
      source_country TEXT NOT NULL DEFAULT 'Pakistan',
      supplier_name TEXT,
      sample_cost REAL DEFAULT 0,
      wholesale_cost REAL NOT NULL,
      moq INTEGER NOT NULL DEFAULT 50,
      est_shipping_cost REAL DEFAULT 0,
      expected_selling_price REAL NOT NULL,
      competitor_prices TEXT, -- JSON or note
      estimated_demand TEXT DEFAULT 'Medium', -- 'High', 'Medium', 'Niche'
      competition_level TEXT DEFAULT 'Moderate', -- 'Low', 'Moderate', 'Intense'
      quality_assessment TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'New Idea',
      score_quality REAL DEFAULT 80,
      score_profit REAL DEFAULT 80,
      score_demand REAL DEFAULT 75,
      score_competition REAL DEFAULT 70,
      score_shipping REAL DEFAULT 85,
      score_supplier REAL DEFAULT 80,
      score_repeat REAL DEFAULT 65,
      total_score REAL DEFAULT 77,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. Purchase Orders & Procurement
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT UNIQUE NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'Draft', -- 'Draft', 'Ordered', 'Partial', 'Received', 'Cancelled'
      subtotal REAL NOT NULL DEFAULT 0,
      shipping_cost REAL NOT NULL DEFAULT 0,
      other_expenses REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'Unpaid', -- 'Unpaid', 'Partial', 'Paid'
      expected_date TEXT,
      received_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      received_qty INTEGER NOT NULL DEFAULT 0
    );

    -- 6. Inventory & Stock Ledger
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id TEXT,
      change_qty INTEGER NOT NULL,
      movement_type TEXT NOT NULL, -- 'Purchase Receive', 'Customer Order', 'Order Cancel Return', 'Manual Adjustment', 'Damage Write-off'
      reference_type TEXT,
      reference_id TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. Orders & Order Items
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      user_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT,
      status TEXT NOT NULL DEFAULT 'Order Placed',
      payment_method TEXT NOT NULL DEFAULT 'COD', -- 'COD', 'Bank Transfer', 'Online Gateway'
      payment_status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Paid', 'Refunded'
      subtotal REAL NOT NULL,
      shipping_fee REAL NOT NULL DEFAULT 200,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      coupon_code TEXT,
      delivery_instructions TEXT,
      courier_partner TEXT DEFAULT 'TCS Express',
      tracking_number TEXT,
      dispatched_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL
    );

    -- 8. Returns & Refunds
    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Requested', -- 'Requested', 'Approved', 'Items Received', 'Refunded', 'Rejected'
      items_description TEXT NOT NULL,
      refund_amount REAL NOT NULL,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );

    -- 9. Reviews & Ratings
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id TEXT,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      title TEXT NOT NULL,
      comment TEXT NOT NULL,
      is_verified_purchase INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. Coupons & Discounts
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage', 'fixed'
      discount_value REAL NOT NULL,
      min_order_value REAL DEFAULT 0,
      max_discount REAL,
      usage_limit INTEGER DEFAULT 100,
      times_used INTEGER DEFAULT 0,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- 11. Wishlists
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id)
    );

    -- 12. Financial Expenses & Overhead
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL, -- 'Packaging', 'Marketing', 'Warehouse Rent', 'Utilities', 'Courier Loss', 'Software & Tools'
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. System Settings
    CREATE TABLE IF NOT EXISTS website_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 14. Newsletter Subscribers
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. 3D Virtual Store Departments & Shelves
    CREATE TABLE IF NOT EXISTS store_departments (
      id TEXT PRIMARY KEY,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      sign_label TEXT NOT NULL,
      aisle_number INTEGER NOT NULL,
      pos_x REAL NOT NULL,
      pos_z REAL NOT NULL,
      theme_color TEXT DEFAULT '#2563eb',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS store_shelves (
      id TEXT PRIMARY KEY,
      department_id TEXT REFERENCES store_departments(id) ON DELETE CASCADE,
      shelf_code TEXT NOT NULL,
      aisle_label TEXT NOT NULL,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL DEFAULT 0,
      pos_z REAL NOT NULL,
      rotation_y REAL NOT NULL DEFAULT 0,
      shelf_type TEXT DEFAULT 'double_tier', -- 'double_tier', 'endcap_promo', 'island_display', 'wall_mount'
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      featured_label TEXT
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_products_prod ON supplier_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_shelves_dept ON store_shelves(department_id);
  `);

  // Safe table schema migrations
  const safeAddColumn = (table: string, col: string, typeDef: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
    } catch (e) {
      // column already exists
    }
  };
  safeAddColumn('store_departments', 'portal_x', 'REAL');
  safeAddColumn('store_departments', 'portal_z', 'REAL');
  safeAddColumn('store_departments', 'icon', 'TEXT');
  safeAddColumn('store_departments', 'demo_pedestal_label', 'TEXT');

  safeAddColumn('store_shelves', 'demo_video_url', 'TEXT');
  safeAddColumn('store_shelves', 'tryon_type', 'TEXT');
  safeAddColumn('store_shelves', 'color_options', 'TEXT');
  safeAddColumn('store_shelves', 'size_options', 'TEXT');

  safeAddColumn('products', 'demo_video_url', 'TEXT');
  safeAddColumn('products', 'tryon_type', 'TEXT');
  safeAddColumn('products', 'color_options', 'TEXT');
  safeAddColumn('products', 'size_options', 'TEXT');

  seedInitialData();
  seedStore3DData();
}

function seedInitialData() {
  const userCount = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
  const settingCount = db.prepare('SELECT count(*) as count FROM website_settings').get() as { count: number };
  // A cleaned store can have zero users while settings, categories, and products remain.
  if (userCount.count > 0 || settingCount.count > 0) return;

  console.log('Seeding initial curated store data and suppliers...');

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const adminPass = hashPassword('Admin@123456');
  const customerPass = hashPassword('Customer@123456');

  insertUser.run('u_admin_1', 'admin@auracommerce.pk', adminPass, 'Ahmed Khan (Admin)', '+923001234567', 'admin');
  insertUser.run('u_cust_1', 'customer@auracommerce.pk', customerPass, 'Zainab Fatima', '+923219876543', 'customer');

  // Seed Settings
  const insertSetting = db.prepare('INSERT INTO website_settings (key, value) VALUES (?, ?)');
  insertSetting.run('store_name', 'Aura Retail Pakistan');
  insertSetting.run('store_tagline', 'Curated Quality Goods Direct from Certified Manufacturers');
  insertSetting.run('contact_phone', '+92 42 3578 9900');
  insertSetting.run('contact_whatsapp', '+92 300 1234567');
  insertSetting.run('contact_email', 'support@auracommerce.pk');
  insertSetting.run('office_address', 'Level 4, Tricon Corporate Centre, Main Boulevard, Gulberg, Lahore, Pakistan');
  insertSetting.run('free_delivery_threshold', '3500');
  insertSetting.run('standard_shipping_rate', '220');
  insertSetting.run('same_day_lahore_rate', '350');
  insertSetting.run('bank_title', 'Aura Commerce SMC Pvt Ltd');
  insertSetting.run('bank_name', 'Meezan Bank Ltd (Gulberg Branch)');
  insertSetting.run('bank_account', '02010108992341');
  insertSetting.run('bank_iban', 'PK45MEZN0002010108992341');
  insertSetting.run('sourcing_weights', JSON.stringify({
    quality: 0.25,
    profit: 0.20,
    demand: 0.20,
    competition: 0.10,
    shipping: 0.10,
    supplier: 0.10,
    repeat: 0.05
  }));

  // Seed Categories
  const categories = [
    { id: 'cat_home', slug: 'home-living', name: 'Home & Living', desc: 'Handcrafted decor, aroma diffusers, and premium minimalist home accents', img: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80', order: 1 },
    { id: 'cat_kitchen', slug: 'kitchen-accessories', name: 'Kitchen Accessories', desc: 'Precision coffee equipment, chef grade cutlery, and culinary organizers', img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80', order: 2 },
    { id: 'cat_electronics', slug: 'electronics-accessories', name: 'Electronics Accessories', desc: 'GaN high-speed chargers, braided durable cables, and audio gear', img: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80', order: 3 },
    { id: 'cat_mobile', slug: 'mobile-accessories', name: 'Mobile Accessories', desc: 'MagSafe stands, rugged shockproof cases, and charging docks', img: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=800&q=80', order: 4 },
    { id: 'cat_car', slug: 'car-accessories', name: 'Car Accessories', desc: 'Magnetic car mounts, wireless smart inflators, and car interior organizers', img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80', order: 5 },
    { id: 'cat_travel', slug: 'travel-accessories', name: 'Travel Accessories', desc: 'Waterproof packing cubes, TSA passport organizer wallets, and neck pillows', img: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80', order: 6 },
    { id: 'cat_office', slug: 'office-study', name: 'Office & Study', desc: 'Ergonomic laptop risers, vegan leather desk pads, and cable organizers', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80', order: 7 },
    { id: 'cat_lifestyle', slug: 'fashion-lifestyle', name: 'Fashion & Lifestyle', desc: 'Full-grain cowhide leather wallets, minimalist acetate sunglasses', img: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80', order: 8 },
  ];

  const insertCat = db.prepare('INSERT INTO categories (id, slug, name, description, image_url, display_order) VALUES (?, ?, ?, ?, ?, ?)');
  categories.forEach(c => insertCat.run(c.id, c.slug, c.name, c.desc, c.img, c.order));

  // Seed Suppliers
  const suppliers = [
    {
      id: 'sup_lahore_1',
      code: 'SUP-LHR-01',
      name: 'Al-Haram Electronics & Imports',
      biz: 'Al-Haram Trading Corporation',
      contact: 'Haji Muhammad Rizwan',
      phone: '+92 301 8442211',
      wa: '+92 301 8442211',
      email: 'sales@alharamimports.pk',
      city: 'Lahore',
      address: 'Shop 42, Ground Floor, Madina Market, Hall Road, Lahore',
      type: 'Direct Importer & Wholesaler',
      terms: '30% Advance, 70% Upon Dispatch Inspection',
      policy: '30-day replacement on manufacturer manufacturing faults',
      rel: 4.8,
      qual: 4.7,
      notes: 'Premier direct importer of GaN chips, charging cables, and audio electronics with fast dispatch.'
    },
    {
      id: 'sup_khi_1',
      code: 'SUP-KHI-01',
      name: 'Indus Homeware & Kitchen Crafts',
      biz: 'Indus Craftworks Pvt Ltd',
      contact: 'Kamran Siddiqui',
      phone: '+92 321 2109988',
      wa: '+92 321 2109988',
      email: 'kamran@indushome.com.pk',
      city: 'Karachi',
      address: 'Plot 18/B, Sector 15, Korangi Industrial Area, Karachi',
      type: 'Manufacturer',
      terms: '50% with PO, 50% on B/L or TCS Consignment Note',
      policy: 'Guaranteed 100% refund or replacement on chipped/damaged glassware and ceramics',
      rel: 4.9,
      qual: 4.9,
      notes: 'Produces high-grade borosilicate glassware and matte black culinary equipment.'
    },
    {
      id: 'sup_skt_1',
      code: 'SUP-SKT-01',
      name: 'Artisan Leathercraft Sialkot',
      biz: 'Vanguard Leather Goods Ltd',
      contact: 'Babar Cheema',
      phone: '+92 333 8612345',
      wa: '+92 333 8612345',
      email: 'babar@vanguardleather.pk',
      city: 'Sialkot',
      address: 'Small Industrial Estate, Daska Road, Sialkot',
      type: 'Manufacturer & Exporter',
      terms: 'Bank L/C or 40% Advance, 60% upon delivery',
      policy: 'Lifetime seam warranty; 1-year finish warranty',
      rel: 4.6,
      qual: 4.9,
      notes: 'Export-grade full-grain cowhide leather artisans. Consistent high-end stitching.'
    },
    {
      id: 'sup_chn_1',
      code: 'SUP-CHN-01',
      name: 'Yiwu Apex Logistics & Procurement Co.',
      biz: 'Apex Global Trade Ltd',
      contact: 'David Zhang (Urdu & English speaking rep)',
      phone: '+86 188 5792 1100',
      wa: '+86 188 5792 1100',
      email: 'david@apexglobal.cn',
      city: 'Shenzhen / Yiwu',
      country: 'China',
      address: 'District 2, International Trade City, Yiwu, Zhejiang',
      type: 'Wholesale Export Agent',
      terms: 'Air cargo / Sea container FOB with customs clearance support into Karachi port',
      policy: 'Inspection report provided before dispatch from Yiwu warehouse',
      rel: 4.7,
      qual: 4.6,
      notes: 'Trusted sourcing bridge for car accessories and smart home devices directly from factory floor.'
    }
  ];

  const insertSup = db.prepare(`
    INSERT INTO suppliers (id, code, name, business_name, contact_person, phone, whatsapp, email, city, country, address, supplier_type, payment_terms, return_policy, reliability_rating, quality_rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  suppliers.forEach(s => insertSup.run(s.id, s.code, s.name, s.biz, s.contact, s.phone, s.wa, s.email, s.city, s.country || 'Pakistan', s.address, s.type, s.terms, s.policy, s.rel, s.qual, s.notes));

  // Seed Products
  const products = [
    {
      id: 'prod_1',
      slug: 'gan-65w-fast-charger-braided-cable',
      name: 'Aura 65W GaN Pro Multi-Port Ultra Fast Wall Charger with 100W Braided Cable',
      sku: 'AC-EL-65W',
      catId: 'cat_electronics',
      short_desc: 'Next-gen Gallium Nitride (GaN) fast charger with 2x Type-C and 1x USB-A ports. Powers MacBooks, iPhones, and Android flagships simultaneously.',
      desc: 'Engineered with advanced Gallium Nitride III semiconductors, this ultra-compact 65W brick generates 40% less heat while charging three devices concurrently at lightning speeds. Includes an aerospace-grade braided 1.5m 100W E-Mark Type-C cable designed for 25,000+ bends. Built-in smart temperature sensors ensure overvoltage and surge protection.',
      specs: JSON.stringify({
        'Output Power': '65W Max Power Delivery 3.0 / Quick Charge 4+',
        'Port Setup': '2x USB Type-C (PD), 1x USB-A (QC 3.0)',
        'Compatibility': 'MacBook Pro/Air, iPhone 16/15/14, Samsung Galaxy S24, iPads',
        'Input Voltage': '100-240V AC 50/60Hz (Universal International)',
        'Cable Included': '1.5-meter 100W braided nylon E-marker cable',
        'Certification': 'CE, FCC, RoHS Certified Safety'
      }),
      cost: 1650,
      regular: 4200,
      discount: 3350,
      stock: 38,
      featured: 1,
      brand: 'AuraTech Pro',
      img: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1622445262464-84b1456045b6?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_lahore_1'
    },
    {
      id: 'prod_2',
      slug: 'artisanal-matte-pour-over-gooseneck-kettle',
      name: 'Precision Barista 850ml Matte Black Gooseneck Drip Kettle with Built-in Thermometer',
      sku: 'AC-KT-850K',
      catId: 'cat_kitchen',
      short_desc: 'Medical-grade 304 stainless steel pour-over kettle with ergonomic counterbalanced walnut handle and temperature gauge dial.',
      desc: 'Master the art of pour-over specialty coffee with controlled laminar liquid flow. The curved 7mm gooseneck spout gives you surgical precision over your extraction rate. Integrated dual-scale dial thermometer lets you hit the optimal 90°C–96°C brewing window every single time. Safe for induction, ceramic, and gas cooktops.',
      specs: JSON.stringify({
        'Capacity': '850 ml',
        'Material': 'Food-Grade 304 Stainless Steel (Teflon Matte Finish)',
        'Thermometer': 'Analog Bi-metallic dial (°C and °F)',
        'Handle': 'Ergonomic heat-resistant natural beechwood',
        'Spout': 'Precision 7mm Gooseneck'
      }),
      cost: 1450,
      regular: 3950,
      discount: 3100,
      stock: 24,
      featured: 1,
      brand: 'Aura Artisan Brew',
      img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_khi_1'
    },
    {
      id: 'prod_3',
      slug: 'full-grain-leather-bifold-minimalist-wallet',
      name: 'Handcrafted Full-Grain Cowhide Minimalist RFID-Shield Bifold Wallet',
      sku: 'AC-LF-WLT01',
      catId: 'cat_lifestyle',
      short_desc: 'Hand-burnished genuine vegetable-tanned cowhide leather with quick-draw card thumb slot and embedded German RFID protection foil.',
      desc: 'Crafted by master tanners in Sialkot, this slim bifold develops a gorgeous personal patina with age. It holds 8-10 cards and full-length unfolded PKR cash notes without bulging in your tailored trousers. Double-stitched with waxed polyester thread for decades of everyday durability.',
      specs: JSON.stringify({
        'Leather': '100% Genuine Full-Grain Vegetable Tanned Pakistani Leather',
        'RFID Protection': 'Certified 13.56MHz RFID/NFC shielding',
        'Capacity': '8-10 cards, 15+ currency notes, hidden quick-access pocket',
        'Dimensions': '10.5 cm x 8.2 cm x 1.1 cm (Ultra-Slim)',
        'Origin': 'Sialkot Artisan Workshops'
      }),
      cost: 920,
      regular: 2900,
      discount: 2250,
      stock: 45,
      featured: 1,
      brand: 'Sialkot Heritage Craft',
      img: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1556306535-0f09a537f0a3?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_skt_1'
    },
    {
      id: 'prod_4',
      slug: 'smart-wireless-tire-inflator-car-powerbank',
      name: 'Turbopump 150 PSI Cordless Smart Car & Bike Tire Inflator with 6000mAh Powerbank',
      sku: 'AC-CR-PUMP01',
      catId: 'cat_car',
      short_desc: 'Compact rechargeable air compressor with digital auto-stop pressure display, LED emergency torch, and USB phone charging capability.',
      desc: 'Never get stranded on motorway or remote routes with a flat tire. Sets desired pressure in PSI, BAR, or KPA with ±1 PSI precision and automatically halts when inflated. Heavy-duty metal cylinder inflates a standard sedan tire in under 5 minutes. Includes bicycle, football, and mattress nozzle adapters.',
      specs: JSON.stringify({
        'Pressure Range': '0 - 150 PSI (Auto-Stop Digital Sensor)',
        'Battery': '6000 mAh Rechargeable Lithium-ion (Type-C)',
        'Flashlight': '3-Mode SOS Emergency LED (Steady, Strobe, Red SOS)',
        'Weight': '460 grams',
        'Attachments': 'Presta valve, ball needle, inflatable boat adapter'
      }),
      cost: 2400,
      regular: 6500,
      discount: 4890,
      stock: 19,
      featured: 1,
      brand: 'Apex Motors Pro',
      img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_chn_1'
    },
    {
      id: 'prod_5',
      slug: 'ultrasonic-woodgrain-aroma-diffuser-humidifier',
      name: 'ZenMist 500ml Quiet Ultrasonic Essential Oil Aroma Diffuser with Ambient LED Glow',
      sku: 'AC-HL-ZEN500',
      catId: 'cat_home',
      short_desc: 'Whisper-quiet 24dB ultrasonic aroma humidifier with natural dark walnut grain finish, 7-color soothing aura lamp, and auto shut-off.',
      desc: 'Transform your bedroom or workspace into a serene sanctuary. Breaks pure organic essential oils and water into micro-fine soothing cool mist without heating or degrading fragile botanical compounds. Runs continuously for up to 14 hours on a single fill with 4 timer settings (1h, 3h, 6h, continuous).',
      specs: JSON.stringify({
        'Capacity': '500 ml water reservoir',
        'Coverage Area': 'Up to 350 sq ft',
        'Noise Level': 'Ultra-Quiet < 24 dB (Night Mode)',
        'Timer Modes': '1H / 3H / 6H / ON Continuous',
        'Safety': 'Waterless Auto-Off Sensor'
      }),
      cost: 1100,
      regular: 3200,
      discount: 2490,
      stock: 28,
      featured: 1,
      brand: 'Aura Living',
      img: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_lahore_1'
    },
    {
      id: 'prod_6',
      slug: 'ergonomic-aluminum-adjustable-laptop-stand',
      name: 'AeroStand 360° Rotating Ergonomic Aviation Aluminum Laptop & Tablet Riser',
      sku: 'AC-OF-ST360',
      catId: 'cat_office',
      short_desc: 'Heavy-duty CNC-milled aluminum stand with smooth 360-degree ball-bearing swivel base and anti-slip silicone pads.',
      desc: 'Eliminate neck stiffness and hunching during long work days. Holds up to 10kg with dual damping hinges that maintain your selected height and angle without sagging. Features ventilated cooling hollows that maximize laptop airflow and heat dissipation.',
      specs: JSON.stringify({
        'Material': 'Aviation-Grade Anodized Aluminum Alloy',
        'Swivel': '360° Smooth Rotational Swivel Base',
        'Compatibility': 'All laptops 10" to 17.3" (MacBook, Dell XPS, HP, Lenovo)',
        'Load Capacity': 'Up to 10 kg',
        'Foldability': 'Fully collapsable for briefcase travel'
      }),
      cost: 1350,
      regular: 3800,
      discount: 2950,
      stock: 32,
      featured: 0,
      brand: 'AeroWorkspace',
      img: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_lahore_1'
    },
    {
      id: 'prod_7',
      slug: 'waterproof-luggage-packing-cubes-7-piece-set',
      name: 'VoyagerPro 7-Piece Compression Waterproof Luggage Packing Cube Organizers',
      sku: 'AC-TR-CUBE07',
      catId: 'cat_travel',
      short_desc: 'High-density ripstop honeycomb nylon organizers with double compression zippers to save 60% suitcase space.',
      desc: 'Make travel packing and hotel unpackings effortless. Includes large clothes cube, medium shirts cube, underwear pouch, laundry shoe bag, toiletries dopp kit, and electronic cables organizer. High quality SBS smooth-glide zippers with reinforced webbing pullers.',
      specs: JSON.stringify({
        'Set Pieces': '7 Specialized Organizers',
        'Material': 'Water-Resistant 290D Honeycomb Ripstop Nylon',
        'Zippers': 'Heavy-Duty Double Compression SBS Zips',
        'Colors': 'Charcoal Slate, Forest Green, Deep Navy',
        'Weight': 'Only 380 grams total set'
      }),
      cost: 1200,
      regular: 3400,
      discount: 2650,
      stock: 40,
      featured: 0,
      brand: 'Voyager Gear',
      img: 'https://images.unsplash.com/photo-1581553680321-4fffae59fccd?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_lahore_1'
    },
    {
      id: 'prod_8',
      slug: 'magsafe-magnetic-wireless-car-charger-mount',
      name: 'HyperGrip 15W Qi Fast Charging Magnetic MagSafe Dashboard & Air Vent Car Mount',
      sku: 'AC-MB-MAG01',
      catId: 'cat_mobile',
      short_desc: '16x N52 strong neodymium magnetic array locks iPhones securely even over speed bumps while supplying rapid 15W wireless charging.',
      desc: 'Experience one-handed tap-and-go phone mounting. Includes both a military-grade steel air vent clamp and a 3M dashboard suction base with 360° ball joint. Built-in silent cooling fan dissipates battery heat during wireless charging sessions.',
      specs: JSON.stringify({
        'Magnetic Strength': '16x N52 Neodymium Ring (holds up to 1.8 kg)',
        'Wireless Output': '15W / 10W / 7.5W Qi Smart Auto-Detect',
        'Mount Types': 'Dual Attachment: Anti-Drop Air Vent Hook & 3M Dash Arm',
        'Cable': '1.2m Braided Type-C to Type-C included'
      }),
      cost: 1150,
      regular: 3100,
      discount: 2450,
      stock: 22,
      featured: 0,
      brand: 'AuraTech Pro',
      img: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=1000&q=80',
      moreImages: [
        'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'
      ],
      supId: 'sup_lahore_1'
    }
  ];

  const insertProd = db.prepare(`
    INSERT INTO products (id, slug, name, sku, category_id, description, short_description, specifications, cost_price, regular_price, discount_price, stock_quantity, is_featured, is_published, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertImg = db.prepare(`
    INSERT INTO product_images (id, product_id, image_url, alt_text, display_order, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSupProd = db.prepare(`
    INSERT INTO supplier_products (id, supplier_id, product_id, supplier_sku, wholesale_price, moq, sample_available, sample_cost, lead_time_days, shipping_cost_estimate, is_preferred)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  products.forEach(p => {
    insertProd.run(p.id, p.slug, p.name, p.sku, p.catId, p.desc, p.short_desc, p.specs, p.cost, p.regular, p.discount, p.stock, p.featured, 1, p.brand);
    insertImg.run(`img_${p.id}_0`, p.id, p.img, p.name, 0, 1);
    p.moreImages.forEach((imgUrl, idx) => {
      insertImg.run(`img_${p.id}_${idx + 1}`, p.id, imgUrl, `${p.name} angle ${idx + 1}`, idx + 1, 0);
    });
    insertSupProd.run(`sp_${p.id}`, p.supId, p.id, `SUP-${p.sku}`, p.cost, 10, 1, p.cost * 1.2, 3, 50, 1);
  });

  // Seed Product Sourcing Research Pipeline items
  const researchItems = [
    {
      id: 'res_1',
      title: 'Ultrasonic Contact Lens Cleaner with UV-C Sterilization',
      catId: 'cat_lifestyle',
      city: 'Shenzhen',
      country: 'China',
      supName: 'Shenzhen Biocare Tech Ltd',
      sample: 1800,
      wholesale: 850,
      moq: 100,
      shipping: 120,
      selling: 2850,
      comp: 'PKR 3,200 - 3,500 on Daraz/local stores',
      demand: 'High',
      compLevel: 'Low',
      quality: 'Passed CE test; medical grade 56kHz ultrasonic transducer',
      notes: 'Very high margin potential. Pakistani contact lens wearers struggle with protein deposits on lenses.',
      status: 'Ready to Purchase',
      s_qual: 88,
      s_prof: 92,
      s_dem: 84,
      s_comp: 78,
      s_ship: 90,
      s_sup: 85,
      s_rep: 70,
      score: 86.1,
      img: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'res_2',
      title: 'Chiniot Rosewood Wireless Qi Charging Valet Tray',
      catId: 'cat_home',
      city: 'Chiniot',
      country: 'Pakistan',
      supName: 'Chiniot Woodcraft Cooperative',
      sample: 2200,
      wholesale: 1400,
      moq: 50,
      shipping: 90,
      selling: 3950,
      comp: 'None in genuine rosewood with wireless tech',
      demand: 'Medium',
      compLevel: 'Low',
      quality: 'Hand-carved sheesham wood with brass inlay and 15W CE module',
      notes: 'Unique local artisan fusion product. Excellent gift item for executive desks.',
      status: 'Sample Received',
      s_qual: 94,
      s_prof: 84,
      s_dem: 72,
      s_comp: 90,
      s_ship: 88,
      s_sup: 80,
      s_rep: 60,
      score: 82.5,
      img: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'res_3',
      title: 'Cast Iron Pre-Seasoned 10-Inch Skillet with Silicone Grip',
      catId: 'cat_kitchen',
      city: 'Gujranwala',
      country: 'Pakistan',
      supName: 'Gujranwala Metal Castings Ltd',
      sample: 1500,
      wholesale: 980,
      moq: 60,
      shipping: 160,
      selling: 2750,
      comp: 'PKR 3,000 on specialty cookware stores',
      demand: 'High',
      compLevel: 'Moderate',
      quality: 'Pre-seasoned with flaxseed oil; heavy cast wall',
      notes: 'Slightly heavy shipping weight (2.1 kg), but huge organic steak and desi cooking appeal.',
      status: 'Supplier Contacted',
      s_qual: 85,
      s_prof: 80,
      s_dem: 86,
      s_comp: 70,
      s_ship: 60,
      s_sup: 82,
      s_rep: 75,
      score: 78.4,
      img: 'https://images.unsplash.com/photo-1584990347449-3075b967916a?auto=format&fit=crop&w=800&q=80'
    }
  ];

  const insertResearch = db.prepare(`
    INSERT INTO sourcing_research (id, title, category_id, description, image_url, source_city, source_country, supplier_name, sample_cost, wholesale_cost, moq, est_shipping_cost, expected_selling_price, competitor_prices, estimated_demand, competition_level, quality_assessment, notes, status, score_quality, score_profit, score_demand, score_competition, score_shipping, score_supplier, score_repeat, total_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  researchItems.forEach(r => {
    insertResearch.run(r.id, r.title, r.catId, r.notes, r.img, r.city, r.country, r.supName, r.sample, r.wholesale, r.moq, r.shipping, r.selling, r.comp, r.demand, r.compLevel, r.quality, r.notes, r.status, r.s_qual, r.s_prof, r.s_dem, r.s_comp, r.s_ship, r.s_sup, r.s_rep, r.score);
  });

  // Seed Genuine Reviews
  const reviews = [
    { id: 'rev_1', prodId: 'prod_1', name: 'Bilal Tariq', rating: 5, title: 'Superb build quality! Charges my MacBook & S24 effortlessly', comment: 'I was skeptical because many local chargers overheat on Pakistani 220V fluctuation, but this Aura 65W GaN adapter runs surprisingly cool. The braided cable that comes with it is thick and feels like an original Apple cable. Arrived in Lahore within 24 hours.' },
    { id: 'rev_2', prodId: 'prod_1', name: 'Hamza Sheikh', rating: 5, title: 'Essential travel companion', comment: 'Replaced 3 separate chargers with just this one compact brick. Truly charges 65W on single port and splits power nicely when phone is plugged into the second port. Excellent packing.' },
    { id: 'rev_3', prodId: 'prod_2', name: 'Sarah Alvi', rating: 5, title: 'Best pour-over kettle for V60 lovers in Pakistan', comment: 'The built-in thermometer is extremely responsive. Pour control is silky smooth with zero drips down the side. The beechwood handle does not get hot at all. Highly recommend this store!' },
    { id: 'rev_4', prodId: 'prod_3', name: 'Zohaib Mansoor', rating: 5, title: 'Authentic cowhide leather smell and perfect stitching', comment: 'Fits comfortably in my slim denim pockets. Tested the RFID shield at an office card reader and it blocked it completely. Proud to see Pakistani artisan leather presented with such clean packaging.' }
  ];

  const insertRev = db.prepare(`
    INSERT INTO reviews (id, product_id, reviewer_name, rating, title, comment, is_verified_purchase)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  reviews.forEach(r => insertRev.run(r.id, r.prodId, r.name, r.rating, r.title, r.comment));

  // Seed Initial Coupons
  const insertCoupon = db.prepare(`
    INSERT INTO coupons (id, code, discount_type, discount_value, min_order_value, max_discount, usage_limit, times_used, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCoupon.run('coup_1', 'WELCOME10', 'percentage', 10, 2000, 1000, 500, 14, 1);
  insertCoupon.run('coup_2', 'AURA500', 'fixed', 500, 4500, 500, 100, 8, 1);

  // Seed Initial Purchase Orders & Inventory Movements
  const insertPO = db.prepare(`
    INSERT INTO purchase_orders (id, po_number, supplier_id, status, subtotal, shipping_cost, other_expenses, total_cost, payment_status, expected_date, received_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPO.run('po_1', 'PO-2026-001', 'sup_lahore_1', 'Received', 82500, 2500, 1500, 86500, 'Paid', '2026-10-15', '2026-10-16', 'Initial 50-unit batch of GaN 65W chargers received and QC tested');
  insertPO.run('po_2', 'PO-2026-002', 'sup_khi_1', 'Received', 43500, 3200, 1200, 47900, 'Paid', '2026-10-20', '2026-10-22', '30 Gooseneck Matte Kettles from Korangi plant');

  // Seed Demo Orders with real cost breakdown
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_number, customer_name, customer_email, customer_phone, shipping_address, city, province, status, payment_method, payment_status, subtotal, shipping_fee, discount_amount, total_amount, coupon_code, courier_partner, tracking_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 days'))
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, product_name, sku, unit_price, cost_price, quantity, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Order 1: Delivered
  insertOrder.run('ord_1', 'AC-20261028-1001', 'Zainab Fatima', 'zainab.f@gmail.com', '+923219876543', 'House 142, Street 8, Phase 5, DHA', 'Lahore', 'Punjab', 'Delivered', 'COD', 'Paid', 3350, 0, 0, 3350, null, 'TCS Express', 'TCS-928174412');
  insertOrderItem.run('oi_1', 'ord_1', 'prod_1', 'Aura 65W GaN Pro Multi-Port Ultra Fast Wall Charger with 100W Braided Cable', 'AC-EL-65W', 3350, 1650, 1, 3350);

  // Order 2: In Transit
  const insertOrder2 = db.prepare(`
    INSERT INTO orders (id, order_number, customer_name, customer_email, customer_phone, shipping_address, city, province, status, payment_method, payment_status, subtotal, shipping_fee, discount_amount, total_amount, coupon_code, courier_partner, tracking_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 days'))
  `);
  insertOrder2.run('ord_2', 'AC-20261030-1002', 'Omer Farooq', 'omer.farooq@outlook.com', '+923005544332', 'Flat 402, Al-Razi Heights, F-11 Markaz', 'Islamabad', 'Federal', 'In Transit', 'Bank Transfer', 'Paid', 5350, 220, 535, 5035, 'WELCOME10', 'Trax Logistics', 'TRX-55192841');
  insertOrderItem.run('oi_2', 'ord_2', 'prod_2', 'Precision Barista 850ml Matte Black Gooseneck Drip Kettle', 'AC-KT-850K', 3100, 1450, 1, 3100);
  insertOrderItem.run('oi_3', 'ord_2', 'prod_3', 'Handcrafted Full-Grain Cowhide Minimalist Wallet', 'AC-LF-WLT01', 2250, 920, 1, 2250);

  // Seed Recorded Operational Expenses
  const insertExpense = db.prepare('INSERT INTO expenses (id, category, amount, description, date) VALUES (?, ?, ?, ?, ?)');
  insertExpense.run('exp_1', 'Packaging', 8500, 'Custom matte black unboxing boxes & bubble wraps for 200 orders', '2026-10-18');
  insertExpense.run('exp_2', 'Marketing', 14000, 'Meta / Instagram product showcase campaign in Lahore & Karachi', '2026-10-24');
  insertExpense.run('exp_3', 'Courier Loss / Return Buffer', 3500, 'Reserve for return shipping freight', '2026-10-27');

  console.log('Database initialization & seeding completed successfully.');
}

function seedStore3DData() {
  const deptCount = (db.prepare('SELECT count(*) as count FROM store_departments').get() as { count: number }).count;
  if (deptCount >= 12) return;

  console.log('Seeding 12 specialized 3D Virtual Store Departments & Shelves...');

  // Reset to seed fresh 12 departments
  db.exec('DELETE FROM store_shelves');
  db.exec('DELETE FROM store_departments');

  // Also ensure new categories and products exist if not present
  const catCheck = (db.prepare("SELECT count(*) as count FROM categories WHERE id = 'cat_shoes'").get() as { count: number }).count;
  if (catCheck === 0) {
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, slug, name, description, image_url, display_order) VALUES (?, ?, ?, ?, ?, ?)');
    insertCat.run('cat_shoes', 'shoes-footwear', 'Shoes & Footwear', 'Performance running footwear, handcrafted formal loafers, and comfort soles', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80', 9);
    insertCat.run('cat_watches', 'watches-accessories', 'Watches & Accessories', 'Precision sapphire chronograph timepieces and titanium wristwear', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80', 10);
    insertCat.run('cat_beauty', 'beauty-personal-care', 'Beauty & Personal Care', 'Botanical barrier serums, velvet lip tints, and artisan skincare', 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=800&q=80', 11);
    insertCat.run('cat_fitness', 'fitness-sports', 'Fitness & Sports', 'Heavy duty resistance equipment, smart grip trainers, and recovery tools', 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80', 12);

    const insertProd = db.prepare(`
      INSERT OR IGNORE INTO products (id, slug, name, sku, category_id, description, short_description, specifications, cost_price, regular_price, discount_price, stock_quantity, is_featured, is_published, brand, demo_video_url, tryon_type, color_options, size_options)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProd.run(
      'prod_shoes_1',
      'stealth-cloudknit-cushion-running-shoes',
      'Aura Stealth CloudKnit Breathable Lightweight Running Shoes',
      'AC-SH-CK01',
      'cat_shoes',
      'Engineered for maximum kinetic energy return and all-day shock absorption. Features breathable multi-zone jacquard knit upper with high-traction carbon rubber outsole.',
      'Featherlight 220g running shoes with responsive supercritical foam midsole and anti-microbial ortholite footbed.',
      JSON.stringify({ 'Upper Material': 'Engineered Seamless Jacquard Knit', 'Midsole': 'Supercritical High-Rebound Foam', 'Outsole': 'Carbon Rubber Traction Lug Array', 'Weight': '220g (Size 42)', 'Origin': 'Sialkot Performance Athletic Line' }),
      2100, 5800, 4250, 26, 1, 1, 'Aura Sport',
      'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-man-tying-his-sneakers-40810-large.mp4',
      'footwear',
      'Triple Black, Chalk White / Gum, Carbon Slate',
      '40, 41, 42, 43, 44, 45'
    );

    insertProd.run(
      'prod_watch_1',
      'chronos-sapphire-minimalist-40mm-chronograph',
      'Chronos Sapphire Minimalist 40mm Quartz Chronograph Watch',
      'AC-WT-CH40',
      'cat_watches',
      'A study in Bauhaus minimalism and timeless craftsmanship. Built with scratch-proof synthetic sapphire crystal and Japanese precision quartz caliber movement inside a 316L surgical stainless steel casing.',
      'Scratch-resistant sapphire crystal 40mm timepiece with interchangeable quick-release strap mechanism and 5 ATM water resistance.',
      JSON.stringify({ 'Case Diameter': '40mm', 'Thickness': '7.8mm (Ultra-Thin)', 'Glass': 'Curved Anti-Reflective Sapphire Crystal', 'Water Resistance': '50m / 5 ATM Swim-Proof', 'Movement': 'Japanese Miyota Quartz Chronograph', 'Lug Width': '20mm' }),
      2800, 7500, 5490, 18, 1, 1, 'Chronos Horology',
      'https://assets.mixkit.co/videos/preview/mixkit-top-shot-of-a-luxury-watch-and-a-cup-of-coffee-41617-large.mp4',
      'watch',
      'Silver Case / Black Leather, Obsidian Black / Milanese Mesh, Rose Gold / Navy',
      '40mm Standard'
    );

    insertProd.run(
      'prod_beauty_1',
      'botanical-glow-velvet-lip-tint-serum',
      'Botanical Glow Velvet Long-Lasting Lip Tint & Barrier Serum',
      'AC-BT-GLOW',
      'cat_beauty',
      'Infused with organic rosehip seed oil, hyaluronic acid, and botanical waxes sourced from Northern Pakistan. Delivers a soft-focus velvet matte tint that never dries or creases.',
      'Clean organic velvet lip color and hydrating barrier serum with 12-hour stain resistance and cruelty-free certified formula.',
      JSON.stringify({ 'Net Volume': '6.5 ml', 'Key Actives': 'Organic Cold-Pressed Rosehip, Vegan Squalane, Vitamin E', 'Finish': 'Velvet Soft-Focus Cloud Matte', 'Certification': '100% Halal Certified & Cruelty-Free', 'Manufacture': 'Lahore Botanical Laboratories' }),
      680, 2100, 1550, 50, 1, 1, 'Aura Botanicals',
      'https://assets.mixkit.co/videos/preview/mixkit-putting-on-lipstick-in-front-of-a-mirror-42353-large.mp4',
      'beauty',
      'Ruby Velvet, Nude Rose, Plum Ember, Peach Glaze',
      'Standard 6.5ml'
    );

    insertProd.run(
      'prod_fitness_1',
      'proflex-precision-steel-grip-trainer-set',
      'ProFlex Precision Aircraft Aluminum Hand Grip Trainer & Bands (50-200 lbs)',
      'AC-FT-GRIP',
      'cat_fitness',
      'Forged for athletes, climbers, and keyboard professionals. Features knurled aerospace-grade aluminum handles with heavy-duty alloy torsion spring.',
      'Calibrated steel spring hand grip strengthener set with ergonomic diamond knurl texture and 5 resistance tuning levels.',
      JSON.stringify({ 'Resistance Range': '50 lbs, 100 lbs, 150 lbs, 200 lbs Interchangeable', 'Handle Material': 'CNC Diamond-Knurled Aviation Aluminum 6061', 'Spring': 'High-Tensile Oil-Quenched Steel Alloy', 'Includes': 'Grip trainer, 3 silicone finger extension bands, carrying pouch' }),
      890, 2600, 1890, 35, 1, 1, 'ProFlex Athletic',
      'https://assets.mixkit.co/videos/preview/mixkit-young-man-exercising-in-the-gym-with-weights-41444-large.mp4',
      'electronics',
      'Stealth Matte Black, Gunmetal Silver',
      'One Size'
    );

    const insertImg = db.prepare('INSERT OR IGNORE INTO product_images (id, product_id, image_url, alt_text, display_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)');
    insertImg.run('img_sh1', 'prod_shoes_1', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=80', 'Aura Running Shoes', 0, 1);
    insertImg.run('img_wt1', 'prod_watch_1', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80', 'Chronos Sapphire Watch', 0, 1);
    insertImg.run('img_bt1', 'prod_beauty_1', 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=1000&q=80', 'Velvet Lip Tint', 0, 1);
    insertImg.run('img_ft1', 'prod_fitness_1', 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1000&q=80', 'ProFlex Grip Trainer', 0, 1);
  }

  // Ensure original products also have tryon_type, demo_video_url, and color options populated
  db.prepare("UPDATE products SET tryon_type = 'electronics', color_options = 'Matte Black, Arctic White, Titanium Gray', demo_video_url = 'https://assets.mixkit.co/videos/preview/mixkit-electronic-circuit-board-with-chips-42861-large.mp4' WHERE id = 'prod_1'").run();
  db.prepare("UPDATE products SET tryon_type = 'furniture', color_options = 'Matte Black & Walnut, Brushed Stainless, Pearl White' WHERE id = 'prod_2'").run();
  db.prepare("UPDATE products SET tryon_type = 'fashion', color_options = 'Vintage Saddle Tan, Deep Charcoal, Cognac Brown' WHERE id = 'prod_3'").run();
  db.prepare("UPDATE products SET tryon_type = 'electronics', color_options = 'Obsidian Black, Metallic Silver' WHERE id = 'prod_4'").run();
  db.prepare("UPDATE products SET tryon_type = 'furniture', color_options = 'Dark Walnut, Japanese Zen Oak, Minimalist White' WHERE id = 'prod_5'").run();
  db.prepare("UPDATE products SET tryon_type = 'electronics', color_options = 'Space Gray, Silver Aluminum, Rose Gold' WHERE id = 'prod_6'").run();
  db.prepare("UPDATE products SET tryon_type = 'fashion', color_options = 'Midnight Slate, Forest Olive, Navy Blue' WHERE id = 'prod_7'").run();
  db.prepare("UPDATE products SET tryon_type = 'electronics', color_options = 'Matte Black, Space Gray' WHERE id = 'prod_8'").run();

  // 12 Distinct Specialized Departments (Arranged radially around Central Reception Lobby)
  const insertDept = db.prepare(`
    INSERT INTO store_departments (id, category_id, name, sign_label, aisle_number, pos_x, pos_z, theme_color, description, portal_x, portal_z, icon, demo_pedestal_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const departments = [
    // West Wing Portals
    { id: 'dept_elec', catId: 'cat_electronics', name: 'Electronics & Gadgets', sign: 'Dept 01 · Electronics & Gadgets', aisle: 1, x: -18, z: 14, color: '#3b82f6', desc: 'GaN Ultra Chargers, braided 100W cables & smart electronics', px: -14, pz: 14, icon: 'Cpu', demo: 'Fast Charger Test Bench' },
    { id: 'dept_office', catId: 'cat_office', name: 'Office & Study', sign: 'Dept 02 · Office & Study', aisle: 2, x: -18, z: 4, color: '#6366f1', desc: 'Ergonomic aluminum risers, leather desk pads & organization', px: -14, pz: 4, icon: 'Briefcase', demo: 'Ergonomic Desk Setup' },
    { id: 'dept_fitness', catId: 'cat_fitness', name: 'Fitness & Sports', sign: 'Dept 03 · Fitness & Sports', aisle: 3, x: -18, z: -6, color: '#eab308', desc: 'Calibrated steel grip strengtheners & athletic gear', px: -14, pz: -6, icon: 'Activity', demo: 'Kinetic Training Zone' },
    { id: 'dept_car', catId: 'cat_car', name: 'Car Accessories', sign: 'Dept 04 · Car Accessories', aisle: 4, x: -18, z: -18, color: '#ef4444', desc: 'Cordless smart tire inflators, MagSafe chargers & interior mounts', px: -14, pz: -18, icon: 'Car', demo: 'Automotive Emergency Demo' },

    // North Promenade Portals
    { id: 'dept_travel', catId: 'cat_travel', name: 'Travel & Luggage', sign: 'Dept 05 · Travel & Luggage', aisle: 5, x: -10, z: -22, color: '#14b8a6', desc: '7-piece compression packing cubes & waterproof travel organizers', px: -10, pz: -18, icon: 'Luggage', demo: 'Luggage Space-Saver Demo' },
    { id: 'dept_kitchen', catId: 'cat_kitchen', name: 'Kitchen & Dining', sign: 'Dept 06 · Kitchen & Dining', aisle: 6, x: 0, z: -22, color: '#10b981', desc: 'Barista pour-over gooseneck kettles with temperature dials', px: 0, pz: -18, icon: 'Utensils', demo: 'Specialty Pour-Over Bar' },
    { id: 'dept_home', catId: 'cat_home', name: 'Home & Living', sign: 'Dept 07 · Home & Living', aisle: 7, x: 10, z: -22, color: '#ec4899', desc: 'Zen ultrasonic aroma diffusers & artisanal ambient sanctuary decor', px: 10, pz: -18, icon: 'Home', demo: 'Aromatherapy Aura Pod' },

    // East Wing Portals
    { id: 'dept_fashion', catId: 'cat_lifestyle', name: 'Fashion & Clothing', sign: 'Dept 08 · Fashion & Clothing', aisle: 8, x: 18, z: 14, color: '#8b5cf6', desc: 'Handcrafted cowhide bifold wallets & curated leather goods', px: 14, pz: 14, icon: 'Shirt', demo: 'Artisan Leather Studio' },
    { id: 'dept_watches', catId: 'cat_watches', name: 'Watches & Accessories', sign: 'Dept 09 · Watches & Accessories', aisle: 9, x: 18, z: 4, color: '#06b6d4', desc: 'Sapphire crystal chronograph timepieces with interchangeable bands', px: 14, pz: 4, icon: 'Watch', demo: 'Horology Glass Display' },
    { id: 'dept_shoes', catId: 'cat_shoes', name: 'Shoes & Footwear', sign: 'Dept 10 · Shoes & Footwear', aisle: 10, x: 18, z: -6, color: '#f59e0b', desc: 'CloudKnit breathable athletic sneakers & orthotic cushions', px: 14, pz: -6, icon: 'Footprints', demo: 'Kinetic Stride Pedestal' },
    { id: 'dept_beauty', catId: 'cat_beauty', name: 'Beauty & Personal Care', sign: 'Dept 11 · Beauty & Personal Care', aisle: 11, x: 18, z: -18, color: '#f43f5e', desc: 'Botanical rosehip velvet tints & organic barrier skincare', px: 14, pz: -18, icon: 'Sparkles', demo: 'Color Swatch Mirror Counter' },

    // Central Atrium Promenade
    { id: 'dept_lifestyle', catId: 'cat_lifestyle', name: 'Gifts & Lifestyle', sign: 'Dept 12 · Gifts & Lifestyle', aisle: 12, x: 0, z: -8, color: '#d946ef', desc: 'Curated artisanal gifts, MagSafe stands & executive gifts', px: 0, pz: -4, icon: 'Gift', demo: 'Executive Gift Showcase' },
  ];

  departments.forEach(d => {
    insertDept.run(d.id, d.catId, d.name, d.sign, d.aisle, d.x, d.z, d.color, d.desc, d.px, d.pz, d.icon, d.demo);
  });

  // Shelves & Physical Display Bays across departments
  const insertShelf = db.prepare(`
    INSERT INTO store_shelves (id, department_id, shelf_code, aisle_label, pos_x, pos_y, pos_z, rotation_y, shelf_type, product_id, featured_label, demo_video_url, tryon_type, color_options, size_options)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const shelves = [
    // Central Promotional Showcase Island (in the Grand Lobby promenade at z = 8)
    { id: 'sh_promo_1', deptId: 'dept_elec', code: 'ISLAND-01', aisle: 'Central Grand Rotunda', x: 0, y: 0, z: 8, rot: 0, type: 'island_display', prodId: 'prod_1', feat: 'FEATURED DROP', vid: 'https://assets.mixkit.co/videos/preview/mixkit-electronic-circuit-board-with-chips-42861-large.mp4', tryon: 'electronics', colors: 'Matte Black, Arctic White', sizes: 'Standard' },

    // Dept 01: Electronics
    { id: 'sh_elec_1', deptId: 'dept_elec', code: 'D01-SH01', aisle: 'Electronics · Bay A', x: -18, y: 0, z: 16, rot: 0, type: 'double_tier', prodId: 'prod_1', feat: 'TOP SELLER', vid: 'https://assets.mixkit.co/videos/preview/mixkit-electronic-circuit-board-with-chips-42861-large.mp4', tryon: 'electronics', colors: 'Matte Black, Arctic White', sizes: 'Standard' },
    { id: 'sh_elec_2', deptId: 'dept_elec', code: 'D01-DEMO', aisle: 'Electronics · Demo Pedestal', x: -18, y: 0, z: 11, rot: 0, type: 'demo_table', prodId: 'prod_8', feat: 'INTERACTIVE DEMO', vid: null, tryon: 'electronics', colors: 'Obsidian, Silver', sizes: 'Universal' },

    // Dept 02: Office & Study
    { id: 'sh_off_1', deptId: 'dept_office', code: 'D02-SH01', aisle: 'Office · Workspace Shelf', x: -18, y: 0, z: 4, rot: 0, type: 'double_tier', prodId: 'prod_6', feat: 'ERGONOMIC DESIGN', vid: null, tryon: 'electronics', colors: 'Space Gray, Silver Aluminum', sizes: '10"-17.3"' },

    // Dept 03: Fitness & Sports
    { id: 'sh_fit_1', deptId: 'dept_fitness', code: 'D03-SH01', aisle: 'Fitness · Training Bay', x: -18, y: 0, z: -6, rot: 0, type: 'double_tier', prodId: 'prod_fitness_1', feat: 'CALIBRATED GRIP', vid: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-exercising-in-the-gym-with-weights-41444-large.mp4', tryon: 'electronics', colors: 'Stealth Black, Gunmetal', sizes: 'Universal' },

    // Dept 04: Car Accessories
    { id: 'sh_car_1', deptId: 'dept_car', code: 'D04-SH01', aisle: 'Auto & Car Tech Bay', x: -18, y: 0, z: -18, rot: 0, type: 'double_tier', prodId: 'prod_4', feat: 'CORDLESS 150 PSI', vid: null, tryon: 'electronics', colors: 'Obsidian Black', sizes: 'Standard' },

    // Dept 05: Travel & Luggage
    { id: 'sh_trav_1', deptId: 'dept_travel', code: 'D05-SH01', aisle: 'Travel · Compression Bay', x: -10, y: 0, z: -22, rot: Math.PI / 2, type: 'double_tier', prodId: 'prod_7', feat: 'SPACE SAVER', vid: null, tryon: 'fashion', colors: 'Midnight Slate, Forest Olive', sizes: '7-Piece Set' },

    // Dept 06: Kitchen & Dining
    { id: 'sh_kit_1', deptId: 'dept_kitchen', code: 'D06-SH01', aisle: 'Specialty Coffee & Kitchen', x: 0, y: 0, z: -22, rot: Math.PI / 2, type: 'double_tier', prodId: 'prod_2', feat: 'BARISTA CHOICE', vid: null, tryon: 'furniture', colors: 'Matte Black & Walnut, Stainless', sizes: '850ml' },

    // Dept 07: Home & Living
    { id: 'sh_home_1', deptId: 'dept_home', code: 'D07-SH01', aisle: 'Home Sanctuary & Decor', x: 10, y: 0, z: -22, rot: Math.PI / 2, type: 'double_tier', prodId: 'prod_5', feat: 'ZEN LIVING', vid: null, tryon: 'furniture', colors: 'Dark Walnut, Japanese Oak', sizes: '500ml' },

    // Dept 08: Fashion & Clothing
    { id: 'sh_fash_1', deptId: 'dept_fashion', code: 'D08-SH01', aisle: 'Artisan Leather Studio', x: 18, y: 0, z: 14, rot: 0, type: 'double_tier', prodId: 'prod_3', feat: 'GENUINE COWHIDE', vid: null, tryon: 'fashion', colors: 'Vintage Saddle Tan, Deep Charcoal', sizes: 'Slim Bifold' },

    // Dept 09: Watches & Accessories
    { id: 'sh_wt_1', deptId: 'dept_watches', code: 'D09-SH01', aisle: 'Horology Glass Display', x: 18, y: 0, z: 4, rot: 0, type: 'double_tier', prodId: 'prod_watch_1', feat: 'SAPPHIRE CRYSTAL', vid: 'https://assets.mixkit.co/videos/preview/mixkit-top-shot-of-a-luxury-watch-and-a-cup-of-coffee-41617-large.mp4', tryon: 'watch', colors: 'Silver / Black Leather, Rose Gold / Navy', sizes: '40mm' },

    // Dept 10: Shoes & Footwear
    { id: 'sh_sh_1', deptId: 'dept_shoes', code: 'D10-SH01', aisle: 'Athletic Footwear Wall', x: 18, y: 0, z: -6, rot: 0, type: 'double_tier', prodId: 'prod_shoes_1', feat: 'CLOUDKNIT FOAM', vid: 'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-man-tying-his-sneakers-40810-large.mp4', tryon: 'footwear', colors: 'Triple Black, Chalk White, Carbon', sizes: '40, 41, 42, 43, 44, 45' },

    // Dept 11: Beauty & Personal Care
    { id: 'sh_bt_1', deptId: 'dept_beauty', code: 'D11-SH01', aisle: 'Botanical Beauty Vanity', x: 18, y: 0, z: -18, rot: 0, type: 'double_tier', prodId: 'prod_beauty_1', feat: 'ORGANIC FORMULA', vid: 'https://assets.mixkit.co/videos/preview/mixkit-putting-on-lipstick-in-front-of-a-mirror-42353-large.mp4', tryon: 'beauty', colors: 'Ruby Velvet, Nude Rose, Plum Ember', sizes: '6.5ml' },

    // Dept 12: Gifts & Lifestyle
    { id: 'sh_life_1', deptId: 'dept_lifestyle', code: 'D12-SH01', aisle: 'Lifestyle Gift Pavilion', x: 0, y: 0, z: -8, rot: 0, type: 'island_display', prodId: 'prod_3', feat: 'HANDMADE GIFT', vid: null, tryon: 'fashion', colors: 'Saddle Tan, Mahogany', sizes: 'Standard' },
  ];

  shelves.forEach(s => {
    insertShelf.run(s.id, s.deptId, s.code, s.aisle, s.x, s.y, s.z, s.rot, s.type, s.prodId, s.feat, s.vid, s.tryon, s.colors, s.sizes);
  });

  console.log('Successfully seeded 12 distinct departments and 13 specialized retail shelves.');
}
