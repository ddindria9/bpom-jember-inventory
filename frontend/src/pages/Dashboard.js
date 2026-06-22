import React, { useEffect, useState } from "react";
import { api, fmtIDR } from "../lib/api";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle, Package, Box, Wallet, Clock, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const COLORS = { BAIK: "#1E3A8A", RUSAK_RINGAN: "#F59E0B", RUSAK_BERAT: "#DC2626" };

function Stat({ icon: Icon, label, value, accent, testid }) {
  return (
    <div data-testid={testid} className="rise-in bg-white border border-slate-200 rounded-lg p-5 hover:-translate-y-0.5 transition-transform">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <Icon className={`w-4 h-4 ${accent || "text-slate-400"}`} />
      </div>
      <div className="mt-2 font-display text-3xl text-slate-900">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard/stats");
      setStats(data);
    } catch (e) { 
      toast.error("Gagal memuat dashboard");
      setStats({}); // set ke object kosong agar tidak crash
    }
  };

  useEffect(() => { load(); }, []);

  const seed = async () => {
    try { await api.post("/admin/seed"); toast.success("Data contoh berhasil dibuat"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal seed"); }
  };

  if (!stats) return <div className="text-slate-500">Memuat...</div>;

  // 🔥 PERBAIKAN UTAMA: guard untuk kondisi_counts
  const kondisiData = stats.kondisi_counts 
    ? Object.entries(stats.kondisi_counts).map(([k, v]) => ({ name: k.replace("_", " "), value: v, key: k })) 
    : [];
  const totalAssets = kondisiData.reduce((s, x) => s + x.value, 0);

  // Guard untuk properti lainnya
  const lowStockCount = stats.low_stock_count ?? 0;
  const pendingSpb = stats.pending_spb ?? 0;
  const totalNilai = stats.total_nilai ?? 0;
  const totalItems = stats.total_items ?? 0;
  const lowStockItems = stats.low_stock_items ?? [];
  const expiringItems = stats.expiring ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Ringkasan Operasional</div>
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 mt-1">Dashboard Inventory</h1>
        </div>
        {totalItems === 0 && (
          <Button data-testid="dashboard-seed-button" onClick={seed} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">Isi Data Contoh</Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat testid="stat-low-stock" icon={AlertTriangle} accent="text-red-600" label="Stok Menipis" value={lowStockCount} />
        <Stat testid="stat-pending-spb" icon={Inbox} accent="text-amber-500" label="Permintaan Menunggu" value={pendingSpb} />
        <Stat testid="stat-total-value" icon={Wallet} accent="text-emerald-600" label="Nilai Persediaan" value={fmtIDR(totalNilai)} />
        <Stat testid="stat-total-assets" icon={Box} accent="text-[#1E3A8A]" label="Total Aset BMN" value={totalAssets} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Low stock list */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Stok di bawah minimum</h3>
            <Link to="/master" className="text-xs text-[#1E3A8A] hover:underline">Lihat semua →</Link>
          </div>
          {lowStockItems.length === 0 ? (
            <div className="text-sm text-slate-500 mt-6">Tidak ada barang dengan stok menipis. 🟢</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr><th className="text-left py-2">Kode</th><th className="text-left">Nama</th><th className="text-right">Stok</th><th className="text-right">Min</th></tr>
                </thead>
                <tbody>
                  {lowStockItems.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="py-2 font-mono-data text-xs">{it.kode}</td>
                      <td>{it.nama}</td>
                      <td className="text-right font-semibold text-red-600">{it.stok}</td>
                      <td className="text-right text-slate-500">{it.stok_min}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Asset condition pie */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="font-display text-lg">Kondisi Aset</h3>
          <div className="text-xs text-slate-500">Total {totalAssets} aset</div>
          <div className="h-52 mt-4">
            {totalAssets === 0 ? (
              <div className="h-full grid place-items-center text-sm text-slate-400">Belum ada data aset</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={kondisiData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {kondisiData.map((e, i) => <Cell key={i} fill={COLORS[e.key]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Expiring */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-red-600" /><h3 className="font-display text-lg">Reagen Mendekati Kadaluarsa</h3></div>
        {expiringItems.length === 0 ? (
          <div className="text-sm text-slate-500 mt-4">Tidak ada reagen yang akan kadaluarsa dalam 90 hari.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr><th className="text-left py-2">Kode</th><th className="text-left">Nama Reagen</th><th className="text-left">Kadaluarsa</th><th className="text-right">Sisa Hari</th></tr>
              </thead>
              <tbody>
                {expiringItems.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono-data text-xs">{it.kode}</td>
                    <td>{it.nama}</td>
                    <td>{it.expiry_date}</td>
                    <td className={`text-right font-semibold ${it.days_left < 30 ? "text-red-600" : "text-amber-500"}`}>{it.days_left} hari</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
