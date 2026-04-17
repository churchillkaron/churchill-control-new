"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function History() {
  const [history, setHistory] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory([...data].reverse());
  }, []);

  // 🔥 DEPARTMENT SPLIT
  const calculateDepartmentPayout = (day) => {
    const sc = day.serviceCharge || 0;

    return {
      FOH: Math.round(sc * 0.5),
      BAR: Math.round(sc * 0.3),
      KITCHEN: Math.round(sc * 0.2),
    };
  };

  // 🔥 STAFF PERFORMANCE + PAYOUT
  const calculateStaffData = (day) => {
    const dept = calculateDepartmentPayout(day);

    const staffStats = {};

    day.paidOrders.forEach((order) => {
      if (!order.staff) return;

      if (!staffStats[order.staff]) {
        staffStats[order.staff] = {
          revenue: 0,
          orders: 0,
        };
      }

      staffStats[order.staff].revenue += order.total;
      staffStats[order.staff].orders += 1;
    });

    const totalRevenue = day.revenue || 1;

    const staffList = Object.entries(staffStats).map(([name, data]) => {
      const avgOrder = data.revenue / data.orders;

      // 🔥 PERFORMANCE SCORE (V6 LOGIC)
      const score =
        (data.revenue / totalRevenue) * 50 +
        (data.orders / day.paidOrders.length) * 30 +
        (avgOrder / 1000) * 20;

      let level = "GOOD";
      let multiplier = 1;

      if (score < 40) {
        level = "CRITICAL";
        multiplier = 0.2;
      } else if (score < 60) {
        level = "BAD";
        multiplier = 0.4;
      } else if (score < 80) {
        level = "WARNING";
        multiplier = 0.7;
      }

      return {
        name,
        revenue: data.revenue,
        orders: data.orders,
        avgOrder: Math.round(avgOrder),
        score: Math.round(score),
        level,
        multiplier,
      };
    });

    // 🔥 SORT BEST FIRST
    staffList.sort((a, b) => b.score - a.score);

    // 🔥 APPLY PAYOUT (FOH only for now)
    const fohPool = dept.FOH;

    const totalWeight = staffList.reduce(
      (sum, s) => sum + s.multiplier,
      0
    );

    staffList.forEach((s) => {
      s.payout = Math.round((s.multiplier / totalWeight) * fohPool);
    });

    return staffList;
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Daily Reports
          </h1>
        </div>

        {/* 🔥 LIST VIEW */}
        {!selectedDay && (
          <div className="space-y-4">
            {history.map((day, index) => (
              <div
                key={index}
                onClick={() => setSelectedDay(day)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.05] p-6 flex justify-between items-center"
              >
                <div>
                  <div className="text-white/60 text-sm">
                    {new Date(day.date).toLocaleDateString()}
                  </div>

                  <div className="text-xl font-semibold mt-1">
                    THB {day.revenue.toLocaleString()}
                  </div>

                  <div className="text-white/50 text-sm mt-1">
                    SC: THB {day.serviceCharge.toLocaleString()}
                  </div>
                </div>

                <div className="text-[#ffb36b] text-sm">
                  View
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 🔥 DETAIL VIEW */}
        {selectedDay && (
          <div className="space-y-6">

            <button
              onClick={() => setSelectedDay(null)}
              className="text-white/50"
            >
              ← Back
            </button>

            {/* SUMMARY */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6">
              <div className="text-white/60 text-sm">
                {new Date(selectedDay.date).toLocaleDateString()}
              </div>

              <div className="text-3xl font-semibold mt-2">
                THB {selectedDay.revenue.toLocaleString()}
              </div>

              <div className="text-white/50 mt-2">
                Service Charge: THB {selectedDay.serviceCharge.toLocaleString()}
              </div>
            </div>

            {/* 🔥 PERFORMANCE SYSTEM */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="text-white/60 mb-4">
                FOH Performance & Payout
              </div>

              {(() => {
                const staff = calculateStaffData(selectedDay);

                return staff.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between py-2 border-b border-white/5"
                  >
                    <div>
                      <div>{s.name}</div>
                      <div className="text-xs text-white/40">
                        {s.orders} orders • Avg {s.avgOrder}
                      </div>
                    </div>

                    <div className="text-right">
                      <div>THB {s.payout}</div>
                      <div className="text-xs text-[#ffb36b]">
                        {s.level} ({s.score})
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* 🔥 ORDERS */}
            <div className="space-y-4">
              {selectedDay.paidOrders.map((order, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex justify-between">
                    <div>
                      Table {order.table} — {order.staff}
                    </div>
                    <div>THB {order.total}</div>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-white/70">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {item.name} x{item.qty || 1}
                        </span>
                        <span>THB {item.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}