"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function AccountingPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(data);
  }, []);

  const latestDay =
    history[history.length - 1] || null;

  const markPaid = (staffName) => {
    const updated = history.map((day) => {
      if (day.date !== latestDay.date) return day;

      return {
        ...day,
        staff: day.staff.map((s) =>
          s.name === staffName ? { ...s, paid: true } : s
        ),
      };
    });

    localStorage.setItem("history", JSON.stringify(updated));
    setHistory(updated);
  };

  const markAllPaid = () => {
    const updated = history.map((day) => {
      if (day.date !== latestDay.date) return day;

      return {
        ...day,
        staff: day.staff.map((s) => ({
          ...s,
          paid: true,
        })),
      };
    });

    localStorage.setItem("history", JSON.stringify(updated));
    setHistory(updated);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white">
            Accounting
          </h1>
          <p className="text-white/50 text-sm">
            Final payroll release
          </p>
        </div>

        {!latestDay && (
          <p className="text-white/40">No data available</p>
        )}

        {latestDay && (
          <div className="bg-white/5 p-6 rounded-2xl space-y-4">

            <div className="flex justify-between items-center">
              <h2 className="text-white text-lg">
                {latestDay.date}
              </h2>

              <button
                onClick={() => {
                  if (confirm("Mark ALL as paid?")) {
                    markAllPaid();
                  }
                }}
                className="bg-[#ff7a00] px-4 py-2 rounded"
              >
                Pay All
              </button>
            </div>

            {latestDay.staff.map((s, i) => (
              <div
                key={i}
                className="flex justify-between items-center border-b border-white/10 py-3"
              >
                <div>
                  <div className="text-white">{s.name}</div>
                  <div className="text-white/50 text-sm">
                    THB {s.payout}
                  </div>
                </div>

                <div className="flex items-center gap-3">

                  <span
                    className={`text-sm ${
                      s.paid
                        ? "text-green-400"
                        : s.approved
                        ? "text-blue-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {s.paid
                      ? "Paid"
                      : s.approved
                      ? "Approved"
                      : "Pending"}
                  </span>

                  {!s.paid && s.approved && (
                    <button
                      onClick={() => {
                        if (confirm(`Mark ${s.name} as paid?`)) {
                          markPaid(s.name);
                        }
                      }}
                      className="bg-green-500 px-3 py-1 rounded text-sm"
                    >
                      Pay
                    </button>
                  )}

                </div>
              </div>
            ))}

          </div>
        )}

      </div>
    </AppShell>
  );
}