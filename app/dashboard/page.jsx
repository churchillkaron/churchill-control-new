'use client'

import { useEffect, useMemo, useState } from 'react'

const THEME = {
  bg: '#0b0b0b',
  panel: '#131313',
  panelSoft: '#171717',
  panelSoft2: '#101010',
  border: 'rgba(255,255,255,0.08)',
  text: '#f5f5f5',
  muted: '#b7b2a4',
  accent: '#f97316',
  accentSoft: 'rgba(249,115,22,0.14)',
  khaki: '#c8ba97',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  blue: '#60a5fa',
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function normalizeBusinessDate(value) {
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return parsed.toISOString().slice(0, 10)
}

function formatBusinessDate(value) {
  const normalized = normalizeBusinessDate(value)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(value || '-')

  const [year, month, day] = normalized.split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function safeParse(value) {
  if (!value) return null
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function getMargin(revenue, profit) {
  if (!revenue) return 0
  return Number(profit || 0) / Number(revenue || 0)
}

function getServiceStatus(margin, complaints, secondRoundRate) {
  if (margin >= 0.5 && complaints <= 1 && secondRoundRate >= 0.5) return 'GOOD'
  if (margin >= 0.3 && complaints <= 2) return 'WARNING'
  if (margin > 0) return 'BAD'
  return 'CRITICAL'
}

function getStatusTone(status) {
  if (status === 'GOOD') {
    return { bg: 'rgba(34,197,94,0.14)', color: THEME.green }
  }
  if (status === 'WARNING') {
    return { bg: 'rgba(234,179,8,0.14)', color: THEME.yellow }
  }
  if (status === 'BAD') {
    return { bg: 'rgba(239,68,68,0.14)', color: THEME.red }
  }
  if (status === 'CRITICAL') {
    return { bg: 'rgba(239,68,68,0.20)', color: '#ff8585' }
  }
  return { bg: 'rgba(255,255,255,0.08)', color: THEME.muted }
}

function SummaryCard({ label, value, subValue, accent }) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${accent ? THEME.accentSoft : THEME.border}`,
        borderRadius: 18,
        padding: 16,
        minHeight: 104,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          color: accent ? THEME.accent : THEME.text,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {subValue ? (
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          {subValue}
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            color: THEME.text,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            style={{
              margin: '6px 0 0',
              color: THEME.muted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  )
}

function TrendMiniCard({ label, value, tone = 'normal' }) {
  const color =
    tone === 'good' ? THEME.green : tone === 'bad' ? THEME.red : tone === 'warn' ? THEME.yellow : THEME.text

  return (
    <div
      style={{
        background: THEME.panelSoft,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 11 }}>{label}</div>
      <div
        style={{
          color,
          fontSize: 16,
          fontWeight: 700,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function BarRow({ label, value, maxValue, color }) {
  const width = maxValue > 0 ? `${Math.max((value / maxValue) * 100, 4)}%` : '0%'

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 13,
        }}
      >
        <span style={{ color: THEME.text }}>{label}</span>
        <span style={{ color: THEME.muted }}>{formatCurrency(value)}</span>
      </div>
      <div
        style={{
          width: '100%',
          height: 10,
          borderRadius: 999,
          background: THEME.panelSoft2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width,
            height: '100%',
            background: color || THEME.accent,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [historyRows, setHistoryRows] = useState([])
  const [payoutData, setPayoutData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [periodFilter, setPeriodFilter] = useState('30d')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setLoadError('')

      try {
        const [historyRes, payoutRes] = await Promise.all([
          fetch('/api/history', { method: 'GET', cache: 'no-store' }),
          fetch('/api/staff-payout', { method: 'GET', cache: 'no-store' }).catch(() => null),
        ])

        const historyJson = await historyRes.json().catch(() => [])
        const payoutJson = payoutRes ? await payoutRes.json().catch(() => null) : null

        if (!historyRes.ok) {
          throw new Error(historyJson?.error || 'Failed to load dashboard data.')
        }

        if (!active) return

        const normalizedHistory = Array.isArray(historyJson)
          ? historyJson.map((item) => {
              const dishes = safeParse(item.dishes)
              const meta = dishes?.meta || {}
              const rows = Array.isArray(dishes?.rows) ? dishes.rows : []
              const insights = Array.isArray(dishes?.insights) ? dishes.insights : []

              return {
                id: item.id,
                date: normalizeBusinessDate(item.date),
                created_at: item.created_at,
                revenue: Number(item.revenue || 0),
                cost: Number(item.cost || 0),
                profit: Number(item.profit || 0),
                meta: {
                  covers: Number(meta.covers || 0),
                  drinkRevenue: Number(meta.drinkRevenue || 0),
                  avgTicketTime: Number(meta.avgTicketTime || 0),
                  secondRoundRate: Number(meta.secondRoundRate || 0),
                  complaints: Number(meta.complaints || 0),
                  managerNotes: meta.managerNotes || '',
                  ownerStatus: meta.ownerStatus || null,
                },
                rows,
                insights,
              }
            })
          : []

        normalizedHistory.sort(
          (a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
        )

        setHistoryRows(normalizedHistory)
        setPayoutData(payoutJson && typeof payoutJson === 'object' ? payoutJson : null)
      } catch (error) {
        if (!active) return
        setLoadError(error.message || 'Dashboard failed to load.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [])

  const groupedRows = useMemo(() => {
    const map = new Map()

    historyRows.forEach((row) => {
      const key = normalizeBusinessDate(row.date)
      const existing = map.get(key)

      if (!existing) {
        map.set(key, row)
        return
      }

      const currentStamp = new Date(row.created_at || row.date).getTime()
      const existingStamp = new Date(existing.created_at || existing.date).getTime()

      if (currentStamp > existingStamp) {
        map.set(key, row)
      }
    })

    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [historyRows])

  const filteredRows = useMemo(() => {
    let rows = [...groupedRows]

    if (periodFilter === '7d') {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 7)
      rows = rows.filter((row) => new Date(row.date) >= threshold)
    }

    if (periodFilter === '30d') {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 30)
      rows = rows.filter((row) => new Date(row.date) >= threshold)
    }

    return rows
  }, [groupedRows, periodFilter])

  const latestDay = filteredRows[0] || null
  const previousDay = filteredRows[1] || null

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.revenue += Number(row.revenue || 0)
        acc.cost += Number(row.cost || 0)
        acc.profit += Number(row.profit || 0)
        acc.covers += Number(row.meta?.covers || 0)
        acc.drinkRevenue += Number(row.meta?.drinkRevenue || 0)
        acc.complaints += Number(row.meta?.complaints || 0)
        acc.ticketTimeTotal += Number(row.meta?.avgTicketTime || 0)
        acc.secondRoundTotal += Number(row.meta?.secondRoundRate || 0)
        return acc
      },
      {
        revenue: 0,
        cost: 0,
        profit: 0,
        covers: 0,
        drinkRevenue: 0,
        complaints: 0,
        ticketTimeTotal: 0,
        secondRoundTotal: 0,
      }
    )
  }, [filteredRows])

  const avgMargin = totals.revenue > 0 ? totals.profit / totals.revenue : 0
  const avgTicketTime = filteredRows.length > 0 ? totals.ticketTimeTotal / filteredRows.length : 0
  const avgSecondRound = filteredRows.length > 0 ? totals.secondRoundTotal / filteredRows.length : 0
  const revenuePerCover = totals.covers > 0 ? totals.revenue / totals.covers : 0
  const latestMargin = latestDay ? getMargin(latestDay.revenue, latestDay.profit) : 0

  const serviceChargeBase = latestDay ? Number(latestDay.revenue || 0) * 0.05 : 0
  const serviceChargeStatus = latestDay
    ? getServiceStatus(latestMargin, latestDay.meta?.complaints || 0, latestDay.meta?.secondRoundRate || 0)
    : 'WAITING'

  const payoutPreview = {
    FOH: serviceChargeBase * 0.5,
    BAR: serviceChargeBase * 0.3,
    KITCHEN: serviceChargeBase * 0.2,
  }

  const bestDay = useMemo(() => {
    if (!filteredRows.length) return null
    return [...filteredRows].sort((a, b) => b.profit - a.profit)[0]
  }, [filteredRows])

  const worstDay = useMemo(() => {
    if (!filteredRows.length) return null
    return [...filteredRows].sort((a, b) => a.profit - b.profit)[0]
  }, [filteredRows])

  const dishPerformance = useMemo(() => {
    const map = {}

    filteredRows.forEach((day) => {
      ;(day.rows || []).forEach((row) => {
        const key = row.name || 'Unknown'

        if (!map[key]) {
          map[key] = {
            name: row.name || 'Unknown',
            category: row.category || 'Other',
            soldQty: 0,
            revenue: 0,
            profit: 0,
          }
        }

        map[key].soldQty += Number(row.soldQty || 0)
        map[key].revenue += Number(row.revenue || 0)
        map[key].profit += Number(row.profit || 0)
      })
    })

    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [filteredRows])

  const topDishes = dishPerformance.slice(0, 6)
  const weakDishes = [...dishPerformance].filter((row) => row.soldQty > 0).sort((a, b) => a.profit - b.profit).slice(0, 4)

  const aiManager = useMemo(() => {
    const commands = []
    const issues = []
    let score = 0

    if (!latestDay) {
      return {
        status: 'WAITING',
        score: 0,
        issues: ['No saved days available yet.'],
        commands: ['Save one full service day to activate dashboard intelligence.'],
      }
    }

    if (latestMargin >= 0.55) {
      score += 30
    } else if (latestMargin >= 0.4) {
      score += 18
    } else {
      issues.push('Margin below target on the latest saved day.')
    }

    if ((latestDay.meta?.complaints || 0) === 0) {
      score += 15
    } else if ((latestDay.meta?.complaints || 0) <= 2) {
      score += 8
      issues.push('Minor complaints were recorded.')
    } else {
      issues.push('Complaints are too high and need follow-up.')
    }

    if ((latestDay.meta?.avgTicketTime || 0) > 0 && (latestDay.meta?.avgTicketTime || 0) <= 15) {
      score += 15
    } else if ((latestDay.meta?.avgTicketTime || 0) > 15 && (latestDay.meta?.avgTicketTime || 0) <= 20) {
      score += 8
    } else if ((latestDay.meta?.avgTicketTime || 0) > 20) {
      issues.push('Ticket time is too slow.')
    }

    if ((latestDay.meta?.secondRoundRate || 0) >= 0.6) {
      score += 20
    } else if ((latestDay.meta?.secondRoundRate || 0) >= 0.45) {
      score += 10
    } else if ((latestDay.meta?.secondRoundRate || 0) > 0) {
      issues.push('Second-round selling is weak.')
    }

    if ((latestDay.meta?.covers || 0) > 0) {
      score += 10
    }

    if (topDishes.length) {
      commands.push(`Push ${topDishes[0].name} harder. It is leading revenue.`)
    }

    if (weakDishes.length) {
      commands.push(`Review ${weakDishes[0].name}. It is the weakest active profit performer.`)
    }

    if ((latestDay.meta?.avgTicketTime || 0) > 20) {
      commands.push('Tighten kitchen coordination and review service bottlenecks before next shift.')
    }

    if ((latestDay.meta?.secondRoundRate || 0) < 0.45 && (latestDay.meta?.secondRoundRate || 0) > 0) {
      commands.push('Train floor staff to push drinks and dessert follow-up earlier.')
    }

    if ((latestDay.meta?.complaints || 0) > 0) {
      commands.push('Close the loop on guest complaints with manager notes and staff feedback.')
    }

    const status = score >= 65 ? 'GOOD' : score >= 40 ? 'WARNING' : 'BAD'

    if (!issues.length) {
      issues.push('Operations are stable on the latest saved day.')
    }

    if (!commands.length) {
      commands.push('Maintain current standards and continue saving clean daily reports.')
    }

    return {
      status,
      score,
      issues: issues.slice(0, 4),
      commands: commands.slice(0, 4),
    }
  }, [latestDay, latestMargin, topDishes, weakDishes])

  const latestInsights = latestDay?.insights || []
  const tone = getStatusTone(aiManager.status)
  const serviceTone = getStatusTone(serviceChargeStatus)

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: THEME.bg,
          color: THEME.text,
          padding: 24,
        }}
      >
        Loading dashboard...
      </div>
    )
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: THEME.bg,
          color: THEME.text,
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: '40px auto',
            background: THEME.panel,
            border: `1px solid rgba(239,68,68,0.2)`,
            borderRadius: 18,
            padding: 20,
            color: THEME.red,
            fontWeight: 700,
          }}
        >
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        color: THEME.text,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(14px)',
          background: 'rgba(11,11,11,0.88)',
          borderBottom: `1px solid ${THEME.border}`,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1480,
            margin: '0 auto',
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  color: THEME.accent,
                  fontWeight: 900,
                  fontSize: 24,
                  letterSpacing: '-0.04em',
                }}
              >
                CC
              </div>
              <div
                style={{
                  color: THEME.text,
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: '-0.03em',
                }}
              >
                Churchill Karon
              </div>
            </div>
            <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
              Owner Dashboard | V6 Professional Control
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { key: '30d', label: 'Last 30 Days' },
              { key: '7d', label: 'Last 7 Days' },
              { key: 'all', label: 'All Time' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriodFilter(item.key)}
                style={{
                  border: periodFilter === item.key ? 'none' : `1px solid ${THEME.border}`,
                  background: periodFilter === item.key ? THEME.accent : THEME.panel,
                  color: '#ffffff',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 1480,
          margin: '0 auto',
          padding: '18px 16px 40px',
          display: 'grid',
          gap: 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <SummaryCard
            label="Revenue"
            value={formatCurrency(totals.revenue)}
            subValue={latestDay ? `Latest day ${formatBusinessDate(latestDay.date)}` : 'No saved day'}
            accent
          />
          <SummaryCard
            label="Profit"
            value={formatCurrency(totals.profit)}
            subValue={`Average margin ${formatPercent(avgMargin)}`}
          />
          <SummaryCard
            label="Covers"
            value={formatNumber(totals.covers)}
            subValue={`Revenue / Cover ${formatCurrency(revenuePerCover)}`}
          />
          <SummaryCard
            label="Drink Revenue"
            value={formatCurrency(totals.drinkRevenue)}
            subValue={`Avg 2nd Round ${formatPercent(avgSecondRound)}`}
          />
          <SummaryCard
            label="Best Day"
            value={bestDay ? formatBusinessDate(bestDay.date) : '-'}
            subValue={bestDay ? formatCurrency(bestDay.profit) : 'No data'}
          />
          <SummaryCard
            label="Owner AI"
            value={aiManager.status}
            subValue={`Score ${formatNumber(aiManager.score)}`}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
            gap: 18,
          }}
        >
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Executive View"
              subtitle="Latest service quality, profitability, and management status."
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              <TrendMiniCard
                label="Latest Day Revenue"
                value={formatCurrency(latestDay?.revenue || 0)}
              />
              <TrendMiniCard
                label="Latest Day Profit"
                value={formatCurrency(latestDay?.profit || 0)}
                tone={(latestDay?.profit || 0) >= 0 ? 'good' : 'bad'}
              />
              <TrendMiniCard
                label="Latest Margin"
                value={formatPercent(latestMargin)}
                tone={latestMargin >= 0.5 ? 'good' : latestMargin >= 0.3 ? 'warn' : 'bad'}
              />
              <TrendMiniCard
                label="Avg Ticket Time"
                value={`${formatNumber(avgTicketTime)} min`}
                tone={avgTicketTime > 20 ? 'bad' : avgTicketTime > 15 ? 'warn' : 'good'}
              />
              <TrendMiniCard
                label="Complaints"
                value={formatNumber(totals.complaints)}
                tone={totals.complaints > 4 ? 'bad' : totals.complaints > 0 ? 'warn' : 'good'}
              />
              <TrendMiniCard
                label="Lowest Profit Day"
                value={worstDay ? formatBusinessDate(worstDay.date) : '-'}
                tone="bad"
              />
            </div>

            <div
              style={{
                marginTop: 16,
                background: tone.bg,
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div style={{ color: THEME.muted, fontSize: 12 }}>AI Manager Status</div>
              <div
                style={{
                  color: tone.color,
                  fontSize: 28,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                {aiManager.status} ({aiManager.score})
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: 14,
                  marginTop: 14,
                }}
              >
                <div>
                  <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    Issues
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {aiManager.issues.map((item, index) => (
                      <div
                        key={`issue-${index}`}
                        style={{
                          background: THEME.panelSoft2,
                          borderRadius: 12,
                          padding: '10px 12px',
                          color: THEME.muted,
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    Commands
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {aiManager.commands.map((item, index) => (
                      <div
                        key={`cmd-${index}`}
                        style={{
                          background: THEME.panelSoft2,
                          borderRadius: 12,
                          padding: '10px 12px',
                          color: THEME.text,
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Service Charge"
              subtitle="Latest day 5% service model and role split."
            />

            <div
              style={{
                background: serviceTone.bg,
                borderRadius: 16,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ color: THEME.muted, fontSize: 12 }}>Latest Status</div>
              <div
                style={{
                  color: serviceTone.color,
                  fontSize: 24,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                {serviceChargeStatus}
              </div>
              <div style={{ color: THEME.muted, fontSize: 12, marginTop: 6 }}>
                Base pool {formatCurrency(serviceChargeBase)}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <TrendMiniCard label="FOH 50%" value={formatCurrency(payoutPreview.FOH)} />
              <TrendMiniCard label="BAR 30%" value={formatCurrency(payoutPreview.BAR)} />
              <TrendMiniCard label="KITCHEN 20%" value={formatCurrency(payoutPreview.KITCHEN)} />
            </div>

            {payoutData ? (
              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                {['FOH', 'BAR', 'KITCHEN'].map((role) => (
                  <div
                    key={role}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                      {role}
                    </div>
                    {(payoutData[role] || []).length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {(payoutData[role] || []).slice(0, 4).map((person, index) => (
                          <div
                            key={`${role}-${index}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ color: THEME.muted }}>{person.name}</span>
                            <span style={{ color: THEME.text }}>{formatCurrency(person.payout)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: THEME.muted, fontSize: 12 }}>No staff found.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 18,
          }}
        >
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Top Revenue Dishes"
              subtitle="Aggregated from saved daily reports in the selected period."
            />

            <div style={{ display: 'grid', gap: 12 }}>
              {topDishes.length ? (
                topDishes.map((dish) => (
                  <div
                    key={dish.name}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 16,
                      padding: 14,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ color: THEME.text, fontSize: 15, fontWeight: 700 }}>
                          {dish.name}
                        </div>
                        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
                          {dish.category} | Qty {formatNumber(dish.soldQty)}
                        </div>
                      </div>
                      <div style={{ color: THEME.accent, fontWeight: 700, fontSize: 14 }}>
                        {formatCurrency(dish.revenue)}
                      </div>
                    </div>
                    <BarRow
                      label="Revenue Weight"
                      value={dish.revenue}
                      maxValue={topDishes[0]?.revenue || 0}
                      color={THEME.accent}
                    />
                  </div>
                ))
              ) : (
                <div
                  style={{
                    background: THEME.panelSoft,
                    borderRadius: 16,
                    padding: 16,
                    color: THEME.muted,
                  }}
                >
                  No dish data available yet.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Operational Watchlist"
              subtitle="Weak spots and recent intelligence from the latest saved day."
            />

            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  background: THEME.panelSoft,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  Weakest Profit Dishes
                </div>
                {weakDishes.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {weakDishes.map((dish) => (
                      <div
                        key={dish.name}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: THEME.muted }}>{dish.name}</span>
                        <span style={{ color: THEME.red }}>{formatCurrency(dish.profit)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.muted, fontSize: 12 }}>No weak active dishes yet.</div>
                )}
              </div>

              <div
                style={{
                  background: THEME.panelSoft,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  Latest AI Insights
                </div>
                {latestInsights.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {latestInsights.slice(0, 4).map((insight, index) => (
                      <div
                        key={`insight-${index}`}
                        style={{
                          background: THEME.panelSoft2,
                          borderRadius: 12,
                          padding: '10px 12px',
                          color: THEME.muted,
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {insight}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.muted, fontSize: 12 }}>No AI insights saved yet.</div>
                )}
              </div>

              <div
                style={{
                  background: THEME.panelSoft,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  Manager Notes
                </div>
                <div style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.6 }}>
                  {latestDay?.meta?.managerNotes || 'No manager notes on the latest saved day.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 22,
            padding: 18,
            minWidth: 0,
          }}
        >
          <SectionTitle
            title="Saved Day Performance"
            subtitle="Daily operating results across the selected time range."
          />

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1020,
              }}
            >
              <thead>
                <tr>
                  {[
                    'Date',
                    'Revenue',
                    'Cost',
                    'Profit',
                    'Margin',
                    'Covers',
                    'Drink Revenue',
                    'Ticket Time',
                    '2nd Round',
                    'Complaints',
                    'Owner Status',
                  ].map((heading) => (
                    <th key={heading} style={tableHeadStyle}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((row) => {
                    const savedStatus =
                      row.meta?.ownerStatus?.status ||
                      getServiceStatus(getMargin(row.revenue, row.profit), row.meta?.complaints || 0, row.meta?.secondRoundRate || 0)

                    const rowTone = getStatusTone(savedStatus)

                    return (
                      <tr key={row.id || row.date}>
                        <td style={tableCellStrongStyle}>{formatBusinessDate(row.date)}</td>
                        <td style={tableCellStyle}>{formatCurrency(row.revenue)}</td>
                        <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                        <td
                          style={{
                            ...tableCellStyle,
                            color: row.profit >= 0 ? THEME.green : THEME.red,
                          }}
                        >
                          {formatCurrency(row.profit)}
                        </td>
                        <td style={tableCellStyle}>{formatPercent(getMargin(row.revenue, row.profit))}</td>
                        <td style={tableCellStyle}>{formatNumber(row.meta?.covers || 0)}</td>
                        <td style={tableCellStyle}>{formatCurrency(row.meta?.drinkRevenue || 0)}</td>
                        <td style={tableCellStyle}>{formatNumber(row.meta?.avgTicketTime || 0)} min</td>
                        <td style={tableCellStyle}>{formatPercent(row.meta?.secondRoundRate || 0)}</td>
                        <td style={tableCellStyle}>{formatNumber(row.meta?.complaints || 0)}</td>
                        <td style={tableCellStyle}>
                          <span
                            style={{
                              background: rowTone.bg,
                              color: rowTone.color,
                              borderRadius: 999,
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {savedStatus}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={11} style={emptyCellStyle}>
                      No saved days available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*='grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr)'],
          div[style*='grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

const tableHeadStyle = {
  textAlign: 'left',
  color: THEME.muted,
  fontSize: 12,
  fontWeight: 600,
  padding: '12px 10px',
  borderBottom: `1px solid ${THEME.border}`,
  whiteSpace: 'nowrap',
}

const tableCellStyle = {
  padding: '12px 10px',
  borderBottom: `1px solid ${THEME.border}`,
  color: THEME.muted,
  fontSize: 13,
  verticalAlign: 'middle',
}

const tableCellStrongStyle = {
  ...tableCellStyle,
  color: THEME.text,
  fontWeight: 700,
}

const emptyCellStyle = {
  padding: '18px 10px',
  color: THEME.muted,
  fontSize: 14,
  textAlign: 'center',
}