"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Circle, CircleAlert, Disc3, Loader2, LockKeyhole, SlidersHorizontal } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function label(value) { return text(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase()); }

export default function MusicProfessionalReleasePanel({ organizationId, projectId, onOpen }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useCallback(async (payload) => {
    const response = await fetch("/api/creative/music/professional-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.error || "Professional Release unavailable");
    return result;
  }, []);
  const refresh = useCallback(async () => {
    if (!organizationId || !projectId) return;
    try { setError(""); setState(await request({ action: "status", organization_id: organizationId, creative_project_id: projectId })); }
    catch (cause) { setError(cause?.message || "Professional Release unavailable"); }
  }, [organizationId, projectId, request]);
  useEffect(() => { refresh(); }, [refresh]);

  const next = state?.next_stage || null;
  const stages = useMemo(() => next?.manifest?.stages || state?.professional_production_state?.manifest?.stages || [], [next, state]);
  if (!projectId || (!state?.active && !error)) return null;

  async function continueStage() {
    const stage = text(next?.stage_id);
    if (!stage) return;
    setBusy(true); setError("");
    try {
      const result = await request({ action: "continue", organization_id: organizationId, creative_project_id: projectId, source_asset_id: state?.source_asset_id, authorized_stage: stage });
      setState((current) => ({ ...current, ...result, active: true, source_title: current?.source_title }));
      await refresh();
    } catch (cause) { setError(cause?.message || "Professional Release stage failed"); }
    finally { setBusy(false); }
  }

  const stageId = text(next?.stage_id);
  const surface = text(next?.next_action?.execution_surface);
  const complete = state?.release_ready === true || next?.status === "COMPLETE";
  const vocalStage = stageId === "VOCAL_PRODUCTION";
  const workstationStage = stageId === "MIX_ENGINEERING" || surface === "WORKSTATION";

  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-[#D6A66A]/20 bg-[#11100E] text-white shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]"><Disc3 className="h-3.5 w-3.5" /> Professional Release</div>
          <div className="mt-2 text-[18px] font-medium tracking-[-0.025em] text-white/92">{state?.source_title || "Commercial music production"}</div>
          <div className="mt-1 text-[10px] text-white/42">Generation → stems → vocals → mix → QC → master → translation → dailies → tribunal</div>
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${complete ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-[#D6A66A]/25 bg-[#D6A66A]/[0.07] text-[#E5C69D]"}`}>
          {complete ? "Release candidate" : stageId ? label(stageId) : "Preparing"}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-9">
          {stages.map((stage) => {
            const active = stage.id === stageId && !complete;
            return <div key={stage.id} className={`rounded-xl border px-2.5 py-2.5 ${stage.passed ? "border-emerald-300/15 bg-emerald-300/[0.045]" : active ? "border-[#D6A66A]/35 bg-[#D6A66A]/[0.07]" : "border-white/7 bg-white/[0.018]"}`}>
              <div className="flex items-center gap-1.5">{stage.passed ? <BadgeCheck className="h-3 w-3 text-emerald-300/70" /> : <Circle className={`h-2.5 w-2.5 ${active ? "text-[#D6A66A]" : "text-white/18"}`} />}<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-white/52">{stage.order}</span></div>
              <div className="mt-1.5 text-[9px] leading-4 text-white/66">{stage.name}</div>
            </div>;
          })}
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/7 bg-white/[0.018] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">Current production gate</div>
            <div className="mt-1 text-[12px] font-medium text-white/78">{complete ? "Professional production passed" : next?.stage_name || label(stageId) || "No active stage"}</div>
            <div className="mt-1 text-[10px] text-white/34">{complete ? "Final tribunal passed. Publication remains separately authorized." : `${label(surface || "server")} · ${label(next?.next_action?.action || "continue")}`}</div>
          </div>
          {!complete ? <div className="flex flex-wrap gap-2">
            {vocalStage ? <button type="button" onClick={() => onOpen?.("vocal")} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] text-white/68 hover:border-[#D6A66A]/30">Open vocals</button> : null}
            {workstationStage ? <button type="button" onClick={() => onOpen?.("workstation")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] text-white/68 hover:border-[#D6A66A]/30"><SlidersHorizontal className="h-3 w-3" /> Open Workstation</button> : null}
            <button type="button" disabled={busy} onClick={continueStage} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3 py-2 text-[10px] font-semibold text-[#E5C69D] disabled:opacity-50">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LockKeyhole className="h-3 w-3" />}{workstationStage ? "Check rendered mix" : vocalStage ? "Prepare vocal review" : "Continue stage"}
            </button>
          </div> : null}
        </div>
        {error ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[9px] text-amber-100/70"><CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />{error}</div> : null}
      </div>
    </section>
  );
}
