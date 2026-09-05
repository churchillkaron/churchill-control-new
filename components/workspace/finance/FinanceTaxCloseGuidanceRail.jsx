"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Users } from "lucide-react";

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function tone(dependency) {
  if (dependency.blocking) return "border-red-700/15 bg-red-50 text-red-800";
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

function Responsibility({ value }) {
  const client = value === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION";
  return <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.07] bg-white px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-[#6F6961]">{client ? <Users size={9} /> : <ShieldCheck size={9} />}{client ? "Client evidence · accountant validates" : "Accounting team"}</span>;
}

export default function FinanceTaxCloseGuidanceRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", guidance: null, selectedId: null, resolutionAuthority: null });

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", guidance: null, selectedId: selectedVatReturnId || null, resolutionAuthority: null });
      return;
    }
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/dependency-work", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId) throw new Error("Tax close guidance could not resolve the selected VAT filing. Refresh Tax before continuing.");
      if (body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY") throw new Error("Tax close guidance did not return the governed resolution authority. Refresh before continuing.");
      setState({ loading: false, error: "", guidance: body.guidance || null, selectedId: selectedVatReturnId, resolutionAuthority: body.resolution_authority });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax close guidance could not be loaded", guidance: null, selectedId: selectedVatReturnId, resolutionAuthority: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  const guidance = state.guidance;
  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!state.loading && !state.error && (!guidance || guidance.state === "FILED")) return null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Tax close guidance</span>{guidance ? <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${guidance.counts.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{guidance.counts.blocking ? `${guidance.counts.blocking} blocker${guidance.counts.blocking === 1 ? "" : "s"}` : guidance.state.replaceAll("_", " ")}</span> : null}</div>
          <div className="mt-1 text-[12px] font-semibold">What is stopping this filing and what accounting proof clears it.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">This rail is accounting truth only. Ownership and target dates live in Tax work coordination below; the blocker itself disappears only when live accounting or authority evidence passes.</div>
        </div>
        <button onClick={load} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !guidance ? <div className="p-4 text-[9px] text-[#817B73]">Rechecking current Tax evidence…</div> : null}

      {guidance ? <>
        <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-2 lg:grid-cols-5">
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Next accounting action</div><div className="mt-1 text-[10px] font-semibold">{guidance.next?.title || "No evidence blocker"}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Blocking</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.blocking}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Client evidence</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.client_evidence}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Accounting team</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.accountant}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Statutory deadline</div><div className="mt-1 text-[11px] font-semibold">{date(guidance.filing_due_date)}</div><div className={`mt-0.5 text-[8px] ${guidance.overdue ? "text-red-800" : "text-[#918B83]"}`}>{guidance.overdue ? "Overdue" : Number.isFinite(guidance.days_remaining) ? `${guidance.days_remaining} day${guidance.days_remaining === 1 ? "" : "s"} remaining` : "Governed calendar"}</div></div>
        </div>

        {guidance.dependencies.length ? <div className="divide-y divide-black/[0.06]">{guidance.dependencies.map((dependency, index) => <div key={dependency.id} className="p-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${tone(dependency)}`}>{dependency.blocking ? <AlertTriangle size={9} /> : <Clock3 size={9} />}{dependency.blocking ? "Blocks filing" : "Review"}</span><Responsibility value={dependency.responsibility} />{index === 0 ? <span className="rounded-md border border-[#A37849]/15 bg-[#FFF9F0] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-[#76583A]">Next</span> : null}</div><div className="mt-2 text-[11px] font-semibold">{dependency.title}</div><div className="mt-1 text-[9px] leading-4 text-[#716B63]">{dependency.detail}</div></div><div className="shrink-0 text-right text-[8px] text-[#918B83]">Must resolve before<br/><b className="text-[#5F5952]">{date(dependency.filing_due_date)}</b></div></div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2"><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Next safe action</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{dependency.next_action}</div></div><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Resolution proof</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{dependency.resolution_rule}</div></div></div>
          {dependency.evidence_preview?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{dependency.evidence_preview.map((item, itemIndex) => <span key={`${dependency.id}:${item.source_id || itemIndex}`} className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-[8px] text-[#716B63]">{item.reference || item.source_type || item.code}</span>)}</div> : null}
          {dependency.client_request_recommended ? <div className="mt-2 rounded-lg border border-[#A37849]/15 bg-[#FFF9F0] p-2.5 text-[8px] leading-4 text-[#76583A]"><b>Client evidence candidate.</b> Use the governed client-request bridge below when a real request exists. No message is sent automatically, and the dependency remains open until Finance validates the accounting evidence.</div> : null}
        </div>)}</div> : <div className="m-3 flex items-start gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2.5 text-[9px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5" /><div><b>No live close dependency is blocking this filing.</b> Continue with the governed calculation or filing action shown in Tax.</div></div>}

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">{guidance.truth_rule} {guidance.communication_rule} Resolution authority: {state.resolutionAuthority === "LIVE_TAX_PREFLIGHT_ONLY" ? "live Tax preflight only" : "unverified"}.</div>
      </> : null}
    </div>
  </section>;
}
