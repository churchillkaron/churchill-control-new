"use client";

import { useEffect, useState } from "react";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);

  const [fohPayout, setFohPayout] = useState(0);
  const [barPayout, setBarPayout] = useState(0);
  const [kitchenPayout, setKitchenPayout] = useState(0);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];
    const total = orders.reduce((sum, o) => sum + Number(o.total), 0);

    setRevenue(total);

    // 🔥 GET LEVEL (CRITICAL)
    const level = Number(localStorage.getItem("serviceLevel")) || 5;

    const service = total * (level / 100);
    setServiceCharge(service);

    // SIMPLE SPLIT
    setFohPayout(service * 0.5);
    setBarPayout(service * 0.3);
    setKitchenPayout(service * 0.2);
  }, []);

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Payout System</h1>

      <div>Revenue: THB {revenue.toLocaleString()}</div>
      <div>Service Charge: THB {serviceCharge.toLocaleString()}</div>

      <div className="mt-4">FOH: THB {fohPayout.toLocaleString()}</div>
      <div>BAR: THB {barPayout.toLocaleString()}</div>
      <div>KITCHEN: THB {kitchenPayout.toLocaleString()}</div>

    </div>
  );
}