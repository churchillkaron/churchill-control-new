"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    setMonthlyPayroll(payroll);
    setAttendanceData(attendance);
  }, []);

  // =========================
  // APPROVE / REJECT ATTENDANCE
  // =========================
  const updateAttendance = (index, value) => {
    const updated = [...attendanceData];
    updated[index].approved = value;

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendanceData(updated);
  };

  // =========================
  // FILTER LATE ENTRIES
  // =========================
  const pendingLate = attendanceData.filter(
    (a) => a.late && a.approved === false
  );

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

        {pendingLate.map((entry, index) => (
          <div key={index} className="mb-4 p-3 bg-white/5 rounded">

            <strong>{entry.name}</strong>

            <br />
            Date: {entry.date}
            <br />
            Time: {entry.time}
            <br />
            Reason: {entry.reason}

            <br /><br />

            <button
              onClick={() => updateAttendance(index, true)}
              className="bg-green-500 px-3 py-1 mr-2 rounded"
            >
              Approve
            </button>

            <button
              onClick={() => updateAttendance(index, false)}
              className="bg-red-500 px-3 py-1 rounded"
            >
              Reject
            </button>

          </div>
        ))}

      </div>

      {/* EXISTING PAYROLL UI BELOW */}

    </div>
  );
}