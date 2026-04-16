"use client";

import { useEffect, useState } from "react";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/control-final";
    } else {
      setStaffName(name);
      setStaffRole(role);
    }
  }, []);

  const orders = [
    { table: "T12", items: 4, total: 2450, status: "Active", staff: staffName },
    { table: "T08", items: 2, total: 1120, status: "Preparing", staff: staffName },
    { table: "Bar", items: 6, total: 3860, status: "Open", staff: staffName },
  ];

  const handleSendToSystem = async () => {
    try {
      setSaving(true);

      const revenue = orders.reduce((sum, o) => sum + o.total, 0);

      const res = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: new Date().toISOString().split("T")[0],
          dishes: orders,
          revenue,
          cost: 0,
          profit: revenue,
        }),
      });

      if (!res.ok) {
        alert("Failed to send data");
        return;
      }

      alert("Orders sent to system");

    } catch (err) {
      alert("Error sending data");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="POS background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* STAFF INFO */}
        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Point of Sale
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Live Orders
          </h1>
        </div>

        {/* HERO */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">

          <div className="flex justify-between items-center">

            <div>
              <p className="text-white/50 text-sm">Orders Ready</p>
              <h2 className="text-3xl mt-2">{orders.length}</h2>
            </div>

            <button
              onClick={handleSendToSystem}
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-[#ff7a00] text-black font-semibold hover:bg-[#ff9a2f] transition"
            >
              {saving ? "Sending..." : "Send to System"}
            </button>

          </div>
        </div>

        {/* ORDER LIST */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="space-y-4">
            {orders.map((order, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>{order.table}</div>
                <div>{order.items}</div>
                <div>THB {order.total}</div>
                <div>{order.staff}</div>
                <div className="text-[#ffb36b]">{order.status}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}