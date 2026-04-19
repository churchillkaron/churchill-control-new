"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("current_user"));
    if (stored) setUser(stored);
  }, []);

  if (!user) {
    return <div className="text-white p-10">No user logged in</div>;
  }

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">

          <Link href="/staff/invoices" className="card">
            <div className="text-xl">AI Invoice</div>
            <div className="text-white/50 text-sm mt-2">
              Upload bill to accounting
            </div>
          </Link>

          <Link href="/management/attendance" className="card">
            <div className="text-xl">Attendance</div>
            <div className="text-white/50 text-sm mt-2">
              Check in / check out
            </div>
          </Link>

          <Link href="/pos" className="card">
            <div className="text-xl">POS</div>
            <div className="text-white/50 text-sm mt-2">
              Take orders
            </div>
          </Link>

          <Link href="/staff/reviews" className="card">
            <div className="text-xl">Google Reviews</div>
            <div className="text-white/50 text-sm mt-2">
              Upload review screenshot
            </div>
          </Link>

          <Link href="/staff/performance" className="card">
            <div className="text-xl">Performance</div>
            <div className="text-white/50 text-sm mt-2">
              View score
            </div>
          </Link>

          <Link href="/staff/payroll" className="card">
            <div className="text-xl">Payroll</div>
            <div className="text-white/50 text-sm mt-2">
              Salary & payout
            </div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}