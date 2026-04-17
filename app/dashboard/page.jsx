"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [recommendedRate, setRecommendedRate] = useState(5);
  const [lockedRate, setLockedRate] = useState(null);
  const [avgScore, setAvgScore] = useState(0);
  const [currentMonth, setCurrentMonth] = useState("");
  const [attendanceData, setAttendanceData] = useState([]);

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

  // =========================
  // SAFE DATE PARSER
  // =========================
  const parseDate = (dateStr) => {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  // =========================
  // CALCULATE RECOMMENDED RATE
  // =========================
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

  // =========================
  // LOCK SERVICE RATE
  // =========================
  const lockServiceRate = () => {
    const serviceData =
      JSON.parse(localStorage.getItem("serviceCharge")) || {};

    if (serviceData[currentMonth]) {
      alert("Service charge already locked for this month");
      return;
    }

    serviceData[currentMonth] = recommendedRate;

    localStorage.setItem(
      "serviceCharge",
      JSON.stringify(serviceData)
    );

    setLockedRate(recommendedRate);

    alert(`Service Charge locked at ${recommendedRate}% for ${currentMonth}`);
  };

  // =========================
  // ATTENDANCE PENALTY (MONTHLY)
  // =========================
  const getAttendancePenalty = (name) => {
    const staffEntries = attendanceData.filter(
      (a) => a.name === name
    );

    if (staffEntries.length === 0) return 1.0;

    let penalty = 1.0;

    staffEntries.forEach((entry) => {
      if (entry.late && entry.approved !== true) {
        penalty *= 0.5;
      }
    });

    return penalty;
  };

  // =========================
  // APPROVE SALARY
  // =========================
  const approveSalary = (index) => {
    const updated = { ...monthlyPayroll };
    updated.staff[index].managerApproved = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setMonthlyPayroll(updated);
  };

  const revokeApproval = (index) => {
    const updated = { ...monthlyPayroll };
    updated.staff[index].managerApproved = false;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setMonthlyPayroll(updated);
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
        <div>Average FOH Score: {avgScore}</div>

        <div className="mt-3">
          Recommended:{" "}
          <span className="text-green-400">
            {recommendedRate}%
          </span>
        </div>

        <div>
          Locked:{" "}
          <span className="text-orange-400">
            {lockedRate ? `${lockedRate}%` : "Not locked"}
          </span>
        </div>

        <button
          onClick={lockServiceRate}
          disabled={lockedRate !== null}
          className={`mt-4 px-4 py-2 rounded ${
            lockedRate !== null
              ? "bg-gray-500"
              : "bg-orange-500"
          }`}
        >
          {lockedRate !== null
            ? "Already Locked"
            : "Lock for This Month"}
        </button>
      </div>

      {/* PAYROLL */}
      <h1 className="text-3xl mb-6">Manager Approval</h1>

      {monthlyPayroll.staff.map((s, i) => {
        const penalty = getAttendancePenalty(s.name);
        const adjustedTotal = s.total * penalty;

        return (
          <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">

            <strong>{s.name}</strong>

            <br />
            Base Salary: THB {s.salary}
            <br />
            Bonus: THB {Math.round(s.bonus)}

            <br />
            Penalty Multiplier: {penalty}

            <br />

            <span className="text-orange-400">
              Adjusted Total: THB {Math.round(adjustedTotal)}
            </span>

            <br /><br />

            Staff Confirmed:{" "}
            {s.staffConfirmed ? "✅ Yes" : "❌ No"}

            <br />
            Manager Approved:{" "}
            {s.managerApproved ? "✅ Yes" : "❌ No"}

            <br /><br />

            {s.staffConfirmed && !s.managerApproved && (
              <button
                onClick={() => approveSalary(i)}
                className="bg-green-500 px-3 py-1 rounded mr-2"
              >
                Approve Salary
              </button>
            )}

            {s.managerApproved && (
              <button
                onClick={() => revokeApproval(i)}
                className="bg-red-500 px-3 py-1 rounded"
              >
                Revoke
              </button>
            )}

          </div>
        );
      })}

    </div>
  );
}