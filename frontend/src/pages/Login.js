import React from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";

export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left: brand panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-[#1E3A8A] text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1672552226380-486fe900b322?crop=entropy&cs=srgb&fm=jpg&q=80)", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src="/logo-bpom.png" alt="BPOM" className="w-10 h-10 object-contain bg-white rounded p-1" />
            <div className="font-display font-bold tracking-wide">BALAI POM DI JEMBER</div>
          </div>
          <div className="mt-12">
            <div className="text-xs uppercase tracking-[0.25em] text-blue-200">Sistem Internal</div>
            <h1 className="font-display text-4xl xl:text-5xl mt-2 leading-tight">Inventory & Aset Management</h1>
            <p className="mt-4 text-blue-100 max-w-md">Pencatatan persediaan, permintaan barang digital, dan manajemen aset BMN dengan dukungan QR Code dan tanda tangan digital.</p>
          </div>
        </div>
        <div className="relative z-10 text-xs text-blue-200">© {new Date().getFullYear()} Badan POM Jember · SPIP / PIPK Compliant</div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" /> Akses Terbatas
          </div>
          <h2 className="font-display text-3xl mt-3">Masuk ke sistem</h2>
          <p className="text-slate-500 mt-2 text-sm">Gunakan akun Google instansi Anda untuk masuk. Hak akses Anda akan ditetapkan oleh Administrator.</p>
          <Button
            data-testid="login-google-button"
            onClick={handleLogin}
            className="w-full mt-8 h-12 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white text-base"
          >
            Lanjutkan dengan Google
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <div className="mt-6 pt-6 border-t border-slate-200 text-xs text-slate-500">
            Pegawai yang hanya ingin meminta barang dapat menggunakan{" "}
            <a href="/spb-public" className="text-[#1E3A8A] font-medium underline">Formulir Permintaan Publik</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
