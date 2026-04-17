"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [contracts, setContracts] = useState({});
  const [history, setHistory] = useState([]);
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);

  useEffect(() => {
    const savedContracts =
      JSON.parse(localStorage.getItem("contracts")) || {};
    setContracts(savedContracts);

    const h = JSON.parse(localStorage.getItem("history")) || [];
    setHistory(h);

    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;
    setMonthlyPayroll(payroll);
  }, []);

  // =========================
  // GENERATE MONTHLY PAYROLL
  // =========================
  const generatePayroll = () => {
    if (history.length === 0) return;

    const currentMonth = new Date().toISOString().slice(0, 7);

    const staffMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      const dayMonth = new Date(
        day.date.split("/").reverse().join("-")
      )
        .toISOString()
        .slice(0, 7);

      if (dayMonth !== currentMonth) return;

      day.staff.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            bonus: 0,
          };
        }

        staffMap[s.name].bonus += Number(s.payout || 0);
      });
    });

    const staffPayroll = Object.entries(staffMap).map(([name, data]) => {
      const salary = contracts[name]?.salary || 0;

      return {
        name,
        salary,
        bonus: data.bonus,
        total: salary + data.bonus,
        staffConfirmed: false,
        managerApproved: false,
        paid: false,
      };
    });

    const payrollData = {
      month: currentMonth,
      staff: staffPayroll,
    };

    localStorage.setItem("monthlyPayroll", JSON.stringify(payrollData));
    setMonthlyPayroll(payrollData);
  };

  // =========================
  // LIFETIME CALCULATION
  // =========================
  const getLifetimeEarnings = (name) => {
    let total = 0;

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (s.name === name) {
          total += Number(s.payout || 0);
        }
      });
    });

    const salary = contracts[name]?.salary || 0;

    return total + salary;
  };

  return (
    <div className="min-h-screen text-white p-10">

      {/* GENERATE */}
      <h1 className="text-3xl mb-6">Monthly Payroll</h1>

      <button
        onClick={generatePayroll}
        className="bg-orange-500 px-4 py-2 rounded mb-6"
      >
        Generate Payroll
      </button>

      {/* PAYROLL VIEW */}
      {monthlyPayroll && (
        <div>
          <h2 className="text-xl mb-4">
            Month: {monthlyPayroll.month}
          </h2>

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

              <br />

              Lifetime Earned: THB{" "}
              {Math.round(getLifetimeEarnings(s.name))}

              <br />

              Staff Confirmed: {s.staffConfirmed ? "Yes" : "No"}
              <br />
              Manager Approved: {s.managerApproved ? "Yes" : "No"}
              <br />
              Paid: {s.paid ? "Yes" : "No"}

            </div>
          ))}
        </div>
      )}

    </div>
  );
}