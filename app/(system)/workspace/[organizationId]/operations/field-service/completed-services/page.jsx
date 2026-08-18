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

function statusLabel(report) {
  if (report.billing?.invoice?.invoice_id) return "Invoiced";
  if (report.billing?.eligible) return "Ready to invoice";
  if (report.billing?.prepaid) return "Prepaid";
  if (report.billing?.mode === "none") return "No billing";
  return report.billing?.blocked_reason || "Review";
}

function statusClass(report) {
  if (report.billing?.invoice?.invoice_id) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (report.billing?.eligible) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (report.billing?.prepaid) return "border-violet-400/25 bg-violet-400/10 text-violet-200";
  return "border-white/10 bg-white/[0.04] text-white/50";
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-white/30">{detail}</div> : null}
    </div>
  );
}

export default function CompletedServicesPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/service-management/reports?organizationId=${encodeURIComponent(organizationId)}&limit=250`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Completed services could not be loaded.");
      }
      setRows(json.rows || []);
      setSummary(json.summary || {});
      setSelectedId((current) => current || json.rows?.[0]?.occurrence_id || null);
    } catch (loadError) {
      setError(loadError.message || "Completed services could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (filter === "ready") return rows.filter((row) => row.billing?.eligible);
    if (filter === "invoiced") return rows.filter((row) => row.billing?.invoice?.invoice_id);
    if (filter === "follow-up") return rows.filter((row) => row.service?.follow_up_required);
    return rows;
  }, [filter, rows]);

  const selected = useMemo(
    () => rows.find((row) => row.occurrence_id === selectedId) || null,
    [rows, selectedId],
  );

  async function createInvoice(report) {
    setWorkingId(report.occurrence_id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/service-management/reports/${encodeURIComponent(report.occurrence_id)}/invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Invoice could not be created.");
      }
      setNotice(
        json.idempotent_replay
          ? "This service was already invoiced. The existing Finance invoice was returned."
          : "Finance invoice created from the completed service.",
      );
      await load();
    } catch (invoiceError) {
      setError(invoiceError.message || "Invoice could not be created.");
    } finally {
      setWorkingId(null);
    }
  }

  if (organizationLoading) {
    return <section className="mx-auto max-w-[1480px] px-5 py-10 text-white/45">Loading completed services...</section>;
  }

  return (
    <section className="mx-auto max-w-[1480px] px-5 py-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9BCF53]">Service Management · Finance Handoff</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Completed Services</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Review performed work, service evidence, signatures, materials and billing readiness. Per-visit services can create a controlled Finance customer invoice from the completed occurrence.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Field Service</Link>
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-plans`} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2 text-sm text-[#D9F4B7]">Service Plans</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Completed" value={summary.completed || 0} />
        <Metric label="Ready to Invoice" value={summary.ready_to_invoice || 0} detail="Per-visit billing only" />
        <Metric label="Invoiced" value={summary.invoiced || 0} />
        <Metric label="Prepaid" value={summary.prepaid || 0} />
        <Metric label="Follow-up" value={summary.follow_up_required || 0} />
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">{notice}</div> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {[
          ["all", "All completed"],
          ["ready", "Ready to invoice"],
          ["invoiced", "Invoiced"],
          ["follow-up", "Follow-up required"],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl border px-3 py-2 text-xs ${filter === key ? "border-[#9BCF53]/35 bg-[#9BCF53]/10 text-[#D9F4B7]" : "border-white/10 bg-white/[0.025] text-white/45"}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/45">Refresh</button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.025]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-white/30">
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Customer / Service</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="6" className="px-4 py-10 text-center text-white/35">Loading completed services...</td></tr> : null}
                {!loading && filteredRows.length === 0 ? <tr><td colSpan="6" className="px-4 py-10 text-center text-white/35">No completed services match this view.</td></tr> : null}
                {!loading && filteredRows.map((report) => (
                  <tr key={report.occurrence_id} onClick={() => setSelectedId(report.occurrence_id)} className={`cursor-pointer border-b border-white/[0.06] align-top hover:bg-white/[0.025] ${selectedId === report.occurrence_id ? "bg-white/[0.03]" : ""}`}>
                    <td className="px-4 py-4 text-white/55">{formatDate(report.service?.completed_at)}</td>
                    <td className="px-4 py-4"><div className="font-medium text-white">{report.customer?.name || "Customer"}</div><div className="mt-1 text-xs text-white/45">{report.service?.name}{report.customer?.location_name ? ` · ${report.customer.location_name}` : ""}</div></td>
                    <td className="px-4 py-4"><div className="capitalize text-white/65">{report.service?.outcome || "completed"}</div>{report.service?.follow_up_required ? <div className="mt-1 text-[11px] text-amber-200/70">Follow-up required</div> : null}</td>
                    <td className="px-4 py-4"><div className="text-white/70">{formatMoney(report.billing?.amount, report.billing?.currency_code)}</div><div className="mt-1 text-[11px] capitalize text-white/30">{String(report.billing?.mode || "none").replaceAll("_", " ")}</div></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(report)}`}>{statusLabel(report)}</span></td>
                    <td className="px-4 py-4 text-right">
                      {report.billing?.eligible ? (
                        <button type="button" disabled={workingId === report.occurrence_id} onClick={(event) => { event.stopPropagation(); createInvoice(report); }} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-40">
                          {workingId === report.occurrence_id ? "Creating..." : "Create Invoice"}
                        </button>
                      ) : report.billing?.invoice?.invoice_id ? (
                        <span className="text-xs text-sky-200/70">{report.billing.invoice.invoice_number || report.billing.invoice.invoice_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-xs text-white/25">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
          <div className="text-lg font-semibold">Service Report</div>
          {!selected ? <div className="mt-5 text-sm text-white/35">Select a completed service to inspect the report.</div> : (
            <div className="mt-5 space-y-5">
              <div><div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Customer</div><div className="mt-1 font-medium">{selected.customer?.name || "Customer"}</div><div className="mt-1 text-xs text-white/40">{selected.customer?.location_name || "No location name"}</div></div>
              <div className="grid grid-cols-2 gap-3"><div><div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Service</div><div className="mt-1 text-sm text-white/70">{selected.service?.name || "—"}</div></div><div><div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Protocol</div><div className="mt-1 text-sm text-white/70">{selected.protocol?.name || "—"}{selected.protocol?.version ? ` v${selected.protocol.version}` : ""}</div></div></div>
              <div><div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Findings / Follow-up</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/55">{selected.service?.findings || "No additional findings recorded."}</div></div>
              <div className="grid grid-cols-2 gap-3"><Metric label="Materials" value={selected.materials?.length || 0} /><Metric label="Evidence" value={(selected.evidence?.before_photos?.length || 0) + (selected.evidence?.after_photos?.length || 0)} /></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Billing</div><div className="mt-2 flex items-end justify-between gap-3"><div><div className="text-xl font-semibold">{formatMoney(selected.billing?.amount, selected.billing?.currency_code)}</div><div className="mt-1 text-xs capitalize text-white/35">{String(selected.billing?.mode || "none").replaceAll("_", " ")}</div></div><span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusClass(selected)}`}>{statusLabel(selected)}</span></div></div>
              {selected.billing?.eligible ? <button type="button" disabled={workingId === selected.occurrence_id} onClick={() => createInvoice(selected)} className="w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-40">{workingId === selected.occurrence_id ? "Creating Finance Invoice..." : "Create Finance Invoice"}</button> : null}
              {selected.billing?.invoice?.invoice_id ? <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4 text-sm text-sky-100"><div className="font-semibold">Finance invoice created</div><div className="mt-1 text-xs text-sky-100/60">{selected.billing.invoice.invoice_number || selected.billing.invoice.invoice_id}</div></div> : null}
              <div className="text-[11px] leading-5 text-white/25">The invoice command is organization-scoped, permission-gated and idempotent. Finance remains the accounting authority.</div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
