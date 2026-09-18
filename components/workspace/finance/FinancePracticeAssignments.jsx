"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

function Field({ label, value, onChange, staff, disabled }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#817B72]">{label}</span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1.5 h-9 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[11px] text-[#403C37] outline-none disabled:opacity-50"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {(staff || []).map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}{person.position ? ` · ${person.position}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function FinancePracticeAssignments({ organizationId, engagementId, onSaved }) {
  const [state, setState] = useState({ loading: true, saving: false, error: "", notice: "", staff: [], profile: null });
  const [form, setForm] = useState({ preparer: "", reviewer: "", partner: "" });

  async function load() {
    if (!organizationId || !engagementId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/practice-assignments", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("engagementId", engagementId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load engagement staffing");
      const profile = body.profile || {};
      setForm({
        preparer: profile.assigned_accountant_id || "",
        reviewer: profile.assigned_reviewer_id || "",
        partner: profile.assigned_partner_id || "",
      });
      setState({ loading: false, saving: false, error: "", notice: "", staff: body.staff || [], profile });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load engagement staffing" }));
    }
  }
  useEffect(() => { load(); }, [organizationId, engagementId]);

  async function save() {
    if (!form.preparer || !form.reviewer || !form.partner || state.saving) return;
    try {
      setState((current) => ({ ...current, saving: true, error: "", notice: "" }));
      const response = await fetch("/api/workspace/finance/practice-assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          engagementId,
          assignedAccountantId: form.preparer,
          assignedReviewerId: form.reviewer,
          assignedPartnerId: form.partner,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to save engagement staffing");
      const assignment = body?.assignment || {};
      await load();
      setState((current) => ({
        ...current,
        saving: false,
        notice: `Engagement staffing saved. ${Number(assignment.open_work_items_reassigned || 0)} open work item${Number(assignment.open_work_items_reassigned || 0) === 1 ? "" : "s"} reassigned; ${Number(assignment.historical_or_signed_work_items_preserved || 0)} signed or completed item${Number(assignment.historical_or_signed_work_items_preserved || 0) === 1 ? "" : "s"} preserved.`,
      }));
      await onSaved?.();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error?.message || "Unable to save engagement staffing" }));
    }
  }
  const duplicate = Boolean(
    form.preparer &&
    form.reviewer &&
    form.partner &&
    new Set([form.preparer, form.reviewer, form.partner]).size !== 3
  );
  const complete = Boolean(form.preparer && form.reviewer && form.partner && !duplicate);

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white">
      <div className="border-b border-black/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement staffing</div>
        <div className="mt-1 text-[11px] leading-4 text-[#918B83]">Preparer, reviewer and partner must be three different active members of this accounting firm before recurring work can be created.</div>
      </div>
      <div className="p-4">
        {state.error ? <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[11px] text-red-800"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{state.error}</div> : null}
        {state.notice ? <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-700/15 bg-emerald-50 p-3 text-[11px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />{state.notice}</div> : null}
        {state.staff.length < 3 && !state.loading ? <div className="mb-3 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[11px] text-amber-900"><div className="font-semibold">Three active firm members are required</div><div className="mt-1 leading-4">This engagement requires separate preparer, reviewer and partner signers. Add or activate accounting staff before assigning these roles.</div><a href={`/workspace/${organizationId}/people/directory`} className="mt-2 inline-flex h-7 items-center rounded-lg border border-amber-800/15 bg-white px-2.5 text-[9px] font-semibold text-amber-900">Open People directory</a></div> : null}
        {duplicate ? <div className="mb-3 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[11px] text-amber-900">Segregation of duties requires different people for all three roles.</div> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Preparer" value={form.preparer} onChange={(value) => setForm((current) => ({ ...current, preparer: value }))} staff={state.staff} disabled={state.loading || state.saving} />
          <Field label="Reviewer" value={form.reviewer} onChange={(value) => setForm((current) => ({ ...current, reviewer: value }))} staff={state.staff} disabled={state.loading || state.saving} />
          <Field label="Partner" value={form.partner} onChange={(value) => setForm((current) => ({ ...current, partner: value }))} staff={state.staff} disabled={state.loading || state.saving} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] text-[#918B83]">{state.loading ? "Loading active firm members…" : `${state.staff.length} active firm member${state.staff.length === 1 ? "" : "s"} available`}</div>
          <button type="button" onClick={save} disabled={!complete || state.loading || state.saving} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#5F452D] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40">
            {state.saving ? <LoaderCircle size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            {state.saving ? "Saving…" : "Save staffing"}
          </button>
        </div>
      </div>
    </section>
  );
}
