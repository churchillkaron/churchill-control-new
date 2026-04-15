'use client';

import { usePathname } from 'next/navigation';

export default function RootLayout({ children }) {
  const pathname = usePathname();

  function getLinkStyle(path) {
    return {
      textDecoration: 'none',
      fontWeight: 500,
      padding: '6px 10px',
      borderRadius: 6,
      color: pathname === path ? '#fff' : '#333',
      background: pathname === path ? '#d97a00' : 'transparent'
    };
  }

  return (
    <html>
      <body style={styles.body}>
        <nav style={styles.nav}>
          <div style={styles.navInner}>
            <div style={styles.logoWrap}>
              <div style={styles.logoMark}>CC</div>
              <span style={styles.logoText}>Churchill Control</span>
            </div>

            <div style={styles.links}>
              <a href="/control-final" style={getLinkStyle('/control-final')}>
                Control
              </a>
              <a href="/dashboard" style={getLinkStyle('/dashboard')}>
                Dashboard
              </a>
              <a href="/history" style={getLinkStyle('/history')}>
                History
              </a>
            </div>
          </div>
        </nav>

        <main style={styles.main}>{children}</main>
      </body>
    </html>
  );
}

const styles = {
  body: {
    margin: 0,
    fontFamily: 'Segoe UI, sans-serif',
    background: '#f5f1e6',
    color: '#222'
  },
  nav: {
    background: '#fff',
    borderBottom: '1px solid #e0dccf',
    padding: '18px 0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
  },
  navInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  logoMark: {
    background: '#d97a00',
    color: '#fff',
    fontWeight: 'bold',
    padding: '6px 10px',
    borderRadius: 6
  },
  logoText: {
    fontWeight: 600,
    fontSize: 16
  },
  links: {
    display: 'flex',
    gap: 20
  },
  main: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: 20
  }
};