'use client';

import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(res => setData(res || []));
  }, []);

  function analyzeDishes() {
    const map = {};

    data.forEach(day => {
      (day.dishes || []).forEach(d => {
        if (!map[d.name]) {
          map[d.name] = {
            qty: 0,
            revenue: 0,
            cost: 0
          };
        }

        const qty = Number(d.qty) || 0;
        const price = Number(d.price) || 0;
        const cost = Number(d.cost) || 0;

        map[d.name].qty += qty;
        map[d.name].revenue += qty * price;
        map[d.name].cost += qty * cost;
      });
    });

    const result = Object.keys(map).map(name => {
      const d = map[name];
      return {
        name,
        qty: d.qty,
        revenue: d.revenue,
        profit: d.revenue - d.cost,
        margin: d.revenue > 0 ? (d.revenue - d.cost) / d.revenue : 0
      };
    });

    return result;
  }

  function getStats() {
    let totalProfit = 0;

    data.forEach(d => {
      totalProfit += d.profit || 0;
    });

    return {
      avgProfit: data.length ? totalProfit / data.length : 0
    };
  }

  const dishes = analyzeDishes();

  const topSelling = [...dishes]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const mostProfitable = [...dishes]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const lowMargin = dishes
    .filter(d => d.margin < 0.4)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5);

  const stats = getStats();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Performance Dashboard</h1>

        {/* AVG PROFIT */}
        <div style={styles.card}>
          <h3>Average Profit / Day</h3>
          <h2>{stats.avgProfit.toFixed(2)}</h2>
        </div>

        {/* TOP SELLING */}
        <Section title="Top Selling Dishes">
          {topSelling.map(d => (
            <Row key={d.name} label={d.name} value={d.qty} />
          ))}
        </Section>

        {/* MOST PROFITABLE */}
        <Section title="Most Profitable Dishes">
          {mostProfitable.map(d => (
            <Row key={d.name} label={d.name} value={d.profit.toFixed(2)} />
          ))}
        </Section>

        {/* LOW MARGIN */}
        <Section title="Low Margin (Fix These)">
          {lowMargin.map(d => (
            <Row
              key={d.name}
              label={d.name}
              value={(d.margin * 100).toFixed(1) + '%'}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={styles.row}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles = {
  page: {
    background: '#f5f1e6',
    minHeight: '100vh',
    padding: 40
  },
  container: {
    maxWidth: 900,
    margin: '0 auto'
  },
  title: {
    marginBottom: 30
  },
  card: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 30
  },
  section: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #eee'
  }
};
