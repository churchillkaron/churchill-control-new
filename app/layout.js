import NavBar from './components/NavBar'

export const metadata = {
  title: 'Churchill Control System',
  description: 'Restaurant Operating System V6',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#e6dcc7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <NavBar />

        <main>
          {children}
        </main>

        {/* ===== FOOTER ===== */}
        <div style={{
          marginTop: "40px",
          padding: "20px",
          textAlign: "center",
          fontSize: "12px",
          color: "#6b6458",
          borderTop: "1px solid #9f9478"
        }}>
          © {new Date().getFullYear()} Churchill Control System — Built for precision, performance, and profit.
        </div>

      </body>
    </html>
  )
}