'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Spinner from '@/components/ui/Spinner';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === 'admin' ? '/admin/tickets' : '/dashboard');
    }
  }, [user, loading, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a3a5c] to-[#2d6a9f] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1a3a5c]">BookLeaf</h1>
          <p className="text-gray-500 mt-1">Author Support Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={submitting}
            className="w-full bg-[#1a3a5c] text-white py-2.5 rounded-lg font-medium hover:bg-[#15304d] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <><Spinner size="sm" /> Signing in...</> : 'Sign in'}
          </button>
        </form>

        <div className="mt-8 border-t pt-6">
          <p className="text-xs text-gray-500 font-medium mb-3">Test credentials</p>
          <div className="space-y-1.5 text-xs text-gray-600 font-mono">
            <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
              <span className="text-indigo-600 font-semibold">Admin</span>
              <span>admin@bookleaf.com / admin123</span>
            </div>
            <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
              <span>Author 1</span>
              <span>priya.sharma@email.com / password123</span>
            </div>
            <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
              <span>Author 2</span>
              <span>rohit.kapoor@email.com / password123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
