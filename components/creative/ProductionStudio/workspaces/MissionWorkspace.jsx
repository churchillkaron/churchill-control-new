"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarRange,
  Clapperboard,
  Coins,
  Globe2,
  Layers3,
  Megaphone,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";

function statusLabel(value) {
  return String(value || "draft")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">{label}</div>
        {Icon ? <Icon className="h-4 w-4 text-[#d5b56d]/55" /> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-white/90">{value}</div>
      {detail ? <div className="mt-1 text-xs text-white/30">{detail}</div> : null}
    </div>
  );
}

export default function MissionWorkspace({ runtime, editor }) {
  const mission = runtime.missionRuntime?.current || null;
  const projects = runtime.projectRuntime?.items || [];
  const assets = runtime.assetRuntime?.items || [];
  const tasks = runtime.taskRuntime?.items || [];
  const activeProject = runtime.projectRuntime?.current || null;

  const [businessGoal, setBusinessGoal] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [budget, setBudget] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const composerOpen = Boolean(editor.missionComposerOpen);
  const canCreate = Boolean(businessGoal.trim() && desiredOutcome.trim() && !working);

  const missionChannels = useMemo(
    () => (Array.isArray(mission?.channels) ? mission.channels : []),
    [mission?.channels],
  );

  async function createMission(event) {
    event.preventDefault();
    if (!canCreate || !runtime.organizationId) return;

    setWorking(true);
    setError("");

    try {
      const numericBudget = Number(budget);
      const response = await fetch("/api/creative/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          title: businessGoal.trim().slice(0, 120),
          business_goal: businessGoal.trim(),
          objective: desiredOutcome.trim(),
          status: "draft",
          metadata: {
            source: "studio_outcome_first_mission_composer",
            budget_ceiling:
              budget.trim() && Number.isFinite(numericBudget) && numericBudget >= 0
                ? numericBudget
                : null,
            budget_currency_source: "ORGANIZATION_CONFIGURATION",
            desired_outcome: desiredOutcome.trim(),
            creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
            publication_requires_human_approval: true,
            production_dossier_approval_required: true,
            promptless_input: true,
          },
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.mission) {
        throw new Error(result.error || "Mission creation failed");
      }

      editor.closeMissionComposer?.();
      setBusinessGoal("");
      setDesiredOutcome("");
      setBudget("");
      await runtime.refresh?.();
    } catch (createError) {
      setError(createError?.message || "Mission creation failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="min-h-full bg-[#050505] text-white">
      <section className="relative overflow-hidden border-b border-white/8 px-6 py-8 lg:px-10 lg:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(213,181,109,0.09),transparent_34%),radial-gradient(circle_at_80%_15%,rgba(107,88,255,0.07),transparent_30%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d5b56d]">
              <Sparkles className="h-3.5 w-3.5" />
              Mission control
            </div>
            <h2 className="mt-4 max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-white lg:text-5xl">
              {mission?.business_goal || "Give Studio a business objective. It decides how to solve it."}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/42 lg:text-base">
              {mission?.objective ||
                "Set the business outcome and commercial constraints. Avantiqo resolves the creative strategy, media mix, production capabilities and governed approval points from organization evidence."}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {missionChannels.length ? (
                missionChannels.map((channel) => (
                  <span
                    key={channel}
                    className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/45"
                  >
                    {channel}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/35">
                  Media and channels resolved from mission context
                </span>
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-[#d5b56d]/16 bg-[#d5b56d]/[0.045] p-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#d5b56d]/65">Current control state</div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white/90">{statusLabel(mission?.status)}</div>
                <div className="mt-1 text-xs text-white/35">
                  {runtime.stateRuntime?.current?.stage
                    ? statusLabel(runtime.stateRuntime.current.stage)
                    : "Ready for direction"}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d5b56d]/20 bg-black/20">
                <Target className="h-5 w-5 text-[#e2c681]" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => editor.openMissionComposer?.()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d5b56d]/30 bg-[#d5b56d]/12 px-4 py-3 text-sm font-semibold text-[#efd79e] transition hover:bg-[#d5b56d]/20"
            >
              <Plus className="h-4 w-4" />
              New creative mission
            </button>
          </div>
        </div>
      </section>

      <section className="px-6 py-7 lg:px-10">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Deliverables" value={projects.length} detail={activeProject?.production_type || "Director-resolved work"} icon={Clapperboard} />
          <Metric label="Assets" value={assets.length} detail="Approved, source and generated assets" icon={Globe2} />
          <Metric label="Tasks" value={tasks.length} detail="Capability-backed production work" icon={CalendarRange} />
          <Metric label="Queue" value={runtime.queueRuntime?.total || 0} detail="Governed execution items" icon={Layers3} />
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
          <section className="rounded-[26px] border border-white/8 bg-white/[0.02] p-5 lg:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Creative workflow</div>
                <h3 className="mt-2 text-xl font-semibold text-white/90">Studio works from evidence, not media presets</h3>
              </div>
              <Megaphone className="h-5 w-5 text-[#d5b56d]/60" />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                ["01", "Understand", "Business context, brand, audience, objective and approved evidence."],
                ["02", "Originate", "Research, strategy and distinct creative direction from the actual mission."],
                ["03", "Resolve", "Choose the required media, capabilities, production graph and cost envelope."],
                ["04", "Improve", "Quality review, human decisions and verified outcome learning."],
              ].map(([number, title, detail]) => (
                <div key={number} className="rounded-2xl border border-white/7 bg-black/20 p-4">
                  <div className="text-[10px] font-semibold text-[#d5b56d]/55">{number}</div>
                  <div className="mt-2 text-sm font-semibold text-white/78">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-white/34">{detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[26px] border border-white/8 bg-white/[0.02] p-5 lg:p-6">
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Active deliverables</div>
            <div className="mt-4 space-y-2.5">
              {projects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => editor.setActiveWorkspace("production")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/7 bg-black/20 p-3.5 text-left transition hover:border-white/12 hover:bg-white/[0.035]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]">
                    <Clapperboard className="h-4 w-4 text-white/45" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white/75">{project.name || "Creative deliverable"}</div>
                    <div className="mt-0.5 text-[10px] text-white/28">{project.production_type || "Director resolving medium"} · {statusLabel(project.status)}</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-white/25" />
                </button>
              ))}

              {!projects.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                  <div className="text-sm font-medium text-white/55">No deliverable yet</div>
                  <div className="mt-1 text-xs text-white/28">Create and start a mission. Studio will resolve what needs to be produced.</div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {composerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form
            onSubmit={createMission}
            className="max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] border border-white/10 bg-[#0a0a09] shadow-2xl md:max-w-4xl md:rounded-[30px]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#0a0a09]/95 px-6 py-5 backdrop-blur-xl">
              <div>
                <div className="text-[10px] uppercase tracking-[0.27em] text-[#d5b56d]">New creative mission</div>
                <div className="mt-1 text-xl font-semibold text-white/90">Define the business job</div>
              </div>
              <button
                type="button"
                onClick={() => editor.closeMissionComposer?.()}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.025] text-white/45 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-7 p-6 lg:p-7">
              <div className="grid gap-5 lg:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Business goal</span>
                  <input
                    value={businessGoal}
                    onChange={(event) => setBusinessGoal(event.target.value)}
                    placeholder="What should change for the business?"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#d5b56d]/35"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Desired outcome</span>
                  <input
                    value={desiredOutcome}
                    onChange={(event) => setDesiredOutcome(event.target.value)}
                    placeholder="What measurable or observable result matters?"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#d5b56d]/35"
                  />
                </label>
              </div>

              <label className="block max-w-md">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Budget ceiling</span>
                <div className="mt-2 flex rounded-xl border border-white/10 bg-black/30">
                  <input
                    type="number"
                    min="0"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    placeholder="Optional"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/20"
                  />
                  <span className="flex items-center px-3 text-[10px] text-white/25">org currency</span>
                </div>
              </label>

              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-xs leading-5 text-white/35">
                Studio will determine the creative strategy, deliverable mix, channels, formats and production capabilities from organization context, brand evidence, approved assets and the mission outcome. Nothing in this form silently defaults the work to a medium or channel. Production spend and publication remain governed approval decisions.
              </div>

              {error ? (
                <div className="rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-sm text-red-200/80">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-white/8 bg-[#0a0a09]/95 px-6 py-4 backdrop-blur-xl">
              <div className="hidden items-center gap-2 text-xs text-white/25 sm:flex">
                <Coins className="h-3.5 w-3.5" />
                Production spend remains locked until approval.
              </div>
              <button
                type="submit"
                disabled={!canCreate}
                className="ml-auto inline-flex items-center gap-2 rounded-xl border border-[#d5b56d]/35 bg-[#d5b56d]/12 px-5 py-3 text-sm font-semibold text-[#efd79e] transition hover:bg-[#d5b56d]/20 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {working ? "Creating mission…" : "Create mission"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
