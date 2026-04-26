import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CampaignDetail } from "./pages/CampaignDetail";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { NewCampaign } from "./pages/NewCampaign";
import { Settings } from "./pages/Settings";
import { Templates } from "./pages/Templates";

function Authed({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Authed><Dashboard /></Authed>} />
        <Route path="/campaigns/:id" element={<Authed><CampaignDetail /></Authed>} />
        <Route path="/campaigns/:id/new" element={<Authed><NewCampaign /></Authed>} />
        <Route path="/templates" element={<Authed><Templates /></Authed>} />
        <Route path="/settings" element={<Authed><Settings /></Authed>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" />
    </>
  );
}
