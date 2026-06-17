"use client";

import { useEffect, useState } from "react";

export default function AnalyticsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/platform/admin/control")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl mb-4">Analytics</h1>

      <div className="text-white/60">
        Events: {data?.health?.totalEvents || 0}
      </div>

      <div className="text-white/60">
        Status: {data?.health?.systemStatus}
      </div>
    </div>
  );
}
