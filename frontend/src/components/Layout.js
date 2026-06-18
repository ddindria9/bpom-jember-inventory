import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, Package, TruckIcon, FileText, CheckSquare,
  Printer, History, Box, ClipboardList, UsersRound, LogOut, Menu, X, Settings as SettingsIcon
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/master", label: "Data Master", icon: Package },
  { to: "/incoming", label: "Barang Masuk", icon: TruckIcon },
  { to: "/spb", label: "Permintaan (SPB)", icon: FileText },
  { to: "/approval", label: "Approval", icon: CheckSquare },
  { to: "/stock-card", label: "Kartu Stok", icon: History },
  { to: "/assets", label: "Aset & QR", icon: Box },
  { to: "/reports", label: "Laporan", icon: ClipboardList },
  { to: "/users", label: "Pengguna", icon: UsersRound },
  { to: "/settings", label: "Pengaturan", icon: SettingsIcon },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-[#1E3A8A] text-white flex flex-col transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 transition-transform`}>
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <img src="/logo-bpom.png" alt="BPOM" className="w-9 h-9 object-contain bg-white rounded p-0.5" />
          <div>
            <div className="font-display font-bold leading-none">Balai POM Jember</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-blue-200 mt-1">Inventory</div>
          </div>
          <button className="ml-auto lg:hidden p-1" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.replace("/", "")}`}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-3 py-2 text-xs text-blue-200">
            <div className="font-medium text-white truncate">{user?.name}</div>
            <div className="truncate">{user?.email}</div>
            <div className="mt-1 inline-block px-2 py-0.5 rounded bg-white/10 uppercase tracking-wider text-[10px]">{user?.role}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={logout}
            className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-sm"
          >
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 lg:px-8 gap-3">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setOpen(true)}><Menu className="w-5 h-5" /></button>
          <div className="text-sm text-slate-500">Badan Pengawas Obat dan Makanan · <span className="text-slate-900 font-medium">Jember</span></div>
          <div className="ml-auto text-xs text-slate-500 hidden sm:block">
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
