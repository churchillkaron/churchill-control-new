"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function RootLayout({ children }) {
  const path = usePathname();

  const linkStyle = (p) => ({
    padding: "8px 14px",
    borderRadius: 6,
    background: path === p ? "#d97706" : "transparent",
    color: path === p ? "white" : "black",
    textDecoration: "none",
    fontWeight: 500,
  });

  return (
    <html>
      <body>
        {/* NAVBAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: 20,
            borderBottom: "1px solid #ddd",
          }}
        >
          <div style={{ fontWeight: 700 }}>CC Churchill Control</div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/control-final" style={linkStyle("/control-final")}>
              Control
            </Link>

            <Link href="/dashboard" style={linkStyle("/dashboard")}>
              Dashboard
            </Link>

            <Link href="/history" style={linkStyle("/history")}>
              History
            </Link>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div>{children}</div>
      </body>
    </html>
  );
}