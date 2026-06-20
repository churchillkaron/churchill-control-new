"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";
import Link from "next/link";

export default function RestaurantWorkspacePage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id || "";

  // Placeholder data loading for now; can be replaced with real API calls
  const [ordersToday, setOrdersToday] = useState(12);
  const [revenueToday, setRevenueToday] = useState(25000);
  const [occupiedTables, setOccupiedTables] = useState(8);
  const [averageTicket, setAverageTicket] = useState(320);
  const [kitchenQueue, setKitchenQueue] = useState(5);
  const [readyOrders, setReadyOrders] = useState(4);

  const [workCenters, setWorkCenters] = useState([]);

  useEffect(() => {
    async function loadWorkCenters() {
      if (!organizationId) return;

      const res = await fetch("/api/work-centers/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
        }),
      });

      const json = await res.json();
      setWorkCenters(json.data || []);
    }

    loadWorkCenters();
  }, [organizationId]);

  // Operational cards
  const operationCards = [
    { title: "Orders", value: ordersToday, label: "Orders Today", href: `/workspace/${organizationId}/restaurant/pos` },
    { title: "Tables", value: occupiedTables, label: "Occupied Tables", href: `/workspace/${organizationId}/restaurant/tables` },

    ...workCenters.map(center => ({
      title: center.name,
      value: 0,
      label: `${center.name} Queue`,
      href: `/operations/work-center/${center.id}`,
    })),

    { title: "Dispatch", value: readyOrders, label: "Ready Orders", href: `/workspace/${organizationId}/kitchen/expo` },
    { title: "Payments", value: 0, label: "Payments Pending", href: `/workspace/${organizationId}/restaurant/pos/payments` },
    { title: "Inventory", value: 0, label: "Stock Alerts", href: `/workspace/${organizationId}/restaurant/inventory` },
    { title: "Reservations", value: 0, label: "Today Arrivals", href: `/workspace/${organizationId}/restaurant/reservations` },
  ];

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <section className="mb-8 rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(214,166,106,0.22),transparent_35%),linear-gradient(135deg,rgba(20,16,12,0.95),rgba(3,7,18,0.98))] p-8">
        <p className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/80">Industry Workspace</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-[-0.04em]">Restaurant</h1>
        <p className="mt-3 text-white/50">{organization?.name}</p>
      </section>

      {/* Top KPI section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Revenue Today</p>
          <p className="text-2xl font-semibold">฿{revenueToday.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Orders Today</p>
          <p className="text-2xl font-semibold">{ordersToday}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Occupied Tables</p>
          <p className="text-2xl font-semibold">{occupiedTables}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Average Ticket</p>
          <p className="text-2xl font-semibold">฿{averageTicket}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Work Centers</p>
          <p className="text-2xl font-semibold">{workCenters.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <p className="text-white/70 text-sm">Ready Orders</p>
          <p className="text-2xl font-semibold">{readyOrders}</p>
        </div>
      </section>

      {/* Operation cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-12">
        {operationCards.map(card => (
          <Link
            key={card.title}
            href={card.href}
            className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center shadow-lg hover:scale-105 transition-transform"
          >
            <span className="text-yellow-400 text-xl font-semibold">{card.label}</span>
            <span className="mt-2 text-white text-3xl font-bold">{card.value}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
