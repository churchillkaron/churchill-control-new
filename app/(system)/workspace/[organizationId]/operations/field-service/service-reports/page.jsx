"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(amount, currencyCode) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
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
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function evidenceUrl(item) {
  return item?.external_url || item?.url || null;
}

function EvidenceLink({ item, label }) {
  const url = evidenceUrl(item);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block truncate rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55 hover:border-[#9BCF53]/30 hover:text-white"
    >
      {item?.file_name || label}
    </a>
  );
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
  if (report?.billing?.invoice?.invoice_id) return "Invoiced";
  if (report?.billing?.eligible) return "Ready to invoice";
  if (report?.billing?.prepaid) return "Prepaid";
  if (report?.billing?.mode === "none") return "No billing";
  return String(report?.billing?.blocked_reason || "Review").replaceAll("-", " ");
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
          { cache: "no-store" },
        ),
        fetch(
          `/api/commercial/communications/conversations?organizationId=${encodeURIComponent(organizationId)}&sync=0`,
          { cache: "no-store" },
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
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message || "Service report data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

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
        const query = `organizationId=${encodeURIComponent(organizationId)}`;
        const [reportResponse, draftResponse] = await Promise.all([
          fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}?${query}`, { cache: "no-store" }),
          fetch(`/api/service-management/reports/${encodeURIComponent(selectedId)}/delivery-draft?${query}`, { cache: "no-store" }),
        ]);
        const [reportJson, draftJson] = await Promise.all([
          reportResponse.json().catch(() => ({})),
          draftResponse.json().catch(() => ({})),
        ]);
        if (!reportResponse.ok || !reportJson.success) {
          throw new Error(reportJson.error || "Completed service report could not be loaded.");
        }
        if (!draftResponse.ok || !draftJson.success) {
          throw new Error(draftJson.error || "Customer delivery preview could not be prepared.");
        }
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
    return () => {
      active = false;
    };
  }, [organizationId, selectedId]);

  const customerConversations = useMemo(() => {
    const partyId = String(report?.customer?.party_id || "").trim();
    if (!partyId) return [];
    return conversations.filter((row) => (
      String(row?.customer_party_id || "").trim() === partyId
      && String(row?.provider || row?.family || "").toLowerCase() !== "internal"
      && String(row?.status || "OPEN").toUpperCase() === "OPEN"
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
      const response = await fetch(
        `/api/service-management/reports/${encodeURIComponent(selectedId)}/invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Finance invoice could not be created.");
      }
      setNotice(
        json.idempotent_replay
          ? "This completed service was already invoiced. The existing Finance invoice was returned."
          : "Finance invoice created from the completed service.",
      );
      const reportResponse = await fetch(
        `/api/service-management/reports/${encodeURIComponent(selectedId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const reportJson = await reportResponse.json().catch(() => ({}));
      if (reportResponse.ok && reportJson.success) setReport(reportJson.report || null);
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
      const response = await fetch(
        `/api/service-management/reports/${encodeURIComponent(selectedId)}/delivery-draft/communications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, conversationId }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Communications draft could not be created.");
      }
      setCommunicationDraft(json.communication_draft || null);
      setNotice("Saved as a Communications DRAFT. It has not been sent.");
    } catch (draftError) {
      setError(draftError.message || "Communications draft could not be created.");
    } finally {
      setSaving(false);
    }
  }

  const communicationsHref = communicationDraft?.message_id
    ? `/workspace/${encodeURIComponent(organizationId)}/commercial/customers/communications?conversationId=${encodeURIComponent(communicationDraft.conversation_id)}&messageId=${encodeURIComponent(communicationDraft.message_id)}`
    : null;

  const protocolEntries = Object.entries(report?.protocol?.responses || {});
  const evidence = report?.evidence || {};
  const evidenceItems = [
    ...(evidence.before_photos || []).map((item, index) => [item, `Before photo ${index + 1}`]),
    ...(evidence.after_photos || []).map((item, index) => [item, `After photo ${index + 1}`]),
    ...(evidence.additional || []).map((item, index) => [item, `Evidence ${index + 1}`]),
    [evidence.customer_signature, "Customer signature"],
    [evidence.technician_signature, "Technician signature"],
  ].filter(([item]) => evidenceUrl(item));

  if (organizationLoading) {
    return <section className="mx-auto max-w-[1480px] px-5 py-10 text-white/45">Loading Service Reports…</section>;
  }

  return (
    <section className="mx-auto max-w-[1480px] px-5 py-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9BCF53]">Service Management · Reports · Billing · Customer Delivery</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Completed Service Reports</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Review canonical completed-service records, Finance billing readiness and customer delivery from one work center. Finance owns invoice creation; Commercial Communications owns the saved customer message and confirmed send.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Field Service</Link>
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-plans`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Service Plans</Link>
          <button type="button" onClick={loadBase} disabled={loading} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2 text-sm text-[#D9F4B7] disabled:opacity-40">Refresh</button>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">{notice}</div> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-[26px] border border-white/10 bg-white/[0.025] p-4">
          <div className="px-1 text-sm font-semibold">Completed Services</div>
          <div className="mt-1 px-1 text-xs text-white/30">{occurrences.length} customer records</div>
          <div className="mt-4 space-y-2">
            {loading ? <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">Loading…</div> : null}
            {!loading && !occurrences.length ? <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">No completed service occurrences yet.</div> : null}
            {occurrences.map((occurrence) => {
              const delivery = occurrence.attributes?.service_delivery || {};
              const completion = occurrence.attributes?.completion || {};
              const selected = occurrence.id === selectedId;
              return (
                <button key={occurrence.id} type="button" onClick={() => setSelectedId(occurrence.id)} className={`w-full rounded-2xl border p-4 text-left ${selected ? "border-[#9BCF53]/35 bg-[#9BCF53]/[0.08]" : "border-white/10 bg-black/15 hover:border-white/20"}`}>
                  <div className="text-sm font-semibold text-white/85">{delivery.customer_name || "Customer"}</div>
                  <div className="mt-1 text-xs text-white/50">{delivery.service_name || "Completed service"}</div>
                  <div className="mt-2 text-[11px] text-white/30">{formatDate(occurrence.completed_at || completion.completed_at || occurrence.occurrence_at)}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 rounded-[26px] border border-white/10 bg-white/[0.025] p-5 md:p-6">
          {detailLoading ? <div className="py-16 text-center text-sm text-white/35">Building canonical report and delivery preview…</div> : null}
          {!detailLoading && report && prepared ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9BCF53]">Completed Customer Service</div>
                  <h2 className="mt-2 text-2xl font-semibold">{report.service?.name || "Service"}</h2>
                  <div className="mt-2 text-sm text-white/45">{report.customer?.name || "Customer"}{report.customer?.location_name ? ` · ${report.customer.location_name}` : ""}</div>
                </div>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">Completed</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Scheduled</div><div className="mt-2 text-sm text-white/75">{formatDate(report.service?.scheduled_at)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Completed</div><div className="mt-2 text-sm text-white/75">{formatDate(report.service?.completed_at)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Outcome</div><div className="mt-2 text-sm text-white/75">{report.service?.outcome || "—"}</div></div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Evidence</div><div className="mt-2 text-sm text-white/75">{evidenceItems.length} attachment{evidenceItems.length === 1 ? "" : "s"}</div></div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-black/15 p-5">
                  <div className="text-sm font-semibold">Service Record</div>
                  <div className="mt-4 divide-y divide-white/[0.06]">
                    {protocolEntries.map(([key, value]) => <div key={key} className="grid gap-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)]"><div className="text-xs text-white/35">{key}</div><div className="break-words text-sm text-white/70">{displayValue(value)}</div></div>)}
                    {!protocolEntries.length ? <div className="py-4 text-sm text-white/30">No protocol responses were recorded.</div> : null}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/15 p-5">
                  <div className="text-sm font-semibold">Materials Used</div>
                  <div className="mt-4 divide-y divide-white/[0.06]">
                    {(report.materials || []).map((material, index) => <div key={material.movement_id || index} className="flex justify-between gap-4 py-3"><div className="text-sm text-white/70">{material.material_name || material.name || "Material"}</div><div className="text-sm font-semibold text-white/65">{displayValue(material.quantity)}{material.unit ? ` ${material.unit}` : ""}</div></div>)}
                    {!(report.materials || []).length ? <div className="py-4 text-sm text-white/30">No consumed materials were recorded.</div> : null}
                  </div>
                </div>
              </div>

              {evidenceItems.length ? <div className="rounded-[22px] border border-white/10 bg-black/15 p-5"><div className="text-sm font-semibold">Completion Evidence</div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{evidenceItems.map(([item, label], index) => <EvidenceLink key={`${label}-${index}`} item={item} label={label} />)}</div></div> : null}

              <div className="rounded-[22px] border border-emerald-300/15 bg-emerald-300/[0.04] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-emerald-100">Finance billing handoff</div>
                    <div className="mt-1 text-xs text-white/35">Service Management exposes readiness; Finance remains the invoice and accounting authority.</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs capitalize text-white/60">{billingStatus(report)}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Mode</div><div className="mt-2 text-sm capitalize text-white/75">{String(report.billing?.mode || "none").replaceAll("_", " ")}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Amount</div><div className="mt-2 text-sm text-white/75">{formatMoney(report.billing?.amount, report.billing?.currency_code)}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Due</div><div className="mt-2 text-sm text-white/75">{Number(report.billing?.due_days || 0)} day{Number(report.billing?.due_days || 0) === 1 ? "" : "s"}</div></div>
                </div>
                {report.billing?.eligible ? <button type="button" onClick={createInvoice} disabled={invoiceSaving} className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 disabled:opacity-40">{invoiceSaving ? "Creating Finance invoice…" : "Create Finance Invoice"}</button> : null}
                {report.billing?.invoice?.invoice_id ? <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4 text-sm text-sky-100">Invoice {report.billing.invoice.invoice_number || report.billing.invoice.invoice_id} already exists for this completed service.</div> : null}
              </div>

              <div className="rounded-[22px] border border-cyan-300/15 bg-cyan-300/[0.04] p-5">
                <div className="text-sm font-semibold text-cyan-100">Customer message preview</div>
                <div className="mt-1 text-xs text-cyan-100/35">Billing internals and Inventory movement identifiers are intentionally excluded.</div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-white/75">{prepared.subject}</div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{prepared.body}</div>
                  <div className="mt-4 text-xs text-white/35">{prepared.attachments?.length || 0} evidence attachment{prepared.attachments?.length === 1 ? "" : "s"} will be saved with the DRAFT.</div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#9BCF53]/20 bg-[#9BCF53]/[0.05] p-5">
                <div className="text-sm font-semibold text-[#D9F4B7]">Commercial Communications handoff</div>
                {customerConversations.length ? (
                  <>
                    <label className="mt-4 block text-xs text-white/45">Customer conversation
                      <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white">
                        {customerConversations.map((row) => <option key={row.id} value={row.id}>{conversationLabel(row)}</option>)}
                      </select>
                    </label>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={createCommunicationsDraft} disabled={saving || !conversationId || Boolean(communicationDraft?.message_id)} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2.5 text-sm font-semibold text-[#D9F4B7] disabled:opacity-40">{saving ? "Creating DRAFT…" : communicationDraft?.message_id ? "DRAFT created" : "Create Communications DRAFT"}</button>
                      {communicationsHref ? <Link href={communicationsHref} className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2.5 text-sm font-semibold text-amber-100">Open in Communications to review & send →</Link> : null}
                    </div>
                    <div className="mt-3 text-xs leading-5 text-white/35">Creating the DRAFT does not send it. The exact saved message must be reviewed and explicitly confirmed inside Commercial Communications.</div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4 text-sm text-amber-100/70">No open external Communications conversation is linked to this customer. Open one in Customer Communications before creating the delivery DRAFT.</div>
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </section>
  );
}
