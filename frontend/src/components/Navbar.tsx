'use client';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { user, logout } = useAuth();
  const path = usePathname();

  const authorLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/books', label: 'My Books' },
    { href: '/tickets', label: 'My Tickets' },
  ];

  const adminLinks = [
    { href: '/admin/tickets', label: 'Ticket Queue' },
  ];

  const links = user?.role === 'admin' ? adminLinks : authorLinks;

  return (
    <nav className="bg-[#1a3a5c] text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href={user?.role === 'admin' ? '/admin/tickets' : '/dashboard'}
              className="font-bold text-lg tracking-tight">
              BookLeaf
              {user?.role === 'admin' && (
                <span className="ml-2 text-xs bg-indigo-500 px-2 py-0.5 rounded-full">Admin</span>
              )}
            </Link>
            <div className="hidden sm:flex gap-1">
              {links.map(l => (
                <Link key={l.href} href={l.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${path.startsWith(l.href)
                      ? 'bg-white/20 text-white'
                      : 'text-gray-200 hover:bg-white/10'}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300 hidden sm:block">{user?.name}</span>
            <button onClick={logout}
              className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
