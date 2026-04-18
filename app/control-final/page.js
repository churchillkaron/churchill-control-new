"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    revenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
  });

  const [showApproval, setShowApproval] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");
      setOrders(data);
    } catch (e) {
      console.error("Error loading orders", e);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    setSummary({
      revenue,
      totalOrders,
      avgOrderValue,
    });
  }, [orders]);

  // 🔥 PREPARE CLOSE (WITH PENALTIES)
  const prepareClose = () => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    const serviceCharge = Math.round(revenue * 0.05);

    const fohPool = serviceCharge * 0.5;
    const barPool = serviceCharge * 0.3;
    const kitchenPool = serviceCharge * 0.2;

    const fohLevel = avgOrderValue > 400 ? 1 : 0.7;

    const adjustedFoh = fohPool * fohLevel;

    // 🔥 LOAD ATTENDANCE
    const attendance =
      JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const today = new Date().toLocaleDateString("en-GB");

    const getPenalty = (name) => {
      const entry = attendance.find(
        (a) => a.name === name && a.date === today
      );
      return entry ? entry.penalty || 0 : 0;
    };

    // 🔥 STAFF PAYOUT WITH PENALTIES
    const staff = [
      {
        name: "FOH 1",
        payout: Math.max(
          0,
          Math.round(adjustedFoh / 2) - getPenalty("FOH 1")
        ),
      },
      {
        name: "FOH 2",
        payout: Math.max(
          0,
          Math.round(adjustedFoh / 2) - getPenalty("FOH 2")
        ),
      },
      {
        name: "BAR",
        payout: Math.max(
          0,
          Math.round(barPool) - getPenalty("BAR")
        ),
      },
      {
        name: "KITCHEN",
        payout: Math.max(
          0,
          Math.round(kitchenPool) - getPenalty("KITCHEN")
        ),
      },
    ];

    const newDay = {
      date: new Date().toLocaleDateString("en-GB"),
      revenue,
      serviceCharge,
      paidOrders,
      totalOrders,
      avgOrderValue,
      fohScore:
        avgOrderValue > 500
          ? "GOOD"
          : avgOrderValue > 300
          ? "WARNING"
          : "BAD",
      kitchenLevel: "GOOD",
      barLevel: "GOOD",
      staff,
    };

    setPendingData(newDay);
    setShowApproval(true);
  };

  // 🔥 APPROVE
  const approveClose = () => {
    const history =
      JSON.parse(localStorage.getItem("history") || "[]");

    const updatedHistory = [...history, pendingData];

    localStorage.setItem("history", JSON.stringify(updatedHistory));

    localStorage.removeItem("orders");

    setShowApproval(false);
    alert("Day approved and saved");

    window.location.reload();
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Control Final
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Daily Overview
          </h1>
        </div>

        <div className="grid md:grid-cols-3 gap-6">

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Revenue</div>
            <div className="text-3xl font-semibold mt-2">
              THB {summary.revenue}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Orders</div>
            <div className="text-3xl font-semibold mt-2">
              {summary.totalOrders}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Avg Order</div>
            <div className="text-3xl font-semibold mt-2">
              THB {summary.avgOrderValue}
            </div>
          </div>

        </div>

        <div>
          <button
            onClick={prepareClose}
            className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white"
          >
            Close Day (Manager Approval)
          </button>
        </div>

        {/* APPROVAL POPUP */}
        {showApproval && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-black p-6 rounded-xl w-[400px] space-y-4">

              <h2 className="text-lg font-semibold">Approve Day</h2>

              <div className="text-sm text-white/60">
                Revenue: THB {pendingData?.revenue}
              </div>

              <div className="text-sm text-white/60">
                Service: THB {pendingData?.serviceCharge}
              </div>

              <div className="text-sm text-white/60">
                Orders: {pendingData?.totalOrders}
              </div>

              <div className="space-y-2">
                {pendingData?.staff.map((s, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span>THB {s.payout}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={approveClose}
                className="w-full bg-[#ff7a00] py-2 rounded"
              >
                Approve & Save
              </button>

            </div>
          </div>
        )}

        <div className="space-y-4">
          {orders
            .filter((o) => o.status === "PAID")
            .map((order) => (
              <div
                key={order.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
              >
                <div>
                  Table {order.table} — {order.items?.length || 0} items
                </div>
                <div>THB {order.total}</div>
              </div>
            ))}
        </div>

      </div>
    </AppShell>
  );
}