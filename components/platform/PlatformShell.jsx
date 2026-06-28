"use client";

import WorkspaceTopBar from "@/components/workspace/WorkspaceTopBar";

export default function PlatformShell({
  children,
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <WorkspaceTopBar />

      <main className="min-h-[calc(100vh-112px)] px-6 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
