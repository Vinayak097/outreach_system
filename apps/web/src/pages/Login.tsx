import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/api";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.login(password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Incorrect password");
      else setError("Unable to sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-h1">Sign in</h1>
          <p className="text-small text-ink-secondary">Enter the admin password to continue.</p>
        </div>
        <div className="space-y-1">
          <label className="text-small text-ink-secondary" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <div className="badge bg-danger-bg text-danger-fg w-full justify-start">{error}</div>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={pending || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
