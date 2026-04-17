"use client";

import { useEffect, useState } from "react";

export default function StaffPage() {
  const [staffName, setStaffName] = useState("");
  const [payroll, setPayroll] = useState(null);

  useEffect(() => {
    const name = localStorage.getItem("staffName");

    if (!name) {
      window.location.href = "/";
      return;
    }

    setStaffName(name);

    const data =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    setPayroll(data);
  }, []);

  // =========================
  // CONFIRM SALARY
  // =========================
  const confirmSalary = () => {
    const updated = { ...payroll };

    const index = updated.staff.findIndex(
      (s) => s.name === staffName
    );

    if (index === -1) return;

    updated.staff[index].staffConfirmed = true;

    localStorage.setItem("monthlyPayroll", JSON.stringify(updated));
    setPayroll(updated);
  };

  // =========================
  // GET STAFF DATA
  // =========================
  const staffData = payroll?.staff.find(
    (s) => s.name === staffName
  );

  if (!staffData) {
    return (
      <div className="min-h-screen text-white p-10">
        No payroll data available
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">
        Salary Overview
      </h1>

      <div className="bg-white/10 p-6 rounded-xl">

        <div><strong>{staffName}</strong></div>

        <br />

        Salary: THB {staffData.salary}
        <br />
        Bonus: THB {Math.round(staffData.bonus)}

        <br />

        <span className="text-orange-400">
          Total: THB {Math.round(staffData.total)}
        </span>

        <br /><br />

        Status:
        <br />

        Staff Confirmed:{" "}
        {staffData.staffConfirmed ? "✅ Yes" : "❌ No"}

        <br />
        Manager Approved:{" "}
        {staffData.managerApproved ? "✅ Yes" : "❌ No"}

        <br />
        Payment Confirmed:{" "}
        {staffData.paymentConfirmed ? "✅ Paid" : "❌ Not Paid"}

        <br /><br />

        {!staffData.staffConfirmed && (
          <button
            onClick={confirmSalary}
            className="bg-green-500 px-4 py-2 rounded"
          >
            Confirm My Salary
          </button>
        )}

      </div>

    </div>
  );
}