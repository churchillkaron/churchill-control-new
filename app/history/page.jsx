"use client";

import { useEffect, useMemo, useState } from "react";

export default function HistoryPage() {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/history", {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error("Failed to load history");
        }

        const data = await res.json();

        const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];

        if (!ignore) {
          setReports(rows);

          if (rows.length > 0) {
            setSelectedReport(rows[0]);
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Something went wrong while loading history.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      ignore = true;
    };
  }, []);

  const summary = useMemo(() => {
    const totalRevenue = reports.reduce((sum, report) => sum + toNumber(report?.revenue), 0);
    const totalCost = reports.reduce((sum, report) => sum + toNumber(report?.cost), 0);
    const totalProfit = reports.reduce((sum, report) => sum + toNumber(report?.profit), 0);

    return {
      days: reports.length,
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
    };
  }, [reports]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Churchill Control System</p>
            <h1 style={styles.title}>History</h1>
            <p style={styles.subtitle}>
              Review previous daily reports with totals and dish-level breakdown.
            </p>
          </div>
        </header>

        <section style={styles.summaryGrid}>
          <SummaryCard label="Saved Days" value={String(summary.days)} />
          <SummaryCard label="Total Revenue" value={formatCurrency(summary.revenue)} />
          <SummaryCard label="Total Cost" value={formatCurrency(summary.cost)} />
          <SummaryCard label="Total Profit" value={formatCurrency(summary.profit)} />
        </section>

        {loading ? (
          <div style={styles.messageCard}>Loading history...</div>
        ) : error ? (
          <div style={styles.errorCard}>{error}</div>
        ) : reports.length === 0 ? (
          <div style={styles.messageCard}>No saved history found yet.</div>
        ) : (
          <div style={styles.contentGrid}>
            <section style={styles.listPanel}>
              <div style={styles.panelHeader}>
                <h2 style={styles.panelTitle}>Saved Reports</h2>
                <span style={styles.panelCount}>{reports.length} total</span>
              </div>

              <div style={styles.reportList}>
                {reports.map((report) => {
                  const isActive = selectedReport?.id === report.id;

                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedReport(report)}
                      style={{
                        ...styles.reportButton,
                        ...(isActive ? styles.reportButtonActive : {}),
                      }}
                    >
                      <div style={styles.reportButtonTop}>
                        <strong style={styles.reportDate}>{formatDate(report?.date)}</strong>
                        <span style={styles.reportProfit}>
                          {formatCurrency(toNumber(report?.profit))}
                        </span>
                      </div>

                      <div style={styles.reportButtonBottom}>
                        <span>Revenue: {formatCurrency(toNumber(report?.revenue))}</span>
                        <span>Cost: {formatCurrency(toNumber(report?.cost))}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={styles.detailPanel}>
              {selectedReport ? (
                <>
                  <div style={styles.panelHeader}>
                    <div>
                      <h2 style={styles.panelTitle}>Report Details</h2>
                      <p style={styles.detailDate}>{formatDate(selectedReport?.date)}</p>
                    </div>
                  </div>

                  <div style={styles.detailTotalsGrid}>
                    <DetailStat label="Revenue" value={formatCurrency(toNumber(selectedReport?.revenue))} />
                    <DetailStat label="Cost" value={formatCurrency(toNumber(selectedReport?.cost))} />
                    <DetailStat label="Profit" value={formatCurrency(toNumber(selectedReport?.profit))} />
                  </div>

                  <div style={styles.breakdownCard}>
                    <div style={styles.breakdownHeader}>
                      <h3 style={styles.breakdownTitle}>Dish Breakdown</h3>
                      <span style={styles.breakdownCount}>
                        {normalizeDishes(selectedReport?.dishes).length} items
                      </span>
                    </div>

                    {normalizeDishes(selectedReport?.dishes).length === 0 ? (
                      <div style={styles.emptyBreakdown}>No dish details saved for this day.</div>
                    ) : (
                      <div style={styles.tableWrap}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.th}>Dish</th>
                              <th style={styles.thCenter}>Qty</th>
                              <th style={styles.thRight}>Price</th>
                              <th style={styles.thRight}>Cost</th>
                              <th style={styles.thRight}>Revenue</th>
                              <th style={styles.thRight}>Total Cost</th>
                              <th style={styles.thRight}>Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {normalizeDishes(selectedReport?.dishes).map((dish, index) => {
                              const quantity = Math.max(1, toNumber(dish?.quantity || 1));
                              const price = toNumber(dish?.price);
                              const cost = toNumber(dish?.cost);
                              const revenue = price * quantity;
                              const totalCost = cost * quantity;
                              const profit = revenue - totalCost;

                              return (
                                <tr key={`${dish?.name || "dish"}-${index}`} style={styles.tr}>
                                  <td style={styles.tdName}>{dish?.name || dish?.dish || "Unnamed dish"}</td>
                                  <td style={styles.tdCenter}>{quantity}</td>
                                  <td style={styles.tdRight}>{formatCurrency(price)}</td>
                                  <td style={styles.tdRight}>{formatCurrency(cost)}</td>
                                  <td style={styles.tdRight}>{formatCurrency(revenue)}</td>
                                  <td style={styles.tdRight}>{formatCurrency(totalCost)}</td>
                                  <td style={styles.tdRight}>{formatCurrency(profit)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={styles.metaCard}>
                    <div style={styles.metaRow}>
                      <span style={styles.metaLabel}>Report ID</span>
                      <span style={styles.metaValue}>{selectedReport?.id ?? "-"}</span>
                    </div>
                    <div style={styles.metaRow}>
                      <span style={styles.metaLabel}>Created</span>
                      <span style={styles.metaValue}>
                        {selectedReport?.created_at
                          ? new Date(selectedReport.created_at).toLocaleString()
                          : "-"}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={styles.messageCard}>Select a report to view details.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function DetailStat({ label, value }) {
  return (
    <div style={styles.detailStat}>
      <div style={styles.detailStatLabel}>{label}</div>
      <div style={styles.detailStatValue}>{value}</div>
    </div>
  );
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDate(value) {
  if (!value) return "No date";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
}

function normalizeDishes(dishes) {
  if (Array.isArray(dishes)) return dishes;

  if (typeof dishes === "string") {
    try {
      const parsed = JSON.parse(dishes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "32px 16px",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "24px",
  },
  eyebrow: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  title: {
    margin: "6px 0 8px 0",
    fontSize: "36px",
    fontWeight: 800,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    fontSize: "16px",
    color: "#475569",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  summaryCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e2e8f0",
  },
  summaryLabel: {
    fontSize: "14px",
    color: "#64748b",
    marginBottom: "8px",
  },
  summaryValue: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#0f172a",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: "20px",
    alignItems: "start",
  },
  listPanel: {
    background: "#ffffff",
    borderRadius: "20px",
    padding: "18px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  detailPanel: {
    background: "#ffffff",
    borderRadius: "20px",
    padding: "20px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 800,
    color: "#0f172a",
  },
  panelCount: {
    fontSize: "13px",
    color: "#64748b",
    fontWeight: 700,
    background: "#f1f5f9",
    padding: "6px 10px",
    borderRadius: "999px",
  },
  reportList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "70vh",
    overflowY: "auto",
    paddingRight: "4px",
  },
  reportButton: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
    background: "#ffffff",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  reportButtonActive: {
    border: "1px solid #0f172a",
    background: "#f8fafc",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  },
  reportButtonTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "8px",
  },
  reportButtonBottom: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "13px",
    color: "#64748b",
  },
  reportDate: {
    color: "#0f172a",
    fontSize: "16px",
  },
  reportProfit: {
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: 700,
  },
  detailDate: {
    margin: "6px 0 0 0",
    color: "#64748b",
    fontSize: "15px",
  },
  detailTotalsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },
  detailStat: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "16px",
  },
  detailStatLabel: {
    fontSize: "13px",
    color: "#64748b",
    marginBottom: "8px",
  },
  detailStatValue: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#0f172a",
  },
  breakdownCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    overflow: "hidden",
    background: "#ffffff",
    marginBottom: "18px",
  },
  breakdownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "16px 18px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  breakdownTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 800,
    color: "#0f172a",
  },
  breakdownCount: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#64748b",
  },
  emptyBreakdown: {
    padding: "18px",
    color: "#64748b",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "900px",
  },
  th: {
    textAlign: "left",
    fontSize: "13px",
    fontWeight: 800,
    color: "#475569",
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#ffffff",
  },
  thCenter: {
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 800,
    color: "#475569",
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#ffffff",
  },
  thRight: {
    textAlign: "right",
    fontSize: "13px",
    fontWeight: 800,
    color: "#475569",
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#ffffff",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
  },
  tdName: {
    padding: "14px 16px",
    color: "#0f172a",
    fontWeight: 600,
  },
  tdCenter: {
    padding: "14px 16px",
    textAlign: "center",
    color: "#334155",
  },
  tdRight: {
    padding: "14px 16px",
    textAlign: "right",
    color: "#334155",
  },
  metaCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    background: "#ffffff",
    overflow: "hidden",
  },
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px 16px",
    borderBottom: "1px solid #f1f5f9",
  },
  metaLabel: {
    color: "#64748b",
    fontSize: "14px",
    fontWeight: 600,
  },
  metaValue: {
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: 600,
    textAlign: "right",
  },
  messageCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "24px",
    color: "#475569",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  errorCard: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    borderRadius: "20px",
    padding: "24px",
    color: "#be123c",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
};