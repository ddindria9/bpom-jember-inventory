import React, { useEffect, useState } from "react";
import { api, fmtIDR, NAMA_BULAN_ID } from "../lib/api";
import { Button } from "../components/ui/button";
import { Printer } from "lucide-react";

export default function Reports() {
  const [mode, setMode] = useState("kondisi"); // kondisi | opname
  const [assets, setAssets] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/reports/asset-condition").then(r => setAssets(r.data));
    api.get("/reports/stock-opname").then(r => setItems(r.data));
  }, []);

  const today = new Date();
  const tglIndo = `${today.getDate()} ${NAMA_BULAN_ID[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div className="space-y-6">
      <div className="no-print flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 10</div>
          <h1 className="font-display text-3xl mt-1">Laporan & Analitik</h1>
        </div>
        <div className="flex gap-2">
          <Button data-testid="report-kondisi" variant={mode === "kondisi" ? "default" : "outline"} onClick={() => setMode("kondisi")} className={mode === "kondisi" ? "bg-[#1E3A8A]" : ""}>Laporan Kondisi Aset</Button>
          <Button data-testid="report-opname" variant={mode === "opname" ? "default" : "outline"} onClick={() => setMode("opname")} className={mode === "opname" ? "bg-[#1E3A8A]" : ""}>BA Stok Opname</Button>
          <Button onClick={() => window.print()} className="bg-slate-900 hover:bg-slate-800"><Printer className="w-4 h-4 mr-1" />Cetak</Button>
        </div>
      </div>

      <div className="print-area bg-white border border-slate-200 rounded-lg p-8">
        <div className="kop-surat flex items-center gap-5 pb-3">
          <img src="/logo-bpom.png" alt="BPOM" className="w-20 h-20 object-contain" />
          <div className="flex-1 text-center">
            <div className="text-sm font-semibold">BADAN PENGAWAS OBAT DAN MAKANAN</div>
            <div className="text-base font-bold">BALAI POM DI JEMBER</div>
            <div className="text-[11px] mt-1">Jl. Letjend Sutoyo No. 50 Jember Telp. (0331) 422988</div>
            <div className="text-[11px]">e-mail: balaipom_jember@pom.go.id, Website: www.pom.go.id</div>
          </div>
        </div>

        {mode === "kondisi" ? (
          <>
            <div className="text-center mt-6">
              <div className="font-display text-xl font-bold underline">LAPORAN KONDISI BARANG MILIK NEGARA</div>
              <div className="text-sm">Per tanggal {tglIndo}</div>
            </div>
            <table className="w-full mt-6 text-sm border-collapse">
              <thead>
                <tr className="border-y-2 border-black">
                  <th className="py-2 px-2 text-left w-12">No</th>
                  <th className="py-2 px-2 text-left">NUP</th>
                  <th className="py-2 px-2 text-left">Nama BMN</th>
                  <th className="py-2 px-2 text-left">Lokasi</th>
                  <th className="py-2 px-2 text-right">Harga</th>
                  <th className="py-2 px-2 text-center">Kondisi</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => (
                  <tr key={a.id} className="border-b border-slate-300">
                    <td className="py-2 px-2">{i + 1}</td>
                    <td className="py-2 px-2 font-mono-data text-xs">{a.nup}</td>
                    <td className="py-2 px-2">{a.nama}</td>
                    <td className="py-2 px-2">{a.lokasi}</td>
                    <td className="py-2 px-2 text-right">{fmtIDR(a.harga)}</td>
                    <td className="py-2 px-2 text-center">{a.kondisi.replace("_", " ")}</td>
                  </tr>
                ))}
                {assets.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Tidak ada data.</td></tr>}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="text-center mt-6">
              <div className="font-display text-xl font-bold underline">BERITA ACARA STOK OPNAME</div>
              <div className="text-sm">Per tanggal {tglIndo}</div>
            </div>
            <p className="mt-4 text-sm">Telah dilakukan pemeriksaan fisik atas persediaan barang sebagai berikut:</p>
            <table className="w-full mt-4 text-sm border-collapse">
              <thead>
                <tr className="border-y-2 border-black">
                  <th className="py-2 px-2 text-left w-12">No</th>
                  <th className="py-2 px-2 text-left">Kode</th>
                  <th className="py-2 px-2 text-left">Nama Barang</th>
                  <th className="py-2 px-2 text-right">Stok Sistem</th>
                  <th className="py-2 px-2 text-right">Stok Fisik</th>
                  <th className="py-2 px-2 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-slate-300">
                    <td className="py-2 px-2">{i + 1}</td>
                    <td className="py-2 px-2 font-mono-data text-xs">{it.kode}</td>
                    <td className="py-2 px-2">{it.nama}</td>
                    <td className="py-2 px-2 text-right">{it.stok}</td>
                    <td className="py-2 px-2 text-right">_____</td>
                    <td className="py-2 px-2 text-right">_____</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Tidak ada data.</td></tr>}
              </tbody>
            </table>
          </>
        )}

        <div className="grid grid-cols-2 gap-12 mt-12 text-sm">
          <div>
            <div>Pengelola Gudang,</div>
            <div className="h-20"></div>
            <div className="border-t border-black pt-1 font-semibold">_____________________</div>
            <div className="text-xs">NIP. _______________________</div>
          </div>
          <div className="text-right">
            <div>Mengetahui,</div>
            <div className="h-20"></div>
            <div className="border-t border-black pt-1 font-semibold">_____________________</div>
            <div className="text-xs">NIP. _______________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}
