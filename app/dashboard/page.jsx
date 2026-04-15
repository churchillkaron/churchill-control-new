"use client";

import { useEffect, useState, useMemo } from "react";

export default function DashboardPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
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

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
    }).format(value || 0);
  };

  // SORTED (latest first)
  const sorted = useMemo(() => {
    return [...reports].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }, [reports]);

  const today = sorted[0];
  const yesterday = sorted[1];

  const weeklyStats = useMemo(() => {
    const last7 = sorted.slice(0, 7);

    let revenue = 0;
    let profit = 0;

    last7.forEach((r) => {
      revenue += Number(r.revenue) || 0;
      profit += Number(r.profit) || 0;
    });

    return { revenue, profit };
  }, [sorted]);

  const bestDishes = useMemo(() => {
    const map = {};

    sorted.forEach((report) => {
      report.dishes?.forEach((dish) => {
        if (!map[dish.name]) {
          map[dish.name] = {
            name: dish.name,
            qty: 0,
            revenue: 0,
            profit: 0,
          };
        }

        map[dish.name].qty += dish.qty;
        map[dish.name].revenue += dish.revenue;
        map[dish.name].profit += dish.profit;
      });
    });

    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [sorted]);

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Dashboard</h1>

        {/* TODAY VS YESTERDAY */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <h3>Today</h3>
            {today ? (
              <>
                <p>Revenue: {formatMoney(today.revenue)}</p>
                <p>Profit: {formatMoney(today.profit)}</p>
              </>
            ) : (
              <p>No data</p>
            )}
          </div>

          <div style={styles.card}>
            <h3>Yesterday</h3>
            {yesterday ? (
              <>
                <p>Revenue: {formatMoney(yesterday.revenue)}</p>
                <p>Profit: {formatMoney(yesterday.profit)}</p>
              </>
            ) : (
              <p>No data</p>
            )}
          </div>
        </div>

        {/* WEEKLY */}
        <div style={styles.card}>
          <h3>Last 7 Days</h3>
          <p>Total Revenue: {formatMoney(weeklyStats.revenue)}</p>
          <p>Total Profit: {formatMoney(weeklyStats.profit)}</p>
        </div>

        {/* BEST DISHES */}
        <div style={styles.card}>
          <h3>Top Dishes</h3>

          {bestDishes.length === 0 && <p>No data yet.</p>}

          {bestDishes.map((dish, i) => (
            <div key={i} style={styles.row}>
              <span style={{ flex: 2 }}>{dish.name}</span>
              <span>Qty: {dish.qty}</span>
              <span>Profit: {formatMoney(dish.profit)}</span>
            </div>
          ))}
        </div>
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
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginBottom: "15px",
  },
  card: {
    border: "1px solid #eee",
    borderRadius: "10px",
    padding: "15px",
    marginBottom: "10px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderTop: "1px solid #f0f0f0",
  },
};