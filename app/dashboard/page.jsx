"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [recommendedRate, setRecommendedRate] = useState(5);
  const [lockedRate, setLockedRate] = useState(5);
  const [avgScore, setAvgScore] = useState(0);

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    const savedRate =
      Number(localStorage.getItem("serviceChargeRate")) || 5;

    setMonthlyPayroll(payroll);
    setLockedRate(savedRate);

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
    localStorage.setItem("serviceChargeRate", recommendedRate);
    setLockedRate(recommendedRate);

    alert(`Service Charge locked at ${recommendedRate}%`);
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

      {/* =========================
          SERVICE CONTROL
      ========================= */}
      <div className="mb-8 p-6 bg-white/10 rounded-xl">

        <h2 className="text-2xl mb-3">Monthly Performance</h2>

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
            {lockedRate}%
          </span>
        </div>

        <div className="mt-2 text-sm text-white/60">
          {recommendedRate === 7 && "Elite Performance"}
          {recommendedRate === 6 && "Good Performance"}
          {recommendedRate === 5 && "Standard Level"}
        </div>

        <button
          onClick={lockServiceRate}
          className="mt-4 bg-orange-500 px-4 py-2 rounded"
        >
          Lock Recommended Rate
        </button>

      </div>

      {/* =========================
          PAYROLL
      ========================= */}
      <h1 className="text-3xl mb-6">Manager Approval</h1>

      {monthlyPayroll.staff.map((s, i) => (
        <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">

          <strong>{s.name}</strong>

          <br />
          Salary: THB {s.salary}
          <br />
          Bonus: THB {Math.round(s.bonus)}

          <br />

          <span className="text-orange-400">
            Total: THB {Math.round(s.total)}
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
      ))}

    </div>
  );
}