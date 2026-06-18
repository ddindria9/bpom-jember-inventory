import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

const ROLES = [
  { v: "admin", label: "Administrator", color: "bg-purple-100 text-purple-700" },
  { v: "admin_gudang", label: "Admin Gudang", color: "bg-blue-100 text-blue-700" },
  { v: "approver", label: "Approver / Pejabat", color: "bg-emerald-100 text-emerald-700" },
  { v: "pengelola_aset", label: "Pengelola Aset", color: "bg-amber-100 text-amber-700" },
  { v: "peminta", label: "Peminta (Pegawai)", color: "bg-slate-100 text-slate-700" },
];

export default function Users() {
  const { user: me } = useAuth();
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try { const { data } = await api.get("/users"); setList(data); }
    catch (e) { setErr(e?.response?.data?.detail || "Tidak dapat memuat data pengguna"); }
  };
  useEffect(() => { load(); }, []);

  const updateRole = async (u, role) => {
    try { await api.patch(`/users/${u.user_id}`, { role }); toast.success(`Peran ${u.name} diubah`); load(); }
    catch { toast.error("Gagal mengubah peran"); }
  };
  const updateUnit = async (u, unit_kerja) => {
    try { await api.patch(`/users/${u.user_id}`, { unit_kerja }); }
    catch {}
  };
  const remove = async (u) => {
    if (!window.confirm(`Hapus ${u.name}?`)) return;
    try { await api.delete(`/users/${u.user_id}`); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus"); }
  };

  if (err) return (
    <div className="bg-amber-50 border border-amber-200 rounded p-4 text-amber-800 text-sm">
      {err} - Hanya Administrator yang dapat mengelola pengguna.
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modul 11</div>
        <h1 className="font-display text-3xl mt-1">Manajemen Pengguna</h1>
        <div className="text-sm text-slate-500 mt-1">Atur hak akses sesuai pemisahan tugas SPIP / PIPK.</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Nama</th>
                <th className="text-left">Email</th>
                <th className="text-left">Unit Kerja</th>
                <th className="text-left">Peran</th>
                <th className="text-left">Sejak</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{u.name}{u.user_id === me?.user_id && <span className="ml-2 text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">Anda</span>}</td>
                  <td className="text-slate-500">{u.email}</td>
                  <td><Input defaultValue={u.unit_kerja || ""} onBlur={(e) => updateUnit(u, e.target.value)} className="h-8 text-xs" /></td>
                  <td>
                    <select data-testid={`user-role-${u.email}`} value={u.role} onChange={(e) => updateRole(u, e.target.value)} className="h-8 px-2 border border-slate-200 rounded text-xs">
                      {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="text-slate-500 text-xs">{fmtDate(u.created_at)}</td>
                  <td className="pr-4 text-right">
                    {u.user_id !== me?.user_id && <button onClick={() => remove(u)} className="text-red-600 text-xs hover:underline">Hapus</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
