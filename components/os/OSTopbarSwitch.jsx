"use client";

import { useOS } from "@/app/providers/OSProvider";

export default function OSTopbarSwitch() {
  const { mode, switchMode } = useOS();

  return (
    <div className="flex gap-2 text-white">
      <button
        onClick={() => switchMode("platform")}
        className={mode === "platform" ? "text-green-400" : "text-white/50"}
      >
        Platform
      </button>

      <button
        onClick={() => switchMode("workspace")}
        className={mode === "workspace" ? "text-green-400" : "text-white/50"}
      >
        Workspace
      </button>
    </div>
  );
}
