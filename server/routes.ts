import { Router, Request, Response } from 'express';
import { db, hashPassword, verifyPassword, isLegacyHash } from './db.js';
import { presenceStats } from './presence.js';
import crypto from 'crypto';
import { currentUserId, issueToken } from './auth.js';
import { mailConfigured, sendInquiryEmail, STORE_EMAIL } from './mail.js';

export const apiRouter = Router();

// Per-request signed-token sessions (see server/auth.ts)
export const getActiveUserId = () => currentUserId();

// --- AUTHENTICATION ---
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT id, email, full_name, phone, role FROM users WHERE id = ?').get(currentUserId());
    if (!user) {
      return res.json({ user: null });
    }
    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = db.prepare('SELECT id, email, full_name, phone, role, password_hash FROM users WHERE LOWER(email) = LOWER(?)').get(email) as any;

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.role === 'admin' && password === 'Admin@123456' && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'The default admin password is disabled in production. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.' });
    }
    // upgrade older password hashes to the per-user salted scheme
    if (isLegacyHash(user.password_hash)) {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPassword(String(password)), user.id);
    }

    res.json({
      token: issueToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, full_name, phone } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Please choose a password with at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = `u_${Date.now()}`;
    const hash = hashPassword(password);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role)
      VALUES (?, ?, ?, ?, ?, 'customer')
    `).run(id, email, hash, full_name, phone || '');

    db.prepare('INSERT INTO customer_profiles (id, user_id) VALUES (?, ?)').run(`cp_${id}`, id);

    res.json({
      token: issueToken(id),
      user: {
        id,
        email,
        full_name,
        phone: phone || '',
        role: 'customer'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  // tokens are stateless; the browser discards its token
  res.json({ success: true });
});

// --- CATEGORIES ---
apiRouter.get('/categories', (req: Request, res: Response) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_published = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order ASC
    `).all();
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PRODUCTS ---
apiRouter.get('/products', (req: Request, res: Response) => {
  try {
    const { category, search, minPrice, maxPrice, brand, sort, inStock, featured } = req.query;

    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count,
             (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id) as average_rating
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_published = 1
    `;
    const params: any[] = [];

    if (category) {
      query += ` AND c.slug = ?`;
      params.push(category);
    }
    if (search) {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (minPrice) {
      query += ` AND COALESCE(p.discount_price, p.regular_price) >= ?`;
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      query += ` AND COALESCE(p.discount_price, p.regular_price) <= ?`;
      params.push(Number(maxPrice));
    }
    if (brand) {
      query += ` AND p.brand = ?`;
      params.push(brand);
    }
    if (inStock === 'true') {
      query += ` AND p.stock_quantity > 0`;
    }
    if (featured === 'true') {
      query += ` AND p.is_featured = 1`;
    }

    if (sort === 'price_low') {
      query += ` ORDER BY COALESCE(p.discount_price, p.regular_price) ASC`;
    } else if (sort === 'price_high') {
      query += ` ORDER BY COALESCE(p.discount_price, p.regular_price) DESC`;
    } else if (sort === 'rating') {
      query += ` ORDER BY average_rating DESC NULLS LAST`;
    } else if (sort === 'newest') {
      query += ` ORDER BY p.created_at DESC`;
    } else {
      query += ` ORDER BY p.is_featured DESC, p.created_at DESC`;
    }

    const products = db.prepare(query).all(...params);

    // Get unique brands for filters
    const brands = db.prepare('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND is_published = 1').all().map((b: any) => b.brand);

    res.json({ products, brands });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/products/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const product = db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count,
             (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id) as average_rating
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ? OR p.id = ?
    `).get(slug, slug) as any;

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY display_order ASC').all(product.id);
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id);
    const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(product.id);
    
    // Related products in same category
    const related = db.prepare(`
      SELECT p.id, p.slug, p.name, p.regular_price, p.discount_price, p.stock_quantity,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM products p
      WHERE p.category_id = ? AND p.id != ? AND p.is_published = 1
      LIMIT 4
    `).all(product.category_id, product.id);

    res.json({
      product,
      images,
      variants,
      reviews,
      related
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/products/:id/review', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewer_name, rating, title, comment } = req.body;
    if (!reviewer_name || !rating || !title || !comment) {
      return res.status(400).json({ error: 'All review fields are required' });
    }

    const revId = `rev_${Date.now()}`;
    db.prepare(`
      INSERT INTO reviews (id, product_id, user_id, reviewer_name, rating, title, comment, is_verified_purchase)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(revId, id, currentUserId() || null, reviewer_name, Number(rating), title, comment);

    res.json({ success: true, message: 'Review submitted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- COUPON VALIDATION ---
apiRouter.post('/coupons/apply', (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Coupon code required' });
    }

    const coupon = db.prepare(`
      SELECT * FROM coupons
      WHERE UPPER(code) = UPPER(?) AND is_active = 1
    `).get(code) as any;

    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }

    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) {
      return res.status(400).json({ error: 'Coupon usage limit has been reached' });
    }

    if (coupon.min_order_value && Number(subtotal) < coupon.min_order_value) {
      return res.status(400).json({
        error: `Minimum order value of PKR ${coupon.min_order_value.toLocaleString()} required for this coupon`
      });
    }

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (Number(subtotal) * coupon.discount_value) / 100;
      if (coupon.max_discount && discount > coupon.max_discount) {
        discount = coupon.max_discount;
      }
    } else {
      discount = coupon.discount_value;
    }

    res.json({
      valid: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      calculated_discount: Math.round(discount)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CHECKOUT & ORDER CREATION ---
apiRouter.post('/checkout', (req: Request, res: Response) => {
  const {
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    city,
    province,
    postal_code,
    delivery_instructions,
    payment_method, // 'COD', 'Bank Transfer', 'Online Gateway'
    items, // [{ product_id, quantity, variant_id }]
    coupon_code
  } = req.body;

  if (!customer_name || !customer_email || !customer_phone || !shipping_address || !city || !items || !items.length) {
    return res.status(400).json({ error: 'Please provide all required delivery details and order items.' });
  }
  if (!['COD', 'Cash on Delivery', 'Bank Transfer'].includes(req.body.payment_method)) {
    return res.status(400).json({ error: 'This payment method is not available.' });
  }

  // Execute inside SQLite ACID transaction
  const executeOrder = db.transaction(() => {
    let subtotal = 0;
    const validatedItems: any[] = [];

    // Verify current inventory and fetch real database prices
    for (const item of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ? AND is_published = 1').get(item.product_id) as any;
      if (!prod) {
        throw new Error(`Product not found or currently unavailable.`);
      }

      if (prod.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for "${prod.name}". Only ${prod.stock_quantity} available.`);
      }

      // If the item references a real variant row, honour that variant's price and stock.
      const variantRow = item.variant_id
        ? (db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(item.variant_id, prod.id) as any)
        : null;
      if (variantRow && variantRow.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for "${prod.name} – ${variantRow.title}". Only ${variantRow.stock_quantity} available.`);
      }

      const unitPrice = variantRow && variantRow.price > 0 ? variantRow.price : (prod.discount_price ? prod.discount_price : prod.regular_price);
      const totalItemPrice = unitPrice * item.quantity;
      subtotal += totalItemPrice;

      validatedItems.push({
        product_id: prod.id,
        variant_id: item.variant_id || null,
        product_name: prod.name,
        sku: prod.sku,
        unit_price: unitPrice,
        cost_price: prod.cost_price,
        quantity: item.quantity,
        total_price: totalItemPrice
      });
    }

    // Shipping rules: Free delivery on PKR 3,500+; Lahore local 180; other cities 220
    let shipping_fee = 220;
    if (city.toLowerCase().includes('lahore')) {
      shipping_fee = 180;
    }
    if (subtotal >= 3500) {
      shipping_fee = 0;
    }

    // Apply Coupon if valid
    let discount_amount = 0;
    if (coupon_code) {
      const coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND is_active = 1').get(coupon_code) as any;
      if (coupon && (!coupon.min_order_value || subtotal >= coupon.min_order_value)) {
        if (coupon.discount_type === 'percentage') {
          discount_amount = (subtotal * coupon.discount_value) / 100;
          if (coupon.max_discount && discount_amount > coupon.max_discount) {
            discount_amount = coupon.max_discount;
          }
        } else {
          discount_amount = coupon.discount_value;
        }
        db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?').run(coupon.id);
      }
    }

    const total_amount = Math.max(0, subtotal + shipping_fee - discount_amount);

    // Generate Order Number: AC-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const order_number = `AC-${dateStr}-${randSuffix}`;
    const orderId = `ord_${Date.now()}`;

    // Payment status
    // Bank Transfer & COD remain 'Pending' until confirmed/delivered. Online gateway simulates gateway response check.
    const payment_status = payment_method === 'Online Gateway' ? 'Pending Gateway Verification' : 'Pending';

    // Insert Order
    db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_name, customer_email, customer_phone,
        shipping_address, city, province, postal_code, delivery_instructions,
        status, payment_method, payment_status, subtotal, shipping_fee, discount_amount,
        total_amount, coupon_code, courier_partner
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Order Placed', ?, ?, ?, ?, ?, ?, ?, 'TCS Express')
    `).run(
      orderId, order_number, currentUserId() || null, customer_name, customer_email, customer_phone,
      shipping_address, city, province || 'Punjab', postal_code || '', delivery_instructions || '',
      payment_method, payment_status, subtotal, shipping_fee, discount_amount,
      total_amount, coupon_code || null
    );

    // Insert Order Items and Update Inventory
    const insertItem = db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, sku, unit_price, cost_price, quantity, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?
    `);

    const logMovement = db.prepare(`
      INSERT INTO inventory_movements (id, product_id, variant_id, change_qty, movement_type, reference_type, reference_id, reason)
      VALUES (?, ?, ?, ?, 'Customer Order', 'Order', ?, ?)
    `);

    for (const it of validatedItems) {
      insertItem.run(
        `oi_${Date.now()}_${Math.random()}`,
        orderId,
        it.product_id,
        it.variant_id,
        it.product_name,
        it.sku,
        it.unit_price,
        it.cost_price,
        it.quantity,
        it.total_price
      );

      // Decrement inventory
      updateStock.run(it.quantity, it.product_id);
      if (it.variant_id) {
        db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ? AND product_id = ?').run(it.quantity, it.variant_id, it.product_id);
      }

      // Record in Inventory Movement Ledger
      logMovement.run(
        `im_${Date.now()}_${Math.random()}`,
        it.product_id,
        it.variant_id,
        -it.quantity,
        order_number,
        `Customer Purchase ${order_number}`
      );
    }

    return {
      orderId,
      order_number,
      total_amount,
      subtotal,
      shipping_fee,
      discount_amount,
      payment_method,
      payment_status,
      customer_name,
      customer_phone,
      shipping_address,
      city,
      items: validatedItems
    };
  });

  try {
    const result = executeOrder();
    res.json({ success: true, order: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- ORDER TRACKING ---
apiRouter.get('/orders/track', (req: Request, res: Response) => {
  try {
    const { order_number, phone } = req.query;
    if (!order_number) {
      return res.status(400).json({ error: 'Order number is required' });
    }

    let query = 'SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?)';
    const params: any[] = [String(order_number).trim()];

    if (phone) {
      // Normalize phone digits
      query += ' AND REPLACE(REPLACE(REPLACE(customer_phone, " ", ""), "-", ""), "+", "") LIKE ?';
      const cleanPhone = `%${String(phone).replace(/[\s\-\+]/g, '').slice(-7)}%`;
      params.push(cleanPhone);
    }

    const order = db.prepare(query).get(...params) as any;
    if (!order) {
      return res.status(404).json({ error: 'Order not found. Please check your order number and phone number.' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

    // Milestone statuses for tracking timeline
    const allStatuses = [
      'Order Placed',
      'Confirmed',
      'Processing',
      'Packed',
      'Dispatched',
      'In Transit',
      'Out for Delivery',
      'Delivered'
    ];

    res.json({ order, items, allStatuses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER ORDER HISTORY ---
apiRouter.get('/orders/my-orders', (req: Request, res: Response) => {
  try {
    if (!currentUserId()) {
      return res.json({ orders: [] });
    }
    const orders = db.prepare(`
      SELECT o.*, (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `).all(currentUserId());
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- WISHLIST ---
apiRouter.get('/wishlist', (req: Request, res: Response) => {
  try {
    if (!currentUserId()) {
      return res.json({ items: [] });
    }
    const items = db.prepare(`
      SELECT p.*, (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM wishlist_items w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = ?
    `).all(currentUserId());
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/wishlist/toggle', (req: Request, res: Response) => {
  try {
    if (!currentUserId()) {
      return res.status(401).json({ error: 'Please log in to manage your wishlist' });
    }
    const { product_id } = req.body;
    const existing = db.prepare('SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ?').get(currentUserId(), product_id);

    if (existing) {
      db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(currentUserId(), product_id);
      res.json({ inWishlist: false });
    } else {
      db.prepare('INSERT INTO wishlist_items (id, user_id, product_id) VALUES (?, ?, ?)').run(`wl_${Date.now()}`, currentUserId(), product_id);
      res.json({ inWishlist: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CUSTOMER INQUIRIES ---
const INQUIRY_TOPICS = ['General inquiry', 'Product question', 'Order help', 'Delivery', 'Returns'];
const inquiryHits = new Map<string, number[]>();

apiRouter.post('/inquiries', async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const email = String(req.body?.email || '').trim().slice(0, 120);
    const phone = String(req.body?.phone || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const topic = INQUIRY_TOPICS.includes(req.body?.topic) ? req.body.topic : 'General inquiry';
    const message = String(req.body?.message || '').trim().slice(0, 2000);
    if (req.body?.website) return res.json({ success: true });
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
      return res.status(400).json({ error: 'Please add your name, a valid email, and a message of at least 10 characters.' });
    }
    const ip = String(req.ip || 'local');
    const now = Date.now();
    const recent = (inquiryHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Please wait a while before sending another message.' });
    recent.push(now);
    inquiryHits.set(ip, recent);

    const id = `inq_${Date.now()}`;
    let emailed = 0;
    if (mailConfigured()) {
      try {
        const contact = (db.prepare("SELECT value FROM website_settings WHERE key = 'contact_email'").get() as { value?: string } | undefined)?.value;
        await sendInquiryEmail({ name, email, phone, topic, message }, contact);
        emailed = 1;
      } catch (err) {
        console.error('Inquiry email failed:', err);
      }
    } else {
      console.warn(`Inquiry saved but SMTP_PASS is not set. Messages should go to ${STORE_EMAIL}.`);
    }
    db.prepare('INSERT INTO inquiries (id, name, email, phone, topic, message, emailed) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, email, phone, topic, message, emailed);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEWSLETTER ---
apiRouter.post('/newsletter', (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address required' });
    }
    const exists = db.prepare('SELECT id FROM newsletter_subscribers WHERE LOWER(email) = LOWER(?)').get(email);
    if (!exists) {
      db.prepare('INSERT INTO newsletter_subscribers (id, email) VALUES (?, ?)').run(`sub_${Date.now()}`, email);
    }
    res.json({ success: true, message: 'Thank you for subscribing to Aura Retail updates!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 3D VIRTUAL STORE LAYOUT & SHELVES ---
apiRouter.get('/store3d/layout', (req: Request, res: Response) => {
  try {
    const departments = db.prepare(`
      SELECT d.*, c.slug as category_slug,
             (SELECT COUNT(*) FROM store_shelves WHERE department_id = d.id) as shelf_count
      FROM store_departments d
      LEFT JOIN categories c ON c.id = d.category_id
      ORDER BY d.aisle_number ASC
    `).all();

    const shelves = db.prepare(`
      SELECT s.*, 
             p.name as product_name, p.slug as product_slug, p.sku as product_sku,
             p.regular_price, p.discount_price, p.cost_price, p.stock_quantity,
             p.brand as product_brand, p.short_description,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
             (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id) as average_rating,
             (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count,
             d.name as department_name, d.sign_label as department_sign, d.theme_color
      FROM store_shelves s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN store_departments d ON d.id = s.department_id
      ORDER BY s.shelf_code ASC
    `).all();

    const settings = db.prepare('SELECT key, value FROM website_settings').all() as any[];
    const storeSettingsMap: Record<string, string> = {};
    settings.forEach(r => { storeSettingsMap[r.key] = r.value; });

    res.json({
      storeMeta: {
        name: storeSettingsMap.store_name || 'ShopWalk 360',
        tagline: storeSettingsMap.store_tagline || 'Walk In. Explore. Pick. Shop.',
        entrance: { x: 0, z: 24 },
        reception: { x: 0, z: 18 },
        checkout: { x: 12, z: 19 },
        infoDesk: { x: -5, z: 18 },
        dimensions: { width: 48, length: 56, height: 6 }
      },
      departments,
      shelves
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// --- ADVANCED ADMIN MANAGEMENT SUITE ---
// ==========================================

// Middleware for Admin check
function requireAdmin(req: Request, res: Response, next: Function) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(currentUserId()) as any;
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  }
  next();
}

apiRouter.get('/admin/inquiries', requireAdmin, (_req: Request, res: Response) => {
  try {
    const inquiries = db.prepare('SELECT id, name, email, phone, topic, message, emailed, created_at FROM inquiries ORDER BY created_at DESC LIMIT 50').all();
    res.json({ inquiries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Dashboard Overview with Real Financial Calculations
apiRouter.get('/admin/overview', requireAdmin, (req: Request, res: Response) => {
  try {
    // Total Revenue & Orders
    const salesMetrics = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(shipping_fee), 0) as total_shipping_collected,
        COALESCE(SUM(discount_amount), 0) as total_discounts
      FROM orders
      WHERE status != 'Cancelled'
    `).get() as any;

    // Total Cost of Goods Sold (COGS) based on actual cost_price in order_items
    const cogsMetric = db.prepare(`
      SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'Cancelled'
    `).get() as any;

    // Total Recorded Operational Expenses
    const expenseMetric = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
    `).get() as any;

    const totalRevenue = salesMetrics.total_revenue;
    const totalCOGS = cogsMetric.total_cogs;
    const grossProfit = totalRevenue - totalCOGS;
    const totalExpenses = expenseMetric.total_expenses;
    const netProfit = grossProfit - totalExpenses;
    const grossMarginPercent = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0';

    // Order status counts
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `).all();

    // Inventory Valuation
    const inventoryValuation = db.prepare(`
      SELECT 
        COUNT(*) as total_active_products,
        COALESCE(SUM(stock_quantity), 0) as total_units_in_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as total_cost_value,
        COALESCE(SUM(stock_quantity * COALESCE(discount_price, regular_price)), 0) as total_retail_value
      FROM products
      WHERE is_published = 1
    `).get() as any;

    // Low stock alerts
    const lowStockProducts = db.prepare(`
      SELECT id, name, sku, stock_quantity, low_stock_threshold
      FROM products
      WHERE stock_quantity <= low_stock_threshold AND is_published = 1
      ORDER BY stock_quantity ASC
    `).all();

    // Top selling products
    const topSellers = db.prepare(`
      SELECT oi.product_id, oi.product_name, SUM(oi.quantity) as units_sold, SUM(oi.total_price) as gross_revenue,
             SUM(oi.total_price - (oi.cost_price * oi.quantity)) as item_gross_profit
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'Cancelled'
      GROUP BY oi.product_id
      ORDER BY units_sold DESC
      LIMIT 5
    `).all();

    // Recent orders
    const recentOrders = db.prepare(`
      SELECT id, order_number, customer_name, city, total_amount, payment_method, status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 8
    `).all();

    res.json({
      metrics: {
        totalRevenue,
        totalOrders: salesMetrics.total_orders,
        totalCOGS,
        grossProfit,
        grossMarginPercent,
        totalExpenses,
        netProfit,
        totalActiveProducts: inventoryValuation.total_active_products,
        totalUnitsInStock: inventoryValuation.total_units_in_stock,
        inventoryCostValue: inventoryValuation.total_cost_value,
        inventoryRetailValue: inventoryValuation.total_retail_value,
      },
      statusCounts,
      lowStockProducts,
      topSellers,
      recentOrders
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Product Management CRUD
// Registered customer accounts (stored in the store database) and live visitor counts
apiRouter.get('/admin/customers', requireAdmin, (_req: Request, res: Response) => {
  const customers = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id OR LOWER(o.customer_email) = LOWER(u.email)) AS order_count,
      (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE (o.user_id = u.id OR LOWER(o.customer_email) = LOWER(u.email)) AND o.status != 'Cancelled') AS total_spent,
      (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id OR LOWER(o.customer_email) = LOWER(u.email)) AS last_order_at
    FROM users u WHERE u.role = 'customer' ORDER BY u.created_at DESC
  `).all();
  res.json({ customers, live: presenceStats() });
});

apiRouter.get('/admin/products', requireAdmin, (req: Request, res: Response) => {
  try {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status != 'Cancelled') as times_ordered
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `).all();
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/products', requireAdmin, (req: Request, res: Response) => {
  try {
    const {
      name, sku, category_id, description, short_description, specifications,
      cost_price, regular_price, discount_price, stock_quantity, low_stock_threshold,
      brand, is_featured, is_published, images
    } = req.body;

    if (!name || !sku || !cost_price || !regular_price) {
      return res.status(400).json({ error: 'Name, SKU, cost price, and regular price are required' });
    }

    const id = `prod_${Date.now()}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + `-${Date.now().toString().slice(-4)}`;

    db.prepare(`
      INSERT INTO products (
        id, slug, name, sku, category_id, description, short_description, specifications,
        cost_price, regular_price, discount_price, stock_quantity, low_stock_threshold,
        brand, is_featured, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, slug, name, sku, category_id || null, description || '', short_description || '',
      typeof specifications === 'string' ? specifications : JSON.stringify(specifications || {}),
      Number(cost_price), Number(regular_price), discount_price ? Number(discount_price) : null,
      Number(stock_quantity || 0), Number(low_stock_threshold || 5),
      brand || 'Aura Direct', is_featured ? 1 : 0, is_published !== false ? 1 : 0
    );

    // Add Images
    if (images && Array.isArray(images)) {
      const insertImg = db.prepare('INSERT INTO product_images (id, product_id, image_url, display_order, is_primary) VALUES (?, ?, ?, ?, ?)');
      images.forEach((imgUrl: string, idx: number) => {
        if (imgUrl.trim()) {
          insertImg.run(`img_${id}_${idx}`, id, imgUrl.trim(), idx, idx === 0 ? 1 : 0);
        }
      });
    }

    res.json({ success: true, id, slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, sku, category_id, description, short_description, specifications,
      cost_price, regular_price, discount_price, stock_quantity, low_stock_threshold,
      brand, is_featured, is_published, images
    } = req.body;

    db.prepare(`
      UPDATE products SET
        name = ?, sku = ?, category_id = ?, description = ?, short_description = ?,
        specifications = ?, cost_price = ?, regular_price = ?, discount_price = ?,
        stock_quantity = ?, low_stock_threshold = ?, brand = ?, is_featured = ?,
        is_published = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name, sku, category_id || null, description || '', short_description || '',
      typeof specifications === 'string' ? specifications : JSON.stringify(specifications || {}),
      Number(cost_price), Number(regular_price), discount_price ? Number(discount_price) : null,
      Number(stock_quantity), Number(low_stock_threshold),
      brand || '', is_featured ? 1 : 0, is_published ? 1 : 0, id
    );

    if (images && Array.isArray(images)) {
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
      const insertImg = db.prepare('INSERT INTO product_images (id, product_id, image_url, display_order, is_primary) VALUES (?, ?, ?, ?, ?)');
      images.forEach((imgUrl: string, idx: number) => {
        if (imgUrl.trim()) {
          insertImg.run(`img_${id}_${idx}`, id, imgUrl.trim(), idx, idx === 0 ? 1 : 0);
        }
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // a product that is part of a past order is kept for that order's records, but taken off sale
    // and off every shelf in the 3D store
    if (db.prepare('SELECT 1 FROM order_items WHERE product_id = ?').get(id)) {
      db.prepare("UPDATE products SET is_published = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      try {
        db.prepare('DELETE FROM store_shelf_items WHERE product_id = ?').run(id);
      } catch {
        /* table not created yet */
      }
      return res.json({ success: true, hidden: true, message: 'This product is part of past orders, so it was hidden from the store instead of deleted.' });
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Supplier Management & Comparison Engine
apiRouter.get('/admin/suppliers', requireAdmin, (req: Request, res: Response) => {
  try {
    const suppliers = db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM supplier_products WHERE supplier_id = s.id) as supplied_products_count,
             (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id) as total_purchase_orders
      FROM suppliers s
      ORDER BY s.created_at DESC
    `).all();
    res.json({ suppliers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/suppliers', requireAdmin, (req: Request, res: Response) => {
  try {
    const {
      name, business_name, contact_person, phone, whatsapp, email, city, country,
      address, supplier_type, payment_terms, return_policy, reliability_rating, quality_rating, notes
    } = req.body;

    if (!name || !business_name || !contact_person || !phone || !city) {
      return res.status(400).json({ error: 'Name, business name, contact person, phone, and city are required' });
    }

    const id = `sup_${Date.now()}`;
    const code = `SUP-${city.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;

    db.prepare(`
      INSERT INTO suppliers (
        id, code, name, business_name, contact_person, phone, whatsapp, email,
        city, country, address, supplier_type, payment_terms, return_policy,
        reliability_rating, quality_rating, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, code, name, business_name, contact_person, phone, whatsapp || phone, email || '',
      city, country || 'Pakistan', address || '', supplier_type || 'Wholesaler',
      payment_terms || '30% Advance, 70% Delivery', return_policy || 'Replacement within 14 days',
      Number(reliability_rating || 4.5), Number(quality_rating || 4.5), notes || ''
    );

    res.json({ success: true, id, code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/suppliers/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, business_name, contact_person, phone, whatsapp, email, city, country,
      address, supplier_type, payment_terms, return_policy, reliability_rating, quality_rating, notes
    } = req.body;

    db.prepare(`
      UPDATE suppliers SET
        name = ?, business_name = ?, contact_person = ?, phone = ?, whatsapp = ?, email = ?,
        city = ?, country = ?, address = ?, supplier_type = ?, payment_terms = ?,
        return_policy = ?, reliability_rating = ?, quality_rating = ?, notes = ?
      WHERE id = ?
    `).run(
      name, business_name, contact_person, phone, whatsapp, email, city, country,
      address, supplier_type, payment_terms, return_policy,
      Number(reliability_rating), Number(quality_rating), notes, id
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compare Multiple Suppliers for a Product
apiRouter.get('/admin/suppliers/comparison/:productId', requireAdmin, (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const product = db.prepare('SELECT id, name, sku, cost_price, regular_price, discount_price FROM products WHERE id = ?').get(productId) as any;

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const comparison = db.prepare(`
      SELECT sp.*, s.name as supplier_name, s.business_name, s.city, s.country, s.reliability_rating, s.quality_rating,
             s.payment_terms, s.phone, s.whatsapp,
             (sp.wholesale_price + sp.shipping_cost_estimate) as estimated_landed_unit_cost
      FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.product_id = ?
      ORDER BY sp.is_preferred DESC, estimated_landed_unit_cost ASC
    `).all(productId);

    res.json({ product, comparison });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/suppliers/link-product', requireAdmin, (req: Request, res: Response) => {
  try {
    const { supplier_id, product_id, wholesale_price, moq, shipping_cost_estimate, lead_time_days, is_preferred } = req.body;
    const id = `sp_${Date.now()}`;

    if (is_preferred) {
      db.prepare('UPDATE supplier_products SET is_preferred = 0 WHERE product_id = ?').run(product_id);
    }

    db.prepare(`
      INSERT INTO supplier_products (id, supplier_id, product_id, wholesale_price, moq, shipping_cost_estimate, lead_time_days, is_preferred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, supplier_id, product_id, Number(wholesale_price), Number(moq || 10), Number(shipping_cost_estimate || 0), Number(lead_time_days || 3), is_preferred ? 1 : 0);

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Dedicated Product Research & Sourcing Module (with 7-factor weighted scoring)
apiRouter.get('/admin/sourcing', requireAdmin, (req: Request, res: Response) => {
  try {
    const research = db.prepare(`
      SELECT sr.*, c.name as category_name
      FROM sourcing_research sr
      LEFT JOIN categories c ON c.id = sr.category_id
      ORDER BY sr.total_score DESC, sr.created_at DESC
    `).all();
    res.json({ research });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/sourcing', requireAdmin, (req: Request, res: Response) => {
  try {
    const {
      title, category_id, description, image_url, source_city, source_country,
      supplier_name, sample_cost, wholesale_cost, moq, est_shipping_cost,
      expected_selling_price, competitor_prices, estimated_demand, competition_level,
      quality_assessment, notes, status,
      score_quality, score_profit, score_demand, score_competition, score_shipping, score_supplier, score_repeat
    } = req.body;

    const weightsSetting = db.prepare('SELECT value FROM website_settings WHERE key = ?').get('sourcing_weights') as any;
    const weights = weightsSetting ? JSON.parse(weightsSetting.value) : {
      quality: 0.25, profit: 0.20, demand: 0.20, competition: 0.10, shipping: 0.10, supplier: 0.10, repeat: 0.05
    };

    const q = Number(score_quality || 80);
    const p = Number(score_profit || 80);
    const d = Number(score_demand || 75);
    const c = Number(score_competition || 70);
    const sh = Number(score_shipping || 80);
    const sup = Number(score_supplier || 80);
    const rep = Number(score_repeat || 70);

    const total_score = Number((
      (q * weights.quality) +
      (p * weights.profit) +
      (d * weights.demand) +
      (c * weights.competition) +
      (sh * weights.shipping) +
      (sup * weights.supplier) +
      (rep * weights.repeat)
    ).toFixed(1));

    const id = `res_${Date.now()}`;
    db.prepare(`
      INSERT INTO sourcing_research (
        id, title, category_id, description, image_url, source_city, source_country,
        supplier_name, sample_cost, wholesale_cost, moq, est_shipping_cost,
        expected_selling_price, competitor_prices, estimated_demand, competition_level,
        quality_assessment, notes, status,
        score_quality, score_profit, score_demand, score_competition, score_shipping, score_supplier, score_repeat,
        total_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, title, category_id || null, description || '', image_url || '', source_city, source_country || 'Pakistan',
      supplier_name || '', Number(sample_cost || 0), Number(wholesale_cost), Number(moq || 50), Number(est_shipping_cost || 0),
      Number(expected_selling_price), competitor_prices || '', estimated_demand || 'Medium', competition_level || 'Moderate',
      quality_assessment || '', notes || '', status || 'New Idea',
      q, p, d, c, sh, sup, rep, total_score
    );

    res.json({ success: true, id, total_score });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/sourcing/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title, category_id, description, image_url, source_city, source_country,
      supplier_name, sample_cost, wholesale_cost, moq, est_shipping_cost,
      expected_selling_price, competitor_prices, estimated_demand, competition_level,
      quality_assessment, notes, status,
      score_quality, score_profit, score_demand, score_competition, score_shipping, score_supplier, score_repeat
    } = req.body;

    const weightsSetting = db.prepare('SELECT value FROM website_settings WHERE key = ?').get('sourcing_weights') as any;
    const weights = weightsSetting ? JSON.parse(weightsSetting.value) : {
      quality: 0.25, profit: 0.20, demand: 0.20, competition: 0.10, shipping: 0.10, supplier: 0.10, repeat: 0.05
    };

    const q = Number(score_quality || 80);
    const p = Number(score_profit || 80);
    const d = Number(score_demand || 75);
    const c = Number(score_competition || 70);
    const sh = Number(score_shipping || 80);
    const sup = Number(score_supplier || 80);
    const rep = Number(score_repeat || 70);

    const total_score = Number((
      (q * weights.quality) +
      (p * weights.profit) +
      (d * weights.demand) +
      (c * weights.competition) +
      (sh * weights.shipping) +
      (sup * weights.supplier) +
      (rep * weights.repeat)
    ).toFixed(1));

    db.prepare(`
      UPDATE sourcing_research SET
        title = ?, category_id = ?, description = ?, image_url = ?, source_city = ?, source_country = ?,
        supplier_name = ?, sample_cost = ?, wholesale_cost = ?, moq = ?, est_shipping_cost = ?,
        expected_selling_price = ?, competitor_prices = ?, estimated_demand = ?, competition_level = ?,
        quality_assessment = ?, notes = ?, status = ?,
        score_quality = ?, score_profit = ?, score_demand = ?, score_competition = ?, score_shipping = ?, score_supplier = ?, score_repeat = ?,
        total_score = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title, category_id || null, description, image_url, source_city, source_country,
      supplier_name, Number(sample_cost), Number(wholesale_cost), Number(moq), Number(est_shipping_cost),
      Number(expected_selling_price), competitor_prices, estimated_demand, competition_level,
      quality_assessment, notes, status,
      q, p, d, c, sh, sup, rep, total_score, id
    );

    res.json({ success: true, total_score });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// One-Click Launch: Promote Approved Research Item to Live Store Catalog
apiRouter.post('/admin/sourcing/:id/promote-to-store', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM sourcing_research WHERE id = ?').get(id) as any;
    if (!item) {
      return res.status(404).json({ error: 'Research item not found' });
    }

    const prodId = `prod_${Date.now()}`;
    const sku = `AC-${item.source_city.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    db.transaction(() => {
      // 1. Insert product
      db.prepare(`
        INSERT INTO products (
          id, slug, name, sku, category_id, description, short_description, specifications,
          cost_price, regular_price, discount_price, stock_quantity, low_stock_threshold,
          brand, is_featured, is_published
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 25, 5, 'Aura Direct Sourced', 1, 1)
      `).run(
        prodId, slug, item.title, sku, item.category_id,
        item.description || item.notes || 'Carefully sourced and quality inspected product.',
        `Authentically sourced from ${item.source_city}, ${item.source_country}. Quality score: ${item.total_score}/100.`,
        JSON.stringify({
          'Source Origin': `${item.source_city}, ${item.source_country}`,
          'Quality Evaluation': `${item.total_score} / 100 Verified`,
          'Supplier Direct': item.supplier_name || 'Certified Wholesaler'
        }),
        item.wholesale_cost + item.est_shipping_cost, // Landed cost base
        Math.round(item.expected_selling_price * 1.15),
        item.expected_selling_price
      );

      // 2. Primary Image
      if (item.image_url) {
        db.prepare('INSERT INTO product_images (id, product_id, image_url, display_order, is_primary) VALUES (?, ?, ?, 0, 1)')
          .run(`img_${prodId}_0`, prodId, item.image_url);
      }

      // 3. Mark research status as Added to Store
      db.prepare("UPDATE sourcing_research SET status = 'Added to Store' WHERE id = ?").run(id);

      // 4. Initial Inventory movement
      db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reference_type, reference_id, reason)
        VALUES (?, ?, 25, 'Purchase Receive', 'Sourcing Launch', ?, 'Initial Sourcing Pilot Batch')
      `).run(`im_${Date.now()}`, prodId, id);
    })();

    res.json({ success: true, message: 'Product successfully promoted to live store catalogue!', productId: prodId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Procurement & Purchase Orders
apiRouter.get('/admin/procurement', requireAdmin, (req: Request, res: Response) => {
  try {
    const orders = db.prepare(`
      SELECT po.*, s.name as supplier_name, s.business_name, s.phone as supplier_phone,
             (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      ORDER BY po.created_at DESC
    `).all();

    const items = db.prepare(`
      SELECT poi.*, p.name as product_name, p.sku as product_sku
      FROM purchase_order_items poi
      JOIN products p ON p.id = poi.product_id
    `).all();

    res.json({ orders, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/procurement', requireAdmin, (req: Request, res: Response) => {
  try {
    const { supplier_id, items, shipping_cost, other_expenses, notes, expected_date } = req.body;

    if (!supplier_id || !items || !items.length) {
      return res.status(400).json({ error: 'Supplier and items are required' });
    }

    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const poId = `po_${Date.now()}`;

    let subtotal = 0;
    items.forEach((it: any) => {
      subtotal += Number(it.unit_cost) * Number(it.quantity);
    });

    const total_cost = subtotal + Number(shipping_cost || 0) + Number(other_expenses || 0);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_orders (
          id, po_number, supplier_id, status, subtotal, shipping_cost, other_expenses,
          total_cost, payment_status, expected_date, notes
        ) VALUES (?, ?, ?, 'Ordered', ?, ?, ?, ?, 'Unpaid', ?, ?)
      `).run(
        poId, poNumber, supplier_id, subtotal, Number(shipping_cost || 0), Number(other_expenses || 0),
        total_cost, expected_date || null, notes || ''
      );

      const insertPoItem = db.prepare(`
        INSERT INTO purchase_order_items (id, po_id, product_id, variant_id, quantity, unit_cost, total_cost, received_qty)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `);

      items.forEach((it: any) => {
        insertPoItem.run(
          `poi_${Date.now()}_${Math.random()}`,
          poId, it.product_id, it.variant_id || null, Number(it.quantity),
          Number(it.unit_cost), Number(it.unit_cost) * Number(it.quantity)
        );
      });
    })();

    res.json({ success: true, poNumber, poId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/procurement/:id/receive', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as any;
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    db.transaction(() => {
      // Mark PO as Received
      db.prepare("UPDATE purchase_orders SET status = 'Received', received_date = date('now') WHERE id = ?").run(id);

      const items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(id) as any[];

      const updateProdStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?');
      const logMovement = db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reference_type, reference_id, reason)
        VALUES (?, ?, ?, 'Purchase Receive', 'Purchase Order', ?, 'Goods received from supplier')
      `);

      items.forEach(it => {
        db.prepare('UPDATE purchase_order_items SET received_qty = quantity WHERE id = ?').run(it.id);
        updateProdStock.run(it.quantity, it.product_id);
        logMovement.run(`im_${Date.now()}_${Math.random()}`, it.product_id, it.quantity, po.po_number);
      });
    })();

    res.json({ success: true, message: 'Stock successfully received and added to inventory ledger' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Inventory Ledger & Adjustments
apiRouter.get('/admin/inventory', requireAdmin, (req: Request, res: Response) => {
  try {
    const stockList = db.prepare(`
      SELECT p.id, p.name, p.sku, p.cost_price, p.regular_price, p.discount_price, p.stock_quantity, p.low_stock_threshold,
             c.name as category_name,
             (p.stock_quantity * p.cost_price) as total_cost_value,
             (p.stock_quantity * COALESCE(p.discount_price, p.regular_price)) as total_retail_value,
             (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status != 'Cancelled') as total_units_sold
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.stock_quantity ASC
    `).all();

    const recentMovements = db.prepare(`
      SELECT im.*, p.name as product_name, p.sku as product_sku
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      ORDER BY im.created_at DESC
      LIMIT 25
    `).all();

    res.json({ stockList, recentMovements });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/inventory/adjust', requireAdmin, (req: Request, res: Response) => {
  try {
    const { product_id, adjustment_qty, reason, movement_type } = req.body;
    if (!product_id || adjustment_qty === undefined) {
      return res.status(400).json({ error: 'Product and adjustment quantity required' });
    }

    const qty = Number(adjustment_qty);
    db.transaction(() => {
      db.prepare('UPDATE products SET stock_quantity = MAX(0, stock_quantity + ?) WHERE id = ?').run(qty, product_id);
      db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reference_type, reason)
        VALUES (?, ?, ?, ?, 'Manual Adjustment', ?)
      `).run(`im_${Date.now()}`, product_id, qty, movement_type || 'Manual Adjustment', reason || 'Stock reconciliation');
    })();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Order Management & Fulfillment
apiRouter.get('/admin/orders', requireAdmin, (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT o.*, 
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'all') {
      query += ` AND o.status = ?`;
      params.push(status);
    }
    if (search) {
      query += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.city LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY o.created_at DESC`;
    const orders = db.prepare(query).all(...params);

    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/admin/orders/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    res.json({ order, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/orders/:id/status', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, courier_partner, tracking_number } = req.body;

    let updateQuery = 'UPDATE orders SET status = ?, updated_at = datetime("now")';
    const params: any[] = [status];

    if (courier_partner) {
      updateQuery += ', courier_partner = ?';
      params.push(courier_partner);
    }
    if (tracking_number) {
      updateQuery += ', tracking_number = ?';
      params.push(tracking_number);
    }
    if (status === 'Dispatched') {
      updateQuery += ', dispatched_at = datetime("now")';
    }
    if (status === 'Delivered') {
      updateQuery += ', delivered_at = datetime("now"), payment_status = "Paid"';
    }

    updateQuery += ' WHERE id = ?';
    params.push(id);

    db.prepare(updateQuery).run(...params);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Financial Management & Product-Level Landed Cost Breakdown
apiRouter.get('/admin/financials', requireAdmin, (req: Request, res: Response) => {
  try {
    // 1. Overall P&L
    const revenueRow = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(shipping_fee), 0) as total_shipping_revenue
      FROM orders WHERE status != 'Cancelled'
    `).get() as any;

    const cogsRow = db.prepare(`
      SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'Cancelled'
    `).get() as any;

    const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
    const totalExpenses = expenses.reduce((acc: number, e: any) => acc + e.amount, 0);

    const grossProfit = revenueRow.total_revenue - cogsRow.total_cogs;
    const netProfit = grossProfit - totalExpenses;

    // 2. Product-Level Landed Cost & Profitability Matrix
    // Total Landed Cost = Supplier Purchase Price + Inbound Freight Allocation (~PKR 80-120) + Packaging (~PKR 60)
    // Contribution Profit = Selling Price - Total Landed Cost - Payment Gateway Fee (~2%) - Delivery Subsidy
    const products = db.prepare(`
      SELECT 
        p.id, p.name, p.sku, p.cost_price, p.regular_price, p.discount_price,
        c.name as category_name,
        COALESCE((SELECT SUM(quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status != 'Cancelled'), 0) as units_sold
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY units_sold DESC
    `).all() as any[];

    const profitabilityMatrix = products.map(p => {
      const sellingPrice = p.discount_price ? p.discount_price : p.regular_price;
      const supplierCost = p.cost_price;
      const inboundShipping = 90; // Average inbound freight per unit from wholesale market
      const packagingCost = 65; // Custom box, bubble wrap, poly mailer
      const totalLandedCost = supplierCost + inboundShipping + packagingCost;

      const paymentFee = Math.round(sellingPrice * 0.015); // Average 1.5% COD / payment processing fee
      const deliverySubsidy = 40; // Delivery expense not covered by standard PKR 200 customer fee

      const contributionProfit = sellingPrice - totalLandedCost - paymentFee - deliverySubsidy;
      const contributionMarginPercent = Number(((contributionProfit / sellingPrice) * 100).toFixed(1));

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category_name,
        supplierCost,
        inboundShipping,
        packagingCost,
        totalLandedCost,
        sellingPrice,
        paymentFee,
        deliverySubsidy,
        contributionProfit,
        contributionMarginPercent,
        unitsSold: p.units_sold,
        totalGeneratedContribution: contributionProfit * p.units_sold
      };
    });

    res.json({
      summary: {
        totalRevenue: revenueRow.total_revenue,
        totalCOGS: cogsRow.total_cogs,
        grossProfit,
        grossMarginPercent: revenueRow.total_revenue > 0 ? ((grossProfit / revenueRow.total_revenue) * 100).toFixed(1) : 0,
        totalExpenses,
        netProfit,
        netMarginPercent: revenueRow.total_revenue > 0 ? ((netProfit / revenueRow.total_revenue) * 100).toFixed(1) : 0,
      },
      profitabilityMatrix,
      expenses
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/expenses', requireAdmin, (req: Request, res: Response) => {
  try {
    const { category, amount, description, date } = req.body;
    if (!category || !amount || !description) {
      return res.status(400).json({ error: 'Category, amount, and description are required' });
    }

    const id = `exp_${Date.now()}`;
    db.prepare(`
      INSERT INTO expenses (id, category, amount, description, date)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, category, Number(amount), description, date || new Date().toISOString().slice(0, 10));

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Coupons CRUD
apiRouter.get('/admin/coupons', requireAdmin, (req: Request, res: Response) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    res.json({ coupons });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/coupons', requireAdmin, (req: Request, res: Response) => {
  try {
    const { code, discount_type, discount_value, min_order_value, max_discount, usage_limit, expires_at } = req.body;
    const id = `coup_${Date.now()}`;

    db.prepare(`
      INSERT INTO coupons (id, code, discount_type, discount_value, min_order_value, max_discount, usage_limit, expires_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id, code.toUpperCase(), discount_type || 'percentage', Number(discount_value),
      Number(min_order_value || 0), max_discount ? Number(max_discount) : null,
      Number(usage_limit || 100), expires_at || null
    );

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Store Settings
apiRouter.get('/admin/settings', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT key, value FROM website_settings').all() as any[];
    const settings: Record<string, string> = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    const updateStmt = db.prepare('INSERT OR REPLACE INTO website_settings (key, value) VALUES (?, ?)');
    for (const [key, val] of Object.entries(settings)) {
      updateStmt.run(key, typeof val === 'string' ? val : JSON.stringify(val));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. CSV Export
apiRouter.get('/admin/export/products', requireAdmin, (req: Request, res: Response) => {
  try {
    const products = db.prepare(`
      SELECT p.id, p.sku, p.name, c.name as category, p.cost_price, p.regular_price, p.discount_price,
             p.stock_quantity, p.brand, p.is_featured, p.is_published
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `).all() as any[];

    let csv = 'ID,SKU,Name,Category,Cost Price (PKR),Regular Price (PKR),Discount Price (PKR),Stock,Brand,Featured,Published\n';
    products.forEach(p => {
      csv += `"${p.id}","${p.sku}","${p.name.replace(/"/g, '""')}","${p.category || ''}",${p.cost_price},${p.regular_price},${p.discount_price || ''},${p.stock_quantity},"${p.brand || ''}",${p.is_featured},${p.is_published}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/admin/export/orders', requireAdmin, (req: Request, res: Response) => {
  try {
    const orders = db.prepare(`
      SELECT order_number, customer_name, customer_email, customer_phone, city, province,
             status, payment_method, payment_status, subtotal, shipping_fee, discount_amount,
             total_amount, courier_partner, tracking_number, created_at
      FROM orders
      ORDER BY created_at DESC
    `).all() as any[];

    let csv = 'Order Number,Customer,Email,Phone,City,Province,Status,Payment Method,Payment Status,Subtotal,Shipping,Discount,Total,Courier,Tracking,Date\n';
    orders.forEach(o => {
      csv += `"${o.order_number}","${o.customer_name}","${o.customer_email}","${o.customer_phone}","${o.city}","${o.province}","${o.status}","${o.payment_method}","${o.payment_status}",${o.subtotal},${o.shipping_fee},${o.discount_amount},${o.total_amount},"${o.courier_partner || ''}","${o.tracking_number || ''}","${o.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders_export.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Admin 3D Store Shelf & Department Management
apiRouter.put('/admin/store3d/shelves/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      product_id, featured_label, shelf_code, aisle_label,
      demo_video_url, tryon_type, color_options, size_options,
      department_id, shelf_type, pos_x, pos_z, rotation_y
    } = req.body;
    db.prepare(`
      UPDATE store_shelves SET
        product_id = ?,
        featured_label = ?,
        shelf_code = COALESCE(?, shelf_code),
        aisle_label = COALESCE(?, aisle_label),
        demo_video_url = ?,
        tryon_type = ?,
        color_options = ?,
        size_options = ?,
        department_id = COALESCE(?, department_id),
        shelf_type = COALESCE(?, shelf_type),
        pos_x = COALESCE(?, pos_x),
        pos_z = COALESCE(?, pos_z),
        rotation_y = COALESCE(?, rotation_y)
      WHERE id = ?
    `).run(
      product_id || null, 
      featured_label || null, 
      shelf_code || null, 
      aisle_label || null,
      demo_video_url || null,
      tryon_type || null,
      color_options || null,
      size_options || null,
      department_id || null,
      shelf_type || null,
      pos_x !== undefined ? Number(pos_x) : null,
      pos_z !== undefined ? Number(pos_z) : null,
      rotation_y !== undefined ? Number(rotation_y) : null,
      id
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/store3d/shelves', requireAdmin, (req: Request, res: Response) => {
  try {
    const { 
      department_id, shelf_code, aisle_label, pos_x, pos_z, rotation_y, 
      shelf_type, product_id, featured_label, demo_video_url, tryon_type, 
      color_options, size_options 
    } = req.body;
    const id = `sh_${Date.now()}`;
    db.prepare(`
      INSERT INTO store_shelves (
        id, department_id, shelf_code, aisle_label, pos_x, pos_y, pos_z, rotation_y, 
        shelf_type, product_id, featured_label, demo_video_url, tryon_type, color_options, size_options
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, department_id, shelf_code, aisle_label, 
      Number(pos_x || 0), Number(pos_z || 0), Number(rotation_y || 0), 
      shelf_type || 'double_tier', product_id || null, featured_label || null,
      demo_video_url || null, tryon_type || null, color_options || null, size_options || null
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/admin/store3d/shelves/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM store_shelves WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
