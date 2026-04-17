"use client";

import dynamic from "next/dynamic";

const Navbar = dynamic(() => import("./Navbar"), {
  ssr: false,
});

export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen bg-[#0d0a07] text-white">
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,122,0,0.18),transparent_35%),linear-gradient(180deg,rgba(10,7,5,0.35)_0%,rgba(10,7,5,0.75)_55%,rgba(10,7,5,0.9)_100%)]" />
        <div className="absolute inset-0 shadow-[inset_0_0_220px_rgba(0,0,0,0.75)]" />
      </div>

      <div className="relative z-20">
        <Navbar />
      </div>

      <div className="relative z-10">
        <main className="mx-auto max-w-[1400px] px-6 pt-24 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}