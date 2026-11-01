import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { BrandMark } from '../Navbar';

/** Sign-in screen for the separate admin area (/admin) */
export const AdminLogin: React.FC<{ onSignedIn: (u: User) => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Sign-in failed');
      if (d.user.role !== 'admin' && d.user.role !== 'manager') {
        await fetch('/api/auth/logout', { method: 'POST' });
        throw new Error('This account does not have administrator access.');
      }
      onSignedIn(d.user);
    } catch (x: any) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#14120f] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-2xl">
        <BrandMark />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Store administration</h1>
          <p className="mt-1 text-xs text-slate-500">Sign in with your administrator account.</p>
        </div>
        <label className="block text-xs font-semibold text-slate-700">Email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none" />
        </label>
        {error && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a1712] py-3 text-sm font-bold text-white hover:bg-black disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Sign in
        </button>
      </form>
    </div>
  );
};
