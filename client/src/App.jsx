import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import DocumentList from './pages/DocumentList.jsx';
import EditorPage from './pages/EditorPage.jsx';
import TopBar from './components/TopBar.jsx';

// Minimal client-side routing: "/" is the dashboard, "/d/:id" opens a document.
function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return [path, navigate];
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [path, navigate] = usePath();

  useEffect(() => {
    api.me().then((r) => setUser(r.user ?? null)).catch(() => setUser(null));
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/');
  };

  if (user === undefined) return <div className="center-screen muted">Loading…</div>;
  if (!user) return <Login onSignedIn={setUser} />;

  const docMatch = /^\/d\/([\w-]+)$/.exec(path);
  return (
    <div className="app">
      <TopBar user={user} onSignOut={signOut} onHome={() => navigate('/')} />
      {docMatch ? (
        <EditorPage key={docMatch[1]} id={docMatch[1]} user={user} navigate={navigate} />
      ) : (
        <DocumentList user={user} navigate={navigate} />
      )}
    </div>
  );
}
