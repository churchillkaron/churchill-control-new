"use client";

import { useEffect, useState } from "react";
import Navbar from "./Navbar";

export default function AppShell({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <main className="pt-20 px-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}