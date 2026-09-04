"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { getFinanceTaxCalendarOptions, resolveFinanceTaxDeadline } from "@/lib/finance/tax/FinanceTaxCalendarPolicy";

const clean = value => String(value ?? "").trim();
const formatDate = value => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : "—";

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

export default function FinanceTaxCalendarRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", body: null });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState("ONLINE");
  const [override, setOverride] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");

  async function load() {
    if (!organizationId || !entityId) return;
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/tax/runtime", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      if (selectedVatReturnId) url.searchParams.set("vatReturnId", selectedVatReturnId);
      const body = await jsonRequest(url.toString());
      const row = body.preflight?.return || body.returns?.[0] || null;
      if (selectedVatReturnId && row?.id !== selectedVatReturnId) throw new Error("Tax calendar could not resolve the selected VAT filing. Refresh Tax before continuing.");
      setState({ loading: false, error: "", body });
      const meta = row?.metadata?.tax_calendar || {};
      setChannel(meta.filing_channel || "ONLINE");
      setDueDate(row?.filing_due_date || "");
      setOverride(Boolean(meta.override));
      setReason(meta.override?.reason || meta.human_confirmation?.reason || "");
      setEvidence(meta.override?.evidence_reference || meta.human_confirmation?.evidence_reference || "");
      setEditing(false);
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax calendar could not be loaded", body: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  const row = state.body?.preflight?.return || state.body?.returns?.[0] || null;
  const metadata = row?.metadata?.tax_calendar || null;
  const storedResolution = state.body?.preflight?.tax_calendar?.resolution || null;
  const preview = useMemo(() => row?.period_end ? resolveFinanceTaxDeadline({
    jurisdictionCode: row.jurisdiction_code,
    formCode: metadata?.form_code || "PP30",
    filingChannel: channel,
    periodEnd: row.period_end,
  }) : null, [row, metadata, channel]);
  const options = getFinanceTaxCalendarOptions(row?.jurisdiction_code || state.body?.setup?.suggested_jurisdiction || "");
  const resolution = editing ? preview : storedResolution;
  const displayedDueDate = editing && !override ? preview?.statutory_due_date : row?.filing_due_date;
  const verified = resolution?.verification_status === "OFFICIAL_CALENDAR_VERIFIED";

  async function save() {
    if (!row?.id || !preview) return;
    const needsEvidence = override || !preview.supported || preview.verification_status !== "OFFICIAL_CALENDAR_VERIFIED";
    if (needsEvidence && (!clean(dueDate) || !clean(reason) || !clean(evidence))) {
      setState(current => ({ ...current, error: "A manual or overridden filing deadline requires date, reason and authority evidence." }));
      return;
    }
    try {
      setBusy(true);
      setState(current => ({ ...current, error: "" }));
      await jsonRequest("/api/finance/tax/runtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, vatReturnId: row.id, filingFormCode: metadata?.form_code || "PP30", filingChannel: channel, filingDueDate: needsEvidence ? dueDate : null, deadlineOverrideReason: needsEvidence ? reason : null, deadlineOverrideEvidenceReference: needsEvidence ? evidence : null }),
      });
      setEditing(false);
      await load();
      window.dispatchEvent(new CustomEvent("workspace:refresh"));
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || "Filing deadline could not be updated" }));
    } finally { setBusy(false); }
  }

  if (!organizationId || !entityId || (!row && !state.loading)) return null;

  return (
    <section className="mx-auto mt-4 max-w-[1760px] px-4 sm:px-5 lg:px-6">
      <div className="rounded-xl border border-[#A37849]/18 bg-[#FFF9F0] p-3.5 text-[#2A2723]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633E]"><CalendarClock size={12} /> Statutory filing calendar</span>{resolution ? <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${verified ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{metadata?.override ? "Human override" : verified ? "Official calendar verified" : "Authority review required"}</span> : null}</div>
            {row ? <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><div><div className="text-[8px] uppercase tracking-[0.08em] text-[#968B80]">Form</div><div className="mt-1 text-[11px] font-semibold">{resolution?.form_label || "VAT return"}</div></div><div><div className="text-[8px] uppercase tracking-[0.08em] text-[#968B80]">Filing channel</div><div className="mt-1 text-[11px] font-semibold">{resolution?.filing_channel_label || channel}</div></div><div><div className="text-[8px] uppercase tracking-[0.08em] text-[#968B80]">Base date</div><div className="mt-1 text-[11px] font-semibold">{formatDate(resolution?.base_due_date)}</div></div><div><div className="text-[8px] uppercase tracking-[0.08em] text-[#968B80]">Authority adjusted</div><div className="mt-1 text-[11px] font-semibold">{formatDate(resolution?.statutory_due_date)}</div></div><div><div className="text-[8px] uppercase tracking-[0.08em] text-[#968B80]">Recorded deadline</div><div className="mt-1 text-[11px] font-semibold">{formatDate(displayedDueDate)}</div></div></div> : <div className="mt-2 text-[10px] text-[#817B73]">Create a VAT filing obligation below; Avantiqo will resolve its statutory deadline automatically.</div>}
            {resolution?.adjustment?.applied ? <div className="mt-2 text-[9px] text-[#76583A]">Deadline moved {resolution.adjustment.days} day{resolution.adjustment.days === 1 ? "" : "s"} · {String(resolution.adjustment.reason || "").replaceAll("_", " ")}</div> : null}
            {metadata?.override ? <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-700/12 bg-white/70 px-2.5 py-2 text-[9px] text-amber-900"><ShieldAlert size={11} /><b>Controlled override:</b> {metadata.override.reason} · {metadata.override.evidence_reference}</div> : null}
            {resolution?.authority?.url ? <a href={resolution.authority.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-[#7D5B39] underline underline-offset-2">Revenue Department source <ExternalLink size={9} /></a> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={load} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>{row && String(row.status || "").toUpperCase() !== "SUBMITTED" ? <button type="button" onClick={() => setEditing(value => !value)} className="h-8 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white">{editing ? "Close deadline control" : "Review deadline"}</button> : null}</div>
        </div>
        {state.error ? <div className="mt-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
        {editing && row ? <div className="mt-3 grid gap-3 border-t border-[#A37849]/15 pt-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#817B73]">Filing channel<select value={channel} onChange={event => { setChannel(event.target.value); setOverride(false); setReason(""); setEvidence(""); }} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[10px] font-normal normal-case tracking-normal">{options.filing_channels.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><div className="rounded-lg border border-black/[0.07] bg-white/65 p-2.5"><label className="flex items-center gap-2 text-[9px] font-semibold"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} /> Override authority-adjusted date</label><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Channel changes recalculate automatically. Changing the legal date requires a reason and authority evidence.</div>{override || !preview?.supported || preview?.verification_status !== "OFFICIAL_CALENDAR_VERIFIED" ? <div className="mt-2 grid gap-2 md:grid-cols-3"><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="h-8 rounded-lg border border-black/[0.09] bg-white px-2 text-[9px]" /><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason / authority confirmation" className="h-8 rounded-lg border border-black/[0.09] bg-white px-2 text-[9px]" /><input value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Authority notice / case / URL" className="h-8 rounded-lg border border-black/[0.09] bg-white px-2 text-[9px]" /></div> : null}</div><button type="button" onClick={save} disabled={busy} className="self-end h-9 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-40">{busy ? "Applying…" : "Apply governed deadline"}</button></div> : null}
      </div>
    </section>
  );
}
