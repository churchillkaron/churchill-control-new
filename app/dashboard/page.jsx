"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function Dashboard() {
  return (
    <AppShell>
      <div className="space-y-12 text-white">

        {/* HEADER */}
        <div>
          <h1 className="text-4xl font-semibold">Owner Dashboard</h1>
          <p className="text-white/40 mt-2">
            Control system and operations overview
          </p>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">

          <Link href="/pos" className="card">
            <div className="text-2xl">POS</div>
            <div className="text-white/40 text-sm mt-2">
              Orders and live sales
            </div>
          </Link>

          <Link href="/accounting" className="card">
            <div className="text-2xl">Accounting</div>
            <div className="text-white/40 text-sm mt-2">
              Revenue, expenses, invoices
            </div>
          </Link>

          <Link href="/payout" className="card">
            <div className="text-2xl">Payout</div>
            <div className="text-white/40 text-sm mt-2">
              Service charge distribution
            </div>
          </Link>

          <Link href="/history" className="card">
            <div className="text-2xl">History</div>
            <div className="text-white/40 text-sm mt-2">
              Financial records and reports
            </div>
          </Link>

          <Link href="/staff" className="card">
            <div className="text-2xl">Staff Portal</div>
            <div className="text-white/40 text-sm mt-2">
              Test staff experience and actions
            </div>
          </Link>

          <Link href="/control-final" className="card">
            <div className="text-2xl">Control Final</div>
            <div className="text-white/40 text-sm mt-2">
              Close day and finalize payouts
            </div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}