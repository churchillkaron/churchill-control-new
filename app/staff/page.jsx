"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [payroll, setPayroll] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [showLatePopup, setShowLatePopup] = useState(false);
  const [lateReason, setLateReason] = useState("");

  const SHIFT_START_HOUR = 10;

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    setStaffName(name);
    setStaffRole(role);

    const data =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;
    setPayroll(data);

    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    const today = new Date().toLocaleDateString("en-GB");

    const alreadyCheckedIn = attendance.some(
      (entry) =>
        entry.name === name &&
        entry.role === role &&
        entry.date === today
    );

    setCheckedIn(alreadyCheckedIn);
  }, []);

  const isLate = () => {
    const now = new Date();
    return now.getHours() >= SHIFT_START_HOUR;
  };

  const saveAttendance = (late, reason = "") => {
    const existing =
      JSON.parse(localStorage.getItem("attendance")) || [];

    const entry = {
      name: staffName,
      role: staffRole,
      date: new Date().toLocaleDateString("en-GB"),
      time: new Date().toLocaleTimeString(),
      late,
      reason,
      approved: false,
    };

    localStorage.setItem("attendance", JSON.stringify([entry, ...existing]));
    setCheckedIn(true);
  };

  const handleStartShift = () => {
    if (checkedIn) return;

    if (isLate()) {
      setShowLatePopup(true);
      return;
    }

    saveAttendance(false, "");
  };

  const handleLateSubmit = () => {
    saveAttendance(true, lateReason);
    setShowLatePopup(false);
    setLateReason("");
  };

  const confirmSalary = () => {
    if (!payroll) return;

    const updated = { ...payroll };

    const index = updated.staff.findIndex(
      (s) => s.name === staffName
    );

    if (index === -1) return;

    updated.staff[index].staffConfirmed = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setPayroll(updated);
  };

  const staffData = payroll?.staff.find(
    (s) => s.name === staffName
  );

  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Staff Portal
          </h1>
          <p className="text-white/50 text-sm">
            Shift tracking, attendance, and payroll confirmation
          </p>
        </div>

        {/* STAFF INFO CARD */}
        <div className="relative">
          <div className="absolute -inset-4 bg-[#ff7a00]/10 blur-2xl rounded-3xl" />

          <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]">

            <div className="flex justify-between text-sm text-white/60">
              <div>{staffName}</div>
              <div>{staffRole}</div>
            </div>

            <div className="mt-4">
              Shift Status:{" "}
              {checkedIn ? (
                <span className="text-green-400">✅ Checked In</span>
              ) : (
                <span className="text-yellow-400">Not Checked In</span>
              )}
            </div>

            {!checkedIn && (
              <button
                onClick={handleStartShift}
                className="mt-6 bg-[#ff7a00] px-5 py-2 rounded-xl text-black font-medium shadow-lg"
              >
                Start Shift
              </button>
            )}
          </div>
        </div>

        {/* PAYROLL */}
        {!staffData ? (
          <div className="relative">
            <div className="absolute -inset-2 bg-white/5 blur-xl rounded-xl" />

            <div className="relative bg-white/[0.05] border border-white/10 p-6 rounded-xl">
              No payroll data available
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-3xl" />

            <div className="relative bg-white/[0.06] border border-white/10 p-6 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.6)]">

              <h2 className="text-xl mb-4 text-white/80">
                Salary Overview
              </h2>

              <div>Salary: THB {staffData.salary}</div>
              <div>Bonus: THB {Math.round(staffData.bonus)}</div>

              <div className="mt-3 text-[#ff7a00] font-medium">
                Total: THB {Math.round(staffData.total)}
              </div>

              <div className="mt-4 space-y-1 text-sm">
                <div>
                  Staff Confirmed:{" "}
                  {staffData.staffConfirmed ? "✅ Yes" : "❌ No"}
                </div>
                <div>
                  Manager Approved:{" "}
                  {staffData.managerApproved ? "✅ Yes" : "❌ No"}
                </div>
                <div>
                  Payment Confirmed:{" "}
                  {staffData.paymentConfirmed ? "✅ Paid" : "❌ Not Paid"}
                </div>
              </div>

              {!staffData.staffConfirmed && (
                <button
                  onClick={confirmSalary}
                  className="mt-6 bg-green-500 px-5 py-2 rounded-xl"
                >
                  Confirm My Salary
                </button>
              )}

            </div>
          </div>
        )}

        {/* LATE POPUP */}
        {showLatePopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
            <div className="bg-white/[0.08] backdrop-blur-xl p-8 rounded-3xl w-full max-w-md space-y-4 border border-white/10">

              <h2 className="text-xl text-red-400">
                You are late
              </h2>

              <p className="text-white/70 text-sm">
                Please enter your reason before checking in.
              </p>

              <input
                type="text"
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10"
              />

              <button
                onClick={handleLateSubmit}
                className="w-full p-3 bg-[#ff7a00] text-black rounded-xl font-medium"
              >
                Submit & Start Shift
              </button>

            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}