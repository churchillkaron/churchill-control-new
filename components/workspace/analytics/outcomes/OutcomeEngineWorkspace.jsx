"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BadgeDollarSign, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

function money(value, currency) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency || ""}`.trim();
  }
}

function severity(finding) {
  const amount = Number(finding?.impact?.amount || 0);
  if (amount >= 100000) return "critical";
  if (amount >= 25000) return "attention";
  return "review";
}
export default function OutcomeEngineWorkspace({ organizationId, entityId }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({ organizationId });
      if (entityId) params.set("entityId", entityId);
      const response = await fetch(`/api/platform/intelligence/outcomes?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Outcome inspection failed");
      setState({ loading: false, data: payload.data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error?.message || "Outcome inspection failed" });
    }
  }, [organizationId, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const findings = Array.isArray(state.data?.findings) ? state.data.findings : [];
  const summary = state.data?.summary || {};
  const currencies = useMemo(() => [...new Set(findings.map((item) => item?.impact?.currency_code).filter(Boolean))], [findings]);
  const summaryCurrency = summary.measurable_value_currency || (currencies.length === 1 ? currencies[0] : null);
  const measuredValueLabel = summary.measurable_value === null && currencies.length > 1
    ? "Multiple currencies"
    : money(summary.measurable_value, summaryCurrency);
  return (
    <div className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#1B1916]">
      <div className="mx-auto max-w-[1720px] px-5 py-7 md:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A37849]">Analytics · Outcome Engine</div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.04em]">Money Leak Hunter</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[#716C64]">
              Detect measurable business loss from governed source records. Findings are evidence-backed proposals only; no business mutation is authorized from this workspace.
            </p>
          </div>
          <button onClick={load} disabled={state.loading} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-[10px] font-medium shadow-sm disabled:opacity-50">
            <RefreshCw size={13} className={state.loading ? "animate-spin" : ""} /> Reinspect
          </button>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Findings" value={state.loading ? "…" : summary.finding_count ?? 0} detail="Evidence-backed candidates" />
          <Metric label="Measured value" value={state.loading ? "…" : measuredValueLabel} detail={summaryCurrency ? "Potential recoverable / avoidable value" : "Totals stay separated by currency"} />
          <Metric label="Detectors" value={state.loading ? "…" : summary.detector_count ?? 0} detail="Permission-aware checks" />
          <Metric label="Execution" value="Locked" detail="Governed capability required" />
        </section>
        {state.error ? (
          <div className="mt-5 rounded-2xl border border-red-900/10 bg-white p-4 text-[11px] text-red-700">{state.error}</div>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
            <div>
              <div className="text-[11px] font-medium">Detected value leaks</div>
              <div className="mt-1 text-[9px] text-[#989188]">Highest measurable impact first. A finding is not treated as a causal conclusion unless its evidence supports that claim.</div>
            </div>
            <ShieldCheck size={16} className="text-[#A37849]" />
          </div>

          {state.loading ? <div className="p-8 text-[11px] text-[#8A847C]">Inspecting governed business evidence…</div> : null}
          {!state.loading && findings.length === 0 ? (
            <div className="flex items-center gap-3 p-8 text-[11px] text-[#716C64]">
              <CheckCircle2 size={16} /> No supported leak candidates were found by the enabled detectors.
            </div>
          ) : null}
          <div className="divide-y divide-black/[0.055]">
            {findings.map((finding) => <FindingRow key={`${finding.finding_type}:${finding.source_ids?.join(",")}`} finding={finding} organizationId={organizationId} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#918A82]">{label}</div>
      <div className="mt-2 text-[24px] font-medium tracking-[-0.035em]">{value}</div>
      <div className="mt-1 text-[9px] text-[#AAA39A]">{detail}</div>
    </div>
  );
}

function FindingRow({ finding, organizationId }) {
  const level = severity(finding);
  const route = finding?.proposed_intervention?.target_route;
  const href = route ? `/workspace/${encodeURIComponent(organizationId)}${route}` : null;
  return (
    <article className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_180px_220px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {level === "critical" ? <AlertTriangle size={14} className="text-red-700" /> : <BadgeDollarSign size={14} className="text-[#A37849]" />}
          <div className="text-[12px] font-medium">{finding.title}</div>
          <span className="rounded-full border border-black/[0.07] px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[#827B72]">{finding.confidence?.level || "review"} confidence</span>
        </div>
        <p className="mt-2 max-w-4xl text-[10px] leading-5 text-[#736D65]">{finding.explanation}</p>
        <div className="mt-2 text-[8px] text-[#A19A91]">Source: {finding.source} · {finding.source_ids?.length || 0} governed record{finding.source_ids?.length === 1 ? "" : "s"}</div>
      </div>
      <div>
        <div className="text-[8px] uppercase tracking-[0.12em] text-[#999188]">Measured value</div>
        <div className="mt-1 text-[17px] font-medium">{money(finding?.impact?.amount, finding?.impact?.currency_code)}</div>
      </div>
      <div className="flex items-center justify-end">
        {href ? <Link href={href} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBFAF7] px-3 py-2 text-[9px] font-medium">Review source <ArrowRight size={12} /></Link> : null}
      </div>
    </article>
  );
}
