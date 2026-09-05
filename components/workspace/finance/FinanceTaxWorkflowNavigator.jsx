"use client";

import { AlertTriangle, FileCheck2, Landmark, ReceiptText } from "lucide-react";

const STAGES = [
  {
    id: "RETURN",
    eyebrow: "Return",
    title: "Prepare & record filing",
    description: "Create the obligation, verify the statutory deadline, calculate from governed evidence and record the authority submission.",
    icon: FileCheck2,
  },
  {
    id: "FIX",
    eyebrow: "Fix issues",
    title: "Clear the next blocker",
    description: "Work the highest-risk accounting dependency first, with ownership, client evidence and deterministic resolution proof.",
    icon: AlertTriangle,
  },
  {
    id: "EVIDENCE",
    eyebrow: "Evidence",
    title: "Prove every VAT number",
    description: "Drill from the filing result to the exact invoice, journal or governed tax rule without changing business context.",
    icon: ReceiptText,
  },
  {
    id: "AFTER",
    eyebrow: "After filing",
    title: "Amend & settle",
    description: "Keep the filed return immutable, govern corrections, post the VAT liability and prove cash through bank settlement.",
    icon: Landmark,
  },
];

export default function FinanceTaxWorkflowNavigator({ activeStage, onStageChange, selectedVatReturnId }) {
  return (
    <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
        <div className="flex flex-col gap-2 border-b border-black/[0.07] px-3.5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">VAT work path</div>
            <div className="mt-0.5 text-[10px] text-[#777169]">One filing context. One clear job at a time. Accounting truth stays server-authoritative across every view.</div>
          </div>
          <div className="rounded-md border border-black/[0.07] bg-[#F7F6F3] px-2.5 py-1.5 text-[8px] text-[#716B63]">
            {selectedVatReturnId ? <><span className="font-semibold text-[#4A453F]">Selected filing</span> · <span className="font-mono">{String(selectedVatReturnId).slice(0, 12)}{String(selectedVatReturnId).length > 12 ? "…" : ""}</span></> : "Choose or create a filing in Return to begin."}
          </div>
        </div>

        <nav aria-label="VAT work path" className="grid gap-px bg-black/[0.05] md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const active = activeStage === stage.id;
            const disabled = !selectedVatReturnId && stage.id !== "RETURN";
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onStageChange?.(stage.id)}
                className={`group min-h-[108px] bg-white p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "shadow-[inset_0_-2px_0_#9A7045]" : "hover:bg-[#FAF9F7]"}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-[#A37849]/20 bg-[#FFF9F0] text-[#8C6036]" : "border-black/[0.07] bg-[#F7F6F3] text-[#777169]"}`}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#9A7045]"><span>{index + 1}</span><span>{stage.eyebrow}</span>{active ? <span className="rounded-full border border-[#A37849]/15 bg-[#FFF9F0] px-1.5 py-0.5 text-[7px] tracking-normal text-[#76583A]">Working here</span> : null}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-[#37332F]">{stage.title}</span>
                    <span className="mt-1 block text-[8px] leading-4 text-[#817B73]">{stage.description}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2 text-[8px] leading-4 text-[#817B73]">Recommended sequence: prepare the return → clear live blockers → inspect source proof → record filing → settle the liability. Ownership, client requests and AI guidance never substitute for live accounting evidence.</div>
      </div>
    </section>
  );
}
