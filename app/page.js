export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.logo}>CC</div>

        <h1 style={styles.title}>
          Churchill Control System
        </h1>

        <p style={styles.subtitle}>
          Built for operators who demand clarity.
          Control revenue, understand cost, and run your restaurant with precision.
        </p>

        <a href="/control-final" style={styles.button}>
          Enter System
        </a>
      </div>

      <div style={styles.cards}>
        <Feature title="Real-time Control">
          Track daily revenue and cost instantly.
        </Feature>

        <Feature title="Profit Visibility">
          Know exactly where you make money.
        </Feature>

        <Feature title="Structured Data">
          Clean, reliable input — no spreadsheets.
        </Feature>
      </div>

      <footer style={styles.footer}>
        © {new Date().getFullYear()} Churchill Bar & Restaurant  
        <br />
        Built for precision. Designed for control.
      </footer>
    </div>
  );
}

function Feature({ title, children }) {
  return (
    <div style={styles.card}>
      <h3>{title}</h3>
      <p>{children}</p>
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
    fontSize: 38,
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
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
    marginTop: 60
  },
  card: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  footer: {
    marginTop: 80,
    padding: 20,
    fontSize: 12,
    color: '#777'
  }
};