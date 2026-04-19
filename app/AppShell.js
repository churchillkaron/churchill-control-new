"use client";

import Link from "next/link";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-black text-white">

      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">

        {/* Back to Dashboard */}
        <Link
          href="/dashboard"
          className="text-sm text-white/70 hover:text-white transition"
        >
          ← Dashboard
        </Link>

        {/* Optional title placeholder */}
        <div className="text-sm text-white/40">
          Churchill Control
        </div>

      </div>

      {/* Page Content */}
      <div className="p-6">
        {children}
      </div>

    </div>
  );
}