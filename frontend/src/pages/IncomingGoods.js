import React, { useEffect, useState } from "react";
import { api, fmtIDR, fmtDate } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function IncomingGoods() {
  const [items, setItems] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ tanggal: new Date().toISOString().slice(0, 10), no_faktur: "", supplier: "", catatan: "" });
  const [lines, setLines] = useState([{ item_id: "", jumlah: 1, harga_beli: 0 }]);

  const load = async () => {
    const [i, l] = await Promise.all([api.get("/items"), api.get("/incoming")]);
    setItems(i.data); setList(l.data);
  };
  useEffect(() => { load(); }, []);

  const total = lines.reduce((s, l) => s + (Number(l.jumlah) || 0) * (Number(l.harga_beli) || 0), 0);

  const submit = async () => {
    if (!form.no_faktur) return toast.error("Nomor faktur wajib diisi");
    if (lines.some(l => !l.item_id || !l.jumlah)) return toast.error("Lengkapi baris barang");
    try {
      await api.post("/incoming", {
        ...form,
        lines: lines.map(l => ({ item_id: l.item_id, jumlah: Number(l.jumlah), harga_beli: Number(l.harga_beli) })),
      });
      toast.success("Barang masuk dicatat, stok diperbarui");
      setForm({ tanggal: new Date().toISOString().slice(0, 10), no_faktur: "", supplier: "", catatan: "" });
      setLines([{ item_id: "", jumlah: 1, harga_beli: 0 }]);
      load();
    } catch (e) { toast.error("Gagal menyimpan"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 3</div>
        <h1 className="font-display text-3xl mt-1">Transaksi Barang Masuk</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><Label>Tanggal</Label><Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></div>
          <div><Label>No. Faktur/BAST</Label><Input data-testid="incoming-faktur" value={form.no_faktur} onChange={(e) => setForm({ ...form, no_faktur: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Daftar Barang</div>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <select data-testid={`incoming-item-${idx}`} value={l.item_id} onChange={(e) => { const c = [...lines]; c[idx].item_id = e.target.value; setLines(c); }} className="col-span-6 h-10 px-3 border border-slate-200 rounded-md text-sm bg-white">
                  <option value="">-- Pilih barang --</option>
                  {items.map(it => <option key={it.id} value={it.id}>{it.kode} · {it.nama}</option>)}
                </select>
                <Input type="number" min="1" placeholder="Jumlah" className="col-span-2" value={l.jumlah} onChange={(e) => { const c = [...lines]; c[idx].jumlah = e.target.value; setLines(c); }} />
                <Input type="number" placeholder="Harga Beli" className="col-span-3" value={l.harga_beli} onChange={(e) => { const c = [...lines]; c[idx].harga_beli = e.target.value; setLines(c); }} />
                <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="col-span-1 grid place-items-center text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setLines([...lines, { item_id: "", jumlah: 1, harga_beli: 0 }])} className="mt-3 text-sm text-[#1E3A8A] flex items-center gap-1 hover:underline"><Plus className="w-4 h-4" /> Tambah Baris</button>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-sm">Total: <span className="font-display text-2xl">{fmtIDR(total)}</span></div>
          <Button data-testid="incoming-submit" onClick={submit} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">Simpan Transaksi</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 font-display">Riwayat Pembelian</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
              <tr><th className="text-left px-4 py-3">Tanggal</th><th className="text-left">No. Faktur</th><th className="text-left">Supplier</th><th className="text-right">Jumlah Item</th><th className="text-right pr-4">Total Nilai</th></tr>
            </thead>
            <tbody>
              {list.map((doc) => (
                <tr key={doc.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{fmtDate(doc.tanggal)}</td>
                  <td className="font-mono-data text-xs">{doc.no_faktur}</td>
                  <td>{doc.supplier || "-"}</td>
                  <td className="text-right">{doc.lines?.length || 0}</td>
                  <td className="text-right pr-4 font-semibold">{fmtIDR(doc.total_nilai)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Belum ada riwayat.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
