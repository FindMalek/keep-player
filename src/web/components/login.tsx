import { type FormEvent, useState } from "react";
import { login } from "../lib/subsonic";

export function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(user.trim(), password);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          keep music
        </div>
        <p className="muted small">sign in with your navidrome account</p>
        <label>
          <span>username</span>
          <input autoComplete="username" value={user} onChange={(event) => setUser(event.target.value)} required autoFocus />
        </label>
        <label>
          <span>password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="level-crit small">{error}</p>}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>
      </form>
    </main>
  );
}
