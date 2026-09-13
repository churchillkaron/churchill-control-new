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
  const financeWorkspace = /^\/workspace\/[^/]+\/finance(?:\/|$)/.test(pathname || "");

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
          data-avantiqo-finance-light={financeWorkspace ? "true" : undefined}
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
        [data-avantiqo-operations-light="true"] > main,
        main[data-avantiqo-finance-light="true"] {
          min-height: 0 !important;
          padding-top: 0 !important;
          color: #191919 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="text-white"],
        main[data-avantiqo-finance-light="true"] [class*="text-white"] {
          color: #2b2926 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="text-white/"],
        main[data-avantiqo-finance-light="true"] [class*="text-white/"] {
          color: #77736c !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="border-white"],
        main[data-avantiqo-finance-light="true"] [class*="border-white"] {
          border-color: rgba(25, 25, 25, 0.08) !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="bg-black"],
        main[data-avantiqo-finance-light="true"] [class*="bg-black"] {
          background: #fbfaf8 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="bg-white/"],
        main[data-avantiqo-finance-light="true"] [class*="bg-white/"] {
          background: #ffffff !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"],
        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"] {
          background: transparent !important;
          padding: 0 !important;
        }

        [data-avantiqo-operations-light="true"] > main [class*="shadow-black"],
        main[data-avantiqo-finance-light="true"] [class*="shadow-black"] {
          --tw-shadow-color: rgba(31, 27, 20, 0.06) !important;
        }

        main[data-avantiqo-finance-light="true"] h1 {
          color: #1b1a18 !important;
          font-size: clamp(1.8rem, 3vw, 2.25rem) !important;
          font-weight: 600 !important;
          letter-spacing: -0.04em !important;
        }

        main[data-avantiqo-finance-light="true"] h2,
        main[data-avantiqo-finance-light="true"] h3 {
          color: #292723 !important;
        }

        [data-avantiqo-operations-light="true"] > main input,
        main[data-avantiqo-finance-light="true"] input {
          color: #2b2926 !important;
        }

        [data-avantiqo-operations-light="true"] > main input::placeholder,
        main[data-avantiqo-finance-light="true"] input::placeholder {
          color: #aaa69e !important;
        }

        main[data-avantiqo-finance-light="true"] table {
          color: #4d4942 !important;
        }

        main[data-avantiqo-finance-light="true"] thead,
        main[data-avantiqo-finance-light="true"] tfoot {
          background: #faf9f7 !important;
          color: #77736c !important;
        }

        /* Finance record explorer: preserve the proven execution engine but remove
           controls that are not wired and make the working surface accountant-dense. */
        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > div[class*="xl:grid-cols-[1fr_410px]"] {
          gap: 12px !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > div[class*="xl:grid-cols-[1fr_410px]"]
          > section
          > div:first-child
          > div:last-child {
          display: none !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > section[class*="grid"] {
          gap: 10px !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > section[class*="grid"]
          > div {
          border-radius: 16px !important;
          padding: 16px !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > div[class*="xl:grid-cols-[1fr_410px]"]
          > aside {
          position: sticky !important;
          top: 76px !important;
          max-height: calc(100dvh - 96px) !important;
          overflow: auto !important;
          border-radius: 20px !important;
        }

        main[data-avantiqo-finance-light="true"][class*="bg-[#050505]"]
          > div
          > div[class*="xl:grid-cols-[1fr_410px]"]
          > section {
          border-radius: 20px !important;
        }
      `}</style>
    </div>
  );
}
