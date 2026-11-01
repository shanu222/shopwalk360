import React, { useEffect, useState } from 'react';
import { Users, Search, Radio, RefreshCw } from 'lucide-react';

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

const fmtDate = (s?: string | null) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Admin: customer accounts registered on the storefront, plus who is on the site right now */
export const AdminCustomers: React.FC = () => {
  const [rows, setRows] = useState<Customer[]>([]);
  const [live, setLive] = useState<{ online: number; inStore3d: number } | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/customers');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load customers');
      setRows(d.customers || []);
      setLive(d.live || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(() => {
      fetch('/api/admin/customers').then((r) => r.json()).then((d) => setLive(d.live || null)).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const shown = rows.filter((c) => !q || `${c.full_name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5 text-blue-600" /> Customers</h2>
          <p className="mt-1 text-sm text-slate-600">Accounts created on your storefront. They are stored in the store database on your server; passwords are kept only as salted hashes.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Registered customers</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Radio className="h-3.5 w-3.5 text-emerald-600" /> Visitors on the site now</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{live ? live.online : '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Walking in the 3D store now</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{live ? live.inStore3d : '—'}</div>
        </div>
      </div>
      <p className="-mt-3 text-[11px] text-slate-500">Live counts include guests and signed-in customers currently in the 3D store or connected to it, refreshed every 15 seconds.</p>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
        </div>
        {error && <p className="p-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{rows.length ? 'No customers match your search.' : 'No customer accounts yet. They appear here as soon as someone signs up on the storefront.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Spent</th>
                  <th className="px-4 py-3">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{c.full_name}</div>
                      <div className="text-xs text-slate-500">{c.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{c.order_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">PKR {Math.round(c.total_spent).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(c.last_order_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCustomers;
