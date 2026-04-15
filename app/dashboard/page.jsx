'use client';

import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(res => setData(res || []));
  }, []);

  function calculateTotals() {
    let revenue = 0;
    let cost = 0;

    data.forEach(d => {
      revenue += d.revenue || 0;
      cost += d.cost || 0;
    });

    return {
      revenue,
      cost,
      profit: revenue - cost
    };
  }

  function prepareChartData() {
    const sorted = [...data].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    return sorted.map(d => ({
      date: new Date(d.date).toLocaleDateString(),
      revenue: d.revenue || 0,
      profit: d.profit || 0
    }));
  }

  const totals = calculateTotals();
  const chartData = prepareChartData();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Dashboard</h1>

        {/* SUMMARY */}
        <div style={styles.grid}>
          <Card title="Revenue" value={totals.revenue} />
          <Card title="Cost" value={totals.cost} />
          <Card title="Profit" value={totals.profit} />
          <Card title="Days" value={data.length} />
        </div>

        {/* CHART */}
        <div style={styles.chartCard}>
          <h2>Performance</h2>
          <LineChart data={chartData} />
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <p>{title}</p>
      <h2>
        {typeof value === 'number'
          ? value.toFixed(2)
          : value}
      </h2>
    </div>
  );
}

function LineChart({ data }) {
  if (!data.length) return <p>No data yet</p>;

  const width = 800;
  const height = 300;
  const padding = 40;

  const maxValue = Math.max(
    ...data.map(d => Math.max(d.revenue, d.profit))
  );

  const stepX = (width - padding * 2) / (data.length - 1);

  function getY(value) {
    return height - padding - (value / maxValue) * (height - padding * 2);
  }

  const revenuePoints = data
    .map((d, i) => `${padding + i * stepX},${getY(d.revenue)}`)
    .join(' ');

  const profitPoints = data
    .map((d, i) => `${padding + i * stepX},${getY(d.profit)}`)
    .join(' ');

  return (
    <svg width="100%" height={height}>
      {/* Revenue line */}
      <polyline
        fill="none"
        stroke="#ff8c00"
        strokeWidth="3"
        points={revenuePoints}
      />

      {/* Profit line */}
      <polyline
        fill="none"
        stroke="#2e7d32"
        strokeWidth="3"
        points={profitPoints}
      />
    </svg>
  );
}

const styles = {
  page: {
    background: '#f5f1e6',
    minHeight: '100vh',
    padding: 40
  },
  container: {
    maxWidth: 1100,
    margin: '0 auto'
  },
  title: {
    marginBottom: 30
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 20,
    marginBottom: 40
  },
  card: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  },
  chartCard: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  }
};