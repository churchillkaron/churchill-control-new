"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function History() {
  const [history, setHistory] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(data.reverse());
  }, []);

  const calculateDepartmentPayout = (day) => {
    const sc = day.serviceCharge || 0;

    return {
      FOH: Math.round(sc * 0.5),
      BAR: Math.round(sc * 0.3),
      KITCHEN: Math.round(sc * 0.2),
    };
  };

  // 🔥 NEW: staff distribution
  const calculateStaffPayout = (day) => {
    const dept = calculateDepartmentPayout(day);

    const staffMap = {
      FOH: new Set(),
      BAR: new Set(),
      KITCHEN: new Set(),
    };

    // collect staff from orders
    day.paidOrders.forEach((order) => {
      if (!order.staff) return;

      // simple logic: all current staff = FOH for now
      staffMap.FOH.add(order.staff);
    });

    const result = {};

    Object.keys(staffMap).forEach((deptKey) => {
      const staffList = Array.from(staffMap[deptKey]);

      if (staffList.length === 0) return;

      const share = Math.round(dept[deptKey] / staffList.length);

      result[deptKey] = staffList.map((name) => ({
        name,
        amount: share,
      }));
    });

    return result;
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
                    Service Charge: THB {day.serviceCharge.toLocaleString()}
                  </div>
                </div>

                <div className="text-[#ffb36b] text-sm">
                  View
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedDay && (
          <div className="space-y-6">

            <button
              onClick={() => setSelectedDay(null)}
              className="text-white/50"
            >
              ← Back
            </button>

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

            {/* DEPARTMENT SPLIT */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="text-white/60 mb-4">Department Split</div>

              {(() => {
                const payout = calculateDepartmentPayout(selectedDay);
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>FOH</span>
                      <span>THB {payout.FOH}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BAR</span>
                      <span>THB {payout.BAR}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>KITCHEN</span>
                      <span>THB {payout.KITCHEN}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 🔥 STAFF PAYOUT */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="text-white/60 mb-4">Staff Payout</div>

              {(() => {
                const staffData = calculateStaffPayout(selectedDay);

                return Object.entries(staffData).map(([dept, staff]) => (
                  <div key={dept} className="mb-4">
                    <div className="text-[#ffb36b] mb-2">{dept}</div>

                    {staff.map((s, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{s.name}</span>
                        <span>THB {s.amount}</span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>

            {/* ORDERS */}
            <div className="space-y-4">
              {selectedDay.paidOrders.map((order, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex justify-between">
                    <div>Table {order.table}</div>
                    <div>THB {order.total}</div>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-white/70">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.name}</span>
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