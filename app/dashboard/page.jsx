"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function Dashboard() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Owner Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">

          <Link href="/pos" className="card">
            <div className="text-xl">POS</div>
            <div className="text-white/40 text-sm mt-2">
              Orders and sales
            </div>
          </Link>

          <Link href="/accounting" className="card">
            <div className="text-xl">Accounting</div>
            <div className="text-white/40 text-sm mt-2">
              Revenue, expenses, invoices
            </div>
          </Link>

          <Link href="/payout" className="card">
            <div className="text-xl">Payout</div>
            <div className="text-white/40 text-sm mt-2">
              Service charge distribution
            </div>
          </Link>

          <Link href="/history" className="card">
            <div className="text-xl">History</div>
            <div className="text-white/40 text-sm mt-2">
              Saved financial days
            </div>
          </Link>

          <Link href="/staff" className="card">
            <div className="text-xl">Staff Portal</div>
            <div className="text-white/40 text-sm mt-2">
              Test staff experience
            </div>
          </Link>

          <Link href="/control-final" className="card">
            <div className="text-xl">Control Final</div>
            <div className="text-white/40 text-sm mt-2">
              Close day and payouts
            </div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}