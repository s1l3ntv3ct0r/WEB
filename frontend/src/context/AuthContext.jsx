import { createContext, useContext, useEffect, useState } from 'react';
import { api, restoreSession, setToken } from '../api/client.js';
const Auth = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    restoreSession().then(setUser).catch(() => {}).finally(() => setLoading(false));
    const signedOut = () => setUser(null); window.addEventListener('shoplab:signed-out', signedOut);
    return () => window.removeEventListener('shoplab:signed-out', signedOut);
  }, []);
  async function signIn(path, body) { const { data } = await api.post(`/auth/${path}`, body); setToken(data.data.accessToken); setUser(data.data.user); }
  async function signOut() { await api.post('/auth/logout'); setToken(null); setUser(null); }
  return <Auth.Provider value={{ user, loading, signIn, signOut, setUser }}>{children}</Auth.Provider>;
}
export const useAuth = () => useContext(Auth);
