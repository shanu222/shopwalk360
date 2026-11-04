/**
 * ShopWalk 360 — Store experience v2 (server side)
 *
 * - Schema migration for department rooms, fixtures, promo screens, product media/3D/try-on fields
 * - Customer avatar storage (configuration only — never the original photograph)
 * - Media uploads (MP4/WebM video, images, GLB models, WebVTT captions)
 * - Optional external integrations (photo→avatar, photo garment try-on, AI product assistant).
 *   Each one is inert until its environment variables are configured; nothing is faked.
 */
import express, { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from './db.js';
import { openR2Object, r2Enabled, putToR2 } from './production.js';
import { faststart, needsFaststart } from './faststart.js';

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));

const LAYOUT_VERSION = '2';

// ---------------------------------------------------------------------------
// MIGRATION
// ---------------------------------------------------------------------------
function addColumn(table: string, col: string, typeDef: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
}

function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM website_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO website_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// Department positions (must match src/components/store3d/layout/storeLayout.ts SLOTS)
const SLOT_CODES = new Set(['WIN1', 'WIN2', 'D1', 'R0', 'F1', 'F2', 'F3', 'F4', 'L1', 'L2', 'L3', 'R1', 'R2', 'R3']);
const LEGACY_SLOT_CODES: Record<string, string> = { BW1: 'L3', BW2: 'R0', BW3: 'R3' };
function slotCode(raw: unknown): string | null {
  const c = String(raw || '').toUpperCase();
  const code = LEGACY_SLOT_CODES[c] || c;
  return SLOT_CODES.has(code) ? code : null;
}

/**
 * The back wall of every department is now the promo screen, so nothing may stand in front of it.
 * Shelving that was on the back wall moves to the side-wall bays beside it (BW1 → L3, BW3 → R3)
 * or by the entrance (BW2 → R0). Runs on every start, does nothing once there is nothing to move.
 */
function moveBackWallFixtures() {
  const rows = db.prepare("SELECT id, department_id, slot_code, shelf_code, aisle_label FROM store_shelves WHERE slot_code IN ('BW1', 'BW2', 'BW3')").all() as any[];
  if (!rows.length) return;
  const taken = db.prepare('SELECT id FROM store_shelves WHERE department_id = ? AND slot_code = ?');
  const upd = db.prepare('UPDATE store_shelves SET slot_code = ?, shelf_code = ?, aisle_label = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const r of rows) {
      const fallback = ['L3', 'R3', 'R0', 'L2', 'R2', 'L1', 'R1'];
      const target = [LEGACY_SLOT_CODES[r.slot_code], ...fallback].find((c) => !taken.get(r.department_id, c));
      if (!target) continue; // every wall bay is used: leave it for the admin to place
      const swap = (t: string | null) => (t ? t.split(r.slot_code).join(target) : t);
      upd.run(target, swap(r.shelf_code), swap(r.aisle_label), r.id);
    }
  });
  tx();
  console.log(`Moved ${rows.length} back-wall display(s) clear of the department promo screens.`);
}

export function migrateStoreExperienceV2() {
  // Products: media, 3D, dimensions, try-on and grounded content fields
  addColumn('products', 'dimensions_json', 'TEXT'); // {"w":cm,"h":cm,"d":cm}
  addColumn('products', 'model_3d_url', 'TEXT');
  addColumn('products', 'model_preset', 'TEXT');
  addColumn('products', 'demo_video_type', 'TEXT'); // file | youtube | vimeo
  addColumn('products', 'demo_video_poster', 'TEXT');
  addColumn('products', 'demo_video_captions', 'TEXT');
  addColumn('products', 'demo_video_title', 'TEXT');
  addColumn('products', 'features', 'TEXT'); // newline separated
  addColumn('products', 'in_the_box', 'TEXT');
  addColumn('products', 'usage_instructions', 'TEXT');
  addColumn('products', 'care_instructions', 'TEXT');
  addColumn('products', 'ingredients', 'TEXT');
  addColumn('products', 'wearable_slot', 'TEXT'); // top | bottom | shoes | watch | glasses | bag
  addColumn('products', 'color_hex_map', 'TEXT'); // {"Navy":"#1f2a44"}
  addColumn('products', 'is_sample', 'INTEGER DEFAULT 0');
  addColumn('products', 'model_scale', 'REAL DEFAULT 1'); // multiplier on the fitted size
  addColumn('products', 'model_rotation_deg', 'REAL DEFAULT 0'); // turn on the display

  // Departments become real rooms in the galleria
  addColumn('store_departments', 'slot_index', 'INTEGER');
  addColumn('store_departments', 'interior_style', 'TEXT');
  addColumn('store_departments', 'lighting', 'TEXT');
  addColumn('store_departments', 'info_text', 'TEXT');
  addColumn('store_departments', 'info_video_url', 'TEXT');
  addColumn('store_departments', 'entrance_style', 'TEXT');
  addColumn('store_departments', 'is_active', 'INTEGER DEFAULT 1');

  // Fixtures
  addColumn('store_shelves', 'slot_code', 'TEXT');
  addColumn('store_shelves', 'shelf_level', 'INTEGER DEFAULT 2');
  addColumn('store_shelves', 'facing_count', 'INTEGER DEFAULT 4');
  addColumn('store_shelves', 'zone', 'TEXT DEFAULT \'display\'');

  db.exec(`
    CREATE TABLE IF NOT EXISTS store_led_screens (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      video_url TEXT,
      accent_color TEXT DEFAULT '#c8a96a'
    );

    CREATE TABLE IF NOT EXISTS store_promo_screens (
      id TEXT PRIMARY KEY,
      location TEXT NOT NULL DEFAULT 'lobby',
      title TEXT NOT NULL,
      subtitle TEXT,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      accent_color TEXT DEFAULT '#c8a96a',
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS customer_avatars (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config_json TEXT NOT NULL,
      consent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_music (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  addColumn('store_promo_screens', 'video_url', 'TEXT');
  const seedLed = db.prepare('INSERT OR IGNORE INTO store_led_screens (id, title, body, accent_color) VALUES (?, ?, ?, ?)');
  [
    ['avatar', 'Avatar Studio', 'Create your virtual self\nStep inside — your shopping journey begins here'],
    ['welcome', 'ShopWalk 360', 'Welcome\nExplore · Experience · Discover'],
    ['directory', 'Departments', ''],
    ['map', 'Store Map', 'Open the interactive map\nSearch any product and we will guide you'],
    ['checkout', 'Checkout', 'Pay at the counter\nCash on delivery · Bank transfer · Card'],
    ['baskets', 'Baskets', 'Pick up a basket\nYour basket fills as you shop'],
  ].forEach((row) => seedLed.run(...row, '#c8a96a'));

  moveBackWallFixtures();

  if (getSetting('store3d_layout_version') === LAYOUT_VERSION) return;
  console.log('Migrating ShopWalk 360 store layout to v2 (department rooms + fixtures)...');

  const tx = db.transaction(() => {
    // 1. Remove unrelated stock-footage clips that were seeded as "demonstration videos".
    //    They did not show the products, so presenting them as product demos would be misleading.
    db.prepare("UPDATE products SET demo_video_url = NULL WHERE demo_video_url LIKE '%mixkit.co%'").run();
    db.prepare("UPDATE store_shelves SET demo_video_url = NULL WHERE demo_video_url LIKE '%mixkit.co%'").run();

    // 2. Correct try-on types so try-on is only offered where it makes sense
    const productMeta: Record<string, { tryon: string; preset: string; slot?: string | null; hex?: Record<string, string> }> = {
      prod_1: { tryon: 'electronics', preset: 'charger', hex: { 'Matte Black': '#1d1f22', 'Arctic White': '#eef0f2', 'Titanium Gray': '#7d8288' } },
      prod_2: { tryon: 'none', preset: 'kettle', hex: { 'Matte Black & Walnut': '#1c1c1c', 'Brushed Stainless': '#b9bcbf', 'Pearl White': '#f1efe9' } },
      prod_3: { tryon: 'none', preset: 'wallet', hex: { 'Vintage Saddle Tan': '#a8683a', 'Deep Charcoal': '#34363a', 'Cognac Brown': '#7a3f1e' } },
      prod_4: { tryon: 'electronics', preset: 'tire_inflator', hex: { 'Obsidian Black': '#1b1c1f', 'Metallic Silver': '#a9adb2' } },
      prod_5: { tryon: 'none', preset: 'diffuser', hex: { 'Dark Walnut': '#4a2f22', 'Japanese Zen Oak': '#b98d5f', 'Minimalist White': '#f2f0eb' } },
      prod_6: { tryon: 'electronics', preset: 'laptop_stand', hex: { 'Space Gray': '#5b5e63', 'Silver Aluminum': '#c3c6ca', 'Rose Gold': '#c99b86' } },
      prod_7: { tryon: 'none', preset: 'packing_cubes', hex: { 'Midnight Slate': '#2f3640', 'Forest Olive': '#4d5a3a', 'Navy Blue': '#1f2d4d' } },
      prod_8: { tryon: 'electronics', preset: 'car_mount', hex: { 'Matte Black': '#1d1f22', 'Space Gray': '#5b5e63' } },
      prod_shoes_1: { tryon: 'footwear', preset: 'shoe', slot: 'shoes', hex: { 'Triple Black': '#18191b', 'Chalk White / Gum': '#ecebe6', 'Carbon Slate': '#4a4f56' } },
      prod_watch_1: {
        tryon: 'watch', preset: 'watch', slot: 'watch',
        hex: { 'Silver Case / Black Leather': '#c9ccd0', 'Obsidian Black / Milanese Mesh': '#232427', 'Rose Gold / Navy': '#c99b86' },
      },
      prod_beauty_1: { tryon: 'beauty', preset: 'lip_tint', hex: { 'Ruby Velvet': '#8e1b2b', 'Nude Rose': '#b9706c', 'Plum Ember': '#5c2240', 'Peach Glaze': '#d9805f' } },
      prod_fitness_1: { tryon: 'none', preset: 'grip_trainer', hex: { 'Stealth Matte Black': '#1c1d1f', 'Gunmetal Silver': '#7b7f85' } },
    };
    const updMeta = db.prepare('UPDATE products SET tryon_type = ?, model_preset = ?, wearable_slot = ?, color_hex_map = ? WHERE id = ?');
    Object.entries(productMeta).forEach(([id, m]) => updMeta.run(m.tryon, m.preset, m.slot ?? null, m.hex ? JSON.stringify(m.hex) : null, id));

    // Dimensions that are stated in the product's own specification are copied into the structured field.
    db.prepare(`UPDATE products SET dimensions_json = ? WHERE id = 'prod_3' AND dimensions_json IS NULL`).run(JSON.stringify({ w: 10.5, h: 8.2, d: 1.1 }));

    // 3. Clearly-labelled SAMPLE listings so clothing / accessory / furniture experiences can be tested.
    //    They are flagged is_sample = 1, shown with a "Sample listing" badge, and removable in one click from Admin.
    const insertSample = db.prepare(`
      INSERT OR IGNORE INTO products (id, slug, name, sku, category_id, description, short_description, specifications,
        cost_price, regular_price, discount_price, stock_quantity, is_featured, is_published, brand,
        tryon_type, color_options, size_options, model_preset, wearable_slot, color_hex_map, dimensions_json, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, 0, 1, 'Sample Catalogue', ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const sampleNote = 'This is a SAMPLE listing created to demonstrate the ShopWalk 360 experience. Replace it with a real product or delete it from Admin → 3D Store → Product Experience.';
    const samples = [
      ['prod_sample_shirt', 'sample-oxford-shirt', 'Oxford Button-Down Shirt (Sample Listing)', 'SMP-AP-SHIRT', 'cat_lifestyle', 'fashion', 'White, Sky Blue, Navy', 'S, M, L, XL', 'shirt', 'top', { White: '#f4f4f1', 'Sky Blue': '#9cc3e6', Navy: '#1f2a44' }, null, 1400, 3200, null, 15],
      ['prod_sample_chinos', 'sample-slim-chinos', 'Slim Chino Trousers (Sample Listing)', 'SMP-AP-CHINO', 'cat_lifestyle', 'fashion', 'Khaki, Navy, Charcoal', '30, 32, 34, 36', 'trousers', 'bottom', { Khaki: '#b9a27a', Navy: '#1f2a44', Charcoal: '#3a3d42' }, null, 1500, 3600, null, 15],
      ['prod_sample_armchair', 'sample-lounge-armchair', 'Lounge Armchair (Sample Listing)', 'SMP-HM-CHAIR', 'cat_home', 'furniture', 'Oat Linen, Forest Green, Charcoal', null, 'armchair', null, { 'Oat Linen': '#d8cbb3', 'Forest Green': '#3f5a45', Charcoal: '#3a3c40' }, { w: 78, h: 82, d: 80 }, 18000, 34900, null, 4],
      ['prod_sample_sidetable', 'sample-oak-side-table', 'Round Oak Side Table (Sample Listing)', 'SMP-HM-TABLE', 'cat_home', 'furniture', 'Natural Oak, Walnut Stain', null, 'side_table', null, { 'Natural Oak': '#c49a6c', 'Walnut Stain': '#5a3a26' }, { w: 50, h: 55, d: 50 }, 5200, 11500, null, 6],
      ['prod_sample_sunglasses', 'sample-acetate-sunglasses', 'Classic Acetate Sunglasses (Sample Listing)', 'SMP-AC-SUNG', 'cat_watches', 'watch', 'Black, Tortoise', null, 'sunglasses', 'glasses', { Black: '#151515', Tortoise: '#6b3d1f' }, null, 900, 2400, null, 20],
      ['prod_sample_tote', 'sample-canvas-tote', 'Canvas Tote Bag (Sample Listing)', 'SMP-AC-TOTE', 'cat_lifestyle', 'fashion', 'Natural, Black', null, 'tote_bag', 'bag', { Natural: '#e6dcc6', Black: '#1b1b1b' }, null, 700, 1900, null, 25],
    ] as const;
    samples.forEach((s) => {
      insertSample.run(s[0], s[1], s[2], s[3], s[4], sampleNote, 'Sample listing for testing the virtual try-on and room preview.',
        s[12], s[13], s[14], s[15], s[5], s[6], s[7], s[8], s[9], JSON.stringify(s[10]), s[11] ? JSON.stringify(s[11]) : null);
    });

    // 4. Departments → 12 rooms. Odd department numbers on the west (left) side, even on the east (right) side.
    const deptPlan: [string, string, string, number, number, string, string, string, string][] = [
      // id, name, category, aisle, slot, colour, style, lighting, description
      ['dept_elec', 'Electronics & Gadgets', 'cat_electronics', 1, 0, '#3b82f6', 'tech', 'cool', 'Chargers, cables, smart gadgets and mobile accessories'],
      ['dept_home', 'Home & Living', 'cat_home', 2, 6, '#c2410c', 'warm_wood', 'warm', 'Furniture, décor and home comfort'],
      ['dept_kitchen', 'Kitchen & Dining', 'cat_kitchen', 3, 1, '#4d7c0f', 'kitchen', 'neutral', 'Coffee equipment and kitchen tools'],
      ['dept_fashion', 'Fashion & Clothing', 'cat_lifestyle', 4, 7, '#9f1239', 'boutique', 'warm', 'Clothing, leather goods and the virtual fitting area'],
      ['dept_shoes', 'Shoes & Footwear', 'cat_shoes', 5, 2, '#b45309', 'concrete', 'neutral', 'Running, everyday and formal footwear'],
      ['dept_watches', 'Watches & Accessories', 'cat_watches', 6, 8, '#1e3a8a', 'luxury', 'warm', 'Watches, eyewear and accessories'],
      ['dept_beauty', 'Beauty & Personal Care', 'cat_beauty', 7, 3, '#be185d', 'spa', 'warm', 'Cosmetics, skincare and personal care'],
      ['dept_fitness', 'Fitness & Sports', 'cat_fitness', 8, 9, '#ca8a04', 'gym', 'cool', 'Training equipment and sports gear'],
      ['dept_car', 'Car Accessories', 'cat_car', 9, 4, '#b91c1c', 'garage', 'cool', 'Inflators, mounts and in-car accessories'],
      ['dept_travel', 'Travel & Luggage', 'cat_travel', 10, 10, '#0f766e', 'travel', 'neutral', 'Luggage, organisers and travel essentials'],
      ['dept_office', 'Office & Study', 'cat_office', 11, 5, '#4338ca', 'study', 'neutral', 'Ergonomic workspace and study accessories'],
      ['dept_lifestyle', 'Gifts & Lifestyle', 'cat_lifestyle', 12, 11, '#a21caf', 'gallery', 'warm', 'Gift ideas and lifestyle pieces'],
    ];
    const upsertDept = db.prepare(`
      INSERT INTO store_departments (id, category_id, name, sign_label, aisle_number, pos_x, pos_z, theme_color, description, slot_index, interior_style, lighting, is_active, entrance_style)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 1, 'glass')
      ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, sign_label = excluded.sign_label,
        aisle_number = excluded.aisle_number, theme_color = excluded.theme_color, description = excluded.description,
        slot_index = excluded.slot_index, interior_style = excluded.interior_style, lighting = excluded.lighting, is_active = 1,
        entrance_style = excluded.entrance_style
    `);
    deptPlan.forEach((d) => upsertDept.run(d[0], d[2], d[1], d[1], d[3], d[5], d[8], d[4], d[6], d[7]));

    // 5. Fixtures (re-seeded on the new slot grid). Positions are derived from department + slot on the client.
    db.prepare('DELETE FROM store_shelves').run();
    const insertFixture = db.prepare(`
      INSERT INTO store_shelves (id, department_id, shelf_code, aisle_label, pos_x, pos_y, pos_z, rotation_y, shelf_type, product_id,
        featured_label, slot_code, shelf_level, facing_count, zone)
      VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)
    `);
    type F = [string, string, string | null, string | null, number?, string?];
    // [slot, fixture type, product, badge, zone?]
    const fixtures: Record<string, F[]> = {
      dept_elec: [
        ['WIN1', 'island_display', 'prod_1', 'NEW IN'], ['WIN2', 'island_display', 'prod_8', null],
        ['F1', 'gondola', 'prod_1', null], ['F2', 'gondola', 'prod_8', null], ['F3', 'gondola', 'prod_6', null],
        ['L1', 'wall_mount', 'prod_1', null], ['R1', 'wall_mount', 'prod_8', null],
        ['D1', 'demo_table', 'prod_1', 'TRY IT', 2, 'demo'],
      ],
      dept_home: [
        ['WIN1', 'room_set', 'prod_sample_armchair', null], ['WIN2', 'island_display', 'prod_5', null],
        ['F1', 'room_set', 'prod_sample_armchair', null], ['F2', 'room_set', 'prod_sample_sidetable', null],
        ['L1', 'wall_mount', 'prod_5', null], ['R0', 'wall_mount', 'prod_5', null],
        ['D1', 'room_set', 'prod_sample_sidetable', 'ROOM PREVIEW', 2, 'demo'],
      ],
      dept_kitchen: [
        ['WIN1', 'island_display', 'prod_2', null], ['F1', 'gondola', 'prod_2', null], ['L1', 'wall_mount', 'prod_2', null],
        ['D1', 'demo_kitchen', 'prod_2', 'LIVE DEMO', 2, 'demo'],
      ],
      dept_fashion: [
        ['WIN1', 'mannequin', 'prod_sample_shirt', 'NEW SEASON'], ['WIN2', 'mannequin', 'prod_sample_chinos', null],
        ['F1', 'clothing_rack', 'prod_sample_shirt', null], ['F2', 'clothing_rack', 'prod_sample_chinos', null],
        ['F3', 'glass_cabinet', 'prod_3', null], ['F4', 'island_display', 'prod_sample_tote', null],
        ['L1', 'wall_mount', 'prod_sample_shirt', null], ['R1', 'wall_mount', 'prod_sample_chinos', null],
        ['D1', 'fitting_station', 'prod_sample_shirt', 'VIRTUAL FITTING', 2, 'demo'],
      ],
      dept_shoes: [
        ['WIN1', 'island_display', 'prod_shoes_1', null], ['L3', 'shoe_wall', 'prod_shoes_1', null], ['R3', 'shoe_wall', 'prod_shoes_1', null],
        ['F1', 'island_display', 'prod_shoes_1', null], ['D1', 'demo_table', 'prod_shoes_1', '360° VIEW', 2, 'demo'],
      ],
      dept_watches: [
        ['WIN1', 'glass_cabinet', 'prod_watch_1', null], ['WIN2', 'glass_cabinet', 'prod_sample_sunglasses', null],
        ['F1', 'glass_cabinet', 'prod_watch_1', null], ['F2', 'glass_cabinet', 'prod_sample_sunglasses', null],
        ['R0', 'wall_mount', 'prod_sample_sunglasses', null],
        ['D1', 'fitting_station', 'prod_watch_1', 'TRY ON', 2, 'demo'],
      ],
      dept_beauty: [
        ['WIN1', 'island_display', 'prod_beauty_1', null], ['F1', 'vanity', 'prod_beauty_1', null], ['L1', 'wall_mount', 'prod_beauty_1', null],
        ['D1', 'fitting_station', 'prod_beauty_1', 'SHADE STUDIO', 2, 'demo'],
      ],
      dept_fitness: [
        ['WIN1', 'island_display', 'prod_fitness_1', null], ['F1', 'gondola', 'prod_fitness_1', null], ['R1', 'wall_mount', 'prod_fitness_1', null],
        ['D1', 'demo_table', 'prod_fitness_1', 'DEMO ZONE', 2, 'demo'],
      ],
      dept_car: [
        ['WIN1', 'island_display', 'prod_4', null], ['F1', 'gondola', 'prod_4', null], ['F2', 'gondola', 'prod_8', null],
        ['D1', 'demo_table', 'prod_4', 'LIVE DEMO', 2, 'demo'],
      ],
      dept_travel: [
        ['WIN1', 'island_display', 'prod_7', null], ['F1', 'gondola', 'prod_7', null], ['R0', 'wall_mount', 'prod_7', null],
      ],
      dept_office: [
        ['WIN1', 'island_display', 'prod_6', null], ['F1', 'gondola', 'prod_6', null],
        ['D1', 'demo_table', 'prod_6', 'DESK DEMO', 2, 'demo'],
      ],
      dept_lifestyle: [
        ['WIN1', 'island_display', 'prod_sample_tote', null], ['WIN2', 'island_display', 'prod_3', 'GIFT IDEA'],
        ['F1', 'glass_cabinet', 'prod_3', null], ['F2', 'island_display', 'prod_5', null], ['R0', 'wall_mount', 'prod_sample_tote', null],
      ],
    };
    const deptNumber: Record<string, number> = Object.fromEntries(deptPlan.map((d) => [d[0], d[3]]));
    Object.entries(fixtures).forEach(([deptId, list]) => {
      list.forEach((f, i) => {
        const n = String(deptNumber[deptId]).padStart(2, '0');
        insertFixture.run(
          `fx_${deptId.replace('dept_', '')}_${f[0].toLowerCase()}`, deptId, `D${n}-${f[0]}`, `Aisle ${n} · Bay ${f[0]}`,
          f[1], f[2], f[3], f[0], f[4] ?? 2, 4, f[5] ?? "display",
        );
        void i;
      });
    });

    // 6. Lobby promotional screens (linked to live products, not hard-coded copy)
    db.prepare('DELETE FROM store_promo_screens').run();
    const insPromo = db.prepare('INSERT INTO store_promo_screens (id, location, title, subtitle, product_id, accent_color, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insPromo.run('promo_1', 'lobby', 'Now in Electronics', 'Visit Dept 01 on your left', 'prod_1', '#3b82f6', 1);
    insPromo.run('promo_2', 'lobby', 'Watches & Accessories', 'Try a watch on your avatar · Dept 06', 'prod_watch_1', '#c8a96a', 2);
    insPromo.run('promo_3', 'lobby', 'Virtual Fitting Area', 'Fashion & Clothing · Dept 04', 'prod_sample_shirt', '#9f1239', 3);

    setSetting('store3d_layout_version', LAYOUT_VERSION);
  });
  tx();
  console.log('ShopWalk 360 v2 migration complete.');
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
let getCurrentUserId: () => string = () => '';
export function bindSession(fn: () => string) {
  getCurrentUserId = fn;
}

function currentUser(): { id: string; role: string } | null {
  const id = getCurrentUserId();
  if (!id) return null;
  return (db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as { id: string; role: string }) || null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = currentUser();
  if (!u || (u.role !== 'admin' && u.role !== 'manager')) {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  }
  next();
}

const safeJson = (s: unknown) => {
  if (typeof s !== 'string' || !s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------
export const store3dRouter = Router();

// Full layout for the 3D experience (departments, fixtures with live product data, promo screens)
store3dRouter.get('/store3d/v2/layout', (_req, res) => {
  try {
    const departments = db.prepare(`
      SELECT d.*, c.slug AS category_slug, c.name AS category_name,
        (SELECT COUNT(*) FROM store_shelves s WHERE s.department_id = d.id) AS shelf_count
      FROM store_departments d LEFT JOIN categories c ON c.id = d.category_id
      WHERE COALESCE(d.is_active, 1) = 1
      ORDER BY d.aisle_number ASC
    `).all();

    const shelves = db.prepare(`
      SELECT s.*, p.name AS product_name, p.slug AS product_slug, p.sku AS product_sku, p.regular_price, p.discount_price,
        p.cost_price, p.stock_quantity, p.brand AS product_brand, p.short_description, p.tryon_type AS product_tryon_type,
        p.model_preset, p.model_3d_url, p.model_scale, p.model_rotation_deg, p.wearable_slot, p.color_options AS product_color_options, p.color_hex_map,
        p.dimensions_json, p.demo_video_url AS product_video_url, p.demo_video_type AS product_video_type,
        p.demo_video_poster AS product_video_poster, p.is_sample,
        (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS primary_image,
        (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id) AS average_rating,
        (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) AS review_count,
        d.name AS department_name, d.sign_label AS department_sign, d.theme_color, d.aisle_number AS department_number
      FROM store_shelves s
      LEFT JOIN products p ON p.id = s.product_id AND p.is_published = 1
      LEFT JOIN store_departments d ON d.id = s.department_id
      ORDER BY s.shelf_code ASC
    `).all();

    const promos = db.prepare(`
      SELECT ps.*, p.name AS product_name, p.slug AS product_slug, p.regular_price, p.discount_price,
        (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS primary_image
      FROM store_promo_screens ps LEFT JOIN products p ON p.id = ps.product_id
      WHERE ps.is_active = 1 ORDER BY ps.display_order ASC
    `).all();

    const leds = db.prepare('SELECT * FROM store_led_screens').all();
    const storeName = 'ShopWalk 360';
    res.json({ storeName, departments, shelves, promos, leds, layoutVersion: Number(LAYOUT_VERSION) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recent real reviews for the storefront (nothing hard-coded)
store3dRouter.get('/reviews/featured', (_req, res) => {
  const reviews = db.prepare(`
    SELECT r.id, r.product_id, r.reviewer_name, r.rating, r.title, r.comment, r.is_verified_purchase, r.created_at, p.name AS product_name
    FROM reviews r JOIN products p ON p.id = r.product_id
    WHERE r.rating >= 4 ORDER BY r.created_at DESC LIMIT 3
  `).all();
  res.json({ reviews });
});

// Integration status (lets the UI show what is connected, without exposing secrets)
store3dRouter.get('/experience/integrations', (_req, res) => {
  res.json({
    avatarGeneration: !!(process.env.AVATAR_PROVIDER_URL && process.env.AVATAR_PROVIDER_KEY),
    garmentTryOn: !!(process.env.TRYON_PROVIDER_URL && process.env.TRYON_PROVIDER_KEY),
    aiAssistant: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
  });
});

// ---------------- Avatar (configuration only; access restricted to the signed-in owner) ----------------
const MAX_AVATAR_BYTES = 8 * 1024;

function sanitiseAvatarConfig(cfg: any) {
  if (!cfg || typeof cfg !== 'object') return null;
  const copy = { ...cfg };
  // Never persist photographs or image data, whatever the client sends.
  delete copy.customPhotoUrl;
  delete copy.photo;
  delete copy.photoDataUrl;
  const json = JSON.stringify(copy);
  if (json.length > MAX_AVATAR_BYTES || /data:image\//i.test(json)) return null;
  return json;
}

store3dRouter.get('/avatar', (_req, res) => {
  const u = currentUser();
  if (!u) return res.json({ signedIn: false, avatar: null });
  const row = db.prepare('SELECT config_json, consent_at, updated_at FROM customer_avatars WHERE user_id = ?').get(u.id) as any;
  res.json({ signedIn: true, avatar: row ? { config: safeJson(row.config_json), consentAt: row.consent_at, updatedAt: row.updated_at } : null });
});

store3dRouter.put('/avatar', (req, res) => {
  const u = currentUser();
  if (!u) return res.status(401).json({ error: 'Sign in to save your avatar to your account.' });
  if (req.body?.consent !== true) return res.status(400).json({ error: 'Explicit consent is required to save your avatar.' });
  const json = sanitiseAvatarConfig(req.body?.config);
  if (!json) return res.status(400).json({ error: 'Invalid avatar configuration.' });
  db.prepare(`
    INSERT INTO customer_avatars (user_id, config_json, consent_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, consent_at = excluded.consent_at, updated_at = datetime('now')
  `).run(u.id, json);
  res.json({ success: true });
});

store3dRouter.delete('/avatar', (_req, res) => {
  const u = currentUser();
  if (!u) return res.json({ success: true });
  db.prepare('DELETE FROM customer_avatars WHERE user_id = ?').run(u.id);
  res.json({ success: true });
});

/**
 * Photo → 3D avatar generation through an external provider.
 * The photo is forwarded in memory and never written to disk or the database.
 * Expected provider contract (adapt in one place if your vendor differs):
 *   POST {AVATAR_PROVIDER_URL}  Authorization: Bearer {AVATAR_PROVIDER_KEY}
 *   body: { image: "<base64 jpeg>", consent: true, purpose: "avatar" }
 *   200:  { glbUrl: "https://.../avatar.glb", appearance?: { skinTone, hairColor, hairStyle } }
 */
store3dRouter.post('/avatar/generate', express.json({ limit: '6mb' }), async (req, res) => {
  const url = process.env.AVATAR_PROVIDER_URL;
  const key = process.env.AVATAR_PROVIDER_KEY;
  if (!url || !key) return res.status(501).json({ configured: false, error: 'No photo-to-avatar service is configured.' });
  if (req.body?.consent !== true || typeof req.body?.image !== 'string') return res.status(400).json({ error: 'Consent and image are required.' });
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ image: req.body.image, consent: true, purpose: 'avatar' }),
    });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok || typeof data.glbUrl !== 'string') return res.status(502).json({ error: 'Avatar service did not return a model.' });
    res.json({ glbUrl: data.glbUrl, appearance: data.appearance || null });
  } catch {
    res.status(502).json({ error: 'Avatar service unreachable.' });
  }
});

/**
 * Photo garment try-on (AI image generation) through an external provider.
 *   POST {TRYON_PROVIDER_URL}  Authorization: Bearer {TRYON_PROVIDER_KEY}
 *   body: { person_image: base64, garment_image_url, garment_name, colour }
 *   200:  { image: "<base64 png or https url>" }
 */
store3dRouter.post('/tryon/garment', express.json({ limit: '6mb' }), async (req, res) => {
  const url = process.env.TRYON_PROVIDER_URL;
  const key = process.env.TRYON_PROVIDER_KEY;
  if (!url || !key) return res.status(501).json({ configured: false, error: 'No photo try-on service is configured.' });
  const { image, productId, colour, consent } = req.body || {};
  if (consent !== true || typeof image !== 'string' || !productId) return res.status(400).json({ error: 'Consent, photo and product are required.' });
  const prod = db.prepare(`SELECT name, (SELECT image_url FROM product_images WHERE product_id = products.id AND is_primary = 1 LIMIT 1) AS img FROM products WHERE id = ?`).get(productId) as any;
  if (!prod) return res.status(404).json({ error: 'Product not found' });
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ person_image: image, garment_image_url: prod.img, garment_name: prod.name, colour }),
    });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok || typeof data.image !== 'string') return res.status(502).json({ error: 'Try-on service did not return an image.' });
    res.json({ image: data.image });
  } catch {
    res.status(502).json({ error: 'Try-on service unreachable.' });
  }
});

// ---------------- Grounded product assistant (optional AI) ----------------
function productFacts(productId: string) {
  const p = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?').get(productId, productId) as any;
  if (!p) return null;
  const specs = safeJson(p.specifications) || {};
  const dims = safeJson(p.dimensions_json);
  return {
    name: p.name, brand: p.brand, description: p.description, short_description: p.short_description, specifications: specs,
    dimensions_cm: dims, weight_kg: p.weight_kg, warranty: p.warranty, features: p.features, in_the_box: p.in_the_box,
    usage_instructions: p.usage_instructions, care_instructions: p.care_instructions, ingredients: p.ingredients,
    colours: p.color_options, sizes: p.size_options, price_pkr: p.discount_price || p.regular_price, in_stock: p.stock_quantity > 0,
  };
}

store3dRouter.post('/assistant/ask', async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return res.status(501).json({ configured: false });
  const { productId, question } = req.body || {};
  if (!productId || typeof question !== 'string' || question.length > 500) return res.status(400).json({ error: 'Invalid question.' });
  const facts = productFacts(productId);
  if (!facts) return res.status(404).json({ error: 'Product not found' });
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const prompt = [
      'You are a retail product information assistant. Answer ONLY using the PRODUCT FACTS below.',
      'If the facts do not contain the answer, reply exactly: "The product listing does not include that information."',
      'Never invent specifications, measurements, compatibility, certifications or claims. Keep answers under 90 words.',
      `PRODUCT FACTS (JSON): ${JSON.stringify(facts)}`,
      `CUSTOMER QUESTION: ${question}`,
    ].join('\n');
    const result = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: prompt });
    res.json({ answer: (result as any).text || 'The product listing does not include that information.', source: 'ai' });
  } catch (e: any) {
    res.status(502).json({ error: 'AI assistant unavailable.' });
  }
});

// ---------------- Admin: departments ----------------
store3dRouter.get('/admin/store3d/departments', requireAdmin, (_req, res) => {
  res.json({ departments: db.prepare('SELECT * FROM store_departments ORDER BY aisle_number').all() });
});

const deptFields = ['name', 'sign_label', 'category_id', 'aisle_number', 'theme_color', 'description', 'slot_index', 'interior_style', 'lighting', 'info_text', 'info_video_url', 'entrance_style', 'is_active'] as const;

store3dRouter.post('/admin/store3d/departments', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Department name is required.' });
  const used = (db.prepare('SELECT slot_index FROM store_departments WHERE slot_index IS NOT NULL').all() as any[]).map((r) => r.slot_index);
  const slot = b.slot_index ?? [...Array(12).keys()].find((i) => !used.includes(i));
  if (slot === undefined) return res.status(400).json({ error: 'All 12 department rooms are in use. Deactivate or delete a department first.' });
  if (used.includes(Number(slot))) return res.status(400).json({ error: 'That room position is already used by another department.' });
  const id = `dept_${Date.now()}`;
  const nextNum = ((db.prepare('SELECT MAX(aisle_number) AS m FROM store_departments').get() as any).m || 0) + 1;
  db.prepare(`INSERT INTO store_departments (id, category_id, name, sign_label, aisle_number, pos_x, pos_z, theme_color, description, slot_index, interior_style, lighting, info_text, entrance_style, is_active)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
    id, b.category_id || null, b.name, b.sign_label || b.name, Number(b.aisle_number || nextNum), b.theme_color || '#64748b', b.description || '',
    Number(slot), b.interior_style || 'gallery', b.lighting || 'neutral', b.info_text || null, b.entrance_style || 'glass',
  );
  res.json({ success: true, id });
});

store3dRouter.put('/admin/store3d/departments/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (b.slot_index !== undefined && b.slot_index !== null) {
    const clash = db.prepare('SELECT id FROM store_departments WHERE slot_index = ? AND id != ?').get(Number(b.slot_index), req.params.id);
    if (clash) return res.status(400).json({ error: 'That room position is already used by another department.' });
  }
  const sets: string[] = [];
  const vals: any[] = [];
  deptFields.forEach((f) => {
    if (b[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(b[f] === '' ? null : b[f]);
    }
  });
  if (!sets.length) return res.json({ success: true });
  db.prepare(`UPDATE store_departments SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json({ success: true });
});

store3dRouter.delete('/admin/store3d/departments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM store_promo_screens WHERE location = ?').run(req.params.id);
  db.prepare('DELETE FROM store_departments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------------- Admin: fixtures (slot-based) ----------------
store3dRouter.put('/admin/store3d/fixtures/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  const allowed = ['department_id', 'shelf_code', 'aisle_label', 'shelf_type', 'product_id', 'featured_label', 'slot_code', 'shelf_level', 'facing_count', 'zone', 'rotation_y'];
  if (b.slot_code !== undefined) {
    const code = slotCode(b.slot_code);
    if (!code) return res.status(400).json({ error: 'That position does not exist in the department.' });
    b.slot_code = code;
    if (!b.department_id) {
      const cur = db.prepare('SELECT department_id FROM store_shelves WHERE id = ?').get(req.params.id) as any;
      b.department_id = cur?.department_id;
    }
  }
  if (b.slot_code && b.department_id) {
    const clash = db.prepare('SELECT id FROM store_shelves WHERE department_id = ? AND slot_code = ? AND id != ?').get(b.department_id, b.slot_code, req.params.id);
    if (clash) return res.status(400).json({ error: 'Another fixture already occupies that position.' });
  }
  const sets: string[] = [];
  const vals: any[] = [];
  allowed.forEach((f) => {
    if (b[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(b[f] === '' ? null : b[f]);
    }
  });
  if (sets.length) db.prepare(`UPDATE store_shelves SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json({ success: true });
});

store3dRouter.post('/admin/store3d/fixtures', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.department_id || !b.slot_code) return res.status(400).json({ error: 'Department and position are required.' });
  b.slot_code = slotCode(b.slot_code);
  if (!b.slot_code) return res.status(400).json({ error: 'That position does not exist in the department.' });
  const clash = db.prepare('SELECT id FROM store_shelves WHERE department_id = ? AND slot_code = ?').get(b.department_id, b.slot_code);
  if (clash) return res.status(400).json({ error: 'Another fixture already occupies that position.' });
  const dept = db.prepare('SELECT aisle_number FROM store_departments WHERE id = ?').get(b.department_id) as any;
  const n = String(dept?.aisle_number ?? 0).padStart(2, '0');
  const id = `fx_${Date.now()}`;
  db.prepare(`INSERT INTO store_shelves (id, department_id, shelf_code, aisle_label, pos_x, pos_y, pos_z, rotation_y, shelf_type, product_id, featured_label, slot_code, shelf_level, facing_count, zone)
    VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, b.department_id, b.shelf_code || `D${n}-${b.slot_code}`, b.aisle_label || `Aisle ${n} · Bay ${b.slot_code}`, b.shelf_type || 'gondola',
    b.product_id || null, b.featured_label || null, b.slot_code, Number(b.shelf_level || 2), Number(b.facing_count || 4), b.zone || 'display',
  );
  res.json({ success: true, id });
});

store3dRouter.delete('/admin/store3d/fixtures/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM store_shelves WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------------- Admin: promo screens ----------------
store3dRouter.get('/admin/store3d/promos', requireAdmin, (_req, res) => {
  res.json({ promos: db.prepare('SELECT * FROM store_promo_screens ORDER BY display_order').all() });
});
// A promo lives in the lobby (freestanding totem) or in a department (its back-wall promo screen).
// Several rows for one department make a playlist, played in display_order.
function promoLocation(raw: unknown): string | null {
  const loc = String(raw || 'lobby');
  if (loc === 'lobby') return loc;
  return db.prepare('SELECT id FROM store_departments WHERE id = ?').get(loc) ? loc : null;
}
store3dRouter.post('/admin/store3d/promos', requireAdmin, (req, res) => {
  const b = req.body || {};
  const location = promoLocation(b.location);
  if (!location) return res.status(400).json({ error: 'That department does not exist.' });
  if (!b.title && !b.video_url) return res.status(400).json({ error: 'Title is required.' });
  if (location !== 'lobby' && !b.video_url) return res.status(400).json({ error: 'Upload a video for the department screen.' });
  const id = `promo_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let order = b.display_order;
  if (order === undefined || order === null || order === '') {
    const row = db.prepare('SELECT COALESCE(MAX(display_order), -1) + 1 AS n FROM store_promo_screens WHERE location = ?').get(location) as { n: number };
    order = row.n;
  }
  db.prepare('INSERT INTO store_promo_screens (id, location, title, subtitle, product_id, accent_color, display_order, is_active, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, location, String(b.title || 'Promotion').slice(0, 80), b.subtitle || null, b.product_id || null, b.accent_color || '#c8a96a', Number(order) || 0, b.is_active === false || b.is_active === 0 ? 0 : 1, b.video_url || null);
  res.json({ success: true, id });
});
store3dRouter.put('/admin/store3d/promos/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  const location = promoLocation(b.location);
  if (!location) return res.status(400).json({ error: 'That department does not exist.' });
  if (!b.title) return res.status(400).json({ error: 'Title is required.' });
  db.prepare('UPDATE store_promo_screens SET location = ?, title = ?, subtitle = ?, product_id = ?, accent_color = ?, display_order = ?, is_active = ?, video_url = ? WHERE id = ?')
    .run(location, String(b.title).slice(0, 80), b.subtitle || null, b.product_id || null, b.accent_color || '#c8a96a', Number(b.display_order || 0), b.is_active === false || b.is_active === 0 ? 0 : 1, b.video_url || null, req.params.id);
  res.json({ success: true });
});
store3dRouter.delete('/admin/store3d/promos/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM store_promo_screens WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

store3dRouter.put('/admin/store3d/leds/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT id FROM store_led_screens WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'That screen does not exist.' });
  if (!b.title || String(b.title).trim().length < 1) return res.status(400).json({ error: 'Title is required.' });
  db.prepare('UPDATE store_led_screens SET title = ?, body = ?, video_url = ?, accent_color = ? WHERE id = ?')
    .run(String(b.title).slice(0, 80), b.body ? String(b.body).slice(0, 400) : null, b.video_url || null, b.accent_color || '#c8a96a', req.params.id);
  res.json({ success: true });
});

// ---------------- Admin: product experience (media, 3D, dims, try-on, content, variants) ----------------
store3dRouter.get('/admin/products/:id/experience', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json({
    product: p,
    images: db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY display_order').all(req.params.id),
    variants: db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(req.params.id),
    fixtures: db.prepare(`SELECT s.*, d.name AS department_name FROM store_shelves s LEFT JOIN store_departments d ON d.id = s.department_id WHERE s.product_id = ?`).all(req.params.id),
  });
});

const experienceFields = [
  'dimensions_json', 'model_3d_url', 'model_scale', 'model_rotation_deg', 'model_preset', 'demo_video_url', 'demo_video_type', 'demo_video_poster', 'demo_video_captions', 'demo_video_title',
  'features', 'in_the_box', 'usage_instructions', 'care_instructions', 'ingredients', 'wearable_slot', 'color_hex_map', 'tryon_type',
  'color_options', 'size_options', 'specifications', 'warranty', 'weight_kg',
] as const;

store3dRouter.put('/admin/products/:id/experience', requireAdmin, (req, res) => {
  const b = req.body || {};
  const tx = db.transaction(() => {
    const sets: string[] = [];
    const vals: any[] = [];
    experienceFields.forEach((f) => {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        let v = b[f];
        if ((f === 'dimensions_json' || f === 'color_hex_map' || f === 'specifications') && v && typeof v === 'object') v = JSON.stringify(v);
        vals.push(v === '' ? null : v);
      }
    });
    if (sets.length) db.prepare(`UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, req.params.id);

    if (Array.isArray(b.images)) {
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(req.params.id);
      const ins = db.prepare('INSERT INTO product_images (id, product_id, image_url, alt_text, display_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)');
      b.images.filter((u: any) => typeof u === 'string' && u.trim()).forEach((u: string, i: number) => ins.run(`img_${req.params.id}_${Date.now()}_${i}`, req.params.id, u.trim(), null, i, i === 0 ? 1 : 0));
    }
    if (Array.isArray(b.variants)) {
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
      const ins = db.prepare('INSERT INTO product_variants (id, product_id, sku, title, color, size, price, cost_price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      b.variants.forEach((v: any, i: number) => {
        if (!v.title || !v.sku) return;
        ins.run(v.id || `var_${req.params.id}_${Date.now()}_${i}`, req.params.id, v.sku, v.title, v.color || null, v.size || null, Number(v.price || 0), Number(v.cost_price || 0), Number(v.stock_quantity || 0));
      });
    }
  });
  try {
    tx();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

store3dRouter.delete('/admin/sample-products', requireAdmin, (_req, res) => {
  const ids = (db.prepare('SELECT id FROM products WHERE is_sample = 1').all() as any[]).map((r) => r.id);
  const ordered = ids.filter((id) => db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id));
  const tx = db.transaction(() => {
    ids.forEach((id) => {
      db.prepare('UPDATE store_shelves SET product_id = NULL WHERE product_id = ?').run(id);
      db.prepare('UPDATE store_promo_screens SET product_id = NULL WHERE product_id = ?').run(id);
      if (ordered.includes(id)) db.prepare('UPDATE products SET is_published = 0 WHERE id = ?').run(id);
      else db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });
  });
  tx();
  res.json({ success: true, removed: ids.length - ordered.length, unpublished: ordered.length });
});

// ---------------- Store music (admin managed, played for shoppers) ----------------
const musicRow = (r: any) => ({ ...r, is_active: !!r.is_active });

store3dRouter.get('/music', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id, title, artist, url FROM store_music WHERE is_active = 1 ORDER BY sort_order, created_at').all();
  res.json({ tracks: rows });
});

store3dRouter.get('/admin/music', requireAdmin, (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM store_music ORDER BY sort_order, created_at').all();
  res.json({ tracks: rows.map(musicRow) });
});

store3dRouter.post('/admin/music', requireAdmin, (req: Request, res: Response) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const artist = String(req.body?.artist || '').trim().slice(0, 120);
  const url = String(req.body?.url || '').trim();
  if (!title) return res.status(400).json({ error: 'Give the track a title.' });
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) return res.status(400).json({ error: 'Upload an audio file first.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM store_music').get() as { m: number };
  const id = `mus_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare('INSERT INTO store_music (id, title, artist, url, sort_order) VALUES (?, ?, ?, ?, ?)').run(id, title, artist, url, max.m + 1);
  res.json({ success: true, track: musicRow(db.prepare('SELECT * FROM store_music WHERE id = ?').get(id)) });
});

store3dRouter.put('/admin/music/:id', requireAdmin, (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM store_music WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Track not found.' });
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) || row.title : row.title;
  const artist = req.body?.artist !== undefined ? String(req.body.artist).trim().slice(0, 120) : row.artist;
  const active = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : row.is_active;
  const order = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : row.sort_order;
  db.prepare('UPDATE store_music SET title = ?, artist = ?, is_active = ?, sort_order = ? WHERE id = ?').run(title, artist, active, order, row.id);
  res.json({ success: true, track: musicRow(db.prepare('SELECT * FROM store_music WHERE id = ?').get(row.id)) });
});

store3dRouter.delete('/admin/music/:id', requireAdmin, (req: Request, res: Response) => {
  db.prepare('DELETE FROM store_music WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Built-in music library (original tracks shipped with the backend), added to the playlist once.
const MUSIC_LIBRARY_DIR = path.join(process.cwd(), 'server', 'music-library');
const LIBRARY_TRACKS = [
  { file: 'golden-hour.mp3', title: 'Golden Hour' },
  { file: 'morning-atrium.mp3', title: 'Morning Atrium' },
  { file: 'gallery-walk.mp3', title: 'Gallery Walk' },
  { file: 'velvet-evening.mp3', title: 'Velvet Evening' },
  { file: 'lantern-light.mp3', title: 'Lantern Light' },
  { file: 'window-shopping.mp3', title: 'Window Shopping' },
  { file: 'cloud-atrium.mp3', title: 'Cloud Atrium' },
  { file: 'afterglow.mp3', title: 'Afterglow' },
  { file: 'silk-breeze.mp3', title: 'Silk Breeze' },
  { file: 'citrus-morning.mp3', title: 'Citrus Morning' },
  { file: 'marble-hall.mp3', title: 'Marble Hall' },
  { file: 'rooftop-garden.mp3', title: 'Rooftop Garden' },
  { file: 'quiet-boutique.mp3', title: 'Quiet Boutique' },
  { file: 'evening-promenade.mp3', title: 'Evening Promenade' },
];

/** Adds library tracks that were never added before (so tracks an admin deleted stay deleted). */
export function seedMusicLibrary() {
  let done: string[] = [];
  const flag = getSetting('music_library_seeded');
  if (flag === '1') done = LIBRARY_TRACKS.slice(0, 4).map((t) => t.file); // first release
  else if (flag) {
    try {
      done = JSON.parse(flag);
    } catch {
      done = [];
    }
  }
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM store_music').get() as { m: number };
  const ins = db.prepare('INSERT OR IGNORE INTO store_music (id, title, artist, url, sort_order) VALUES (?, ?, ?, ?, ?)');
  let order = max.m;
  LIBRARY_TRACKS.forEach((t) => {
    if (done.includes(t.file) || !fs.existsSync(path.join(MUSIC_LIBRARY_DIR, t.file))) return;
    ins.run(`mus_lib_${t.file.replace(/\W+/g, '_')}`, t.title, 'ShopWalk 360 Studio', `${base}/music-library/${t.file}`, ++order);
    done.push(t.file);
  });
  setSetting('music_library_seeded', JSON.stringify(done));
}

export function serveMusicLibrary(app: express.Express) {
  app.use(
    '/music-library',
    express.static(MUSIC_LIBRARY_DIR, {
      fallthrough: false,
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}

// The public R2 address does not send the headers a 3D screen needs, so videos are read through here.
//
// The first 2 MB of each video is kept in memory, so the start of a clip (the part a screen needs
// before it can show its first frame) is answered at once instead of waiting on Cloudflare.
const HEAD_BYTES = 2 * 1024 * 1024;
const HEAD_CACHE_MAX = 96 * 1024 * 1024;
const headCache = new Map<string, { buf: Buffer; total: number; type: string }>();
const headLoading = new Map<string, Promise<{ buf: Buffer; total: number; type: string } | null>>();
let headCacheBytes = 0;

async function readAll(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

function loadHead(key: string) {
  const hit = headCache.get(key);
  if (hit) {
    // most recently used goes to the back of the eviction queue
    headCache.delete(key);
    headCache.set(key, hit);
    return Promise.resolve(hit);
  }
  let p = headLoading.get(key);
  if (!p) {
    p = (async () => {
      const file = await openR2Object(key, `bytes=0-${HEAD_BYTES - 1}`);
      if (!file) return null;
      const buf = await readAll(file.stream);
      const total = Number(String(file.contentRange || '').split('/')[1]) || buf.length;
      const entry = { buf, total, type: file.contentType };
      headCache.set(key, entry);
      headCacheBytes += buf.length;
      for (const [k, v] of headCache) {
        if (headCacheBytes <= HEAD_CACHE_MAX) break;
        headCache.delete(k);
        headCacheBytes -= v.buf.length;
      }
      return entry;
    })().finally(() => headLoading.delete(key));
    headLoading.set(key, p);
  }
  return p;
}

function parseRange(range: string | undefined, total: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Math.min(total, Number(m[2]));
    return [total - n, total - 1];
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? total - 1 : Math.min(total - 1, Number(m[2]));
  return start <= end ? [start, end] : null;
}

store3dRouter.get(/^\/media\/(.+)$/, async (req, res) => {
  const key = decodeURIComponent(String(req.params[0] || ''));
  const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
  const common = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  };
  try {
    // answer requests for the start of a video from memory
    if (key.startsWith('video/') && range && /^bytes=\d+-/.test(range)) {
      const head = await loadHead(key);
      if (head) {
        const r = parseRange(range, head.total);
        if (r && r[0] < head.buf.length) {
          const end = Math.min(r[1], head.buf.length - 1);
          common();
          res.setHeader('Content-Type', head.type);
          res.setHeader('Content-Length', String(end - r[0] + 1));
          res.status(206);
          res.setHeader('Content-Range', `bytes ${r[0]}-${end}/${head.total}`);
          return res.end(head.buf.subarray(r[0], end + 1));
        }
      }
    }
    const file = await openR2Object(key, range);
    if (!file) return res.status(404).end();
    common();
    res.setHeader('Content-Type', file.contentType);
    if (file.contentLength != null) res.setHeader('Content-Length', String(file.contentLength));
    if (file.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', file.contentRange);
    }
    file.stream.on('error', () => res.destroy());
    req.on('close', () => (file.stream as any).destroy?.());
    file.stream.pipe(res);
  } catch (err: any) {
    const code = err?.$metadata?.httpStatusCode;
    if (code === 404 || err?.name === 'NoSuchKey') return res.status(404).end();
    if (code === 416) return res.status(416).end();
    if (!res.headersSent) res.status(502).end();
  }
});

// ---------------- Existing videos: make them start fast ----------------
const VIDEO_COLUMNS: [string, string][] = [
  ['store_promo_screens', 'video_url'],
  ['store_led_screens', 'video_url'],
  ['store_departments', 'info_video_url'],
  ['products', 'demo_video_url'],
  ['store_shelves', 'demo_video_url'],
];

function videoColumns() {
  return VIDEO_COLUMNS.filter(([t, c]) => {
    try {
      return (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === c);
    } catch {
      return false;
    }
  });
}

/**
 * Videos uploaded before this change may have their index at the end, which makes them slow to
 * start. Once, in the background after start-up, each one is checked and, if needed, rewritten as a
 * NEW file (a new name, so no browser can mix old cached pieces with the new file) and every
 * reference to it is updated. Finished files are remembered so they are never checked again.
 */
export async function optimiseStoredVideos() {
  const cols = videoColumns();
  const urls = new Set<string>();
  for (const [t, c] of cols) {
    for (const r of db.prepare(`SELECT DISTINCT ${c} AS u FROM ${t} WHERE ${c} IS NOT NULL AND ${c} != ''`).all() as { u: string }[]) urls.add(r.u);
  }
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  for (const url of urls) {
    if (getSetting(`faststart:${url}`)) continue;
    try {
      let buf: Buffer | null = null;
      let save: ((b: Buffer) => Promise<string>) | null = null;
      const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
      if (!['mp4', 'm4v'].includes(ext)) {
        setSetting(`faststart:${url}`, 'skip');
        continue;
      }
      const r2Key = publicBase && url.startsWith(publicBase + '/') ? url.slice(publicBase.length + 1) : url.match(/^https?:\/\/[^/]+\.r2\.dev\/(video\/[^?#]+)/i)?.[1];
      const diskName = url.match(/\/uploads\/video\/([A-Za-z0-9._-]+)$/)?.[1];
      if (r2Key && r2Enabled()) {
        const head = await openR2Object(r2Key, 'bytes=0-262143');
        if (!head) continue;
        const need = needsFaststart(await readAll(head.stream));
        if (!need) {
          setSetting(`faststart:${url}`, 'ok');
          continue;
        }
        const size = Number(String(head.contentRange || '').split('/')[1]) || 0;
        if (size > 160 * 1024 * 1024) {
          console.warn(`Video ${r2Key} is too large to optimise on this server; re-export it with "fast start" for quicker playback.`);
          setSetting(`faststart:${url}`, 'too-large');
          continue;
        }
        const full = await openR2Object(r2Key);
        if (!full) continue;
        buf = await readAll(full.stream);
        save = (b) => putToR2(`video/${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`, b, ext === 'm4v' ? 'video/mp4' : 'video/mp4');
      } else if (diskName) {
        const file = path.join(UPLOAD_ROOT, 'video', diskName);
        if (!fs.existsSync(file)) continue;
        buf = fs.readFileSync(file);
        save = async (b) => {
          const name = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`;
          fs.writeFileSync(path.join(UPLOAD_ROOT, 'video', name), b);
          return url.replace(/[^/]+$/, name);
        };
      } else {
        setSetting(`faststart:${url}`, 'skip');
        continue;
      }
      const fixed = buf && faststart(buf);
      if (!fixed || !save) {
        setSetting(`faststart:${url}`, 'ok');
        continue;
      }
      const newUrl = await save(fixed);
      const tx = db.transaction(() => {
        for (const [t, c] of cols) db.prepare(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`).run(newUrl, url);
        setSetting(`faststart:${url}`, 'moved');
        setSetting(`faststart:${newUrl}`, 'ok');
      });
      tx();
      console.log(`Optimised a screen video for fast start: ${url} -> ${newUrl}`);
    } catch (err: any) {
      console.warn(`Could not optimise video ${url}:`, err?.message || err);
    }
  }
}

// ---------------- Admin: media uploads ----------------
const UPLOAD_RULES: Record<string, { exts: string[]; max: number; check: (b: Buffer) => boolean }> = {
  video: {
    exts: ['mp4', 'webm', 'm4v'], max: 250 * 1024 * 1024,
    check: (b) => b.slice(4, 8).toString('latin1') === 'ftyp' || b.readUInt32BE(0) === 0x1a45dfa3,
  },
  image: {
    exts: ['jpg', 'jpeg', 'png', 'webp'], max: 10 * 1024 * 1024,
    check: (b) => (b[0] === 0xff && b[1] === 0xd8) || b.slice(1, 4).toString('latin1') === 'PNG' || b.slice(8, 12).toString('latin1') === 'WEBP',
  },
  model: { exts: ['glb'], max: 60 * 1024 * 1024, check: (b) => b.slice(0, 4).toString('latin1') === 'glTF' },
  audio: {
    exts: ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'wav'], max: 40 * 1024 * 1024,
    check: (b) =>
      b.slice(0, 3).toString('latin1') === 'ID3' || // mp3 with tags
      (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || // mp3/aac frame sync
      b.slice(4, 8).toString('latin1') === 'ftyp' || // m4a
      b.slice(0, 4).toString('latin1') === 'OggS' ||
      (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WAVE'),
  },
  captions: { exts: ['vtt'], max: 1024 * 1024, check: (b) => b.slice(0, 6).toString('utf8').replace(/^﻿/, '').startsWith('WEBVTT') },
};

store3dRouter.post(
  '/admin/uploads',
  requireAdmin,
  express.raw({ type: () => true, limit: '260mb' }),
  (req: Request, res: Response) => {
    const kind = String(req.query.kind || '');
    const original = String(req.query.filename || '');
    const rule = UPLOAD_RULES[kind];
    if (!rule) return res.status(400).json({ error: 'Unknown upload type.' });
    const ext = original.split('.').pop()?.toLowerCase() || '';
    if (!rule.exts.includes(ext)) return res.status(400).json({ error: `Allowed file types: ${rule.exts.join(', ')}` });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 12) return res.status(400).json({ error: 'Empty upload.' });
    if (body.length > rule.max) return res.status(413).json({ error: 'File too large.' });
    if (!rule.check(body)) return res.status(400).json({ error: 'File contents do not match the declared type.' });
    if (kind === 'video' && process.env.NODE_ENV === 'production' && !r2Enabled()) {
      return res.status(503).json({ error: 'Cloudflare storage is not configured, so this video was not saved. Add the R2 settings on the server, then upload the video again.' });
    }
    // MP4s are rearranged so their index comes first and they start playing straight away
    let data = body;
    if (kind === 'video' && (ext === 'mp4' || ext === 'm4v')) {
      try {
        data = faststart(body) || body;
      } catch {
        data = body;
      }
    }
    const name = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const types: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', glb: 'model/gltf-binary', vtt: 'text/vtt', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav' };
    if (r2Enabled()) {
      // Cloudflare R2 (persistent, served from your R2 public URL / custom domain)
      putToR2(`${kind}/${name}`, data, types[ext] || 'application/octet-stream')
        .then((url) => {
          if (kind === 'video') setSetting(`faststart:${url}`, 'ok');
          res.json({ success: true, url, bytes: data.length, storage: 'r2' });
        })
        .catch((e) => res.status(502).json({ error: `Cloudflare R2 upload failed: ${e.message}` }));
      return;
    }
    const dir = path.join(UPLOAD_ROOT, kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), data);
    // absolute URL so the separately hosted frontend can load it
    const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
    res.json({ success: true, url: `${base}/uploads/${kind}/${name}`, bytes: body.length, storage: 'disk' });
  },
);

export function serveUploads(app: express.Express) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  app.use(
    '/uploads',
    express.static(UPLOAD_ROOT, {
      fallthrough: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
        if (filePath.endsWith('.vtt')) res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        if (filePath.endsWith('.mp4') || filePath.endsWith('.m4v')) res.setHeader('Content-Type', 'video/mp4');
        if (filePath.endsWith('.webm')) res.setHeader('Content-Type', 'video/webm');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
}
