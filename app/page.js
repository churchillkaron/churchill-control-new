'use client'

import Link from 'next/link'

const THEME = {
  bg: '#0b0b0b',
  panel: '#131313',
  border: 'rgba(255,255,255,0.08)',
  text: '#f5f5f5',
  muted: '#b7b2a4',
  accent: '#f97316',
}

const MODULES = [
  {
    title: 'Control Panel',
    desc: 'Run the full service: sales, production, stock, and daily save.',
    href: '/control-final',
  },
  {
    title: 'Dashboard',
    desc: 'Owner view: KPIs, AI manager, performance insights.',
    href: '/dashboard',
  },
  {
    title: 'History',
    desc: 'All saved days, analytics, and performance tracking.',
    href: '/history',
  },
  {
    title: 'Accounting',
    desc: 'Track expenses, costs, and financial overview.',
    href: '/accounting',
  },
  {
    title: 'Payout',
    desc: 'Service charge split and staff payout control.',
    href: '/payout',
  },
]

export default function Home() {
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
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gap: 24,
        }}
      >
        {/* HEADER */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                color: THEME.accent,
                fontWeight: 900,
                fontSize: 28,
              }}
            >
              CC
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              Churchill Control System
            </div>
          </div>

          <div style={{ color: THEME.muted, marginTop: 6 }}>
            Restaurant Operating System — V6 Master
          </div>
        </div>

        {/* GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              style={{
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  background: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 18,
                  padding: 20,
                  height: '100%',
                  display: 'grid',
                  gap: 10,
                  cursor: 'pointer',
                  transition: '0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  {mod.title}
                </div>

                <div
                  style={{
                    color: THEME.muted,
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {mod.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* FOOTER */}
        <div
          style={{
            marginTop: 20,
            color: THEME.muted,
            fontSize: 12,
          }}
        >
          System Status: V6 MASTER ACTIVE
        </div>
      </div>
    </div>
  )
}