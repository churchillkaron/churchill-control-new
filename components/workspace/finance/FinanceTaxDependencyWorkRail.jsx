"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LockKeyhole, RefreshCw, UserCheck, Users } from "lucide-react";

function clean(value) {
  return String(value ?? "").trim();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function blankDraft(envelope) {
  return {
    target_at: envelope?.target_at ? String(envelope.target_at).slice(0, 10) : "",
    note: envelope?.note || "",
  };
}

export default function FinanceTaxDependencyWorkRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", body: null });
  const [busyCode, setBusyCode] = useState("");
  const [drafts, setDrafts] = useState({});

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", body: null });
      return;
    }
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/dependency-work", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId) throw new Error("Tax dependency work resolved a different VAT filing. Refresh Tax before continuing.");
      setState({ loading: false, error: "", body });
      const envelopeByCode = new Map((body.envelopes || []).map(row => [String(row.dependency_code).toUpperCase(), row]));
      setDrafts(Object.fromEntries((body.guidance?.dependencies || []).map(item => [item.code, blankDraft(envelopeByCode.get(item.code))])));
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax dependency work could not be loaded", body: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  const guidance = state.body?.guidance || null;
  const currentUserId = state.body?.current_user_id || null;
  const envelopeByCode = useMemo(() => new Map((state.body?.envelopes || []).map(row => [String(row.dependency_code).toUpperCase(), row])), [state.body?.envelopes]);
  const dependencies = guidance?.dependencies || [];
  const activeEnvelopes = dependencies.map(item => envelopeByCode.get(item.code)).filter(Boolean);
  const mine = activeEnvelopes.filter(row => row.assigned_to && row.assigned_to === currentUserId).length;
  const assignedElsewhere = activeEnvelopes.filter(row => row.assigned_to && row.assigned_to !== currentUserId).length;
  const unowned = dependencies.length - activeEnvelopes.filter(row => row.assigned_to).length;

  async function action(dependencyCode, actionName, extras = {}) {
    try {
      setBusyCode(dependencyCode);
      setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/dependency-work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          vatReturnId: selectedVatReturnId,
          dependencyCode,
          action: actionName,
          ...extras,
        }),
      });
      await load();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || "Tax dependency work could not be updated" }));
    } finally {
      setBusyCode("");
    }
  }

  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!state.loading && !state.error && (!guidance || guidance.state === "FILED" || dependencies.length === 0)) return null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Tax work coordination</div>
          <div className="mt-1 text-[12px] font-semibold">Own the work without owning the accounting truth.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Assignment, target dates, acknowledgment and notes persist for the team. They cannot resolve a Tax dependency; only corrected live accounting or authority evidence can do that.</div>
        </div>
        <button onClick={load} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !guidance ? <div className="p-4 text-[9px] text-[#817B73]">Loading Tax work ownership…</div> : null}

      {guidance ? <>
        <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-3">
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Owned by me</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{mine}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Owned by colleague</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{assignedElsewhere}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Unowned</div><div className={`mt-1 text-[11px] font-semibold tabular-nums ${unowned ? "text-amber-900" : "text-emerald-800"}`}>{unowned}</div></div>
        </div>

        <div className="divide-y divide-black/[0.06]">{dependencies.map(dependency => {
          const envelope = envelopeByCode.get(dependency.code) || null;
          const ownedByMe = Boolean(envelope?.assigned_to && envelope.assigned_to === currentUserId);
          const ownedByOther = Boolean(envelope?.assigned_to && envelope.assigned_to !== currentUserId);
          const readOnly = ownedByOther;
          const draft = drafts[dependency.code] || blankDraft(envelope);
          return <div key={dependency.id} className="p-3.5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${dependency.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{dependency.blocking ? "Live blocker" : "Live warning"}</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.07] bg-[#FAF9F7] px-2 py-1 text-[8px] font-semibold text-[#68625B]">{ownedByMe ? <UserCheck size={9} /> : <Users size={9} />}{ownedByMe ? "Owned by me" : ownedByOther ? "Owned by colleague" : "Unowned"}</span>
                  {envelope?.acknowledged_at ? <span className="inline-flex items-center gap-1 rounded-md border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-800"><CheckCircle2 size={9} /> Acknowledged</span> : null}
                  {readOnly ? <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-[#F4F2EE] px-2 py-1 text-[8px] font-semibold text-[#716B63]"><LockKeyhole size={9} /> Read-only while owned by colleague</span> : null}
                </div>
                <div className="mt-2 text-[11px] font-semibold">{dependency.title}</div>
                <div className="mt-1 text-[9px] leading-4 text-[#716B63]">{dependency.next_action}</div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {!envelope?.assigned_to ? <button onClick={() => action(dependency.code, "TAKE_OWNERSHIP")} disabled={busyCode === dependency.code} className="h-8 rounded-lg bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white disabled:opacity-40">Take ownership</button> : null}
                {ownedByMe ? <button onClick={() => action(dependency.code, "RELEASE_OWNERSHIP")} disabled={busyCode === dependency.code} className="h-8 rounded-lg border border-black/[0.09] bg-white px-2.5 text-[8px] font-semibold disabled:opacity-40">Release</button> : null}
                {!envelope?.acknowledged_at ? <button onClick={() => action(dependency.code, "ACKNOWLEDGE")} disabled={busyCode === dependency.code || readOnly} className="h-8 rounded-lg border border-black/[0.09] bg-white px-2.5 text-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-35">Acknowledge</button> : null}
              </div>
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-[180px_minmax(280px,1fr)_auto] lg:items-end">
              <label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Internal target<input type="date" value={draft.target_at} disabled={readOnly} onChange={event => setDrafts(current => ({ ...current, [dependency.code]: { ...draft, target_at: event.target.value } }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal disabled:cursor-not-allowed disabled:bg-[#F3F1ED] disabled:text-[#8F8981]" /></label>
              <label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Coordination note<input value={draft.note} disabled={readOnly} onChange={event => setDrafts(current => ({ ...current, [dependency.code]: { ...draft, note: event.target.value } }))} placeholder="What the team needs to know; this does not resolve the blocker" className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-normal normal-case tracking-normal disabled:cursor-not-allowed disabled:bg-[#F3F1ED] disabled:text-[#8F8981]" /></label>
              <button onClick={() => action(dependency.code, "UPDATE_COORDINATION", { targetAt: draft.target_at || null, note: clean(draft.note) || null })} disabled={busyCode === dependency.code || readOnly} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-35">Save coordination</button>
            </div>

            {readOnly ? <div className="mt-2 rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2 text-[8px] leading-4 text-[#817B73]">A colleague currently owns this dependency. Their target, note and acknowledgment are visible for coordination, but only the current owner can change assigned work.</div> : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] text-[#918B83]">
              <span className="inline-flex items-center gap-1"><Clock3 size={9} /> Statutory due {date(dependency.filing_due_date)}</span>
              {envelope?.target_at ? <span>Internal target {date(envelope.target_at)}</span> : null}
              <span>Resolution authority: live Tax preflight only</span>
            </div>
          </div>;
        })}</div>

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">Coordination records remain available for audit history after accounting truth clears the dependency. No control in this rail can mark Tax evidence complete.</div>
      </> : null}
    </div>
  </section>;
}
