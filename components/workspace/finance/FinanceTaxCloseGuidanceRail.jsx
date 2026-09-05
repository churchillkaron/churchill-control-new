"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, UserRoundCheck, Users } from "lucide-react";

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function dateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
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

function CoordinationPanel({ dependency, envelope, currentUserId, busy, onAction }) {
  const ownedByMe = Boolean(envelope?.assigned_to && envelope.assigned_to === currentUserId);
  const ownedByAnother = Boolean(envelope?.assigned_to && envelope.assigned_to !== currentUserId);
  const [targetAt, setTargetAt] = useState(dateInput(envelope?.target_at));
  const [note, setNote] = useState(envelope?.note || "");

  useEffect(() => {
    setTargetAt(dateInput(envelope?.target_at));
    setNote(envelope?.note || "");
  }, [envelope?.id, envelope?.target_at, envelope?.note]);

  const disabled = Boolean(busy) || ownedByAnother;

  return <div className="mt-3 rounded-lg border border-black/[0.07] bg-[#FCFBF9] p-2.5">
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#8A837B]">Human coordination envelope</div>
        <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Ownership, target and notes persist. They never change whether this Tax dependency is resolved.</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ownedByAnother ? <span className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-700/15 bg-amber-50 px-2 text-[8px] font-semibold text-amber-900"><UserRoundCheck size={9} /> Owned by another accountant</span> : null}
        {!envelope?.assigned_to ? <button disabled={busy} onClick={() => onAction(dependency, "TAKE_OWNERSHIP")} className="h-7 rounded-md border border-black/[0.09] bg-white px-2 text-[8px] font-semibold disabled:opacity-40">Take ownership</button> : null}
        {ownedByMe ? <button disabled={busy} onClick={() => onAction(dependency, "RELEASE_OWNERSHIP")} className="h-7 rounded-md border border-black/[0.09] bg-white px-2 text-[8px] font-semibold disabled:opacity-40">Release ownership</button> : null}
        {!envelope?.acknowledged_at && !ownedByAnother ? <button disabled={busy} onClick={() => onAction(dependency, "ACKNOWLEDGE")} className="h-7 rounded-md border border-[#A37849]/15 bg-[#FFF9F0] px-2 text-[8px] font-semibold text-[#76583A] disabled:opacity-40">Acknowledge</button> : null}
        {envelope?.acknowledged_at ? <span className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-700/15 bg-emerald-50 px-2 text-[8px] font-semibold text-emerald-800"><CheckCircle2 size={9} /> Acknowledged</span> : null}
      </div>
    </div>
    <div className="mt-2 grid gap-2 lg:grid-cols-[170px_minmax(0,1fr)_auto]">
      <label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Target date<input type="date" value={targetAt} disabled={disabled} onChange={event => setTargetAt(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal disabled:bg-[#F2F0EC]" /></label>
      <label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Coordination note<input value={note} disabled={disabled} onChange={event => setNote(event.target.value)} placeholder="Owner note, evidence being chased, handoff detail…" className="mt-1 h-8 w-full rounded-md border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal disabled:bg-[#F2F0EC]" /></label>
      <button disabled={disabled} onClick={() => onAction(dependency, "UPDATE_COORDINATION", { targetAt: targetAt || null, note })} className="mt-[17px] h-8 rounded-md bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-35">{busy === `${dependency.code}:UPDATE_COORDINATION` ? "Saving…" : "Save coordination"}</button>
    </div>
    <div className="mt-2 text-[8px] leading-4 text-[#918B83]">Resolution authority: <b className="text-[#655F58]">live Tax preflight only</b>. There is deliberately no manual complete or resolve control.</div>
  </div>;
}

export default function FinanceTaxCloseGuidanceRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", guidance: null, envelopes: [], currentUserId: null, selectedId: null, resolutionAuthority: null });
  const [busy, setBusy] = useState("");

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", guidance: null, envelopes: [], currentUserId: null, selectedId: selectedVatReturnId || null, resolutionAuthority: null });
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
      setState({
        loading: false,
        error: "",
        guidance: body.guidance || null,
        envelopes: Array.isArray(body.envelopes) ? body.envelopes : [],
        currentUserId: body.current_user_id || null,
        selectedId: selectedVatReturnId,
        resolutionAuthority: body.resolution_authority,
      });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error?.message || "Tax close guidance could not be loaded", guidance: null, envelopes: [], selectedId: selectedVatReturnId }));
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  const envelopeByCode = useMemo(() => new Map(state.envelopes.filter(row => row?.truth_active !== false).map(row => [String(row.dependency_code || "").toUpperCase(), row])), [state.envelopes]);
  const guidance = state.guidance;

  async function coordinate(dependency, action, extras = {}) {
    if (!dependency?.code || busy) return;
    const key = `${dependency.code}:${action}`;
    try {
      setBusy(key);
      setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/dependency-work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, vatReturnId: selectedVatReturnId, dependencyCode: dependency.code, action, ...extras }),
      });
      await load();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || "Tax dependency coordination could not be updated" }));
    } finally {
      setBusy("");
    }
  }

  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!state.loading && !state.error && (!guidance || guidance.state === "FILED")) return null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Tax close guidance</span>{guidance ? <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${guidance.counts.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{guidance.counts.blocking ? `${guidance.counts.blocking} blocker${guidance.counts.blocking === 1 ? "" : "s"}` : guidance.state.replaceAll("_", " ")}</span> : null}</div>
          <div className="mt-1 text-[12px] font-semibold">What is stopping this filing, who owns the next move, and what proves it is resolved.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Live VAT evidence creates the dependency. Human ownership, target dates and notes persist around it, but the blocker disappears only after the underlying accounting or authority condition passes.</div>
        </div>
        <button onClick={load} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !guidance ? <div className="p-4 text-[9px] text-[#817B73]">Rechecking live Tax evidence and coordination ownership…</div> : null}

      {guidance ? <>
        <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-2 lg:grid-cols-5">
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Next action</div><div className="mt-1 text-[10px] font-semibold">{guidance.next?.title || "No evidence blocker"}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Blocking</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.blocking}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Client evidence</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.client_evidence}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Accounting team</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{guidance.counts.accountant}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Statutory deadline</div><div className="mt-1 text-[11px] font-semibold">{date(guidance.filing_due_date)}</div><div className={`mt-0.5 text-[8px] ${guidance.overdue ? "text-red-800" : "text-[#918B83]"}`}>{guidance.overdue ? "Overdue" : Number.isFinite(guidance.days_remaining) ? `${guidance.days_remaining} day${guidance.days_remaining === 1 ? "" : "s"} remaining` : "Governed calendar"}</div></div>
        </div>

        {guidance.dependencies.length ? <div className="divide-y divide-black/[0.06]">{guidance.dependencies.map((dependency, index) => {
          const envelope = envelopeByCode.get(String(dependency.code || "").toUpperCase()) || null;
          return <div key={dependency.id} className="p-3.5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${tone(dependency)}`}>{dependency.blocking ? <AlertTriangle size={9} /> : <Clock3 size={9} />}{dependency.blocking ? "Blocks filing" : "Review"}</span><Responsibility value={dependency.responsibility} />{index === 0 ? <span className="rounded-md border border-[#A37849]/15 bg-[#FFF9F0] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-[#76583A]">Next</span> : null}{envelope?.assigned_to === state.currentUserId ? <span className="rounded-md border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-emerald-800">Owned by me</span> : null}</div><div className="mt-2 text-[11px] font-semibold">{dependency.title}</div><div className="mt-1 text-[9px] leading-4 text-[#716B63]">{dependency.detail}</div></div><div className="shrink-0 text-right text-[8px] text-[#918B83]">Must resolve before<br/><b className="text-[#5F5952]">{date(dependency.filing_due_date)}</b></div></div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2"><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Next safe action</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{dependency.next_action}</div></div><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Resolution proof</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{dependency.resolution_rule}</div></div></div>
            {dependency.evidence_preview?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{dependency.evidence_preview.map((item, itemIndex) => <span key={`${dependency.id}:${item.source_id || itemIndex}`} className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-[8px] text-[#716B63]">{item.reference || item.source_type || item.code}</span>)}</div> : null}
            <CoordinationPanel dependency={dependency} envelope={envelope} currentUserId={state.currentUserId} busy={busy} onAction={coordinate} />
            {dependency.client_request_recommended ? <div className="mt-2 rounded-lg border border-[#A37849]/15 bg-[#FFF9F0] p-2.5 text-[8px] leading-4 text-[#76583A]"><b>Client evidence candidate.</b> Avantiqo can prepare a governed request for the missing registration evidence, but this panel never sends a message automatically. The dependency remains open until Finance validates the evidence in the entity/profile.</div> : null}
          </div>;
        })}</div> : <div className="m-3 flex items-start gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2.5 text-[9px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5" /><div><b>No live close dependency is blocking this filing.</b> Continue with the governed calculation or filing action shown in Tax.</div></div>}

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">{guidance.truth_rule} {guidance.communication_rule} Coordination authority: {state.resolutionAuthority === "LIVE_TAX_PREFLIGHT_ONLY" ? "live Tax preflight only" : "unverified"}.</div>
      </> : null}
    </div>
  </section>;
}
