'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';

interface Book {
  id: string;
  title: string;
  isbn: string;
  genre: string;
  publication_date: string | null;
  status: string;
  mrp: number | null;
  author_royalty_per_copy: number | null;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
}

function fmt(n: number | null) { return n != null ? `₹${Number(n).toLocaleString()}` : '—'; }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

export default function BooksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'admin') { router.replace('/admin/tickets'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'author') return;
    api.get('/api/authors/me/books').then(r => setBooks(r.data.books)).finally(() => setFetching(false));
  }, [user]);

  if (loading || fetching) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Books</h1>
            <p className="text-gray-500 mt-1">{books.length} book{books.length !== 1 ? 's' : ''} in your portfolio</p>
          </div>
          <Link href="/tickets/new"
            className="bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#15304d] transition-colors">
            Submit Query
          </Link>
        </div>

        {books.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No books found.</div>
        ) : (
          <div className="space-y-4">
            {books.map(book => (
              <div key={book.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{book.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{book.genre} · ISBN: {book.isbn}</p>
                  </div>
                  <Badge label={book.status.startsWith('In Production') ? book.status : book.status} />
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Published</p>
                    <p className="font-medium text-gray-900">{fmtDate(book.publication_date)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">MRP</p>
                    <p className="font-medium text-gray-900">{fmt(book.mrp)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Copies Sold</p>
                    <p className="font-medium text-gray-900">{book.total_copies_sold.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Royalty / Copy</p>
                    <p className="font-medium text-gray-900">{fmt(book.author_royalty_per_copy)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-sm bg-gray-50 rounded-lg p-4">
                  <div>
                    <p className="text-gray-400">Total Earned</p>
                    <p className="font-semibold text-gray-900">{fmt(book.total_royalty_earned)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Paid</p>
                    <p className="font-semibold text-green-700">{fmt(book.royalty_paid)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Pending</p>
                    <p className={`font-semibold ${Number(book.royalty_pending) > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {fmt(book.royalty_pending)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-6 text-xs text-gray-500 flex-wrap">
                  {book.last_royalty_payout_date && (
                    <span>Last payout: {fmtDate(book.last_royalty_payout_date)}</span>
                  )}
                  {book.print_partner && <span>Printed by: {book.print_partner}</span>}
                  {book.available_on.length > 0 && (
                    <span>Available on: {book.available_on.join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
