"use client";

import { useMemo, useState } from "react";

function actionList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function display(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
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

  return (
    <section className="space-y-6">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">Finance Process</div>
        <h1 className="mt-3 text-4xl font-light tracking-[-0.05em] text-white">
          {capability?.name || "Finance Process"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          {capability?.description || "Run and review this controlled Finance operation."}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {actions.map(action => (
            <button
              key={action.id || action.endpoint || action.api}
              type="button"
              disabled={Boolean(running)}
              onClick={() => execute(action)}
              className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {running === (action.id || action.endpoint || action.api)
                ? "Running…"
                : (action.label || action.title || action.id || "Run")}
            </button>
          ))}
        </div>
      </header>

      {actions.length === 0 && (
        <div className="rounded-[28px] border border-amber-300/20 bg-amber-300/[0.05] p-8 text-sm text-amber-100/80">
          This process has no executable endpoint configured. The capability audit will keep it open as a failure until a real command is connected.
        </div>
      )}

      {error && (
        <div className="rounded-[28px] border border-red-400/25 bg-red-400/[0.06] p-8 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Latest Result</div>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-white/65">
            {display(result)}
          </pre>
        </div>
      )}
    </section>
  );
}
