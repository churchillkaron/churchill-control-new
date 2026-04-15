'use client';

export default function DashboardPage() {
  return <Dashboard />;
}

import { useEffect, useMemo, useState } from 'react';

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/accounting-summary', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const data = await res.json();

        if (!active) return;
        setSummary(data || {});
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Dashboard failed to load');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const dashboard = useMemo(() => summary || {}, [summary]);

  if (loading) return <div style={{color:'white', padding:'40px'}}>Loading AI...</div>;
  if (error) return <div style={{color:'red', padding:'40px'}}>{error}</div>;

  const ai = dashboard.ai || {};

  return (
    <div style={{padding:'40px', color:'white'}}>
      <h1>Churchill AI Dashboard</h1>

      <h2>Status: {ai.status}</h2>
      <p>Score: {ai.score}</p>

      <h3>Issues:</h3>
      <ul>
        {(ai.issues || []).map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>

      <