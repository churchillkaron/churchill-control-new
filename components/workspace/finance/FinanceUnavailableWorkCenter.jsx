"use client";

import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";

function statusLabel(value) {
  const status = String(value || "planned").trim().toLowerCase();
  if (status === "blocked") return "Blocked";
  if (status === "partial") return "Partial";
  if (status === "unproven") return "Unproven";
  if (status === "disabled" || status === "unavailable") return "Unavailable";
  return "Planned";
}

export default function FinanceUnavailableWorkCenter({ capability }) {
  const state = statusLabel(capability?.status);
  const presentation = capability?.ui?.financePresentation || capability?.runtime?.financePresentation || {};

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5 lg:px-6">
        <header className="border-b border-black/[0.07] pb-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
            Finance / {presentation.family_label || "Capability"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-[29px] font-semibold tracking-[-0.035em]">
              {capability?.name || "Finance workspace"}
            </h1>
            <span className="rounded-full border border-amber-700/15 bg-amber-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-800">
              {state}
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-[#777169]">
            {capability?.description || "This Finance capability is not available for production use yet."}
          </p>
        </header>

        <section className="mt-4 max-w-4xl rounded-xl border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B18150]/15 bg-[#B18150]/[0.06] text-[#9A7045]">
              <LockKeyhole size={15} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#37332E]">Not presented as completed work</div>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#777169]">
                Avantiqo keeps this capability visible but does not imitate a working accounting screen until its data contract, governed actions and end-to-end evidence are available. This prevents accountants from relying on controls that are only decorative.
              </p>
              {presentation.review_label ? (
                <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-3 py-2 text-[10px] text-[#817B73]">
                  Intended workflow: {presentation.review_label}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 border-t border-black/[0.06] pt-4">
            <Link
              href="../finance"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#575149] transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.04]"
            >
              <ArrowLeft size={13} /> Back to Finance
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
