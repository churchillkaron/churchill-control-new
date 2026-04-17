"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [recommendedRate, setRecommendedRate] = useState(5);
  const [lockedRate, setLockedRate] = useState(null);
  const [avgScore, setAvgScore] = useState(0);
  const [currentMonth, setCurrentMonth] = useState("");
  const [attendanceData, setAttendanceData] = useState([]);

  const [selectedStaff, setSelectedStaff] = useState(null);

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}`;

    setCurrentMonth(monthKey);

    const serviceData =
      JSON.parse(localStorage.getItem("serviceCharge")) || {};

    setLockedRate(serviceData[monthKey] || null);

    setMonthlyPayroll(payroll);
    setAttendanceData(attendance);

    calculateServiceRate();
  }, []);

  const parseDate = (dateStr) => {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  const calculateServiceRate = () => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    if (history.length === 0) {
      setRecommendedRate(5);
      return;
    }

    const sorted = [...history].sort(
      (a, b) => parseDate(b.date) - parseDate(a.date)
    );

    const last30 = sorted.slice(0, 30);

    const scores = last30.map((day) => day.scores?.foh || 0);

    const avg =
      scores.reduce((sum, val) => sum + val, 0) / scores.length;

    setAvgScore(Math.round(avg));

    if (avg >= 85) setRecommendedRate(7);
    else if (avg >= 70) setRecommendedRate(6);
    else setRecommendedRate(5);
  };

  const lockServiceRate = () => {
    const serviceData =
      JSON.parse(localStorage.getItem("serviceCharge")) || {};

    if (serviceData[currentMonth]) {
      alert("Already locked");
      return;
    }

    serviceData[currentMonth] = recommendedRate;

    localStorage.setItem("serviceCharge", JSON.stringify(serviceData));
    setLockedRate(recommendedRate);

    alert(`Locked at ${recommendedRate}%`);
  };

  // =========================
  // ATTENDANCE DATA
  // =========================
  const getStaffAttendance = (name) => {
    return attendanceData.filter((a) => a.name === name);
  };

  const getAttendancePenalty = (entries) => {
    let penalty = 1.0;

    entries.forEach((entry) => {
      if (entry.late && entry.approved !== true) {
        penalty *= 0.5;
      }
    });

    return penalty;
  };

  // =========================
  // APPROVE
  // =========================
  const confirmApproval = () => {
    const updated = { ...monthlyPayroll };
    updated.staff[selectedStaff.index].managerApproved = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setMonthlyPayroll(updated);

    setSelectedStaff(null);
  };

  if (!monthlyPayroll) {
    return (
      <div className="min-h-screen text-white p-10">
        No payroll generated yet
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-10">

      {/* SERVICE CONTROL */}
      <div className="mb-8 p-6 bg-white/10 rounded-xl">
        <h2 className="text-2xl mb-3">Monthly Performance</h2>
        <div>Month: {currentMonth}</div>
        <div>Avg Score: {avgScore}</div>
        <div>Recommended: {recommendedRate}%</div>
        <div>Locked: {lockedRate || "Not locked"}%</div>

        <button
          onClick={lockServiceRate}
          disabled={lockedRate !== null}
          className="mt-4 bg-orange-500 px-4 py-2 rounded"
        >
          Lock
        </button>
      </div>

      {/* PAYROLL */}
      <h1 className="text-3xl mb-6">Manager Approval</h1>

      {monthlyPayroll.staff.map((s, i) => {
        const entries = getStaffAttendance(s.name);
        const penalty = getAttendancePenalty(entries);
        const adjustedTotal = s.total * penalty;

        return (
          <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">
            <strong>{s.name}</strong>
            <br />
            Total: THB {Math.round(adjustedTotal)}

            <br /><br />

            {s.staffConfirmed && !s.managerApproved && (
              <button
                onClick={() =>
                  setSelectedStaff({
                    ...s,
                    index: i,
                    penalty,
                    entries,
                    adjustedTotal,
                  })
                }
                className="bg-green-500 px-3 py-1 rounded"
              >
                Review & Approve
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
              {selectedStaff.name}
            </h2>

            <div>Penalty: {selectedStaff.penalty}</div>

            <div className="mt-3">
              Late Records:
              {selectedStaff.entries.length === 0 && <div>None</div>}
              {selectedStaff.entries.map((e, idx) => (
                <div key={idx}>
                  {e.date} — {e.late ? "Late" : "On time"} —{" "}
                  {e.approved ? "Approved" : "Not Approved"}
                </div>
              ))}
            </div>

            <div className="mt-3">
              Final Salary: THB {Math.round(selectedStaff.adjustedTotal)}
            </div>

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