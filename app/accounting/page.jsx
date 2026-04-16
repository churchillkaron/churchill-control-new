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

function normalizeBusinessDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

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

function SummaryCard({ label, value, subValue, accent, valueColor }) {
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
          color: valueColor || (accent ? THEME.accent : THEME.text),
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

function MetricMini({ label, value, tone }) {
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

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([])
  const [historyRows, setHistoryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('30d')

  const [form, setForm] = useState({
    staff: 'John',
    amount: '',
    category: 'General',
    department: 'General',
    note: '',
    file: null,
  })

  useEffect(() => {
    let active = true

    async function loadData() {
      setLoading(true)
      setLoadError('')

      try {
        const [expenseRes, historyRes] = await Promise.all([
          fetch('/api/accounting-expenses', { cache: 'no-store' }),
          fetch('/api/history', { cache: 'no-store' }),
        ])

        const expenseJson = await expenseRes.json().catch(() => [])
        const historyJson = await historyRes.json().catch(() => [])

        if (!expenseRes.ok) {
          throw new Error('Failed to load expenses.')
        }

        if (!historyRes.ok) {
          throw new Error('Failed to load revenue history.')
        }

        if (!active) return

        const normalizedExpenses = Array.isArray(expenseJson)
          ? expenseJson
          : Array.isArray(expenseJson.data)
          ? expenseJson.data
          : []

        const normalizedHistory = Array.isArray(historyJson)
          ? historyJson.map((item) => {
              const dishes = safeParse(item.dishes)
              const meta = dishes?.meta || {}

              return {
                id: item.id,
                date: normalizeBusinessDate(item.date),
                created_at: item.created_at,
                revenue: Number(item.revenue || 0),
                cost: Number(item.cost || 0),
                profit: Number(item.profit || 0),
                drinkRevenue: Number(meta.drinkRevenue || 0),
                covers: Number(meta.covers || 0),
              }
            })
          : []

        setExpenses(normalizedExpenses)
        setHistoryRows(normalizedHistory)
      } catch (error) {
        if (!active) return
        setLoadError(error.message || 'Accounting failed to load.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [])

  async function refreshExpensesOnly() {
    const res = await fetch('/api/accounting-expenses', { cache: 'no-store' })
    const data = await res.json().catch(() => [])

    if (Array.isArray(data)) {
      setExpenses(data)
    } else if (Array.isArray(data.data)) {
      setExpenses(data.data)
    } else {
      setExpenses([])
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      setSaving(true)

      const formData = new FormData()
      formData.append('staff', form.staff)
      formData.append('amount', form.amount)
      formData.append('category', form.category)
      formData.append('department', form.department)
      formData.append('note', form.note)

      if (form.file) {
        formData.append('file', form.file)
      }

      const res = await fetch('/api/accounting-expenses', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Save failed')
      }

      setForm({
        staff: 'John',
        amount: '',
        category: 'General',
        department: 'General',
        note: '',
        file: null,
      })

      await refreshExpensesOnly()
    } catch (err) {
      console.error(err)
      alert('Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const filteredHistory = useMemo(() => {
    let rows = [...historyRows]

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
  }, [historyRows, periodFilter])

  const filteredExpenses = useMemo(() => {
    let rows = [...expenses]

    if (periodFilter === '7d') {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 7)
      rows = rows.filter((item) => new Date(String(item.date || item.created_at || '')) >= threshold)
    }

    if (periodFilter === '30d') {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 30)
      rows = rows.filter((item) => new Date(String(item.date || item.created_at || '')) >= threshold)
    }

    if (search.trim()) {
      const term = search.toLowerCase()
      rows = rows.filter((item) => {
        return (
          String(item.staff || '').toLowerCase().includes(term) ||
          String(item.category || '').toLowerCase().includes(term) ||
          String(item.department || '').toLowerCase().includes(term) ||
          String(item.note || '').toLowerCase().includes(term)
        )
      })
    }

    return rows.sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
  }, [expenses, periodFilter, search])

  const revenueTotal = useMemo(
    () => filteredHistory.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
    [filteredHistory]
  )

  const foodCostTotal = useMemo(
    () => filteredHistory.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    [filteredHistory]
  )

  const grossProfitTotal = useMemo(
    () => filteredHistory.reduce((sum, row) => sum + Number(row.profit || 0), 0),
    [filteredHistory]
  )

  const expenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [filteredExpenses]
  )

  const today = new Date().toISOString().slice(0, 10)

  const todayExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => {
      const d = String(item.date || item.created_at || '').slice(0, 10)
      return d === today ? sum + Number(item.amount || 0) : sum
    }, 0)
  }, [filteredExpenses, today])

  const netAfterExpenses = grossProfitTotal - expenseTotal
  const expenseVsRevenuePct = revenueTotal > 0 ? expenseTotal / revenueTotal : 0
  const netMarginAfterExpenses = revenueTotal > 0 ? netAfterExpenses / revenueTotal : 0

  const categoryBreakdown = useMemo(() => {
    const map = {}

    filteredExpenses.forEach((item) => {
      const key = item.category || 'Other'
      map[key] = (map[key] || 0) + Number(item.amount || 0)
    })

    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [filteredExpenses])

  const departmentBreakdown = useMemo(() => {
    const map = {}

    filteredExpenses.forEach((item) => {
      const key = item.department || 'Other'
      map[key] = (map[key] || 0) + Number(item.amount || 0)
    })

    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [filteredExpenses])

  function getReceipt(item) {
    return item.image_url || item.image || item.file || item.receipt_url || ''
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
                Churchill Accounting
              </div>
            </div>
            <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
              Expense, revenue, and real net visibility
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
        {loadError ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: `1px solid rgba(239,68,68,0.2)`,
              borderRadius: 16,
              padding: 16,
              color: THEME.red,
              fontWeight: 700,
            }}
          >
            {loadError}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <SummaryCard
            label="Revenue"
            value={formatCurrency(revenueTotal)}
            subValue={`${formatNumber(filteredHistory.length)} saved days`}
            accent
          />
          <SummaryCard
            label="Food Cost"
            value={formatCurrency(foodCostTotal)}
            subValue={`Gross profit ${formatCurrency(grossProfitTotal)}`}
          />
          <SummaryCard
            label="Operating Expenses"
            value={formatCurrency(expenseTotal)}
            subValue={`Today ${formatCurrency(todayExpenses)}`}
          />
          <SummaryCard
            label="Net After Expenses"
            value={formatCurrency(netAfterExpenses)}
            valueColor={netAfterExpenses >= 0 ? THEME.green : THEME.red}
            subValue={`Net margin ${formatNumber(netMarginAfterExpenses * 100)}%`}
          />
          <SummaryCard
            label="Expense / Revenue"
            value={formatPercent(expenseVsRevenuePct)}
            subValue="Direct operating pressure"
          />
          <SummaryCard
            label="Expense Entries"
            value={formatNumber(filteredExpenses.length)}
            subValue="Tracked in selected period"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
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
              title="Financial Control"
              subtitle="Revenue, cost, expenses, and real net result in one view."
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              <MetricMini label="Gross Profit" value={formatCurrency(grossProfitTotal)} tone={grossProfitTotal >= 0 ? 'good' : 'bad'} />
              <MetricMini label="Net After Expenses" value={formatCurrency(netAfterExpenses)} tone={netAfterExpenses >= 0 ? 'good' : 'bad'} />
              <MetricMini label="Expense Pressure" value={formatPercent(expenseVsRevenuePct)} tone={expenseVsRevenuePct > 0.2 ? 'bad' : expenseVsRevenuePct > 0.1 ? 'warn' : 'good'} />
              <MetricMini label="Today Expenses" value={formatCurrency(todayExpenses)} />
            </div>

            <div
              style={{
                marginTop: 16,
                background: THEME.panelSoft,
                borderRadius: 16,
                padding: 14,
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ color: THEME.text, fontWeight: 700, fontSize: 14 }}>
                Accounting Read
              </div>

              <div
                style={{
                  background: THEME.panelSoft2,
                  borderRadius: 12,
                  padding: '10px 12px',
                  color: THEME.muted,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Gross operating profit is {formatCurrency(grossProfitTotal)}. After tracked expenses of {formatCurrency(expenseTotal)}, the real net position is {formatCurrency(netAfterExpenses)}.
              </div>

              <div
                style={{
                  background: THEME.panelSoft2,
                  borderRadius: 12,
                  padding: '10px 12px',
                  color: THEME.muted,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Expenses currently represent {formatPercent(expenseVsRevenuePct)} of revenue in the selected period.
              </div>

              <div
                style={{
                  background: THEME.panelSoft2,
                  borderRadius: 12,
                  padding: '10px 12px',
                  color: THEME.muted,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Net margin after expenses is {formatNumber(netMarginAfterExpenses * 100)}%. This is the number that matters most for owner visibility.
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
              title="Add Expense"
              subtitle="Track owner-visible expenses with receipt support."
            />

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                <input
                  value={form.staff}
                  onChange={(e) => setForm({ ...form, staff: e.target.value })}
                  placeholder="Staff"
                  style={inputStyle}
                />

                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="Amount"
                  style={inputStyle}
                />

                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Category"
                  style={inputStyle}
                />

                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Department"
                  style={inputStyle}
                />
              </div>

              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Note"
                rows={4}
                style={textAreaStyle}
              />

              <input
                type="file"
                onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                style={{
                  color: THEME.muted,
                  fontSize: 13,
                }}
              />

              <button
                type="submit"
                disabled={saving}
                style={{
                  border: 'none',
                  background: THEME.accent,
                  color: '#ffffff',
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            </form>
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
              title="Category Breakdown"
              subtitle="Where expense weight is concentrated."
            />

            <div style={{ display: 'grid', gap: 10 }}>
              {categoryBreakdown.length ? (
                categoryBreakdown.map(([cat, val]) => (
                  <div
                    key={cat}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 14,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span style={{ color: THEME.text }}>{cat}</span>
                    <span style={{ color: THEME.muted }}>{formatCurrency(val)}</span>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    background: THEME.panelSoft,
                    borderRadius: 14,
                    padding: 12,
                    color: THEME.muted,
                  }}
                >
                  No expense data.
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
              title="Department Breakdown"
              subtitle="Department-level operating pressure."
            />

            <div style={{ display: 'grid', gap: 10 }}>
              {departmentBreakdown.length ? (
                departmentBreakdown.map(([dept, val]) => (
                  <div
                    key={dept}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 14,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span style={{ color: THEME.text }}>{dept}</span>
                    <span style={{ color: THEME.muted }}>{formatCurrency(val)}</span>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    background: THEME.panelSoft,
                    borderRadius: 14,
                    padding: 12,
                    color: THEME.muted,
                  }}
                >
                  No department data.
                </div>
              )}
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
            title="Expense Log"
            subtitle="Search by staff, category, department, or note."
            right={
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expenses"
                style={{
                  ...inputStyle,
                  minWidth: 220,
                }}
              />
            }
          />

          {loading ? (
            <div
              style={{
                background: THEME.panelSoft,
                borderRadius: 14,
                padding: 14,
                color: THEME.muted,
              }}
            >
              Loading...
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div
              style={{
                background: THEME.panelSoft,
                borderRadius: 14,
                padding: 14,
                color: THEME.muted,
              }}
            >
              No expenses yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredExpenses.map((item, i) => {
                const receipt = getReceipt(item)

                return (
                  <div
                    key={item.id || i}
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
                          {item.category || 'Uncategorized'}
                        </div>
                        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
                          {item.staff || '-'} • {item.department || '-'} • {formatBusinessDate(item.date || item.created_at)}
                        </div>
                      </div>

                      <div style={{ color: THEME.accent, fontWeight: 700 }}>
                        {formatCurrency(item.amount)}
                      </div>
                    </div>

                    <div style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.6 }}>
                      {item.note || 'No note'}
                    </div>

                    {receipt ? (
                      <a
                        href={receipt}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: THEME.accent,
                          fontSize: 13,
                          textDecoration: 'none',
                          fontWeight: 700,
                        }}
                      >
                        View Receipt
                      </a>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*='grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr)'],
          div[style*='grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  borderRadius: 12,
  border: `1px solid ${THEME.border}`,
  background: THEME.panelSoft2,
  color: THEME.text,
  padding: '12px 14px',
  outline: 'none',
  fontSize: 14,
}

const textAreaStyle = {
  width: '100%',
  borderRadius: 12,
  border: `1px solid ${THEME.border}`,
  background: THEME.panelSoft2,
  color: THEME.text,
  padding: '12px 14px',
  outline: 'none',
  fontSize: 14,
  resize: 'vertical',
}