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

  if (status === "BAD") {
    return {
      bg: "rgba(239,68,68,0.14)",
      color: THEME.red,
    };
  }

  return {
    bg: "rgba(255,255,255,0.06)",
    color: THEME.muted,
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
        minHeight: 104,
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

function MobileHistoryCard({ row, onToggle, expanded }) {
  const meta = row.dishes?.meta || {};
  const items = Array.isArray(row.dishes?.rows) ? row.dishes.rows : [];
  const insights = Array.isArray(row.dishes?.insights) ? row.dishes.insights : [];
  const tone = getStatusTone(meta.ownerStatus?.status);

  const topDish = [...items].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];

  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: THEME.khaki, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Saved Day
          </div>
          <div style={{ color: THEME.text, fontSize: 18, fontWeight: 700 }}>{row.date}</div>
        </div>

        <div
          style={{
            background: tone.bg,
            color: tone.color,
            borderRadius: 999,
            padding: "7px 10px",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {meta.ownerStatus?.status || "N/A"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Revenue</div>
          <div style={miniValueStyle}>{formatCurrency(row.revenue)}</div>
        </div>
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Cost</div>
          <div style={miniValueStyle}>{formatCurrency(row.cost)}</div>
        </div>
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Profit</div>
          <div style={{ ...miniValueStyle, color: row.profit >= 0 ? THEME.green : THEME.red }}>
            {formatCurrency(row.profit)}
          </div>
        </div>
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Margin</div>
          <div style={miniValueStyle}>{formatPercent(getMargin(row.revenue, row.profit))}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Covers</div>
          <div style={miniValueStyle}>{formatNumber(meta.covers || 0)}</div>
        </div>
        <div style={miniBoxStyle}>
          <div style={miniLabelStyle}>Drink Revenue</div>
          <div style={miniValueStyle}>{formatCurrency(meta.drinkRevenue || 0)}</div>
        </div>
      </div>

      <div style={{ color: THEME.muted, fontSize: 12, lineHeight: 1.6 }}>
        {topDish
          ? `Top dish: ${topDish.name} | ${formatCurrency(topDish.revenue)} revenue`
          : "No saved dish detail available for this day."}
      </div>

      <button
        onClick={onToggle}
        style={{
          border: "none",
          background: THEME.accent,
          color: "#ffffff",
          padding: "11px 14px",
          borderRadius: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {expanded ? "Hide Details" : "View Details"}
      </button>

      {expanded ? (
        <div
          style={{
            display: "grid",
            gap: 14,
            borderTop: `1px solid ${THEME.border}`,
            paddingTop: 14,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: THEME.text, fontSize: 14, fontWeight: 700 }}>Shift Details</div>
            <div style={detailBoxStyle}>
              Avg Ticket Time: {formatNumber(meta.avgTicketTime || 0)} min
            </div>
            <div style={detailBoxStyle}>
              Second Round Rate: {formatPercent(meta.secondRoundRate || 0)}
            </div>
            <div style={detailBoxStyle}>
              Complaints: {formatNumber(meta.complaints || 0)}
            </div>
            <div style={detailBoxStyle}>
              Notes: {meta.managerNotes || "No notes saved."}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: THEME.text, fontSize: 14, fontWeight: 700 }}>AI Insights</div>
            {insights.length ? (
              insights.slice(0, 4).map((insight, index) => (
                <div key={`${row.id}-insight-${index}`} style={detailBoxStyle}>
                  {insight}
                </div>
              ))
            ) : (
              <div style={detailBoxStyle}>No AI insights saved for this day.</div>
            )}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: THEME.text, fontSize: 14, fontWeight: 700 }}>Top Dishes</div>
            {items.length ? (
              [...items]
                .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={`${row.id}-${item.name}`}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 14,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ color: THEME.text, fontSize: 14, fontWeight: 700 }}>{item.name}</div>
                      <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
                        Qty {formatNumber(item.soldQty || 0)} | Profit {formatCurrency(item.profit || 0)}
                      </div>
                    </div>
                    <div style={{ color: THEME.accent, fontSize: 13, fontWeight: 700 }}>
                      {formatCurrency(item.revenue || 0)}
                    </div>
                  </div>
                ))
            ) : (
              <div style={detailBoxStyle}>No dish breakdown saved for this day.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HistoryPage() {
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
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
          throw new Error(data?.error || "Failed to load saved history.");
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
        setLoadError(error.message || "History failed to load.");
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
    let rows = [...historyRows];

    if (periodFilter === "7d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 7);
      rows = rows.filter((row) => new Date(row.date) >= threshold);
    }

    if (periodFilter === "30d") {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 30);
      rows = rows.filter((row) => new Date(row.date) >= threshold);
    }

    if (search.trim()) {
      const term = search.toLowerCase();

      rows = rows.filter((row) => {
        const notes = row.dishes?.meta?.managerNotes || "";
        const items = Array.isArray(row.dishes?.rows) ? row.dishes.rows : [];

        return (
          row.date?.toLowerCase().includes(term) ||
          notes.toLowerCase().includes(term) ||
          items.some(
            (item) =>
              item.name?.toLowerCase().includes(term) ||
              item.category?.toLowerCase().includes(term)
          )
        );
      });
    }

    return rows;
  }, [historyRows, periodFilter, search]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const meta = row.dishes?.meta || {};

        acc.revenue += row.revenue || 0;
        acc.cost += row.cost || 0;
        acc.profit += row.profit || 0;
        acc.covers += Number(meta.covers || 0);
        acc.drinkRevenue += Number(meta.drinkRevenue || 0);

        return acc;
      },
      {
        revenue: 0,
        cost: 0,
        profit: 0,
        covers: 0,
        drinkRevenue: 0,
      }
    );
  }, [filteredRows]);

  const avgMargin = totals.revenue > 0 ? totals.profit / totals.revenue : 0;
  const revenuePerCover = totals.covers > 0 ? totals.revenue / totals.covers : 0;

  const bestDay = useMemo(() => {
    if (!filteredRows.length) return null;
    return [...filteredRows].sort((a, b) => b.profit - a.profit)[0];
  }, [filteredRows]);

  const worstDay = useMemo(() => {
    if (!filteredRows.length) return null;
    return [...filteredRows].sort((a, b) => a.profit - b.profit)[0];
  }, [filteredRows]);

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
              History Archive | Saved Days, Revenue, Cost, Profit, Margin
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <SummaryCard
            label="Saved Days"
            value={formatNumber(filteredRows.length)}
            subValue="Archive entries in current filter"
            accent
          />
          <SummaryCard
            label="Total Revenue"
            value={formatCurrency(totals.revenue)}
            subValue={`Drink Revenue ${formatCurrency(totals.drinkRevenue)}`}
          />
          <SummaryCard
            label="Total Cost"
            value={formatCurrency(totals.cost)}
            subValue={`Average Margin ${formatPercent(avgMargin)}`}
          />
          <SummaryCard
            label="Total Profit"
            value={formatCurrency(totals.profit)}
            subValue={`Revenue / Cover ${formatCurrency(revenuePerCover)}`}
          />
          <SummaryCard
            label="Best Day"
            value={bestDay ? bestDay.date : "-"}
            subValue={bestDay ? formatCurrency(bestDay.profit) : "No data"}
          />
          <SummaryCard
            label="Worst Day"
            value={worstDay ? worstDay.date : "-"}
            subValue={worstDay ? formatCurrency(worstDay.profit) : "No data"}
          />
        </div>

        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 22,
            padding: 18,
            minWidth: 0,
          }}
        >
          <SectionTitle
            title="Saved Day Archive"
            subtitle="Fast review of all completed days with mobile cards on smaller screens and a full table on desktop."
            right={
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search date, notes, dish, or category"
                style={{
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#101010",
                  color: THEME.text,
                  padding: "10px 12px",
                  minWidth: 220,
                  outline: "none",
                }}
              />
            }
          />

          {loading ? (
            <div
              style={{
                background: THEME.panelSoft,
                borderRadius: 16,
                padding: 16,
                color: THEME.muted,
              }}
            >
              Loading history...
            </div>
          ) : null}

          {!loading && loadError ? (
            <div
              style={{
                background: "rgba(239,68,68,0.12)",
                border: `1px solid rgba(239,68,68,0.2)`,
                borderRadius: 16,
                padding: 16,
                color: THEME.red,
                fontWeight: 600,
              }}
            >
              {loadError}
            </div>
          ) : null}

          {!loading && !loadError ? (
            <>
              <div className="desktop-table-wrap" style={{ overflowX: "auto", display: "none" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 1040,
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
                        "Ticket Time",
                        "2nd Round",
                        "Complaints",
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
                        const tone = getStatusTone(meta.ownerStatus?.status);

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
                              {formatNumber(meta.avgTicketTime || 0)} min
                            </td>
                            <td style={tableCellStyle}>
                              {formatPercent(meta.secondRoundRate || 0)}
                            </td>
                            <td style={tableCellStyle}>
                              {formatNumber(meta.complaints || 0)}
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
                                {meta.ownerStatus?.status || "N/A"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} style={emptyCellStyle}>
                          No saved reports available in the selected filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mobile-cards" style={{ display: "grid", gap: 14 }}>
                {filteredRows.length ? (
                  filteredRows.map((row) => (
                    <MobileHistoryCard
                      key={row.id || row.date}
                      row={row}
                      expanded={expandedId === row.id}
                      onToggle={() =>
                        setExpandedId((current) => (current === row.id ? null : row.id))
                      }
                    />
                  ))
                ) : (
                  <div
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 16,
                      padding: 16,
                      color: THEME.muted,
                    }}
                  >
                    No saved reports available in the selected filter.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 1100px) {
          .desktop-table-wrap {
            display: block !important;
          }
          .mobile-cards {
            display: none !important;
          }
        }

        @media (max-width: 1099px) {
          .desktop-table-wrap {
            display: none !important;
          }
          .mobile-cards {
            display: grid !important;
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

const miniBoxStyle = {
  background: THEME.panelSoft,
  borderRadius: 14,
  padding: 12,
};

const miniLabelStyle = {
  color: THEME.muted,
  fontSize: 11,
};

const miniValueStyle = {
  color: THEME.text,
  fontSize: 16,
  fontWeight: 700,
  marginTop: 6,
};

const detailBoxStyle = {
  background: THEME.panelSoft,
  borderRadius: 14,
  padding: 12,
  color: THEME.muted,
  fontSize: 13,
  lineHeight: 1.6,
};