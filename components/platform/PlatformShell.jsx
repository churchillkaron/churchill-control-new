"use client";

import { useEffect } from "react";

import AvantiqoOperator from "@/components/operator/AvantiqoOperator";
import LocalHeyAvantiqoWakeBridge from "@/components/operator/LocalHeyAvantiqoWakeBridge";
import WorkspaceTopBar from "@/components/workspace/WorkspaceTopBar";

export default function PlatformShell({
  children,
}) {
  useEffect(() => {
    window.localStorage.removeItem("avantiqo.wake.enabled");

    const disableLegacyWake = () => {
      const legacyDisable = document.querySelector(
        'button[aria-label="Disable Hey Avantiqo"]',
      );
      legacyDisable?.click?.();
    };

    disableLegacyWake();
    const timer = window.setTimeout(disableLegacyWake, 500);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <style jsx global>{`
        button[aria-label="Enable Hey Avantiqo"],
        button[aria-label="Disable Hey Avantiqo"] {
          display: none !important;
        }
      `}</style>

      <WorkspaceTopBar />

      <main className="min-h-[calc(100vh-112px)] px-6 py-6 lg:px-8">
        {children}
      </main>

      <AvantiqoOperator />
      <LocalHeyAvantiqoWakeBridge />
    </div>
  );
}
