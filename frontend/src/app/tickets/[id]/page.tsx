'use client';
import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Ticket {
  id: string; subject: string; description: string; status: string;
  category: string | null; priority: string; book_title: string | null;
  book_isbn: string | null; created_at: string; updated_at: string;
}
interface Response {
  id: string; body: string; responder_name: string;
  responder_role: 'author' | 'admin'; created_at: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();

  const [ticket, setTicket]     = useState<Ticket | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [fetching, setFetching]  = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending]    = useState(false);

  const fetchTicket = useCallback(() => {
    api.get(`/api/tickets/${id}`)
      .then(r => { setTicket(r.data.ticket); setResponses(r.data.responses); })
      .catch(() => router.replace('/tickets'))
      .finally(() => setFetching(false));
  }, [id, router]);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'admin') { router.replace('/admin/tickets'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'author') return;
    fetchTicket();

    const socket = getSocket();
    socket.emit('join:ticket', id);
    socket.emit('join:author', user.id);

    const onResponse = (data: Response & { ticket_id?: string }) => {
      if (data.ticket_id && data.ticket_id !== id) return;
      setResponses(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data]);
    };
    const onUpdated = (data: { id: string; status: string }) => {
      if (data.id === id) setTicket(prev => prev ? { ...prev, status: data.status } : prev);
    };

    socket.on('ticket:response', onResponse);
    socket.on('ticket:updated', onUpdated);
    return () => {
      socket.off('ticket:response', onResponse);
      socket.off('ticket:updated', onUpdated);
    };
  }, [user, id, fetchTicket]);

  async function sendReply() {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/tickets/${id}/replies`, { body: replyBody });
      setReplyBody('');
    } catch { /* handled by interceptor */ }
    finally { setSending(false); }
  }

  if (loading || fetching) return (
    <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>
  );
  if (!ticket) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/tickets" className="text-sm text-indigo-600 hover:underline mb-4 block">
          ← Back to tickets
        </Link>

        {/* Ticket header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 flex-1">{ticket.subject}</h1>
            <Badge label={ticket.status} variant="status" />
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
            {ticket.book_title && (
              <span className="bg-gray-100 px-2 py-0.5 rounded">{ticket.book_title}</span>
            )}
            {ticket.category && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{ticket.category}</span>
            )}
            <Badge label={ticket.priority} variant="priority" />
          </div>
          <p className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </p>
          <p className="mt-3 text-xs text-gray-400">Submitted {fmtDate(ticket.created_at)}</p>
        </div>

        {/* Message thread */}
        <div className="space-y-3 mb-4">
          {responses.length === 0 ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-700">
              Your ticket is in our queue. Our team will respond within 24–48 hours.
            </div>
          ) : (
            responses.map(r => {
              const isOwn = r.responder_role === 'author';
              return (
                <div key={r.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xl w-full rounded-xl p-5 ${
                    isOwn
                      ? 'bg-indigo-50 border border-indigo-100'
                      : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                          isOwn ? 'bg-indigo-500' : 'bg-[#1a3a5c]'
                        }`}>
                          {r.responder_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {isOwn ? 'You' : r.responder_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {isOwn ? 'Author' : 'BookLeaf Support'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {r.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Author reply box */}
        {ticket.status !== 'Closed' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add a reply
            </label>
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              rows={4}
              placeholder="Add more details or follow up on this ticket..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={sendReply}
                disabled={sending || !replyBody.trim()}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {sending ? <><Spinner size="sm" />Sending...</> : 'Send Reply'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
