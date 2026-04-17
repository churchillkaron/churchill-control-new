"use client";

import Navbar from "./Navbar";

export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">

      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.05]"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        {/* cinematic light */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,122,0,0.18),transparent_35%),linear-gradient(180deg,rgba(10,7,5,0.35)_0%,rgba(10,7,5,0.75)_55%,rgba(10,7,5,0.9)_100%)]" />

        {/* vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_220px_rgba(0,0,0,0.75)]" />
      </div>

      {/* NAVBAR */}
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* CONTENT LAYER */}
      <div className="relative z-10 min-h-screen">

        {/* subtle separation from navbar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />

        <main className="max-w-[1200px] mx-auto px-6 pt-28 pb-16">
          
          {/* FLOATING PLANE */}
          <div className="relative">
            
            {/* soft ambient glow */}
            <div className="absolute -inset-6 rounded-[40px] bg-white/[0.03] blur-2xl" />

            {/* main content wrapper */}
            <div className="relative space-y-14">
              {children}
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}