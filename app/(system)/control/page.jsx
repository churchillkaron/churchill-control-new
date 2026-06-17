"use client";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

export default function ControlCenter() {
  const { organization, navigation, ready } = useWorkspaceRuntime();

  if (!ready) {
    return <div className="p-10 text-white">Loading Avantiqo OS...</div>;
  }

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl mb-4">Control Center</h1>

      <div className="text-white/60 mb-6">
        {organization?.name}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Object.keys(navigation || {}).map((group) => (
          <div key={group} className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="mb-2">{group}</div>

            <div className="text-white/60 text-sm">
              {(navigation[group] || []).map((item) => (
                <div key={item.id}>{item.name}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
