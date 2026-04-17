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

    // 🔥 NEW LEVELS
    const levels = {
      GOOD: 1,
      WARNING: 0.7,
      BAD: 0.4,
      CRITICAL: 0.2,
    };

    // FOH
    let fohStatusText = "CRITICAL";

    if (total >= 50000) fohStatusText = "GOOD";
    else if (total >= 30000) fohStatusText = "WARNING";
    else if (total >= 15000) fohStatusText = "BAD";

    setFohStatus(fohStatusText);

    // BAR
    let barStatusText = "CRITICAL";

    if (barWasteValue < 1000) barStatusText = "GOOD";
    else if (barWasteValue < 2000) barStatusText = "WARNING";
    else if (barWasteValue < 4000) barStatusText = "BAD";

    setBarStatus(barStatusText);

    // KITCHEN
    let kitchenStatusText = "CRITICAL";

    if (kitchenCostValue <= 30) kitchenStatusText = "GOOD";
    else if (kitchenCostValue <= 35) kitchenStatusText = "WARNING";
    else if (kitchenCostValue <= 40) kitchenStatusText = "BAD";

    setKitchenStatus(kitchenStatusText);

    // POOLS
    const fohBase = service * 0.5;
    const barBase = service * 0.3;
    const kitchenBase = service * 0.2;

    const fohFinal = fohBase * levels[fohStatusText];
    const barFinal = barBase * levels[barStatusText];
    const kitchenFinal = kitchenBase * levels[kitchenStatusText];

    setFohPool(fohFinal);
    setBarPayout(barFinal);
    setKitchenPayout(kitchenFinal);

    // STAFF SPLIT
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
      const payout = fohFinal * share;

      return {
        name,
        revenue: value,
        payout,
      };
    });

    setStaffBreakdown(breakdown);
  };

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Payout System</h1>

      <div>Revenue: THB {revenue.toLocaleString()}</div>
      <div>Service Charge: THB {serviceCharge.toLocaleString()}</div>

      <div className="mt-4">
        FOH → {fohStatus} → THB {fohPool.toLocaleString()}
      </div>

      <div>
        BAR → {barStatus} → THB {barPayout.toLocaleString()}
      </div>

      <div>
        KITCHEN → {kitchenStatus} → THB {kitchenPayout.toLocaleString()}
      </div>

      <div className="mt-6">
        <h2>FOH Staff Breakdown</h2>

        {staffBreakdown.map((s, i) => (
          <div key={i}>
            {s.name} → THB {s.payout.toLocaleString()}
          </div>
        ))}
      </div>

    </div>
  );
}