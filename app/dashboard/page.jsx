'use client';

import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(res => {
        setData(res || []);
        setLoading(false);
      });
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

  const totals = calculateTotals();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Dashboard</h1>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            {/* SUMMARY */}
            <div style={styles.grid}>
              <Card title="Total Revenue" value={totals.revenue} />
              <Card title="Total Cost" value={totals.cost} />
              <Card title="Profit" value={totals.profit} />
              <Card title="Days Recorded" value={data.length} />
            </div>

            {/* RECENT DAYS */}
            <div style={styles.section}>
              <h2>Recent Days</h2>

              {data.slice(0, 5).map((d, i) => (
                <div key={i} style={styles.row}>
                  <span>{new Date(d.date).toLocaleDateString()}</span>
                  <span>Revenue: {d.revenue}</span>
                  <span>Profit: {d.profit}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <h2 style={styles.cardValue}>
        {typeof value === 'number' ? value.toFixed(2) : value}
      </h2>
    </div>
  );
}

const styles = {
  page: {
    background: '#f5f1e6', // khaki
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
    background: '#ffffff',
    padding: 20,
    borderRadius: 10,
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
  },
  cardTitle: {
    marginBottom: 10,
    color: '#666'
  },
  cardValue: {
    margin: 0
  },
  section: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #eee'
  }
};