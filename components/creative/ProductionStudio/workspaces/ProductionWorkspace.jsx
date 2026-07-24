"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

function assetUrl(asset) {
  return (
    asset?.url ||
    asset?.image_url ||
    asset?.thumbnail_url ||
    asset?.file_url ||
    ""
  );
}

function isVideo(asset) {
  const url = assetUrl(asset).toLowerCase();
  return (
    asset?.type === "VIDEO" ||
    asset?.type === "FINAL_RENDER" ||
    asset?.asset_type?.toLowerCase?.().includes("video") ||
    url.includes(".mp4") ||
    url.includes(".mov") ||
    url.includes(".webm")
  );
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function statusTone(status) {
  const value = String(status || "UNKNOWN").toUpperCase();

  if (["COMPLETED", "APPROVED"].includes(value)) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }

  if (["FAILED", "REJECTED", "BLOCKED"].includes(value)) {
    return "border-red-400/25 bg-red-400/10 text-red-200";
  }

  if ([
    "RUNNING",
    "PROCESSING",
    "PRODUCING",
    "PRODUCTION_QUEUED",
    "PRODUCING_MASTER_STILLS",
    "PRODUCING_MOTION",
    "EDITING_AND_AUDIO",
    "FINAL_QA",
  ].includes(value)) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/60";
}

function StatusPill({ value }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${statusTone(value)}`}>
      {value || "Unknown"}
    </span>
  );
}

function Metric({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-2xl font-medium text-white/90">
        {value}
      </div>
      {note ? (
        <div className="mt-1 text-xs text-white/35">
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductionWorkspace({
  runtime,
}) {
  const project = runtime.projectRuntime?.current || null;
  const organizationId = runtime.organizationId;
  const projectId = project?.id;

  const [control, setControl] = useState(null);
  const [tasks, setTasks] = useState(
    runtime.taskRuntime?.items || [],
  );
  const [assets, setAssets] = useState(
    runtime.assetRuntime?.items || [],
  );
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [budgetMaximum, setBudgetMaximum] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");

  const loadControl = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId || !projectId) return;

    if (!quiet) setLoading(true);

    try {
      const query = new URLSearchParams({
        organization_id: organizationId,
        creative_project_id: projectId,
      });
      const response = await fetch(
        `/api/creative/production/control?${query.toString()}`,
        { cache: "no-store" },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Production status failed");
      }

      setControl(result.control || null);
      setTasks(result.tasks || []);
      setAssets(result.assets || []);
      setLastUpdated(new Date());
      setError("");

      if (!budgetMaximum && result.control?.budget?.maximum) {
        setBudgetMaximum(String(result.control.budget.maximum));
      }
      if (result.control?.budget?.currency) {
        setBudgetCurrency(result.control.budget.currency);
      }
    } catch (loadError) {
      if (!quiet) {
        setError(loadError?.message || "Production status failed");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [
    budgetMaximum,
    organizationId,
    projectId,
  ]);

  useEffect(() => {
    loadControl();

    const timer = window.setInterval(() => {
      loadControl({ quiet: true });
    }, 5000);

    const started = () => loadControl();
    window.addEventListener("creative-production-started", started);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("creative-production-started", started);
    };
  }, [loadControl]);

  const sortedAssets = useMemo(() => (
    [...assets].sort((left, right) => {
      const leftFinal = left.type === "FINAL_RENDER" ? 1 : 0;
      const rightFinal = right.type === "FINAL_RENDER" ? 1 : 0;
      return rightFinal - leftFinal;
    })
  ), [assets]);

  const selectedAsset = useMemo(() => (
    sortedAssets.find((asset) => asset.id === selectedAssetId) ||
    sortedAssets[0] ||
    null
  ), [selectedAssetId, sortedAssets]);

  const failedTasks = tasks.filter((task) => (
    ["FAILED", "REJECTED"].includes(task.status)
  ));
  const activeTasks = tasks.filter((task) => (
    ["PLANNED", "WAITING", "READY", "RUNNING", "REVIEW"].includes(
      task.status,
    )
  ));
  const finalAssets = assets.filter((asset) => (
    asset.type === "FINAL_RENDER"
  ));

  async function postControl(body) {
    const response = await fetch(
      "/api/creative/production/control",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: projectId,
          ...body,
        }),
      },
    );
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Production control action failed");
    }

    return result;
  }

  async function runWorkerPass() {
    if (action) return;

    setAction("worker");
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/creative/worker/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: organizationId,
            creative_project_id: projectId,
            max_cycles: 1,
          }),
        },
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Production pass failed");
      }

      setMessage(
        result.complete
          ? "Production and final approval gates are complete."
          : "One controlled production pass completed. Continue when ready.",
      );
      await loadControl({ quiet: true });
    } catch (runError) {
      setError(runError?.message || "Production pass failed");
    } finally {
      setAction("");
    }
  }

  async function approveBudget() {
    if (action) return;

    const maximum = Number(budgetMaximum);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      setError("Enter a valid maximum production budget.");
      return;
    }

    setAction("budget");
    setError("");
    setMessage("");

    try {
      await postControl({
        action: "APPROVE_BUDGET",
        maximum,
        currency: budgetCurrency || "USD",
      });
      setMessage("Production budget approved.");
      await loadControl({ quiet: true });
    } catch (budgetError) {
      setError(budgetError?.message || "Budget approval failed");
    } finally {
      setAction("");
    }
  }

  async function regenerate(task) {
    if (action) return;

    const reason = window.prompt(
      `Why should ${task.title || "this task"} be regenerated?`,
      task.error || "Correct the failed quality requirements.",
    );
    if (!reason?.trim()) return;

    setAction(task.id);
    setError("");
    setMessage("");

    try {
      const result = await postControl({
        action: "REGENERATE_TASK_SUBTREE",
        task_id: task.id,
        reason,
      });
      setMessage(
        `${result.result?.reset_count || 1} affected production task(s) reset without touching unrelated approved work.`,
      );
      await loadControl({ quiet: true });
    } catch (regenerationError) {
      setError(
        regenerationError?.message || "Selective regeneration failed",
      );
    } finally {
      setAction("");
    }
  }

  async function releaseDeliverables() {
    if (action) return;

    const notes = window.prompt(
      "Final release notes",
      "Approved for client delivery.",
    );
    if (notes === null) return;

    setAction("release");
    setError("");
    setMessage("");

    try {
      await postControl({
        action: "RELEASE_DELIVERABLES",
        notes,
      });
      setMessage("Final deliverables released by human approval.");
      await loadControl({ quiet: true });
    } catch (releaseError) {
      setError(releaseError?.message || "Final release failed");
    } finally {
      setAction("");
    }
  }

  if (!projectId) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/40">
          Select or create a Creative project before opening production.
        </div>
      </div>
    );
  }

  const budget = control?.budget || {};
  const release = control?.release || {};
  const lifecycle = control?.lifecycle || {};
  const lifecycleProgress = lifecycle.progress || {};
  const previewUrl = assetUrl(selectedAsset);

  return (
    <div className="min-h-full bg-[#050505] p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-[#090909] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-[#c8a96a]">
                Production Control
              </div>
              <div className="mt-2 text-2xl font-semibold text-white/95">
                {project.name || "Film Production"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill value={lifecycle.status || control?.project_status || "DRAFT"} />
                <span className="text-xs text-white/35">
                  {lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString()}`
                    : "Loading live production status"}
                </span>
              </div>
              {lifecycle.description ? (
                <div className="mt-3 max-w-3xl text-sm text-white/50">
                  {lifecycle.description}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => loadControl()}
                disabled={loading || Boolean(action)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08] disabled:opacity-40"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                onClick={runWorkerPass}
                disabled={Boolean(action) || budget.execution_allowed === false}
                className="rounded-xl border border-[#c8a96a]/30 bg-[#c8a96a]/10 px-5 py-2 text-sm font-medium text-[#e3c887] transition hover:bg-[#c8a96a]/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {action === "worker"
                  ? "Running controlled pass..."
                  : activeTasks.length
                    ? "Continue Production"
                    : "Run Finalization Pass"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Production Tasks"
            value={control?.tasks?.total || tasks.length}
            note={`${lifecycleProgress.active_tasks ?? activeTasks.length} active · ${lifecycleProgress.total_shots || 0} shots`}
          />
          <Metric
            label="Completed"
            value={
              (control?.tasks?.by_status?.COMPLETED || 0) +
              (control?.tasks?.by_status?.APPROVED || 0)
            }
            note={`${lifecycleProgress.progress_percent ?? 0}% complete · ${lifecycleProgress.failed_tasks ?? failedTasks.length} failed`}
          />
          <Metric
            label="Master Stills"
            value={`${lifecycleProgress.master_stills?.completed || 0}/${lifecycleProgress.master_stills?.total || 0}`}
            note={`${lifecycleProgress.motion_clips?.completed || 0}/${lifecycleProgress.motion_clips?.total || 0} motion clips`}
          />
          <Metric
            label="Creative Assets"
            value={control?.assets?.total || assets.length}
            note={`${finalAssets.length} final variants`}
          />
          <Metric
            label="Projected Cost"
            value={money(
              budget.projected_cost,
              budget.currency || "USD",
            )}
            note={budget.maximum
              ? `Limit ${money(budget.maximum, budget.currency)}`
              : "No project limit configured"}
          />
          <Metric
            label="Release"
            value={release.human_released ? "Released" : "Pending"}
            note={
              control?.assets?.approved_final_deliverables
                ? `${control.assets.approved_final_deliverables} AI-approved`
                : "Awaiting final QA"
            }
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#090909] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                    Current Deliverable
                  </div>
                  <div className="mt-1 text-lg font-medium text-white/90">
                    {selectedAsset?.name || "No generated deliverable yet"}
                  </div>
                </div>
                {selectedAsset ? (
                  <StatusPill value={selectedAsset.status} />
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black">
                {previewUrl ? (
                  isVideo(selectedAsset) ? (
                    <video
                      key={previewUrl}
                      src={previewUrl}
                      controls
                      className="h-[480px] w-full object-contain"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt={selectedAsset?.name || "Creative deliverable"}
                      className="h-[480px] w-full object-contain"
                    />
                  )
                ) : (
                  <div className="flex h-[480px] items-center justify-center text-sm text-white/30">
                    Generated shots and final variants will appear here.
                  </div>
                )}
              </div>

              {selectedAsset?.metadata?.final_film_qa ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric
                    label="Final QA"
                    value={selectedAsset.metadata.final_film_qa.overall_score || 0}
                    note={`Minimum ${selectedAsset.metadata.final_film_qa.minimum_score || 92}`}
                  />
                  <Metric
                    label="Aspect Ratio"
                    value={selectedAsset.metadata.aspect_ratio || "—"}
                  />
                  <Metric
                    label="Delivery"
                    value={selectedAsset.metadata.delivery_status || "Review"}
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#090909] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                    Production Tasks
                  </div>
                  <div className="mt-1 text-lg font-medium text-white/90">
                    Atomic shot and quality pipeline
                  </div>
                </div>
                <div className="text-xs text-white/35">
                  {tasks.length} tasks
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill value={task.status} />
                          <span className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                            {task.metadata?.deliverable || task.type}
                          </span>
                        </div>
                        <div className="mt-2 truncate text-sm font-medium text-white/85">
                          {task.title || task.id}
                        </div>
                        <div className="mt-1 text-xs text-white/35">
                          {task.shot_id
                            ? `Shot ${task.shot_id}`
                            : task.scene_id
                              ? `Scene ${task.scene_id}`
                              : "Project-level task"}
                          {task.metadata?.provider_status
                            ? ` · ${task.metadata.provider_status}`
                            : ""}
                        </div>
                        {task.error ? (
                          <div className="mt-2 rounded-lg border border-red-400/15 bg-red-400/[0.06] p-2 text-xs text-red-200/80">
                            {task.error}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-white/35">
                          <div>
                            {money(
                              task.cost?.actual || task.cost?.estimated,
                              task.cost?.currency || "USD",
                            )}
                          </div>
                          <div className="mt-1">
                            Attempt {task.metadata?.attempt || 0}/
                            {task.metadata?.max_attempts || 3}
                          </div>
                        </div>

                        {["FAILED", "REJECTED"].includes(task.status) ? (
                          <button
                            onClick={() => regenerate(task)}
                            disabled={Boolean(action)}
                            className="rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-300/20 disabled:opacity-40"
                          >
                            {action === task.id
                              ? "Resetting..."
                              : "Regenerate"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {!tasks.length ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/30">
                    Run Film Production to create the atomic shot plan.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#090909] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                Budget Gate
              </div>
              <div className="mt-1 text-lg font-medium text-white/90">
                Production authorization
              </div>

              <div className="mt-5 grid grid-cols-[1fr_90px] gap-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetMaximum}
                  onChange={(event) => setBudgetMaximum(event.target.value)}
                  placeholder="Maximum"
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none placeholder:text-white/20 focus:border-[#c8a96a]/40"
                />
                <input
                  value={budgetCurrency}
                  onChange={(event) => setBudgetCurrency(event.target.value.toUpperCase())}
                  maxLength={3}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center text-sm uppercase outline-none focus:border-[#c8a96a]/40"
                />
              </div>

              <button
                onClick={approveBudget}
                disabled={Boolean(action)}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.09] disabled:opacity-40"
              >
                {action === "budget" ? "Approving..." : "Approve Budget"}
              </button>

              <div className="mt-4 space-y-2 text-xs text-white/40">
                <div className="flex justify-between">
                  <span>Projected</span>
                  <span>{money(budget.projected_cost, budget.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Execution</span>
                  <span className={budget.execution_allowed === false ? "text-red-200" : "text-emerald-200"}>
                    {budget.execution_allowed === false ? "Blocked" : "Allowed"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#090909] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                    Deliverables
                  </div>
                  <div className="mt-1 text-lg font-medium text-white/90">
                    Generated assets
                  </div>
                </div>
                <div className="text-xs text-white/35">
                  {assets.length}
                </div>
              </div>

              <div className="mt-4 max-h-[620px] space-y-3 overflow-auto pr-1">
                {sortedAssets.map((asset) => {
                  const url = assetUrl(asset);
                  const selected = selectedAsset?.id === asset.id;

                  return (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selected
                          ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      {url ? (
                        isVideo(asset) ? (
                          <video
                            src={url}
                            muted
                            className="mb-3 h-28 w-full rounded-xl object-cover"
                          />
                        ) : (
                          <img
                            src={url}
                            alt={asset.name || "Creative asset"}
                            className="mb-3 h-28 w-full rounded-xl object-cover"
                          />
                        )
                      ) : null}

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white/80">
                            {asset.name || asset.type || "Creative Asset"}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/30">
                            {asset.metadata?.aspect_ratio || asset.type}
                          </div>
                        </div>
                        <StatusPill value={asset.status} />
                      </div>
                    </button>
                  );
                })}

                {!assets.length ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-white/30">
                    No generated assets yet.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-[#c8a96a]/20 bg-[#c8a96a]/[0.06] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-[#c8a96a]">
                Human Release
              </div>
              <div className="mt-2 text-sm text-white/60">
                AI approval does not publish or release the film. An authorized human must approve the final deliverables.
              </div>

              <button
                onClick={releaseDeliverables}
                disabled={
                  Boolean(action) ||
                  release.human_released ||
                  !control?.assets?.approved_final_deliverables
                }
                className="mt-4 w-full rounded-xl border border-[#c8a96a]/30 bg-[#c8a96a]/10 px-4 py-2 text-sm font-medium text-[#e3c887] transition hover:bg-[#c8a96a]/20 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {release.human_released
                  ? "Deliverables Released"
                  : action === "release"
                    ? "Releasing..."
                    : "Approve Final Release"}
              </button>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
