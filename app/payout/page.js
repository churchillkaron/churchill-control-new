"use client";

import { useEffect, useState } from "react";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);

  const [barWaste, setBarWaste] = useState(0);
  const [kitchenCost, setKitchenCost] = useState(30);

  const [fohStatus, setFohStatus] = useState("");
  const [barStatus, setBarStatus] = useState("");
  const [kitchenStatus, setKitchenStatus] = useState("");

  const [fohPool, setFohPool] = useState(0);
  const [barPayout, setBarPayout] = useState(0);
  const [kitchenPayout, setKitchenPayout] = useState(0);

  const [staffBreakdown, setStaffBreakdown] = useState([]);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];
    const total = orders.reduce((sum, o) => sum + Number(o.total), 0);

    setRevenue(total);

    const service = total * 0.05;
    setServiceCharge(service);

    const savedBarWaste = Number(localStorage.getItem("barWaste")) || 0;
    const savedKitchenCost = Number(localStorage.getItem("kitchenCost")) || 30;

    setBarWaste(savedBarWaste);
    setKitchenCost(savedKitchenCost);

    calculate(orders, total, service, savedBarWaste, savedKitchenCost);
  }, []);

  const calculate = (orders, total, service, barWasteValue, kitchenCostValue) => {

    // FOH PERFORMANCE
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

    // BAR
    let barLevel = 0;
    let barStatusText = "CRITICAL";

    if (barWasteValue < 1000) {
      barLevel = 100;
      barStatusText = "GOOD";
    } else if (barWasteValue < 2000) {
      barLevel = 70;
      barStatusText = "WARNING";
    } else if (barWasteValue < 4000) {
      barLevel = 40;
      barStatusText = "BAD";
    }

    setBarStatus(barStatusText);

    // KITCHEN
    let kitchenLevel = 0;
    let kitchenStatusText = "CRITICAL";

    if (kitchenCostValue <= 30) {
      kitchenLevel = 100;
      kitchenStatusText = "GOOD";
    } else if (kitchenCostValue <= 35) {
      kitchenLevel = 70;
      kitchenStatusText = "WARNING";
    } else if (kitchenCostValue <= 40) {
      kitchenLevel = 40;
      kitchenStatusText = "BAD";
    }

    setKitchenStatus(kitchenStatusText);

    // POOLS
    const fohBasePool = service * 0.5;
    const barPool = service * 0.3;
    const kitchenPool = service * 0.2;

    const fohFinalPool = fohBasePool * (fohLevel / 100);

    setFohPool(fohFinalPool);
    setBarPayout(barPool * (barLevel / 100));
    setKitchenPayout(kitchenPool * (kitchenLevel / 100));

    // 🔥 STAFF SPLIT
    const staffMap = {};

    orders.forEach((order) => {
      if (!staffMap[order.staff]) {
        staffMap[order.staff] = 0;
      }
      staffMap[order.staff] += Number(order.total);
    });

    const totalFOHRevenue = Object.values(staffMap).reduce((a, b) => a + b, 0);

    const breakdown = Object.entries(staffMap).map(([name, value]) => {
      const share = totalFOHRevenue > 0 ? value / totalFOHRevenue : 0;
      const payout = fohFinalPool * share;

      return {
        name,
        revenue: value,
        share: (share * 100).toFixed(1),
        payout: payout,
      };
    });

    setStaffBreakdown(breakdown);
  };

  return (
    <div className="relative min-h-screen text-white">

      <div className="max-w-7xl mx-auto px-6 pt-28 space-y-6">

        <h1 className="text-3xl font-semibold">Payout System</h1>

        <div>Revenue: THB {revenue.toLocaleString()}</div>
        <div>Service Charge: THB {serviceCharge.toLocaleString()}</div>

        <div>FOH Pool: THB {fohPool.toLocaleString()}</div>
        <div>BAR: THB {barPayout.toLocaleString()}</div>
        <div>KITCHEN: THB {kitchenPayout.toLocaleString()}</div>

        {/* STAFF BREAKDOWN */}
        <div className="mt-6 space-y-3">
          <h2 className="text-xl">FOH Staff Split</h2>

          {staffBreakdown.map((s, i) => (
            <div key={i} className="p-3 bg-black/30 rounded">
              {s.name} → {s.share}% → THB {s.payout.toLocaleString()}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}