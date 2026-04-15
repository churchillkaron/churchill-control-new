"use client";

import { useEffect, useState } from "react";

export default function HistoryPage() {
  const [reports, setReports] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();

      setReports(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
    }).format(value || 0);
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>History</h1>

        {loading && <p>Loading...</p>}

        {!loading && reports.length === 0 && (
          <p>No data yet.</p>
        )}

        {!loading &&
          reports.map((report) => (
            <div key={report.id} style={styles.card}>
              <div
                style={styles.header}
                onClick={() => toggleExpand(report.id)}
              >
                <div>
                  <strong>{report.date}</strong>
                </div>

                <div style={styles.summary}>
                  <span>Revenue: {formatMoney(report.revenue)}</span>
                  <span>Profit: {formatMoney(report.profit)}</span>
                </div>
              </div>

              {expanded === report.id && (
                <div style={styles.details}>
                  <div style={styles.totals}>
                    <p>Revenue: {formatMoney(report.revenue)}</p>
                    <p>Cost: {formatMoney(report.cost)}</p>
                    <p>Profit: {formatMoney(report.profit)}</p>
                  </div>

                  <div style={styles.table}>
                    <div style={styles.rowHeader}>
                      <span style={{ flex: 2 }}>Dish</span>
                      <span>Qty</span>
                      <span>Price</span>
                      <span>Cost</span>
                      <span>Profit</span>
                    </div>

                    {report.dishes?.map((dish, i) => (
                      <div key={i} style={styles.row}>
                        <span style={{ flex: 2 }}>{dish.name}</span>
                        <span>{dish.qty}</span>
                        <span>{formatMoney(dish.price)}</span>
                        <span>{formatMoney(dish.cost)}</span>
                        <span>{formatMoney(dish.profit)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "20px",
    background: "#f5f7fb",
    minHeight: "100vh",
  },
  container: {
    maxWidth: "900px",
    margin: "0 auto",
    background: "#fff",
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #eee",
  },
  title: {
    marginBottom: "20px",
  },
  card: {
    border: "1px solid #eee",
    borderRadius: "10px",
    marginBottom: "12px",
    overflow: "hidden",
  },
  header: {
    padding: "12px",
    display: "flex",
    justifyContent: "space-between",
    cursor: "pointer",
    background: "#fafafa",
  },
  summary: {
    display: "flex",
    gap: "15px",
    fontSize: "14px",
  },
  details: {
    padding: "12px",
    borderTop: "1px solid #eee",
  },
  totals: {
    marginBottom: "10px",
  },
  table: {
    borderTop: "1px solid #eee",
  },
  rowHeader: {
    display: "flex",
    fontWeight: "bold",
    padding: "8px 0",
  },
  row: {
    display: "flex",
    padding: "6px 0",
    borderTop: "1px solid #f0f0f0",
  },
};