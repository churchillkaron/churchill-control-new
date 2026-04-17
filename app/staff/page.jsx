"use client";

import { useEffect, useState } from "react";

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
    <div className="min-h-screen text-white p-10">
      <h1 className="text-3xl mb-6">Staff Portal</h1>

      <div className="bg-white/10 p-6 rounded-xl mb-8">
        <div><strong>{staffName}</strong></div>
        <div>Role: {staffRole}</div>

        <br />

        <div>
          Shift Status:{" "}
          {checkedIn ? (
            <span className="text-green-400">✅ Checked In</span>
          ) : (
            <span className="text-yellow-400">Not Checked In</span>
          )}
        </div>

        <br />

        {!checkedIn && (
          <button
            onClick={handleStartShift}
            className="bg-orange-500 px-4 py-2 rounded"
          >
            Start Shift
          </button>
        )}
      </div>

      {!staffData ? (
        <div className="bg-white/10 p-6 rounded-xl">
          No payroll data available
        </div>
      ) : (
        <div className="bg-white/10 p-6 rounded-xl">
          <h2 className="text-2xl mb-4">Salary Overview</h2>

          <div>Salary: THB {staffData.salary}</div>
          <div>Bonus: THB {Math.round(staffData.bonus)}</div>

          <br />

          <div className="text-orange-400">
            Total: THB {Math.round(staffData.total)}
          </div>

          <br />

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

          <br />

          {!staffData.staffConfirmed && (
            <button
              onClick={confirmSalary}
              className="bg-green-500 px-4 py-2 rounded"
            >
              Confirm My Salary
            </button>
          )}
        </div>
      )}

      {showLatePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80">
          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl w-full max-w-md space-y-4">
            <h2 className="text-xl text-red-400">You are late</h2>

            <p className="text-white/70">
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
              className="w-full p-3 bg-orange-500 rounded-xl"
            >
              Submit & Start Shift
            </button>
          </div>
        </div>
      )}
    </div>
  );
}