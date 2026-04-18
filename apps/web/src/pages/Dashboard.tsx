import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function Dashboard() {
  const navigate = useNavigate();

  async function onLogout() {
    await api.logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-full p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1">Dashboard</h1>
        <button className="btn" onClick={onLogout}>
          Log out
        </button>
      </div>
      <div className="card p-6">
        <p className="text-body text-ink-secondary">
          Auth is wired up. Campaigns UI will land in phase 4.
        </p>
      </div>
    </div>
  );
}
