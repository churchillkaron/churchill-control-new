"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CirclePlus,
  Clock3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRoundCheck,
  Workflow,
  XCircle,
} from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const LOSS_STAGES = new Set(["PROSPECT", "QUALIFIED", "COMMITMENT_PENDING", "COMMITTED"]);

function clean(value) {
  return String(value ?? "").trim();
}

function relativeTime(value) {
  if (!value) return "No evidence";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No evidence";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanStage(value) {
  const stage = clean(value).toLowerCase().replace(/_/g, " ");
  return stage ? stage.replace(/\b\w/g, (character) => character.toUpperCase()) : "Unknown";
}

function compactId(value) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, 8) : "—";
}

function stageTone(stage) {
  if (stage === "FIRST_VALUE") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (stage === "LOST") return "border-red-700/15 bg-red-50 text-red-800";
  return "border-[#B98A57]/20 bg-[#FBF7F1] text-[#8A643C]";
}

async function requestPipeline() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/commercial-pipeline?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Acquisition evidence is unavailable");
  return payload;
}

async function createProspect({ source, sourceReference, evidenceReference, note }) {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/acquisition?organizationId=${scope}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, sourceReference, evidenceType: "PLATFORM_PROSPECT_ORIGIN_RECORDED", evidenceReference, note }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to create prospect");
  return payload;
}

async function transitionAcquisition(body) {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/acquisition?organizationId=${scope}`, {
    method: "PATCH",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to advance acquisition");
  return payload;
}

function dispatchPartnerMessage(message) {
  window.dispatchEvent(new CustomEvent("avantiqo:home-command", { detail: { message, source: "text" } }));
  window.requestAnimationFrame(() => {
    document.querySelector('[data-avantiqo-home-intelligence="true"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function Field({ label, value, onChange, placeholder, type = "text", span = false }) {
  return (
    <label className={span ? "block sm:col-span-2" : "block"}>
      <span className="text-[8px] font-medium text-[#777168]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45"
      />
    </label>
  );
}

function EvidenceFields({ reference, setReference, note, setNote, label = "Evidence" }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Field label={`${label} reference *`} value={reference} onChange={setReference} placeholder="Email, call, meeting, document…" />
      <label className="block">
        <span className="text-[8px] font-medium text-[#777168]">Why this evidence proves the stage *</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="State the observed fact, not an assumption."
          className="mt-1 w-full resize-none rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px] leading-4 text-[#48423C] outline-none focus:border-[#B98A57]/45"
        />
      </label>
    </div>
  );
}

function EventTimeline({ events }) {
  const rows = Array.isArray(events) ? events : [];
  return (
    <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3.5">
      <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Evidence trail</div>
      <div className="mt-2.5 space-y-2.5">
        {rows.length ? rows.map((event) => (
          <div key={event.id} className="grid grid-cols-[9px_minmax(0,1fr)] gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#B98A57]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[8px] font-semibold text-[#514B44]">{humanStage(event.to_stage)}</span>
                <span className="text-[7px] uppercase tracking-[0.06em] text-[#AAA39A]">{clean(event.evidence_type).replace(/_/g, " ")}</span>
                <span className="text-[7px] text-[#AAA39A]">{relativeTime(event.occurred_at)}</span>
              </div>
              {event.evidence_reference ? <div className="mt-0.5 truncate text-[8px] text-[#777168]">Ref: {event.evidence_reference}</div> : null}
              {event.note ? <div className="mt-0.5 text-[8px] leading-3.5 text-[#918B83]">{event.note}</div> : null}
            </div>
          </div>
        )) : <div className="text-[8px] leading-4 text-[#918B83]">No transition events are surfaced for this record yet.</div>}
      </div>
    </div>
  );
}

export default function PlatformAcquisitionControlPanel() {
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [source, setSource] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [originReference, setOriginReference] = useState("");
  const [originNote, setOriginNote] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [lossReference, setLossReference] = useState("");
  const [lossNote, setLossNote] = useState("");
  const [showLoss, setShowLoss] = useState(false);

  const load = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    try {
      const next = await requestPipeline();
      setPipeline(next);
      const rows = Array.isArray(next?.recentAcquisitions) ? next.recentAcquisitions : [];
      setSelectedId((current) => keepSelection && rows.some((row) => row.id === current) ? current : (rows[0]?.id || ""));
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Acquisition evidence is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recent = useMemo(() => Array.isArray(pipeline?.recentAcquisitions) ? pipeline.recentAcquisitions : [], [pipeline]);
  const selected = useMemo(() => recent.find((row) => row.id === selectedId) || null, [recent, selectedId]);
  const canCreate = clean(source) && clean(originReference) && clean(originNote);

  useEffect(() => {
    setCompany(selected?.prospect_company || "");
    setContact(selected?.prospect_contact || "");
    setEmail(selected?.prospect_email || "");
    setEvidenceReference("");
    setEvidenceNote("");
    const candidates = Array.isArray(selected?.verifiedSubscriptionCandidates) ? selected.verifiedSubscriptionCandidates : [];
    setSubscriptionId(selected?.subscription_id || candidates[0]?.id || "");
    setLossReference("");
    setLossNote("");
    setShowLoss(false);
  }, [selectedId, selected?.id, selected?.prospect_company, selected?.prospect_contact, selected?.prospect_email, selected?.subscription_id, selected?.verifiedSubscriptionCandidates]);

  const submitProspect = useCallback(async (event) => {
    event.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await createProspect({ source: clean(source), sourceReference: clean(sourceReference), evidenceReference: clean(originReference), note: clean(originNote) });
      setSource(""); setSourceReference(""); setOriginReference(""); setOriginNote("");
      setSelectedId(result?.acquisition?.id || "");
      setNotice("Prospect created with atomic origin evidence.");
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to create prospect");
    } finally {
      setSaving(false);
    }
  }, [canCreate, load, originNote, originReference, saving, source, sourceReference]);

  const advance = useCallback(async (toStage) => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = { acquisitionId: selected.id, expectedFromStage: selected.stage, toStage };
      if (toStage === "QUALIFIED") Object.assign(body, { prospectCompany: clean(company), prospectContact: clean(contact), prospectEmail: clean(email), evidenceReference: clean(evidenceReference), note: clean(evidenceNote) });
      if (toStage === "COMMITMENT_PENDING") Object.assign(body, { evidenceReference: clean(evidenceReference), note: clean(evidenceNote) });
      if (toStage === "COMMITTED") body.subscriptionId = subscriptionId;
      if (toStage === "LOST") Object.assign(body, { evidenceReference: clean(lossReference), note: clean(lossNote) });
      await transitionAcquisition(body);
      setNotice(`${humanStage(toStage)} persisted only after its evidence gate passed.`);
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to advance acquisition");
    } finally {
      setSaving(false);
    }
  }, [company, contact, email, evidenceNote, evidenceReference, load, lossNote, lossReference, saving, selected, subscriptionId]);

  const askPartner = useCallback(() => {
    dispatchPartnerMessage([
      "Help me review the Avantiqo canonical acquisition workbench.",
      `Canonical records: ${pipeline?.summary?.canonicalAcquisitions || 0}.`,
      selected ? `Selected acquisition is at ${selected.stage}. Required next action: ${selected.nextAction}` : "No acquisition is selected.",
      "Recommend the highest-leverage owner action using only persisted evidence. Do not invent conversion rates, pipeline value, revenue, or historical attribution.",
    ].join(" "));
  }, [pipeline, selected]);

  const renderStageAction = () => {
    if (!selected) return null;
    const candidates = Array.isArray(selected.verifiedSubscriptionCandidates) ? selected.verifiedSubscriptionCandidates : [];
    const customer = selected.verifiedCustomerCandidate;

    if (selected.stage === "PROSPECT") {
      const ready = clean(company) && clean(contact) && clean(email) && clean(evidenceReference) && clean(evidenceNote);
      return (
        <div className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="Company *" value={company} onChange={setCompany} placeholder="Canonical prospect company" />
            <Field label="Contact *" value={contact} onChange={setContact} placeholder="Decision contact" />
            <Field label="Email *" type="email" value={email} onChange={setEmail} placeholder="Identity anchor" />
          </div>
          <EvidenceFields reference={evidenceReference} setReference={setEvidenceReference} note={evidenceNote} setNote={setEvidenceNote} label="Qualification" />
          <button type="button" disabled={!ready || saving} onClick={() => advance("QUALIFIED")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <UserRoundCheck size={11} />} Mark qualified
          </button>
        </div>
      );
    }

    if (selected.stage === "QUALIFIED") {
      const ready = clean(evidenceReference) && clean(evidenceNote);
      return (
        <div className="space-y-3">
          <EvidenceFields reference={evidenceReference} setReference={setEvidenceReference} note={evidenceNote} setNote={setEvidenceNote} label="Commitment" />
          <button type="button" disabled={!ready || saving} onClick={() => advance("COMMITMENT_PENDING")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Workflow size={11} />} Mark commitment pending
          </button>
        </div>
      );
    }

    if (selected.stage === "COMMITMENT_PENDING") {
      return (
        <div>
          <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3.5">
            <div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8D877E]">Verified subscription candidates</div>
            <p className="mt-1 text-[8px] leading-4 text-[#918B83]">Only subscriptions whose persisted lead identity matches this prospect email can be chosen. Arbitrary subscription IDs are not accepted here.</p>
            {candidates.length ? (
              <select value={subscriptionId} onChange={(event) => setSubscriptionId(event.target.value)} className="mt-2.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45">
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{compactId(candidate.id)} · {humanStage(candidate.status)} · {relativeTime(candidate.createdAt)}</option>)}
              </select>
            ) : <div className="mt-2.5 rounded-lg border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-[8px] leading-4 text-amber-800">No subscription currently proves this prospect identity. Create/complete the real commercial subscription first; do not advance the acquisition by assumption.</div>}
          </div>
          <button type="button" disabled={!subscriptionId || !candidates.some((candidate) => candidate.id === subscriptionId) || saving} onClick={() => advance("COMMITTED")} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Verify commitment
          </button>
        </div>
      );
    }

    if (selected.stage === "COMMITTED") {
      return (
        <div>
          {customer ? (
            <div className="rounded-xl border border-emerald-700/15 bg-emerald-50 p-3.5">
              <div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-emerald-800">Customer resolved from committed subscription</div>
              <div className="mt-1 text-[11px] font-semibold text-[#48433D]">{customer.name || `Organization ${compactId(customer.id)}`}</div>
              <div className="mt-0.5 text-[8px] text-[#777168]">{humanStage(customer.status)} · {compactId(customer.id)}</div>
            </div>
          ) : <div className="rounded-lg border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-[8px] leading-4 text-amber-800">The committed subscription is not yet linked to a customer organization. Customer creation cannot be claimed.</div>}
          <button type="button" disabled={!customer || saving} onClick={() => advance("CUSTOMER_CREATED")} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Verify customer creation
          </button>
        </div>
      );
    }

    if (selected.stage === "CUSTOMER_CREATED") {
      return <button type="button" disabled={saving} onClick={() => advance("HUMAN_ACTIVE")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">{saving ? <RefreshCw size={11} className="animate-spin" /> : <UserRoundCheck size={11} />} Verify active human</button>;
    }

    if (selected.stage === "HUMAN_ACTIVE") {
      return <button type="button" disabled={saving} onClick={() => advance("FIRST_VALUE")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 px-3 text-[9px] font-semibold text-emerald-800 disabled:opacity-40">{saving ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Verify first value</button>;
    }

    return <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] px-3.5 py-3 text-[8px] leading-4 text-[#777168]">{selected.stage === "FIRST_VALUE" ? "First value is proven. This acquisition lifecycle is complete; preserve its evidence trail." : "This acquisition is terminal. Preserve the recorded outcome and evidence."}</div>;
  };

  return (
    <section data-avantiqo-platform-acquisition-control="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]"><Workflow size={12} /> Acquisition opportunity workbench</div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">Move the opportunity only when the next fact is proven.</h2>
            <p className="mt-1 max-w-4xl text-[9px] leading-4 text-[#918B83]">One canonical lineage runs from prospect identity to commercial commitment, customer organization, active human and first value. Every transition is persisted with evidence; customer-domain quotations and historical assumptions stay outside this truth.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load()} disabled={loading} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] disabled:opacity-50"><RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={askPartner} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 text-[8px] font-medium text-[#8A643C]">Review with Partner <ArrowRight size={10} /></button>
          </div>
        </div>

        {error ? <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-[9px] text-red-800"><TriangleAlert size={12} className="mt-0.5 shrink-0" />{error}</div> : null}
        {notice ? <div className="flex items-start gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-[9px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />{notice}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-[330px_minmax(0,1fr)]">
          <div className="border-b border-black/[0.06] xl:border-b-0 xl:border-r">
            <form onSubmit={submitProspect} className="border-b border-black/[0.06] p-4">
              <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">Start prospect</div>
              <div className="mt-2.5 space-y-2.5">
                <Field label="Source *" value={source} onChange={setSource} placeholder="Referral, website, outbound…" />
                <Field label="Source reference" value={sourceReference} onChange={setSourceReference} placeholder="Campaign, URL, referral…" />
                <Field label="Origin evidence reference *" value={originReference} onChange={setOriginReference} placeholder="Email, thread, call, meeting…" />
                <label className="block"><span className="text-[8px] font-medium text-[#777168]">Why this is a real prospect *</span><textarea value={originNote} onChange={(event) => setOriginNote(event.target.value)} rows={3} placeholder="Observable commercial intent or owner evidence." className="mt-1 w-full resize-none rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px] leading-4 text-[#48423C] outline-none focus:border-[#B98A57]/45" /></label>
              </div>
              <button type="submit" disabled={!canCreate || saving} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40">{saving ? <RefreshCw size={11} className="animate-spin" /> : <CirclePlus size={11} />} Start prospect</button>
            </form>

            <div className="p-3">
              <div className="flex items-center justify-between px-1 pb-2"><span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Opportunity queue</span><span className="text-[8px] text-[#AAA39A]">{pipeline?.summary?.canonicalAcquisitions || 0}</span></div>
              <div className="space-y-1.5">
                {recent.length ? recent.map((record) => (
                  <button key={record.id} type="button" onClick={() => setSelectedId(record.id)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selectedId === record.id ? "border-[#B98A57]/30 bg-[#FBF7F1]" : "border-black/[0.06] bg-white hover:bg-[#FBFAF8]"}`}>
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#48433D]">{record.prospect_company || clean(record.sourceReference) || clean(record.source) || `Acquisition ${compactId(record.id)}`}</div><div className="mt-0.5 truncate text-[8px] text-[#AAA39A]">{record.prospect_contact || clean(record.source) || "Identity pending"}</div></div><span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold ${stageTone(record.stage)}`}>{humanStage(record.stage)}</span></div>
                    <div className="mt-1.5 flex items-center gap-1 text-[7px] text-[#AAA39A]"><Clock3 size={8} /> updated {relativeTime(record.stage_updated_at)}</div>
                  </button>
                )) : <div className="rounded-xl bg-[#FBFAF8] px-3 py-4 text-[8px] leading-4 text-[#918B83]">No canonical prospects yet. Existing customers and legacy leads remain intentionally unattributed.</div>}
              </div>
            </div>
          </div>

          <div className="p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 border-b border-black/[0.055] pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Selected opportunity</div>
                    <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#403C37]">{selected.prospect_company || clean(selected.sourceReference) || `Prospect ${compactId(selected.id)}`}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span>{selected.prospect_contact || "Contact identity pending"}</span><span>{selected.prospect_email || "Email identity pending"}</span><span>{clean(selected.source) || "No source label"}</span></div>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[8px] font-semibold ${stageTone(selected.stage)}`}>{humanStage(selected.stage)}</span>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#9C968E]">Current stage</div><div className="mt-1 text-[10px] font-semibold text-[#48433D]">{humanStage(selected.stage)}</div></div>
                  <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#9C968E]">Next gate</div><div className="mt-1 text-[10px] font-semibold text-[#48433D]">{selected.nextStage ? humanStage(selected.nextStage) : "Terminal"}</div></div>
                  <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#9C968E]">Subscription</div><div className="mt-1 text-[10px] font-semibold text-[#48433D]">{selected.subscription_id ? compactId(selected.subscription_id) : "Not proven"}</div></div>
                  <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#9C968E]">Customer</div><div className="mt-1 truncate text-[10px] font-semibold text-[#48433D]">{selected.verifiedCustomerCandidate?.name || (selected.customer_organization_id ? compactId(selected.customer_organization_id) : "Not proven")}</div></div>
                </div>

                <div className="rounded-xl border border-[#B98A57]/18 bg-[#FBF7F1] p-3.5"><div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8A643C]">Required next action</div><div className="mt-1 text-[10px] leading-4 text-[#65594C]">{selected.nextAction}</div></div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                  <div className="rounded-xl border border-black/[0.065] p-4">
                    <div className="mb-3"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8D877E]">Governed stage action</div><div className="mt-1 text-[8px] leading-4 text-[#918B83]">The browser requests a transition; the server re-reads the authoritative evidence before persistence.</div></div>
                    {renderStageAction()}

                    {LOSS_STAGES.has(selected.stage) ? (
                      <div className="mt-4 border-t border-black/[0.055] pt-3">
                        <button type="button" onClick={() => setShowLoss((current) => !current)} className="inline-flex items-center gap-1.5 text-[8px] font-medium text-[#9A5C4C]"><XCircle size={10} /> {showLoss ? "Hide loss action" : "Record lost outcome"}</button>
                        {showLoss ? <div className="mt-3 space-y-3"><EvidenceFields reference={lossReference} setReference={setLossReference} note={lossNote} setNote={setLossNote} label="Loss" /><button type="button" disabled={!clean(lossReference) || !clean(lossNote) || saving} onClick={() => advance("LOST")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-700/15 bg-red-50 px-3 text-[9px] font-semibold text-red-800 disabled:opacity-40">{saving ? <RefreshCw size={11} className="animate-spin" /> : <XCircle size={11} />} Confirm lost</button></div> : null}
                      </div>
                    ) : null}
                  </div>

                  <EventTimeline events={selected.events} />
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3.5 py-3 text-[8px] leading-4 text-[#918B83]"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-700" />Seller scope is server-owned. Subscription lineage is identity-matched. Customer identity is derived from the committed subscription. Human activation and first value are independently re-read. Conversion rate remains unclaimed until a real cohort/window definition exists.</div>
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-black/[0.08] bg-[#FBFAF8] px-6 text-center text-[9px] leading-4 text-[#918B83]">Start or select a canonical prospect to open the opportunity workbench.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}