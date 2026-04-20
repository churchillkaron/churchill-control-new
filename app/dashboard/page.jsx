"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [menuStats, setMenuStats] = useState({});

  useEffect(() => {
    const load = () => {
      setMenuStats(JSON.parse(localStorage.getItem("menu_stats") || "{}"));
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        <h2>Menu Intelligence</h2>

        {Object.entries(menuStats).map(([name, data]) => (
          <div key={name} className="p-4 border border-white/10 rounded">
            <div>{name}</div>
            <div className="text-xs opacity-60">
              Orders: {data.count} | Revenue: {data.revenue}
            </div>
          </div>
        ))}

      </div>
    </AppShell>
  );
}