"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'

export default function PayrollPage() {
  const [staffTotals, setStaffTotals] = useState([]);

  useEffect(() => {
    const history = getHistoryDays() || [];
    const savedAdjustments = JSON.parse(localStorage.getItem("payroll_adjustments") || "{}");

    const map = {};

    history.forEach((day) => {
      day.payouts?.staffBreakdown?.forEach((s) => {
        if (!map[s.name]) {
          map[s.name] = {
            name: s.name,
            service: 0,
            salary: 0,
            late: 0,
            adjust: 0,
          };
        }

        map[s.name].service += s.amount || 0;
      });
    });

    // merge saved adjustments
    Object.keys(map).forEach((name) => {
      if (savedAdjustments[name]) {
        map[name] = {
          ...map[name],
          ...savedAdjustments[name],
        };
      }
    });

    setStaffTotals(Object.values(map));
  }, []);

  const saveAdjustments = (data) => {
    const obj = {};
    data.forEach((s) => {
      obj[s.name] = {
        salary: s.salary,
        late: s.late,
        adjust: s.adjust,
      };
    });

    localStorage.setItem("payroll_adjustments", JSON.stringify(obj));
  };

  const updateField = (index, field, value) => {
    const updated = [...staffTotals];
    updated[index][field] = Number(value);

    setStaffTotals(updated);
    saveAdjustments(updated);
  };

  const calculateTotal = (s) => {
    const latePenalty = s.late * 500;
    return s.salary + s.service - latePenalty + s.adjust;
  };

  const totalCost = staffTotals.reduce(
    (sum, s) => sum + calculateTotal(s),
    0
  );

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-5xl mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-semibold">Payroll</h1>
          <p className="text-white/40 text-sm">
            Staff salary + service + penalties
          </p>
        </div>

        {/* TOTAL */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-white/50">Total Staff Cost</div>
          <div className="text-3xl mt-2 text-orange-400">
            THB {totalCost.toLocaleString()}
          </div>
        </div>

        {/* LIST */}
        <div className="space-y-4">

          {staffTotals.map((s, i) => {
            const total = calculateTotal(s);
            const latePenalty = s.late * 500;

            return (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
              >
                <div className="font-medium">{s.name}</div>

                <div className="grid grid-cols-3 gap-2 text-sm">

                  <input
                    type="number"
                    placeholder="Salary"
                    value={s.salary}
                    onChange={(e) =>
                      updateField(i, "salary", e.target.value)
                    }
                    className="bg-black/30 p-2 rounded"
                  />

                  <input
                    type="number"
                    placeholder="Late (x500)"
                    value={s.late}
                    onChange={(e) =>
                      updateField(i, "late", e.target.value)
                    }
                    className="bg-black/30 p-2 rounded"
                  />

                  <input
                    type="number"
                    placeholder="Adjust +/-"
                    value={s.adjust}
                    onChange={(e) =>
                      updateField(i, "adjust", e.target.value)
                    }
                    className="bg-black/30 p-2 rounded"
                  />

                </div>

                <div className="text-white/50 text-sm">
                  Service: THB {s.service.toLocaleString()}
                </div>

                <div className="text-white/40 text-xs">
                  Late Penalty: THB {latePenalty.toLocaleString()}
                </div>

                <div className="text-orange-400 font-semibold">
                  Total: THB {total.toLocaleString()}
                </div>

              </div>
            );
          })}

          {staffTotals.length === 0 && (
            <div className="text-white/40">No payroll data</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}