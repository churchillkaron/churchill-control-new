"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Play, ShieldCheck } from "lucide-react";

function actionList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function text(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function scalar(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string") return value;
  return null;
}

function resultEntries(result) {
  if (!result || typeof result !== "object") return [];
  const preferred = result.result && typeof result.result === "object" ? result.result : result;
  return Object.entries(preferred)
    .filter(([key, value]) => !["success", "data", "rows", "items", "records"].includes(key) && scalar(value) !== null)
    .slice(0, 12);
}

function evidenceRows(result) {
  if (!result || typeof result !== "object") return [];
  for (const key of ["steps", "checks", "items", "rows", "records"]) {
    if (Array.isArray(result[key])) return result[key].slice(0, 12);
    if (Array.isArray(result?.result?.[key])) return result.result[key].slice(0, 12);
  }
  return [];
}

export default function FinanceOperationalWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const actions = useMemo(() => {
    return actionList(capability?.topMenu || capability?.ui?.topMenu || capability?.actions)
      .filter(action => action?.endpoint || action?.api);
  }, [capability]);

  const [running, setRunning] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function execute(action) {
    const endpoint = action.endpoint || action.api;
    const method = String(action.method || "POST").toUpperCase();
    setRunning(action.id || endpoint);
    setError("");
    setResult(null);

    try {
      const url = new URL(endpoint, window.location.origin);
      const context = {
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        periodId,
        period_id: periodId,
      };

      const options = {
        method,
        credentials: "include",
        cache: "no-store",
        headers: {},
      };

      if (method === "GET") {
        if (organizationId) url.searchParams.set("organizationId", organizationId);
        if (entityId) url.searchParams.set("entityId", entityId);
        if (periodId) url.searchParams.set("periodId", periodId);
      } else {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(context);
      }

      const response = await fetch(url.toString(), options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Operation failed (${response.status})`);
      }
      setResult(body);
    } catch (operationError) {
      setError(operationError.message || "Operation failed");
    } finally {
      setRunning("");
    }
  }

  const summary = resultEntries(result);
  const evidence = evidenceRows(result);

  return (
    <section className="space-y-5">
      <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_10px_32px_rgba(31,27,20,0.05)]">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Controlled Finance Process</div>
        <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18]">
          {capability?.name || "Finance Process"}
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
          {capability?.description || "Run and review this controlled Finance operation."}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map(action => {
            const actionKey = action.id || action.endpoint || action.api;
            const active = running === actionKey;
            return (
              <button
                key={actionKey}
                type="button"
                disabled={Boolean(running)}
                onClick={() => execute(action)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#A37849]/25 bg-[#1F1E1B] px-4 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-40"
              >
                {active ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={13} />}
                {active ? "Running…" : (action.label || action.title || label(action.id) || "Run")}
              </button>
            );
          })}
        </div>
      </header>

      {actions.length === 0 ? (
        <div className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 text-amber-700" />
            <div>
              <div className="text-[13px] font-semibold text-amber-950">Execution not connected</div>
              <div className="mt-1 text-[12px] leading-5 text-amber-900/75">
                This Finance process has no executable governed endpoint configured yet. It remains visibly unavailable rather than pretending to run.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-700/15 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 text-red-700" />
            <div>
              <div className="text-[13px] font-semibold text-red-950">Process failed</div>
              <div className="mt-1 text-[12px] leading-5 text-red-900/75">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Latest result</div>
              <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-[#2B2926]">Process completed</h2>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/15 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-800">
              <CheckCircle2 size={12} /> Completed
            </div>
          </div>

          {summary.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-black/[0.065] bg-[#FAF9F7] p-3.5">
                  <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">{label(key)}</div>
                  <div className="mt-1.5 break-words text-[12px] font-medium text-[#46423C]">{scalar(value)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {evidence.length ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.065]">
              <div className="border-b border-black/[0.06] bg-[#FAF9F7] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.13em] text-[#817D76]">Process evidence</div>
              <div className="divide-y divide-black/[0.05]">
                {evidence.map((row, index) => (
                  <div key={row?.id || index} className="flex items-start justify-between gap-4 px-4 py-3 text-[12px]">
                    <div className="min-w-0">
                      <div className="font-medium text-[#46423C]">{label(row?.step_type || row?.name || row?.label || row?.type || `Item ${index + 1}`)}</div>
                      <div className="mt-0.5 truncate text-[10px] text-[#908B83]">{row?.message || row?.description || row?.notes || "Recorded by the Finance process"}</div>
                    </div>
                    <div className="shrink-0 text-[10px] font-medium text-[#756F67]">{label(row?.status || row?.result || "Recorded")}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
