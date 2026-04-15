export default function RootLayout({ children }) {
  return (
    <html>
      <body style={styles.body}>
        <nav style={styles.nav}>
          <div style={styles.navInner}>
            <span style={styles.logo}>Churchill Control</span>

            <div style={styles.links}>
              <a href="/control-final" style={styles.link}>
                Control
              </a>
              <a href="/dashboard" style={styles.link}>
                Dashboard
              </a>
              <a href="/history" style={styles.link}>
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
    fontFamily: 'Arial, sans-serif',
    background: '#f5f1e6'
  },
  nav: {
    background: '#ffffff',
    borderBottom: '1px solid #ddd',
    padding: '15px 0',
    marginBottom: 30
  },
  navInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logo: {
    fontWeight: 'bold',
    fontSize: 18
  },
  links: {
    display: 'flex',
    gap: 20
  },
  link: {
    textDecoration: 'none',
    color: '#333',
    fontWeight: 500
  },
  main: {
    maxWidth: 1100,
    margin: '0 auto'
  }
};