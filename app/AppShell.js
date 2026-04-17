"use client";

import Navbar from "./Navbar";

export default function AppShell({ children }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg-beach.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/62 to-black/78" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,140,60,0.10),transparent_35%)]" />

      <div className="relative z-10">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 pt-28 pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}