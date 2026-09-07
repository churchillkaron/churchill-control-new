"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  FileText,
  MessageSquareText,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(amount, currencyCode) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "Not set";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode || ""}`.trim();
  }
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function labelKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function evidenceUrl(item) {
  return item?.external_url || item?.url || null;
}

function conversationLabel(row) {
  const participant =
    row?.external_participant_name ||
    row?.external_participant_address ||
    row?.external_participant_id ||
    "Customer conversation";
  const channel = row?.channelLabel || row?.family || row?.provider || "channel";
  return `${participant} · ${channel}`;
}

function billingStatus(report) {
  if (report?.billing?.invoice?.invoice_id) return { label: "Invoiced", tone: "good" };
  if (report?.billing?.eligible) return { label: "Ready to invoice", tone: "ready" };
  if (report?.billing?.prepaid) return { label: "Prepaid", tone: "good" };
  if (report?.billing?.mode === "none") return { label: "No billing", tone: "neutral" };
  return {
    label: text(report?.billing?.blocked_reason).replaceAll("-", " ") || "Billing review",
    tone: "attention",
  };
}

function StatusPill({ status }) {
  const tone = status?.tone || "neutral";
  const classes = tone === "good"
    ? "border-[#748267]/20 bg-[#748267]/[0.07] text-[#607057]"
    : tone === "ready"
      ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.09] text-[#7B5C39]"
      : tone === "attention"
        ? "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]"
        : "border-black/[0.08] bg-black/[0.025] text-[#756F68]";
  return <span className={`rounded-full border px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.08em] ${classes}`}>{status?.label || "Review"}</span>;
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#918C84]">{label}</div>
        {Icon ? <Icon size={12} className="text-[#A37849]" /> : null}
      </div>
      <div className="mt-2 text-[21px] font-medium tracking-[-0.035em] text-[#26231F]">{value}</div>
      <div className="mt-1 text-[8px] leading-4 text-[#9A968E]">{detail}</div>
    </div>
  );
}

function SmallCard({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] px-3.5 py-3">
      <div className="text-[7px] font-medium uppercase tracking-[0.11em] text-[#979188]">{label}</div>
      <div className="mt-1.5 text-[10px] font-medium text-[#4B4640]">{value}</div>
      {detail ? <div className="mt-1 text-[8px] leading-3 text-[#99938A]">{detail}</div> : null}
    </div>
  );
}

function EvidenceLink({ item, label }) {
  const url = evidenceUrl(item);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3.5 py-3 transition hover:border-[#D6A66A]/40 hover:bg-white"
    >
      <div className="min-w-0">
        <div className="truncate text-[9px] font-medium text-[#514B44]">{item?.file_name || label}</div>
        <div className="mt-0.5 text-[7px] text-[#9A948C]">Open governed proof</div>
      </div>
      <ArrowRight size={10} className="shrink-0 text-[#A9A39B] transition group-hover:text-[#8B653F]" />
    </a>
  );
}

export default function ServiceReportsPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [occurrences, setOccurrences] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [communicationDraft, setCommunicationDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBase = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [occurrenceResponse, communicationResponse] = await Promise.all([
        fetch(
          `/api/service-management/occurrences?organizationId=${encodeURIComponent(organizationId)}&status=completed&limit=250`,
          { cache: "no-store", credentials: "include" },
        ),
        fetch(
          `/api/commercial/communications/conversations?organizationId=${encodeURIComponent(organizationId)}&sync=0`,
          { cache: "no-store", credentials: "include" },
        ),
      ]);
      const [occurrenceJson, communicationJson] = await Promise.all([
        occurrenceResponse.json().catch(() => ({})),
        communicationResponse.json().catch(() => ({})),
      ]);
      if (!occurrenceResponse.ok || !occurrenceJson.success) {
        throw new Error(occurrenceJson.error || "Completed service occurrences could not be loaded.");
      }
      if (!communicationResponse.ok || communicationJson.success === false) {
        throw new Error(communicationJson.error || "Customer conversations could not be loaded.");
      }
      const rows = [...(occurrenceJson.rows || [])].sort((left, right) => (
        new Date(right.completed_at || right.occurrence_at || 0).getTime()
        - new Date(left.completed_at || left.occurrence_at || 0).getTime()
      ));
      setOccurrences(rows);
      setConversations(communicationJson.conversations || []);
      setSelectedId((current) => (
        current && rows.some((row) => row.id === current)
          ? current
          : rows[0]?.id || ""
      ));
    } catch (loadError) {
      setError(loadError.message || "Service report data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    let active = true;
    async function loadDetail() {
      if (!organizationId || !selectedId) {
        setReport(null);
        setPrepared(null);
        return;
      }
      setDetailLoading(true);
      setError("");
      setNotice("");
      setCommunicationDraft(null);
      try {
        const queryString = `organizationId=${encodeURIComponent(organizationId)}`;
        const [reportResponse, draftResponse] = await Promise.all([
          fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}?${queryString}`, { cache: "no-store", credentials: "include" }),
          fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}/delivery-draft?${queryString}`, { cache: "no-store", credentials: "include" }),
        ]);
        const [reportJson, draftJson] = await Promise.all([
          reportResponse.json().catch(() => ({})),
          draftResponse.json().catch(() => ({})),
        ]);
        if (!reportResponse.ok || !reportJson.success) throw new Error(reportJson.error || "Completed service report could not be loaded.");
        if (!draftResponse.ok || !draftJson.success) throw new Error(draftJson.error || "Customer delivery preview could not be prepared.");
        if (!active) return;
        setReport(reportJson.report || null);
        setPrepared(draftJson.draft || null);
      } catch (detailError) {
        if (active) {
          setReport(null);
          setPrepared(null);
          setError(detailError.message || "Completed service report could not be loaded.");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }
    loadDetail();
    return () => { active = false; };
  }, [organizationId, selectedId]);

  const filteredOccurrences = useMemo(() => {
    const needle = text(query).toLowerCase();
    if (!needle) return occurrences;
    return occurrences.filter((occurrence) => {
      const delivery = occurrence.attributes?.service_delivery || {};
      return [
        delivery.customer_name,
        delivery.customer_location_name,
        delivery.service_name,
        occurrence.id,
      ].some((value) => text(value).toLowerCase().includes(needle));
    });
  }, [occurrences, query]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const last30 = now - (30 * 24 * 60 * 60 * 1000);
    const invoiced = occurrences.filter((occurrence) => occurrence.attributes?.completion?.billing_invoice?.invoice_id).length;
    const recent = occurrences.filter((occurrence) => {
      const completed = dateValue(occurrence.completed_at || occurrence.attributes?.completion?.completed_at || occurrence.occurrence_at);
      return Boolean(completed && completed.getTime() >= last30);
    }).length;
    return { total: occurrences.length, recent, invoiced };
  }, [occurrences]);

  const customerConversations = useMemo(() => {
    const partyId = text(report?.customer?.party_id);
    if (!partyId) return [];
    return conversations.filter((row) => (
      text(row?.customer_party_id) === partyId
      && text(row?.provider || row?.family).toLowerCase() !== "internal"
      && text(row?.status || "OPEN").toUpperCase() === "OPEN"
    ));
  }, [conversations, report]);

  useEffect(() => {
    setConversationId((current) => (
      current && customerConversations.some((row) => row.id === current)
        ? current
        : customerConversations[0]?.id || ""
    ));
  }, [customerConversations]);

  async function createInvoice() {
    if (!selectedId || !report?.billing?.eligible) return;
    setInvoiceSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}/invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Finance invoice could not be created.");
      setNotice(json.idempotent_replay
        ? "This service was already invoiced. Finance returned the existing invoice."
        : "Finance invoice created from this completed service.");
      const reportResponse = await fetch(
        `/api/service-management/reports/${encodeURIComponent(selectedId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" },
      );
      const reportJson = await reportResponse.json().catch(() => ({}));
      if (reportResponse.ok && reportJson.success) setReport(reportJson.report || null);
      await loadBase();
    } catch (invoiceError) {
      setError(invoiceError.message || "Finance invoice could not be created.");
    } finally {
      setInvoiceSaving(false);
    }
  }

  async function createCommunicationsDraft() {
    if (!selectedId || !conversationId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}/delivery-draft/communications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, conversationId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Communications draft could not be created.");
      setCommunicationDraft(json.communication_draft || null);
      setNotice("Customer message saved as a Communications DRAFT. Nothing was sent.");
    } catch (draftError) {
      setError(draftError.message || "Communications draft could not be created.");
    } finally {
      setSaving(false);
    }
  }

  const base = `/workspace/${encodeURIComponent(organizationId)}`;
  const financeHref = `${base}/finance/ar/invoices`;
  const communicationsHref = communicationDraft?.message_id
    ? `${base}/commercial/customers/communications?conversationId=${encodeURIComponent(communicationDraft.conversation_id)}&messageId=${encodeURIComponent(communicationDraft.message_id)}`
    : `${base}/commercial/customers/communications`;
  const protocolEntries = Object.entries(report?.protocol?.responses || {});
  const evidence = report?.evidence || {};
  const evidenceItems = [
    ...(evidence.before_photos || []).map((item, index) => [item, `Before photo ${index + 1}`]),
    ...(evidence.after_photos || []).map((item, index) => [item, `After photo ${index + 1}`]),
    ...(evidence.additional || []).map((item, index) => [item, `Evidence ${index + 1}`]),
    [evidence.customer_signature, "Customer signature"],
    [evidence.technician_signature, "Technician signature"],
  ].filter(([item]) => evidenceUrl(item));
  const billing = billingStatus(report);

  if (organizationLoading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing completed services...</div>;
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={`${base}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Completed service · Proof · Billing · Customer delivery</div>
            <h1 className="mt-1 text-[29px] font-medium tracking-[-0.045em] text-[#201E1B]">Service reports</h1>
            <p className="mt-1 max-w-4xl text-[11px] leading-5 text-[#777169]">Finish the customer loop without reconstructing a visit: review what happened, inspect proof, hand eligible work to Finance, prepare the customer message, then review and send from Commercial Communications.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[9px] text-[#746E67]">{organization?.name || "Organization"}</span>
            <Link href={financeHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Customer invoices</Link>
            <Link href={`${base}/operations/field-service/service-plans`} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Service plans</Link>
            <button type="button" onClick={loadBase} disabled={loading} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] disabled:opacity-40" aria-label="Refresh completed services"><RefreshCw size={11} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}</div> : null}
        {notice ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#748267]/20 bg-[#748267]/[0.05] px-4 py-3 text-[10px] text-[#607057]"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />{notice}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Completed services" value={loading ? "…" : metrics.total} detail="Canonical completed occurrences" icon={CheckCircle2} />
          <Metric label="Last 30 days" value={loading ? "…" : metrics.recent} detail="Recent customer service history" icon={FileCheck2} />
          <Metric label="Invoiced" value={loading ? "…" : metrics.invoiced} detail="Finance invoices already linked" icon={ReceiptText} />
          <Metric label="Selected proof" value={detailLoading ? "…" : evidenceItems.length} detail="Evidence attached to this service" icon={BadgeCheck} />
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.055] p-3.5">
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Completed services</div>
              <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-3"><Search size={10} className="text-[#9A948C]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, site, service…" className="w-full bg-transparent text-[9px] text-[#4A453F] outline-none placeholder:text-[#AAA49C]" /></label>
            </div>
            <div className="max-h-[calc(100vh-285px)] min-h-[420px] overflow-y-auto divide-y divide-black/[0.05]">
              {loading ? <div className="px-4 py-8 text-center text-[10px] text-[#8D877F]">Loading completed services…</div> : null}
              {!loading && filteredOccurrences.length === 0 ? <div className="px-4 py-10 text-center text-[10px] text-[#8D877F]">No completed services match this view.</div> : null}
              {filteredOccurrences.map((occurrence) => {
                const delivery = occurrence.attributes?.service_delivery || {};
                const completion = occurrence.attributes?.completion || {};
                const selected = occurrence.id === selectedId;
                const invoiceNumber = completion.billing_invoice?.invoice_number || null;
                return (
                  <button key={occurrence.id} type="button" onClick={() => setSelectedId(occurrence.id)} className={`w-full px-4 py-3.5 text-left transition ${selected ? "bg-[#D6A66A]/[0.08]" : "hover:bg-[#FBFAF8]"}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#403C37]">{delivery.customer_name || "Customer"}</div><div className="mt-0.5 truncate text-[8px] text-[#918B83]">{delivery.service_name || "Completed service"}</div></div>{invoiceNumber ? <ReceiptText size={10} className="mt-0.5 shrink-0 text-[#748267]" /> : null}</div>
                    <div className="mt-2 truncate text-[8px] text-[#A09A92]">{delivery.customer_location_name || "Site not named"} · {formatDate(occurrence.completed_at || completion.completed_at || occurrence.occurrence_at)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)] md:p-5">
            {detailLoading ? <div className="py-24 text-center text-[10px] text-[#8D877F]">Preparing report, billing readiness and customer delivery…</div> : null}
            {!detailLoading && !report && !loading ? <div className="py-24 text-center text-[10px] text-[#8D877F]">Select a completed service to review it.</div> : null}
            {!detailLoading && report && prepared ? <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.06] pb-4">
                <div><div className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#9A744B]">Completed customer service</div><h2 className="mt-1 text-[22px] font-medium tracking-[-0.035em] text-[#2D2925]">{report.service?.name || "Service"}</h2><div className="mt-1 text-[10px] text-[#817A72]">{report.customer?.name || "Customer"}{report.customer?.location_name ? ` · ${report.customer.location_name}` : ""}</div></div>
                <div className="flex flex-wrap items-center gap-2"><StatusPill status={{ label: "Completed", tone: "good" }} /><StatusPill status={billing} /></div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <SmallCard label="Scheduled" value={formatDate(report.service?.scheduled_at)} />
                <SmallCard label="Completed" value={formatDate(report.service?.completed_at)} />
                <SmallCard label="Outcome" value={labelKey(report.service?.outcome || "Not recorded")} />
                <SmallCard label="Evidence" value={`${evidenceItems.length} attachment${evidenceItems.length === 1 ? "" : "s"}`} detail="Customer-safe proof" />
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <section className="rounded-2xl border border-black/[0.065] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#4A453F]"><FileText size={11} /> Service record</div>
                  <div className="mt-3 divide-y divide-black/[0.05]">{protocolEntries.map(([key, value]) => <div key={key} className="grid gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]"><div className="text-[8px] text-[#979188]">{labelKey(key)}</div><div className="break-words text-[9px] text-[#5D5750]">{displayValue(value)}</div></div>)}{!protocolEntries.length ? <div className="py-5 text-[9px] text-[#9A948C]">No protocol responses were recorded.</div> : null}</div>
                </section>
                <section className="rounded-2xl border border-black/[0.065] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#4A453F]"><BadgeCheck size={11} /> Materials used</div>
                  <div className="mt-3 divide-y divide-black/[0.05]">{(report.materials || []).map((material, index) => <div key={material.movement_id || index} className="flex items-center justify-between gap-4 py-2.5"><div className="min-w-0 truncate text-[9px] text-[#5D5750]">{material.material_name || material.name || "Material"}</div><div className="shrink-0 text-[9px] font-medium text-[#4A453F]">{displayValue(material.quantity)}{material.unit ? ` ${material.unit}` : ""}</div></div>)}{!(report.materials || []).length ? <div className="py-5 text-[9px] text-[#9A948C]">No consumed materials were recorded.</div> : null}</div>
                </section>
              </div>

              <section className="rounded-2xl border border-black/[0.065] p-4">
                <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#4A453F]"><FileCheck2 size={11} /> Completion evidence</div><div className="mt-1 text-[8px] text-[#979188]">Only governed proof linked to this exact service occurrence is shown.</div></div><span className="text-[9px] font-medium text-[#6F6961]">{evidenceItems.length}</span></div>
                {evidenceItems.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{evidenceItems.map(([item, label], index) => <EvidenceLink key={`${label}-${index}`} item={item} label={label} />)}</div> : <div className="mt-3 rounded-xl bg-[#FBFAF8] px-3.5 py-4 text-[9px] text-[#9A948C]">No external proof attachments are present on this completed service.</div>}
              </section>

              <section className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#624C34]"><ReceiptText size={11} /> Finance billing handoff</div><div className="mt-1 text-[8px] leading-4 text-[#8B7E70]">Operations proves the completed service. Finance remains authoritative for the invoice and accounting lifecycle.</div></div><StatusPill status={billing} /></div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-3"><SmallCard label="Billing mode" value={labelKey(report.billing?.mode || "none")} /><SmallCard label="Amount" value={formatMoney(report.billing?.amount, report.billing?.currency_code)} /><SmallCard label="Terms" value={`${Number(report.billing?.due_days || 0)} day${Number(report.billing?.due_days || 0) === 1 ? "" : "s"}`} /></div>
                {report.billing?.blocked_reason && !report.billing?.eligible && !report.billing?.invoice?.invoice_id ? <div className="mt-3 rounded-xl border border-[#B36B52]/15 bg-white/70 px-3.5 py-3 text-[9px] text-[#8B5141]">Billing is not ready: {labelKey(report.billing.blocked_reason)}.</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.billing?.eligible ? <button type="button" onClick={createInvoice} disabled={invoiceSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D1B18] px-3.5 py-2.5 text-[9px] font-medium text-white transition hover:bg-black disabled:opacity-40"><ReceiptText size={10} />{invoiceSaving ? "Creating invoice…" : "Create Finance invoice"}</button> : null}
                  {report.billing?.invoice?.invoice_id ? <Link href={financeHref} className="inline-flex items-center gap-1.5 rounded-lg border border-[#748267]/20 bg-white px-3.5 py-2.5 text-[9px] font-medium text-[#607057]">Invoice {report.billing.invoice.invoice_number || report.billing.invoice.invoice_id} · Open Finance <ArrowRight size={9} /></Link> : null}
                  {!report.billing?.invoice?.invoice_id && !report.billing?.eligible ? <Link href={financeHref} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px] font-medium text-[#665F57]">Open Customer Invoices <ArrowRight size={9} /></Link> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-black/[0.065] p-4">
                <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#4A453F]"><MessageSquareText size={11} /> Customer delivery</div><div className="mt-1 text-[8px] leading-4 text-[#979188]">Preview is customer-safe. Billing internals and inventory movement identifiers stay out of the message.</div></div><Send size={12} className="text-[#A37849]" /></div>
                <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5"><div className="text-[9px] font-medium text-[#4E4943]">{prepared.subject || "Service report"}</div><div className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-[#6D665F]">{prepared.body}</div><div className="mt-3 border-t border-black/[0.05] pt-2.5 text-[8px] text-[#979188]">{prepared.attachments?.length || 0} evidence attachment{prepared.attachments?.length === 1 ? "" : "s"} will be included with the draft.</div></div>

                {customerConversations.length ? <div className="mt-3"><label className="block"><span className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#918A82]">Customer conversation</span><select value={conversationId} onChange={(event) => setConversationId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[9px] text-[#4A453F] outline-none focus:border-[#D6A66A]/60">{customerConversations.map((row) => <option key={row.id} value={row.id}>{conversationLabel(row)}</option>)}</select></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={createCommunicationsDraft} disabled={saving || !conversationId || Boolean(communicationDraft?.message_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.08] px-3.5 py-2.5 text-[9px] font-medium text-[#76583A] disabled:opacity-40"><MessageSquareText size={10} />{saving ? "Creating draft…" : communicationDraft?.message_id ? "Draft created" : "Create Communications draft"}</button>{communicationDraft?.message_id ? <Link href={communicationsHref} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D1B18] px-3.5 py-2.5 text-[9px] font-medium text-white">Review & send in Communications <ArrowRight size={9} /></Link> : null}</div><div className="mt-2 text-[8px] leading-4 text-[#979188]">Creating the draft never sends the message. Commercial Communications owns the final review and explicit send.</div></div> : <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C08A4A]/18 bg-[#C08A4A]/[0.05] px-3.5 py-3"><div><div className="text-[9px] font-medium text-[#755738]">No open external conversation is linked to this customer.</div><div className="mt-1 text-[8px] text-[#8E8173]">Open Customer Communications, connect the conversation, then return here to create the governed draft.</div></div><Link href={communicationsHref} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#665B4E]">Open Communications <ArrowRight size={9} /></Link></div>}
              </section>
            </div> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
