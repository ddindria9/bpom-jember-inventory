import React, { useEffect, useState } from "react";
import { api, fmtDate, fmtIDR } from "../lib/api";

export default function StockCard() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/items").then(r => setItems(r.data)); }, []);
  useEffect(() => {
    if (!selected) { setData(null); return; }
    api.get(`/items/${selected}/stock-card`).then(r => setData(r.data));
  }, [selected]);

  let running = 0;
  const rows = (data?.movements || []).map(m => {
    if (m.tipe === "MASUK") running += m.jumlah; else running -= m.jumlah;
    return { ...m, sisa: running };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 7</div>
        <h1 className="font-display text-3xl mt-1">Kartu Stok</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <label className="text-sm text-slate-600">Pilih Barang</label>
        <select data-testid="stockcard-select" value={selected} onChange={(e) => setSelected(e.target.value)} className="block mt-1 h-10 w-full sm:w-96 px-3 border border-slate-200 rounded-md text-sm bg-white">
          <option value="">-- Pilih --</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.kode} · {i.nama}</option>)}
        </select>
      </div>

      {data && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-display text-lg">{data.item.nama}</div>
              <div className="text-xs text-slate-500 font-mono-data">{data.item.kode}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase">Stok Saat Ini</div>
              <div className="font-display text-2xl">{data.item.stok} {data.item.satuan}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3">Tanggal</th>
                  <th className="text-left">Referensi</th>
                  <th className="text-right">Masuk</th>
                  <th className="text-right">Keluar</th>
                  <th className="text-right pr-4">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{fmtDate(r.tanggal)}</td>
                    <td className="font-mono-data text-xs">{r.ref}</td>
                    <td className="text-right text-emerald-600 font-semibold">{r.tipe === "MASUK" ? r.jumlah : "-"}</td>
                    <td className="text-right text-red-600 font-semibold">{r.tipe === "KELUAR" ? r.jumlah : "-"}</td>
                    <td className="text-right pr-4 font-semibold">{r.sisa}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Belum ada pergerakan.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
