"use client";

import { useEffect, useMemo, useState } from "react";

function Stat({ title, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>
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
    return (
      <div className="text-sm text-white/45">
        No verified performance metrics yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-center justify-between gap-4">
          <span className="text-sm text-white/45">
            {name.replaceAll("_", " ")}
          </span>
          <span className="text-sm font-medium text-white/90">
            {Number(value.average || 0).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            <span className="ml-2 text-xs text-white/35">
              n={value.count || 0}
            </span>
          </span>
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
      if (!organizationId) return;
      const params = new URLSearchParams({ organization_id: organizationId });
      if (project.id) params.set("creative_project_id", project.id);

      try {
        const response = await fetch(`/api/creative/outcome-learning?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || "Outcome learning unavailable");
        }
        if (active) {
          setLearning(payload.summary || payload.current || null);
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
  }, [organizationId, project.id]);

  const channelCount = useMemo(
    () => Object.keys(learning?.channels || {}).length,
    [learning],
  );
  const evidenceCount = learning?.direction_eligible_count || 0;
  const awaitingEvidence =
    !learning || learning.evidence_status === "AWAITING_PUBLISHED_OUTCOMES";

  return (
    <div className="h-full overflow-auto p-8 text-white">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Learning Center
        </div>
        <div className="mt-2 text-3xl font-semibold">
          Outcome Intelligence
        </div>
        <div className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
          Verified publication results inform future creative judgment. They never lower
          the world-class quality floor, rights controls, release approval, or provider governance.
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">
        <Stat title="Verified Outcomes" value={evidenceCount} />
        <Stat title="Channels" value={channelCount} />
        <Stat title="Production" value={production.length} />
        <Stat title="Assets" value={assets.length} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Learning Status">
          {error ? (
            <div className="text-sm text-red-300/80">{error}</div>
          ) : awaitingEvidence ? (
            <div className="space-y-3">
              <div className="text-lg font-medium text-white/90">
                Awaiting published outcomes
              </div>
              <div className="text-sm leading-6 text-white/50">
                The Studio has no verified publication evidence for this project yet.
                Fresh creative judgment remains in control; no synthetic performance assumptions are made.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-medium text-white/90">
                Verified evidence available
              </div>
              <div className="text-sm leading-6 text-white/50">
                {evidenceCount} immutable outcome observation{evidenceCount === 1 ? "" : "s"}
                {learning.latest_observed_at
                  ? `, latest ${new Date(learning.latest_observed_at).toLocaleString()}.`
                  : "."}
              </div>
              {learning.future_direction?.insufficient_evidence_requires_fresh_judgment && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                  Evidence is still sparse. The Director may consider it, but must originate fresh direction rather than optimize around a weak sample.
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Observed Performance">
          <MetricRows metrics={learning?.metrics || {}} />
        </Card>

        <Card title="Governance">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Quality floor</span>
              <span>Immutable</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Rights gate</span>
              <span>Cannot be bypassed</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Publish approval</span>
              <span>Cannot be bypassed</span>
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
              <span className="text-white/45">Publishing jobs</span>
              <span>{publishing.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/45">Evidence source</span>
              <span>Released external publications</span>
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
