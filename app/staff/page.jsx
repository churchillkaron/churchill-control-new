"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [user, setUser] = useState(null);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
  const stored = JSON.parse(localStorage.getItem("current_user"));
  if (!stored) return;

  setUser(stored);
}, []);

  const selectUser = (staffName) => {
    localStorage.setItem("staff_name", staffName);
    setName(staffName);
    setSelected(true);
  };

  return (
    <AppShell>
      <div className="space-y-10">
        {!selected ? (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl text-white">Staff Portal</h1>
              <p className="text-white/50">Select your name to enter</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {["FOH 1", "FOH 2", "BAR", "KITCHEN"].map((staffName) => (
                <button
                  key={staffName}
                  onClick={() => selectUser(staffName)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-5 text-white text-left"
                >
                  <div className="text-lg">{staffName}</div>
                  <div className="text-white/40 text-sm mt-1">Open portal</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl text-white">{name}</h1>
              <p className="text-white/50">Staff tools and actions</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <Link
                href="/staff/invoices"
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-6 block"
              >
                <div className="text-xl text-white">AI Invoice</div>
                <div className="text-white/40 text-sm mt-2">
                  Take photo of bill and send to accounting
                </div>
              </Link>

              <Link
                href="/management/attendance"
                className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-2xl p-6 block"
              >
                <div className="text-xl text-white">Attendance</div>
                <div className="text-white/40 text-sm mt-2">
                  Check in and check out
                </div>
              </Link>

              <button
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left opacity-60 cursor-default"
                disabled
              >
                <div className="text-xl text-white">Google Reviews</div>
                <div className="text-white/40 text-sm mt-2">
                  Upload review screenshot
                </div>
              </button>

              <button
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left opacity-60 cursor-default"
                disabled
              >
                <div className="text-xl text-white">Performance</div>
                <div className="text-white/40 text-sm mt-2">
                  View score and rating
                </div>
              </button>

              <button
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left opacity-60 cursor-default"
                disabled
              >
                <div className="text-xl text-white">Payroll</div>
                <div className="text-white/40 text-sm mt-2">
                  Salary and payout status
                </div>
              </button>

              <button
                onClick={() => {
                  localStorage.removeItem("staff_name");
                  setName("");
                  setSelected(false);
                }}
                className="bg-[#ff7a00]/10 border border-[#ff7a00]/30 hover:bg-[#ff7a00]/20 transition rounded-2xl p-6 text-left"
              >
                <div className="text-xl text-[#ff7a00]">Switch User</div>
                <div className="text-white/40 text-sm mt-2">
                  Return to staff selection
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}