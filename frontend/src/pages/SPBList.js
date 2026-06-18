import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { Link } from "react-router-dom";
import { Copy, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";

export default function SPBList() {
  const [list, setList] = useState([]);
  const load = async () => { const { data } = await api.get("/spb"); setList(data); };
  useEffect(() => { load(); }, []);

  const publicUrl = `${window.location.origin}/spb-public`;
  const copyLink = () => { navigator.clipboard.writeText(publicUrl); toast.success("Tautan formulir disalin"); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 4</div>
          <h1 className="font-display text-3xl mt-1">Permintaan Barang (SPB)</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
          <div className="text-xs text-slate-500">Tautan formulir publik:</div>
          <code className="text-xs font-mono-data bg-slate-50 px-2 py-1 rounded">{publicUrl}</code>
          <Button size="sm" variant="outline" onClick={copyLink}><Copy className="w-4 h-4 mr-1" />Salin</Button>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[#1E3A8A]"><ExternalLink className="w-4 h-4" /></a>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3">Nomor SPB</th>
                <th className="text-left">Tanggal</th>
                <th className="text-left">Peminta</th>
                <th className="text-left">Unit Kerja</th>
                <th className="text-right">Item</th>
                <th className="text-left">Status</th>
                <th className="text-right pr-4">Surat</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono-data text-xs">{d.nomor}</td>
                  <td>{fmtDate(d.created_at)}</td>
                  <td>{d.nama_peminta}</td>
                  <td>{d.unit_kerja}</td>
                  <td className="text-right">{d.lines?.length}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      d.status === "PENDING" ? "bg-amber-50 text-amber-700" :
                      d.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" :
                      "bg-red-50 text-red-700"}`}>{d.status}</span>
                  </td>
                  <td className="text-right pr-4">
                    <Link to={`/surat/spb/${d.id}`} className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"><FileText className="w-4 h-4" /> SPB</Link>
                    {d.status === "APPROVED" && d.sbbk_nomor && (
                      <Link to={`/surat/sbbk/${d.id}`} className="ml-3 inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"><FileText className="w-4 h-4" /> SBBK</Link>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Belum ada permintaan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
