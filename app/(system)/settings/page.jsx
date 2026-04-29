"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[url('/bg-hero-control.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/70 backdrop-blur-sm">
        <div className="pt-20 px-6 max-w-6xl mx-auto text-white">
          <h1 className="text-3xl font-semibold mb-8">Settings</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* USERS */}
            <Link
              href="/settings/users"
              className="block bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 hover:border-[#ff7a00] transition"
            >
              <h2 className="text-lg text-[#ff7a00] mb-2">Users</h2>
              <p className="text-white/60 text-sm">
                Manage staff, roles and permissions
              </p>
            </Link>

            {/* BUSINESS */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 opacity-50">
              <h2 className="text-lg text-white/50 mb-2">Business</h2>
              <p className="text-white/40 text-sm">Coming soon</p>
            </div>

            {/* ACCOUNTING */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 opacity-50">
              <h2 className="text-lg text-white/50 mb-2">Accounting</h2>
              <p className="text-white/40 text-sm">Coming soon</p>
            </div>

            {/* SYSTEM */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 opacity-50">
              <h2 className="text-lg text-white/50 mb-2">System</h2>
              <p className="text-white/40 text-sm">Coming soon</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}