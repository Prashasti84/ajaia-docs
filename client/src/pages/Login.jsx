import { useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../components/TopBar.jsx';

const DEMO_ACCOUNTS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen', note: 'Owns “Q1 Planning Notes”' },
  { email: 'bob@ajaia.test', name: 'Bob Martinez', note: 'Editor on Alice’s doc' },
  { email: 'carol@ajaia.test', name: 'Carol Singh', note: 'Nothing shared yet' },
];

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async (address) => {
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(address);
      onSignedIn(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <h1>Sign in to Ajaia Docs</h1>
        <p className="muted">
          This is a demo with mocked authentication. Pick a seeded account, no password needed. To try
          sharing, sign in as a second person in a private window.
        </p>
        <div className="account-list">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} className="account" disabled={busy} onClick={() => signIn(a.email)}>
              <Avatar name={a.name} size={36} />
              <span className="account-text">
                <strong>{a.name}</strong>
                <span>{a.email} · {a.note}</span>
              </span>
              <span className="account-arrow" aria-hidden>→</span>
            </button>
          ))}
        </div>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            signIn(email);
          }}
        >
          <input
            type="email"
            placeholder="or type a demo email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn btn-primary" disabled={busy}>Sign in</button>
        </form>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </div>
  );
}
