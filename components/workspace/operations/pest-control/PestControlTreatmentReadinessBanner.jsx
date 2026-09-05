"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Beaker, CheckCircle2, Clock3 } from "lucide-react";

const TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
const ACTIVE = new Set(["start", "started", "in_progress"]);

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function terminal(row) { return TERMINAL.has(normalized(row?.work_order_status)) || TERMINAL.has(normalized(row?.occurrence_status)); }
function started(row) { return ACTIVE.has(normalized(row?.work_order_status)) || Boolean(row?.staff_execution?.started_at) || Boolean(row?.staff_execution?.started?.at); }

export default function PestControlTreatmentReadinessBanner({ organizationId, occurrenceId = "", workOrderId = "" }) {
  const [state, setState] = useState({ loading: true, error: "", row: null });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment readiness could not be loaded.");
      const rows = Array.isArray(json.rows) ? json.rows : [];
      const requested = rows.find((row) => (occurrenceId && row.occurrence_id === occurrenceId) || (workOrderId && row.work_order_id === workOrderId)) || null;
      const row = requested || rows.find((item) => !terminal(item)) || rows[0] || null;
      setState({ loading: false, error: "", row });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Treatment readiness could not be loaded.", row: null });
    }
  }, [occurrenceId, organizationId, workOrderId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const presentation = useMemo(() => {
    const row = state.row;
    if (!row) return null;
    const visitStarted = started(row);
    const visitTerminal = terminal(row);
    const readiness = row.treatment_readiness || null;
    if (visitTerminal) return { label: "Treatment archived with visit", tone: "ready", detail: "The canonical treatment record is read-only after service completion." };
    if (!visitStarted) return { label: "Treatment unlocks after arrival", tone: "waiting", detail: "Confirm arrival first. Findings and applications stay locked until this exact occurrence starts." };
    if (readiness?.ready) return { label: "Canonical treatment ready", tone: "ready", detail: `${readiness.finding_count || 0} finding${Number(readiness.finding_count || 0) === 1 ? "" : "s"} · ${readiness.application_count || 0} application${Number(readiness.application_count || 0) === 1 ? "" : "s"} · completion gate passed.` };
    return { label: "Treatment needs attention", tone: "blocked", detail: readiness?.issues?.[0] || "Open Inspect, treat & prove and save the canonical treatment record before completion." };
  }, [state.row]);

  if (!state.loading && !state.error && !state.row) return null;
  const treatmentHref = state.row?.occurrence_id ? `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatment/${encodeURIComponent(state.row.occurrence_id)}` : null;
  const ready = presentation?.tone === "ready";
  const blocked = presentation?.tone === "blocked";

  return (
    <div className="border-b border-black/[0.06] bg-[#F7F6F3] px-4 pt-4 md:px-7 lg:px-9">
      <div className={`mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${ready ? "border-[#748267]/18 bg-[#748267]/[0.045]" : blocked ? "border-[#C08A4A]/24 bg-[#C08A4A]/[0.05]" : "border-black/[0.07] bg-white"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ready ? "bg-[#748267]/10 text-[#607057]" : blocked ? "bg-[#D6A66A]/12 text-[#8A6742]" : "bg-[#F2EFEA] text-[#827B72]"}`}>{ready ? <CheckCircle2 size={13} /> : blocked ? <AlertTriangle size={13} /> : <Clock3 size={13} />}</span>
          <div className="min-w-0"><div className="flex items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.11em] text-[#8F877E]"><Beaker size={9} /> Live treatment gate</div><div className={`mt-0.5 text-[10px] font-medium ${ready ? "text-[#607057]" : blocked ? "text-[#76583A]" : "text-[#5E5952]"}`}>{state.loading ? "Checking canonical treatment…" : state.error ? "Treatment gate unavailable" : presentation?.label}</div><div className="mt-0.5 max-w-4xl text-[8px] leading-4 text-[#8D867E]">{state.error || presentation?.detail || ""}</div></div>
        </div>
        {treatmentHref ? <Link href={treatmentHref} className={`shrink-0 rounded-lg border bg-white px-3 py-2 text-[9px] font-medium ${ready ? "border-[#748267]/18 text-[#607057]" : "border-[#D6A66A]/25 text-[#76583A]"}`}>{ready ? "Review treatment" : started(state.row) ? "Open treatment" : "View treatment gate"}</Link> : null}
      </div>
    </div>
  );
}
