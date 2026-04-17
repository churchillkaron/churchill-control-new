"use client";

import Navbar from "./Navbar";

export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen bg-[#0d0a07] text-white">

      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />
      </div>

      {/* NAVBAR */}
      <Navbar />

      {/* CONTENT */}
      <div className="relative z-10 pt-24 px-6 max-w-7xl mx-auto">
        {children}
      </div>

    </div>
  );
}