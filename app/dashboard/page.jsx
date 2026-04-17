"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [serviceRate, setServiceRate] = useState(5);
  const [avgScore, setAvgScore] = useState(0);

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;
    setMonthlyPayroll(payroll);

    calculateServiceRate();
  }, []);

  // =========================
  // SAFE DATE PARSER (FIX)
  // =========================
  const parseDate = (dateStr) => {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  // =========================
  // MONTHLY PERFORMANCE
  // =========================
  const calculateServiceRate = () => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    if (history.length === 0) {
      setServiceRate(5);
      return;
    }

    // sort safely
    const sorted = [...history].sort(
      (a, b) => parseDate(b.date) - parseDate(a.date)
    );

    const last30 = sorted.slice(0, 30);

    const scores = last30.map((day) => day.scores?.foh || 0);

    const avg =
      scores.reduce((sum, val) => sum + val, 0) / scores.length;

    setAvgScore(Math.round(avg));

    if (avg >= 85) setServiceRate(7);
    else if (avg >= 70) setServiceRate(6);
    else setServiceRate(5);
  };

  // =========================
  // APPROVE SALARY (MANAGER)
  // =========================
  const approveSalary = (index) => {
    const updated = { ...monthlyPayroll };
    updated.staff[index].managerApproved = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setMonthlyPayroll(updated);
  };

  // =========================
  // REMOVE APPROVAL
  // =========================
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
          SERVICE CHARGE BLOCK
      ========================= */}
      <div className="mb-8 p-6 bg-white/10 rounded-xl">

        <h2 className="text-2xl mb-3">Monthly Performance</h2>

        <div>Average FOH Score: {avgScore}</div>

        <div className="mt-2 text-xl text-orange-400">
          Service Charge Level: {serviceRate}%
        </div>

        <div className="mt-2 text-sm text-white/60">
          {serviceRate === 7 && "Elite Performance"}
          {serviceRate === 6 && "Good Performance"}
          {serviceRate === 5 && "Standard Level"}
        </div>

      </div>

      {/* =========================
          PAYROLL SECTION
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