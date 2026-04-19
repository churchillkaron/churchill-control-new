"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell"; // ✅ correct

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");
    const attendance = JSON.parse(localStorage.getItem("staff_attendance") || "[]");

    const generated = [];

    history.forEach((d) => {
      if ((d.revenue || 0) < 5000) {
        generated.push({
          id: "rev-" + d.id,
          text: `Low revenue on ${d.date}`,
        });
      }
    });

    attendance.forEach((a) => {
      if (a.late && a.status === "pending") {
        generated.push({
          id: "late-" + a.id,
          text: `${a.name} late`,
        });
      }
    });

    setAlerts(generated);
  }, []);

  return (
    <AppShell>
      <div className="space-y-6 text-white">

        <h1 className="text-3xl">Alerts</h1>

        {alerts.map((a) => (
          <div key={a.id} className="bg-white/5 p-4 rounded-xl">
            {a.text}
          </div>
        ))}

      </div>
    </AppShell>
  );
}