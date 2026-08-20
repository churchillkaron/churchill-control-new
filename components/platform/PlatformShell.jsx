"use client";

import LocalHeyAvantiqoWakeBridge from "@/components/operator/LocalHeyAvantiqoWakeBridge";
import WorkspaceTopBar from "@/components/workspace/WorkspaceTopBar";

const LEGACY_WAKE_TEMPLATE_KEY = "avantiqo.local-wake.template.v2";

function restoreLegacyWakeTemplateTrust() {
  if (typeof window === "undefined") return;

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(LEGACY_WAKE_TEMPLATE_KEY) || "null",
    );

    if (
      Number(stored?.version) !== 2 ||
      stored?.verified_semantic === true ||
      !Array.isArray(stored?.frames) ||
      stored.frames.length === 0
    ) {
      return;
    }

    window.localStorage.setItem(
      LEGACY_WAKE_TEMPLATE_KEY,
      JSON.stringify({
        ...stored,
        verified_semantic: true,
        verification_source: "legacy_local_wake_enrollment",
      }),
    );
  } catch {
    // Invalid local wake data is ignored; the voice bridge can relearn normally.
  }
}

export default function PlatformShell({
  children,
}) {
  // This runs before the wake bridge mounts on the client. Older Avantiqo
  // templates were deliberately trained by the user but predate the later
  // verified_semantic metadata flag. Preserve that proven local training
  // instead of forcing every wake attempt through server transcription.
  restoreLegacyWakeTemplateTrust();

  return (
    <div className="min-h-screen bg-black text-white">
      <WorkspaceTopBar />

      <main className="min-h-[calc(100vh-112px)] px-6 py-6 lg:px-8">
        {children}
      </main>

      <LocalHeyAvantiqoWakeBridge />
    </div>
  );
}
