"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [fohPool, setFohPool] = useState(0);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    if (storedHistory.length > 0) {
      const lastDay = storedHistory[0];

      const revenueValue = Number(lastDay.revenue || 0);
      const service = revenueValue * 0.05;
      const foh = service * 0.5;

      setRevenue(revenueValue);
      setServiceCharge(service);
      setFohPool(foh);
    }

    const storedStaff =
      JSON.parse(localStorage.getItem("staffList")) || [];

    setStaff(storedStaff);
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-16 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Advanced Payout System
        </h1>

        {/* SUMMARY */}
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-3">
          <div>Revenue: THB {revenue.toLocaleString()}</div>
          <div>Service Charge: THB {serviceCharge.toLocaleString()}</div>
          <div>FOH Pool: THB {fohPool.toLocaleString()}</div>
        </div>

        {/* FOH STAFF */}
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-4">
          <h2 className="text-xl font-semibold">
            FOH Staff (Level-Based)
          </h2>

          {staff.length === 0 && (
            <div className="text-white/60">
              No staff data available
            </div>
          )}

          {staff.map((s, i) => (
            <div
              key={i}
              className="p-4 border border-white/10 rounded-xl flex justify-between"
            >
              <div>{s.name}</div>
              <div>{s.role}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}