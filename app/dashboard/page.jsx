'use client';

import { useEffect, useMemo, useState } from 'react';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/accounting-summary')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError('Failed to load'));
  }, []);

  if (error) return <div style={{ color: 'red', padding: 40 }}>{error}</div>;
  if (!data) return <div style={{ padding: 40 }}>Loading AI...</div>;

  const ai = data.ai || {};
  const drinksPerSale = (data.sales || 0) > 0 ? data.drinks / data.sales : 0;

  const statusColor = getStatusColor(ai.status);

  const actions = useMemo(
    () => buildActions(data, ai, drinksPerSale),
    [data, ai, drinksPerSale]
  );

  const commands = useMemo(
    () => buildCommands(data, ai, drinksPerSale),
    [data, ai, drinksPerSale]
  );

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Churchill Control System</h1>

      {/* KPI */}
      <div style={styles.kpiGrid}>
        <Kpi title="Revenue" value={formatTHB(data.revenue)} />
        <Kpi title="Sales" value={data.sales} />
        <Kpi title="Avg Ticket" value={formatTHB(data.avg)} />
        <Kpi title="Drinks / Sale" value={formatTHB(drinksPerSale)} />
      </div>

      {/* STATUS */}
      <div style={{ ...styles.card, borderLeft: `8px solid ${statusColor}` }}>
        <h2 style={{ color: statusColor }}>Status: {ai.status}</h2>
        <h1 style={styles.bigScore}>{ai.score}</h1>
        <p>{ai.decision}</p>
      </div>

      {/* ALERTS */}
      <div style={styles.card}>
        <h3>AI Alerts</h3>
        {(ai.issues || []).map((i, idx) => (
          <div key={idx} style={styles.alert}>
            {i}
          </div>
        ))}
      </div>

      {/* ACTION ENGINE */}
      <div style={styles.card}>
        <h3>Action Engine</h3>
        {actions.map((a, idx) => (
          <div key={idx} style={styles.action}>
            <strong>{a.title}</strong>
            <div>{a.text}</div>
          </div>
        ))}
      </div>

      {/* COMMANDS (NEW CONTROL LAYER) */}
      <div style={styles.card}>
        <h3>Control Commands</h3>
        {commands.map((cmd, idx) => (
          <div key={idx} style={styles.command}>
            {cmd}
          </div>
        ))}
      </div>

      {/* SERVICE */}
      <div style={styles.card}>
        <h3>Service Charge</h3>
        <h2>{formatTHB(ai.serviceCharge)}</h2>
      </div>

      {/* SPLIT */}
      <div style={styles.grid}>
        <div style={styles.smallCard}>FOH: {formatTHB(ai.split?.foh)}</div>
        <div style={styles.smallCard}>Bar: {formatTHB(ai.split?.bar)}</div>
        <div style={styles.smallCard}>Kitchen: {formatTHB(ai.split?.kitchen)}</div>
      </div>
    </div>
  );
}

/* ---------- LOGIC ---------- */

function buildActions(data, ai, drinksPerSale) {
  const actions = [];

  if (ai.status === 'CRITICAL') {
    actions.push({
      title: 'Stop payout',
      text: 'Service charge blocked until recovery',
    });
  }

  if ((data.avg || 0) < 400) {
    actions.push({
      title: 'Upsell failure',
      text: 'Push starters, sides, premium items',
    });
  }

  if (drinksPerSale < 80) {
    actions.push({
      title: 'Drink collapse',
      text: 'No drinks-first execution happening',
    });
  }

  if (!actions.length) {
    actions.push({
      title: 'Stable',
      text: 'Maintain performance',
    });
  }

  return actions;
}

function buildCommands(data, ai, drinksPerSale) {
  const commands = [];

  if (ai.status === 'CRITICAL') {
    commands.push('MANAGER: intervene immediately');
    commands.push('SERVICE CHARGE: BLOCKED');
  }

  if (drinksPerSale < 80) {
    commands.push('FOH: drinks first on every table');
    commands.push('BAR: push second round before food');
  }

  if ((data.avg || 0) < 400) {
    commands.push('FOH: upsell every order');
  }

  if (!commands.length) {
    commands.push('SYSTEM STABLE');
  }

  return commands;
}

function getStatusColor(status) {
  if (status === 'GOOD') return '#16a34a';
  if (status === 'WARNING') return '#eab308';
  if (status === 'BAD') return '#f97316';
  if (status === 'CRITICAL') return '#dc2626';
  return '#000';
}

function formatTHB(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function Kpi({ title, value }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

/* ---------- STYLES ---------- */

const styles = {
  page: {
    padding: 40,
    background: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    marginBottom: 20,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginBottom: 20,
  },
  kpi: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
  },
  kpiTitle: {
    fontSize: 14,
    color: '#666',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  card: {
    background: '#fff',
    padding: 20,
    marginBottom: 20,
    borderRadius: 10,
  },
  bigScore: {
    fontSize: 48,
  },
  alert: {
    background: '#fee2e2',
    padding: 10,
    marginTop: 10,
    borderRadius: 6,
  },
  action: {
    marginTop: 10,
  },
  command: {
    background: '#111827',
    color: '#fff',
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    fontWeight: 'bold',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  smallCard: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
  },
};