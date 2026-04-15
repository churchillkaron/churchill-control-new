export const metadata = {
  title: "Churchill Control",
  description: "Churchill restaurant control system",
};

const shell = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khaki: "#b7a57a",
  khakiDark: "#8f7d56",
  white: "#ffffff",
  good: "#5f7a52",
  bad: "#9c5f4a",
  warn: "#b0813f",
};

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      style={{
        textDecoration: "none",
        color: shell.text,
        fontWeight: 700,
        padding: "10px 16px",
        borderRadius: 12,
        background: shell.panel,
        border: `1px solid ${shell.line}`,
      }}
    >
      {children}
    </a>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: shell.bg,
          color: shell.text,
          fontFamily:
            "Inter, Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
          }}
        >
          <header
            style={{
              borderBottom: `1px solid ${shell.line}`,
              background: "#efe7d6",
              position: "sticky",
              top: 0,
              zIndex: 20,
            }}
          >
            <div
              style={{
                maxWidth: 1400,
                margin: "0 auto",
                padding: "18px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <a
                href="/"
                style={{
                  textDecoration: "none",
                  color: shell.text,
                  fontWeight: 900,
                  fontSize: 28,
                  letterSpacing: "0.5px",
                }}
              >
                CC Churchill Control
              </a>

              <nav
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <NavLink href="/">Home</NavLink>
                <NavLink href="/control-final">Control</NavLink>
                <NavLink href="/dashboard">Dashboard</NavLink>
                <NavLink href="/history">History</NavLink>
              </nav>
            </div>
          </header>

          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}