"use client";

import Link from "next/link";

export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/bg-hero-control.jpg"
          alt="background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">

          <Link
            href="/dashboard"
            className="text-sm text-white/70 hover:text-white transition"
          >
            ← Dashboard
          </Link>

          <div className="text-sm text-white/40">
            Churchill Control
          </div>

        </div>

        {/* Page Content */}
        <div className="p-6 flex-1">
          {children}
        </div>

      </div>

    </div>
  );
}