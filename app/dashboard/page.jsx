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
  blue: "#60a5fa",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
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

function getFoodCostPct(revenue, cost) {
  if (!revenue) return 0;
  return Number(cost || 0) / Number(revenue || 0);
}

function getStatusTone(status) {
  if (status === "GOOD") {
    return {
      bg: "rgba(34,197,94,0.14)",
      color: THEME.green,
    };
  }

  if (status === "WARNING") {
    return {
      bg: "rgba(234,179,8,0.14)",
      color: THEME.yellow,
    };
  }

  return {
    bg: "rgba(239,68,68,0.14)",
    color: THEME.red,
  };
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
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 8 }}>{subValue}</div>
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
              lineHeight: 1.5,
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

function TableCard({ title, subtitle, children }) {
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
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
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
              date: item.date,
              revenue: Number(item.revenue || 0),
              cost: Number(item.cost || 0),
              profit: Number(item.profit || 0),
              created_at: item.created_at,
              dishes: parseDishes(item.dishes),
            }))
          : [];

        normalized.sort((a, b) => new Date(b.date) - new Date(a.date));
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

  const filteredRows = useMemo(() => {
    if (periodFilter === "7d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 7);

      return historyRows.filter((row) => new Date(row.date) >= threshold);
    }

    if (periodFilter === "30d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 30);

      return historyRows.filter((row) => new Date(row.date) >= threshold);
    }

    return historyRows;
  }, [historyRows, periodFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.revenue += row.revenue || 0;
        acc.cost += row.cost || 0;
        acc.profit += row.profit || 0;

        const dishes = row.dishes || {};
        const meta = dishes.meta || {};
        const entries = Array.isArray(dishes.rows) ? dishes.rows : [];

        acc.covers += Number(meta.covers || 0);
        acc.drinkRevenue += Number(meta.drinkRevenue || 0);
        acc.complaints += Number(meta.complaints || 0);
        acc.ticketTimeTotal += Number(meta.avgTicketTime || 0);
        acc.ticketTimeCount += meta.avgTicketTime ? 1 : 0;
        acc.secondRoundTotal += Number(meta.secondRoundRate || 0);
        acc.secondRoundCount += meta.secondRoundRate ? 1 : 0;
        acc.totalDishLines += entries.length;
        acc.totalUnitsSold += entries.reduce((sum, item) => sum + Number(item.soldQty || 0), 0);

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
        ticketTimeCount: 0,
        secondRoundTotal: 0,
        secondRoundCount: 0,
        totalDishLines: 0,
        totalUnitsSold: 0,
      }
    );
  }, [filteredRows]);

  const avgTicketTime =
    totals.ticketTimeCount > 0 ? totals.ticketTimeTotal / totals.ticketTimeCount : 0;

  const avgSecondRoundRate =
    totals.secondRoundCount > 0 ? totals.secondRoundTotal / totals.secondRoundCount : 0;

  const overallMargin = totals.revenue > 0 ? totals.profit / totals.revenue : 0;
  const overallFoodCost = totals.revenue > 0 ? totals.cost / totals.revenue : 0;
  const avgRevenuePerCover = totals.covers > 0 ? totals.revenue / totals.covers : 0;

  const bestDay = useMemo(() => {
    if (!filteredRows.length) return null;
    return [...filteredRows].sort((a, b) => b.profit - a.profit)[0];
  }, [filteredRows]);

  const worstDay = useMemo(() => {
    if (!filteredRows.length) return null;
    return [...filteredRows].sort((a, b) => a.profit - b.profit)[0];
  }, [filteredRows]);

  const latestDay = filteredRows[0] || null;

  const dailyTrend = useMemo(() => {
    const ordered = [...filteredRows].sort((a, b) => new Date(a.date) - new Date(b.date));
    const maxRevenue = Math.max(...ordered.map((item) => item.revenue || 0), 1);

    return ordered.slice(-10).map((item) => ({
      ...item,
      revenueHeight: `${Math.max(((item.revenue || 0) / maxRevenue) * 100, 6)}%`,
    }));
  }, [filteredRows]);

  const dishPerformance = useMemo(() => {
    const map = new Map();

    filteredRows.forEach((row) => {
      const payload = row.dishes || {};
      const items = Array.isArray(payload.rows) ? payload.rows : [];

      items.forEach((item) => {
        const key = item.name;
        const current = map.get(key) || {
          name: item.name,
          category: item.category || "Uncategorized",
          soldQty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };

        current.soldQty += Number(item.soldQty || 0);
        current.revenue += Number(item.revenue || 0);
        current.cost += Number(item.cogs || 0);
        current.profit += Number(item.profit || 0);

        map.set(key, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredRows]);

  const topDishes = dishPerformance.slice(0, 8);
  const weakestDishes = [...dishPerformance]
    .filter((item) => item.soldQty > 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const dashboardInsights = useMemo(() => {
    const insights = [];

    if (!filteredRows.length) {
      insights.push("No saved days yet. Start by saving completed days from the control center.");
      return insights;
    }

    if (bestDay) {
      insights.push(
        `Best recorded day is ${bestDay.date} with gross profit of ${formatCurrency(
          bestDay.profit
        )}.`
      );
    }

    if (worstDay) {
      insights.push(
        `Weakest recorded day is ${worstDay.date} with gross profit of ${formatCurrency(
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
        )}. Upsell follow-up on drinks and dessert should be improved.`
      );
    }

    if (avgTicketTime > 20) {
      insights.push(
        `Average ticket time is ${formatNumber(
          avgTicketTime
        )} minutes. Service flow needs management attention.`
      );
    }

    if (topDishes[0]) {
      insights.push(
        `${topDishes[0].name} is the strongest sales driver at ${formatCurrency(
          topDishes[0].revenue
        )} in revenue across the selected period.`
      );
    }

    if (weakestDishes[0]) {
      insights.push(
        `${weakestDishes[0].name} is the weakest gross-profit performer among active dishes and should be reviewed.`
      );
    }

    return insights.slice(0, 6);
  }, [
    avgSecondRoundRate,
    avgTicketTime,
    bestDay,
    filteredRows,
    overallFoodCost,
    topDishes,
    weakestDishes,
    worstDay,
  ]);

  const ownerStatus = useMemo(() => {
    if (!filteredRows.length) {
      return { status: "NO DATA", score: 0, bg: "rgba(255,255,255,0.06)", color: THEME.muted };
    }

    let score = 0;

    score += overallFoodCost <= 0.3 ? 30 : overallFoodCost <= 0.35 ? 18 : 0;
    score += overallMargin >= 0.55 ? 25 : overallMargin >= 0.45 ? 15 : 0;
    score += avgSecondRoundRate >= 0.6 ? 20 : avgSecondRoundRate >= 0.45 ? 12 : 0;
    score += avgTicketTime > 0 && avgTicketTime <= 15 ? 15 : avgTicketTime <= 20 ? 8 : 0;
    score += totals.complaints === 0 ? 10 : totals.complaints <= 3 ? 5 : 0;

    if (score >= 75) {
      return { status: "GOOD", score, ...getStatusTone("GOOD") };
    }

    if (score >= 50) {
      return { status: "WARNING", score, ...getStatusTone("WARNING") };
    }

    return { status: "BAD", score, ...getStatusTone("BAD") };
  }, [
    avgSecondRoundRate,
    avgTicketTime,
    filteredRows,
    overallFoodCost,
    overallMargin,
    totals.complaints,
  ]);

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
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              color: THEME.muted,
            }}
          >
            Loading dashboard...
          </div>
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
                subValue={`${filteredRows.length} saved day(s)`}
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
                gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.85fr)",
                gap: 18,
              }}
            >
              <TableCard
                title="Financial Overview"
                subtitle="Owner view across the selected period."
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Food Cost %</div>
                    <div style={metricValueStyle}>{formatPercent(overallFoodCost)}</div>
                  </div>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Gross Margin</div>
                    <div style={metricValueStyle}>{formatPercent(overallMargin)}</div>
                  </div>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Drink Revenue</div>
                    <div style={metricValueStyle}>{formatCurrency(totals.drinkRevenue)}</div>
                  </div>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Avg Ticket Time</div>
                    <div style={metricValueStyle}>{formatNumber(avgTicketTime)} min</div>
                  </div>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Second Round Rate</div>
                    <div style={metricValueStyle}>{formatPercent(avgSecondRoundRate)}</div>
                  </div>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Complaints</div>
                    <div style={metricValueStyle}>{formatNumber(totals.complaints)}</div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    background: THEME.panelSoft,
                    borderRadius: 18,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ color: THEME.muted, fontSize: 12 }}>Current Owner Status</div>
                      <div style={{ color: THEME.text, fontSize: 18, fontWeight: 800 }}>
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
                </div>
              </TableCard>

              <TableCard
                title="Best vs Worst Day"
                subtitle="Fast owner reading of daily performance."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Best Day</div>
                    <div style={metricValueStyle}>{bestDay ? bestDay.date : "-"}</div>
                    <div style={metricSubStyle}>
                      {bestDay
                        ? `${formatCurrency(bestDay.revenue)} revenue | ${formatCurrency(
                            bestDay.profit
                          )} profit`
                        : "No data"}
                    </div>
                  </div>

                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Worst Day</div>
                    <div style={metricValueStyle}>{worstDay ? worstDay.date : "-"}</div>
                    <div style={metricSubStyle}>
                      {worstDay
                        ? `${formatCurrency(worstDay.revenue)} revenue | ${formatCurrency(
                            worstDay.profit
                          )} profit`
                        : "No data"}
                    </div>
                  </div>

                  <div style={metricPanelStyle}>
                    <div style={metricLabelStyle}>Latest Saved Day</div>
                    <div style={metricValueStyle}>{latestDay ? latestDay.date : "-"}</div>
                    <div style={metricSubStyle}>
                      {latestDay
                        ? `${formatCurrency(latestDay.revenue)} revenue | ${formatCurrency(
                            latestDay.profit
                          )} profit`
                        : "No data"}
                    </div>
                  </div>
                </div>
              </TableCard>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
                gap: 18,
              }}
            >
              <TableCard
                title="Revenue Trend"
                subtitle="Latest 10 saved days based on /api/history."
              >
                {dailyTrend.length ? (
                  <div
                    style={{
                      height: 280,
                      display: "grid",
                      gridTemplateColumns: `repeat(${dailyTrend.length}, minmax(0, 1fr))`,
                      gap: 10,
                      alignItems: "end",
                    }}
                  >
                    {dailyTrend.map((item) => (
                      <div
                        key={item.id || item.date}
                        style={{
                          display: "grid",
                          gap: 8,
                          alignItems: "end",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            height: 200,
                            display: "flex",
                            alignItems: "end",
                          }}
                        >
                          <div
                            title={`${item.date} | ${formatCurrency(item.revenue)}`}
                            style={{
                              width: "100%",
                              height: item.revenueHeight,
                              background: "linear-gradient(180deg, rgba(249,115,22,0.95), rgba(249,115,22,0.35))",
                              borderRadius: "14px 14px 6px 6px",
                              border: `1px solid ${THEME.accentSoft}`,
                            }}
                          />
                        </div>
                        <div style={{ color: THEME.text, fontSize: 11, fontWeight: 700 }}>
                          {formatCurrency(item.revenue)}
                        </div>
                        <div style={{ color: THEME.muted, fontSize: 11 }}>
                          {item.date}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.muted, fontSize: 14 }}>
                    No saved days available for trend view.
                  </div>
                )}
              </TableCard>

              <TableCard
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
              </TableCard>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
                gap: 18,
              }}
            >
              <TableCard
                title="Top Dishes"
                subtitle="Highest revenue contributors across the selected period."
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
                        {["Dish", "Category", "Qty Sold", "Revenue", "Cost", "Gross Profit"].map(
                          (heading) => (
                            <th key={heading} style={tableHeadStyle}>
                              {heading}
                            </th>
                          )
                        )}
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
                            No dish data found yet in saved reports.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableCard>

              <TableCard
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
                          <div style={{ color: THEME.text, fontSize: 15, fontWeight: 700 }}>
                            {item.name}
                          </div>
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
              </TableCard>
            </div>

            <TableCard
              title="Saved Days"
              subtitle="Direct business history for owner review."
            >
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 760,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Revenue",
                        "Cost",
                        "Profit",
                        "Margin",
                        "Covers",
                        "Drink Revenue",
                        "Status",
                      ].map((heading) => (
                        <th key={heading} style={tableHeadStyle}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length ? (
                      filteredRows.map((row) => {
                        const meta = row.dishes?.meta || {};
                        const owner = meta.ownerStatus || {};
                        const tone = getStatusTone(owner.status || "WARNING");

                        return (
                          <tr key={row.id || row.date}>
                            <td style={tableCellStrongStyle}>{row.date}</td>
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
                            <td style={tableCellStyle}>
                              {formatPercent(getMargin(row.revenue, row.profit))}
                            </td>
                            <td style={tableCellStyle}>{formatNumber(meta.covers || 0)}</td>
                            <td style={tableCellStyle}>
                              {formatCurrency(meta.drinkRevenue || 0)}
                            </td>
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
                                {owner.status || "N/A"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} style={emptyCellStyle}>
                          No saved reports available in the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TableCard>
          </>
        ) : null}
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.85fr)"],
          div[style*="grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr)"],
          div[style*="grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const metricPanelStyle = {
  background: THEME.panelSoft,
  borderRadius: 16,
  padding: 14,
};

const metricLabelStyle = {
  color: THEME.muted,
  fontSize: 12,
};

const metricValueStyle = {
  color: THEME.text,
  fontSize: 20,
  fontWeight: 800,
  marginTop: 6,
};

const metricSubStyle = {
  color: THEME.muted,
  fontSize: 12,
  marginTop: 6,
};

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