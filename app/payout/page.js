"use client";

import { useEffect, useState } from "react";

export default function Payout() {
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [status, setStatus] = useState("CRITICAL");
  const [payoutLevel, setPayoutLevel] = useState(0);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    setTotalRevenue(revenue);

    const service = revenue * 0.05;
    setServiceCharge(service);

    // 🔥 STATUS LOGIC (CORE SYSTEM)
    if (revenue >= 50000) {
      setStatus("GOOD");
      setPayoutLevel(100);
    } else if (revenue >= 30000) {
      setStatus("WARNING");
      setPayoutLevel(70);
    } else if (revenue >= 15000) {
      setStatus("BAD");
      setPayoutLevel(40);
    } else {
      setStatus("CRITICAL");
      setPayoutLevel(0);
    }
  }, []);

  const foh = serviceCharge * 0.5 * (payoutLevel / 100);
  const bar = serviceCharge * 0.3 * (payoutLevel / 100);
  const kitchen = serviceCharge * 0.2 * (payoutLevel / 100);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Payout background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Payout System
        </h1>

        {/* STATUS */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Status</p>
          <h2 className="text-2xl text-[#ffb36b]">{status}</h2>
        </div>

        {/* REVENUE */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Total Revenue</p>
          <h2>THB {totalRevenue.toLocaleString()}</h2>
        </div>

        {/* SERVICE CHARGE */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Service Charge (5%)</p>
          <h2>THB {serviceCharge.toLocaleString()}</h2>
        </div>

        {/* PAYOUT LEVEL */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Payout Level</p>
          <h2>{payoutLevel}%</h2>
        </div>

        {/* SPLIT */}
        <div className="space-y-4">

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            FOH (50%) → THB {foh.toLocaleString()}
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            BAR (30%) → THB {bar.toLocaleString()}
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            KITCHEN (20%) → THB {kitchen.toLocaleString()}
          </div>

        </div>

      </div>
    </div>
  );
}