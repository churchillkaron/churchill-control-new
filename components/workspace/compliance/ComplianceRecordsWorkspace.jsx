"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, LoaderCircle, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import Link from "next/link";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const DEFINITIONS = {
  frameworks: {
    title: "Frameworks & Requirements",
    resource: "frameworks",
    subtitle: "Regulations, standards, policies and contractual rule sets configured for this organization.",
    columns: [["framework_code", "Code"], ["framework_name", "Framework"], ["framework_type", "Type"], ["status", "Status"], ["effective_from", "Effective"]],
    fields: [
      ["framework_code", "Code", "text", true], ["framework_name", "Framework name", "text", true], ["framework_type", "Type", "select", true, ["REGULATORY","STANDARD","POLICY","CONTRACTUAL","INTERNAL"]], ["issuing_authority", "Issuing authority", "text"], ["jurisdiction_code", "Jurisdiction code", "text"], ["version", "Version", "text"], ["effective_from", "Effective from", "date"], ["effective_to", "Effective to", "date"], ["status", "Status", "select", true, ["DRAFT","ACTIVE","SUPERSEDED","ARCHIVED"]],
    ],
  },
  controls: {
    title: "Controls & Testing",
    resource: "controls",
    subtitle: "Reusable preventive, detective, corrective and directive controls with ownership and frequency.",
    columns: [["control_code", "Code"], ["control_name", "Control"], ["control_type", "Type"], ["frequency", "Frequency"], ["automation_level", "Automation"], ["status", "Status"]],
    fields: [
      ["control_code", "Control code", "text", true], ["control_name", "Control name", "text", true], ["description", "Description", "textarea"], ["control_type", "Type", "select", true, ["PREVENTIVE","DETECTIVE","CORRECTIVE","DIRECTIVE"]], ["frequency", "Frequency", "select", true, ["CONTINUOUS","DAILY","WEEKLY","MONTHLY","QUARTERLY","ANNUAL","EVENT_DRIVEN","ON_DEMAND"]], ["automation_level", "Automation", "select", true, ["MANUAL","SEMI_AUTOMATED","AUTOMATED"]], ["status", "Status", "select", true, ["DRAFT","ACTIVE","INEFFECTIVE","RETIRED"]],
    ],
  },
  evidence: {
    title: "Evidence",
    resource: "evidence",
    subtitle: "Compliance evidence linked to controls or requirements and optionally to governed Documents records.",
    columns: [["title", "Evidence"], ["evidence_type", "Type"], ["evidence_date", "Date"], ["verification_status", "Verification"], ["valid_until", "Valid until"]],
    fields: [
      ["title", "Evidence title", "text", true], ["evidence_type", "Type", "select", true, ["DOCUMENT","SYSTEM_RECORD","OBSERVATION","ATTESTATION","EXTERNAL_REPORT","PHOTO","OTHER"]], ["control_id", "Control ID", "text"], ["requirement_id", "Requirement ID", "text"], ["enterprise_document_id", "Document ID", "text"], ["description", "Description", "textarea"], ["evidence_date", "Evidence date", "date", true], ["valid_from", "Valid from", "date"], ["valid_until", "Valid until", "date"], ["verification_status", "Verification", "select", true, ["UNVERIFIED","VERIFIED","REJECTED","EXPIRED"]],
    ],
  },
  obligations: {
    title: "Obligations & Renewals",
    resource: "obligations",
    subtitle: "Licenses, permits, filings, insurance, certifications and other external or internal obligations.",
    columns: [["title", "Obligation"], ["obligation_type", "Type"], ["criticality", "Criticality"], ["due_date", "Due"], ["expiry_date", "Expiry"], ["status", "Status"]],
    fields: [
      ["title", "Title", "text", true], ["obligation_type", "Type", "select", true, ["LICENSE","PERMIT","FILING","INSURANCE","CERTIFICATION","REGULATORY","CONTRACTUAL","POLICY_REVIEW","OTHER"]], ["obligation_code", "Code", "text"], ["description", "Description", "textarea"], ["authority_name", "Authority", "text"], ["jurisdiction_code", "Jurisdiction", "text"], ["reference_number", "Reference number", "text"], ["effective_from", "Effective from", "date"], ["due_date", "Due date", "date"], ["expiry_date", "Expiry date", "date"], ["renewal_lead_days", "Renewal lead days", "number"], ["criticality", "Criticality", "select", true, ["LOW","MEDIUM","HIGH","CRITICAL"]], ["status", "Status", "select", true, ["DRAFT","ACTIVE","PENDING","COMPLETED","EXPIRED","SUSPENDED","CANCELLED","NOT_APPLICABLE"]], ["enterprise_document_id", "Document ID", "text"],
    ],
  },
  risks: {
    title: "Risk Register",
    resource: "risks",
    subtitle: "Inherent and residual compliance risk with explicit appetite, treatment and review dates.",
    columns: [["risk_code", "Code"], ["title", "Risk"], ["category", "Category"], ["status", "Status"], ["next_review_date", "Next review"]],
    fields: [
      ["risk_code", "Risk code", "text", true], ["title", "Risk title", "text", true], ["description", "Description", "textarea"], ["category", "Category", "text"], ["inherent_likelihood", "Inherent likelihood (1-5)", "number", true], ["inherent_impact", "Inherent impact (1-5)", "number", true], ["residual_likelihood", "Residual likelihood (1-5)", "number"], ["residual_impact", "Residual impact (1-5)", "number"], ["appetite_level", "Risk appetite", "select", true, ["LOW","MEDIUM","HIGH"]], ["treatment_strategy", "Treatment", "select", true, ["ACCEPT","AVOID","TRANSFER","MITIGATE"]], ["status", "Status", "select", true, ["OPEN","MONITORING","MITIGATED","ACCEPTED","CLOSED"]], ["next_review_date", "Next review", "date"],
    ],
  },
  issues: {
    title: "Issues & Findings",
    resource: "issues",
    subtitle: "Control exceptions, audit findings, breaches and non-compliance that require accountable resolution.",
    columns: [["issue_code", "Code"], ["title", "Issue"], ["issue_type", "Type"], ["severity", "Severity"], ["due_date", "Due"], ["status", "Status"]],
    fields: [
      ["issue_code", "Issue code", "text", true], ["title", "Issue title", "text", true], ["description", "Description", "textarea"], ["issue_type", "Type", "select", true, ["CONTROL_EXCEPTION","NON_COMPLIANCE","AUDIT_FINDING","OBLIGATION_BREACH","RISK_EVENT","OTHER"]], ["severity", "Severity", "select", true, ["LOW","MEDIUM","HIGH","CRITICAL"]], ["status", "Status", "select", true, ["OPEN","IN_REMEDIATION","AWAITING_VALIDATION","RESOLVED","ACCEPTED","CLOSED"]], ["control_id", "Control ID", "text"], ["risk_id", "Risk ID", "text"], ["obligation_id", "Obligation ID", "text"], ["due_date", "Due date", "date"], ["resolution_summary", "Resolution summary", "textarea"],
    ],
  },
  remediation: {
    title: "Remediation",
    resource: "remediation",
    subtitle: "Corrective actions attached to compliance issues, with due dates, completion evidence and verification.",
    columns: [["action_number", "#"], ["title", "Action"], ["due_date", "Due"], ["status", "Status"], ["completed_at", "Completed"]],
    fields: [
      ["issue_id", "Issue ID", "text", true], ["action_number", "Action number", "number", true], ["title", "Action title", "text", true], ["description", "Description", "textarea"], ["due_date", "Due date", "date"], ["status", "Status", "select", true, ["OPEN","IN_PROGRESS","BLOCKED","COMPLETED","VERIFIED","CANCELLED"]],
    ],
  },
};

function clean(value) { return String(value ?? "").trim(); }
function pretty(value) { return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

function emptyForm(definition) {
  return Object.fromEntries((definition.fields || []).map(([name, , type, , options]) => [name, type === "select" ? (options?.[0] || "") : ""]));
}

export default function ComplianceRecordsWorkspace({ organizationId, mode }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const definition = DEFINITIONS[mode] || DEFINITIONS.obligations;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm(definition));

  useEffect(() => {
    setForm(emptyForm(definition));
    setEditingId(null);
    setEditorOpen(false);
  }, [mode]);

  async function load() {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ organizationId, resource: definition.resource });
      if (entityId) params.set("entityId", entityId);
      if (periodId) params.set("periodId", periodId);
      const response = await fetch(`/api/workspace/compliance/records?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Compliance records failed (${response.status})`);
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e) { setRows([]); setError(e?.message || "Compliance records could not be loaded"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId, definition.resource]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => Object.values(row || {}).some(value => typeof value === "string" && value.toLowerCase().includes(needle)));
  }, [rows, query]);

  function openCreate() { setEditingId(null); setForm(emptyForm(definition)); setEditorOpen(true); setError(""); }
  function openEdit(row) {
    setEditingId(row.id);
    const next = {};
    for (const [name] of definition.fields) next[name] = row?.[name] ?? "";
    setForm(next); setEditorOpen(true); setError("");
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const data = {};
      for (const [name, , type] of definition.fields) {
        const value = form[name];
        if (value === "") continue;
        data[name] = type === "number" ? Number(value) : value;
      }
      const response = await fetch("/api/workspace/compliance/records", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, entityId: entityId || null, periodId: periodId || null, resource: definition.resource, id: editingId || undefined, data }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Save failed (${response.status})`);
      setEditorOpen(false); setEditingId(null); await load();
    } catch (e) { setError(e?.message || "Compliance record could not be saved"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1750px] space-y-4 pb-10 text-[#1B1A18]">
      <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href={`/workspace/${organizationId}/compliance`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8B6238]"><ArrowLeft size={11} /> Compliance</Link>
            <h1 className="mt-2 text-[27px] font-semibold tracking-[-0.035em]">{definition.title}</h1>
            <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#77726A]">{definition.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[11px] font-medium text-[#4B4842]"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh</button>
            <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[11px] font-medium text-white"><Plus size={13} />New</button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800"><AlertTriangle size={13} className="mr-2 inline" />{error}</div> : null}

      <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
        <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-[#77726A]">{filtered.length} record{filtered.length === 1 ? "" : "s"}</div>
          <label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none focus:border-[#D6A66A] sm:w-64" /></label>
        </div>
        {loading ? <div className="flex min-h-56 items-center justify-center text-[12px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading…</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left"><thead className="bg-[#FAF9F7] text-[9px] font-medium uppercase tracking-[0.12em] text-[#817D76]"><tr>{definition.columns.map(([field,label]) => <th key={field} className="px-4 py-3">{label}</th>)}<th className="w-24 px-4 py-3" /></tr></thead><tbody className="divide-y divide-black/[0.055] text-[11px]">{filtered.map(row => <tr key={row.id} className="hover:bg-[#FCFBF9]">{definition.columns.map(([field]) => <td key={field} className="max-w-[320px] truncate px-4 py-3 text-[#514D46]">{typeof row[field] === "boolean" ? (row[field] ? "Yes" : "No") : row[field] ?? "—"}</td>)}<td className="px-4 py-3 text-right"><button type="button" onClick={() => openEdit(row)} className="rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[10px] font-medium text-[#5C5750]">Edit</button></td></tr>)}{!filtered.length ? <tr><td colSpan={definition.columns.length + 1} className="px-4 py-12 text-center text-[11px] text-[#918B83]">No records yet.</td></tr> : null}</tbody></table></div>
        )}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-[2px] sm:items-center">
          <div className="max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-black/10 bg-[#F7F6F3] shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.07] bg-white px-5 py-4"><div><div className="text-[10px] uppercase tracking-[0.16em] text-[#A37849]">{editingId ? "Edit" : "Create"}</div><div className="mt-1 text-[17px] font-semibold">{definition.title}</div></div><button type="button" onClick={() => setEditorOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08]"><X size={14} /></button></div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {definition.fields.map(([name,label,type,required,options]) => (
                <label key={name} className={type === "textarea" ? "md:col-span-2" : ""}><span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-[#77726A]">{label}{required ? " *" : ""}</span>{type === "select" ? <select value={form[name] ?? ""} onChange={e => setForm(v => ({...v,[name]:e.target.value}))} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[11px] outline-none focus:border-[#D6A66A]">{(options || []).map(option => <option key={option} value={option}>{pretty(option)}</option>)}</select> : type === "textarea" ? <textarea value={form[name] ?? ""} onChange={e => setForm(v => ({...v,[name]:e.target.value}))} rows={4} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-[11px] outline-none focus:border-[#D6A66A]" /> : <input type={type} value={form[name] ?? ""} onChange={e => setForm(v => ({...v,[name]:e.target.value}))} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[11px] outline-none focus:border-[#D6A66A]" />}</label>
              ))}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-black/[0.07] bg-white px-5 py-4"><button type="button" onClick={() => setEditorOpen(false)} className="h-9 rounded-lg border border-black/[0.09] px-3 text-[11px]">Cancel</button><button type="button" disabled={busy} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-4 text-[11px] font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}Save</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
