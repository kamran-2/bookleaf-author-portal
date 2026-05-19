'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Ticket {
  id: string; subject: string; status: string; category: string | null;
  priority: string; author_name: string; author_email: string;
  book_title: string | null; response_count: string;
  assigned_to_name: string | null; created_at: string;
}
interface Stats {
  total: string; open: string; in_progress: string;
  resolved: string; critical: string; unassigned: string;
}

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const CATEGORIES = ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'];

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`text-center px-4 py-3 rounded-lg ${highlight && Number(value) > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
      <p className={`text-xl font-bold ${highlight && Number(value) > 0 ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function AdminTicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fetching, setFetching] = useState(true);
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });

  const fetchData = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.category) params.set('category', filters.category);
    params.set('limit', '50');

    Promise.all([
      api.get(`/api/admin/tickets?${params}`),
      api.get('/api/admin/stats'),
    ]).then(([tRes, sRes]) => {
      setTickets(tRes.data.tickets);
      setStats(sRes.data.stats);
    }).finally(() => setFetching(false));
  }, [filters]);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'author') { router.replace('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetchData();

    const socket = getSocket();
    socket.emit('join:admin');

    const onNew = (t: Ticket) => setTickets(prev => [t, ...prev]);
    const onClassified = (t: Ticket) => setTickets(prev => prev.map(x => x.id === t.id ? { ...x, category: t.category, priority: t.priority } : x));

    socket.on('ticket:new', onNew);
    socket.on('ticket:classified', onClassified);
    return () => { socket.off('ticket:new', onNew); socket.off('ticket:classified', onClassified); };
  }, [user, fetchData]);

  useEffect(() => {
    if (user?.role === 'admin') fetchData();
  }, [filters, user, fetchData]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  const filterSelect = (key: keyof typeof filters, opts: string[]) => (
    <select value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
      <option value="">All {key}s</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Ticket Queue</h1>

        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            <StatPill label="Total" value={stats.total} />
            <StatPill label="Open" value={stats.open} />
            <StatPill label="In Progress" value={stats.in_progress} />
            <StatPill label="Resolved" value={stats.resolved} />
            <StatPill label="Critical" value={stats.critical} highlight />
            <StatPill label="Unassigned" value={stats.unassigned} highlight />
          </div>
        )}

        <div className="flex gap-3 mb-4 flex-wrap">
          {filterSelect('status', STATUSES)}
          {filterSelect('priority', PRIORITIES)}
          {filterSelect('category', CATEGORIES)}
          {(filters.status || filters.priority || filters.category) && (
            <button onClick={() => setFilters({ status: '', priority: '', category: '' })}
              className="text-sm text-indigo-600 hover:underline px-2">Clear filters</button>
          )}
        </div>

        {fetching ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200">No tickets match your filters.</div>
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => (
              <Link key={ticket.id} href={`/admin/tickets/${ticket.id}`}
                className={`block bg-white rounded-xl border p-4 hover:shadow-sm transition-all
                  ${ticket.priority === 'Critical' ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-indigo-200'}`}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={ticket.priority} variant="priority" />
                      <Badge label={ticket.status} variant="status" />
                      {!ticket.assigned_to_name && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Unassigned</span>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 mt-1.5 truncate">{ticket.subject}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {ticket.author_name} · {ticket.book_title ?? 'General'}
                      {ticket.category && ` · ${ticket.category}`}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-400 shrink-0">
                    <p>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <p className="mt-1">{ticket.response_count} reply</p>
                    {ticket.assigned_to_name && <p className="mt-1 text-indigo-600">{ticket.assigned_to_name}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
