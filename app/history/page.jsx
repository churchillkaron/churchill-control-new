"use client";

import { useEffect, useState } from "react";

const COLORS = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khakiDark: "#8f7d56",
  good: "#5f7a52",
  bad: "#9c5f4a",
};

function money(value) {
  return `THB ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function margin(revenue, profit) {
  if (!revenue) return 0;
  return (profit / revenue) * 100;
}

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/history", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load history.");
        }

        if (active) {
          setHistory(Array.isArray(data) ? [...data].reverse() : []);
        }
      } catch (err) {
        if (active) setError(err.message || "History failed.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "32px 24px 50px",
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #efe7d6 0%, #ddd0b4 100%)",
            border: `1px solid ${COLORS.line}`,
            borderRadius: 24,
            padding: 28,
          }}
        >
          <div
            style={{
              color: COLORS.khakiDark,
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 800,
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            Saved Days
          </div>

          <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.05 }}>
            Churchill History
          </h1>

          <p
            style={{
              marginTop: 14,
              color: COLORS.muted,
              fontSize: 17,
              maxWidth: 900,
              lineHeight: 1.6,
            }}
          >
            Review previously saved business days, totals, and recorded performance.
          </p>
        </div>

        {loading ? (
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 18,
              padding: 20,
            }}
          >
            Loading history...
          </div>
        ) : error ? (
          <div
            style={{
              background: "#f8e8e1",
              border: `1px solid ${COLORS.bad}`,
              color: COLORS.bad,
              borderRadius: 18,
              padding: 20,
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : (
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 18,
              padding: 20,
              boxShadow: "0 10px 30px rgba(92, 77, 50, 0.08)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr style={{ background: "#efe7d6" }}>
                    {["Date", "Revenue", "Cost", "Profit", "Margin"].map((head) => (
                      <th
                        key={head}
                        style={{
                          textAlign: "left",
                          padding: 12,
                          borderBottom: `1px solid ${COLORS.line}`,
                          fontSize: 13,
                        }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: 20, color: COLORS.muted }}>
                        No saved business days yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((row, index) => {
                      const rowMargin = margin(Number(row.revenue || 0), Number(row.profit || 0));
                      return (
                        <tr key={`${row.date}-${index}`}>
                          <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>
                            {row.date}
                          </td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>
                            {money(row.revenue)}
                          </td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>
                            {money(row.cost)}
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: `1px solid ${COLORS.line}`,
                              color: Number(row.profit || 0) >= 0 ? COLORS.good : COLORS.bad,
                              fontWeight: 800,
                            }}
                          >
                            {money(row.profit)}
                          </td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>
                            {rowMargin.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}