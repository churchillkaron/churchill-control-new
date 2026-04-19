"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function Dashboard() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Owner Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">

          <Link
            href="/pos"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">POS</div>
            <div className="text-white/50 text-sm mt-2">
              Orders and live sales
            </div>
          </Link>

          <Link
            href="/orders"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Orders</div>
            <div className="text-white/50 text-sm mt-2">
              Live order management
            </div>
          </Link>

          <Link
            href="/kitchen"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Kitchen</div>
            <div className="text-white/50 text-sm mt-2">
              Kitchen workflow and status
            </div>
          </Link>

          <Link
            href="/accounting"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Accounting</div>
            <div className="text-white/50 text-sm mt-2">
              Revenue, expenses, invoices
            </div>
          </Link>

          <Link
            href="/payout"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Payout</div>
            <div className="text-white/50 text-sm mt-2">
              Service charge distribution
            </div>
          </Link>

          <Link
            href="/history"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">History</div>
            <div className="text-white/50 text-sm mt-2">
              Financial records and reports
            </div>
          </Link>

          <Link
            href="/staff"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Staff Portal</div>
            <div className="text-white/50 text-sm mt-2">
              Staff experience and tools
            </div>
          </Link>

          <Link
            href="/staff-control"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Staff Control</div>
            <div className="text-white/50 text-sm mt-2">
              Performance, attendance, penalties
            </div>
          </Link>

          <Link
            href="/control-final"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Control Final</div>
            <div className="text-white/50 text-sm mt-2">
              Close day and finalize payouts
            </div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}