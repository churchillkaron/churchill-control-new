"use client";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

export default function Marketplace() {
  const { navigation } = useWorkspaceRuntime();

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl mb-4">Module Marketplace</h1>

      <div className="grid grid-cols-3 gap-4">
        {Object.values(navigation || {}).flat().map((m) => (
          <div key={m.id} className="p-4 bg-white/5 rounded-xl border border-white/10">
            {m.name}
          </div>
        ))}
      </div>
    </div>
  );
}
