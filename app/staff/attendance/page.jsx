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
    if (!name || !role) {
      setStatus("Missing user");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          staffName: name,
          staffRole: role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Error");
      } else {
        setStatus(
          action === "clock_in"
            ? "Clocked in successfully"
            : "Clocked out successfully"
        );
      }
    } catch {
      setStatus("Request failed");
    }

    setLoading(false);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white max-w-xl">

        <h1 className="text-3xl">Attendance</h1>

        {/* USER INFO */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
          <div>Name: {name || "—"}</div>
          <div>Role: {role || "—"}</div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-4">
          <button
            onClick={() => handleAction("clock_in")}
            disabled={loading}
            className="bg-green-500 px-6 py-3 rounded-xl hover:brightness-110 transition disabled:opacity-50"
          >
            Clock In
          </button>

          <button
            onClick={() => handleAction("clock_out")}
            disabled={loading}
            className="bg-red-500 px-6 py-3 rounded-xl hover:brightness-110 transition disabled:opacity-50"
          >
            Clock Out
          </button>
        </div>

        {/* STATUS */}
        {status && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            {status}
          </div>
        )}

      </div>
    </AppShell>
  );
}