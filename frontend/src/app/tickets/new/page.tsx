'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';

interface Book { id: string; title: string; }

export default function NewTicketPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'admin') { router.replace('/admin/tickets'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'author') return;
    api.get('/api/authors/me/books').then(r => setBooks(r.data.books));
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, string | null> = { subject, description };
      payload.book_id = bookId || null;
      const res = await api.post('/api/tickets', payload);
      router.push(`/tickets/${res.data.ticket.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Submit Support Query</h1>
          <p className="text-gray-500 mt-1">Our team typically responds within 24–48 hours.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Related book <span className="text-gray-400 font-normal">(optional)</span></label>
            <select value={bookId} onChange={e => setBookId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">General / Account Level</option>
              {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject <span className="text-red-500">*</span></label>
            <input required value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Royalty payment not received for Q3 2025"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)}
              rows={6} placeholder="Please describe your issue in detail. Include any relevant dates, amounts, or reference numbers."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachment <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-sm text-gray-400">
              <p>Drag & drop or <span className="text-indigo-500">browse</span></p>
              <p className="text-xs mt-1">PDF, JPG, PNG up to 10MB</p>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.back()}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-[#1a3a5c] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#15304d] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <><Spinner size="sm" />Submitting...</> : 'Submit Query'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
