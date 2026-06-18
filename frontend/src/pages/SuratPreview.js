import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Printer, ArrowLeft, Settings as SettingsIcon, RefreshCw, Bug, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function SuratPreview() {
  const { type, id } = useParams();
  const [status, setStatus] = useState("loading"); // loading | ready | no-template | error
  const [errorMsg, setErrorMsg] = useState("");
  const [html, setHtml] = useState("");
  const [vars, setVars] = useState(null);
  const [showVars, setShowVars] = useState(false);
  const iframeRef = useRef(null);

  const load = async () => {
    setStatus("loading");
    try {
      // Always load the variable data for this transaction
      const dataResp = await api.get(`/surat/data/${type}/${id}`);
      setVars(dataResp.data);
      // Load rendered HTML from Google Doc
      const resp = await api.get(`/surat/render/${type}/${id}`, { responseType: "text" });
      setHtml(resp.data);
      setStatus("ready");
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.response?.data || e?.message || "Gagal memuat template";
      setErrorMsg(typeof detail === "string" ? detail : JSON.stringify(detail));
      setStatus(detail.toString().toLowerCase().includes("template") ? "no-template" : "error");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type, id]);

  useEffect(() => {
    if (status !== "ready") return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    setTimeout(() => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        // Inject CSS to make all blocks visually editable + cleaner table borders
        const editableCSS = `
          <style>
            @page { size: A4 portrait !important; margin: 15mm 12mm !important; }
            html, body { background: white !important; }
            body { padding: 24px !important; font-family: 'Times New Roman', serif !important; cursor: text;
                   width: 210mm !important; max-width: 210mm !important; min-height: 297mm !important;
                   margin: 0 auto !important; box-sizing: border-box !important; }
            [contenteditable="true"]:focus, [contenteditable="true"]:hover { background: #FEF3C7; outline: 1px dashed #1E3A8A; }
            table { border-collapse: collapse; }
            td, th { border: 1px solid #000; }
            @media print {
              body { padding: 0 !important; width: 186mm !important; max-width: 186mm !important; }
              [contenteditable="true"]:focus, [contenteditable="true"]:hover { background: transparent; outline: none; }
            }
          </style>
        `;
        // Insert CSS before closing head
        let modifiedHtml = html;
        if (/<\/head>/i.test(modifiedHtml)) {
          modifiedHtml = modifiedHtml.replace(/<\/head>/i, editableCSS + "</head>");
        } else {
          modifiedHtml = editableCSS + modifiedHtml;
        }
        doc.write(modifiedHtml);
        doc.close();
        // Make body contentEditable so user can directly edit
        if (doc.body) {
          doc.body.setAttribute("contenteditable", "true");
          doc.body.setAttribute("spellcheck", "false");
        }
      } catch {}
    }, 30);
  }, [html, status]);

  const printIframe = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch { toast.error("Gagal cetak"); }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="no-print flex items-center justify-between mb-4 gap-3 flex-wrap">
          <button onClick={() => window.history.back()} className="flex items-center gap-1 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <div className="flex gap-2 items-center">
            <Link to="/settings" className="text-sm text-[#1E3A8A] flex items-center gap-1 hover:underline">
              <SettingsIcon className="w-4 h-4" /> Atur Template
            </Link>
            <Button variant="outline" size="sm" onClick={() => setShowVars(v => !v)}><Bug className="w-4 h-4 mr-1" />{showVars ? "Sembunyikan" : "Lihat"} Variabel</Button>
            <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Muat Ulang</Button>
            <Button data-testid="surat-print" onClick={printIframe} disabled={status !== "ready"} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
              <Printer className="w-4 h-4 mr-1" />Cetak PDF
            </Button>
          </div>
        </div>

        {showVars && vars && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 mb-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Variabel aktif untuk transaksi ini</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {Object.entries(vars.context).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(`{{${k}}}`); toast.success("Disalin"); }} className="font-mono-data text-xs bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                    {`{{${k}}}`} <Copy className="w-3 h-3" />
                  </button>
                  <span className="text-slate-700 truncate">= {v?.toString?.() || <em className="text-slate-400">(kosong)</em>}</span>
                </div>
              ))}
            </div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mt-5 mb-2">Baris Tabel (akan disisipkan untuk tiap item)</div>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead className="text-left text-slate-500">
                  <tr>{Object.keys(vars.rows[0] || {}).map(k => <th key={k} className="pr-3 pb-1 font-mono-data">row.{k}</th>)}</tr>
                </thead>
                <tbody>
                  {vars.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {Object.values(r).map((v, j) => <td key={j} className="pr-3 py-1">{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {status === "loading" && (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">Memuat template dari Google Docs...</div>
        )}

        {status === "no-template" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-8">
            <h3 className="font-display text-xl text-amber-900">Template Google Docs belum diatur</h3>
            <p className="text-amber-900/80 mt-2 text-sm">{errorMsg}</p>
            <Link to="/settings"><Button className="mt-4 bg-[#1E3A8A]"><SettingsIcon className="w-4 h-4 mr-1" />Buka Pengaturan Template</Button></Link>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-8">
            <h3 className="font-display text-xl text-red-900">Gagal memuat surat</h3>
            <p className="text-red-900/80 mt-2 text-sm">{errorMsg}</p>
            <p className="text-xs text-red-900/70 mt-3">Pastikan Google Doc sudah di-share "Anyone with the link".</p>
          </div>
        )}

        {status === "ready" && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <iframe ref={iframeRef} title="Surat Preview" style={{ width: "100%", height: "1200px", border: 0, background: "white" }} />
          </div>
        )}
      </div>
    </div>
  );
}
