'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';

interface Stats {
  total_books: string;
  total_copies_sold: string;
  total_royalty_earned: string;
  royalty_paid: string;
  royalty_pending: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'admin') { router.replace('/admin/tickets'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'author') return;
    api.get('/api/authors/me').then(r => setStats(r.data.stats)).finally(() => setFetching(false));
  }, [user]);

  if (loading || fetching) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="text-gray-500 mt-1">Here&apos;s an overview of your publishing activity.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Books" value={stats?.total_books ?? '—'} />
          <StatCard label="Copies Sold" value={Number(stats?.total_copies_sold ?? 0).toLocaleString()} />
          <StatCard label="Royalty Earned" value={`₹${Number(stats?.total_royalty_earned ?? 0).toLocaleString()}`} />
          <StatCard
            label="Royalty Pending"
            value={`₹${Number(stats?.royalty_pending ?? 0).toLocaleString()}`}
            sub={Number(stats?.royalty_pending ?? 0) > 0 ? 'Paid quarterly within 45 days' : 'All paid up!'}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/books"
            className="block bg-white border border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-sm transition-all group">
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700">My Books →</h3>
            <p className="text-sm text-gray-500 mt-1">View sales, royalties, and distribution details for all your books.</p>
          </Link>
          <Link href="/tickets/new"
            className="block bg-[#1a3a5c] text-white rounded-xl p-6 hover:bg-[#15304d] transition-all group">
            <h3 className="font-semibold">Submit a Support Query →</h3>
            <p className="text-sm text-blue-200 mt-1">Royalty questions, ISBN issues, printing quality, or anything else.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
