"use client";

import { useMemo, useState } from "react";
import DynamicForm from "@/components/workspace/engines/DynamicForm";

function actionList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function businessEntries(value, prefix = "") {
  if (!value || typeof value !== "object") return [];

  const hidden = new Set([
    "organization_id",
    "organizationId",
    "entity_id",
    "entityId",
    "period_id",
    "periodId",
    "created_by",
    "updated_by",
    "metadata",
    "payload",
  ]);

  return Object.entries(value)
    .filter(([key, item]) => !hidden.has(key) && item !== null && item !== undefined)
    .flatMap(([key, item]) => {
      const label = `${prefix}${String(key).replace(/_/g, " ")}`;
      if (Array.isArray(item)) {
        return [[label, `${item.length} item${item.length === 1 ? "" : "s"}`]];
      }
      if (typeof item === "object") {
        return businessEntries(item, `${label} · `);
      }
      return [[label, String(item)]];
    })
    .slice(0, 20);
}

function missingRequired(schema, values) {
  return (schema || [])
    .filter(field => field?.required)
    .filter(field => {
      const value = values?.[field.name];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null || value === "";
    })
    .map(field => field.label || field.name);
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
  const [activeAction, setActiveAction] = useState(null);
  const [values, setValues] = useState({});

  async function execute(action, actionValues = {}) {
    const endpoint = action.endpoint || action.api;
    const method = String(action.method || "POST").toUpperCase();
    const missing = missingRequired(action.schema, actionValues);

    if (missing.length) {
      setError(`Complete required fields: ${missing.join(", ")}`);
      return;
    }

    setRunning(action.id || endpoint);
    setError("");
    setResult(null);

    try {
      const url = new URL(endpoint, window.location.origin);
      const context = {
        ...actionValues,
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
        for (const [key, value] of Object.entries(context)) {
          if (value !== null && value !== undefined && typeof value !== "object") {
            url.searchParams.set(key, String(value));
          }
        }
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
      setActiveAction(null);
      setValues({});
    } catch (operationError) {
      setError(operationError.message || "Operation failed");
    } finally {
      setRunning("");
    }
  }

  function begin(action) {
    setError("");
    setResult(null);

    if (Array.isArray(action.schema) && action.schema.length) {
      setActiveAction(action);
      setValues({});
      return;
    }

    execute(action);
  }

  const resultEntries = businessEntries(result);

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
              onClick={() => begin(action)}
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
          This process has no executable operation configured.
        </div>
      )}

      {activeAction && (
        <section className="rounded-[28px] border border-white/10 bg-white/[0.025] p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#D6A66A]">
            Controlled Operation
          </div>
          <h2 className="mt-3 text-2xl font-light text-white">
            {activeAction.title || activeAction.label || "Finance Operation"}
          </h2>
          <div className="mt-6">
            <DynamicForm
              schema={activeAction.schema || []}
              values={values}
              onChange={(name, value) =>
                setValues(current => ({ ...current, [name]: value }))
              }
              organizationId={organizationId}
              entityId={entityId}
            />
          </div>
          <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => {
                setActiveAction(null);
                setValues({});
                setError("");
              }}
              className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(running)}
              onClick={() => execute(activeAction, values)}
              className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {running ? "Running…" : (activeAction.submitLabel || activeAction.label || "Run")}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-[28px] border border-red-400/25 bg-red-400/[0.06] p-8 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/[0.04] p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/70">Operation Completed</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {resultEntries.length ? resultEntries.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
                <div className="mt-2 break-words text-sm text-white/75">{value}</div>
              </div>
            )) : (
              <div className="text-sm text-white/65">The Finance operation completed successfully.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
