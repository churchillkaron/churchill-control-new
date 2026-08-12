"use client";

import { useEffect, useMemo, useState } from "react";

function Stat({ title, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 text-[11px] uppercase tracking-[0.28em] text-[#c8a96a]">
        {title}
      </div>
      {children}
    </section>
  );
}

function MetricRows({ metrics = {} }) {
  const rows = Object.entries(metrics).slice(0, 8);
  if (!rows.length) {
    return <div className="text-sm text-white/45">No verified performance metrics yet.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-center justify-between gap-4">
          <span className="text-sm text-white/45">{name.replaceAll("_", " ")}</span>
          <span className="text-sm font-medium text-white/90">
            {Number(value.average || 0).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            <span className="ml-2 text-xs text-white/35">n={value.count || 0}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DecisionRows({ decisions = [] }) {
  if (!decisions.length) {
    return <div className="text-sm text-white/45">No authenticated Creative decisions yet.</div>;
  }

  return (
    <div className="space-y-3">
      {decisions.slice(0, 6).map((decision) => (
        <div key={decision.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white/85">
              {decision.decision === "REJECTED" ? "Revision requested" : "Approved"}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
              {(decision.scope || "Creative").replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-1 text-xs text-white/40">
            {(decision.reason_code || "OWNER_DECISION").replaceAll("_", " ")}
          </div>
          {decision.feedback ? (
            <div className="mt-2 text-sm leading-5 text-white/60">{decision.feedback}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function LearningWorkspace({ runtime }) {
  const project = runtime.projectRuntime?.current || {};
  const production = runtime.productionRuntime?.items || [];
  const publishing = runtime.publishingRuntime?.items || [];
  const assets = runtime.assetRuntime?.items || [];
  const organizationId = runtime.organizationId || null;
  const [learning, setLearning] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!organizationId || !project.id) return;
      const params = new URLSearchParams({
        organization_id: organizationId,
        creative_project_id: project.id,
      });
      if (project.brand_id) params.set("brand_id", project.brand_id);
      if (project.campaign_id) params.set("campaign_id", project.campaign_id);

      try {
        const response = await fetch(`/api/creative/outcome-learning?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || "Creative learning unavailable");
        }
        if (active) {
          setLearning(payload);
          setError(null);
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || String(loadError));
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [organizationId, project.id, project.brand_id, project.campaign_id]);

  const summary = learning?.summary || learning?.current || {};
  const outcomes = summary.outcomes || {};
  const human = summary.human_decisions || {};
  const channelCount = useMemo(
    () => Object.keys(outcomes.channels || {}).length,
    [outcomes.channels],
  );

  return (
    <div className="h-full overflow-auto p-8 text-white">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Learning Center
        </div>
        <div className="mt-2 text-3xl font-semibold">Creative Intelligence</div>
        <div className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
          Studio learns from verified released outcomes and authenticated owner decisions.
          Evidence informs fresh creative judgment; it never becomes a hidden prompt, lowers
          the world-class quality floor, or bypasses rights and approval controls.
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">
        <Stat title="Verified Outcomes" value={outcomes.direction_eligible_count || 0} />
        <Stat title="Human Decisions" value={human.decision_count || 0} />
        <Stat title="Revisions" value={human.rejection_count || 0} />
        <Stat title="Channels" value={channelCount} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Why Studio Will Decide This Way">
          {error ? (
            <div className="text-sm text-red-300/80">{error}</div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-medium text-white/90">
                {(summary.decision_explanation?.status || "LOADING")
                  .replaceAll("_", " ")
                  .toLowerCase()}
              </div>
              <div className="text-sm leading-6 text-white/50">
                {summary.decision_explanation?.reason ||
                  "Loading current Creative learning evidence."}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                Fresh creative judgment remains mandatory. Past winners may inform direction,
                but Studio may not imitate prior work or optimize below the fixed quality floor.
              </div>
            </div>
          )}
        </Card>

        <Card title="Observed Performance">
          <MetricRows metrics={outcomes.metrics || {}} />
        </Card>

        <Card title="Owner Decision Evidence">
          <DecisionRows decisions={learning?.human_decisions || human.latest_decisions || []} />
        </Card>

        <Card title="Evidence Summary">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Approvals</span>
              <span>{human.approval_count || 0}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Revision requests</span>
              <span>{human.rejection_count || 0}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Published evidence</span>
              <span>{outcomes.direction_eligible_count || 0}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Publishing jobs</span>
              <span>{publishing.length}</span>
            </div>
          </div>
        </Card>

        <Card title="Governance">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Quality floor</span>
              <span>Immutable</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Human feedback</span>
              <span>Evidence, not instruction</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Provider prompts</span>
              <span>Not persisted</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Prior-work imitation</span>
              <span>Forbidden</span>
            </div>
          </div>
        </Card>

        <Card title="Operational Context">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Production jobs</span>
              <span>{production.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Asset library</span>
              <span>{assets.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Learning execution</span>
              <span>Deterministic / no provider call</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
