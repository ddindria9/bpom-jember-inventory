import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtIDR, BACKEND_URL } from "../lib/api";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { CheckCircle2, AlertTriangle, XCircle, MapPin, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

const OPTIONS = [
  { v: "BAIK", label: "Baik", color: "bg-emerald-600", icon: CheckCircle2 },
  { v: "RUSAK_RINGAN", label: "Rusak Ringan", color: "bg-amber-500", icon: AlertTriangle },
  { v: "RUSAK_BERAT", label: "Rusak Berat", color: "bg-red-600", icon: XCircle },
];

export default function AssetInspect() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [asset, setAsset] = useState(null);
  const [pick, setPick] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get(`/assets/${id}`).then(r => { setAsset(r.data); setPick(r.data.kondisi); }).catch(() => {}); }, [id]);

  const save = async () => {
    if (!user) { window.location.href = "/login"; return; }
    setSaving(true);
    try {
      await api.post(`/assets/${id}/kondisi`, { kondisi: pick, catatan });
      toast.success("Kondisi tersimpan");
      const r = await api.get(`/assets/${id}`); setAsset(r.data);
    } catch { toast.error("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  if (!asset) return <div className="min-h-screen grid place-items-center text-slate-500">Memuat aset...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-[#1E3A8A] text-white px-5 pt-6 pb-10">
        <div className="text-[10px] uppercase tracking-[0.25em] text-blue-200">Inspeksi Fisik Aset</div>
        <div className="font-display text-2xl mt-1">{asset.nama}</div>
        <div className="text-sm text-blue-100 font-mono-data mt-1">{asset.nup}</div>
      </div>

      <div className="px-5 -mt-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {asset.foto_path ? (
            <img src={`${BACKEND_URL}/api/files/${asset.foto_path}`} alt={asset.nama} className="w-full h-56 object-cover" />
          ) : (
            <div className="w-full h-40 bg-slate-100 grid place-items-center text-slate-400 text-sm">Tanpa foto</div>
          )}
          <div className="p-5 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600"><MapPin className="w-4 h-4" /> {asset.lokasi || "-"}</div>
            <div className="flex items-center gap-2 text-slate-600"><Calendar className="w-4 h-4" /> Tahun Perolehan {asset.tahun_perolehan || "-"}</div>
            <div className="flex items-center gap-2 text-slate-600"><FileText className="w-4 h-4" /> BAST {asset.bast || "-"}</div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
              <span className="text-slate-500">Harga Perolehan</span>
              <span className="font-semibold">{fmtIDR(asset.harga)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg mt-4 p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500">Kondisi Saat Ini</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {OPTIONS.map(o => {
              const Icon = o.icon;
              const active = pick === o.v;
              return (
                <button
                  key={o.v}
                  data-testid={`inspect-${o.v}`}
                  onClick={() => setPick(o.v)}
                  className={`min-h-[80px] rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1 px-2 ${active ? `${o.color} border-transparent text-white` : "bg-white border-slate-200 text-slate-700"}`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-semibold text-center">{o.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <Textarea placeholder="Catatan kondisi (opsional)..." value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={3} />
          </div>
          {!loading && !user && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Login diperlukan untuk menyimpan perubahan. <a href="/login" className="underline">Masuk</a>
            </div>
          )}
          <Button data-testid="inspect-save" onClick={save} disabled={saving} className="w-full mt-4 h-12 bg-[#1E3A8A] hover:bg-[#1E2A6B]">
            {saving ? "Menyimpan..." : "Simpan Kondisi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
