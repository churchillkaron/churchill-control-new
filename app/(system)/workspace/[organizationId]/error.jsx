"use client";

import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import PlatformFailureCaptureBeacon from "@/components/platform/self-healing/PlatformFailureCaptureBeacon";

export default function WorkspaceErrorBoundary({ error, reset }) {
  const reference = String(error?.digest || "").trim();

  return (
    <main className="relative flex min-h-[calc(100vh-61px)] items-center justify-center overflow-hidden bg-[#F7F6F3] px-6 py-14 text-[#191919]">
      <PlatformFailureCaptureBeacon
        category="runtime_exception"
        errorMessage={error?.message || "Unknown workspace error"}
        digest={error?.digest || null}
        action="render organization workspace"
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(214,166,106,0.10),transparent_36%)]" />
      <section
        data-avantiqo-workspace-error="true"
        className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_12px_40px_rgba(50,39,27,0.055)]"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A]/65 to-transparent" />
        <div className="px-7 py-8 sm:px-9 sm:py-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] text-[#9A744B]">
            <AlertTriangle size={19} strokeWidth={1.6} />
          </div>

          <div className="mt-6 text-[10px] uppercase tracking-[0.22em] text-[#9A744B]/70">
            Avantiqo workspace
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-[-0.025em] text-[#1A1917]">
            This workspace needs a quick recovery
          </h1>
          <p className="mt-3 max-w-lg text-sm font-light leading-6 text-[#6C6963]">
            Your request was stopped safely. Retry the workspace first; if the issue was temporary, Avantiqo will continue normally without exposing internal error details.
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D6A66A]/45 bg-[#FBF7F1] px-4 py-2.5 text-xs font-medium text-[#76583A] transition hover:border-[#D6A66A]/65 hover:bg-[#F7F0E7]"
            >
              <RefreshCw size={14} strokeWidth={1.7} />
              Retry workspace
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-xs text-[#6C6963] transition hover:border-black/[0.13] hover:text-[#3F3B36]"
            >
              <RotateCcw size={14} strokeWidth={1.7} />
              Reload
            </button>
          </div>

          {reference ? (
            <div className="mt-7 border-t border-black/[0.06] pt-4 text-[11px] text-[#AAA69E]">
              Recovery reference <span className="font-mono text-[#8A867F]">{reference}</span>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
