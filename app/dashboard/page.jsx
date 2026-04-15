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

  if (error) return <div style={{color:'red'}}>{error}</div>;
  if (!data) return <div style={{color:'white'}}>Loading...</div>;

  const ai = data.ai || {};

  return (
    <div style={{ padding: 40, color: 'white' }}>
      <h1>AI Dashboard</h1>

      <h2>Status: {ai.status}</h2>
      <p>Score: {ai.score}</p>

      <h3>Issues</h3>
      <ul>
        {(ai.issues || []).map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>

      <h3>Decision</h3>
      <p>{ai.decision}</p>

      <h3>Service Charge</h3>
      <p>{ai.serviceCharge}</p>

      <h3>Split</h3>
      <p>FOH: {ai.split?.foh}</p>
      <p>Bar: {ai.split?.bar}</p>
      <p>Kitchen: {ai.split?.kitchen}</p>
    </div>
  );
}