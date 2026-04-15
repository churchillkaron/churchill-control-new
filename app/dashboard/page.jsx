"use client";

import { useEffect, useMemo, useState } from "react";

const COLORS = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khaki: "#b7a57a",
  khakiDark: "#8f7d56",
  white: "#ffffff",
  good: "#5f7a52",
  bad: "#9c5f4a",
  warn: "#b0813f",
};

function money(value) {
  return `THB ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function margin(revenue, profit) {
  if (!revenue) return 0;
  return (profit / revenue) * 100;
}

function Card({ title, value, sub, tone }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(92, 77, 50, 0.08)",
      }}
    >
      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>{title}</div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: tone || COLORS.text,
          marginBottom: 8,
        }}
      >
        {value}
      </div>
      <div style={{ color: COLORS.muted }}>{sub}</div>
    </div>
  );
}

export default function DashboardPage() {
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
          throw new Error(data?.error || "Failed to load dashboard.");
        }

        if (active) {
          const clean = (Array.isArray(data) ? data : []).sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );
          setHistory(clean);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Dashboard failed.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const analytics = useMemo(() => {
    const totalRevenue = history.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const totalCost = history.reduce((sum, row) => sum + Number(row.cost || 0), 0);
    const totalProfit = history.reduce((sum, row) => sum + Number(row.profit || 0), 0);

    const bestDay =
      history.length > 0
        ? history.reduce((best, row) =>
            Number(row.profit || 0) > Number(best.profit || 0) ? row : best
          )
        : null;

    const worstDay =
      history.length > 0
        ? history.reduce((worst, row) =>
            Number(row.profit || 0) < Number(worst.profit || 0) ? row : worst
          )
        : null;

    const latest = history.length > 0 ? history[history.length - 1] : null;
    const overallMargin = margin(totalRevenue, totalProfit);

    const insights = [];
    if (!history.length) {
      insights.push("No saved days yet. Save a day from Control to activate owner intelligence.");
    } else {
      if (overallMargin >= 30) {
        insights.push("Overall business margin is strong.");
      } else if (overallMargin >= 20) {
        insights.push("Overall business margin is acceptable, but price improvements are possible.");
      } else {
        insights.push("Overall business margin is weak. Review low-margin mains and pricing.");
      }

      if (bestDay) {
        insights.push(`Best day: ${bestDay.date} with profit of ${money(bestDay.profit)}.`);
      }

      if (worstDay) {
        insights.push(`Worst day: ${worstDay.date} with profit of ${money(worstDay.profit)}.`);
      }

      if (latest) {
        insights.push(`Latest saved day: ${latest.date} with revenue of ${money(latest.revenue)}.`);
      }
    }

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      overallMargin,
      bestDay,
      worstDay,
      latest,
      insights,
    };
  }, [history]);

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
            Owner Dashboard
          </div>

          <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.05 }}>
            Churchill Dashboard
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
            Revenue, profit, margin, day performance and owner-level business intelligence in khaki mode.
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
            Loading dashboard...
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
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <Card
                title="Total Revenue"
                value={money(analytics.totalRevenue)}
                sub={`${history.length} saved day(s)`}
              />
              <Card
                title="Total Cost"
                value={money(analytics.totalCost)}
                sub="Accumulated cost"
              />
              <Card
                title="Total Profit"
                value={money(analytics.totalProfit)}
                sub="Accumulated profit"
                tone={analytics.totalProfit >= 0 ? COLORS.good : COLORS.bad}
              />
              <Card
                title="Overall Margin"
                value={percent(analytics.overallMargin)}
                sub="Profit ÷ Revenue"
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 18,
              }}
            >
              <div
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 18,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
                  Owner Insights
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {analytics.insights.map((insight, index) => (
                    <div
                      key={index}
                      style={{
                        background: "#f7f1e4",
                        border: `1px solid ${COLORS.line}`,
                        borderRadius: 14,
                        padding: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      {insight}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 18,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
                  Day Summary
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      background: "#f7f1e4",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div style={{ color: COLORS.muted, fontSize: 12 }}>Latest Day</div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>
                      {analytics.latest ? analytics.latest.date : "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#f7f1e4",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div style={{ color: COLORS.muted, fontSize: 12 }}>Best Day</div>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>
                      {analytics.bestDay ? analytics.bestDay.date : "-"}
                    </div>
                    <div style={{ color: COLORS.good, marginTop: 6 }}>
                      {analytics.bestDay ? money(analytics.bestDay.profit) : "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#f7f1e4",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div style={{ color: COLORS.muted, fontSize: 12 }}>Worst Day</div>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>
                      {analytics.worstDay ? analytics.worstDay.date : "-"}
                    </div>
                    <div style={{ color: COLORS.bad, marginTop: 6 }}>
                      {analytics.worstDay ? money(analytics.worstDay.profit) : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}