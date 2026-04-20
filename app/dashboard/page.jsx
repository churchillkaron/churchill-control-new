"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [best, setBest] = useState(null);
  const [weak, setWeak] = useState(null);

  useEffect(() => {
    const load = () => {
      setBest(localStorage.getItem("ai_best_item"));
      setWeak(localStorage.getItem("ai_weak_item"));
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-6 text-white">

        <h2>Menu Optimization</h2>

        <div className="p-4 border border-green-500 bg-green-500/10 rounded">
          Best Item: {best || "N/A"}
        </div>

        <div className="p-4 border border-red-500 bg-red-500/10 rounded">
          Weak Item: {weak || "N/A"}
        </div>

      </div>
    </AppShell>
  );
}