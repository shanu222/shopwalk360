/**
 * API client glue for split hosting (frontend on Vercel, API on Railway).
 *
 * Every request to `/api/...` or `/uploads/...` is sent to VITE_API_URL (the Railway URL) and carries the
 * signed-in user's token. Tokens returned by login/registration are stored automatically, so existing
 * components keep using plain `fetch('/api/...')`.
 */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');
const TOKEN_KEY = 'shopwalk360_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
};

/** Resolve a stored media URL (absolute R2/Railway URLs pass through; legacy `/uploads/...` gets the API host) */
export const mediaUrl = (u?: string | null) => (u && (u.startsWith('/uploads/') || u.startsWith('/music-library/')) ? `${API_BASE}${u}` : u || '');

/**
 * Same file, loaded through the API, so WebGL (3D screens, 3D product models) may use it: the
 * public Cloudflare bucket address — r2.dev or a custom domain — does not send CORS headers.
 * Files the API serves itself pass straight through.
 */
export const screenMediaUrl = (u?: string | null) => {
  const abs = mediaUrl(u);
  if (!abs || !/^https?:\/\//i.test(abs)) return abs;
  const r2 = abs.match(/^https?:\/\/[^/]+\.r2\.dev\/([^?#]+)/i);
  if (r2) return `${API_BASE}/api/media/${r2[1]}`;
  try {
    const host = new URL(abs).host;
    const apiHost = API_BASE ? new URL(API_BASE, window.location.href).host : window.location.host;
    if (host === apiHost || host === window.location.host) return abs;
  } catch {
    return abs;
  }
  return `${API_BASE}/api/media-by-url?u=${encodeURIComponent(abs)}`;
};

const nativeFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isApi = url.startsWith('/api/') || url.startsWith('/uploads/');
  if (!isApi) return nativeFetch(input, init);
  const headers = new Headers(init.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined));
  const token = getToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const res = await nativeFetch(`${API_BASE}${url}`, { ...init, headers });
  if (/^\/api\/auth\/(login|register)$/.test(url) && res.ok) {
    res.clone().json().then((d) => d?.token && setToken(d.token)).catch(() => {});
  }
  if (url === '/api/auth/logout') setToken(null);
  if (res.status === 401 && url === '/api/auth/me') setToken(null);
  return res;
};

/**
 * Download a file from the API as the signed-in user (a plain link would go to the frontend host
 * and carry no sign-in, so it cannot fetch admin files).
 */
export async function downloadFromApi(path: string, filename: string) {
  const r = await fetch(path);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || 'The file could not be downloaded.');
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
