'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'author' | 'admin';
  phone?: string;
  city?: string;
  author_id?: string;
  joined_date?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then(res => {
        setUser(res.data.user);
        connectSocket();
      })
      .catch(() => Cookies.remove('token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/api/auth/login', { email, password });
    const { token, user } = res.data;
    Cookies.set('token', token, { expires: 7, sameSite: 'strict' });
    setUser(user);
    connectSocket();
  }

  function logout() {
    Cookies.remove('token');
    setUser(null);
    disconnectSocket();
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
