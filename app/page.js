"use client";

import { useState } from "react";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white">

      {/* 🔥 HERO BACKGROUND (OVERRIDES GLOBAL) */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/70" />

      {/* CONTENT */}
      <div className="relative z-10 text-center space-y-6">
        <h1 className="text-5xl font-semibold">
          Churchill Control System
        </h1>

        <button
          onClick={() => setShowLogin(true)}
          className="bg-[#ff7a00] px-8 py-3 rounded-xl text-black"
        >
          Access System
        </button>
      </div>

    </div>
  );
}