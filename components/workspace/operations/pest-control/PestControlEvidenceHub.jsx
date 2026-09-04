"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileCheck2, MapPin, RefreshCw } from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWhen(value) {
  const date = dateValue(value);
  if (!date) return "No schedule";
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function isTerminal(row) {
  return ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.occurrence_status))
    || ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.work_order_status));
}

function proofRequired(row) {
  const protocol = row?.execution_protocol || {};
  const evidence = protocol.evidence_requirements || {};
  const fields = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  return Object.values(evidence).some(Boolean)
    || fields.some((field) => field?.required && ["photo", "signature", "file"].includes(normalized(field.type)));
}

export default function PestControlEvidenceHub({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [view, setView] = useState("needs-proof");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Service evidence queue could not be loaded.");
      setState({ loading: false, error: "", rows: Array.isArray(json.rows) ? json.rows : [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Service evidence queue could not be loaded.", rows: [] });
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const ordered = [...state.rows].sort((a, b) => new Date(a.scheduled_start || a.occurrence_at || 0) - new Date(b.scheduled_start || b.occurrence_at || 0));
    if (view === "all") return ordered;
    if (view === "recorded") return ordered.filter((row) => row.latest_completion_evidence_id || row.completion?.completion_evidence_id);
    return ordered.filter((row) => !isTerminal(row) && proofRequired(row) && !(row.latest_completion_evidence_id || row.completion?.completion_evidence_id));
  }, [state.rows, view]);

  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;
  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Completion evidence</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Proof queue</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Open the exact service visit that needs proof. Required evidence is derived from the snapshotted treatment protocol, not from a generic attachment checklist.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={technicianHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Technician execution</Link>
            <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh evidence queue"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">Service proof</div>
              <div className="mt-0.5 text-[8px] text-[#9A948C]">Evidence remains bound to the exact occurrence and work order.</div>
            </div>
            <div className="flex rounded-xl bg-[#F4F2EE] p-1">
              {[["needs-proof", "Needs proof"], ["recorded", "Recorded"], ["all", "All visits"]].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-2 text-[8px] font-medium ${view === value ? "bg-white text-[#5C4935] shadow-sm" : "text-[#8D877F]"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-black/[0.055]">
            {!state.loading && rows.length === 0 ? <div className="px-4 py-12 text-center text-[10px] text-[#8D877F]">No service visits in this evidence view.</div> : null}
            {rows.map((row) => {
              const evidenceId = row.latest_completion_evidence_id || row.completion?.completion_evidence_id || null;
              const route = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/evidence/${encodeURIComponent(row.occurrence_id)}`;
              return (
                <Link key={row.occurrence_id} href={route} className="grid gap-3 px-3 py-4 transition hover:bg-[#FBFAF8] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_160px_130px] md:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-[#35312C]">{row.customer_name || "Customer"}</div>
                    <div className="mt-0.5 truncate text-[8px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div>
                  </div>
                  <div className="min-w-0 text-[8px] text-[#777169]"><div className="flex items-center gap-1"><MapPin size={9} /><span className="truncate">{row.customer_location_name || "Site not named"}</span></div><div className="mt-1 flex items-center gap-1"><Clock3 size={9} />{formatWhen(row.scheduled_start || row.occurrence_at)}</div></div>
                  <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.05em] ${evidenceId ? "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]" : proofRequired(row) ? "border-[#C08A4A]/20 bg-[#C08A4A]/[0.05] text-[#8A6846]" : "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]"}`}>{evidenceId ? <CheckCircle2 size={8} /> : <FileCheck2 size={8} />}{evidenceId ? "Proof recorded" : proofRequired(row) ? "Proof required" : "Optional"}</span></div>
                  <div className="text-right text-[8px] font-medium text-[#76583A]">{evidenceId ? "Review package →" : "Capture proof →"}</div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
