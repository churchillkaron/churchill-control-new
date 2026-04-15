"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history");
        const json = await res.json();

        setData(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setData([]);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, []);

  if (!loaded) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Dashboard</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // 🔥 SAFE FALLBACKS
  const safeData = Array.isArray(data) ? data : [];

  return (
    <div style={{ padding: 20 }}>
      <h2>Dashboard</h2>

      {safeData.length === 0 ? (
        <p>No data yet</p>
      ) : (
        safeData.map((day, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <strong>{day.date}</strong> — Revenue: {day.revenue}
          </div>
        ))
      )}
    </div>
  );
}