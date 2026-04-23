"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function ManagementPage() {
  const [staff, setStaff] = useState([]);
  const [history, setHistory] = useState([]);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const hist = JSON.parse(localStorage.getItem("history") || "[]");
      setHistory(hist);

      const latest = hist[hist.length - 1];
      setStaff(latest?.staff || []);
    } catch {
      setStaff([]);
      setHistory([]);
    }

    fetch("/api/assets")
      .then((res) => res.json())
      .then((data) => setAssets(data || []))
      .catch(() => setAssets([]));
  };

  // 🔥 ROUTINE STATUS (today)
  const todayUploads = assets.filter(
    (a) => a.category === "routine"
  );

  const kitchenCount = todayUploads.filter(
    (a) => a.department === "kitchen" && a.status === "approved"
  ).length;

  const fohCount = todayUploads.filter(
    (a) => a.department === "foh" && a.status === "approved"
  ).length;

  const barCount = todayUploads.filter(
    (a) => a.department === "bar" && a.status === "approved"
  ).length;

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-semibold">Management</h1>
          <p className="text-white/50 text-sm">
            Full control center
          </p>
        </div>

        {/* QUICK NAV */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <NavCard title="Approvals" href="/management/approval" />
          <NavCard title="Accounting" href="/accounting" />
          <NavCard title="Staff Control" href="/management/staff-control" />
          <NavCard title="Attendance" href="/management/attendance" />

        </div>

        {/* OPERATIONS STATUS */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <h2 className="text-xl mb-4">Routine Coverage</h2>

          <div className="grid grid-cols-3 gap-4">

            <StatusCard
              title="Kitchen"
              value={`${kitchenCount} / 5`}
              ok={kitchenCount >= 5}
            />

            <StatusCard
              title="FOH"
              value={`${fohCount} / 5`}
              ok={fohCount >= 5}
            />

            <StatusCard
              title="Bar"
              value={`${barCount} / 3`}
              ok={barCount >= 3}
            />

          </div>

        </div>

        {/* STAFF PERFORMANCE */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <h2 className="text-xl mb-4">Staff Performance</h2>

          {staff.length === 0 ? (
            <p className="text-white/40">No staff data</p>
          ) : (
            <div className="space-y-3">

              {staff.map((s, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center border-b border-white/10 pb-2"
                >
                  <div>
                    <div>{s.name}</div>
                    <div className="text-xs text-white/40">
                      Score: {s.score || "-"}
                    </div>
                  </div>

                  <a
                    href="/staff"
                    className="text-sm bg-white/10 px-3 py-1 rounded"
                  >
                    View
                  </a>
                </div>
              ))}

            </div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

// ----------------------------------

function NavCard({ title, href }) {
  return (
    <a
      href={href}
      className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10"
    >
      {title}
    </a>
  );
}

function StatusCard({ title, value, ok }) {
  return (
    <div className="bg-black/30 p-4 rounded-xl text-center">
      <div className="text-sm text-white/50">{title}</div>
      <div className={`text-xl mt-2 ${ok ? "text-green-400" : "text-red-400"}`}>
        {value}
      </div>
    </div>
  );
}