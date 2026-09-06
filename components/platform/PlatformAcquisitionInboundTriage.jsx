"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Inbox, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PLATFORM_TIME_ZONE = "Asia/Bangkok";

function clean(value) {
  return String(value ?? "").trim();
}

function compactId(value) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, 8) : "—";
}

function dateLabel(value) {
  if (!value) return "Unknown time";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PLATFORM_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

async function requestInbound() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/acquisition-inbound?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Inbound evidence is unavailable");
  }
  return payload;
}

async function claimInbound(body) {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/acquisition-inbound?organizationId=${scope}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Unable to claim inbound evidence");
  }
  return payload;
}

export default function PlatformAcquisitionInboundTriage() {
  const [payload, setPayload] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [claimNote, setClaimNote] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [nextScheduleNote, setNextScheduleNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const next = await requestInbound();
      setPayload(next);
      const rows = Array.isArray(next?.inboundEvidence) ? next.inboundEvidence : [];
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : (rows[0]?.id || ""));
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Inbound evidence is unavailable");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = window.setInterval(() => load({ showLoading: false }), 60000);
    const onFocus = () => load({ showLoading: false });
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const rows = useMemo(() => Array.isArray(payload?.inboundEvidence) ? payload.inboundEvidence : [], [payload]);
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);
  const ready = Boolean(selected?.claimable && clean(claimNote) && clean(nextDueAt) && clean(nextScheduleNote));

  useEffect(() => {
    setClaimNote("");
    setNextDueAt("");
    setNextScheduleNote("");
    setNotice("");
  }, [selectedId]);

  const submit = useCallback(async (event) => {
    event.preventDefault();
    if (!selected || !ready || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await claimInbound({
        leadId: selected.id,
        claimNote: clean(claimNote),
        nextDueAt,
        nextScheduleNote: clean(nextScheduleNote),
      });
      setNotice("Inbound evidence was claimed as a canonical prospect with its first owner obligation.");
      setClaimNote("");
      setNextDueAt("");
      setNextScheduleNote("");
      await load({ showLoading: false });
      window.dispatchEvent(new CustomEvent("avantiqo:acquisition-changed"));
    } catch (saveError) {
      setError(saveError?.message || "Unable to claim inbound evidence");
    } finally {
      setSaving(false);
    }
  }, [claimNote, load, nextDueAt, nextScheduleNote, ready, saving, selected]);

  return (
    <section className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
        <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]"><Inbox size={12} /> Inbound evidence</div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">Stored intent is evidence. Owner claim creates the prospect.</h2>
            <p className="mt-1 max-w-4xl text-[9px] leading-4 text-[#918B83]">Nothing here is automatically counted as an acquisition opportunity. Avantiqo re-reads the exact stored lead, binds the authenticated Platform owner server-side, then creates PROSPECT and its first owner obligation atomically only after an explicit claim.</p>
          </div>
          <button type="button" onClick={() => load()} disabled={loading} className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] disabled:opacity-50"><RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh evidence</button>
        </div>

        {error ? <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-[9px] text-red-800"><TriangleAlert size={12} className="mt-0.5 shrink-0" />{error}</div> : null}
        {notice ? <div className="flex items-start gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-[9px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />{notice}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">
          <div className="border-b border-black/[0.06] p-3 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Unclaimed stored leads</span>
              <span className="text-[8px] text-[#AAA39A]">{payload?.summary?.unclaimed ?? 0}</span>
            </div>
            <div className="space-y-1.5">
              {rows.length ? rows.map((lead) => (
                <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selectedId === lead.id ? "border-[#B98A57]/30 bg-[#FBF7F1]" : "border-black/[0.06] bg-white hover:bg-[#FBFAF8]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[9px] font-semibold text-[#48433D]">{clean(lead.company) || `Stored lead ${compactId(lead.id)}`}</div>
                      <div className="mt-0.5 truncate text-[8px] text-[#AAA39A]">{clean(lead.contact) || "Contact missing"}{lead.email ? ` · ${lead.email}` : ""}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold ${lead.claimable ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-800"}`}>{lead.claimable ? "Claimable" : "Incomplete"}</span>
                  </div>
                  <div className="mt-1.5 text-[7px] text-[#AAA39A]">Stored {dateLabel(lead.createdAt)} · {clean(lead.status) || "status unknown"}</div>
                </button>
              )) : <div className="rounded-xl bg-[#FBFAF8] px-3 py-4 text-[8px] leading-4 text-[#918B83]">No unclaimed stored lead evidence is waiting. No prospect is created by inference.</div>}
            </div>
          </div>

          <div className="p-4">
            {selected ? <form onSubmit={submit} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Persisted inbound identity · read only</div>
                  <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#403C37]">{clean(selected.company) || "Company missing"}</div>
                  <div className="mt-1 text-[8px] text-[#918B83]">{clean(selected.contact) || "Contact missing"}{selected.email ? ` · ${selected.email}` : " · email missing"}</div>
                </div>
                <div className="text-right text-[7px] leading-3.5 text-[#AAA39A]">Evidence {compactId(selected.id)}<br />{dateLabel(selected.createdAt)} Bangkok</div>
              </div>

              {!selected.claimable ? <div className="rounded-xl border border-amber-700/15 bg-amber-50 px-3.5 py-3 text-[8px] leading-4 text-amber-800"><div className="font-semibold">Cannot claim this evidence yet.</div><div className="mt-0.5">Stored identity is incomplete: {(selected.missingIdentity || []).join(", ") || "required fields missing"}. Correct the source record; this acquisition surface never substitutes browser-entered identity.</div></div> : null}

              <label className="block">
                <span className="text-[8px] font-medium text-[#777168]">Why the owner accepts this as a genuine prospect *</span>
                <textarea value={claimNote} onChange={(event) => setClaimNote(event.target.value)} rows={3} placeholder="Record the observable intent that justifies claiming this stored lead." className="mt-1 w-full resize-none rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px] leading-4 text-[#48423C] outline-none focus:border-[#B98A57]/45" />
              </label>

              <div className="rounded-xl border border-[#B98A57]/20 bg-[#FBF7F1] p-3.5">
                <div className="flex items-start gap-2"><Clock3 size={12} className="mt-0.5 shrink-0 text-[#9A7248]" /><div><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A643C]">First owner obligation · required</div><p className="mt-1 text-[8px] leading-4 text-[#91877A]">Claim and owner obligation are one transaction. A live prospect cannot be created unscheduled.</p></div></div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <label className="block"><span className="text-[8px] font-medium text-[#777168]">Due · Bangkok (UTC+7) *</span><input type="datetime-local" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45" /></label>
                  <label className="block"><span className="text-[8px] font-medium text-[#777168]">Why this timing / what must happen *</span><textarea value={nextScheduleNote} onChange={(event) => setNextScheduleNote(event.target.value)} rows={3} placeholder="Example: call after reviewing the inbound request and confirm decision scope." className="mt-1 w-full resize-none rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[9px] leading-4 text-[#48423C] outline-none focus:border-[#B98A57]/45" /></label>
                </div>
              </div>

              <button type="submit" disabled={!ready || saving} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">{saving ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Claim inbound + schedule owner action</button>
            </form> : <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-black/[0.08] bg-[#FBFAF8] p-6 text-center text-[9px] leading-4 text-[#918B83]">No stored inbound evidence is selected. Nothing is converted automatically.</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-4 py-3 text-[7px] text-[#AAA39A]"><span>Stored lead ≠ prospect until explicit authenticated owner claim.</span><span>Identity re-read server-side · duplicate claims fail · owner bound server-side · Bangkok due required</span></div>
      </div>
    </section>
  );
}
