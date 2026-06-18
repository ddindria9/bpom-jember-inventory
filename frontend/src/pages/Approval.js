import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function Approval() {
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(null);
  const [paraf, setParaf] = useState("");
  const [alasan, setAlasan] = useState("");

  const load = async () => {
    const [s, i] = await Promise.all([api.get("/spb", { params: { status: "PENDING" } }), api.get("/items")]);
    setPending(s.data); setItems(i.data);
  };
  useEffect(() => { load(); }, []);

  const nameOf = (id) => items.find(x => x.id === id)?.nama || id;

  const act = async (action) => {
    if (!selected) return;
    if (action === "APPROVE" && !paraf) return toast.error("Isi paraf/tanda tangan digital");
    if (action === "REJECT" && !alasan) return toast.error("Isi alasan penolakan");
    try {
      await api.post(`/spb/${selected.id}/action`, { action, paraf, alasan });
      toast.success(action === "APPROVE" ? "Disetujui & SBBK dibuat" : "Permintaan ditolak");
      setSelected(null); setParaf(""); setAlasan(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 5</div>
        <h1 className="font-display text-3xl mt-1">Approval / Verifikasi</h1>
        <div className="text-sm text-slate-500 mt-1">{pending.length} permintaan menunggu persetujuan</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pending.map((s) => (
          <div key={s.id} data-testid={`approval-card-${s.nomor}`} className="bg-white border border-slate-200 rounded-lg p-5 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center justify-between">
              <div className="font-mono-data text-sm">{s.nomor}</div>
              <span className="text-xs text-slate-500">{fmtDate(s.created_at)}</span>
            </div>
            <div className="mt-3">
              <div className="font-display text-lg">{s.nama_peminta}</div>
              <div className="text-sm text-slate-500">{s.unit_kerja}</div>
              {s.keperluan && <div className="text-sm mt-2 text-slate-700">Keperluan: {s.keperluan}</div>}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
              {s.lines.map((l, i) => (
                <div key={i} className="text-sm flex justify-between">
                  <span>{nameOf(l.item_id)}</span>
                  <span className="font-semibold">{l.jumlah}</span>
                </div>
              ))}
            </div>
            <Button data-testid={`approval-open-${s.nomor}`} onClick={() => setSelected(s)} className="w-full mt-4 bg-[#1E3A8A] hover:bg-[#1E2A6B]">Tinjau</Button>
          </div>
        ))}
        {pending.length === 0 && <div className="lg:col-span-2 text-center text-slate-400 py-12 bg-white border border-slate-200 rounded-lg">Tidak ada permintaan menunggu.</div>}
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verifikasi {selected?.nomor}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="text-sm"><span className="text-slate-500">Peminta:</span> {selected.nama_peminta} · {selected.unit_kerja}</div>
              <div className="bg-slate-50 rounded p-3 text-sm space-y-1">
                {selected.lines.map((l, i) => <div key={i} className="flex justify-between"><span>{nameOf(l.item_id)}</span><span>{l.jumlah}</span></div>)}
              </div>
              <div>
                <Label>Paraf / Tanda Tangan Digital</Label>
                <Input data-testid="approval-paraf" value={paraf} onChange={(e) => setParaf(e.target.value)} placeholder="Inisial / nama lengkap..." />
              </div>
              <div>
                <Label>Alasan (jika menolak)</Label>
                <Textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button data-testid="approval-reject" variant="outline" onClick={() => act("REJECT")} className="border-red-300 text-red-700"><XCircle className="w-4 h-4 mr-1" />Tolak</Button>
            <Button data-testid="approval-approve" onClick={() => act("APPROVE")} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"><CheckCircle2 className="w-4 h-4 mr-1" />Setujui</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
