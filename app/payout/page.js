"use client";

import { useEffect, useState } from "react";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);

  const [serviceCharge, setServiceCharge] = useState(0);

  const [fohStatus, setFohStatus] = useState("");
  const [barStatus, setBarStatus] = useState("");
  const [kitchenStatus, setKitchenStatus] = useState("");

  const [fohPayout, setFohPayout] = useState(0);
  const [barPayout, setBarPayout] = useState(0);
  const [kitchenPayout, setKitchenPayout] = useState(0);

  // 🔥 Manual inputs (for now)
  const [barWaste, setBarWaste] = useState(0);
  const [kitchenCost, setKitchenCost] = useState(30);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];

    const total = orders.reduce((sum, o) => sum + Number(o.total), 0);
    setRevenue(total);

    const service = total * 0.05;
    setServiceCharge(service);

    // 🔥 FOH LOGIC (based on revenue)
    let fohLevel = 0;
    let fohStatusText = "CRITICAL";

    if (total >= 50000) {
      fohLevel = 100;
      fohStatusText = "GOOD";
    } else if (total >= 30000) {
      fohLevel = 70;
      fohStatusText = "WARNING";
    } else if (total >= 15000) {
      fohLevel = 40;
      fohStatusText = "BAD";
    }

    setFohStatus(fohStatusText);

    // 🔥 BAR LOGIC (based on waste)
    let barLevel = 0;
    let barStatusText = "CRITICAL";

    if (barWaste < 1000) {
      barLevel = 100;
      barStatusText = "GOOD";
    } else if (barWaste < 2000) {
      barLevel = 70;
      barStatusText = "WARNING";
    } else if (barWaste < 4000) {
      barLevel = 40;
      barStatusText = "BAD";
    }

    setBarStatus(barStatusText);

    // 🔥 KITCHEN LOGIC (based on cost %)
    let kitchenLevel = 0;
    let kitchenStatusText = "CRITICAL";

    if (kitchenCost <= 30) {
      kitchenLevel = 100;
      kitchenStatusText = "GOOD";
    } else if (kitchenCost <= 35) {
      kitchenLevel = 70;
      kitchenStatusText = "WARNING";
    } else if (kitchenCost <= 40) {
      kitchenLevel = 40;
      kitchenStatusText = "BAD";
    }

    setKitchenStatus(kitchenStatusText);

    // 🔥 SPLIT (base allocation)
    const fohPool = service * 0.5;
    const barPool = service * 0.3;
    const kitchenPool = service * 0.2;

    // 🔥 FINAL PAYOUT
    setFohPayout(fohPool * (fohLevel / 100));
    setBarPayout(barPool * (barLevel / 100));
    setKitchenPayout(kitchenPool * (kitchenLevel / 100));

  }, [barWaste, kitchenCost]);

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

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 space-y-8">

        <h1 className="text-3xl md:text-5xl font-semibold">
          Payout System
        </h1>

        {/* REVENUE */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Total Revenue</p>
          <h2>THB {revenue.toLocaleString()}</h2>
        </div>

        {/* SERVICE CHARGE */}
        <div className="p-6 rounded-xl bg-black/30 border border-white/10">
          <p>Service Charge (5%)</p>
          <h2>THB {serviceCharge.toLocaleString()}</h2>
        </div>

        {/* INPUTS */}
        <div className="space-y-4">

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            <p>Bar Waste (THB)</p>
            <input
              type="number"
              value={barWaste}
              onChange={(e) => setBarWaste(Number(e.target.value))}
              className="mt-2 p-2 text-black rounded"
            />
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            <p>Kitchen Cost (%)</p>
            <input
              type="number"
              value={kitchenCost}
              onChange={(e) => setKitchenCost(Number(e.target.value))}
              className="mt-2 p-2 text-black rounded"
            />
          </div>

        </div>

        {/* RESULTS */}
        <div className="space-y-4">

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            FOH → {fohStatus} → THB {fohPayout.toLocaleString()}
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            BAR → {barStatus} → THB {barPayout.toLocaleString()}
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/10">
            KITCHEN → {kitchenStatus} → THB {kitchenPayout.toLocaleString()}
          </div>

        </div>

      </div>
    </div>
  );
}