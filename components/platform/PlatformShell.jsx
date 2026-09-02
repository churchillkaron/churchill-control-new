"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import LocalHeyAvantiqoWakeBridge from "@/components/operator/LocalHeyAvantiqoWakeBridge";
import SecretaryMeetingPresenceBridge from "@/components/operator/SecretaryMeetingPresenceBridge";
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
  const pathname = usePathname();
  const [secretaryMeetingCaptureActive, setSecretaryMeetingCaptureActive] = useState(false);
  const businessPartnerHome = /^\/workspace\/[^/]+\/?$/.test(pathname || "");

  // This runs before the wake bridge mounts on the client. Older Avantiqo
  // templates were deliberately trained by the user but predate the later
  // verified_semantic metadata flag. Preserve that proven local training
  // instead of forcing every wake attempt through server transcription.
  restoreLegacyWakeTemplateTrust();

  useEffect(() => {
    function handleSecretaryMeetingCapture(event) {
      setSecretaryMeetingCaptureActive(event?.detail?.active === true);
    }

    window.addEventListener(
      "avantiqo:secretary-meeting-capture",
      handleSecretaryMeetingCapture,
    );
    return () => {
      window.removeEventListener(
        "avantiqo:secretary-meeting-capture",
        handleSecretaryMeetingCapture,
      );
    };
  }, []);

  return (
    <div
      className={
        businessPartnerHome
          ? "min-h-screen bg-[#F7F6F3] text-[#191919]"
          : "min-h-screen bg-black text-white"
      }
    >
      <WorkspaceTopBar />

      <main
        className={
          businessPartnerHome
            ? "min-h-[calc(100vh-112px)]"
            : "min-h-[calc(100vh-112px)] px-6 py-6 lg:px-8"
        }
      >
        {children}
      </main>

      <SecretaryMeetingPresenceBridge />
      {!secretaryMeetingCaptureActive && !businessPartnerHome ? (
        <LocalHeyAvantiqoWakeBridge />
      ) : null}
    </div>
  );
}
