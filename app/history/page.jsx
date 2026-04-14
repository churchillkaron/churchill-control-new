"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function formatMoney(value) {
  const number = Number(value) || 0;
  return `฿${number.toLocaleString()}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return value;

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseDishes(dishes) {
  if (!dishes) return [];
  if (Array.isArray(dishes)) return dishes;

  try {
    const parsed = JSON.parse(dishes);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDishName(d, i) {
  return d?.name || d?.dish || d?.title || `Dish ${i + 1}`;
}

function getDishQty(d) {
  return Number(d?.quantity ?? d?.qty ?? 0);
}

function getDishRevenue(d) {
  return Number(d?.revenue ?? d?.total ?? 0);
}

function getDishCost(d) {
  return Number(d?.cost ?? d?.totalCost ?? 0);
}

function getDishProfit(d) {
  if (d?.profit !== undefined) return Number(d.profit);
  return getDishRevenue(d) - getDishCost(d);
}

export default function HistoryPage() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history", {
          cache: "no-store",
        });

        const data = await res.json();

        const list = Array.isArray(data)
          ? data
          : data?.data || data?.reports || [];

        const sorted = [...list].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        setReports(sorted);

        if (sorted.length > 0) {
          setSelectedId(sorted[0].id);
        }
      } catch (err) {
        console.error("History load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const selected = useMemo(() => {
    return reports.find((r) => r.id === selectedId);
  }, [reports, selectedId]);

  const dishes = parseDishes(selected?.dishes);

  function handleEdit() {
    if (!selected) return;

    const encoded = encodeURIComponent(
      JSON.stringify({
        date: selected.date,
        dishes: dishes,
      })
    );

    router.push(`/control-final?data=${encoded}`);
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading history...</div>;
  }

  return (
    <div style={{ padding: 24, background: "#f5f7fb", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
        Daily Reports History
      </h1>

      <div style={{ display: "flex", gap: 20 }}>
        {/* LEFT PANEL */}
        <div
          style={{
            width: 420,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {reports.map((r) => {
            const active = r.id === selectedId;

            return (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  padding: 16,
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                  background: active ? "#e6f0ff" : "#fff",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {formatDate(r.date)}
                </div>

                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Revenue: {formatMoney(r.revenue)}
                </div>
                <div style={{ fontSize: 13 }}>
                  Cost: {formatMoney(r.cost)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color:
                      Number(r.profit) >= 0 ? "#15803d" : "#b91c1c",
                  }}
                >
                  Profit: {formatMoney(r.profit)}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            flex: 1,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: 20,
          }}
        >
          {!selected ? (
            <div>No data</div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <h2>{formatDate(selected.date)}</h2>

                {/* 🚀 NEW BUTTON */}
                <button
                  onClick={handleEdit}
                  style={{
                    padding: "10px 16px",
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Edit in Control
                </button>
              </div>

              {/* SUMMARY */}
              <div style={{ marginBottom: 20 }}>
                <div>Revenue: {formatMoney(selected.revenue)}</div>
                <div>Cost: {formatMoney(selected.cost)}</div>
                <div
                  style={{
                    fontWeight: 700,
                    color:
                      Number(selected.profit) >= 0
                        ? "#15803d"
                        : "#b91c1c",
                  }}
                >
                  Profit: {formatMoney(selected.profit)}
                </div>
              </div>

              {/* DISHES */}
              <h3 style={{ marginBottom: 10 }}>Dish Breakdown</h3>

              {dishes.length === 0 ? (
                <div>No dishes saved</div>
              ) : (
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th align="left">Dish</th>
                      <th align="right">Qty</th>
                      <th align="right">Revenue</th>
                      <th align="right">Cost</th>
                      <th align="right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dishes.map((d, i) => (
                      <tr key={i}>
                        <td>{getDishName(d, i)}</td>
                        <td align="right">{getDishQty(d)}</td>
                        <td align="right">
                          {formatMoney(getDishRevenue(d))}
                        </td>
                        <td align="right">
                          {formatMoney(getDishCost(d))}
                        </td>
                        <td
                          align="right"
                          style={{
                            fontWeight: 700,
                            color:
                              getDishProfit(d) >= 0
                                ? "#15803d"
                                : "#b91c1c",
                          }}
                        >
                          {formatMoney(getDishProfit(d))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}