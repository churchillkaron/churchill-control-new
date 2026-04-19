"use client";

import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="p-10 text-white space-y-10">

      <h1 className="text-3xl">Owner Dashboard</h1>

      <div className="grid md:grid-cols-2 gap-6">

        <Link href="/pos" className="card">POS</Link>

        <Link href="/accounting" className="card">Accounting</Link>

        <Link href="/payout" className="card">Payout</Link>

        <Link href="/history" className="card">History</Link>

        <Link href="/staff-control" className="card">Staff Control</Link>

        <Link href="/control-final" className="card">Control Final</Link>

        {/* 🔥 THIS IS THE FIX */}
        <Link href="/staff" className="card">
          Staff Portal (Test)
        </Link>

      </div>

    </div>
  );
}