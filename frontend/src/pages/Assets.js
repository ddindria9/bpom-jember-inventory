import React, { useEffect, useState } from "react";
import { api, fmtIDR, BACKEND_URL } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Plus, Pencil, Trash2, QrCode, Printer } from "lucide-react";
import { toast } from "sonner";

const emptyAsset = { nup: "", nama: "", kategori: "", lokasi: "", tahun_perolehan: new Date().getFullYear(), harga: 0, kondisi: "BAIK", bast: "", foto_path: "" };
const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"];

export default function Assets() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyAsset);
  const [editId, setEditId] = useState(null);
  const [qrAsset, setQrAsset] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => { const { data } = await api.get("/assets"); setList(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const payload = { ...form, harga: Number(form.harga), tahun_perolehan: Number(form.tahun_perolehan) };
      if (editId) await api.patch(`/assets/${editId}`, payload);
      else await api.post("/assets", payload);
      toast.success("Tersimpan");
      setOpen(false); setForm(emptyAsset); setEditId(null); load();
    } catch (e) { toast.error("Gagal menyimpan"); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm(f => ({ ...f, foto_path: data.path }));
      toast.success("Foto diunggah");
    } catch { toast.error("Gagal unggah"); }
    finally { setUploading(false); }
  };

  const remove = async (a) => { if (!window.confirm(`Hapus ${a.nama}?`)) return; await api.delete(`/assets/${a.id}`); load(); };

  const printQR = (a) => {
    const inspectUrl = `${window.location.origin}/asset-inspect/${a.id}`;
    const qrSrc = `${BACKEND_URL}/api/assets/${a.id}/qr.png?frontend_url=${encodeURIComponent(window.location.origin)}`;
    const w = window.open("", "_blank", "width=400,height=600");
    w.document.write(`<html><head><title>QR ${a.nup}</title></head><body style="font-family:sans-serif;text-align:center;padding:20px;">
      <h3 style="margin:0;font-size:14px;">BADAN POM JEMBER</h3>
      <div style="font-size:11px;color:#555;">Label Aset BMN</div>
      <img src="${qrSrc}" style="width:240px;height:240px;margin:12px 0;" />
      <div style="font-weight:700;font-size:16px;">${a.nup}</div>
      <div style="font-size:12px;">${a.nama}</div>
      <div style="font-size:10px;color:#777;margin-top:6px;">Scan untuk cek kondisi</div>
      <script>setTimeout(()=>window.print(),500)</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 8</div>
          <h1 className="font-display text-3xl mt-1">Aset Tetap & QR Code</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(emptyAsset); setEditId(null); } }}>
          <DialogTrigger asChild><Button data-testid="asset-add" className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"><Plus className="w-4 h-4 mr-1" />Tambah Aset</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Edit" : "Tambah"} Aset</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NUP</Label><Input data-testid="asset-nup" value={form.nup} onChange={(e) => setForm({ ...form, nup: e.target.value })} /></div>
              <div><Label>Kondisi</Label>
                <select value={form.kondisi} onChange={(e) => setForm({ ...form, kondisi: e.target.value })} className="h-10 w-full px-3 border border-slate-200 rounded-md text-sm">
                  {KONDISI.map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Label>Nama Aset</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
              <div><Label>Kategori</Label><Input value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} /></div>
              <div><Label>Lokasi</Label><Input value={form.lokasi} onChange={(e) => setForm({ ...form, lokasi: e.target.value })} /></div>
              <div><Label>Tahun</Label><Input type="number" value={form.tahun_perolehan} onChange={(e) => setForm({ ...form, tahun_perolehan: e.target.value })} /></div>
              <div><Label>Harga Perolehan</Label><Input type="number" value={form.harga} onChange={(e) => setForm({ ...form, harga: e.target.value })} /></div>
              <div className="col-span-2"><Label>No. BAST</Label><Input value={form.bast} onChange={(e) => setForm({ ...form, bast: e.target.value })} /></div>
              <div className="col-span-2">
                <Label>Foto Aset</Label>
                <input data-testid="asset-foto" type="file" accept="image/*" onChange={upload} className="block w-full text-sm" />
                {uploading && <div className="text-xs text-slate-500 mt-1">Mengunggah...</div>}
                {form.foto_path && <div className="text-xs text-emerald-600 mt-1">✓ Foto siap: {form.foto_path.split("/").pop()}</div>}
              </div>
            </div>
            <DialogFooter><Button data-testid="asset-submit" onClick={submit} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">NUP</th>
                <th className="text-left">Nama</th>
                <th className="text-left">Kategori</th>
                <th className="text-left">Lokasi</th>
                <th className="text-right">Harga</th>
                <th className="text-left">Kondisi</th>
                <th className="text-right pr-4">QR</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono-data text-xs">{a.nup}</td>
                  <td>{a.nama}</td>
                  <td className="text-slate-500">{a.kategori}</td>
                  <td>{a.lokasi}</td>
                  <td className="text-right">{fmtIDR(a.harga)}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      a.kondisi === "BAIK" ? "bg-emerald-50 text-emerald-700" :
                      a.kondisi === "RUSAK_RINGAN" ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-700"}`}>{a.kondisi.replace("_", " ")}</span>
                  </td>
                  <td className="text-right pr-4 whitespace-nowrap">
                    <button onClick={() => setQrAsset(a)} className="p-1.5 hover:bg-slate-100 rounded" title="Lihat QR"><QrCode className="w-4 h-4 text-[#1E3A8A]" /></button>
                    <button onClick={() => printQR(a)} className="p-1.5 hover:bg-slate-100 rounded" title="Cetak Label QR"><Printer className="w-4 h-4 text-slate-600" /></button>
                    <button onClick={() => { setForm({ ...a }); setEditId(a.id); setOpen(true); }} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="w-4 h-4 text-slate-600" /></button>
                    <button onClick={() => remove(a)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-600" /></button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Belum ada aset.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!qrAsset} onOpenChange={(v) => !v && setQrAsset(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>QR Code · {qrAsset?.nup}</DialogTitle></DialogHeader>
          {qrAsset && (
            <div className="text-center">
              <img alt="QR" src={`${BACKEND_URL}/api/assets/${qrAsset.id}/qr.png?frontend_url=${encodeURIComponent(window.location.origin)}`} className="mx-auto w-64 h-64" />
              <div className="mt-3 font-semibold">{qrAsset.nama}</div>
              <div className="text-xs text-slate-500 break-all mt-2">{window.location.origin}/asset-inspect/{qrAsset.id}</div>
              <Button onClick={() => printQR(qrAsset)} className="mt-4 bg-[#1E3A8A]"><Printer className="w-4 h-4 mr-1" />Cetak Label</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
