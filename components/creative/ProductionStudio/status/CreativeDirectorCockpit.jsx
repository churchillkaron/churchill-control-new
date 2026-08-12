"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Layers3,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

const PHASES = [
  { id: "goal", label: "Goal" },
  { id: "plan", label: "Plan" },
  { id: "approve", label: "Approve" },
  { id: "produce", label: "Produce" },
  { id: "review", label: "Review" },
];

const PHASE_BY_STAGE = {
  MISSION_CREATED: "goal",
  UNDERSTANDING: "goal",
  RESEARCHING: "plan",
  BUILDING_STRATEGY: "plan",
  BUILDING_CONCEPT: "plan",
  WAITING_APPROVAL: "approve",
  BUILDING_STORYBOARD: "plan",
  PLANNING_PRODUCTION: "plan",
  READY_FOR_EXECUTION: "approve",
  EXECUTING: "produce",
  PRODUCING: "produce",
  RENDERING: "produce",
  REVIEWING: "review",
  PUBLISHING: "review",
  MONITORING: "review",
  LEARNING: "review",
  COMPLETED: "review",
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function amount(value) {
  return number(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function entries(value) {
  return Object.entries(
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {},
  );
}

function phaseIndex(stage) {
  const current = PHASE_BY_STAGE[String(stage || "").toUpperCase()] || "goal";
  return PHASES.findIndex((phase) => phase.id === current);
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/22 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] uppercase tracking-[0.22em] text-white/30">{label}</div>
        {Icon ? <Icon className="h-4 w-4 text-[#d5b56d]/50" /> : null}
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight text-white/88">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-white/30">{detail}</div> : null}
    </div>
  );
}

export default function CreativeDirectorCockpit({ runtime }) {
  const organizationId = runtime.organizationId;
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const pipelineStage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";

  const [dossier, setDossier] = useState(null);
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const dossierDocument = dossier?.metadata?.dossier || {};
  const cost = dossierDocument.cost || {};
  const summary = dossierDocument.generation_summary || {};
  const selectedConcept = dossierDocument.selected_concept || {};
  const checklist = dossierDocument.approval_checklist || {};
  const estimatedCost = number(
    cost.estimated_total ?? dossier?.metadata?.estimated_cost ?? dossier?.cost?.estimated,
  );
  const currency =
    cost.currency || dossier?.metadata?.currency || dossier?.cost?.currency || "";

  const activePhaseIndex = useMemo(
    () => phaseIndex(pipelineStage),
    [pipelineStage],
  );

  async function loadDossier() {
    if (!organizationId || !project?.id) {
      setDossier(null);
      setApproval(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        creative_project_id: project.id,
      });
      const response = await fetch(
        `/api/creative/production-dossier?${params.toString()}`,
        { cache: "no-store" },
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load production plan");
      }

      setDossier(result.dossier || null);
      setApproval(result.approval || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load production plan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDossier();
  }, [organizationId, project?.id]);

  useEffect(() => {
    if (dossier && !ceiling) setCeiling(String(estimatedCost));
  }, [dossier?.id, estimatedCost]);

  async function approvePlan() {
    if (!dossier?.id || working) return;

    const approvedCostCeiling = Number(ceiling);
    if (!Number.isFinite(approvedCostCeiling) || approvedCostCeiling < estimatedCost) {
      setError(
        `Approval ceiling must be at least ${currency ? `${currency} ` : ""}${amount(estimatedCost)}.`,
      );
      return;
    }

    setWorking("approve");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/creative/release/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          subject_asset_node_id: dossier.id,
          scope: "PRODUCTION_DOSSIER",
          approved_cost_ceiling: approvedCostCeiling,
          notes: "Approved from Creative Studio owner decision surface.",
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Production plan approval failed");
      }

      setMessage("Production plan approved. Provider execution is still a separate governed action.");
      await loadDossier();
      await runtime.refresh?.();
    } catch (approveError) {
      setError(approveError?.message || "Production plan approval failed");
    } finally {
      setWorking("");
    }
  }

  async function requestRevision() {
    if (!dossier?.id || working || !revisionFeedback.trim()) return;

    setWorking("revision");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/creative/release/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          subject_asset_node_id: dossier.id,
          scope: "PRODUCTION_DOSSIER",
          reason_code: "OWNER_REVISION_REQUESTED",
          feedback: revisionFeedback.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Revision request failed");
      }

      setRevisionOpen(false);
      setRevisionFeedback("");
      setMessage(
        "Revision request recorded as immutable Studio learning evidence. No provider execution was started.",
      );
      await runtime.refresh?.();
    } catch (revisionError) {
      setError(revisionError?.message || "Revision request failed");
    } finally {
      setWorking("");
    }
  }

  async function startProduction() {
    if (!approval || !project?.id || working) return;

    setWorking("produce");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/creative/run-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: project.id,
          creative_mission_id: mission?.id || undefined,
          workflow_kind: dossierDocument.workflow_kind || undefined,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.error || result.result?.reason || "Governed production could not start",
        );
      }

      setMessage(
        result.result?.status
          ? `Production control returned ${String(result.result.status).replaceAll("_", " ").toLowerCase()}.`
          : "Governed production started.",
      );
      await runtime.refresh?.();
      await loadDossier();
    } catch (productionError) {
      setError(productionError?.message || "Governed production could not start");
    } finally {
      setWorking("");
    }
  }

  return (
    <section className="border-b border-white/8 bg-[#050505] p-5 lg:p-7">
      <div className="overflow-hidden rounded-[28px] border border-[#d5b56d]/16 bg-[linear-gradient(135deg,rgba(213,181,109,0.055),rgba(255,255,255,0.018)_45%,rgba(116,92,255,0.035))]">
        <div className="border-b border-white/8 p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d5b56d]">
                <Sparkles className="h-3.5 w-3.5" />
                Director control
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
                Plan the work. Approve the commitment. Then produce.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/38">
                Studio can research, originate and plan autonomously. Paid or external execution remains locked to the exact approved dossier and cost ceiling.
              </p>
            </div>

            <div className="inline-flex items-center gap-3 rounded-2xl border border-emerald-300/13 bg-emerald-300/[0.045] px-4 py-3 text-xs text-emerald-100/70">
              <ShieldCheck className="h-4 w-4" />
              Human approval remains authoritative
            </div>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-1.5 rounded-2xl border border-white/7 bg-black/20 p-1.5">
            {PHASES.map((phase, index) => {
              const complete = index < activePhaseIndex;
              const active = index === activePhaseIndex;
              return (
                <div
                  key={phase.id}
                  className={`rounded-xl px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    active
                      ? "bg-[#d5b56d]/12 text-[#efd79e]"
                      : complete
                        ? "text-emerald-200/55"
                        : "text-white/22"
                  }`}
                >
                  {phase.label}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-white/35">Reading the current production dossier…</div>
        ) : dossier ? (
          <div className="space-y-5 p-5 lg:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Creative territory"
                value={selectedConcept.title || "Director selection"}
                detail={selectedConcept.selection_reason || "Selected by Creative direction."}
                icon={Sparkles}
              />
              <Metric
                label="Estimated cost"
                value={`${currency ? `${currency} ` : ""}${amount(estimatedCost)}`}
                detail="Immutable estimate in this dossier."
                icon={CircleDollarSign}
              />
              <Metric
                label="Production plan"
                value={`${summary.task_count ?? 0} tasks`}
                detail={`${summary.paid_or_external_task_count ?? 0} paid or external.`}
                icon={Layers3}
              />
              <Metric
                label="Readiness"
                value={checklist.passed === true ? "Passed" : "Blocked"}
                detail={`${dossierDocument.scenes?.length || 0} scenes · ${dossierDocument.deliverables?.length || 0} deliverables`}
                icon={ClipboardCheck}
              />
            </div>

            {entries(summary.by_provider).length || entries(summary.by_capability).length ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-white/7 bg-black/18 p-4">
                {entries(summary.by_capability).map(([capability, count]) => (
                  <span key={capability} className="rounded-full border border-white/8 bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/40">
                    {capability} · {count}
                  </span>
                ))}
                {entries(summary.by_provider).map(([provider, count]) => (
                  <span key={provider} className="rounded-full border border-[#d5b56d]/12 bg-[#d5b56d]/[0.035] px-3 py-1.5 text-[11px] text-[#d9c18c]/55">
                    {provider} · {count}
                  </span>
                ))}
              </div>
            ) : null}

            {!approval ? (
              <div className="grid gap-5 rounded-[24px] border border-amber-200/13 bg-amber-200/[0.035] p-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/50">Owner decision</div>
                  <div className="mt-2 text-lg font-semibold text-amber-50/90">Approve the exact production commitment or request a revision</div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/38">
                    Approval is bound to this dossier, production graph, execution plan and cost ceiling. A revision request becomes immutable learning evidence and does not start provider work.
                  </p>
                  <div className="mt-3 break-all text-[10px] text-white/20">
                    Dossier {dossier.metadata?.dossier_hash || dossier.id}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] uppercase tracking-[0.19em] text-white/30">
                    Maximum authorized cost {currency ? `(${currency})` : ""}
                  </label>
                  <input
                    type="number"
                    min={estimatedCost}
                    step="0.0001"
                    value={ceiling}
                    onChange={(event) => setCeiling(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3.5 py-3 text-sm text-white outline-none focus:border-[#d5b56d]/35"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRevisionOpen(true)}
                      disabled={Boolean(working)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs font-semibold text-white/55 transition hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-35"
                    >
                      <MessageSquareWarning className="h-3.5 w-3.5" />
                      Request revision
                    </button>
                    <button
                      type="button"
                      onClick={approvePlan}
                      disabled={working === "approve" || checklist.passed !== true}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d5b56d]/35 bg-[#d5b56d]/12 px-3 py-3 text-xs font-semibold text-[#efd79e] transition hover:bg-[#d5b56d]/20 disabled:opacity-35"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {working === "approve" ? "Approving…" : "Approve plan"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 rounded-[24px] border border-emerald-300/14 bg-emerald-300/[0.035] p-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-emerald-200/55">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approved production
                  </div>
                  <div className="mt-2 text-lg font-semibold text-emerald-50/90">Exact plan and cost ceiling are authorized</div>
                  <p className="mt-1 text-sm text-white/35">
                    Funding, wallet and service eligibility remain enforced when execution starts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startProduction}
                  disabled={working === "produce"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/22 bg-emerald-300/[0.075] px-5 py-3 text-sm font-semibold text-emerald-100/85 transition hover:bg-emerald-300/[0.12] disabled:opacity-35"
                >
                  {working === "produce" ? "Starting…" : "Start governed production"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <div className="rounded-2xl border border-white/8 bg-black/18 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/28">Director status</div>
              <div className="mt-2 text-lg font-semibold text-white/72">Production dossier is still being prepared</div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/34">
                Strategy, concept, storyboard or cost planning has not produced an approvable dossier yet. No execution commitment exists at this stage.
              </p>
            </div>
          </div>
        )}

        {message ? (
          <div className="border-t border-emerald-300/10 bg-emerald-300/[0.025] px-5 py-3 text-xs text-emerald-100/70 lg:px-6">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="border-t border-red-300/10 bg-red-300/[0.025] px-5 py-3 text-xs text-red-100/75 lg:px-6">
            {error}
          </div>
        ) : null}
      </div>

      {revisionOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[26px] border border-white/10 bg-[#0b0b0a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/55">Owner revision</div>
                <div className="mt-1 text-lg font-semibold text-white/88">What must Studio change?</div>
              </div>
              <button
                type="button"
                onClick={() => setRevisionOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.025] text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <textarea
                value={revisionFeedback}
                onChange={(event) => setRevisionFeedback(event.target.value)}
                maxLength={1200}
                rows={6}
                placeholder="Example: keep the core concept, but make the opening more emotionally immediate and remove the product close-up from scene two."
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-amber-200/25"
              />
              <div className="mt-2 text-[10px] leading-5 text-white/25">
                Feedback is stored as human preference evidence, not as a provider prompt or permission to lower quality standards.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
              <button
                type="button"
                onClick={() => setRevisionOpen(false)}
                className="rounded-xl border border-white/8 px-4 py-2.5 text-xs font-medium text-white/45 hover:text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestRevision}
                disabled={!revisionFeedback.trim() || working === "revision"}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-2.5 text-xs font-semibold text-amber-100/80 hover:bg-amber-200/[0.11] disabled:opacity-35"
              >
                {working === "revision" ? "Recording…" : "Record revision request"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
