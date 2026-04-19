"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function AccountingPage() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">
        <h1 className="text-3xl">Accounting</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <Link
            href="/accounting/overview"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Overview</div>
            <div className="text-white/50 text-sm mt-2">
              Profit, expenses, service charge, control metrics
            </div>
          </Link>

          <Link
            href="/accounting/invoices"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">AI Invoices</div>
            <div className="text-white/50 text-sm mt-2">
              Upload invoices, analyze with AI, approve and save
            </div>
          </Link>

          <Link
            href="/accounting/expenses"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Expenses</div>
            <div className="text-white/50 text-sm mt-2">
              Manual expenses and invoice feed combined
            </div>
          </Link>

          <Link
            href="/accounting/revenue"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Revenue</div>
            <div className="text-white/50 text-sm mt-2">
              Revenue input and totals
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}