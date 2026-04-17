"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [contracts, setContracts] = useState({});
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");

  const [staffActions, setStaffActions] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const savedContracts =
      JSON.parse(localStorage.getItem("contracts")) || {};
    setContracts(savedContracts);

    const actions =
      JSON.parse(localStorage.getItem("staffActions")) || {};
    setStaffActions(actions);

    const history = JSON.parse(localStorage.getItem("history")) || [];

    const staffMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            payout: 0,
          };
        }

        staffMap[s.name].payout += Number(s.payout || 0);
      });
    });

    const result = Object.entries(staffMap).map(([name, data]) => ({
      name,
      payout: data.payout,
    }));

    setLeaderboard(result);
  }, []);

  // =========================
  // SAVE CONTRACT
  // =========================
  const saveContract = () => {
    if (!name || !salary) return;

    const updated = {
      ...contracts,
      [name]: {
        salary: Number(salary),
      },
    };

    localStorage.setItem("contracts", JSON.stringify(updated));
    setContracts(updated);

    setName("");
    setSalary("");
  };

  // =========================
  // CALCULATE FINAL PAY
  // =========================
  const getFinalPay = (staffName, payout) => {
    const contract = contracts[staffName];
    const action = staffActions[staffName];

    let bonusMultiplier = 1;

    if (action === "Final Warning") bonusMultiplier = 0;
    else if (action === "Under Review") bonusMultiplier = 0.5;

    const finalBonus = payout * bonusMultiplier;
    const baseSalary = contract?.salary || 0;

    return baseSalary + finalBonus;
  };

  return (
    <div className="min-h-screen text-white p-10">

      {/* CONTRACT INPUT */}
      <h1 className="text-3xl mb-6">Staff Contracts</h1>

      <div className="mb-6 space-x-2">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="p-2 bg-black/40 border border-white/10 rounded"
        />

        <input
          placeholder="Salary"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          className="p-2 bg-black/40 border border-white/10 rounded"
        />

        <button
          onClick={saveContract}
          className="bg-orange-500 px-4 py-2 rounded"
        >
          Save
        </button>
      </div>

      {/* CONTRACT LIST */}
      {Object.entries(contracts).map(([name, c], i) => (
        <div key={i} className="mb-2">
          {name} → Salary: THB {c.salary}
        </div>
      ))}

      {/* FINAL PAY */}
      <h1 className="text-3xl mt-10 mb-6">Final Payroll</h1>

      {leaderboard.map((s, i) => (
        <div key={i} className="mb-3">
          <strong>{s.name}</strong>

          <br />

          Service Bonus: THB {Math.round(s.payout)}

          <br />

          Total Pay:{" "}
          <span className="text-orange-400">
            THB {Math.round(getFinalPay(s.name, s.payout))}
          </span>
        </div>
      ))}

    </div>
  );
}