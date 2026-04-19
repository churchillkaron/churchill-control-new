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
    return (
      <div className="h-screen flex items-center justify-center text-white">
        No user logged in
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">

          <Link
            href="/staff/invoices"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">AI Invoice</div>
          </Link>

          <Link
            href="/management/attendance"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Attendance</div>
          </Link>

          <Link
            href="/pos"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">POS</div>
          </Link>

          <Link
            href="/staff/performance"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Performance</div>
          </Link>

          <Link
            href="/staff/payroll"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl text-white">Payroll</div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}