# ShopWalk 360 - Curated Retail & Intelligent Sourcing Platform

A production-ready full-stack e-commerce system and internal retail supply chain engine tailored for curated, wholesale-sourced retail in Pakistan, with extensible multi-currency and international sourcing support.

---

## 1. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AURACONNECT ARCHITECTURE                        │
└────────────────────────────────────────────────────────────────────────┘

 [ Customer Storefront ]                [ Admin Business Management Suite ]
 ├─ Homepage (Dynamic Banners)          ├─ Executive Metrics & P&L Dashboard
 ├─ Shop Catalog & Multi-Filters        ├─ Product & SKU Management (CRUD + CSV)
 ├─ Product Specs & Image Zoom          ├─ Supplier Directory & Quotation Comparison
 ├─ Live Stock & Reservation            ├─ Sourcing Pipeline (7-Factor Scoring Engine)
 ├─ Real-Time Cart & Coupon Engine      ├─ Procurement & Purchase Orders (POs)
 ├─ Checkout (COD, Bank Transfer, Card) ├─ Inventory Ledger & Stock Movement Audit
 ├─ Consignment Tracker (TCS/Trax)      ├─ Order Fulfillment & Invoicing
 └─ Customer Account & Wishlist         └─ Financials: Landed Cost & Margins
                  │                                      │
                  ▼                                      ▼
    ┌──────────────────────────────────────────────────────────┐
    │       Express.js REST API & Transactional Middleware     │
    │  (/api/products, /api/checkout, /api/admin/*, /api/auth) │
    └──────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌──────────────────────────────────────────────────────────┐
    │   ACID-Compliant Relational Database (better-sqlite3)    │
    │   WAL Mode Enabled · Foreign Keys ON · Index Optimized   │
    │   (Compatible with Managed PostgreSQL / Cloud SQL)       │
    └──────────────────────────────────────────────────────────┘
```

---

## 2. Key Modules & Business Capabilities

### A. Customer Storefront
- **Top Announcement Bar:** Dynamic shipping notice ("Free Nationwide Express Delivery on orders > PKR 3,500"), contact phone, and instant demo role switcher.
- **Search & Filtering:** Autocomplete search across SKU, product title, and category; price slider; brand filters; stock availability; and multi-attribute sorting.
- **Product Details & Transparency:** Multi-angle image preview with zoom, real-time warehouse inventory counter, technical specifications table, and authentic verified review submission form.
- **Shopping Cart & Checkout:** Slide-over cart with free delivery progress meter, live coupon validator (`WELCOME10` or `AURA500`), Pakistani cities selector (Lahore, Karachi, Islamabad, etc.), Cash on Delivery (COD), Meezan Bank corporate account transfer details, and confetti order confirmation.
- **Order Tracking:** Enter Order Number (e.g., `AC-20261028-1001`) and phone to view real-time fulfillment milestones and assigned courier waybill numbers.

### B. Business Sourcing & Supplier Comparison Engine
- **Wholesale Supplier Directory:** Manages manufacturers, direct importers, and artisan cooperatives across Lahore (Hall Road, Shah Alam), Karachi (Korangi, Bolton Market), Sialkot, Gujranwala, and overseas trade hubs. Includes WhatsApp direct launch, quality ratings, reliability ratings, and payment terms.
- **Supplier Quotation Comparison:** Side-by-side comparison matrix for any product showing Wholesale Unit Price, MOQ, Inbound Shipping, Lead Time, Quality/Reliability score, and Total Landed Procurement Cost with 1-click preferred supplier assignment.
- **Product Research & Sourcing Pipeline:** Kanban/list pipeline tracking items from *New Idea* to *Added to Store*.
  - **7-Factor Weighted Evaluation Scoring:**
    - Product Quality: 25%
    - Profit Potential: 20%
    - Customer Demand: 20%
    - Competition Ease: 10%
    - Shipping & Storage Resilience: 10%
    - Supplier Reliability: 10%
    - Repeat Purchase Potential: 5%
    - Total Score out of 100 with interactive sliders.
  - **1-Click "Launch to Store":** Instantly promotes an approved research item into a live product in the store catalogue with an initial inventory batch.

### C. Inventory Ledger & Procurement
- **Purchase Orders (POs):** Issue formal POs to suppliers, track advance/dispatch payments, and click "Receive Stock" to auto-increment physical stock and log an entry in the movement audit trail.
- **Inventory Ledger:** Real-time physical inventory valuation (cost value vs. retail realization), low-stock replenishment warnings, and manual stock adjustment modal with audit reasoning.

### D. Financial Management & Landed Cost Breakdown
- **Tier 1 - Gross Profit:** Sales Revenue &minus; Cost of Goods Sold (COGS).
- **Tier 2 - Operating Expenses:** Packaging boxes, bubble mailers, Meta advertising campaigns, and logistics loss buffers.
- **Tier 3 - Net Profit:** Gross Profit &minus; Actual recorded operational expenditures.
- **Product-Level Landed Cost Formula:**
  $$\text{Total Landed Cost} = \text{Supplier Purchase Price} + \text{Inbound Freight Allocation} + \text{Packaging Box}$$
  $$\text{Contribution Profit} = \text{Selling Price} - \text{Total Landed Cost} - \text{Payment Fee} - \text{Delivery Subsidy}$$

---

## 3. Database Schema

The platform uses a normalized relational database schema (`server/db.ts`):

- `users` (id, email, password_hash, full_name, phone, role, created_at, updated_at)
- `customer_profiles` (id, user_id, default_address_id, notes, total_spent, orders_count)
- `addresses` (id, user_id, label, recipient_name, phone, address_line, city, province, postal_code, is_default)
- `categories` (id, slug, name, description, image_url, display_order, is_active)
- `products` (id, slug, name, sku, category_id, description, short_description, specifications, cost_price, regular_price, discount_price, stock_quantity, low_stock_threshold, is_featured, is_published, brand, weight_kg, warranty, created_at)
- `product_images` (id, product_id, image_url, alt_text, display_order, is_primary)
- `product_variants` (id, product_id, sku, title, color, size, price, cost_price, stock_quantity)
- `suppliers` (id, code, name, business_name, contact_person, phone, whatsapp, email, city, country, address, supplier_type, payment_terms, return_policy, reliability_rating, quality_rating, notes)
- `supplier_products` (id, supplier_id, product_id, supplier_sku, wholesale_price, moq, sample_available, sample_cost, lead_time_days, shipping_cost_estimate, is_preferred)
- `sourcing_research` (id, title, category_id, description, image_url, source_city, source_country, supplier_name, sample_cost, wholesale_cost, moq, est_shipping_cost, expected_selling_price, competitor_prices, estimated_demand, competition_level, quality_assessment, notes, status, score_quality, score_profit, score_demand, score_competition, score_shipping, score_supplier, score_repeat, total_score)
- `purchase_orders` (id, po_number, supplier_id, status, subtotal, shipping_cost, other_expenses, total_cost, payment_status, expected_date, received_date, notes)
- `purchase_order_items` (id, po_id, product_id, variant_id, quantity, unit_cost, total_cost, received_qty)
- `inventory_movements` (id, product_id, variant_id, change_qty, movement_type, reference_type, reference_id, reason, created_at)
- `orders` (id, order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, city, province, postal_code, status, payment_method, payment_status, subtotal, shipping_fee, discount_amount, total_amount, coupon_code, delivery_instructions, courier_partner, tracking_number)
- `order_items` (id, order_id, product_id, variant_id, product_name, sku, unit_price, cost_price, quantity, total_price)
- `reviews` (id, product_id, user_id, reviewer_name, rating, title, comment, is_verified_purchase, created_at)
- `coupons` (id, code, discount_type, discount_value, min_order_value, max_discount, usage_limit, times_used, expires_at, is_active)
- `wishlist_items` (id, user_id, product_id)
- `expenses` (id, category, amount, description, date)
- `website_settings` (key, value)
- `newsletter_subscribers` (id, email)

### PostgreSQL Migration Equivalent
To run on PostgreSQL or Cloud SQL, replace SQLite types with:
- `TEXT PRIMARY KEY` $\rightarrow$ `VARCHAR(64) PRIMARY KEY` or `UUID DEFAULT gen_random_uuid()`
- `REAL` $\rightarrow$ `NUMERIC(12, 2)`
- `INTEGER` $\rightarrow$ `INTEGER`
- `datetime('now')` $\rightarrow$ `CURRENT_TIMESTAMP`

---

## 4. API Documentation

### Public & Customer Endpoints
- `GET /api/categories` - Returns active categories and product counts
- `GET /api/products` - Filter products by category, search term, brand, inStock, and price range
- `GET /api/products/:slug` - Product details, full image gallery, reviews, and related items
- `POST /api/products/:id/review` - Submit authentic customer rating and review
- `POST /api/coupons/apply` - Validates coupon code and calculates discount against cart subtotal
- `POST /api/checkout` - Executes transactional order creation, reserves stock, and logs inventory movement
- `GET /api/orders/track` - Real-time parcel tracking by order number and phone
- `GET /api/orders/my-orders` - Customer order history
- `POST /api/newsletter` - Subscribe to wholesale product drop updates

### Admin Business Management Endpoints
- `GET /api/admin/overview` - Live sales revenue, COGS, gross margin %, net profit, inventory valuation, and low-stock alerts
- `GET /api/admin/products` / `POST` / `PUT` / `DELETE` - Product catalogue CRUD with image lists
- `GET /api/admin/suppliers` / `POST` / `PUT` - Supplier directory management
- `GET /api/admin/suppliers/comparison/:productId` - Multi-supplier price and MOQ comparison
- `GET /api/admin/sourcing` / `POST` / `PUT` - 7-factor product evaluation scoring engine
- `POST /api/admin/sourcing/:id/promote-to-store` - 1-Click promote research item to live store
- `GET /api/admin/procurement` / `POST` - Purchase order generation
- `PUT /api/admin/procurement/:id/receive` - Mark PO goods received and update stock
- `GET /api/admin/inventory` & `POST /api/admin/inventory/adjust` - Stock ledger and audit adjustments
- `GET /api/admin/orders` & `PUT /api/admin/orders/:id/status` - Order fulfillment and courier waybills
- `GET /api/admin/financials` & `POST /api/admin/expenses` - Landed cost matrix and operating expenses
- `GET /api/admin/export/products` & `GET /api/admin/export/orders` - Direct CSV exports

---

## 5. Accounts & Deployment

There are no demo accounts or sample orders. The first admin is created from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables on startup; customers register themselves. The admin panel lives at `/admin` and is not linked from the customer site.

See **DEPLOYMENT.md** for Vercel (frontend) + Railway (API) + Cloudflare R2 (media) setup and the exact environment variables.

---

## 6. External Integrations Setup (Production Readiness)

The platform is designed to connect to the following external APIs when live production credentials are provided:
1. **Pakistani Courier APIs:**
   - TCS Express API (`api.tcsexpress.com`) or Trax Logistics API (`api.trax.pk`): Connect courier consignment creation in `server/routes.ts` (`/api/admin/orders/:id/status`).
2. **Online Payment Gateways:**
   - JazzCash / EasyPaisa / PayFast / Safepay: Connect merchant IDs and signature webhooks to verify card payments before marking orders as `Paid`.
3. **Transactional WhatsApp / SMS Notifications:**
   - Twilio / Infobip / SMSCountry Pakistan: Trigger automated SMS and WhatsApp dispatch notifications on order milestone transitions.

---

## 7. ShopWalk 360 — 3D Virtual Store & Personal Avatar

ShopWalk 360 is the immersive storefront (the **3D Store** toggle in the header). It reads the same
database as the classic store: products, prices, stock, images, variants, reviews, basket and checkout
are shared. If a device has no WebGL, shoppers are sent to the classic store automatically.

### Customer journey
1. **Entrance plaza** — glass façade with two automatic sliding doors. Overlay: *Welcome to ShopWalk 360 —
   Step Inside. Your Shopping Journey Begins Here.* → **CREATE MY VIRTUAL SELF** or **Continue as a guest**.
   Returning shoppers with a saved avatar see **Welcome Back! Continue with Your Virtual Self?**
   (Continue / Edit / Guest / Delete).
2. **Avatar Studio** — photo (upload or camera, after explicit consent) *or* ready-made guest avatars →
   **Preview room** (rotate, front/side/back) → **ENTER STORE** / **EDIT MY AVATAR**.
3. **Walk-in** — doors open, the avatar walks into reception, the camera follows. *Skip* is available, and
   it is skipped automatically for users who prefer reduced motion.
4. **Reception lobby** — reception desk, *Welcome to ShopWalk 360 / Explore. Experience. Discover.* LED wall,
   department directory totems, interactive map kiosk, promotional totems (linked to live products),
   basket station, checkout counters.
5. **Galleria** — 12 departments, each a separate room with its own shop-front entrance, fascia sign,
   projecting blade sign, interior style, lighting temperature, aisle marker, information screen and
   demonstration zone. **Odd numbers are on the left, even on the right.**
6. **Explore Product** — walk up to any display (or tap it) → product panel with photos, 3D view,
   *Watch How It Works*, category try-on, specifications, real reviews and the product assistant.
7. **Basket & checkout** — items appear in the avatar's basket; checkout counters open the existing checkout.

### Controls
| | Computer | Phone / tablet |
|---|---|---|
| Walk | Click the floor · WASD / arrow keys (Shift = faster) | Tap the floor · on-screen joystick |
| Look | Drag | Drag · pinch to zoom |
| Interact | E · click a display | Tap a display · *Explore Product* |
| Camera | V or the *3rd/1st person* button | Toolbar |

Navigation aids: department directory, full map (tap to walk), mini-map, product/department search with
**Guide me** (auto-walk) and **Show route** (gold floor arrows + beacon), overhead wayfinding signs,
*Lobby* button, **Quick shop** mode (open any product or jump to its shelf without walking).

### Where the code lives
| Area | Files |
|---|---|
| Floor plan (rooms, fixture positions, zones) | `src/components/store3d/layout/storeLayout.ts` |
| 3D build (architecture, materials, signage, fixtures, product models) | `src/components/store3d/builder/*` |
| Engine (cameras, controls, path-finding, doors, proximity, video screens) | `src/components/store3d/engine/StoreEngine.ts`, `nav/pathfinding.ts` |
| Avatar (model, animation, studio, persistence, GLB adapter) | `src/components/store3d/avatar/*` |
| Product panel, try-on, 3D viewer, room/AR, video, assistant | `src/components/store3d/product/*` |
| HUD, map, joystick, entrance overlay, orchestration | `src/components/store3d/*.tsx` |
| Server (migration, layout, admin, uploads, avatar, integrations) | `server/store3dV2.ts` |
| Admin UI | `src/components/admin/Admin3DStore.tsx` (Admin → *3D Store & Shelves*) |

The 3D experience and the admin 3D tools are code-split; the classic store no longer downloads Three.js.
The scene is built with Three.js directly (the React layer talks to an engine class), which keeps
per-frame work out of React. React Three Fiber could wrap the same builder/engine later if preferred.

### Admin (Admin Suite → 3D Store & Shelves)
- **Store floor** — floor plan of all rooms and fixture positions.
- **Departments & entrances** — add/edit/delete departments; number, entrance position (12 units),
  colour, linked category, interior design, lighting, description, information-screen text, open/closed.
- **Shelves & displays** — per-department room plan; click a position to place a fixture
  (gondola, wall shelving, glass cabinet, podium, demo table, kitchen counter, mannequin, clothing rail,
  shoe wall, beauty vanity, room set, fitting station), assign a product, shelf level, badge, aisle label,
  shelf code, and mark demonstration zones.
- **Product experience** — per product: store location (+ place on a free position), images (URLs or
  upload), dimensions (cm), weight, generated preview model or uploaded **GLB**, demonstration video
  (upload MP4/WebM, YouTube or Vimeo, thumbnail, WebVTT captions), specifications, features, in-the-box,
  usage, care, ingredients, warranty, variants (colour/size with own price & stock), try-on type, worn-as
  slot, colours with exact hex values, sizes. A one-click **Remove sample listings** button is provided.
- **Promotional screens** — lobby totems linked to live products.
- **Preview the virtual store** button.

Uploads go to `uploads/<kind>/` (served at `/uploads`), are checked by file signature and size, and
require an admin session.

### Data migration (runs once, automatically)
`server/store3dV2.ts → migrateStoreExperienceV2()` adds the new columns/tables and re-lays the store:
- Departments are renumbered in the order requested (01 Electronics … 12 Gifts) and assigned to rooms.
- Fixtures are re-seeded on the new position grid.
- The previously seeded "demo videos" were generic stock clips (circuit boards, a gym, a coffee cup) that did
  not show the products, so they were **removed**. No product has a demo video until an admin adds one.
- Try-on was switched off for products where it was misleading (e.g. a wallet and packing cubes were marked
  as clothing try-on).
- Six **sample listings** (shirt, chinos, armchair, side table, sunglasses, tote) were added so clothing,
  eyewear, bag and furniture experiences can be tested. They are labelled "Sample listing" everywhere and
  can be removed in one click.
- Hard-coded homepage testimonials were replaced by real reviews from the database.

### Privacy (avatar & photos)
- Photo upload and camera use each need an explicit action and a consent checkbox; the camera stream stops
  immediately after capture.
- The photo stays in browser memory, is used only to estimate three colours (skin, hair, top), and is
  discarded as soon as the avatar is created (or when the shopper removes it / leaves the studio).
  No face detection, facial recognition or identity verification is performed.
- Only avatar **settings** are saved, and only with consent: to the account (`customer_avatars` table) and/or
  this device. The server strips any image data it is sent. Shoppers can delete their avatar at any time.
- The old version stored the face photo inside localStorage without consent; that key is now purged.
- Optional external services (photo→3D avatar, photo try-on) receive the photo only after a **separate**
  consent, in memory, and are not called at all unless configured.
- ⚠️ The project's existing login is a demo-level single server-side session (`currentActiveUserId` in
  `server/routes.ts`). Avatar endpoints only ever return the current user's own data, but a production
  deployment needs real per-browser sessions/auth before storing personal data for many customers.

### Performance & accessibility
- Static geometry is merged per material, packaged products are GPU-instanced, and a typical view renders
  ~300 draw calls. Lighting uses a few global lights plus baked light pools/emissive panels instead of
  dozens of point lights.
- Quality presets (High / Balanced / Low); Low caps at ~30 fps and lowers resolution. The store picks a
  preset from the device and steps down automatically if the frame rate drops.
- Progressive build with a progress bar; 3D viewers are created only when opened; demo-zone videos play
  only when the shopper is nearby; rendering pauses while panels are open or the tab is hidden.
- GLB loader supports Draco, Meshopt and KTX2 compressed assets (decoders in `public/decoders`).
- All actions are available as buttons (no keyboard required), visible focus styles, ARIA labels, live
  announcements of nearby products and location, and reduced-motion support.

### Status — what works now vs. what needs services, assets or devices
| Feature | Status |
|---|---|
| Entrance plaza, sliding doors, walk-in, lobby, 12 department rooms, signage, aisle numbers, demo zones, info screens | ✅ Working |
| Third/first-person cameras, camera collision, click/tap-to-move with path-finding, WASD, joystick, pinch | ✅ Working |
| Search → exact department/aisle/bay, Guide me, route arrows, beacon, mini-map, full map, directory, Lobby, Quick shop | ✅ Working |
| Explore Product panel from live DB data (price, discount, stock, colours, sizes, variants, specs, warranty, real reviews) | ✅ Working |
| Add to basket (avatar picks it up, basket fills), variant-aware basket lines, checkout charges real variant price/stock | ✅ Working |
| Watch How It Works: uploaded MP4/WebM with captions & full screen, YouTube/Vimeo embeds, in-store demo screens | ✅ Working (no product has a real video yet — add them in Admin) |
| Customisable avatar (body, skin, hair incl. headscarf, eyes, facial hair, clothing, shoes, glasses, watch, bag) | ✅ Working |
| Photo → colour estimation (on device), guest presets, preview room, consented save/reuse/edit/delete | ✅ Working |
| Natural walk (distance-driven, no foot sliding), idle, turning, stopping, look-at, pick-up, basket carrying | ✅ Working (procedural model — see below) |
| Clothing try-on on the avatar (colour, size selection, front/side/back, compare looks, wear while walking) | ✅ Working |
| Footwear / watch / eyewear / bag on the avatar + 3D product viewer (rotate, zoom, detail labels from specs) | ✅ Working |
| Lip-shade preview on avatar + swatches on the shopper's skin tone | ✅ Working |
| Furniture room preview at true scale (resizable room, drag/rotate, 170 cm person + door for scale) | ✅ Working where dimensions are entered |
| Electronics 3D detail labels from specs; interactive demos for car mount, laptop stand, tyre inflator | ✅ Working |
| Product assistant answering only from the listing, with sources | ✅ Working |
| Admin: departments, entrances, fixture placement, product media/3D/video/variants/try-on, promos, uploads | ✅ Working |
| Furniture AR in your room (WebXR on Android, Quick Look on iOS) | ⚠️ Implemented, shown only when the device reports support; **not yet tested on physical phones** |
| Photorealistic 3D avatar from a photo | 🔌 Needs an external photo-to-avatar service (`AVATAR_PROVIDER_URL/KEY`); the GLB avatar path is implemented and tested with a rigged sample model |
| Try clothing on the shopper's own photo (AI image) | 🔌 Needs a virtual try-on service (`TRYON_PROVIDER_URL/KEY`); UI and consent flow are in place |
| AI-written assistant answers | 🔌 Needs `GEMINI_API_KEY`; without it, the grounded rule-based assistant is used |
| Camera AR for watches (wrist), shoes (feet), make-up (face) | ❌ Not implemented — needs hand/foot/face tracking models; the UI says so |
| Size or fit prediction | ❌ Intentionally not offered — no validated sizing data |
| Real product 3D models and demonstration videos | 📦 Assets needed — upload GLBs/videos per product in Admin; until then products use labelled illustrative models and show photos/specs instead of video |

The built-in avatar is a high-quality procedural human with realistic proportions, not a photographic
likeness; the UI says so. For photoreal avatars, connect a provider that returns a rigged GLB with
`idle`/`walk` clips (Mixamo-style naming).
