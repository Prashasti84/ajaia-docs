export function initials(name = '') {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 28 }) {
  // Stable colour per person, so collaborators are recognisable at a glance.
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="avatar"
      title={name}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 55% 45%)` }}
    >
      {initials(name)}
    </span>
  );
}

export default function TopBar({ user, onSignOut, onHome }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onHome}>
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M10 9h8l5 5v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z" fill="white" />
            <path d="M12 17h8M12 20.5h6" stroke="var(--accent)" strokeWidth="1.6" />
          </svg>
        </span>
        Ajaia Docs
      </button>
      <div className="topbar-user">
        <Avatar name={user.name} />
        <div className="topbar-user-text">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <button className="btn btn-ghost" onClick={onSignOut}>Switch user</button>
      </div>
    </header>
  );
}
