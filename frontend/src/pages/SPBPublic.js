import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function SPBPublic() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nama_peminta: "", unit_kerja: "", keperluan: "" });
  const [lines, setLines] = useState([{ item_id: "", jumlah: 1, keperluan: "" }]);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    // Try to load items without auth (public). Endpoint requires auth, so try and ignore failure.
    api.get("/items").then(r => setItems(r.data)).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.nama_peminta || !form.unit_kerja) return toast.error("Nama dan Unit Kerja wajib diisi");
    if (lines.some(l => !l.item_id || !l.jumlah)) return toast.error("Lengkapi daftar barang");
    try {
      const { data } = await api.post("/spb", {
        ...form,
        lines: lines.map(l => ({ item_id: l.item_id, jumlah: Number(l.jumlah), keperluan: l.keperluan })),
      });
      setSubmitted(data);
      toast.success("Permintaan terkirim");
    } catch (e) { toast.error("Gagal mengirim permintaan"); }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-lg w-full text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-600" />
          <h2 className="font-display text-2xl mt-4">Permintaan Terkirim</h2>
          <p className="text-slate-500 mt-2">Nomor SPB Anda:</p>
          <div className="font-mono-data text-xl my-3 px-4 py-3 bg-slate-50 rounded inline-block">{submitted.nomor}</div>
          <p className="text-sm text-slate-500 mt-4">Permintaan akan diproses oleh pejabat verifikator. Mohon tunggu konfirmasi.</p>
          <Button data-testid="spb-public-new" onClick={() => { setSubmitted(null); setForm({ nama_peminta: "", unit_kerja: "", keperluan: "" }); setLines([{ item_id: "", jumlah: 1, keperluan: "" }]); }} className="mt-6 bg-[#1E3A8A]">Buat Permintaan Baru</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo-bpom.png" alt="BPOM" className="w-10 h-10 object-contain" />
          <div>
            <div className="font-display font-bold text-slate-900">BALAI POM DI JEMBER</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Formulir Permintaan Barang (SPB)</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Nama Peminta *</Label><Input data-testid="spb-nama" value={form.nama_peminta} onChange={(e) => setForm({ ...form, nama_peminta: e.target.value })} /></div>
            <div><Label>Unit Kerja *</Label><Input data-testid="spb-unit" value={form.unit_kerja} onChange={(e) => setForm({ ...form, unit_kerja: e.target.value })} /></div>
          </div>
          <div className="mt-3"><Label>Keperluan Umum</Label><Textarea value={form.keperluan} onChange={(e) => setForm({ ...form, keperluan: e.target.value })} rows={2} /></div>

          <div className="mt-5">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Daftar Barang yang Diminta</div>
            {items.length === 0 && <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-3 mb-3">Akses ke daftar barang memerlukan koneksi terotentikasi. Hubungi admin gudang jika daftar kosong.</div>}
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select value={l.item_id} onChange={(e) => { const c = [...lines]; c[idx].item_id = e.target.value; setLines(c); }} className="col-span-12 sm:col-span-6 h-10 px-3 border border-slate-200 rounded-md text-sm bg-white">
                    <option value="">-- Pilih barang --</option>
                    {items.map(it => <option key={it.id} value={it.id}>{it.kode} · {it.nama} ({it.satuan})</option>)}
                  </select>
                  <Input type="number" min="1" placeholder="Jumlah" className="col-span-4 sm:col-span-2" value={l.jumlah} onChange={(e) => { const c = [...lines]; c[idx].jumlah = e.target.value; setLines(c); }} />
                  <Input placeholder="Keperluan baris" className="col-span-7 sm:col-span-3" value={l.keperluan} onChange={(e) => { const c = [...lines]; c[idx].keperluan = e.target.value; setLines(c); }} />
                  <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="col-span-1 grid place-items-center text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines([...lines, { item_id: "", jumlah: 1, keperluan: "" }])} className="mt-3 text-sm text-[#1E3A8A] flex items-center gap-1 hover:underline"><Plus className="w-4 h-4" /> Tambah Barang</button>
          </div>

          <Button data-testid="spb-public-submit" onClick={submit} className="w-full mt-6 h-12 bg-[#1E3A8A] hover:bg-[#1E2A6B]">Kirim Permintaan</Button>
        </div>
        <div className="text-center mt-4 text-xs text-slate-500">© Badan POM Jember</div>
      </div>
    </div>
  );
}
