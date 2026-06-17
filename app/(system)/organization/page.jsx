"use client";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

export default function OrganizationPage() {
  const { organization } = useWorkspaceRuntime();

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl mb-4">Organization</h1>

      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
        <div className="text-white/60">Name</div>
        <div>{organization?.name}</div>
      </div>
    </div>
  );
}
