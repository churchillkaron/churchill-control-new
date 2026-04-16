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
  const actionEngine = useMemo(() => buildActions(data, ai, drinksPerSale), [data, ai, drinksPerSale]);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Churchill Control System</h1>
      <div style={styles.subtitle}>AI status, revenue pressure, and live action commands.</div>

      <div style={styles.kpiGrid}>
        <KpiCard title="Revenue" value={formatTHB(data.revenue)} />
        <KpiCard title="Sales" value={String(data.sales || 0)} />
        <KpiCard title="Avg Ticket" value={formatTHB(data.avg)} />
        <KpiCard title="Drinks / Sale" value={formatTHB(drinksPerSale)} />
      </div>

      <div style={{ ...styles.card, borderLeft: `8px solid ${statusColor}` }}>
        <div style={styles.statusHeader}>
          <div>
            <div style={styles.sectionLabel}>AI Master Status</div>
            <h2 style={{ ...styles.statusText, color: statusColor }}>Status: {ai.status || 'UNKNOWN'}</h2>
          </div>
          <div style={{ ...styles.scoreBadge, borderColor: statusColor, color: statusColor }}>
            {ai.score ?? '-'}
          </div>
        </div>
        <div style={styles.decisionText}>{ai.decision || 'No decision available'}</div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>AI Alerts</h3>
          {(ai.issues || []).length ? (
            (ai.issues || []).map((issue, idx) => (
              <div key={idx} style={styles.alert}>
                {issue}
              </div>
            ))
          ) : (
            <div style={styles.emptyText}>No active AI alerts.</div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Action Engine</h3>
          {actionEngine.map((action, idx) => (
            <div key={idx} style={styles.actionRow}>
              <div style={styles.actionNumber}>{idx + 1}</div>
              <div>
                <div style={styles.actionTitle}>{action.title}</div>
                <div style={styles.actionText}>{action.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Service Charge Control</h3>
        <div style={styles.serviceGrid}>
          <div style={styles.serviceBox}>
            <div style={styles.serviceLabel}>Total</div>
            <div style={styles.serviceValue}>{formatTHB(ai.serviceCharge)}</div>
          </div>
          <div style={styles.serviceBox}>
            <div style={styles.serviceLabel}>FOH</div>
            <div style={styles.serviceValue}>{formatTHB(ai.split?.foh)}</div>
          </div>
          <div style={styles.serviceBox}>
            <div style={styles.serviceLabel}>Bar</div>
            <div style={styles.serviceValue}>{formatTHB(ai.split?.bar)}</div>
          </div>
          <div style={styles.serviceBox}>
            <div style={styles.serviceLabel}>Kitchen</div>
            <div style={styles.serviceValue}>{formatTHB(ai.split?.kitchen)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function buildActions(data, ai, drinksPerSale) {
  const actions = [];
  const avg = Number(data.avg || 0);
  const revenue = Number(data.revenue || 0);
  const sales = Number(data.sales || 0);

  if ((ai.status || '') === 'CRITICAL') {
    actions.push({
      title: 'Block payout immediately',
      text: 'Service charge stays blocked until drink conversion and ticket value recover.',
    });
  }

  if (avg < 400) {
    actions.push({
      title: 'Force upsell language now',
      text: 'FOH must push starters, sides, and premium add-ons on every table. No passive order taking.',
    });
  }

  if (drinksPerSale < 80) {
    actions.push({
      title: 'Drinks-first emergency correction',
      text: 'Every table must start with drinks. Second-round trigger must happen before food lands.',
    });
  } else if (drinksPerSale < 120) {
    actions.push({
      title: 'Strengthen second-round push',
      text: 'Bar and FOH need stronger drink conversion before revenue is approved as healthy.',
    });
  }

  if (sales < 10) {
    actions.push({
      title: 'Low transaction warning',
      text: 'Traffic is weak. Staff must increase conversion and average spend instead of waiting for volume.',
    });
  }

  if (revenue <= 0) {
    actions.push({
      title: 'Check POS source immediately',
      text: 'No revenue means the AI cannot trust the shift. Verify POS connection before making decisions.',
    });
  }

  if (!actions.length) {
    actions.push({
      title: 'Hold the standard',
      text: 'System is stable. Keep drinks-first, upsell control, and service discipline active.',
    });
  }

  return actions.slice(0, 5);
}

function getStatusColor(status) {
  if (status === 'GOOD') return '#16a34a';
  if (status === 'WARNING') return '#eab308';
  if (status === 'BAD') return '#f97316';
  if (status === 'CRITICAL') return '#dc2626';
  return '#525252';
}

function formatTHB(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

const styles = {
  page: {
    padding: 40,
    background: '#f5f5f5',
    color: '#000',
    minHeight: '100vh',
  },
  title: {
    fontSize: 36,
    marginBottom: 8,
  },
  subtitle: {
    color: '#525252',
    marginBottom: 24,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 20,
  },
  kpi: {
    background: '#fff',
    padding: 20,
    borderRadius: 12,
  },
  kpiTitle: {
    fontSize: 14,
    color: '#525252',
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 700,
  },
  card: {
    background: '#fff',
    padding: 24,
    marginBottom: 20,
    borderRadius: 12,
  },
  sectionLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  statusHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  statusText: {
    margin: 0,
    fontSize: 34,
  },
  scoreBadge: {
    minWidth: 100,
    minHeight: 100,
    borderRadius: 999,
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 34,
    fontWeight: 800,
    background: '#fafafa',
  },
  decisionText: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: 600,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  cardTitle: {
    marginTop: 0,
    marginBottom: 14,
    fontSize: 24,
  },
  alert: {
    background: '#fee2e2',
    color: '#7f1d1d',
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    fontWeight: 600,
  },
  emptyText: {
    color: '#6b7280',
  },
  actionRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    gap: 12,
    alignItems: 'start',
    padding: '12px 0',
    borderBottom: '1px solid #ececec',
  },
  actionNumber: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: '#111827',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
  },
  actionTitle: {
    fontWeight: 700,
    marginBottom: 4,
  },
  actionText: {
    color: '#525252',
    lineHeight: 1.5,
  },
  serviceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  serviceBox: {
    background: '#f9fafb',
    borderRadius: 10,
    padding: 18,
  },
  serviceLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  serviceValue: {
    fontSize: 24,
    fontWeight: 700,
  },
};
