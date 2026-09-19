"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { useCodeProgressFeed } from "@/components/operator/CodeProgressFeedProvider";

const STAGES = [
  { key: "understand", label: "Understand" },
  { key: "inspect", label: "Inspect" },
  { key: "change", label: "Change" },
  { key: "verify", label: "Verify" },
];

function text(value) {
  return String(value ?? "").trim();
}

function currentStage(progress) {
  const phase = text(progress?.engineering_plan?.current_phase || progress?.latest_event?.phase || progress?.state_status).toLowerCase();
  const files = Array.isArray(progress?.files_changed) ? progress.files_changed : [];
  if (progress?.latest_verification_passed !== null && progress?.latest_verification_passed !== undefined) return "verify";
  if (/verif|test|accept|review|proof|quality/.test(phase)) return "verify";
  if (files.length || /implement|edit|repair|change|patch|write|mutation/.test(phase)) return "change";
  if (/inspect|research|discover|read|scan|analy|evidence|repository|diagnos/.test(phase)) return "inspect";
  return "understand";
}
function stageState(stage, current, active, verified) {
  const order = STAGES.map((item) => item.key);
  const stageIndex = order.indexOf(stage);
  const currentIndex = order.indexOf(current);
  if (stage === "verify" && verified === true) return "done";
  if (!active && verified === true) return "done";
  if (stageIndex < currentIndex) return "done";
  if (stage === current) return active ? "active" : "current";
  return "pending";
}

function tone(state) {
  if (state === "done") return "border-emerald-700/15 bg-emerald-50 text-emerald-700";
  if (state === "active") return "border-[#9A744B]/25 bg-[#D6A66A]/10 text-[#8B663E]";
  if (state === "current") return "border-black/[0.1] bg-white text-[#59534C]";
  return "border-black/[0.06] bg-white/60 text-[#AAA59D]";
}

export default function CodeMissionStageRail() {
  const { progress, active } = useCodeProgressFeed();
  if (!progress?.mission_id) return null;

  const current = currentStage(progress);
  const verified = progress?.latest_verification_passed === true;
  const plan = progress?.engineering_plan || {};
  const priority = text(plan.current_priority || progress?.latest_event?.description);
  return (
    <section
      data-avantiqo-code-stage-rail="true"
      className="border-b border-black/[0.07] bg-white px-5 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8B663E]">Engineering activity</div>
        <div className="text-[9px] text-[#9A958D]">Observable work · no private reasoning</div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {STAGES.map((stage) => {
          const state = stageState(stage.key, current, active, verified);
          return (
            <div key={stage.key} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[9px] font-medium ${tone(state)}`}>
              {state === "done" ? <Check size={10} /> : state === "active" ? <Loader2 size={10} className="animate-spin" /> : <Circle size={9} />}
              <span>{stage.label}</span>
            </div>
          );
        })}
      </div>
      {priority ? <div className="mt-2 truncate text-[10px] leading-4 text-[#6F6A63]" title={priority}>Now: {priority}</div> : null}
    </section>
  );
}
