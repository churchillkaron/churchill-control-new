'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/accounting-summary')
      .then(res => res.json())
      .then(setData)
      .catch(() => setError('Failed to load'));
  }, []);

  if (error) return <div style={{color:'red', padding:40}}>{error}</div>;
  if (!data) return <div style={{padding:40}}>Loading AI...</div>;

  const ai = data.ai || {};

  const getColor = (status) => {
    if (status === 'GOOD') return '#16a34a';
    if (status === 'WARNING') return '#eab308';
    if (status === 'BAD') return '#f97316';
    if (status === 'CRITICAL') return '#dc2626';
    return '#000';
  };

  const statusColor = getColor(ai.status);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Churchill Control System</h1>

      {/* KPI BLOCK */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpi}><h3>Revenue</h3><p>{data.revenue}</p></div>
        <div style={styles.kpi}><h3>Sales</h3><p>{data.sales}</p></div>
        <div style={styles.kpi}><h3>Avg Ticket</h3><p>{Math.round(data.avg)}</p></div>
        <div style={styles.kpi}><h3>Drinks / Sale</h3><p>{Math.round(data.drinks / (data.sales || 1))}</p></div>
      </div>

      {/* STATUS */}
      <div style={{...styles.card, borderLeft:`6px solid ${statusColor}`}}>
        <h2 style={{color:statusColor}}>Status: {ai.status}</h2>
        <h1 style={{fontSize:48}}>{ai.score}</h1>
        <p>{ai.decision}</p>
      </div>

      {/* ALERTS */}
      <div style={styles.card}>
        <h3>⚠️ AI Alerts</h3>
        {(ai.issues || []).map((i, idx) => (
          <div key={idx} style={styles.alert}>
            {i}
          </div>
        ))}
      </div>

      {/* SERVICE CHARGE */}
      <div style={styles.card}>
        <h3>Service Charge</h3>
        <h1 style={{fontSize:36}}>{ai.serviceCharge}</h1>
      </div>

      {/* SPLIT */}
      <div style={styles.grid}>
        <div style={styles.smallCard}><h4>FOH</h4><p>{ai.split?.foh}</p></div>
        <div style={styles.smallCard}><h4>Bar</h4><p>{ai.split?.bar}</p></div>
        <div style={styles.smallCard}><h4>Kitchen</h4><p>{ai.split?.kitchen}</p></div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 40,
    background: '#f5f5f5',
    color: '#000',
    minHeight: '100vh'
  },
  title: {
    fontSize: 32,
    marginBottom: 20
  },
  card: {
    background: '#fff',
    padding: 20,
    marginBottom: 20,
    borderRadius: 10
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10
  },
  smallCard: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginBottom: 20
  },
  kpi: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  },
  alert: {
    background: '#fee2e2',
    padding: 10,
    marginTop: 10,
    borderRadius: 6
  }
};
