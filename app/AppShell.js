"use client";

import Navbar from "./Navbar";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen">

      {/* NAVBAR */}
      <Navbar />

      {/* CONTENT */}
      <main className="pt-24 px-6 max-w-7xl mx-auto">
        {children}
      </main>

    </div>
  );
}