"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [staffStats, setStaffStats] = useState([]);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
    } else {
      setStaffName(name);
      setStaffRole(role);
    }

    // 🔥 LOAD ORDERS
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    // 🔥 TOTAL REVENUE
    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    setTotalRevenue(revenue);

    // 🔥 STAFF PERFORMANCE CALC
    const stats = {};

    orders.forEach((order) => {
      if (!stats[order.staff]) {
        stats[order.staff] = {
          revenue: 0,
          orders: 0,
        };
      }

      stats[order.staff].revenue += Number(order.total);
      stats[order.staff].orders += 1;
    });

    const formatted = Object.entries(stats).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      orders: data.orders,
    }));

    setStaffStats(formatted);
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Control background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        <div>
          <h1 className="text-3xl md:text-5xl font-semibold">
            Control Final
          </h1>
        </div>

        {/* MAIN KPI */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
          <p className="text-white/50">Total Revenue</p>
          <h2 className="text-3xl mt-2 text-[#ffb36b]">
            THB {totalRevenue.toLocaleString()}
          </h2>
        </div>

        {/* STAFF PERFORMANCE */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">

          <div className="flex justify-between mb-4">
            <h3 className="text-xl font-semibold">
              Staff Performance
            </h3>
            <span className="text-white/40 text-sm">
              Live tracking
            </span>
          </div>

          <div className="space-y-4">
            {staffStats.map((staff, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>
                  <p className="text-sm text-white/50">Staff</p>
                  <p className="text-lg">{staff.name}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Orders</p>
                  <p>{staff.orders}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Revenue</p>
                  <p className="text-[#ffb36b]">
                    THB {staff.revenue.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}