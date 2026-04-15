"use client";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/history", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to load dashboard.");
      }

      setReports(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      setMessage(error.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-CA").format(date);
  };

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const aTime = new Date(a.date || a.created_at).getTime();
      const bTime = new Date(b.date || b.created_at).getTime();
      return bTime - aTime;
    });
  }, [reports]);

  const analytics = useMemo(() => {
    const last7 = sortedReports.slice(0, 7);
    const today = sortedReports[0] || null;
    const yesterday = sortedReports[1] || null;

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalDishQty = 0;

    const dishMap = {};

    sortedReports.forEach((report) => {
      const reportDishes = Array.isArray(report.dishes) ? report.dishes : [];

      reportDishes.forEach((dish) => {
        const name = String(dish.name || "").trim();
        if (!name) return;

        const qty = Number(dish.qty) || 0;
        const price = Number(dish.price) || 0;
        const cost = Number(dish.cost) || 0;
        const revenue =
          typeof dish.revenue !== "undefined"
            ? Number(dish.revenue) || 0
            : qty * price;
        const profit =
          typeof dish.profit !== "undefined"
            ? Number(dish.profit) || 0
            : revenue - qty * cost;

        if (!dishMap[name]) {
          dishMap[name] = {
            name,
            qty: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
            timesSold: 0,
          };
        }

        dishMap[name].qty += qty;
        dishMap[name].revenue += revenue;
        dishMap[name].cost += qty * cost;
        dishMap[name].profit += profit;
        dishMap[name].timesSold += 1;

        totalDishQty += qty;
      });
    });

    last7.forEach((report) => {
      totalRevenue += Number(report.revenue) || 0;
      totalCost += Number(report.cost) || 0;
      totalProfit += Number(report.profit) || 0;
    });

    const averageRevenue = last7.length ? totalRevenue / last7.length : 0;
    const averageProfit = last7.length ? totalProfit / last7.length : 0;

    let bestDay = null;
    let worstDay = null;

    last7.forEach((report) => {
      const reportProfit = Number(report.profit) || 0;

      if (!bestDay || reportProfit > (Number(bestDay.profit) || 0)) {
        bestDay = report;
      }

      if (!worstDay || reportProfit < (Number(worstDay.profit) || 0)) {
        worstDay = report;
      }
    });

    const allDishes = Object.values(dishMap);

    const topProfitDishes = [...allDishes]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const worstDishes = [...allDishes]
      .filter((dish) => dish.profit <= 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);

    const topSellingDishes = [...allDishes]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      today,
      yesterday,
      last7,
      totalRevenue,
      totalCost,
      totalProfit,
      averageRevenue,
      averageProfit,
      bestDay,
      worstDay,
      totalDishQty,
      totalSavedDays: sortedReports.length,
      topProfitDishes,
      worstDishes,
      topSellingDishes,
    };
  }, [sortedReports]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerBlock}>
          <div>
            <p style={styles.eyebrow}>Churchill Control System</p>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>
              Owner overview for revenue, profit, best dishes, and weak spots.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={styles.emptyState}>Loading dashboard...</div>
        ) : message ? (
          <div style={styles.errorBox}>{message}</div>
        ) : reports.length === 0 ? (
          <div style={styles.emptyState}>No saved reports yet.</div>
        ) : (
          <>
            <div style={styles.grid4}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>7-Day Revenue</span>
                <strong style={styles.metricValue}>
                  {formatMoney(analytics.totalRevenue)}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>7-Day Cost</span>
                <strong style={styles.metricValue}>
                  {formatMoney(analytics.totalCost)}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>7-Day Profit</span>
                <strong
                  style={{
                    ...styles.metricValue,
                    color: analytics.totalProfit < 0 ? "#b42318" : "#067647",
                  }}
                >
                  {formatMoney(analytics.totalProfit)}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Total Dishes Sold</span>
                <strong style={styles.metricValue}>{analytics.totalDishQty}</strong>
              </div>
            </div>

            <div style={styles.grid4}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Average Daily Revenue</span>
                <strong style={styles.metricValue}>
                  {formatMoney(analytics.averageRevenue)}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Average Daily Profit</span>
                <strong
                  style={{
                    ...styles.metricValue,
                    color: analytics.averageProfit < 0 ? "#b42318" : "#067647",
                  }}
                >
                  {formatMoney(analytics.averageProfit)}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Saved Days</span>
                <strong style={styles.metricValue}>
                  {analytics.totalSavedDays}
                </strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Reports in 7-Day View</span>
                <strong style={styles.metricValue}>
                  {analytics.last7.length}
                </strong>
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Today vs Yesterday</div>
                <div style={styles.compareGrid}>
                  <div style={styles.compareCard}>
                    <div style={styles.compareHeading}>Latest Day</div>
                    {analytics.today ? (
                      <>
                        <div style={styles.compareDate}>
                          {formatDate(analytics.today.date)}
                        </div>
                        <div style={styles.compareLine}>
                          Revenue: {formatMoney(analytics.today.revenue)}
                        </div>
                        <div style={styles.compareLine}>
                          Cost: {formatMoney(analytics.today.cost)}
                        </div>
                        <div
                          style={{
                            ...styles.compareLine,
                            color:
                              Number(analytics.today.profit) < 0
                                ? "#b42318"
                                : "#067647",
                          }}
                        >
                          Profit: {formatMoney(analytics.today.profit)}
                        </div>
                      </>
                    ) : (
                      <div style={styles.compareLine}>No data</div>
                    )}
                  </div>

                  <div style={styles.compareCard}>
                    <div style={styles.compareHeading}>Previous Day</div>
                    {analytics.yesterday ? (
                      <>
                        <div style={styles.compareDate}>
                          {formatDate(analytics.yesterday.date)}
                        </div>
                        <div style={styles.compareLine}>
                          Revenue: {formatMoney(analytics.yesterday.revenue)}
                        </div>
                        <div style={styles.compareLine}>
                          Cost: {formatMoney(analytics.yesterday.cost)}
                        </div>
                        <div
                          style={{
                            ...styles.compareLine,
                            color:
                              Number(analytics.yesterday.profit) < 0
                                ? "#b42318"
                                : "#067647",
                          }}
                        >
                          Profit: {formatMoney(analytics.yesterday.profit)}
                        </div>
                      </>
                    ) : (
                      <div style={styles.compareLine}>No data</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={styles.panel}>
                <div style={styles.panelTitle}>Best and Worst Day (Last 7)</div>
                <div style={styles.compareGrid}>
                  <div style={styles.compareCard}>
                    <div style={styles.compareHeading}>Best Day</div>
                    {analytics.bestDay ? (
                      <>
                        <div style={styles.compareDate}>
                          {formatDate(analytics.bestDay.date)}
                        </div>
                        <div style={styles.compareLine}>
                          Revenue: {formatMoney(analytics.bestDay.revenue)}
                        </div>
                        <div
                          style={{
                            ...styles.compareLine,
                            color: "#067647",
                          }}
                        >
                          Profit: {formatMoney(analytics.bestDay.profit)}
                        </div>
                      </>
                    ) : (
                      <div style={styles.compareLine}>No data</div>
                    )}
                  </div>

                  <div style={styles.compareCard}>
                    <div style={styles.compareHeading}>Worst Day</div>
                    {analytics.worstDay ? (
                      <>
                        <div style={styles.compareDate}>
                          {formatDate(analytics.worstDay.date)}
                        </div>
                        <div style={styles.compareLine}>
                          Revenue: {formatMoney(analytics.worstDay.revenue)}
                        </div>
                        <div
                          style={{
                            ...styles.compareLine,
                            color:
                              Number(analytics.worstDay.profit) < 0
                                ? "#b42318"
                                : "#101828",
                          }}
                        >
                          Profit: {formatMoney(analytics.worstDay.profit)}
                        </div>
                      </>
                    ) : (
                      <div style={styles.compareLine}>No data</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Top Profit Dishes</div>
                {analytics.topProfitDishes.length === 0 ? (
                  <div style={styles.emptyPanel}>No dish data available.</div>
                ) : (
                  <div style={styles.tableWrap}>
                    <div style={styles.tableHeader}>
                      <div style={{ ...styles.headerCell, flex: 2 }}>Dish</div>
                      <div style={styles.headerCell}>Qty</div>
                      <div style={styles.headerCell}>Revenue</div>
                      <div style={styles.headerCell}>Profit</div>
                    </div>

                    {analytics.topProfitDishes.map((dish) => (
                      <div key={dish.name} style={styles.tableRow}>
                        <div style={{ ...styles.bodyCell, flex: 2 }}>
                          {dish.name}
                        </div>
                        <div style={styles.bodyCell}>{dish.qty}</div>
                        <div style={styles.bodyCell}>
                          {formatMoney(dish.revenue)}
                        </div>
                        <div
                          style={{
                            ...styles.bodyCell,
                            color: dish.profit < 0 ? "#b42318" : "#067647",
                          }}
                        >
                          {formatMoney(dish.profit)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.panel}>
                <div style={styles.panelTitle}>Worst Dishes</div>
                {analytics.worstDishes.length === 0 ? (
                  <div style={styles.emptyPanel}>
                    No loss-making dishes found.
                  </div>
                ) : (
                  <div style={styles.tableWrap}>
                    <div style={styles.tableHeader}>
                      <div style={{ ...styles.headerCell, flex: 2 }}>Dish</div>
                      <div style={styles.headerCell}>Qty</div>
                      <div style={styles.headerCell}>Revenue</div>
                      <div style={styles.headerCell}>Profit</div>
                    </div>

                    {analytics.worstDishes.map((dish) => (
                      <div key={dish.name} style={styles.tableRow}>
                        <div style={{ ...styles.bodyCell, flex: 2 }}>
                          {dish.name}
                        </div>
                        <div style={styles.bodyCell}>{dish.qty}</div>
                        <div style={styles.bodyCell}>
                          {formatMoney(dish.revenue)}
                        </div>
                        <div
                          style={{
                            ...styles.bodyCell,
                            color: "#b42318",
                          }}
                        >
                          {formatMoney(dish.profit)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelTitle}>Top Selling Dishes</div>
              {analytics.topSellingDishes.length === 0 ? (
                <div style={styles.emptyPanel}>No dish data available.</div>
              ) : (
                <div style={styles.tableWrap}>
                  <div style={styles.tableHeader}>
                    <div style={{ ...styles.headerCell, flex: 2 }}>Dish</div>
                    <div style={styles.headerCell}>Qty</div>
                    <div style={styles.headerCell}>Revenue</div>
                    <div style={styles.headerCell}>Profit</div>
                    <div style={styles.headerCell}>Times Sold</div>
                  </div>

                  {analytics.topSellingDishes.map((dish) => (
                    <div key={dish.name} style={styles.tableRow}>
                      <div style={{ ...styles.bodyCell, flex: 2 }}>
                        {dish.name}
                      </div>
                      <div style={styles.bodyCell}>{dish.qty}</div>
                      <div style={styles.bodyCell}>
                        {formatMoney(dish.revenue)}
                      </div>
                      <div
                        style={{
                          ...styles.bodyCell,
                          color: dish.profit < 0 ? "#b42318" : "#067647",
                        }}
                      >
                        {formatMoney(dish.profit)}
                      </div>
                      <div style={styles.bodyCell}>{dish.timesSold}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "32px 20px",
  },
  container: {
    maxWidth: "1280px",
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(16, 24, 40, 0.06)",
  },
  headerBlock: {
    marginBottom: "20px",
  },
  eyebrow: {
    margin: "0 0 6px 0",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#667085",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.1,
    color: "#101828",
  },
  subtitle: {
    margin: "8px 0 0 0",
    fontSize: "15px",
    color: "#667085",
  },
  emptyState: {
    border: "1px dashed #d0d5dd",
    borderRadius: "16px",
    padding: "28px",
    textAlign: "center",
    color: "#667085",
    background: "#fcfcfd",
  },
  errorBox: {
    marginBottom: "16px",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 600,
    background: "#fef3f2",
    color: "#b42318",
    border: "1px solid #fecdca",
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginBottom: "18px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: "18px",
    marginBottom: "18px",
  },
  metricCard: {
    border: "1px solid #eaecf0",
    borderRadius: "16px",
    padding: "18px",
    background: "#fcfcfd",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  metricLabel: {
    fontSize: "13px",
    color: "#667085",
    fontWeight: 600,
  },
  metricValue: {
    fontSize: "30px",
    lineHeight: 1,
    color: "#101828",
  },
  panel: {
    border: "1px solid #eaecf0",
    borderRadius: "18px",
    background: "#ffffff",
    overflow: "hidden",
  },
  panelTitle: {
    padding: "16px 18px",
    borderBottom: "1px solid #eaecf0",
    fontSize: "16px",
    fontWeight: 700,
    color: "#101828",
    background: "#fcfcfd",
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    padding: "18px",
  },
  compareCard: {
    border: "1px solid #eaecf0",
    borderRadius: "16px",
    padding: "16px",
    background: "#ffffff",
  },
  compareHeading: {
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#667085",
    marginBottom: "10px",
  },
  compareDate: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#101828",
    marginBottom: "10px",
  },
  compareLine: {
    fontSize: "14px",
    color: "#344054",
    marginBottom: "6px",
  },
  emptyPanel: {
    padding: "18px",
    color: "#667085",
  },
  tableWrap: {
    overflowX: "auto",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    minWidth: "760px",
    background: "#f9fafb",
    borderBottom: "1px solid #eaecf0",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    minWidth: "760px",
    borderBottom: "1px solid #f2f4f7",
  },
  headerCell: {
    flex: 1,
    padding: "14px 12px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#475467",
  },
  bodyCell: {
    flex: 1,
    padding: "12px",
    fontSize: "14px",
    color: "#101828",
  },
};