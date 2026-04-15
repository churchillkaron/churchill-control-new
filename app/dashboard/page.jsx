"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        const json = await res.json();

        setData(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalRevenue = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.revenue || 0), 0),
    [data]
  );

  const totalCost = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.cost || 0), 0),
    [data]
  );

  const totalProfit = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.profit || 0), 0),
    [data]
  );

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Dashboard</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Dashboard</h2>

      {/* 🔥 SUMMARY */}
      <div style={{ marginBottom: 20 }}>
        <strong>Total Revenue:</strong> {totalRevenue} <br />
        <strong>Total Cost:</strong> {totalCost} <br />
        <strong>Total Profit:</strong> {totalProfit} <br />
        <strong>Days:</strong> {data.length}
      </div>

      {/* 🔥 LIST */}
      {data.length === 0 ? (
        <p>No data yet</p>
      ) : (
        data.map((day, index) => (
          <div
            key={index}
            style={{
              padding: 10,
              marginBottom: 10,
              border: "1px solid #333",
              borderRadius: 8,
            }}
          >
            <strong>{day.date}</strong><br />
            Revenue: {day.revenue}<br />
            Cost: {day.cost}<br />
            Profit: {day.profit}
          </div>
        ))
      )}
    </div>
  );
}