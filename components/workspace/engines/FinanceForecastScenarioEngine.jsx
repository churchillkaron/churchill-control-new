"use client";

import { useState } from "react";

const FIELDS = [
  ["conservative_revenue", "Conservative Revenue Change %"],
  ["conservative_cogs", "Conservative COGS / Direct Cost Change %"],
  ["conservative_expenses", "Conservative Operating Expense Change %"],
  ["growth_revenue", "Growth Revenue Change %"],
  ["growth_cogs", "Growth COGS / Direct Cost Change %"],
  ["growth_expenses", "Growth Operating Expense Change %"],
];

function numberValue(values, key, label) {
  const raw = values[key];
  if (raw === "" || raw === null || raw === undefined) {
    throw new Error(`${label} is required`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }

  if (value < -100) {
    throw new Error(`${label} must be at least -100%`);
  }

  return value;
}

function buildAssumptions(values) {
  return {
    conservative: {
      revenue_change_percent: numberValue(
        values,
        "conservative_revenue",
        "Conservative Revenue Change %"
      ),
      cogs_change_percent: numberValue(
        values,
        "conservative_cogs",
        "Conservative COGS / Direct Cost Change %"
      ),
      expense_change_percent: numberValue(
        values,
        "conservative_expenses",
        "Conservative Operating Expense Change %"
      ),
    },
    growth: {
      revenue_change_percent: numberValue(
        values,
        "growth_revenue",
        "Growth Revenue Change %"
      ),
      cogs_change_percent: numberValue(
        values,
        "growth_cogs",
        "Growth COGS / Direct Cost Change %"
      ),
      expense_change_percent: numberValue(
        values,
        "growth_expenses",
        "Growth Operating Expense Change %"
      ),
    },
  };
}

function dispatchPreview({
  action,
  document,
  organizationId,
  entityId,
  periodId,
  title,
}) {
  window.dispatchEvent(
    new CustomEvent("workspace:preview", {
      detail: {
        action: {
          ...action,
          title: document?.title || title,
        },
        documentType: "FinancialReport",
        payload: { document },
        organizationId,
        entityId,
        periodId,
      },
    })
  );
}

export default function FinanceForecastScenarioEngine({
  action,
  organizationId,
  entityId,
  periodId,
  onClose,
}) {
  const [values, setValues] = useState({
    conservative_revenue: "",
    conservative_cogs: "",
    conservative_expenses: "",
    growth_revenue: "",
    growth_cogs: "",
    growth_expenses: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setValues(current => ({ ...current, [key]: value }));
  }

  async function generate() {
    try {
      setBusy(true);
      setError("");
      const assumptions = buildAssumptions(values);

      const response = await fetch(
        action?.api || "/api/finance/forecast/scenarios",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            organization_id: organizationId,
            entityId: entityId || null,
            entity_id: entityId || null,
            periodId: periodId || null,
            period_id: periodId || null,
            assumptions,
          }),
        }
      );

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast scenario generation failed");
      }

      dispatchPreview({
        action,
        document: json.document,
        organizationId,
        entityId,
        periodId,
        title: "Forecast Scenarios",
      });

      onClose?.();
    } catch (generationError) {
      setError(generationError.message || "Forecast scenario generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    try {
      if (!entityId || !periodId) {
        throw new Error("Select a legal entity and accounting period before saving a forecast version.");
      }
      if (!action?.persistApi || !action?.scenarioKind) {
        throw new Error("Forecast version persistence is not configured for this action.");
      }

      setBusy(true);
      setError("");
      const assumptions = buildAssumptions(values);

      const response = await fetch(action.persistApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          periodId,
          scenarioKind: action.scenarioKind,
          assumptions,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast version creation failed");
      }

      dispatchPreview({
        action,
        document: json.version?.result_snapshot?.document,
        organizationId,
        entityId,
        periodId,
        title: `Saved Forecast Version ${json.version?.version_number || ""}`.trim(),
      });

      onClose?.();
    } catch (saveError) {
      setError(saveError.message || "Forecast version creation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
          Finance Forecasting
        </div>
        <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
          {action?.title || "Forecast Scenarios"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
          Base uses the canonical guarded ledger run-rate. Conservative and Growth require explicit assumptions; Avantiqo does not invent scenario percentages. Saved drafts are regenerated on the server and preserve an immutable result snapshot for approval.
        </p>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs text-white/45">{label}</span>
              <input
                type="number"
                step="any"
                min="-100"
                value={values[key]}
                onChange={event => update(key, event.target.value)}
                placeholder="Enter explicit assumption"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-white outline-none focus:border-amber-300/35"
              />
            </label>
          ))}
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-5 py-3 text-sm text-white/60"
          >
            Cancel
          </button>
          {action?.persistApi ? (
            <button
              onClick={saveDraft}
              disabled={busy}
              className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 py-3 text-sm font-medium text-white/80 disabled:opacity-50"
            >
              {busy ? "Working..." : "Save Draft"}
            </button>
          ) : null}
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Generating..." : "Generate Scenarios"}
          </button>
        </div>
      </div>
    </div>
  );
}
