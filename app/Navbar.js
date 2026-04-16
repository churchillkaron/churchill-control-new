"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      padding: "10px",
      background: "black",
      color: "white",
      zIndex: 1000
    }}>
      <Link href="/dashboard">Dashboard</Link> |{" "}
      <Link href="/control-final">Control</Link> |{" "}
      <Link href="/pos">POS</Link> |{" "}
      <Link href="/accounting">Accounting</Link> |{" "}
      <Link href="/payout">Payout</Link> |{" "}
      <Link href="/history">History</Link>
    </div>
  );
}