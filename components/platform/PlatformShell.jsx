"use client";

import WorkspaceRail
  from "@/components/churchill/WorkspaceRail";

import PlatformHeader
  from "@/components/platform/PlatformHeader";

import PlatformCommandCenter
  from "@/components/platform/command/PlatformCommandCenter";

export default function PlatformShell({
  children,
}) {

  return (

    <div className="min-h-screen bg-black text-white">

      <WorkspaceRail />

      <main className="pl-[78px]">

        <PlatformHeader />

        <div>

          {children}

        </div>

      </main>

      <PlatformCommandCenter />

    </div>

  );

}
