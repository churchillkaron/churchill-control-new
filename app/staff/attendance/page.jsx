"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AttendancePage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("current_user"));
    if (user) {
      setName(user.name);
      setRole(user.role);
    }
  }, []);

  const handleAction = async (action) => {
    setLoading(true);
    setStatus("");

    const res = await fetch("/api/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, staffName: name, staffRole: role }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error);
    } else {
      if (action === "clock_in") {
        setStatus(
          data.late
            ? "Clocked in (Late ⚠️)"
            : "Clocked in (On time ✅)"
        );
      } else {
        setStatus("Clocked out");
      }
    }

    setLoading(false);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white max-w-xl">

        <h1 className="text-3xl">Attendance</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div>Name: {name}</div>
          <div>Role: {role}</div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => handleAction("clock_in")}
            disabled={loading}
            className="bg-green-500 px-6 py-3 rounded-xl"
          >
            Clock In
          </button>

          <button
            onClick={() => handleAction("clock_out")}
            disabled={loading}
            className="bg-red-500 px-6 py-3 rounded-xl"
          >
            Clock Out
          </button>
        </div>

        {status && (
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            {status}
          </div>
        )}

      </div>
    </AppShell>
  );
}
