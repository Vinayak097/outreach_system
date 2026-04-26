import { FileText, Mail, Settings as SettingsIcon } from "lucide-react";
import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function onLogout() {
    await api.logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-full flex">
      <aside className="w-56 shrink-0 border-r bg-surface-primary flex flex-col">
        <div className="px-4 py-4 border-b">
          <div className="text-h2">Outreach</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <NavItem to="/" end icon={<Mail size={14} />} label="Campaigns" />
          <NavItem to="/templates" icon={<FileText size={14} />} label="Templates" />
          <NavItem to="/settings" icon={<SettingsIcon size={14} />} label="Settings" />
        </nav>
        <div className="p-2 border-t">
          <button className="btn w-full justify-start text-ink-secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-card px-2 py-1.5 text-body",
          isActive
            ? "bg-surface-tertiary text-ink-primary"
            : "text-ink-secondary hover:bg-surface-secondary",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
