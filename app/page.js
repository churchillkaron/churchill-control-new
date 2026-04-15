const colors = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khaki: "#b7a57a",
  khakiDark: "#8f7d56",
  white: "#ffffff",
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
        padding: 24,
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
          padding: "48px 24px 64px",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #efe7d6 0%, #ddd0b4 100%)",
            border: `1px solid ${colors.line}`,
            borderRadius: 24,
            padding: 36,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              color: colors.khakiDark,
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 800,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            Churchill Control System
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 54,
              lineHeight: 1.05,
              color: colors.text,
            }}
          >
            Khaki operations system for Churchill
          </h1>

          <p
            style={{
              maxWidth: 900,
              marginTop: 16,
              marginBottom: 28,
              color: colors.muted,
              fontSize: 18,
              lineHeight: 1.7,
            }}
          >
            Daily control, POS performance, menu engineering, owner analytics,
            and saved business-day history in one clean system.
          </p>

          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <a
              href="/control-final"
              style={{
                textDecoration: "none",
                background: colors.khakiDark,
                color: colors.white,
                padding: "14px 22px",
                borderRadius: 14,
                fontWeight: 800,
              }}
            >
              Open Control Panel
            </a>

            <a
              href="/dashboard"
              style={{
                textDecoration: "none",
                background: colors.panel,
                color: colors.text,
                padding: "14px 22px",
                borderRadius: 14,
                border: `1px solid ${colors.line}`,
                fontWeight: 800,
              }}
            >
              Open Dashboard
            </a>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          <ActionCard
            title="Daily Control"
            text="Run live sales, quantities, revenue, cost and profit from one control screen."
            href="/control-final"
          />
          <ActionCard
            title="Owner Dashboard"
            text="Track revenue, profit, margin, best day, worst day and AI insight summaries."
            href="/dashboard"
          />
          <ActionCard
            title="Saved History"
            text="Review previously saved days, business totals and dish-level snapshots."
            href="/history"
          />
        </div>
      </div>
    </div>
  );
}