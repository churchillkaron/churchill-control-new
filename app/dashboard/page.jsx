"use client";

import { useEffect, useMemo, useState } from "react";

const THEME = {
  bg: "#0b0b0b",
  panel: "#131313",
  panelSoft: "#171717",
  border: "rgba(255,255,255,0.08)",
  text: "#f5f5f5",
  muted: "#b7b2a4",
  accent: "#f97316",
  accentSoft: "rgba(249,115,22,0.14)",
  khaki: "#c8ba97",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalizeBusinessDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toISOString().slice(0, 10);
}

function formatBusinessDate(value) {
  const normalized = normalizeBusinessDate(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(value || "-");

  const [year, month, day] = normalized.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value) {
  const normalized = normalizeBusinessDate(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(value || "-");

  const [year, month, day] = normalized.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function parseDishes(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function getMargin(revenue, profit) {
  if (!revenue) return 0;
  return Number(profit || 0) / Number(revenue || 0);
}

function inferStatus(row) {
  const savedStatus = row.ownerStatus?.status;
  if (savedStatus === "GOOD" || savedStatus === "WARNING" || savedStatus === "BAD") {
    return savedStatus;
  }

  const margin = getMargin(row.revenue, row.profit);

  if (row.profit <= 0) return "BAD";
  if (margin >= 0.5) return "GOOD";
  if (margin >= 0.3) return "WARNING";
  return "BAD";
}

function getStatusTone(status) {
  if (status === "GOOD") {
    return { bg: "rgba(34,197,94,0.14)", color: THEME.green };
  }

  if (status === "WARNING") {
    return { bg: "rgba(234,179,8,0.14)", color: THEME.yellow };
  }

  return { bg: "rgba(239,68,68,0.14)", color: THEME.red };
}

function SummaryCard({ label, value, subValue, accent }) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${accent ? THEME.accentSoft : THEME.border}`,
        borderRadius: 18,
        padding: 16,
        minHeight: 110,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          color: accent ? THEME.accent : THEME.text,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {subValue ? (
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{subValue}</div>
      ) : null}
    </div>
  );
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            color: THEME.text,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            style={{
              margin: "6px 0 0",
              color: THEME.muted,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function Panel({ title, subtitle, right, children }) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 22,
        padding: 18,
        minWidth: 0,
      }}
    >
      <SectionTitle title={title} subtitle={subtitle} right={right} />
      {children}
    </div>
  );
}

function MetricBox({ label, value, subValue, valueColor }) {
  return (
    <div
      style={{
        background: THEME.panelSoft,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 12 }}>{label}</div>
      <div
        style={{
          color: valueColor || THEME.text,
          fontSize: 20,
          fontWeight: 800,
          marginTop: 6,
        }}
      >
        {value}
      </div>
      {subValue ? (
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 6 }}>{subValue}</div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/history", {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load dashboard history.");
        }

        if (!active) return;

        const normalized = Array.isArray(data)
          ? data.map((item) => ({
              id: item.id,
              date: normalizeBusinessDate(item.date),
              revenue: Number(item.revenue || 0),
              cost: Number(item.cost || 0),
              profit: Number(item.profit || 0),
              created_at: item.created_at,
              dishes: parseDishes(item.dishes),
            }))
          : [];

        normalized.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
        setHistoryRows(normalized);
      } catch (error) {
        if (!active) return;
        setLoadError(error.message || "Dashboard failed to load.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const groupedDays = useMemo(() => {
    const map = new Map();

    historyRows.forEach((row) => {
      const key = normalizeBusinessDate(row.date);
      const parsed = row.dishes || {};
      const meta = parsed.meta || {};
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
      const current = map.get(key);

      if (!current) {
        const dishMap = new Map();

        rows.forEach((dish) => {
          dishMap.set(dish.name, {
            name: dish.name,
            category: dish.category || "Uncategorized",
            revenue: Number(dish.revenue || 0),
            cost: Number(dish.cogs || 0),
            profit: Number(dish.profit || 0),
            soldQty: Number(dish.soldQty || 0),
          });
        });

        map.set(key, {
          date: key,
          revenue: Number(row.revenue || 0),
          cost: Number(row.cost || 0),
          profit: Number(row.profit || 0),
          saves: 1,
          created_at: row.created_at,
          meta: {
            covers: Number(meta.covers || 0),
            drinkRevenue: Number(meta.drinkRevenue || 0),
            avgTicketTime: Number(meta.avgTicketTime || 0),
            secondRoundRate: Number(meta.secondRoundRate || 0),
            complaints: Number(meta.complaints || 0),
            managerNotes: meta.managerNotes || "",
          },
          ownerStatus: meta.ownerStatus || null,
          insights,
          dishes: dishMap,
        });
        return;
      }

      current.revenue += Number(row.revenue || 0);
      current.cost += Number(row.cost || 0);
      current.profit += Number(row.profit || 0);
      current.saves += 1;
      current.meta.covers += Number(meta.covers || 0);
      current.meta.drinkRevenue += Number(meta.drinkRevenue || 0);
      current.meta.avgTicketTime += Number(meta.avgTicketTime || 0);
      current.meta.secondRoundRate += Number(meta.secondRoundRate || 0);
      current.meta.complaints += Number(meta.complaints || 0);

      if (new Date(row.created_at || row.date).getTime() > new Date(current.created_at || current.date).getTime()) {
        current.created_at = row.created_at;
        current.ownerStatus = meta.ownerStatus || current.ownerStatus;
        current.insights = insights.length ? insights : current.insights;
        current.meta.managerNotes = meta.managerNotes || current.meta.managerNotes;
      }

      rows.forEach((dish) => {
        const existingDish = current.dishes.get(dish.name);
        if (!existingDish) {
          current.dishes.set(dish.name, {
            name: dish.name,
            category: dish.category || "Uncategorized",
            revenue: Number(dish.revenue || 0),
            cost: Number(dish.cogs || 0),
            profit: Number(dish.profit || 0),
            soldQty: Number(dish.soldQty || 0),
          });
          return;
        }

        existingDish.revenue += Number(dish.revenue || 0);
        existingDish.cost += Number(dish.cogs || 0);
        existingDish.profit += Number(dish.profit || 0);
        existingDish.soldQty += Number(dish.soldQty || 0);
      });
    });

    return Array.from(map.values())
      .map((day) => ({
        ...day,
        dishes: Array.from(day.dishes.values()),
        avgTicketTime: day.saves > 0 ? day.meta.avgTicketTime / day.saves : 0,
        avgSecondRoundRate: day.saves > 0 ? day.meta.secondRoundRate / day.saves : 0,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [historyRows]);

  const filteredDays = useMemo(() => {
    if (periodFilter === "7d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 7);
      return groupedDays.filter((row) => new Date(row.date) >= threshold);
    }

    if (periodFilter === "30d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 30);
      return groupedDays.filter((row) => new Date(row.date) >= threshold);
    }

    return groupedDays;
  }, [groupedDays, periodFilter]);

  const totals = useMemo(() => {
    return filteredDays.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.cost += row.cost;
        acc.profit += row.profit;
        acc.covers += Number(row.meta?.covers || 0);
        acc.drinkRevenue += Number(row.meta?.drinkRevenue || 0);
        acc.complaints += Number(row.meta?.complaints || 0);
        acc.ticketTimeTotal += Number(row.avgTicketTime || 0);
        acc.secondRoundTotal += Number(row.avgSecondRoundRate || 0);
        acc.totalUnitsSold += row.dishes.reduce((sum, item) => sum + Number(item.soldQty || 0), 0);
        acc.totalDishLines += row.dishes.length;
        return acc;
      },
      {
        revenue: 0,
        cost: 0,
        profit: 0,
        covers: 0,
        drinkRevenue: 0,
        complaints: 0,
        ticketTimeTotal: 0,
        secondRoundTotal: 0,
        totalUnitsSold: 0,
        totalDishLines: 0,
      }
    );
  }, [filteredDays]);

  const avgTicketTime = filteredDays.length ? totals.ticketTimeTotal / filteredDays.length : 0;
  const avgSecondRoundRate = filteredDays.length ? totals.secondRoundTotal / filteredDays.length : 0;
  const overallMargin = totals.revenue > 0 ? totals.profit / totals.revenue : 0;
  const overallFoodCost = totals.revenue > 0 ? totals.cost / totals.revenue : 0;
  const avgRevenuePerCover = totals.covers > 0 ? totals.revenue / totals.covers : 0;

  const bestDay = useMemo(() => {
    if (!filteredDays.length) return null;
    return [...filteredDays].sort((a, b) => b.profit - a.profit)[0];
  }, [filteredDays]);

  const worstDay = useMemo(() => {
    if (!filteredDays.length) return null;
    return [...filteredDays].sort((a, b) => a.profit - b.profit)[0];
  }, [filteredDays]);

  const latestDay = filteredDays[0] || null;

  const trendData = useMemo(() => {
    const ordered = [...filteredDays].sort((a, b) => new Date(a.date) - new Date(b.date));
    const trimmed = ordered.slice(-10);
    const maxRevenue = Math.max(...trimmed.map((item) => Number(item.revenue || 0)), 1);

    return trimmed.map((item) => ({
      ...item,
      shortDate: formatShortDate(item.date),
      revenueHeight: `${Math.max((Number(item.revenue || 0) / maxRevenue) * 100, 6)}%`,
    }));
  }, [filteredDays]);

  const dishPerformance = useMemo(() => {
    const map = new Map();

    filteredDays.forEach((day) => {
      day.dishes.forEach((dish) => {
        const current = map.get(dish.name) || {
          name: dish.name,
          category: dish.category || "Uncategorized",
          soldQty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };

        current.soldQty += Number(dish.soldQty || 0);
        current.revenue += Number(dish.revenue || 0);
        current.cost += Number(dish.cost || 0);
        current.profit += Number(dish.profit || 0);

        map.set(dish.name, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredDays]);

  const topDishes = dishPerformance.slice(0, 8);
  const weakestDishes = [...dishPerformance]
    .filter((dish) => dish.soldQty > 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const dashboardInsights = useMemo(() => {
    const insights = [];

    if (!filteredDays.length) {
      return ["No saved business days yet. Save completed control days to activate owner analytics."];
    }

    if (bestDay) {
      insights.push(
        `Best business day was ${formatBusinessDate(bestDay.date)} with gross profit of ${formatCurrency(
          bestDay.profit
        )}.`
      );
    }

    if (worstDay) {
      insights.push(
        `Lowest profit day was ${formatBusinessDate(worstDay.date)} with gross profit of ${formatCurrency(
          worstDay.profit
        )}.`
      );
    }

    if (overallFoodCost > 0.35) {
      insights.push(
        `Overall food cost is elevated at ${formatPercent(
          overallFoodCost
        )}. Tighten portion discipline and review high-cost mains.`
      );
    } else if (overallFoodCost > 0 && overallFoodCost <= 0.3) {
      insights.push(
        `Overall food cost is controlled at ${formatPercent(
          overallFoodCost
        )}, which supports a healthy operating position.`
      );
    }

    if (avgSecondRoundRate > 0 && avgSecondRoundRate < 0.45) {
      insights.push(
        `Average second-round rate is ${formatPercent(
          avgSecondRoundRate
        )}. Improve drinks and dessert follow-up at the table.`
      );
    }

    if (avgTicketTime > 20) {
      insights.push(
        `Average ticket time is ${formatNumber(
          avgTicketTime
        )} minutes. Kitchen flow and station coordination need attention.`
      );
    }

    if (topDishes[0]) {
      insights.push(
        `${topDishes[0].name} is the strongest revenue driver at ${formatCurrency(
          topDishes[0].revenue
        )} across the selected period.`
      );
    }

    if (weakestDishes[0]) {
      insights.push(
        `${weakestDishes[0].name} is the weakest active profit performer and should be reviewed for price, cost, or positioning.`
      );
    }

    return insights.slice(0, 6);
  }, [avgSecondRoundRate, avgTicketTime, bestDay, filteredDays, overallFoodCost, topDishes, weakestDishes, worstDay]);

  const ownerStatus = useMemo(() => {
    if (!filteredDays.length) {
      return { status: "NO DATA", score: 0, bg: "rgba(255,255,255,0.06)", color: THEME.muted };
    }

    let score = 0;

    score += overallFoodCost <= 0.3 ? 30 : overallFoodCost <= 0.35 ? 18 : 0;
    score += overallMargin >= 0.55 ? 25 : overallMargin >= 0.45 ? 15 : 0;
    score += avgSecondRoundRate >= 0.6 ? 20 : avgSecondRoundRate >= 0.45 ? 12 : 0;
    score += avgTicketTime > 0 && avgTicketTime <= 15 ? 15 : avgTicketTime <= 20 ? 8 : 0;
    score += totals.complaints === 0 ? 10 : totals.complaints <= 3 ? 5 : 0;

    if (score >= 75) return { status: "GOOD", score, ...getStatusTone("GOOD") };
    if (score >= 50) return { status: "WARNING", score, ...getStatusTone("WARNING") };
    return { status: "BAD", score, ...getStatusTone("BAD") };
  }, [avgSecondRoundRate, avgTicketTime, filteredDays, overallFoodCost, overallMargin, totals.complaints]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(14px)",
          background: "rgba(11,11,11,0.88)",
          borderBottom: `1px solid ${THEME.border}`,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1480,
            margin: "0 auto",
            padding: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  color: THEME.accent,
                  fontWeight: 900,
                  fontSize: 24,
                  letterSpacing: "-0.04em",
                }}
              >
                CC
              </div>
              <div
                style={{
                  color: THEME.text,
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "-0.03em",
                }}
              >
                Churchill Karon
              </div>
            </div>
            <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
              Owner Dashboard | Revenue, Profit, Margin, Best/Worst Day
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "All Time" },
              { key: "30d", label: "Last 30 Days" },
              { key: "7d", label: "Last 7 Days" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriodFilter(item.key)}
                style={{
                  border: periodFilter === item.key ? "none" : `1px solid ${THEME.border}`,
                  background: periodFilter === item.key ? THEME.accent : THEME.panel,
                  color: "#ffffff",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 1480,
          margin: "0 auto",
          padding: "18px 16px 40px",
          display: "grid",
          gap: 18,
        }}
      >
        {loading ? (
          <Panel title="Loading Dashboard" subtitle="Reading business history from the system.">
            <div style={{ color: THEME.muted, fontSize: 14 }}>Loading dashboard...</div>
          </Panel>
        ) : null}

        {!loading && loadError ? (
          <div
            style={{
              background: "rgba(239,68,68,0.12)",
              border: `1px solid rgba(239,68,68,0.2)`,
              borderRadius: 22,
              padding: 18,
              color: THEME.red,
              fontWeight: 600,
            }}
          >
            {loadError}
          </div>
        ) : null}

        {!loading && !loadError ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <SummaryCard
                label="Total Revenue"
                value={formatCurrency(totals.revenue)}
                subValue={`${filteredDays.length} business day(s)`}
                accent
              />
              <SummaryCard
                label="Total Cost"
                value={formatCurrency(totals.cost)}
                subValue={`Food Cost ${formatPercent(overallFoodCost)}`}
              />
              <SummaryCard
                label="Gross Profit"
                value={formatCurrency(totals.profit)}
                subValue={`Margin ${formatPercent(overallMargin)}`}
              />
              <SummaryCard
                label="Revenue / Cover"
                value={formatCurrency(avgRevenuePerCover)}
                subValue={`Covers ${formatNumber(totals.covers)}`}
              />
              <SummaryCard
                label="Units Sold"
                value={formatNumber(totals.totalUnitsSold)}
                subValue={`Dish Lines ${formatNumber(totals.totalDishLines)}`}
              />
              <SummaryCard
                label="Owner Status"
                value={ownerStatus.status}
                subValue={`Score ${ownerStatus.score}`}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.85fr)",
                gap: 18,
              }}
            >
              <Panel
                title="Financial Overview"
                subtitle="Owner view across grouped business days."
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <MetricBox label="Food Cost %" value={formatPercent(overallFoodCost)} />
                  <MetricBox label="Gross Margin" value={formatPercent(overallMargin)} />
                  <MetricBox label="Drink Revenue" value={formatCurrency(totals.drinkRevenue)} />
                  <MetricBox label="Avg Ticket Time" value={`${formatNumber(avgTicketTime)} min`} />
                  <MetricBox label="Second Round Rate" value={formatPercent(avgSecondRoundRate)} />
                  <MetricBox label="Complaints" value={formatNumber(totals.complaints)} />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    background: THEME.panelSoft,
                    borderRadius: 18,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ color: THEME.muted, fontSize: 12 }}>Current Owner Status</div>
                    <div style={{ color: ownerStatus.color, fontSize: 20, fontWeight: 800, marginTop: 6 }}>
                      {ownerStatus.status}
                    </div>
                  </div>
                  <div
                    style={{
                      background: ownerStatus.bg,
                      color: ownerStatus.color,
                      borderRadius: 999,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Score {ownerStatus.score}
                  </div>
                </div>
              </Panel>

              <Panel
                title="Best vs Lowest Profit Day"
                subtitle="Clean owner reading of grouped business-day performance."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <MetricBox
                    label="Best Day"
                    value={bestDay ? formatBusinessDate(bestDay.date) : "-"}
                    subValue={
                      bestDay
                        ? `${formatCurrency(bestDay.revenue)} revenue | ${formatCurrency(bestDay.profit)} profit`
                        : "No data"
                    }
                  />
                  <MetricBox
                    label="Lowest Profit Day"
                    value={worstDay ? formatBusinessDate(worstDay.date) : "-"}
                    subValue={
                      worstDay
                        ? `${formatCurrency(worstDay.revenue)} revenue | ${formatCurrency(worstDay.profit)} profit`
                        : "No data"
                    }
                  />
                  <MetricBox
                    label="Latest Saved Day"
                    value={latestDay ? formatBusinessDate(latestDay.date) : "-"}
                    subValue={
                      latestDay
                        ? `${formatCurrency(latestDay.revenue)} revenue | ${formatCurrency(latestDay.profit)} profit`
                        : "No data"
                    }
                  />
                </div>
              </Panel>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
                gap: 18,
              }}
            >
              <Panel
                title="Revenue Trend"
                subtitle="Latest 10 grouped business days."
              >
                {trendData.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${trendData.length}, minmax(0, 1fr))`,
                      gap: 12,
                      alignItems: "end",
                      minHeight: 290,
                    }}
                  >
                    {trendData.map((item) => (
                      <div
                        key={item.date}
                        style={{
                          display: "grid",
                          gap: 8,
                          alignItems: "end",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            height: 210,
                            display: "flex",
                            alignItems: "end",
                          }}
                        >
                          <div
                            title={`${formatBusinessDate(item.date)} | ${formatCurrency(item.revenue)}`}
                            style={{
                              width: "100%",
                              height: item.revenueHeight,
                              minHeight: 12,
                              borderRadius: "16px 16px 6px 6px",
                              border: `1px solid ${THEME.accentSoft}`,
                              background:
                                "linear-gradient(180deg, rgba(249,115,22,0.98), rgba(249,115,22,0.35))",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            color: THEME.text,
                            fontSize: 12,
                            fontWeight: 700,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatCurrency(item.revenue)}
                        </div>
                        <div
                          style={{
                            color: THEME.muted,
                            fontSize: 11,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.shortDate}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.muted, fontSize: 14 }}>
                    No grouped business days available for trend view.
                  </div>
                )}
              </Panel>

              <Panel
                title="AI Owner Insights"
                subtitle="High-level business reading for the selected period."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {dashboardInsights.map((insight, index) => (
                    <div
                      key={`${index}-${insight}`}
                      style={{
                        background: THEME.panelSoft,
                        borderRadius: 16,
                        padding: 14,
                        color: THEME.text,
                        fontSize: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      {insight}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
                gap: 18,
              }}
            >
              <Panel
                title="Top Dishes"
                subtitle="Highest revenue contributors across grouped business days."
              >
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: 640,
                    }}
                  >
                    <thead>
                      <tr>
                        {["Dish", "Category", "Qty Sold", "Revenue", "Cost", "Gross Profit"].map((heading) => (
                          <th key={heading} style={tableHeadStyle}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topDishes.length ? (
                        topDishes.map((item) => (
                          <tr key={item.name}>
                            <td style={tableCellStrongStyle}>{item.name}</td>
                            <td style={tableCellStyle}>{item.category}</td>
                            <td style={tableCellStyle}>{formatNumber(item.soldQty)}</td>
                            <td style={tableCellStyle}>{formatCurrency(item.revenue)}</td>
                            <td style={tableCellStyle}>{formatCurrency(item.cost)}</td>
                            <td
                              style={{
                                ...tableCellStyle,
                                color: item.profit >= 0 ? THEME.green : THEME.red,
                              }}
                            >
                              {formatCurrency(item.profit)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} style={emptyCellStyle}>
                            No dish data found yet in grouped business days.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="Weakest Profit Dishes"
                subtitle="Active dishes that need pricing or cost review."
              >
                <div style={{ display: "grid", gap: 10 }}>
                  {weakestDishes.length ? (
                    weakestDishes.map((item) => (
                      <div
                        key={item.name}
                        style={{
                          background: THEME.panelSoft,
                          borderRadius: 16,
                          padding: 14,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ color: THEME.text, fontSize: 15, fontWeight: 700 }}>{item.name}</div>
                          <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
                            Qty {formatNumber(item.soldQty)} | Revenue {formatCurrency(item.revenue)}
                          </div>
                        </div>
                        <div
                          style={{
                            background: "rgba(239,68,68,0.14)",
                            color: THEME.red,
                            borderRadius: 999,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(item.profit)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: THEME.muted, fontSize: 14 }}>
                      No low-performing active dishes found yet.
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            <Panel
              title="Saved Business Days"
              subtitle="Grouped archive for owner review."
            >
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 880,
                  }}
                >
                  <thead>
                    <tr>
                      {["Date", "Revenue", "Cost", "Profit", "Margin", "Covers", "Drink Revenue", "Status", "Saves"].map(
                        (heading) => (
                          <th key={heading} style={tableHeadStyle}>
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDays.length ? (
                      filteredDays.map((row) => {
                        const status = inferStatus(row);
                        const tone = getStatusTone(status);

                        return (
                          <tr key={row.date}>
                            <td style={tableCellStrongStyle}>{formatBusinessDate(row.date)}</td>
                            <td style={tableCellStyle}>{formatCurrency(row.revenue)}</td>
                            <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                            <td
                              style={{
                                ...tableCellStyle,
                                color: row.profit >= 0 ? THEME.green : THEME.red,
                              }}
                            >
                              {formatCurrency(row.profit)}
                            </td>
                            <td style={tableCellStyle}>{formatPercent(getMargin(row.revenue, row.profit))}</td>
                            <td style={tableCellStyle}>{formatNumber(row.meta.covers || 0)}</td>
                            <td style={tableCellStyle}>{formatCurrency(row.meta.drinkRevenue || 0)}</td>
                            <td style={tableCellStyle}>
                              <span
                                style={{
                                  background: tone.bg,
                                  color: tone.color,
                                  borderRadius: 999,
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {status}
                              </span>
                            </td>
                            <td style={tableCellStyle}>{formatNumber(row.saves || 1)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} style={emptyCellStyle}>
                          No grouped business days available in the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        ) : null}
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr)"],
          div[style*="grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const tableHeadStyle = {
  textAlign: "left",
  color: THEME.muted,
  fontSize: 12,
  fontWeight: 600,
  padding: "12px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  whiteSpace: "nowrap",
};

const tableCellStyle = {
  padding: "12px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  color: THEME.muted,
  fontSize: 13,
  verticalAlign: "middle",
};

const tableCellStrongStyle = {
  ...tableCellStyle,
  color: THEME.text,
  fontWeight: 700,
};

const emptyCellStyle = {
  padding: "18px 10px",
  color: THEME.muted,
  fontSize: 14,
  textAlign: "center",
};