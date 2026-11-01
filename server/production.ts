/**
 * Production setup: admin account from environment, one-time removal of demo/seed data,
 * store branding, and optional Cloudflare R2 storage for uploaded media.
 */
import { db, hashPassword } from './db.js';
import { GetObjectCommand, S3Client, PutBucketCorsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

function setting(key: string, value: string) {
  db.prepare('INSERT INTO website_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
const getSetting = (k: string) => (db.prepare('SELECT value FROM website_settings WHERE key = ?').get(k) as any)?.value as string | undefined;

/** Create or update the administrator from ADMIN_EMAIL / ADMIN_PASSWORD */
export function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    if (process.env.NODE_ENV === 'production') console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — admin sign-in is disabled until they are.');
    return;
  }
  if (password.length < 10) {
    console.warn('⚠️  ADMIN_PASSWORD must be at least 10 characters — admin not updated.');
    return;
  }
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get() as any;
  if (existing) {
    db.prepare("UPDATE users SET email = ?, password_hash = ?, full_name = COALESCE(NULLIF(?, ''), full_name), updated_at = datetime('now') WHERE id = ?")
      .run(email, hashPassword(password), process.env.ADMIN_NAME || '', existing.id);
  } else {
    db.prepare("INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, 'admin')")
      .run(`u_admin_${Date.now()}`, email, hashPassword(password), process.env.ADMIN_NAME || 'Store Administrator');
  }
  // replace the seeded placeholder identity
  db.prepare("UPDATE users SET full_name = 'Store Administrator', phone = '' WHERE role = 'admin' AND full_name = 'Ahmed Khan (Admin)'").run();
  console.log(`Admin account ready: ${email}`);
}

/** One-time cleanup: remove demo listings, invented reviews/orders/suppliers and placeholder business details */
export function removeDemoData() {
  if (getSetting('demo_cleanup_version') === '1') return;
  const tx = db.transaction(() => {
    const samples = (db.prepare('SELECT id FROM products WHERE is_sample = 1').all() as any[]).map((r) => r.id);
    samples.forEach((id) => {
      db.prepare('DELETE FROM store_shelves WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM store_promo_screens WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM wishlist_items WHERE product_id = ?').run(id);
      if (!db.prepare('SELECT 1 FROM order_items WHERE product_id = ?').get(id)) db.prepare('DELETE FROM products WHERE id = ?').run(id);
      else db.prepare('UPDATE products SET is_published = 0 WHERE id = ?').run(id);
    });
    // seeded (invented) reviews, demo orders, demo expenses, demo coupons, demo customer
    db.prepare("DELETE FROM reviews WHERE id IN ('rev_1','rev_2','rev_3','rev_4')").run();
    db.prepare("DELETE FROM order_items WHERE order_id IN ('ord_1','ord_2')").run();
    db.prepare("DELETE FROM orders WHERE id IN ('ord_1','ord_2')").run();
    db.prepare("DELETE FROM expenses WHERE id IN ('exp_1','exp_2','exp_3')").run();
    db.prepare("DELETE FROM coupons WHERE code IN ('WELCOME10','AURA500')").run();
    db.prepare("DELETE FROM wishlist_items WHERE user_id = 'u_cust_1'").run();
    db.prepare("DELETE FROM customer_profiles WHERE user_id = 'u_cust_1'").run();
    db.prepare("DELETE FROM users WHERE id = 'u_cust_1'").run();
    // invented suppliers, purchase orders and sourcing pipeline records
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM supplier_products').run();
    db.prepare('DELETE FROM suppliers').run();
    db.prepare('DELETE FROM sourcing_research').run();
    db.prepare('DELETE FROM inventory_movements').run();
    // branding + placeholder business details (to be entered by the admin in Settings)
    setting('store_name', 'ShopWalk 360');
    setting('store_tagline', 'Explore. Experience. Discover.');
    ['contact_phone', 'contact_whatsapp', 'contact_email', 'office_address', 'bank_title', 'bank_name', 'bank_account', 'bank_iban'].forEach((k) => setting(k, ''));
    db.prepare("UPDATE store_promo_screens SET subtitle = REPLACE(subtitle, 'Try a watch on your avatar · ', '')").run();
    setting('demo_cleanup_version', '1');
  });
  try {
    db.pragma('foreign_keys = OFF');
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  console.log('Demo data removed; store branded as ShopWalk 360.');
}

/** Public store address. Replaces a blank, Gmail, or old placeholder contact email. */
export function ensureStoreContact() {
  const current = (getSetting('contact_email') || '').trim();
  const replace = !current || /@gmail\.com$/i.test(current) || current.toLowerCase() === 'support@auracommerce.pk';
  if (replace) setting('contact_email', 'info@shopwalk360.com');
}

/* ------------------------------------------------------------------ Cloudflare R2 media storage */
let r2: S3Client | null = null;
export const r2Enabled = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL);

const SAFE_MEDIA_KEY = /^(video|image|model|audio|captions)\/[A-Za-z0-9._-]+$/;

function r2Client() {
  if (!r2) {
    r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return r2;
}

export async function putToR2(key: string, body: Buffer, contentType: string) {
  await r2Client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
  return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
}

/** Read one stored file, honoring a browser Range request so a video can start immediately. */
export async function openR2Object(key: string, range?: string) {
  if (!r2Enabled() || !SAFE_MEDIA_KEY.test(key)) return null;
  const out = await r2Client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Range: range }));
  const body = out.Body as Readable | undefined;
  if (!body || typeof body.pipe !== 'function') return null;
  return {
    stream: body,
    contentType: out.ContentType || 'application/octet-stream',
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
  };
}

/** Let the website use R2 videos as textures on the 3D screens. */
export async function ensureR2Cors() {
  if (!r2Enabled()) {
    if (process.env.NODE_ENV === 'production') console.warn('Cloudflare R2 is not configured. Screen videos will not be kept in Cloudflare until R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL are set.');
    return;
  }
  try {
    await r2Client().send(new PutBucketCorsCommand({
      Bucket: process.env.R2_BUCKET!,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag'],
          MaxAgeSeconds: 86400,
        }],
      },
    }));
  } catch (err: any) {
    console.warn('Could not set Cloudflare R2 CORS. Screen videos need the bucket to allow GET from the website.', err?.message || err);
  }
}
