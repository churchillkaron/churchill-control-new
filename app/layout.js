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
  white: "#ffffff",
  orange: "#f97316",
};

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      style={{
        textDecoration: "none",
        color: shell.white,
        fontWeight: 700,
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.08)",
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </a>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </head>
      <body
        style={{
          margin: 0,
          background: shell.bg,
          color: shell.text,
          fontFamily: "Inter, Arial, Helvetica, sans-serif",
        }}
      >
        <header
          style={{
            background: "#000000",
            borderBottom: "1px solid #111",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              padding: "14px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 900,
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              <span style={{ color: shell.orange }}>CC</span>
              <span style={{ color: shell.white }}>Churchill Karon</span>
            </div>

            <nav
              style={{
                display: "flex",
                gap: 8,
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
      </body>
    </html>
  );
}