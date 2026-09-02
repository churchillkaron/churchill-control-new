"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function list(value) {
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
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function scalar(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string") return value;
  return null;
}

function summaryEntries(result) {
  if (!result || typeof result !== "object") return [];
  const source = result.result && typeof result.result === "object" && !Array.isArray(result.result)
    ? result.result
    : result;
  return Object.entries(source)
    .filter(([key, value]) => !["success", "data", "rows", "items", "records", "steps", "checks"].includes(key) && scalar(value) !== null)
    .slice(0, 8);
}

function evidenceRows(result) {
  if (!result || typeof result !== "object") return [];
  for (const key of ["steps", "checks", "items", "rows", "records"]) {
    if (Array.isArray(result[key])) return result[key].slice(0, 30);
    if (Array.isArray(result?.result?.[key])) return result.result[key].slice(0, 30);
  }
  return [];
}

function successful(row) {
  const state = text(row?.status || row?.result || row?.state).toLowerCase();
  return ["complete", "completed", "success", "passed", "posted", "closed", "approved", "ready"].includes(state);
}

export default function FinanceAccountantProcessWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const presentation = capability?.ui?.financePresentation || capability?.runtime?.financePresentation || {};
  const requiresEntity = (capability?.contextScope || presentation.scope || "entity") === "entity";
  const contextReady = Boolean(organizationId && (!requiresEntity || entityId));
  const actions = useMemo(() => list(capability?.topMenu || capability?.ui?.topMenu || capability?.actions)
    .filter((action) => action?.endpoint || action?.api), [capability]);

  const [running, setRunning] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function execute(action) {
    const endpoint = action.endpoint || action.api;
    const method = String(action.method || "POST").toUpperCase();
    const actionKey = action.id || endpoint;
    setRunning(actionKey);
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
      if (!response.ok || body?.success === false) throw new Error(body?.error || `Finance process failed (${response.status})`);
      setResult(body);
    } catch (operationError) {
      setError(operationError?.message || "Finance process failed");
    } finally {
      setRunning("");
    }
  }

  const summary = summaryEntries(result);
  const evidence = evidenceRows(result);

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="border-b border-black/[0.07] pb-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
            Finance / {presentation.family_label || "Controlled process"}
          </div>
          <div className="mt-1.5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-[31px]">
                {capability?.name || "Finance Process"}
              </h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">
                {capability?.description || "Run this controlled accounting process and review its evidence before sign-off."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[#777169]">
                <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">{presentation.review_label || "Controlled execution"}</span>
                <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">{requiresEntity ? "Legal entity scoped" : "Organization scoped"}</span>
                {periodId ? <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">Accounting period selected</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => {
                const key = action.id || action.endpoint || action.api;
                const active = running === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={Boolean(running) || !contextReady}
                    onClick={() => execute(action)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {active ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={12} />}
                    {active ? "Running…" : (action.label || action.title || label(action.id) || "Run")}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {!contextReady ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">
            Select the required legal entity before running this Finance process.
          </section>
        ) : actions.length === 0 ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={16} className="mt-0.5 text-amber-700" />
              <div>
                <div className="text-[12px] font-semibold text-amber-950">Execution not connected</div>
                <div className="mt-1 text-[11px] leading-5 text-amber-900/75">This process remains visible but cannot be run until a governed endpoint is configured.</div>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 text-red-700" />
              <div><div className="text-[12px] font-semibold text-red-950">Process stopped</div><div className="mt-1 text-[11px] leading-5 text-red-900/75">{error}</div></div>
            </div>
          </section>
        ) : null}

        {!result && !error ? (
          <section className="mt-4 rounded-xl border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.07] bg-[#FAF9F7] text-[#938D84]"><Circle size={13} /></div>
              <div>
                <div className="text-[12px] font-semibold text-[#45413B]">Ready for controlled execution</div>
                <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#7E786F]">Run the required action above. The result and returned process evidence will stay visible here for review before you move to the next accounting step.</p>
              </div>
            </div>
          </section>
        ) : null}

        {result ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <section className="rounded-xl border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8D877F]">Latest run</div>
                  <div className="mt-1 text-[15px] font-semibold text-[#37332E]">Process result</div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/15 bg-emerald-50 px-2.5 py-1 text-[9px] font-medium text-emerald-800"><CheckCircle2 size={11} /> Completed</span>
              </div>
              {summary.length ? (
                <dl className="mt-2 divide-y divide-black/[0.055]">
                  {summary.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-2.5 text-[10px]"><dt className="text-[#918B83]">{label(key)}</dt><dd className="break-words font-medium text-[#514C45]">{scalar(value)}</dd></div>
                  ))}
                </dl>
              ) : <div className="mt-3 text-[11px] text-[#817B73]">The process completed without scalar summary values.</div>}
            </section>

            <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between border-b border-black/[0.06] bg-[#FAF9F7] px-4 py-3">
                <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8D877F]">Evidence</div><div className="mt-0.5 text-[12px] font-semibold text-[#45413B]">Review returned checks and steps</div></div>
                <span className="text-[9px] text-[#918B83]">{evidence.length} items</span>
              </div>
              {evidence.length ? (
                <div className="divide-y divide-black/[0.05]">
                  {evidence.map((row, index) => {
                    const good = successful(row);
                    return (
                      <div key={row?.id || index} className="grid gap-2 px-4 py-3 text-[10px] sm:grid-cols-[24px_minmax(0,1fr)_120px] sm:items-center">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full ${good ? "bg-emerald-50 text-emerald-700" : "bg-[#F7F6F3] text-[#99938A]"}`}>{good ? <CheckCircle2 size={12} /> : <Circle size={10} />}</div>
                        <div className="min-w-0"><div className="truncate font-medium text-[#4C4740]">{label(row?.step_type || row?.name || row?.label || row?.type || `Item ${index + 1}`)}</div><div className="mt-0.5 truncate text-[9px] text-[#989188]">{row?.message || row?.description || row?.notes || "Recorded by the Finance process"}</div></div>
                        <div className="text-left font-medium text-[#756F67] sm:text-right">{label(row?.status || row?.result || "Recorded")}</div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="p-5 text-[11px] text-[#817B73]">No step-level evidence was returned by this process.</div>}
            </section>
          </div>
        ) : null}

        {result ? (
          <button type="button" onClick={() => { setResult(null); setError(""); }} className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] font-medium text-[#6E685F] hover:border-[#D6A66A]/40">
            <RefreshCw size={11} /> Clear latest result
          </button>
        ) : null}
      </div>
    </main>
  );
}
