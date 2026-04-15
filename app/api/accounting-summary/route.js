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
  if (!data) return <div style={{color:'white', padding:40}}>Loading AI...</div>;

  const ai = data.ai || {};

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Churchill AI Control</h1>

      {/* STATUS */}
      <div style={styles.card}>
        <h2>Status: {ai.status}</h2>
        <p>Score: {ai.score}</p>
        <p>{ai.decision}</p>
      </div>

      {/* ISSUES */}
      <div style={styles.card}>
        <h3>AI Issues</h3>
        <ul>
          {(ai.issues || []).map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      </div>

      {/* SERVICE CHARGE */}
      <div style={styles.card}>
        <h3>Service Charge</h3>
        <p>Total: {ai.serviceCharge}</p>
      </div>

      {/* SPLIT */}
      <div style={styles.grid}>
        <div style={styles.smallCard}>
          <h4>FOH (50%)</h4>
          <p>{ai.split?.foh}</p>
        </div>
        <div style={styles.smallCard}>
          <h4>Bar (30%)</h4>
          <p>{ai.split?.bar}</p>
        </div>
        <div style={styles.smallCard}>
          <h4>Kitchen (20%)</h4>
          <p>{ai.split?.kitchen}</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 40,
    background: '#000',
    color: '#fff',
    minHeight: '100vh'
  },
  title: {
    fontSize: 32,
    marginBottom: 20
  },
  card: {
    background: '#111',
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
    background: '#111',
    padding: 20,
    borderRadius: 10
  }
};
