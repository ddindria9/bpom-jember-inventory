import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Save, ExternalLink, Copy, Info } from "lucide-react";
import { toast } from "sonner";

const PLACEHOLDERS = [
  { k: "{{nomor}}", d: "Nomor surat (SPB atau SBBK sesuai konteks)" },
  { k: "{{unit_kerja}}", d: "Unit kerja peminta" },
  { k: "{{tanggal_permintaan}}", d: "Tanggal pengajuan SPB (format: 18 Juni 2026)" },
  { k: "{{tanggal_spb}}", d: "Alias dari tanggal_permintaan (untuk SBBK)" },
  { k: "{{place_date}}", d: "Tempat + tanggal saat ini (Jember, 18 Juni 2026)" },
  { k: "{{nama_peminta}}", d: "Nama orang yang meminta" },
  { k: "{{keperluan}}", d: "Keperluan utama SPB" },
  { k: "{{approver_name}}", d: "Nama pejabat yang menyetujui" },
  { k: "{{approver_paraf}}", d: "Paraf pejabat" },
];

const ROW_PLACEHOLDERS = [
  { k: "{{row.no}}", d: "Nomor urut (1, 2, 3 ...)" },
  { k: "{{row.nama}}", d: "Nama barang" },
  { k: "{{row.satuan}}", d: "Satuan barang" },
  { k: "{{row.jumlah}}", d: "Jumlah" },
  { k: "{{row.permintaan}}", d: "Jumlah permintaan (SPB)" },
  { k: "{{row.disetujui}}", d: "Jumlah disetujui (SPB)" },
  { k: "{{row.keperluan}}", d: "Keperluan per item (SPB)" },
  { k: "{{row.keterangan}}", d: "Keterangan per item (SBBK)" },
];

function CopyableCode({ children }) {
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(children); toast.success("Disalin"); }}
      className="font-mono-data text-xs bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded inline-flex items-center gap-1"
    >
      {children} <Copy className="w-3 h-3" />
    </button>
  );
}

export default function Settings() {
  const [spbId, setSpbId] = useState("");
  const [sbbkId, setSbbkId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/settings");
        setSpbId(data.spb_template_doc_id || "");
        setSbbkId(data.sbbk_template_doc_id || "");
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    try {
      await api.put("/settings", { spb_template_doc_id: spbId, sbbk_template_doc_id: sbbkId });
      toast.success("Pengaturan tersimpan");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal menyimpan"); }
  };

  const gdocUrl = (id) => id ? (id.startsWith("http") ? id : `https://docs.google.com/document/d/${id}/edit`) : "";

  if (loading) return <div className="text-slate-500">Memuat...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Pengaturan</div>
        <h1 className="font-display text-3xl mt-1">Template Surat dari Google Docs</h1>
        <div className="text-sm text-slate-500 mt-1">
          Hubungkan template SPB dan SBBK dari Google Docs. Aplikasi akan otomatis mengganti placeholder dengan data dari sistem saat surat dicetak.
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-sm">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-amber-900">
          <div className="font-semibold mb-1">Wajib: dokumen harus dibagikan publik</div>
          Buka Google Doc Anda → klik <strong>Share / Bagikan</strong> → pada "General access" pilih <strong>"Anyone with the link" → "Viewer"</strong>.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div>
          <Label className="text-sm">Template SPB (Surat Permintaan Barang)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              data-testid="settings-spb-doc"
              value={spbId}
              onChange={(e) => setSpbId(e.target.value)}
              placeholder="Tempel URL Google Doc atau Doc ID..."
              className="flex-1"
            />
            {spbId && <a href={gdocUrl(spbId)} target="_blank" rel="noreferrer" className="px-3 h-10 grid place-items-center border border-slate-200 rounded text-[#1E3A8A] hover:bg-slate-50"><ExternalLink className="w-4 h-4" /></a>}
          </div>
        </div>
        <div>
          <Label className="text-sm">Template SBBK (Surat Bukti Barang Keluar)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              data-testid="settings-sbbk-doc"
              value={sbbkId}
              onChange={(e) => setSbbkId(e.target.value)}
              placeholder="Tempel URL Google Doc atau Doc ID..."
              className="flex-1"
            />
            {sbbkId && <a href={gdocUrl(sbbkId)} target="_blank" rel="noreferrer" className="px-3 h-10 grid place-items-center border border-slate-200 rounded text-[#1E3A8A] hover:bg-slate-50"><ExternalLink className="w-4 h-4" /></a>}
          </div>
        </div>
        <div className="pt-2 border-t border-slate-100">
          <Button data-testid="settings-save" onClick={save} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"><Save className="w-4 h-4 mr-1" />Simpan Template</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-display text-lg">Cara Pakai Placeholder</h3>
        <p className="text-sm text-slate-500 mt-1">
          Buka Google Doc Anda, lalu ketikkan placeholder berikut <strong>persis</strong> di tempat yang Anda inginkan (termasuk kurung kurawal ganda).
        </p>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Field Utama</div>
          <div className="space-y-1.5">
            {PLACEHOLDERS.map((p) => (
              <div key={p.k} className="flex items-start gap-3 text-sm">
                <CopyableCode>{p.k}</CopyableCode>
                <span className="text-slate-600">{p.d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Untuk Baris Tabel</div>
          <div className="text-xs text-slate-500 mb-2 bg-slate-50 p-2 rounded">
            Letakkan placeholder berikut di <strong>SATU baris</strong> tabel di template Anda (cukup 1 baris contoh). Aplikasi akan duplikasi baris ini untuk setiap barang.
          </div>
          <div className="space-y-1.5">
            {ROW_PLACEHOLDERS.map((p) => (
              <div key={p.k} className="flex items-start gap-3 text-sm">
                <CopyableCode>{p.k}</CopyableCode>
                <span className="text-slate-600">{p.d}</span>
              </div>
            ))}
          </div>
        </div>

        <details className="mt-6 group">
          <summary className="cursor-pointer text-sm font-medium text-[#1E3A8A]">Contoh isi sel template tabel SPB →</summary>
          <pre className="mt-2 bg-slate-50 border border-slate-200 rounded p-3 text-xs font-mono-data overflow-x-auto">
| No.       | Nama Barang   | Satuan      | Jumlah (Permintaan / Disetujui)            | Keperluan       |{"\n"}
| --------- | ------------- | ----------- | ------------------------------------------ | --------------- |{"\n"}
| {"{{row.no}}"} | {"{{row.nama}}"} | {"{{row.satuan}}"} | {"{{row.permintaan}}"} / {"{{row.disetujui}}"} | {"{{row.keperluan}}"} |
          </pre>
        </details>
      </div>
    </div>
  );
}
