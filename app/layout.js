export default function RootLayout({ children }) {
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
              <a href="/control-final" style={styles.link}>Control</a>
              <a href="/dashboard" style={styles.link}>Dashboard</a>
              <a href="/history" style={styles.link}>History</a>
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
    background: '#ffffff',
    borderBottom: '1px solid #e0dccf',
    padding: '18px 0'
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
    gap: 24
  },
  link: {
    textDecoration: 'none',
    color: '#333',
    fontWeight: 500
  },
  main: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: 20
  }
};