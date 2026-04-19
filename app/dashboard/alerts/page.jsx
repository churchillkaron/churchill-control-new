"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");
    const attendance = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const generated = [];

    // 🔥 LOW REVENUE ALERT
    history.forEach((d) => {
      if ((d.revenue || 0) < 5000) {
        generated.push({
          id: "rev-" + d.id,
          type: "warning",
          text: `Low revenue on ${d.date}`,
        });
      }
    });

    // 🔥 LATE STAFF ALERT
    attendance.forEach((a) => {
      if (a.late && a.status === "pending") {
        generated.push({
          id: "late-" + a.id,
          type: "danger",
          text: `${a.name} late — pending approval`,
        });
      }
    });

    setAlerts(generated);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Alerts</h1>

        <div className="space-y-3">

          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}

          {alerts.length === 0 && (
            <div className="text-white/40">No alerts</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

function AlertRow({ alert }) {
  const color =
    alert.type === "danger"
      ? "text-red-400"
      : alert.type === "warning"
      ? "text-yellow-400"
      : "text-white";

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between">
      <span>{alert.text}</span>
      <span className={color}>{alert.type}</span>
    </div>
  );
}