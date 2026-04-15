"use client";

import { useEffect, useMemo, useState } from "react";

function formatMoney(value) {
  const num = Number(value || 0);
  return `฿${num.toLocaleString()}`;
}

function formatPercent(value) {
  const num = Number(value || 0);
  return `${num.toFixed(1)}%`;
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getMargin(revenue, profit) {
  if (!revenue) return 0;
  return (profit / revenue) * 100;
}

function getTrendDirection(current, previous) {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function getTrendLabel(direction) {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "→";
}

function getLinePoints(data, key, width, height, padding) {
  if (!data.length) return "";
  const values = data.map((item) => safeNumber(item[key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return data
    .map((item, index) => {
      const x =
        padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
      const y =
        height -
        padding -
        ((safeNumber(item[key]) - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function getBarData(data, width, height, padding) {
  if (!data.length) return [];
  const max = Math.max(...data.map((item) => safeNumber(item.margin)), 1);

  return data.map((item, index) => {
    const chartWidth = width - padding * 2;
    const barGap = 10;
    const totalGap = barGap * (data.length - 1);
    const barWidth = Math.max((chartWidth - totalGap) / data.length, 8);
    const x = padding + index * (barWidth + barGap);
    const barHeight = (safeNumber(item.margin) / max) * (height - padding * 2);
    const y = height - padding - barHeight;

    return {
      x,
      y,
      width: barWidth,
      height: barHeight,
      label: item.label,
      value: safeNumber(item.margin),
    };
  });
}

function MetricCard({ title, value, subvalue, accent = "#ff7a00" }) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #2b2b2b",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>{title}</div>
      <div style={{ color: "#ffffff", fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: accent, fontSize: 13, marginTop: 8 }}>{subvalue}</div>
    </div>
  );
}

function SectionCard({ title, children, right }) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #2b2b2b",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: "#ffffff" }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Sparkline({ data, keyName, stroke = "#ff7a00" }) {
  const width = 520;
  const height = 220;
  const padding = 20;
  const points = getLinePoints(data, keyName, width, height, padding);

  if (!data.length) {
    return (
      <div style={{ color: "#9ca3af", fontSize: 14 }}>No data available.</div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 220 }}>
      <defs>
        <linearGradient id={`fill-${keyName}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.split(" ").map((point, index) => {
        const [cx, cy] = point.split(",");
        return (
          <circle
            key={`${keyName}-${index}`}
            cx={cx}
            cy={cy}
            r="4"
            fill={stroke}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

function MarginBars({ data }) {
  const width = 520;
  const height = 220;
  const padding = 20;
  const bars = getBarData(data, width, height, padding);

  if (!data.length) {
    return (
      <div style={{ color: "#9ca3af", fontSize: 14 }}>No data available.</div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 220 }}>
      {bars.map((bar, index) => (
        <g key={index}>
          <rect
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="8"
            fill="#ff7a00"
            opacity="0.9"
          />
          <text
            x={bar.x + bar.width / 2}
            y={height - 4}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="10"
          >
            {bar.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/history", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load dashboard data.");
        }

        if (active) {
          const cleaned = (Array.isArray(data) ? data : []).map((item) => ({
            date: item.date,
            revenue: safeNumber(item.revenue),
            cost: safeNumber(item.cost),
            profit: safeNumber(item.profit),
            dishes: Array.isArray(item.dishes) ? item.dishes : [],
          }));
          setHistory(cleaned);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Dashboard failed to load.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const filteredHistory = useMemo(() => {
    if (range === "all") return history;
    const count = Number(range);
    return history.slice(-count);
  }, [history, range]);

  const dashboardData = useMemo(() => {
    const rows = filteredHistory.map((row) => ({
      ...row,
      margin: getMargin(row.revenue, row.profit),
    }));

    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
    const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
    const averageMargin = rows.length
      ? rows.reduce((sum, row) => sum + row.margin, 0) / rows.length
      : 0;

    const bestDay = rows.reduce(
      (best, row) => (!best || row.profit > best.profit ? row : best),
      null
    );

    const worstDay = rows.reduce(
      (worst, row) => (!worst || row.profit < worst.profit ? row : worst),
      null
    );

    const latest = rows[rows.length - 1] || null;
    const previous = rows[rows.length - 2] || null;

    const revenueTrend = latest && previous
      ? getTrendDirection(latest.revenue, previous.revenue)
      : "flat";

    const profitTrend = latest && previous
      ? getTrendDirection(latest.profit, previous.profit)
      : "flat";

    const marginTrend = latest && previous
      ? getTrendDirection(latest.margin, previous.margin)
      : "flat";

    const topDishes = {};
    rows.forEach((day) => {
      day.dishes.forEach((dish) => {
        const name = dish?.name || dish?.dish || "Unknown";
        const quantity = safeNumber(dish?.quantity);
        const revenue = safeNumber(dish?.revenue);
        const cost = safeNumber(dish?.cost);
        const profit = revenue - cost;

        if (!topDishes[name]) {
          topDishes[name] = {
            name,
            quantity: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }

        topDishes[name].quantity += quantity;
        topDishes[name].revenue += revenue;
        topDishes[name].cost += cost;
        topDishes[name].profit += profit;
      });
    });

    const bestDishList = Object.values(topDishes)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const worstDishList = Object.values(topDishes)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);

    const recentMargins = rows.slice(-10).map((row) => ({
      label: row.date?.slice(5) || row.date,
      margin: row.margin,
    }));

    const aiInsights = [];

    if (rows.length === 0) {
      aiInsights.push("No saved days yet. Start saving daily reports to unlock analysis.");
    } else {
      if (averageMargin >= 30) {
        aiInsights.push("Strong margin performance. Pricing and cost control are healthy.");
      } else if (averageMargin >= 20) {
        aiInsights.push("Margin is acceptable, but there is room to improve pricing or reduce cost leakage.");
      } else {
        aiInsights.push("Margin is weak. Focus on cost control, price corrections, and removing low performers.");
      }

      if (bestDay && worstDay) {
        aiInsights.push(
          `Best day: ${bestDay.date} generated ${formatMoney(bestDay.profit)} profit, while worst day: ${worstDay.date} generated ${formatMoney(worstDay.profit)}.`
        );
      }

      if (revenueTrend === "up") {
        aiInsights.push("Revenue is improving versus the previous saved day.");
      } else if (revenueTrend === "down") {
        aiInsights.push("Revenue dropped versus the previous saved day. Review traffic, upselling, and offer mix.");
      }

      if (profitTrend === "down") {
        aiInsights.push("Profit declined faster than expected. Check food cost inflation or discount leakage.");
      }

      if (bestDishList.length > 0) {
        aiInsights.push(
          `Top profit driver right now: ${bestDishList[0].name} with ${formatMoney(bestDishList[0].profit)} total profit contribution.`
        );
      }

      if (worstDishList.length > 0 && worstDishList[0].profit < 0) {
        aiInsights.push(
          `Warning: ${worstDishList[0].name} is currently destroying margin with ${formatMoney(worstDishList[0].profit)} total profit.`
        );
      }
    }

    return {
      rows,
      totalRevenue,
      totalCost,
      totalProfit,
      averageMargin,
      bestDay,
      worstDay,
      latest,
      previous,
      revenueTrend,
      profitTrend,
      marginTrend,
      bestDishList,
      worstDishList,
      recentMargins,
      aiInsights,
    };
  }, [filteredHistory]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#080808",
          color: "#ffffff",
          padding: 24,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 30, marginBottom: 10 }}>Churchill Dashboard ELITE V6</h1>
        <p style={{ color: "#9ca3af" }}>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#080808",
          color: "#ffffff",
          padding: 24,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 30, marginBottom: 10 }}>Churchill Dashboard ELITE V6</h1>
        <p style={{ color: "#ff6b6b" }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#ffffff",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1 }}>
              Churchill Dashboard ELITE V6
            </h1>
            <p style={{ margin: "10px 0 0", color: "#9ca3af" }}>
              Owner analytics, margin intelligence, trend control, and AI performance review.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {[
              { label: "All", value: "all" },
              { label: "7", value: "7" },
              { label: "14", value: "14" },
              { label: "30", value: "30" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setRange(item.value)}
                style={{
                  background: range === item.value ? "#ff7a00" : "#161616",
                  color: "#ffffff",
                  border: "1px solid #2f2f2f",
                  borderRadius: 12,
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {item.label === "All" ? "All Days" : `Last ${item.label}`}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <MetricCard
            title="Total Revenue"
            value={formatMoney(dashboardData.totalRevenue)}
            subvalue={`${getTrendLabel(dashboardData.revenueTrend)} revenue trend`}
          />
          <MetricCard
            title="Total Cost"
            value={formatMoney(dashboardData.totalCost)}
            subvalue="Tracked from saved reports"
            accent="#f4b400"
          />
          <MetricCard
            title="Total Profit"
            value={formatMoney(dashboardData.totalProfit)}
            subvalue={`${getTrendLabel(dashboardData.profitTrend)} profit trend`}
            accent="#22c55e"
          />
          <MetricCard
            title="Average Margin"
            value={formatPercent(dashboardData.averageMargin)}
            subvalue={`${getTrendLabel(dashboardData.marginTrend)} margin trend`}
            accent="#60a5fa"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <SectionCard title="Revenue Trend">
            <Sparkline data={dashboardData.rows} keyName="revenue" stroke="#ff7a00" />
          </SectionCard>

          <SectionCard title="Profit Trend">
            <Sparkline data={dashboardData.rows} keyName="profit" stroke="#22c55e" />
          </SectionCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <SectionCard title="Margin Trend (Recent)">
            <MarginBars data={dashboardData.recentMargins} />
          </SectionCard>

          <SectionCard title="Best / Worst Day Snapshot">
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  background: "#0d1b12",
                  border: "1px solid #1f3d2a",
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
                  BEST DAY
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {dashboardData.bestDay?.date || "-"}
                </div>
                <div style={{ color: "#22c55e", marginTop: 8 }}>
                  Profit: {dashboardData.bestDay ? formatMoney(dashboardData.bestDay.profit) : "-"}
                </div>
                <div style={{ color: "#9ca3af", marginTop: 4 }}>
                  Revenue: {dashboardData.bestDay ? formatMoney(dashboardData.bestDay.revenue) : "-"}
                </div>
              </div>

              <div
                style={{
                  background: "#1a0d0d",
                  border: "1px solid #472020",
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
                  WORST DAY
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {dashboardData.worstDay?.date || "-"}
                </div>
                <div style={{ color: "#ff6b6b", marginTop: 8 }}>
                  Profit: {dashboardData.worstDay ? formatMoney(dashboardData.worstDay.profit) : "-"}
                </div>
                <div style={{ color: "#9ca3af", marginTop: 4 }}>
                  Revenue: {dashboardData.worstDay ? formatMoney(dashboardData.worstDay.revenue) : "-"}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 20,
          }}
        >
          <SectionCard title="AI Insights">
            <div style={{ display: "grid", gap: 12 }}>
              {dashboardData.aiInsights.map((insight, index) => (
                <div
                  key={index}
                  style={{
                    background: "#151515",
                    border: "1px solid #2b2b2b",
                    borderRadius: 14,
                    padding: 14,
                    color: "#e5e7eb",
                    lineHeight: 1.5,
                  }}
                >
                  {insight}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Latest Day Snapshot">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ color: "#9ca3af" }}>Date</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {dashboardData.latest?.date || "-"}
              </div>

              <div style={{ color: "#9ca3af" }}>Revenue</div>
              <div>{dashboardData.latest ? formatMoney(dashboardData.latest.revenue) : "-"}</div>

              <div style={{ color: "#9ca3af" }}>Cost</div>
              <div>{dashboardData.latest ? formatMoney(dashboardData.latest.cost) : "-"}</div>

              <div style={{ color: "#9ca3af" }}>Profit</div>
              <div>{dashboardData.latest ? formatMoney(dashboardData.latest.profit) : "-"}</div>

              <div style={{ color: "#9ca3af" }}>Margin</div>
              <div>
                {dashboardData.latest
                  ? formatPercent(getMargin(dashboardData.latest.revenue, dashboardData.latest.profit))
                  : "-"}
              </div>
            </div>
          </SectionCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <SectionCard title="Top Performing Dishes">
            <div style={{ display: "grid", gap: 10 }}>
              {dashboardData.bestDishList.length === 0 && (
                <div style={{ color: "#9ca3af" }}>No dish data available yet.</div>
              )}

              {dashboardData.bestDishList.map((dish, index) => (
                <div
                  key={index}
                  style={{
                    background: "#151515",
                    border: "1px solid #2b2b2b",
                    borderRadius: 14,
                    padding: 14,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{dish.name}</div>
                  <div style={{ color: "#9ca3af", fontSize: 14 }}>
                    Qty: {dish.quantity}
                  </div>
                  <div style={{ color: "#22c55e", fontSize: 14 }}>
                    Profit: {formatMoney(dish.profit)}
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: 14 }}>
                    Revenue: {formatMoney(dish.revenue)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Weakest Dishes">
            <div style={{ display: "grid", gap: 10 }}>
              {dashboardData.worstDishList.length === 0 && (
                <div style={{ color: "#9ca3af" }}>No dish data available yet.</div>
              )}

              {dashboardData.worstDishList.map((dish, index) => (
                <div
                  key={index}
                  style={{
                    background: "#151515",
                    border: "1px solid #2b2b2b",
                    borderRadius: 14,
                    padding: 14,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{dish.name}</div>
                  <div style={{ color: "#9ca3af", fontSize: 14 }}>
                    Qty: {dish.quantity}
                  </div>
                  <div
                    style={{
                      color: dish.profit >= 0 ? "#f4b400" : "#ff6b6b",
                      fontSize: 14,
                    }}
                  >
                    Profit: {formatMoney(dish.profit)}
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: 14 }}>
                    Revenue: {formatMoney(dish.revenue)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}