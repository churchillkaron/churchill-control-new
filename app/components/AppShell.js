"use client";

import Link from "next/link";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-black text-white">

      {/* NAVBAR */}
      <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur bg-black/40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex gap-6 items-center">

          <Link href="/dashboard" className="text-orange-500 font-semibold">
            CC
          </Link>

          <Link href="/dashboard">Dashboard</Link>
          <Link href="/pos">POS</Link>
          <Link href="/control-final">Control</Link>
          <Link href="/marketing">Marketing</Link>

        </div>
      </div>

      {/* PAGE CONTENT */}
      <main className="pt-20">
        {children}
      </main>

    </div>
  );
}