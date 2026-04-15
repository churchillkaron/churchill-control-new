export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.logo}>CC</div>

        <h1 style={styles.title}>
          Churchill Control System
        </h1>

        <p style={styles.subtitle}>
          Precision control for modern hospitality.
          Track revenue, manage cost, and understand your business in real time.
        </p>

        <a href="/control-final" style={styles.button}>
          Enter Control Panel
        </a>
      </div>

      <div style={styles.section}>
        <h2>Built for real operations</h2>

        <p style={styles.text}>
          Churchill Control is designed for restaurant owners who need clarity.
          No spreadsheets. No guesswork. Just clean data, structured insight,
          and full visibility over your daily performance.
        </p>
      </div>

      <footer style={styles.footer}>
        © {new Date().getFullYear()} Churchill Bar & Restaurant — All rights reserved.
      </footer>
    </div>
  );
}

const styles = {
  page: {
    textAlign: 'center'
  },
  hero: {
    padding: '80px 20px'
  },
  logo: {
    background: '#d97a00',
    color: '#fff',
    display: 'inline-block',
    padding: '14px 18px',
    borderRadius: 8,
    fontWeight: 'bold',
    marginBottom: 20
  },
  title: {
    fontSize: 36,
    marginBottom: 10
  },
  subtitle: {
    maxWidth: 600,
    margin: '0 auto 30px',
    color: '#555'
  },
  button: {
    background: '#222',
    color: '#fff',
    padding: '14px 28px',
    borderRadius: 6,
    textDecoration: 'none',
    fontWeight: 'bold'
  },
  section: {
    marginTop: 60,
    padding: 20
  },
  text: {
    maxWidth: 700,
    margin: '0 auto',
    color: '#555'
  },
  footer: {
    marginTop: 80,
    padding: 20,
    fontSize: 12,
    color: '#777'
  }
};