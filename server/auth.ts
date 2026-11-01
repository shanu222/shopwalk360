/**
 * Stateless signed-token authentication (one token per browser), replacing the old shared server session.
 * Token format: base64url(userId).expiresAt.hmac  — signed with AUTH_SECRET.
 */
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

const store = new AsyncLocalStorage<{ userId: string }>();
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

let secret = process.env.AUTH_SECRET || '';
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  AUTH_SECRET is not set. Using a random secret — everyone is signed out on each restart. Set AUTH_SECRET in Railway.');
  }
  secret = crypto.randomBytes(32).toString('hex');
}

const sign = (data: string) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function issueToken(userId: string) {
  const payload = `${Buffer.from(userId).toString('base64url')}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Buffer.from(parts[0], 'base64url').toString();
}

/** Express middleware: reads `Authorization: Bearer <token>` and makes the user id available for this request */
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const userId = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) || '' : '';
  store.run({ userId }, () => next());
}

export const currentUserId = () => store.getStore()?.userId || '';
