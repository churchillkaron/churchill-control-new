"use client";

import Navbar from "./Navbar";

export default function AppShell({ children, className = "" }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">

      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.04]"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.16),transparent_32%),linear-gradient(180deg,rgba(8,6,5,0.5)_0%,rgba(8,6,5,0.8)_100%)]" />

        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* NAVBAR (THIS WAS MISSING) */}
      <Navbar />

      {/* CONTENT */}
      <div className="relative z-10 min-h-screen">
        <main className="max-w-7xl mx-auto px-6 pt-24 pb-10">
          {children}
        </main>
      </div>

    </div>
  );
}