"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }

    load();
  }, []);

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

      {data.length === 0 ? (
        <p>No data yet</p>
      ) : (
        <div>
          {data.map((day, index) => (
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
          ))}
        </div>
      )}
    </div>
  );
}