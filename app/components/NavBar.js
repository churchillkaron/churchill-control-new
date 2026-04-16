'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const THEME = {
  bg: '#0b0b0b',
  panel: '#131313',
  border: 'rgba(255,255,255,0.08)',
  text: '#f5f5f5',
  muted: '#b7b2a4',
  accent: '#f97316',
}

const LINKS = [
  { name: 'Home', href: '/' },
  { name: 'Control', href: '/control-final' },
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'History', href: '/history' },
  { name: 'Accounting', href: '/accounting' },
  { name: 'Payout', href: '/payout' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: THEME.bg,
        borderBottom: `1px solid ${THEME.border}`,
        padding: '12px 20px',
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      {LINKS.map((link) => {
        const active = pathname === link.href

        return (
          <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                background: active ? THEME.accent : THEME.panel,
                color: '#fff',
                border: active ? 'none' : `1px solid ${THEME.border}`,
              }}
            >
              {link.name}
            </div>
          </Link>
        )
      })}
    </div>
  )
}