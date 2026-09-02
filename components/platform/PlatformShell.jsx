"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import LocalHeyAvantiqoWakeBridge from "@/components/operator/LocalHeyAvantiqoWakeBridge";
import SecretaryMeetingPresenceBridge from "@/components/operator/SecretaryMeetingPresenceBridge";
import WorkspaceNavigationRail from "@/components/workspace/WorkspaceNavigationRail";
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

export default function PlatformShell({ children }) {
  const pathname = usePathname();
  const [secretaryMeetingCaptureActive, setSecretaryMeetingCaptureActive] = useState(false);
  const businessPartnerHome = /^\/workspace\/[^/]+\/?$/.test(pathname || "");
  const operationsWorkspace = /^\/workspace\/[^/]+\/operations(?:\/|$)/.test(pathname || "");

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
    <div className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <WorkspaceTopBar />

      <div className="flex min-h-[calc(100vh-61px)] items-start">
        <WorkspaceNavigationRail />

        <main
          data-avantiqo-operations-light={operationsWorkspace ? "true" : undefined}
          className={
            businessPartnerHome
              ? "min-w-0 flex-1"
              : "min-w-0 flex-1 px-5 py-5 lg:px-7 lg:py-6"
          }
        >
          {children}
        </main>
      </div>

      <SecretaryMeetingPresenceBridge />
      {!secretaryMeetingCaptureActive && !businessPartnerHome ? (
        <LocalHeyAvantiqoWakeBridge />
      ) : null}

      <style jsx global>{`
        [data-avantiqo-operations-light="true"] > main {
          min-height: 0 !important;
          padding-top: 0 !important;
          color: #191919 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="text-white"] {
          color: #2b2926 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="text-white/"] {
          color: #77736c !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="border-white"] {
          border-color: rgba(25, 25, 25, 0.08) !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="bg-black"] {
          background: #fbfaf8 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="bg-white/"] {
          background: #ffffff !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="shadow-black"] {
          --tw-shadow-color: rgba(31, 27, 20, 0.06) !important;
        }

        [data-avantiqo-operations-light="true"] > main input {
          color: #2b2926 !important;
        }

        [data-avantiqo-operations-light="true"] > main input::placeholder {
          color: #aaa69e !important;
        }
      `}</style>
    </div>
  );
}
