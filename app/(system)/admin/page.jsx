"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/platform/admin/control")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl mb-4">Admin Control</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="text-white/60">Organizations</div>
          <div className="text-xl">
            {data?.organizations?.length || 0}
          </div>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="text-white/60">Events</div>
          <div className="text-xl">
            {data?.recentActivity?.length || 0}
          </div>
        </div>
      </div>
    </div>
  );
}
