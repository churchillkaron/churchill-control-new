"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

function assetUrl(asset) {
  const source = asset || {};

  return (
    source.url ||
    source.image_url ||
    source.thumbnail_url ||
    source.file_url ||
    ""
  );
}

function isVideo(asset) {
  const source = asset || {};
  const url = assetUrl(source).toLowerCase();

  return (
    source.type === "VIDEO" ||
    source.type === "FINAL_RENDER" ||
    String(source.asset_type || "").toLowerCase().includes("video") ||
    url.includes(".mp4") ||
    url.includes(".mov") ||
    url.includes(".webm")
  );
}

function amount(value, currency) {
  const code = String(currency || "").trim().toUpperCase();
  const number = Number(value || 0);

  if (!code) return "Currency not configured";

  return `${code} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Pill({ children }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
      {children}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0 border-r border-white/10 px-4 last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.20em] text-white/30">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-white/85">
        {value}
      </div>
    </div>
  );
}

export default function ProductionWorkspaceCompact({ runtime }) {
  const project = runtime.projectRuntime?.current || null;
  const organizationId = runtime.organizationId;
  const projectId =
    project?.creative_project_id ||
    project?.project_id ||
    project?.id ||
    null;

  const [control, setControl] = useState(null);
  const [tasks, setTasks] = useState(runtime.taskRuntime?.items || []);
  const [assets, setAssets] = useState(runtime.assetRuntime?.items || []);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [budgetMaximum, setBudgetMaximum] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !projectId) return;

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
    setTasks(Array.isArray(result.tasks) ? result.tasks.filter(Boolean) : []);
    setAssets(Array.isArray(result.assets) ? result.assets.filter(Boolean) : []);
    setBudgetMaximum((current) => (
      current ||
      (result.control?.budget?.maximum
        ? String(result.control.budget.maximum)
        : "")
    ));
  }, [organizationId, projectId]);

  useEffect(() => {
    load().catch((loadError) => {
      setError(loadError.message || "Production status failed");
    });
  }, [load]);

  const selectedAsset = useMemo(() => {
    const safeAssets = assets.filter(Boolean);

    return (
      safeAssets.find((asset) => asset.id === selectedAssetId) ||
      safeAssets.find((asset) => asset.type === "FINAL_RENDER") ||
      safeAssets[0] ||
      null
    );
  }, [assets, selectedAssetId]);

  const activeTasks = tasks.filter((task) =>
    task && ["PLANNED", "WAITING", "READY", "RUNNING", "REVIEW"].includes(task.status),
  );
  const failedTasks = tasks.filter((task) =>
    task && ["FAILED", "REJECTED"].includes(task.status),
  );
  const completedTasks = tasks.filter((task) =>
    task && ["COMPLETED", "APPROVED"].includes(task.status),
  );

  async function post(body) {
    const response = await fetch("/api/creative/production/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        creative_project_id: projectId,
        ...body,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Production action failed");
    }

    return result;
  }

  async function runPass() {
    if (busy) return;

    setBusy("run");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/creative/worker/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: projectId,
          max_cycles: 1,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Production pass failed");
      }

      setMessage("One controlled production pass completed.");
      await load();
    } catch (runError) {
      setError(runError.message || "Production pass failed");
    } finally {
      setBusy("");
    }
  }

  async function approveBudget() {
    const maximum = Number(budgetMaximum);

    if (!Number.isFinite(maximum) || maximum <= 0) {
      setError("Enter a valid maximum production budget.");
      return;
    }

    setBusy("budget");
    setError("");
    setMessage("");

    try {
      await post({
        action: "APPROVE_BUDGET",
        maximum,
      });
      setMessage("Production budget approved.");
      await load();
    } catch (budgetError) {
      setError(budgetError.message || "Budget approval failed");
    } finally {
      setBusy("");
    }
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-white/35">
        Select or create a Creative project before opening production.
      </div>
    );
  }

  const budget = control?.budget || {};
  const previewUrl = assetUrl(selectedAsset);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050505] text-white">
      <div className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#c8a96a]">
              Production Control
            </div>
            <div className="mt-1 truncate text-base font-medium text-white/90">
              {project?.name || "Film Production"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Pill>{control?.project_status || project?.status || "DRAFT"}</Pill>
            <button
              type="button"
              onClick={() => load().catch((loadError) => setError(loadError.message))}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.05]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={runPass}
              disabled={Boolean(busy) || budget.execution_allowed === false}
              className="rounded-lg border border-[#c8a96a]/30 bg-[#c8a96a]/10 px-4 py-2 text-xs font-medium text-[#e0c27d] disabled:opacity-35"
            >
              {busy === "run" ? "Running..." : "Continue Production"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 rounded-xl border border-white/10 bg-white/[0.02] py-3">
          <Metric label="Tasks" value={tasks.length} />
          <Metric label="Active" value={activeTasks.length} />
          <Metric label="Completed" value={completedTasks.length} />
          <Metric label="Failed" value={failedTasks.length} />
          <Metric label="Projected" value={amount(budget.projected_cost, budget.currency)} />
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
        <section className="min-h-0 overflow-auto border-r border-white/10 p-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
            {previewUrl ? (
              isVideo(selectedAsset) ? (
                <video src={previewUrl} controls className="h-[310px] w-full object-contain" />
              ) : (
                <img
                  src={previewUrl}
                  alt={selectedAsset?.name || "Creative asset"}
                  className="h-[310px] w-full object-contain"
                />
              )
            ) : (
              <div className="flex h-[310px] items-center justify-center text-xs text-white/25">
                Generated shots and final film will appear here.
              </div>
            )}
          </div>

          <div className="mt-4 text-[10px] uppercase tracking-[0.20em] text-white/30">
            Atomic Shot Pipeline
          </div>
          <div className="mt-1 text-sm text-white/70">
            {tasks.length ? `${tasks.length} production tasks` : "No production queue yet"}
          </div>

          <div className="mt-3 space-y-2">
            {tasks.slice(0, 12).filter(Boolean).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white/75">
                    {task.title || task.type}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/25">
                    {task.type}
                  </div>
                </div>
                <div className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/40">
                  {task.status}
                </div>
              </div>
            ))}

            {!tasks.length ? (
              <div className="rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-white/25">
                Run Film Production to create the shot plan and queue.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="min-h-0 overflow-auto p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[10px] uppercase tracking-[0.20em] text-white/30">
              Budget Authorization
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={budgetMaximum}
                onChange={(event) => setBudgetMaximum(event.target.value)}
                placeholder="Maximum budget"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none"
              />
              <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/55">
                {budget.currency || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={approveBudget}
              disabled={Boolean(busy)}
              className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/[0.05] disabled:opacity-35"
            >
              {busy === "budget" ? "Approving..." : "Approve Budget"}
            </button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.20em] text-white/30">
                Deliverables
              </div>
              <div className="text-[10px] text-white/25">{assets.length}</div>
            </div>

            <div className="mt-2 space-y-2">
              {assets.filter(Boolean).map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-left hover:bg-white/[0.05]"
                >
                  <div className="truncate text-xs text-white/70">
                    {asset.name || asset.type || "Creative Asset"}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/25">
                    {asset.status || asset.type}
                  </div>
                </button>
              ))}

              {!assets.length ? (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/25">
                  No generated assets yet.
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
