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

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Churchill AI Control</h1>

      <div style={styles.card}>
        <h2>Status: {ai.status}</h2>
        <p>Score: {ai.score}</p>
        <p>{ai.decision}</p>
      </div>

      <div style={styles.card}>
        <h3>Issues</h3>
        <ul>
          {(ai.issues || []).map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      </div>

      <div style={styles.card}>
        <h3>Service Charge</h3>
        <p>{ai.serviceCharge}</p>
      </div>

      <div style={styles.grid}>
        <div style={styles.smallCard}>
          <h4>FOH</h4>
          <p>{ai.split?.foh}</p>
        </div>
        <div style={styles.smallCard}>
          <h4>Bar</h4>
          <p>{ai.split?.bar}</p>
        </div>
        <div style={styles.smallCard}>
          <h4>Kitchen</h4>
          <p>{ai.split?.kitchen}</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 40,
    background: '#f5f5f5', // FIX: light background
    color: '#000', // FIX: dark text
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
  }
};