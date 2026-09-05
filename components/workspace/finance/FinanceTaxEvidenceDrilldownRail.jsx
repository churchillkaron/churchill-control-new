"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, FileSearch2, RefreshCw, ShieldCheck } from "lucide-react";

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function sourceLabel(value) {
  return String(value || "Evidence").replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase());
}

function EvidenceRecord({ issue }) {
  const source = issue.source_record || null;
  const line = issue.tax_line || null;
  const rule = issue.tax_rule || null;
  const journal = issue.posting_journal || null;
  const target = issue.workspace_target || null;
  const navigation = issue.source_navigation || null;

  return <div className="rounded-lg border border-black/[0.07] bg-white p-3">
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${issue.severity === "WARNING" ? "border-amber-700/15 bg-amber-50 text-amber-900" : "border-red-700/15 bg-red-50 text-red-800"}`}>{issue.severity === "WARNING" ? "Review" : "Blocking evidence"}</span>
          <span className="rounded-md border border-black/[0.06] bg-[#F7F6F3] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-[#716B63]">{sourceLabel(issue.source_type)}</span>
          <span className="text-[8px] text-[#918B83]">{issue.code}</span>
        </div>
        <div className="mt-2 text-[11px] font-semibold">{issue.reference || issue.source_id || "Governed evidence"}</div>
        <div className="mt-1 text-[9px] leading-4 text-[#716B63]">{issue.detail}</div>
      </div>
      <div className="shrink-0 text-right text-[8px] leading-4 text-[#918B83]">
        <div>{date(issue.date)}</div>
        {money(issue.amount) ? <div className="font-semibold text-[#5F5952]">Tax amount {money(issue.amount)}</div> : null}
      </div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Source document</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{source ? <>{source.reference || source.id}<br/>Status {source.status || "—"}{source.approval_status ? ` · ${source.approval_status}` : ""}{source.currency_code ? <><br/>{source.currency_code} · rate {source.exchange_rate ?? "missing"}</> : null}</> : "Context evidence"}</div></div>
      <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Tax line</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{line ? <>Line {line.line_number ?? line.id ?? "—"}<br/>Tax {money(line.tax_amount) || "—"}{line.tax_rule_id ? <><br/>Rule {line.tax_rule_id}</> : null}</> : "No line-level record for this blocker"}</div></div>
      <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Governed VAT rule</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{rule ? <>{rule.tax_code || rule.id} · {rule.tax_rate ?? "—"}%<br/>{rule.is_active ? "Active" : "Inactive"} · {date(rule.effective_from)} → {date(rule.effective_to)}</> : "Missing or not applicable"}</div></div>
      <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Posting proof</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{journal ? <>{journal.reference || journal.id}<br/>{journal.status || "—"}{journal.reversed ? " · reversed" : " · not reversed"}</> : "No linked posting evidence"}</div></div>
    </div>

    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-black/[0.05] bg-[#FAF9F7] px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-[8px] text-[#817B73]"><span className="font-mono">{issue.source_id || "context"}</span><span className="ml-2">{target ? `Exact ${String(target.workspace).replaceAll("_", " ")} record · Business Context stays fixed` : "Governed context evidence"}</span></div>
      {navigation?.href ? <a href={navigation.href} className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">Open exact source <ArrowUpRight size={9}/></a> : <span className="shrink-0 text-[8px] font-semibold text-[#918B83]">No direct source route</span>}
    </div>
  </div>;
}

export default function FinanceTaxEvidenceDrilldownRail({ organizationId, entityId, selectedVatReturnId, focusDependencyCode = null }) {
  const [guidanceState, setGuidanceState] = useState({ loading: false, error: "", guidance: null });
  const [selectedCode, setSelectedCode] = useState(null);
  const [evidenceState, setEvidenceState] = useState({ loading: false, error: "", body: null });
  const pageSize = 25;

  async function loadGuidance() {
    if (!organizationId || !entityId || !selectedVatReturnId) return;
    try {
      setGuidanceState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/dependency-work", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId || body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY") throw new Error("Tax evidence inspector could not verify the selected filing and resolution authority.");
      const dependencies = body.guidance?.dependencies || [];
      const requestedFocus = String(focusDependencyCode || "").trim().toUpperCase();
      setGuidanceState({ loading: false, error: "", guidance: body.guidance || null });
      setSelectedCode(current => {
        if (requestedFocus && dependencies.some(item => item.code === requestedFocus)) return requestedFocus;
        if (dependencies.some(item => item.code === current)) return current;
        return dependencies[0]?.code || null;
      });
    } catch (error) {
      setGuidanceState({ loading: false, error: error?.message || "Tax evidence dependencies could not be loaded", guidance: null });
      setSelectedCode(null);
    }
  }

  async function loadEvidence(code = selectedCode, offset = 0) {
    if (!organizationId || !entityId || !selectedVatReturnId || !code) return;
    try {
      setEvidenceState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/evidence-drilldown", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      url.searchParams.set("dependencyCode", code);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(pageSize));
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId || body.entity_id !== entityId) throw new Error("Tax evidence inspector returned a different filing scope.");
      if (body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY" || body.mutation_authority !== false || body.context_mutation_authority !== false) throw new Error("Tax evidence inspector returned unsafe authority.");
      setEvidenceState({ loading: false, error: "", body });
    } catch (error) {
      setEvidenceState({ loading: false, error: error?.message || "Tax evidence could not be loaded", body: null });
    }
  }

  useEffect(() => {
    setGuidanceState({ loading: false, error: "", guidance: null });
    setSelectedCode(null);
    setEvidenceState({ loading: false, error: "", body: null });
    loadGuidance();
  }, [organizationId, entityId, selectedVatReturnId, focusDependencyCode]);

  useEffect(() => {
    setEvidenceState({ loading: false, error: "", body: null });
    if (selectedCode) loadEvidence(selectedCode, 0);
  }, [selectedCode]);

  const dependencies = guidanceState.guidance?.dependencies || [];
  const selected = useMemo(() => dependencies.find(item => item.code === selectedCode) || null, [dependencies, selectedCode]);
  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!guidanceState.loading && !guidanceState.error && dependencies.length === 0) return null;

  const body = evidenceState.body;
  const population = body?.population || null;
  const offset = population?.offset || 0;
  const first = population?.total ? offset + 1 : 0;
  const last = population?.total ? offset + (population.returned || 0) : 0;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]"><FileSearch2 size={11}/> VAT evidence trace</span><span className="rounded-md border border-black/[0.07] bg-[#F7F6F3] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-[#716B63]">Read only · full population</span></div>
          <div className="mt-1 text-[12px] font-semibold">Start with the VAT control, then trace it to the exact transaction.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Choose the live VAT control below. Avantiqo rebuilds the complete filing population, isolates every affected source record, and keeps the legal entity and filing context fixed while you inspect the exact accounting evidence. Viewing evidence never switches Business Context.</div>
        </div>
        <button type="button" onClick={loadGuidance} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={guidanceState.loading ? "animate-spin" : ""}/> Refresh truth</button>
      </div>

      {guidanceState.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{guidanceState.error}</div> : null}

      <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-3">
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">1 · VAT control</div><div className="mt-1 text-[10px] font-semibold">Choose what needs proof</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Only controls that still exist in live Tax truth appear here.</div></div>
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">2 · Source population</div><div className="mt-1 text-[10px] font-semibold">Review every affected record</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Pagination is only presentation; the blocker is rebuilt against the complete filing population.</div></div>
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">3 · Exact source</div><div className="mt-1 text-[10px] font-semibold">Open the accounting record</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">The source workspace receives exact record focus and a route back to Tax without changing Business Context.</div></div>
      </div>

      {dependencies.length ? <div className="flex gap-1.5 overflow-x-auto border-b border-black/[0.07] bg-[#FAF9F7] p-2.5">{dependencies.map((item, index) => <button key={item.code} type="button" onClick={() => setSelectedCode(item.code)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-semibold ${item.code === selectedCode ? "border-[#A37849]/25 bg-[#FFF9F0] text-[#76583A]" : "border-black/[0.07] bg-white text-[#716B63]"}`}>{index === 0 ? "Next · " : ""}{item.title} · {item.evidence_count || 0}</button>)}</div> : null}

      {selected ? <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-3">
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Selected VAT control</div><div className="mt-1 text-[10px] font-semibold">{selected.title}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{selected.code}</div></div>
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Next safe action</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{selected.next_action}</div></div>
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Resolution proof</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{selected.resolution_rule}</div></div>
      </div> : null}

      {evidenceState.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{evidenceState.error}</div> : null}
      {evidenceState.loading && !body ? <div className="p-4 text-[9px] text-[#817B73]">Re-evaluating full filing population…</div> : null}

      {body ? <>
        <div className="flex flex-col gap-2 border-b border-black/[0.07] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="text-[8px] text-[#817B73]"><strong className="text-[#5F5952]">{population?.complete ? "Complete live population" : "Governed context evidence"}</strong> · showing {first}–{last} of {population?.total || 0} · source {String(body.source || "").replaceAll("_", " ").toLowerCase()}</div><div className="flex items-center gap-1.5"><button type="button" disabled={offset <= 0 || evidenceState.loading} onClick={() => loadEvidence(selectedCode, Math.max(0, offset - pageSize))} className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[8px] font-semibold disabled:opacity-30"><ChevronLeft size={9}/> Previous</button><button type="button" disabled={!population?.has_more || evidenceState.loading} onClick={() => loadEvidence(selectedCode, offset + pageSize)} className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[8px] font-semibold disabled:opacity-30">Next <ChevronRight size={9}/></button></div></div>
        <div className="space-y-2 bg-[#FAF9F7] p-3">{body.issues?.length ? body.issues.map((issue, index) => <EvidenceRecord key={`${issue.code}:${issue.source_id || "context"}:${issue.tax_line?.id || index}`} issue={issue}/>) : <div className="flex items-start gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-3 text-[9px] text-emerald-800"><ShieldCheck size={12} className="mt-0.5"/><div><b>No evidence row remains for this blocker page.</b> Refresh live Tax truth; the dependency may have changed while the inspector was open.</div></div>}</div>
        <div className="border-t border-black/[0.07] bg-white px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">Resolution authority remains live Tax preflight only. Evidence inspection is read-only; it cannot post, recode, alter FX, update a VAT rule, complete work, or mutate Business Context.</div>
      </> : null}
    </div>
  </section>;
}
