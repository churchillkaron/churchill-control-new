"use client";

import {
  useMemo,
  useState,
} from "react";

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-2xl font-medium text-white/90">
        {value}
      </div>
    </div>
  );
}

function deliverableTitle(project = {}) {
  return project.name || project.title || "Untitled deliverable";
}

export default function MissionWorkspace({
  runtime,
  editor,
}) {
  const mission = runtime?.missionRuntime?.current || null;
  const projects = runtime?.projectRuntime?.items || [];
  const assets = runtime?.assetRuntime?.items || [];
  const scenes = runtime?.sceneRuntime?.items || [];
  const tasks = runtime?.taskRuntime?.items || [];
  const [request, setRequest] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const missionBlueprint = useMemo(() => (
    mission?.metadata || {}
  ), [mission]);

  async function createMission(event) {
    event.preventDefault();

    const creativeRequest = request.trim();
    if (!creativeRequest || creating) return;

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/creative/missions/compose",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            request: creativeRequest,
            context: {
              current_mission_id: mission?.id || null,
              available_asset_count: assets.length,
              existing_project_count: projects.length,
            },
          }),
        },
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.error ||
          "Creative mission creation failed",
        );
      }

      setRequest("");
      setMessage(
        `Mission created with ${result.projects?.length || 0} planned deliverable(s).`,
      );
      await runtime.refresh?.();
      editor?.setActiveWorkspace?.("brief");
    } catch (creationError) {
      setError(
        creationError?.message ||
        "Creative mission creation failed",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-full overflow-auto bg-[#050505] p-6 text-white lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[#090909] shadow-2xl shadow-black/30">
          <div className="border-b border-white/10 px-6 py-5 lg:px-10">
            <div className="text-[10px] uppercase tracking-[0.34em] text-[#c8a96a]">
              Avantiqo Creative Studio
            </div>
          </div>

          <div className="px-6 py-10 lg:px-10 lg:py-14">
            <div className="max-w-4xl">
              <h1 className="text-4xl font-semibold tracking-[-0.035em] text-white/95 lg:text-6xl">
                What do we create today?
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-white/50 lg:text-lg">
                Describe the outcome in your own words. Avantiqo will use the company, brand, products, menus, documents, forms, assets, and connected business information already available to build the complete mission and production path.
              </p>
            </div>

            <form
              onSubmit={createMission}
              className="mt-9"
            >
              <div className="rounded-3xl border border-white/10 bg-black/50 p-3 focus-within:border-[#c8a96a]/40">
                <textarea
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Create a new cocktail menu for Churchill, a cinematic launch film, redesign our company profile, build a luxury campaign across print and social, or invent something completely new…"
                  rows={5}
                  className="w-full resize-none bg-transparent px-4 py-4 text-lg leading-8 text-white/90 outline-none placeholder:text-white/20"
                />

                <div className="flex flex-col gap-3 border-t border-white/10 px-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-5 text-white/30">
                    No product category required. One request may create any number of connected physical, digital, visual, spatial, written, audio, or moving-image outputs.
                  </div>

                  <button
                    type="submit"
                    disabled={creating || !request.trim()}
                    className="shrink-0 rounded-2xl border border-[#c8a96a]/35 bg-[#c8a96a]/12 px-6 py-3 text-sm font-medium text-[#e4ca8d] transition hover:bg-[#c8a96a]/20 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {creating
                      ? "Building mission…"
                      : "Create Mission"}
                  </button>
                </div>
              </div>
            </form>

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </div>
            ) : null}
          </div>
        </section>

        {mission ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 lg:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#c8a96a]">
                    Active Mission
                  </div>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-white/95">
                    {mission.title || mission.business_goal || "Creative Mission"}
                  </h2>
                  <p className="mt-3 text-base leading-7 text-white/50">
                    {missionBlueprint.creative_thesis || mission.objective || "Mission intelligence is being developed."}
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/55">
                  {mission.status || "draft"}
                </div>
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Deliverables" value={projects.length} />
                <Metric label="Scenes" value={scenes.length} />
                <Metric label="Assets" value={assets.length} />
                <Metric label="Tasks" value={tasks.length} />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 lg:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.26em] text-white/35">
                    Mission Outputs
                  </div>
                  <div className="mt-2 text-lg text-white/80">
                    Everything the mission intends to create
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                {projects.length ? projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-white/85">
                          {deliverableTitle(project)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-white/40">
                          {project.description || project.objective || "Production scope will be developed from the mission."}
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
                        {project.status || "draft"}
                      </span>
                    </div>

                    {project.metadata?.creative_medium ? (
                      <div className="mt-4 text-xs text-[#c8a96a]/75">
                        {project.metadata.creative_medium}
                      </div>
                    ) : null}
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-sm text-white/35 lg:col-span-2">
                    The mission has no materialized outputs yet.
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
