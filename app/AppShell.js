"use client";

import { useEffect, useState } from "react";
import Navbar from "./Navbar";

export default function AppShell({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    // ❌ ONLY redirect if REALLY missing
    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    // ✅ allow render AFTER check
    setReady(true);
  }, []);

  // 🧠 WAIT before rendering anything
  if (!ready) {
    return null;
  }

  return (
    <div className="min-h-screen">

      <Navbar />

      <main className="pt-24 px-6 max-w-7xl mx-auto">
        {children}
      </main>

    </div>
  );
}