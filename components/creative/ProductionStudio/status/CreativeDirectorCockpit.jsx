"use client";

import { useEffect, useMemo, useState } from "react";

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
  RESEARCHING: "goal",
  BUILDING_STRATEGY: "goal",
  BUILDING_CONCEPT: "goal",
  WAITING_APPROVAL: "plan",
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

function Label({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
      {children}
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <Label>{label}</Label>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      {detail ? (
        <div className="mt-1 text-xs leading-relaxed text-white/40">
          {detail}
        </div>
      ) : null}
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

  const dossierDocument = dossier?.metadata?.dossier || {};
  const cost = dossierDocument.cost || {};
  const summary = dossierDocument.generation_summary || {};
  const selectedConcept = dossierDocument.selected_concept || {};
  const checklist = dossierDocument.approval_checklist || {};
  const estimatedCost = number(
    cost.estimated_total ??
      dossier?.metadata?.estimated_cost ??
      dossier?.cost?.estimated,
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
    if (dossier && !ceiling) {
      setCeiling(String(estimatedCost));
    }
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
          notes: "Approved from Creative Director cockpit.",
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Production plan approval failed");
      }

      setMessage("Exact production plan and cost ceiling approved. No provider execution was started by this approval.");
      await loadDossier();
      await runtime.refresh?.();
    } catch (approveError) {
      setError(approveError?.message || "Production plan approval failed");
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
          result.error ||
            result.result?.reason ||
            "Governed production could not start",
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
    <section className="border-b border-white/10 bg-gradient-to-b from-[#0c0b09] to-[#050505] p-6 lg:p-8">
      <div className="rounded-[28px] border border-[#c8a96a]/20 bg-white/[0.035] p-5 shadow-2xl shadow-black/30 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.30em] text-[#d8ba7a]">
              Creative Director
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
              Goal → Plan → Approve → Produce → Review
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
              Avantiqo can research, plan and prepare production autonomously. Paid or external provider execution stays locked until the exact production dossier and cost ceiling are approved.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3 text-xs leading-relaxed text-emerald-100/80">
            <div className="font-semibold text-emerald-200">Governed execution</div>
            <div className="mt-1">Approval does not automatically start provider work.</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2">
          {PHASES.map((phase, index) => {
            const complete = index < activePhaseIndex;
            const active = index === activePhaseIndex;
            return (
              <div
                key={phase.id}
                className={`rounded-xl border px-3 py-3 text-center text-xs font-medium transition ${
                  active
                    ? "border-[#d8ba7a]/45 bg-[#d8ba7a]/10 text-[#efd99f]"
                    : complete
                      ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200/75"
                      : "border-white/8 bg-black/20 text-white/30"
                }`}
              >
                <div className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-1">{phase.label}</div>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/40">
            Loading the current production plan…
          </div>
        ) : dossier ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Selected concept"
                value={selectedConcept.title || "Director selection"}
                detail={selectedConcept.selection_reason || "Selected by the creative planning system."}
              />
              <Metric
                label="Estimated provider cost"
                value={`${currency ? `${currency} ` : ""}${amount(estimatedCost)}`}
                detail="Exact estimate captured in the immutable dossier."
              />
              <Metric
                label="Production tasks"
                value={summary.task_count ?? 0}
                detail={`${summary.paid_or_external_task_count ?? 0} paid or external task(s).`}
              />
              <Metric
                label="Approval checks"
                value={checklist.passed === true ? "Passed" : "Blocked"}
                detail={`${dossierDocument.scenes?.length || 0} scene(s) · ${dossierDocument.deliverables?.length || 0} deliverable(s)`}
              />
            </div>

            {entries(summary.by_provider).length || entries(summary.by_capability).length ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <Label>Execution plan</Label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entries(summary.by_provider).map(([provider, count]) => (
                    <span
                      key={`provider-${provider}`}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60"
                    >
                      {provider} · {count}
                    </span>
                  ))}
                  {entries(summary.by_capability).map(([capability, count]) => (
                    <span
                      key={`capability-${capability}`}
                      className="rounded-full border border-[#c8a96a]/15 bg-[#c8a96a]/[0.05] px-3 py-1.5 text-xs text-[#dfc98e]/75"
                    >
                      {capability} · {count}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {!approval ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div className="max-w-3xl">
                    <Label>Owner decision</Label>
                    <div className="mt-2 text-lg font-semibold text-amber-100">
                      Approve this exact plan before production can execute
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/45">
                      The approval is bound to the current dossier, plan, graph and execution hashes. If the plan changes, a fresh approval is required.
                    </p>
                    <div className="mt-3 break-all text-[10px] text-white/25">
                      Dossier {dossier.metadata?.dossier_hash || dossier.id}
                    </div>
                  </div>

                  <div className="w-full max-w-sm">
                    <label className="block text-[10px] uppercase tracking-[0.20em] text-white/35">
                      Maximum authorized cost {currency ? `(${currency})` : ""}
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={estimatedCost}
                        step="0.0001"
                        value={ceiling}
                        onChange={(event) => setCeiling(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none focus:border-[#c8a96a]/45"
                      />
                      <button
                        type="button"
                        onClick={approvePlan}
                        disabled={working === "approve" || checklist.passed !== true}
                        className="rounded-xl border border-[#c8a96a]/40 bg-[#c8a96a]/15 px-4 py-3 text-sm font-semibold text-[#efd99f] transition hover:bg-[#c8a96a]/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {working === "approve" ? "Approving…" : "Approve plan"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <Label>Approved production</Label>
                    <div className="mt-2 text-lg font-semibold text-emerald-200">
                      Exact plan and cost ceiling are authorized
                    </div>
                    <p className="mt-2 text-sm text-white/45">
                      Starting production is a separate action. Provider funding, wallet and service eligibility checks still apply at execution time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startProduction}
                    disabled={working === "produce"}
                    className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {working === "produce" ? "Starting…" : "Start governed production"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            <Label>Director status</Label>
            <div className="mt-2 text-lg font-semibold text-white/80">
              Production dossier not ready yet
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/40">
              Avantiqo is still building the strategy, concept, storyboard or production plan. No dossier approval is available until the planning evidence and cost estimate pass validation.
            </p>
          </div>
        )}

        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3 text-sm text-emerald-200/80">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200/85">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
