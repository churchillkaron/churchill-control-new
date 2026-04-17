"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    setMonthlyPayroll(payroll);
    setAttendanceData(attendance);
  }, []);

  // =========================
  // UPDATE ATTENDANCE
  // =========================
  const updateAttendance = (originalIndex, value) => {
    const updated = [...attendanceData];
    updated[originalIndex].approved = value;

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendanceData(updated);
  };

  // =========================
  // SAFE FILTER WITH INDEX
  // =========================
  const pendingLate = attendanceData
    .map((entry, index) => ({
      ...entry,
      originalIndex: index,
    }))
    .filter((a) => a.late && a.approved !== true);

  // =========================
  // CHECK UNRESOLVED PER STAFF
  // =========================
  const hasUnresolvedAttendance = (name) => {
    return attendanceData.some(
      (a) => a.name === name && a.late && a.approved !== true
    );
  };

  // =========================
  // APPROVE SALARY
  // =========================
  const confirmApproval = () => {
    const updated = { ...monthlyPayroll };
    updated.staff[selectedStaff.index].managerApproved = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setMonthlyPayroll(updated);

    setSelectedStaff(null);
  };

  if (!monthlyPayroll) {
    return <div className="text-white p-10">No payroll yet</div>;
  }

  return (
    <div className="min-h-screen text-white p-10">

      {/* =========================
          ATTENDANCE REVIEW
      ========================= */}
      <div className="mb-10 p-6 bg-white/10 rounded-xl">

        <h2 className="text-2xl mb-4">Attendance Review</h2>

        {pendingLate.length === 0 && (
          <div>No pending late entries</div>
        )}

        {pendingLate.map((entry) => (
          <div
            key={entry.originalIndex}
            className="mb-4 p-3 bg-white/5 rounded"
          >

            <strong>{entry.name}</strong>

            <br />
            Date: {entry.date}
            <br />
            Time: {entry.time}
            <br />
            Reason: {entry.reason}

            <br /><br />

            <button
              onClick={() => updateAttendance(entry.originalIndex, true)}
              className="bg-green-500 px-3 py-1 mr-2 rounded"
            >
              Approve
            </button>

            <button
              onClick={() => updateAttendance(entry.originalIndex, false)}
              className="bg-red-500 px-3 py-1 rounded"
            >
              Reject
            </button>

          </div>
        ))}

      </div>

      {/* =========================
          PAYROLL
      ========================= */}
      <h1 className="text-3xl mb-6">Manager Approval</h1>

      {monthlyPayroll.staff.map((s, i) => {
        const blocked = hasUnresolvedAttendance(s.name);

        return (
          <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">

            <strong>{s.name}</strong>

            <br />
            Total: THB {Math.round(s.total)}

            <br /><br />

            {blocked && (
              <div className="text-red-400 mb-2">
                ⚠️ Pending attendance review required
              </div>
            )}

            {s.staffConfirmed && !s.managerApproved && !blocked && (
              <button
                onClick={() =>
                  setSelectedStaff({
                    ...s,
                    index: i,
                  })
                }
                className="bg-green-500 px-3 py-1 rounded"
              >
                Approve Salary
              </button>
            )}

            {blocked && (
              <button
                disabled
                className="bg-gray-500 px-3 py-1 rounded"
              >
                Approval Blocked
              </button>
            )}

          </div>
        );
      })}

      {/* =========================
          MODAL
      ========================= */}
      {selectedStaff && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">

          <div className="bg-white text-black p-6 rounded-xl w-[400px]">

            <h2 className="text-xl mb-3">
              Confirm Approval
            </h2>

            <div>{selectedStaff.name}</div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmApproval}
                className="bg-green-500 px-3 py-1 rounded"
              >
                Confirm
              </button>

              <button
                onClick={() => setSelectedStaff(null)}
                className="bg-gray-400 px-3 py-1 rounded"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}