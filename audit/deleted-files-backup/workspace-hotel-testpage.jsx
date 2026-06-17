"use client";

import { useEffect, useState } from "react";

const kpiCards = [
  { title: "Occupancy", key: "occupancy", suffix: "%" },
  { title: "Check-ins Today", key: "checkins" },
  { title: "Check-outs Today", key: "checkouts" },
  { title: "Rooms Available", key: "roomsAvailable" },
  { title: "Dirty Rooms", key: "roomsDirty" },
  { title: "RevPAR", key: "revpar", prefix: "THB " },
];

const modules = [
  { title: "Front Desk", status: "Excellent" },
  { title: "Reservations", status: "Excellent" },
  { title: "Housekeeping", status: "In Progress" },
  { title: "Maintenance", status: "Good" },
  { title: "Concierge", status: "Excellent" },
];

export default function HotelLuxuryTestPage() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/hotel/metrics?organizationId=test");
        const data = await res.json();
        setMetrics(data);
      } catch (err) {
        console.error(err);
      }
    }
    fetchMetrics();
  }, []);

  return (
    <div className="min-h-screen bg-[url('/hotel-bg.jpg')] bg-cover bg-center p-12 text-white">
      {/* Hero */}
      <div className="rounded-3xl bg-black/30 backdrop-blur-lg p-12 shadow-2xl border border-white/10">
        <p className="text-sm uppercase tracking-widest text-white/40">Hospitality Command Center</p>
        <h1 className="mt-4 text-6xl font-bold">Test Hotel Alpha</h1>
        <p className="mt-2 text-white/60 text-xl">
          Enterprise operating system connected to modules, finance, payroll, operations and guest intelligence.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mt-12">
        {kpiCards.map((card) => (
          <div key={card.key} className="bg-black/30 backdrop-blur-lg p-6 rounded-3xl border border-white/10 shadow-xl text-center">
            <p className="text-white/40 text-sm">{card.title}</p>
            <p className="mt-2 text-3xl font-semibold">
              {metrics ? `${card.prefix || ""}${metrics[card.key] ?? 0}${card.suffix || ""}` : "..."}
            </p>
          </div>
        ))}
      </div>

      {/* Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-12">
        {modules.map((mod) => (
          <div key={mod.title} className="bg-black/30 backdrop-blur-lg rounded-3xl p-6 border border-white/10 shadow-xl text-center">
            <h2 className="text-xl font-semibold">{mod.title}</h2>
            <p className="mt-2 text-white/50">Live Status: <span className="text-amber-400">{mod.status}</span></p>
            <button className="mt-4 px-4 py-2 bg-amber-600 rounded-xl hover:bg-amber-500 transition">
              Open Module →
            </button>
          </div>
        ))}
      </div>

      {/* Guest Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        <div className="bg-black/30 backdrop-blur-lg p-6 rounded-3xl border border-white/10 shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Guest Intelligence</h2>
          <ul className="space-y-2">
            <li>VIP Arrivals Today: 4</li>
            <li>Today's Birthdays: 3</li>
            <li>Loyal Guests In House: 27</li>
            <li>Late Checkouts: 7</li>
          </ul>
        </div>

        {/* Revenue & AI Insights */}
        <div className="bg-black/30 backdrop-blur-lg p-6 rounded-3xl border border-white/10 shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Revenue & AI Insights</h2>
          <ul className="space-y-2">
            <li>Room Revenue: THB 284,500</li>
            <li>F&B Revenue: THB 96,200</li>
            <li>Spa Revenue: THB 48,750</li>
            <li>Total Revenue: THB 429,450</li>
            <li>Occupancy Forecast: 92%</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
