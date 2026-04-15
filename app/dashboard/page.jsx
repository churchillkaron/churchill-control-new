export default function DashboardPage() {
  return <Dashboard />;
}

'use client';

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

  const dashboard = useMemo(() => buildDashboard(summary || {}), [summary]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <TopBar />

        <div style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>Churchill AI Control</div>
            <h1 style={styles.title}>Restaurant Operating Dashboard</h1>
            <div style={styles.subtitle}>
              Real POS + accounting analysis. AI decides status before service charge payout.
            </div>
          </div>

          <div style={styles.heroActions}>
            <div style={styles.refreshChip}>{loading ? 'Refreshing...' : 'Live Analysis Ready'}</div>
          </div>
        </div>

        {error ? (
          <div style={styles.errorCard}>
            <div style={styles.errorTitle}>Dashboard Error</div>
            <div style={styles.errorText}>{error}</div>
          </div>
        ) : null}

        <section style={styles.aiHeaderGrid}>
          <div style={styles.aiMainCard}>
            <div style={styles.cardLabel}>AI Master Status</div>
            <div style={{ ...styles.statusRow, color: dashboard.statusColor }}>
              <span style={styles.statusDot}>●</span>
              <span>{dashboard.status}</span>
              <span style={styles.statusScore}>{dashboard.score}/100</span>
            </div>
            <div style={styles.aiHeadline}>{dashboard.headline}</div>
            <div style={styles.aiSubtext}>{dashboard.summaryText}</div>

            <div style={styles.tagWrap}>
              {dashboard.priorityTags.map((tag) => (
                <span key={tag} style={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div style={styles.aiSideCard}>
            <div style={styles.cardLabel}>Performance Drivers</div>
            <div style={styles.driverList}>
              {dashboard.driverCards.map((driver) => (
                <div key={driver.label} style={styles.driverRow}>
                  <div>
                    <div style={styles.driverLabel}>{driver.label}</div>
                    <div style={styles.driverReason}>{driver.reason}</div>
                  </div>
                  <div style={{ ...styles.driverValue, color: driver.color }}>{driver.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionTitle}>Core Performance</div>
          <div style={styles.kpiGrid}>
            <MetricCard title="Revenue" value={dashboard.kpis.revenue} sub={dashboard.kpis.revenueSub} />
            <MetricCard title="Total Sales" value={dashboard.kpis.sales} sub={dashboard.kpis.salesSub} />
            <MetricCard title="Average Ticket" value={dashboard.kpis.avgTicket} sub={dashboard.kpis.avgTicketSub} />
            <MetricCard title="Drink Revenue" value={dashboard.kpis.drinkRevenue} sub={dashboard.kpis.drinkRevenueSub} />
            <MetricCard title="Drink Mix" value={dashboard.kpis.drinkMix} sub={dashboard.kpis.drinkMixSub} />
            <MetricCard title="Food Cost" value={dashboard.kpis.foodCost} sub={dashboard.kpis.foodCostSub} />
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionTitle}>Department AI Diagnosis</div>
          <div style={styles.departmentGrid}>
            {dashboard.departments.map((dept) => (
              <DepartmentCard key={dept.name} dept={dept} />
            ))}
          </div>
        </section>

        <section style={styles.sectionSplit}>
          <div style={styles.sectionLeft}>
            <div style={styles.sectionTitle}>Control Alerts</div>
            <div style={styles.alertCard}>
              {dashboard.alerts.length ? (
                dashboard.alerts.map((alert, index) => (
                  <div key={index} style={styles.alertRow}>
                    <div style={{ ...styles.alertBadge, color: alert.color, borderColor: alert.color }}>
                      {alert.level}
                    </div>
                    <div>
                      <div style={styles.alertTitle}>{alert.title}</div>
                      <div style={styles.alertText}>{alert.text}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.emptyState}>No critical alerts. System is stable.</div>
              )}
            </div>
          </div>

          <div style={styles.sectionRight}>
            <div style={styles.sectionTitle}>AI Action Stack</div>
            <div style={styles.actionCard}>
              {dashboard.actions.map((action, index) => (
                <div key={index} style={styles.actionRow}>
                  <div style={styles.actionNumber}>{index + 1}</div>
                  <div>
                    <div style={styles.actionTitle}>{action.title}</div>
                    <div style={styles.actionText}>{action.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionTitle}>Service Charge Control</div>
          <div style={styles.serviceGrid}>
            <div style={styles.serviceMain}>
              <div style={styles.cardLabel}>5% Revenue Logic</div>
              <div style={styles.serviceNumbers}>
                <div>
                  <div style={styles.serviceCaption}>Base Pool</div>
                  <div style={styles.serviceValue}>{dashboard.service.base}</div>
                </div>
                <div>
                  <div style={styles.serviceCaption}>Adjusted Pool</div>
                  <div style={styles.serviceValue}>{dashboard.service.adjusted}</div>
                </div>
                <div>
                  <div style={styles.serviceCaption}>Payout Logic</div>
                  <div style={{ ...styles.serviceValue, color: dashboard.statusColor }}>{dashboard.service.multiplierLabel}</div>
                </div>
              </div>
              <div style={styles.serviceNote}>{dashboard.service.note}</div>
            </div>

            <div style={styles.splitMiniCard}>
              <div style={styles.splitLabel}>FOH (50%)</div>
              <div style={styles.splitValue}>{dashboard.service.foh}</div>
            </div>

            <div style={styles.splitMiniCard}>
              <div style={styles.splitLabel}>Bar (30%)</div>
              <div style={styles.splitValue}>{dashboard.service.bar}</div>
            </div>

            <div style={styles.splitMiniCard}>
              <div style={styles.splitLabel}>Kitchen (20%)</div>
              <div style={styles.splitValue}>{dashboard.service.kitchen}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function TopBar() {
  const nav = [
    { label: 'Home', href: '/' },
    { label: 'Control', href: '/control-final' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'History', href: '/history' },
  ];

  return (
    <div style={styles.navbar}>
      <div style={styles.brandWrap}>
        <div style={styles.brandMark}>CC</div>
        <div style={styles.brandText}>Churchill Karon</div>
      </div>
      <div style={styles.navLinks}>
        {nav.map((item) => (
          <a key={item.href} href={item.href} style={styles.navLink}>
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricTitle}>{title}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricSub}>{sub}</div>
    </div>
  );
}

function DepartmentCard({ dept }) {
  return (
    <div style={styles.departmentCard}>
      <div style={styles.departmentTop}>
        <div>
          <div style={styles.departmentName}>{dept.name}</div>
          <div style={{ ...styles.departmentStatus, color: dept.color }}>{dept.status}</div>
        </div>
        <div style={{ ...styles.departmentScore, borderColor: dept.color, color: dept.color }}>{dept.score}</div>
      </div>

      <div style={styles.departmentIssue}>{dept.issue}</div>

      <div style={styles.departmentMetaWrap}>
        {dept.metrics.map((item) => (
          <div key={item.label} style={styles.departmentMeta}>
            <div style={styles.departmentMetaLabel}>{item.label}</div>
            <div style={styles.departmentMetaValue}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDashboard(raw) {
  const revenue = toNumber(raw.revenue);
  const totalSales = toNumber(raw.totalSales || raw.sales || raw.orders || raw.totalOrders);
  const avgTicket = toNumber(raw.avgTicket);
  const drinkRevenue = toNumber(raw.drinkRevenue);
  const foodRevenue = toNumber(raw.foodRevenue || revenue - drinkRevenue);
  const foodCost = toNumber(raw.foodCost || raw.cost || raw.totalFoodCost || raw.expenses);

  const drinkMix = revenue > 0 ? (drinkRevenue / revenue) * 100 : 0;
  const foodCostPct = foodRevenue > 0 ? (foodCost / foodRevenue) * 100 : 0;

  const drinkMixScore = scoreBand(drinkMix, [25, 18, 12], [100, 70, 40, 0]);
  const avgTicketScore = scoreBand(avgTicket, [900, 650, 450], [100, 70, 40, 0]);
  const revenueScore = scoreBand(revenue, [60000, 35000, 18000], [100, 70, 40, 0]);
  const foodCostScore = reverseScoreBand(foodCostPct, [35, 45, 55], [100, 70, 40, 0], foodRevenue <= 0);
  const salesVolumeScore = scoreBand(totalSales, [70, 40, 20], [100, 70, 40, 0]);

  const fohScore = clamp(round((drinkMixScore * 0.45) + (avgTicketScore * 0.35) + (salesVolumeScore * 0.20)), 0, 100);
  const barScore = clamp(round((drinkMixScore * 0.60) + (salesVolumeScore * 0.40)), 0, 100);
  const kitchenScore = clamp(round((foodCostScore * 0.70) + (revenueScore * 0.30)), 0, 100);
  const masterScore = clamp(round((fohScore * 0.40) + (barScore * 0.25) + (kitchenScore * 0.35)), 0, 100);

  const statusMeta = getStatus(masterScore);
  const payoutMultiplier = getPayoutMultiplier(statusMeta.status);
  const baseServiceCharge = revenue * 0.05;
  const adjustedServiceCharge = baseServiceCharge * payoutMultiplier;

  const fohMeta = getStatus(fohScore);
  const barMeta = getStatus(barScore);
  const kitchenMeta = getStatus(kitchenScore);

  const alerts = buildAlerts({
    revenue,
    totalSales,
    avgTicket,
    drinkMix,
    foodCostPct,
    fohMeta,
    barMeta,
    kitchenMeta,
    statusMeta,
  });

  const actions = buildActions({
    revenue,
    avgTicket,
    drinkMix,
    foodCostPct,
    statusMeta,
  });

  const driverCards = [
    {
      label: 'Drink Mix',
      value: `${formatPercent(drinkMix)}`,
      reason: drinkMix >= 25 ? 'Healthy beverage control' : drinkMix >= 18 ? 'Drinks need more push' : 'FOH and bar not creating rounds',
      color: getSignalColor(drinkMix >= 25 ? 'good' : drinkMix >= 18 ? 'warning' : 'critical'),
    },
    {
      label: 'Average Ticket',
      value: formatTHB(avgTicket),
      reason: avgTicket >= 900 ? 'Strong spend per table' : avgTicket >= 650 ? 'Partial upsell performance' : 'Low ticket shows weak guidance',
      color: getSignalColor(avgTicket >= 900 ? 'good' : avgTicket >= 650 ? 'warning' : 'critical'),
    },
    {
      label: 'Food Cost',
      value: foodRevenue > 0 ? formatPercent(foodCostPct) : '-',
      reason: foodRevenue <= 0 ? 'No usable food cost signal yet' : foodCostPct <= 35 ? 'Kitchen cost under control' : foodCostPct <= 45 ? 'Margin pressure rising' : 'Kitchen margin failure',
      color: getSignalColor(foodRevenue <= 0 ? 'warning' : foodCostPct <= 35 ? 'good' : foodCostPct <= 45 ? 'warning' : 'critical'),
    },
  ];

  const departments = [
    {
      name: 'FOH',
      status: fohMeta.status,
      score: fohScore,
      color: fohMeta.color,
      issue: getFohIssue(drinkMix, avgTicket),
      metrics: [
        { label: 'Drink Mix', value: formatPercent(drinkMix) },
        { label: 'Avg Ticket', value: formatTHB(avgTicket) },
        { label: 'Orders', value: formatNumber(totalSales) },
      ],
    },
    {
      name: 'Bar',
      status: barMeta.status,
      score: barScore,
      color: barMeta.color,
      issue: getBarIssue(drinkMix, totalSales),
      metrics: [
        { label: 'Drink Revenue', value: formatTHB(drinkRevenue) },
        { label: 'Drink Mix', value: formatPercent(drinkMix) },
        { label: 'Traffic', value: formatNumber(totalSales) },
      ],
    },
    {
      name: 'Kitchen',
      status: kitchenMeta.status,
      score: kitchenScore,
      color: kitchenMeta.color,
      issue: getKitchenIssue(foodRevenue, foodCostPct, revenue),
      metrics: [
        { label: 'Food Revenue', value: formatTHB(foodRevenue) },
        { label: 'Food Cost', value: foodRevenue > 0 ? formatPercent(foodCostPct) : '-' },
        { label: 'Revenue Base', value: formatTHB(revenue) },
      ],
    },
  ];

  const priorityTags = buildPriorityTags(statusMeta.status, drinkMix, avgTicket, foodCostPct);

  return {
    status: statusMeta.status,
    score: masterScore,
    statusColor: statusMeta.color,
    headline: getHeadline(statusMeta.status, revenue, avgTicket, drinkMix),
    summaryText: getSummaryText(statusMeta.status, drinkMix, avgTicket, foodCostPct),
    priorityTags,
    driverCards,
    alerts,
    actions,
    departments,
    kpis: {
      revenue: formatTHB(revenue),
      revenueSub: revenue > 0 ? 'Live from accounting summary' : 'No revenue loaded yet',
      sales: formatNumber(totalSales),
      salesSub: 'Closed sales count',
      avgTicket: formatTHB(avgTicket),
      avgTicketSub: avgTicket >= 900 ? 'Healthy spend' : avgTicket >= 650 ? 'Needs stronger upsell' : 'Low table control',
      drinkRevenue: formatTHB(drinkRevenue),
      drinkRevenueSub: 'Beverage output',
      drinkMix: formatPercent(drinkMix),
      drinkMixSub: drinkMix >= 25 ? 'Strong bar conversion' : drinkMix >= 18 ? 'Weak second-round push' : 'Critical drink failure',
      foodCost: foodRevenue > 0 ? formatPercent(foodCostPct) : '-',
      foodCostSub: foodRevenue > 0 ? 'Food cost vs food revenue' : 'Waiting for usable food cost data',
    },
    service: {
      base: formatTHB(baseServiceCharge),
      adjusted: formatTHB(adjustedServiceCharge),
      multiplierLabel: `${Math.round(payoutMultiplier * 100)}% payout`,
      note: `Status ${statusMeta.status} applies ${Math.round(payoutMultiplier * 100)}% of the 5% service charge pool.`,
      foh: formatTHB(adjustedServiceCharge * 0.5),
      bar: formatTHB(adjustedServiceCharge * 0.3),
      kitchen: formatTHB(adjustedServiceCharge * 0.2),
    },
  };
}

function buildAlerts({ revenue, totalSales, avgTicket, drinkMix, foodCostPct, fohMeta, barMeta, kitchenMeta, statusMeta }) {
  const alerts = [];

  if (statusMeta.status === 'CRITICAL' || revenue <= 0) {
    alerts.push({
      level: 'CRITICAL',
      color: '#ff5d5d',
      title: 'Master system failure',
      text: revenue <= 0 ? 'No usable revenue is reaching the dashboard. AI cannot trust this shift.' : 'Shift performance is too weak for protected payout.',
    });
  }

  if (drinkMix < 18) {
    alerts.push({
      level: 'FOH',
      color: '#ff8c42',
      title: 'Drink mix too low',
      text: 'FOH and bar are not creating enough beverage momentum. Drinks-first and second-round logic are weak.',
    });
  }

  if (avgTicket < 650) {
    alerts.push({
      level: 'UPSELL',
      color: '#ffd166',
      title: 'Average ticket is under target',
      text: 'Guests are spending too little per order. Staff are not guiding sides, starters, or premium choices strongly enough.',
    });
  }

  if (foodCostPct > 45) {
    alerts.push({
      level: 'KITCHEN',
      color: '#ff5d5d',
      title: 'Food cost pressure is too high',
      text: 'Kitchen margin is weak. Portion control, waste, prep discipline, or pricing alignment needs review.',
    });
  }

  if (totalSales < 20 && revenue > 0) {
    alerts.push({
      level: 'FLOW',
      color: '#8ecae6',
      title: 'Sales volume is too low',
      text: 'The room is not producing enough transactions to create a healthy operating base.',
    });
  }

  if (fohMeta.status === 'BAD' || barMeta.status === 'BAD' || kitchenMeta.status === 'BAD') {
    alerts.push({
      level: 'RISK',
      color: '#b388ff',
      title: 'One or more departments are unstable',
      text: 'Department-level performance is below control standard. AI recommends manager intervention during service.',
    });
  }

  return alerts;
}

function buildActions({ revenue, avgTicket, drinkMix, foodCostPct, statusMeta }) {
  const actions = [];

  if (drinkMix < 18) {
    actions.push({
      title: 'Push drinks before food immediately',
      text: 'FOH must start every table with drinks and trigger second round at 60–70% glass level.',
    });
  } else if (drinkMix < 25) {
    actions.push({
      title: 'Strengthen second-round timing',
      text: 'Bar and FOH should convert active tables earlier before momentum dies.',
    });
  }

  if (avgTicket < 650) {
    actions.push({
      title: 'Force guided selling',
      text: 'Stop passive order taking. Push starters, sides, premium mains, and add-ons with direct recommendations.',
    });
  }

  if (foodCostPct > 45) {
    actions.push({
      title: 'Audit kitchen margin now',
      text: 'Review waste, portion control, and cost leakage before approving full team payout.',
    });
  }

  if (revenue <= 0) {
    actions.push({
      title: 'Fix source data before decisions',
      text: 'No revenue means no trusted AI output. Verify POS and accounting summary pipeline first.',
    });
  }

  if (!actions.length) {
    actions.push({
      title: 'Hold the standard',
      text: 'System is stable. Keep drinks-first discipline, controlled menu guidance, and margin protection active.',
    });
  }

  if (statusMeta.status === 'GOOD') {
    actions.push({
      title: 'Protect full payout quality',
      text: 'Keep the room disciplined so GOOD status remains valid through close.',
    });
  }

  return actions.slice(0, 5);
}

function buildPriorityTags(status, drinkMix, avgTicket, foodCostPct) {
  const tags = [status];

  tags.push(drinkMix >= 25 ? 'Drinks Healthy' : 'Drinks Weak');
  tags.push(avgTicket >= 900 ? 'Upsell Strong' : 'Upsell Weak');

  if (foodCostPct > 0) {
    tags.push(foodCostPct <= 35 ? 'Margin Safe' : 'Margin Risk');
  }

  return tags;
}

function getHeadline(status, revenue, avgTicket, drinkMix) {
  if (revenue <= 0) return 'No trusted shift data is reaching the control machine.';
  if (status === 'GOOD') return 'The shift is producing stable revenue, healthy spending, and protected payout.';
  if (status === 'WARNING') return 'The shift is working, but AI sees leakage in sales behavior or cost control.';
  if (status === 'BAD') return 'Performance is below target and payout should stay reduced until behavior improves.';
  return 'The operation is not meeting control standard. AI recommends hard correction before payout.';
}

function getSummaryText(status, drinkMix, avgTicket, foodCostPct) {
  if (status === 'GOOD') {
    return `Drink mix ${formatPercent(drinkMix)}, average ticket ${formatTHB(avgTicket)}, and kitchen margin are supporting full-control service.`;
  }
  if (status === 'WARNING') {
    return `AI sees warning signals in drink conversion, upsell strength, or kitchen cost. The room still has time to recover.`;
  }
  if (status === 'BAD') {
    return `Low drink push, weak ticket value, or unstable margin is reducing payout confidence. Manager action is required.`;
  }
  return foodCostPct > 45
    ? 'Critical cost pressure and weak sales behavior are breaking control.'
    : 'Critical sales behavior failure detected. Drinks and upsell logic are not working.';
}

function getFohIssue(drinkMix, avgTicket) {
  if (drinkMix < 18 && avgTicket < 650) return 'FOH is not controlling drinks-first or guided selling strongly enough.';
  if (drinkMix < 18) return 'FOH drink control is weak. Second-round logic is failing.';
  if (avgTicket < 650) return 'FOH is taking orders but not building value through recommendations.';
  return 'FOH is holding pacing and spend at acceptable level.';
}

function getBarIssue(drinkMix, totalSales) {
  if (drinkMix < 18) return 'Bar is not converting room traffic into beverage revenue.';
  if (totalSales < 20) return 'Traffic is low, so the bar must increase attachment and visibility.';
  return 'Bar output supports room momentum and drink flow.';
}

function getKitchenIssue(foodRevenue, foodCostPct, revenue) {
  if (revenue <= 0) return 'Kitchen cannot be scored properly until trusted revenue is available.';
  if (foodRevenue <= 0) return 'Kitchen food base is too low to evaluate stable margin.';
  if (foodCostPct > 45) return 'Kitchen is bleeding margin through cost, waste, or weak control.';
  if (foodCostPct > 35) return 'Kitchen is stable but cost discipline needs tightening.';
  return 'Kitchen margin and production base are under control.';
}

function getStatus(score) {
  if (score >= 90) return { status: 'GOOD', color: '#37d67a' };
  if (score >= 80) return { status: 'WARNING', color: '#ffd166' };
  if (score >= 70) return { status: 'BAD', color: '#ff8c42' };
  return { status: 'CRITICAL', color: '#ff5d5d' };
}

function getPayoutMultiplier(status) {
  if (status === 'GOOD') return 1;
  if (status === 'WARNING') return 0.7;
  if (status === 'BAD') return 0.4;
  return 0;
}

function scoreBand(value, thresholds, scores) {
  if (value >= thresholds[0]) return scores[0];
  if (value >= thresholds[1]) return scores[1];
  if (value >= thresholds[2]) return scores[2];
  return scores[3];
}

function reverseScoreBand(value, thresholds, scores, blank) {
  if (blank) return 40;
  if (value <= thresholds[0]) return scores[0];
  if (value <= thresholds[1]) return scores[1];
  if (value <= thresholds[2]) return scores[2];
  return scores[3];
}

function getSignalColor(level) {
  if (level === 'good') return '#37d67a';
  if (level === 'warning') return '#ffd166';
  return '#ff5d5d';
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round(value) {
  return Math.round(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTHB(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050505',
    color: '#f3f3f3',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 24px 48px',
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '28px',
    flexWrap: 'wrap',
  },
  brandWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  brandMark: {
    color: '#ff7a1a',
    fontWeight: 800,
    fontSize: '32px',
    lineHeight: 1,
  },
  brandText: {
    fontSize: '34px',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  navLinks: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  navLink: {
    textDecoration: 'none',
    color: '#f3f3f3',
    background: '#141414',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '12px 18px',
    borderRadius: '14px',
    fontWeight: 700,
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  eyebrow: {
    color: '#ff7a1a',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '12px',
    marginBottom: '10px',
  },
  title: {
    margin: 0,
    fontSize: '48px',
    lineHeight: 1.05,
    letterSpacing: '-0.04em',
  },
  subtitle: {
    marginTop: '12px',
    color: '#a6a6a6',
    fontSize: '16px',
    maxWidth: '760px',
  },
  heroActions: {
    display: 'flex',
    alignItems: 'center',
  },
  refreshChip: {
    padding: '12px 16px',
    borderRadius: '999px',
    background: '#121212',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#d6d6d6',
    fontWeight: 700,
  },
  errorCard: {
    background: 'rgba(255,93,93,0.08)',
    border: '1px solid rgba(255,93,93,0.35)',
    borderRadius: '22px',
    padding: '18px 20px',
    marginBottom: '20px',
  },
  errorTitle: {
    color: '#ff8f8f',
    fontWeight: 800,
    marginBottom: '6px',
  },
  errorText: {
    color: '#f1b3b3',
  },
  aiHeaderGrid: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 1fr',
    gap: '18px',
    marginBottom: '24px',
  },
  aiMainCard: {
    background: 'linear-gradient(180deg, #111111 0%, #0a0a0a 100%)',
    borderRadius: '26px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '26px',
  },
  aiSideCard: {
    background: '#0d0d0d',
    borderRadius: '26px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '26px',
  },
  cardLabel: {
    color: '#8d8d8d',
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '14px',
    fontWeight: 700,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: 900,
    fontSize: '24px',
    marginBottom: '14px',
  },
  statusDot: {
    fontSize: '20px',
  },
  statusScore: {
    marginLeft: '8px',
    color: '#f3f3f3',
    fontSize: '18px',
    fontWeight: 800,
  },
  aiHeadline: {
    fontSize: '28px',
    lineHeight: 1.15,
    fontWeight: 800,
    marginBottom: '10px',
    maxWidth: '850px',
  },
  aiSubtext: {
    color: '#a6a6a6',
    fontSize: '15px',
    lineHeight: 1.5,
    marginBottom: '18px',
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  tag: {
    background: '#171717',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '10px 14px',
    borderRadius: '999px',
    color: '#eaeaea',
    fontWeight: 700,
    fontSize: '13px',
  },
  driverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  driverRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    background: '#121212',
    borderRadius: '18px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  driverLabel: {
    fontSize: '16px',
    fontWeight: 800,
    marginBottom: '4px',
  },
  driverReason: {
    color: '#9c9c9c',
    fontSize: '13px',
    lineHeight: 1.4,
  },
  driverValue: {
    fontSize: '22px',
    fontWeight: 900,
    textAlign: 'right',
  },
  section: {
    marginBottom: '24px',
  },
  sectionSplit: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '18px',
    marginBottom: '24px',
  },
  sectionLeft: {},
  sectionRight: {},
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 800,
    marginBottom: '14px',
    letterSpacing: '-0.02em',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: '14px',
  },
  metricCard: {
    background: '#0d0d0d',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '18px',
    minHeight: '130px',
  },
  metricTitle: {
    color: '#a0a0a0',
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '12px',
    fontWeight: 700,
  },
  metricValue: {
    fontSize: '30px',
    fontWeight: 900,
    letterSpacing: '-0.03em',
    marginBottom: '10px',
  },
  metricSub: {
    color: '#919191',
    lineHeight: 1.45,
    fontSize: '13px',
  },
  departmentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '14px',
  },
  departmentCard: {
    background: '#0d0d0d',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '20px',
  },
  departmentTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  departmentName: {
    fontSize: '24px',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  departmentStatus: {
    fontSize: '13px',
    fontWeight: 800,
    marginTop: '4px',
  },
  departmentScore: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: '22px',
    flexShrink: 0,
  },
  departmentIssue: {
    color: '#bbbbbb',
    lineHeight: 1.5,
    minHeight: '68px',
    marginBottom: '14px',
  },
  departmentMetaWrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
  },
  departmentMeta: {
    background: '#131313',
    borderRadius: '16px',
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  departmentMetaLabel: {
    color: '#8e8e8e',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
    fontWeight: 700,
  },
  departmentMetaValue: {
    fontWeight: 800,
    fontSize: '16px',
  },
  alertCard: {
    background: '#0d0d0d',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '100%',
  },
  alertRow: {
    display: 'grid',
    gridTemplateColumns: '96px 1fr',
    gap: '14px',
    alignItems: 'flex-start',
    background: '#121212',
    borderRadius: '18px',
    padding: '14px',
  },
  alertBadge: {
    border: '1px solid',
    borderRadius: '999px',
    padding: '8px 10px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 900,
  },
  alertTitle: {
    fontWeight: 800,
    marginBottom: '6px',
  },
  alertText: {
    color: '#a6a6a6',
    lineHeight: 1.45,
    fontSize: '14px',
  },
  actionCard: {
    background: '#0d0d0d',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '100%',
  },
  actionRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    gap: '12px',
    alignItems: 'flex-start',
    background: '#121212',
    borderRadius: '18px',
    padding: '14px',
  },
  actionNumber: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#ff7a1a',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  actionTitle: {
    fontWeight: 800,
    marginBottom: '6px',
  },
  actionText: {
    color: '#a6a6a6',
    lineHeight: 1.45,
    fontSize: '14px',
  },
  emptyState: {
    color: '#9a9a9a',
    padding: '14px 4px',
  },
  serviceGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr repeat(3, minmax(0, 1fr))',
    gap: '14px',
  },
  serviceMain: {
    background: 'linear-gradient(180deg, #111111 0%, #0b0b0b 100%)',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '22px',
  },
  serviceNumbers: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '14px',
    marginBottom: '14px',
  },
  serviceCaption: {
    color: '#8f8f8f',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
    fontWeight: 700,
  },
  serviceValue: {
    fontSize: '28px',
    fontWeight: 900,
    letterSpacing: '-0.03em',
  },
  serviceNote: {
    color: '#a4a4a4',
    lineHeight: 1.5,
    fontSize: '14px',
  },
  splitMiniCard: {
    background: '#0d0d0d',
    borderRadius: '22px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: '150px',
  },
  splitLabel: {
    color: '#9a9a9a',
    fontSize: '13px',
    fontWeight: 700,
    marginBottom: '10px',
  },
  splitValue: {
    fontSize: '30px',
    fontWeight: 900,
    letterSpacing: '-0.03em',
  },
};
