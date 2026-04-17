"use client";

import { useEffect, useState } from "react";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);

  const [fohPool, setFohPool] = useState(0);
  const [staffBreakdown, setStaffBreakdown] = useState([]);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];
    const history = JSON.parse(localStorage.getItem("history")) || [];

    const total = orders.reduce((sum, o) => sum + Number(o.total), 0);
    setRevenue(total);

    // 🔥 BASE SERVICE LEVEL
    const level = Number(localStorage.getItem("serviceLevel")) || 5;

    const service = total * (level / 100);
    setServiceCharge(service);

    const fohBase = service * 0.5;
    setFohPool(fohBase);

    // 🔥 BUILD STAFF LEVEL MAP (from history)
    const staffLevelMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (!staffLevelMap[s.name]) {
          staffLevelMap[s.name] = 0;
        }

        staffLevelMap[s.name] += Number(s.revenue);
      });
    });

    // 🔥 CALCULATE LEVEL PER STAFF
    const getLevel = (revenue) => {
      if (revenue >= 100000) return 7;
      if (revenue >= 50000) return 6;
      return 5;
    };

    // 🔥 GROUP TODAY ORDERS
    const staffMap = {};

    orders.forEach((order) => {
      if (!staffMap[order.staff]) {
        staffMap[order.staff] = 0;
      }
      staffMap[order.staff] += Number(order.total);
    });

    const totalFOHRevenue = Object.values(staffMap).reduce((a, b) => a + b, 0);

    // 🔥 APPLY MULTIPLIER
    const breakdown = Object.entries(staffMap).map(([name, value]) => {

      const share = totalFOHRevenue > 0 ? value / totalFOHRevenue : 0;

      const personalRevenue = staffLevelMap[name] || 0;
      const level = getLevel(personalRevenue);

      const multiplier = level / 5; // 5% = base

      const payout = fohBase * share * multiplier;

      return {
        name,
        revenue: value,
        level,
        payout,
      };
    });

    setStaffBreakdown(breakdown);
  }, []);

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Advanced Payout System</h1>

      <div>Revenue: THB {revenue.toLocaleString()}</div>
      <div>Service Charge: THB {serviceCharge.toLocaleString()}</div>
      <div className="mt-4">FOH Pool: THB {fohPool.toLocaleString()}</div>

      <div className="mt-6">
        <h2>FOH Staff (Level-Based)</h2>

        {staffBreakdown.map((s, i) => (
          <div key={i} className="mb-2">

            {s.name}

            <br />

            Revenue: THB {s.revenue.toLocaleString()}

            <br />

            Level: {s.level}%

            <br />

            <span className="text-[#ffb36b]">
              Payout: THB {Math.round(s.payout).toLocaleString()}
            </span>

          </div>
        ))}

      </div>

    </div>
  );
}