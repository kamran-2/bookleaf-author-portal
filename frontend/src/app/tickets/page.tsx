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
  id: string;
  subject: string;
  status: string;
  category: string | null;
  priority: string;
  response_count: string;
  book_title: string | null;
  created_at: string;
  updated_at: string;
}

export default function TicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchTickets = useCallback(() => {
    api.get('/api/tickets').then(r => setTickets(r.data.tickets)).finally(() => setFetching(false));
  }, []);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'admin') { router.replace('/admin/tickets'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'author') return;
    fetchTickets();

    const socket = getSocket();
    socket.emit('join:author', user.id);

    // Update ticket status in real-time when admin responds
    const onUpdate = (data: { id: string; status: string }) => {
      setTickets(prev => prev.map(t => t.id === data.id ? { ...t, status: data.status } : t));
    };
    const onResponse = (data: { ticket_id: string }) => {
      setTickets(prev => prev.map(t =>
        t.id === data.ticket_id ? { ...t, response_count: String(Number(t.response_count) + 1) } : t
      ));
    };

    socket.on('ticket:updated', onUpdate);
    socket.on('ticket:response', onResponse);
    return () => { socket.off('ticket:updated', onUpdate); socket.off('ticket:response', onResponse); };
  }, [user, fetchTickets]);

  if (loading || fetching) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Tickets</h1>
            <p className="text-gray-500 mt-1">{tickets.length} support request{tickets.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/tickets/new"
            className="bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#15304d] transition-colors">
            + New Ticket
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">No support tickets yet.</p>
            <Link href="/tickets/new" className="text-indigo-600 font-medium hover:underline">Submit your first query →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map(ticket => (
              <Link key={ticket.id} href={`/tickets/${ticket.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{ticket.subject}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {ticket.book_title ?? 'General / Account Level'}
                      {ticket.category && ` · ${ticket.category}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge label={ticket.status} variant="status" />
                    {ticket.priority !== 'Medium' && <Badge label={ticket.priority} variant="priority" />}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  <span>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span>{ticket.response_count} response{ticket.response_count !== '1' ? 's' : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
