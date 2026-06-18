# PRD - BPOM Jember Inventory & Asset Management

## Problem Statement
Website lokal inventory sederhana untuk Loka POM Jember (Badan POM) dengan 11 modul: Dashboard, Data Master, Barang Masuk, SPB Digital (publik), Approval, Cetak Surat (SPB/SBBK), Kartu Stok, Aset & QR, Cek Fisik Mobile, Laporan PIPK, Manajemen Pengguna.

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React (CRA + Tailwind + Shadcn UI + Recharts)
- Auth: Emergent Google OAuth
- Storage: Emergent Object Storage (foto aset)
- PDF: HTML print (@media print) dengan kop surat

## User Personas / Roles (RBAC)
- `admin` - akses penuh (otomatis untuk user pertama login)
- `admin_gudang` - mengelola barang & transaksi masuk
- `approver` (pejabat struktural) - menyetujui SPB, tanda tangan digital
- `pengelola_aset` - mengelola aset tetap
- `peminta` (pegawai biasa) - submit permintaan via form publik

## Core Requirements (static)
- 11 modul fungsional sesuai spek
- Nomor surat otomatis format `NNNN/PSD/<roman-month>/<year>` (SPB) dan `NNNN/SBBK/<roman-month>/<year>`
- Mobile-friendly: form publik SPB dan halaman inspeksi aset via QR scan
- Print-ready: kop surat Loka POM Jember, kolom tanda tangan

## What's been implemented (2026-06-18)
- ✅ Backend lengkap (server.py, 632 lines) - 26/26 backend tests passed
- ✅ Auth Google + RBAC (5 role)
- ✅ Modul 1 Dashboard - 4 KPI + chart kondisi aset + tabel stok menipis + alert reagen
- ✅ Modul 2 Data Master - CRUD lengkap, search, flag reagen + expiry date
- ✅ Modul 3 Barang Masuk - multi-line form, auto-update stok & movements, riwayat
- ✅ Modul 4 SPB Publik - form tanpa login, auto nomor surat
- ✅ Modul 5 Approval - inbox, approve/reject + paraf digital
- ✅ Modul 6 Cetak Surat - SPB & SBBK dengan kop, print HTML→PDF
- ✅ Modul 7 Kartu Stok - history pergerakan dengan running sisa
- ✅ Modul 8 Aset & QR - CRUD + upload foto + generate QR + cetak label
- ✅ Modul 9 Mobile Inspect - mobile-first kondisi update via QR scan
- ✅ Modul 10 Laporan - Laporan Kondisi BMN + BA Stok Opname (printable)
- ✅ Modul 11 Users - admin atur peran user
- ✅ Seed data contoh (8 barang + 5 aset)

## Prioritized Backlog
### P1 (next)
- Atomic counter (`findOneAndUpdate $inc`) untuk nomor surat (hindari race condition)
- Validate `item_id` di POST /incoming sebelum log movement
- Gate /api/admin/seed strict ke role admin
- Bulk import Excel/CSV untuk data master
- Filter & pagination tabel item & aset

### P2
- Stock opname mode dengan input fisik & selisih otomatis
- Generate template Google Docs link (mail-merge field)
- Notifikasi email saat SPB perlu approval (SendGrid/Resend)
- Audit log per perubahan stok / kondisi aset
- Modular split server.py ke routers terpisah

### P3
- Dashboard chart historikal (trend bulanan)
- Export laporan ke Excel
- Multi-tenant (untuk Loka POM lain)

## Public Routes
- `/spb-public` - formulir permintaan barang (untuk pegawai biasa)
- `/asset-inspect/:id` - landing dari QR (cek fisik mobile)
- `/surat/spb/:id` & `/surat/sbbk/:id` - preview cetak

## Known Constraints
- Storage tanpa delete API (soft-delete by `is_deleted`)
- Mongo write tidak transactional di approval (risiko parsial on error)
