import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, api } from "../lib/api";

type State = "checking" | "authed" | "anon";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(() => !cancelled && setState("authed"))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setState("anon");
        else setState("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="flex h-full items-center justify-center text-ink-secondary text-small">
        Loading…
      </div>
    );
  }
  if (state === "anon") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
