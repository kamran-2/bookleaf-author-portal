'use client';
import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Ticket {
  id: string; 
  subject: string;
  description: string;
  status: string;
  category: string | null;
  ai_category: string | null;
  priority: string;
  ai_priority: string | null;
  ai_draft_response: string | null;
  ai_processed: boolean;
  author_name: string;
  author_email: string;
  author_city: string;
  book_title: string | null;
  book_isbn: string | null;
  book_genre: string | null;
  book_status: string | null;
  total_copies_sold: number | null;
  royalty_pending: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Response { 
    id: string;
    body: string; 
    responder_name: string;
    responder_role: 'author' | 'admin';
    created_at: string; 
  }

interface Note { 
  id: string; 
  body: string; 
  author_name: string;
  created_at: string; 
}

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const CATEGORIES = ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [fetching, setFetching] = useState(true);

  const [replyBody, setReplyBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [sending, setSending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<'reply' | 'notes'>('reply');

  const fetchTicket = useCallback(() => {
    api.get(`/api/admin/tickets/${id}`)
      .then(r => {
        setTicket(r.data.ticket);
        setResponses(r.data.responses);
        setNotes(r.data.notes);
        if (r.data.ticket.ai_draft_response && !replyBody) {
          setReplyBody(r.data.ticket.ai_draft_response);
        }
      })
      .catch(() => router.replace('/admin/tickets'))
      .finally(() => setFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user?.role === 'author') { router.replace('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetchTicket();

    const socket = getSocket();
    socket.emit('join:admin');
    socket.emit('join:ticket', id);

    const onResponse = (data: Response & { ticket_id: string }) => {
      if (data.ticket_id === id || !data.ticket_id)
        setResponses(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data]);
    };
    const onNote = (data: Note & { ticket_id: string }) => {
      if (data.ticket_id === id) setNotes(prev => [...prev, data]);
    };

    socket.on('ticket:response', onResponse);
    socket.on('ticket:note', onNote);
    return () => { socket.off('ticket:response', onResponse); socket.off('ticket:note', onNote); };
  }, [user, id, fetchTicket]);

  async function loadAIDraft() {
    setLoadingDraft(true);
    try {
      const res = await api.post(`/api/admin/tickets/${id}/ai-draft`);
      if (res.data.draft) setReplyBody(res.data.draft);
    } catch { /* AI unavailable */ }
    finally { setLoadingDraft(false); }
  }

  async function sendReply() {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/admin/tickets/${id}/responses`, { body: replyBody });
      setReplyBody('');
      setTicket(prev => prev ? { ...prev, status: prev.status === 'Open' ? 'In Progress' : prev.status } : prev);
    } catch { /* handled by interceptor */ }
    finally { setSending(false); }
  }

  async function saveNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/api/admin/tickets/${id}/notes`, { body: noteBody });
      setNoteBody('');
    } catch { /* handled */ }
    finally { setSavingNote(false); }
  }

  async function updateField(patch: Record<string, unknown>) {
    const res = await api.patch(`/api/admin/tickets/${id}`, patch);
    setTicket(prev => prev ? { ...prev, ...res.data.ticket } : prev);
  }

  if (loading || fetching) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!ticket) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin/tickets" className="text-sm text-indigo-600 hover:underline mb-4 block">← Back to queue</Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* ─── Left: ticket + thread ─── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start gap-3 flex-wrap justify-between">
                <h1 className="text-xl font-bold text-gray-900 flex-1">{ticket.subject}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={ticket.priority} variant="priority" />
                  <Badge label={ticket.status} variant="status" />
                </div>
              </div>
              {ticket.category && (
                <p className="text-sm text-blue-600 mt-2">{ticket.category}
                  {ticket.ai_category && ticket.ai_category !== ticket.category && (
                    <span className="text-gray-400 ml-1">(AI: {ticket.ai_category})</span>
                  )}
                </p>
              )}
              <p className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              <p className="mt-3 text-xs text-gray-400">Submitted {fmtDate(ticket.created_at)}</p>
            </div>

            {/* Response thread */}
            {responses.map(r => {
              const isAuthor = r.responder_role === 'author';
              return (
                <div key={r.id} className={`border rounded-xl p-5 ${isAuthor ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isAuthor ? 'bg-indigo-500' : 'bg-[#1a3a5c]'}`}>
                        {r.responder_name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.responder_name}</p>
                        <p className="text-xs text-gray-400">{isAuthor ? 'Author' : 'BookLeaf Support'}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700 [&_p]:mt-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500">
                    <ReactMarkdown>{r.body}</ReactMarkdown>
                  </div>
                </div>
              );
            })}

            {/* Reply / Notes tabs */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex gap-1 mb-4 border-b border-gray-100 pb-3">
                {(['reply', 'notes'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors
                      ${activeTab === tab ? 'bg-[#1a3a5c] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {tab === 'reply' ? 'Reply to Author' : `Internal Notes (${notes.length})`}
                  </button>
                ))}
              </div>

              {activeTab === 'reply' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Response</label>
                    <button onClick={loadAIDraft} disabled={loadingDraft}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50">
                      {loadingDraft ? <><Spinner size="sm" />Generating...</> : '✨ Generate AI Draft'}
                    </button>
                  </div>
                  <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                    rows={8} placeholder="Type your response to the author..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex justify-end mt-3">
                    <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                      className="bg-[#1a3a5c] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#15304d] disabled:opacity-50 flex items-center gap-2 transition-colors">
                      {sending ? <><Spinner size="sm" />Sending...</> : 'Send Response'}
                    </button>
                  </div>
                </>
              )}

              {activeTab === 'notes' && (
                <>
                  {notes.length > 0 && (
                    <div className="space-y-3 mb-4">
                      {notes.map(n => (
                        <div key={n.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium">{n.author_name}</span>
                            <span>{fmtDate(n.created_at)}</span>
                          </div>
                          <div className="prose prose-sm max-w-none text-gray-700 [&_p]:mt-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:bg-yellow-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                            <ReactMarkdown>{n.body}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)}
                    rows={4} placeholder="Internal note — not visible to the author..."
                    className="w-full border border-yellow-300 bg-yellow-50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  />
                  <div className="flex justify-end mt-3">
                    <button onClick={saveNote} disabled={savingNote || !noteBody.trim()}
                      className="bg-yellow-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                      {savingNote ? <><Spinner size="sm" />Saving...</> : 'Save Note'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ─── Right: sidebar ─── */}
          <div className="space-y-4">
            {/* Author info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Author</h3>
              <p className="font-medium text-gray-900">{ticket.author_name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{ticket.author_email}</p>
              {ticket.author_city && <p className="text-sm text-gray-400 mt-0.5">{ticket.author_city}</p>}
            </div>

            {/* Book context */}
            {ticket.book_title && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Book Context</h3>
                <p className="font-medium text-gray-900">{ticket.book_title}</p>
                {ticket.book_genre && <p className="text-sm text-gray-500 mt-0.5">{ticket.book_genre}</p>}
                {ticket.book_isbn && <p className="text-xs text-gray-400 font-mono mt-1">ISBN: {ticket.book_isbn}</p>}
                {ticket.book_status && <p className="text-xs text-gray-500 mt-2">Status: {ticket.book_status}</p>}
                {ticket.total_copies_sold != null && <p className="text-xs text-gray-500">Copies sold: {ticket.total_copies_sold}</p>}
                {ticket.royalty_pending != null && Number(ticket.royalty_pending) > 0 && (
                  <p className="text-xs text-orange-600 font-medium mt-1">₹{Number(ticket.royalty_pending).toLocaleString()} royalty pending</p>
                )}
              </div>
            )}

            {/* Ticket controls */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Manage Ticket</h3>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <select value={ticket.status}
                  onChange={e => updateField({ status: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Category {ticket.ai_category && <span className="text-indigo-400">(AI: {ticket.ai_category})</span>}
                </label>
                <select value={ticket.category ?? ''}
                  onChange={e => updateField({ category: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Priority {ticket.ai_priority && <span className="text-indigo-400">(AI: {ticket.ai_priority})</span>}
                </label>
                <select value={ticket.priority}
                  onChange={e => updateField({ priority: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Assigned to</label>
                <p className="text-sm text-gray-700">{ticket.assigned_to_name ?? 'Unassigned'}</p>
                <button onClick={() => updateField({ assign_to_me: true })}
                  className="mt-2 w-full text-sm text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors">
                  Assign to me
                </button>
                {ticket.assigned_to_name && (
                  <button onClick={() => updateField({ unassign: true })}
                    className="mt-1 w-full text-sm text-gray-500 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors">
                    Unassign
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
