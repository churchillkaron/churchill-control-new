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

      <main className="pl-[96px]">

        <PlatformHeader />

        <div className="min-h-[calc(100vh-88px)] px-8 py-8">

          {children}

        </div>

      </main>

      <PlatformCommandCenter />

    </div>

  );

}
