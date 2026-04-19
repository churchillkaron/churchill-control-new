"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { getHistoryDays } from "../../../lib/storage/localStorage";

export default function PayrollPage() {
  const [staffTotals, setStaffTotals] = useState([]);
  const [totalPayout, setTotalPayout] = useState(0);

  useEffect(() => {
    const history = getHistoryDays() || [];

    // 🔹 Salaries
    const salaries = {
      Anton: 38000,
      Poupee: 30000,
      "Dar Dar": 25000,
      Sara: 20000,
    };

    // 🔹 Late data (temporary manual — later connect attendance page)
    const lateness = {
      Anton: 1,
      Poupee: 0,
      "Dar Dar": 2,
      Sara: 0,
    };

    // 🔹 Manager adjustments (can be + or -)
    const adjustments = {
      Anton: 2000,
      Poupee: 0,
      "Dar Dar": -1000,
      Sara: 0,
    };

    const map = {};
    let total = 0;

    history.forEach((day) => {
      day.payouts?.staffBreakdown?.forEach((s) => {
        if (!map[s.name]) {
          map[s.name] = {
            name: s.name,
            service: 0,
            salary: salaries[s.name] || 0,
            late: lateness[s.name] || 0,
            adjust: adjustments[s.name] || 0,
          };
        }

        map[s.name].service += s.amount || 0;
      });
    });

    const result = Object.values(map).map((s) => {
      const latePenalty = s.late * 500;
      const totalPay = s.salary + s.service - latePenalty + s.adjust;

      total += totalPay;

      return {
        ...s,
        latePenalty,
        total: totalPay,
      };
    });

    setStaffTotals(result);
    setTotalPayout(total);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payroll</h1>

        {/* TOTAL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-white/50">Total Staff Cost</div>
          <div className="text-3xl mt-2 text-orange-400">
            THB {totalPayout.toLocaleString()}
          </div>
        </div>

        {/* STAFF */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-lg">Staff Payroll</div>

          {staffTotals.map((s, i) => (
            <div
              key={i}
              className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-medium">{s.name}</div>

                <div className="text-white/50 text-sm">
                  Salary: THB {s.salary.toLocaleString()}
                </div>

                <div className="text-white/50 text-sm">
                  Service: THB {s.service.toLocaleString()}
                </div>

                <div className="text-red-400 text-sm">
                  Late Penalty: -THB {s.latePenalty.toLocaleString()}
                </div>

                <div className="text-blue-300 text-sm">
                  Adjustment: THB {s.adjust.toLocaleString()}
                </div>
              </div>

              <div className="text-right">
                <div className="text-orange-400 font-semibold text-lg">
                  THB {s.total.toLocaleString()}
                </div>
                <div className="text-white/40 text-xs">
                  Final Pay
                </div>
              </div>
            </div>
          ))}

          {staffTotals.length === 0 && (
            <div className="text-white/40">No payroll data</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}