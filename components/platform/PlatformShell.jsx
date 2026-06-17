"use client";

import PlatformCommandCenter from "@/components/platform/command/PlatformCommandCenter";
import WorkspaceTopBar from "@/components/workspace/WorkspaceTopBar";

export default function PlatformShell({
  children,
}) {
  return (
    <div className="min-h-screen bg-black text-white">

      <WorkspaceTopBar />

      <main>
        <div className="min-h-[calc(100vh-90px)] px-6 py-4">
          {children}
        </div>
      </main>

      <PlatformCommandCenter />
    </div>
  );
}
