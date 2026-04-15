const colors = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  white: "#ffffff",
  orange: "#f97316",
};

function ActionCard({ title, text, href }) {
  return (
    <a
      href={href}
      style={{
        textDecoration: "none",
        color: colors.text,
        background: colors.panel,
        border: `1px solid ${colors.line}`,
        borderRadius: 18,
        padding: 22,
        display: "block",
        boxShadow: "0 10px 30px rgba(92, 77, 50, 0.08)",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ color: colors.muted, lineHeight: 1.6 }}>{text}</div>
    </a>
  );
}

export default function HomePage() {
  return (
    <div
      style={{
        background: colors.bg,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "28px 16px 48px",
        }}
      >
        <div
          style={{
            background: "#000000",
            borderRadius: 24,
            padding: "28px 22px",
            marginBottom: 22,
            color: colors.white,
          }}
        >
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 800,
              marginBottom: 12,
              fontSize: 12,
              color: "#aaa",
            }}
          >
            Churchill Control System
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 8vw, 54px)",
              lineHeight: 1.05,
            }}
          >
            <span style={{ color: colors.orange }}>CC</span>{" "}
            Churchill Karon Control
          </h1>

          <p
            style={{
              maxWidth: 900,
              marginTop: 16,
              marginBottom: 24,
              fontSize: "clamp(15px, 3.8vw, 18px)",
              lineHeight: 1.7,
              color: "#ddd",
            }}
          >
            A centralized control system for managing daily restaurant operations,
            monitoring financial performance, and optimizing menu profitability
            through real-time data and intelligent insights.
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <a
              href="/control-final"
              style={{
                textDecoration: "none",
                background: colors.orange,
                color: "#000",
                padding: "14px 20px",
                borderRadius: 14,
                fontWeight: 800,
                flex: "1 1 220px",
                textAlign: "center",
              }}
            >
              Open Control Panel
            </a>

            <a
              href="/dashboard"
              style={{
                textDecoration: "none",
                background: "#111",
                color: colors.white,
                padding: "14px 20px",
                borderRadius: 14,
                border: "1px solid #333",
                fontWeight: 800,
                flex: "1 1 220px",
                textAlign: "center",
              }}
            >
              Open Dashboard
            </a>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          <ActionCard
            title="Daily Control"
            text="Manage live sales, dish performance, revenue and profit in real time."
            href="/control-final"
          />
          <ActionCard
            title="Owner Dashboard"
            text="Track financial performance, margins and business trends."
            href="/dashboard"
          />
          <ActionCard
            title="Saved History"
            text="Review past business days and performance data."
            href="/history"
          />
        </div>
      </div>
    </div>
  );
}