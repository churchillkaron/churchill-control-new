"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  FileCheck2,
  GitBranch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

function clean(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(status) {
  if (status === "ACTIVE") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (status === "DRAFT") return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#777168]";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStep(step, index) {
  return {
    ...step,
    step_key: clean(step.step_key) || `step_${index + 1}`,
    sequence_no: Number(step.sequence_no || index + 1),
    title: step.title || "",
    description: step.description || "",
    work_type: step.work_type || "INTERNAL",
    required_role: step.required_role || "PREPARER",
    relative_due_days: Number(step.relative_due_days || 0),
    due_anchor: step.due_anchor || "PERIOD_END",
    dependency_step_keys: Array.isArray(step.dependency_step_keys) ? step.dependency_step_keys : [],
    capability_id: step.capability_id || "",
    instructions: step.instructions || "",
    evidence_required: step.evidence_required === true,
    active: step.active !== false,
    metadata: step.metadata && typeof step.metadata === "object" ? step.metadata : {},
    budget_minutes: Number(step.budget_minutes || 0),
    required_skill_keys: Array.isArray(step.required_skill_keys) ? step.required_skill_keys : [],
  };
}

function editableTemplate(template) {
  const value = clone(template);
  value.steps = (value.steps || []).map(normalizeStep);
  return value;
}

function newStep(index) {
  return normalizeStep(
    {
      step_key: `step_${index + 1}`,
      sequence_no: index + 1,
      title: "New procedure",
      work_type: "INTERNAL",
      required_role: "PREPARER",
      due_anchor: "PERIOD_END",
      active: true,
      evidence_required: false,
      metadata: {},
    },
    index,
  );
}

function cycleExists(steps) {
  const active = steps.filter((step) => step.active !== false);
  const keys = new Set(active.map((step) => clean(step.step_key)).filter(Boolean));
  const graph = new Map(
    active.map((step) => [
      clean(step.step_key),
      (step.dependency_step_keys || []).map(clean).filter((key) => keys.has(key)),
    ]),
  );
  const visiting = new Set();
  const visited = new Set();
  function walk(key) {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const dependency of graph.get(key) || []) if (walk(dependency)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  }
  return [...keys].some(walk);
}

function validate(template) {
  if (!template?.editable) return [];
  const issues = [];
  const steps = (template.steps || []).filter((step) => step.active !== false);
  if (!clean(template.name)) issues.push("Template name is required.");
  if (!steps.length) issues.push("At least one active procedure is required.");

  const keys = steps.map((step) => clean(step.step_key));
  const sequences = steps.map((step) => Number(step.sequence_no || 0));
  if (new Set(keys).size !== keys.length) issues.push("Procedure keys must be unique.");
  if (new Set(sequences).size !== sequences.length) issues.push("Procedure sequence numbers must be unique.");

  const keySet = new Set(keys.filter(Boolean));
  for (const step of steps) {
    if (!clean(step.step_key)) issues.push(`Procedure ${step.sequence_no || "?"} needs a key.`);
    if (!clean(step.title)) issues.push(`${step.step_key || "Procedure"} needs a title.`);
    if (Number(step.sequence_no || 0) <= 0) issues.push(`${step.step_key || "Procedure"} needs a positive sequence.`);
    const dependencies = (step.dependency_step_keys || []).map(clean).filter(Boolean);
    if (dependencies.includes(clean(step.step_key))) issues.push(`${step.step_key} cannot depend on itself.`);
    for (const dependency of dependencies) if (!keySet.has(dependency)) issues.push(`${step.step_key} depends on unknown procedure ${dependency}.`);

    const verification = step.metadata?.system_verification;
    if (step.evidence_required && step.capability_id === "documents") {
      if (verification?.mode !== "DOCUMENT_CATEGORIES" || !Array.isArray(verification?.categories) || !verification.categories.length) {
        issues.push(`${step.title || step.step_key}: configure document evidence categories.`);
      }
    }
    if (step.evidence_required && step.capability_id === "statements") {
      if (verification?.mode !== "FINANCIAL_REPORT_SET" || !Array.isArray(verification?.reports) || !verification.reports.length) {
        issues.push(`${step.title || step.step_key}: configure required financial reports.`);
      }
    }
  }
  if (cycleExists(steps)) issues.push("Procedure dependencies contain a cycle.");
  return [...new Set(issues)];
}

function VerificationEditor({ step, onChange }) {
  if (!step.evidence_required || !["documents", "statements"].includes(step.capability_id)) return null;
  const verification = step.metadata?.system_verification || {};

  if (step.capability_id === "documents") {
    const categories = Array.isArray(verification.categories) ? verification.categories : [];
    const csv = categories.map((item) => item?.key || "").filter(Boolean).join(", ");
    return (
      <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#80603F]">Document evidence gate</div>
        <div className="mt-1 text-[9px] leading-4 text-[#8B857C]">Comma-separated canonical evidence categories. Each category requires at least one linked document.</div>
        <input
          value={csv}
          onChange={(event) => {
            const values = event.target.value.split(",").map(clean).filter(Boolean);
            onChange({
              ...step,
              metadata: {
                ...(step.metadata || {}),
                system_verification: {
                  ...verification,
                  mode: "DOCUMENT_CATEGORIES",
                  categories: values.map((key) => ({ key, label: label(key), min_count: 1 })),
                },
              },
            });
          }}
          placeholder="bank_statement, vendor_invoice, tax_document"
          className="mt-2 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] outline-none focus:border-[#A37849]/60"
        />
      </div>
    );
  }

  const reports = Array.isArray(verification.reports) ? verification.reports : [];
  return (
    <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#80603F]">Financial statement gate</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["trial_balance", "profit_and_loss", "balance_sheet", "cash_flow"].map((report) => {
          const selected = reports.includes(report);
          return (
            <button
              type="button"
              key={report}
              onClick={() => {
                const nextReports = selected ? reports.filter((value) => value !== report) : [...reports, report];
                onChange({
                  ...step,
                  metadata: {
                    ...(step.metadata || {}),
                    system_verification: {
                      ...verification,
                      mode: "FINANCIAL_REPORT_SET",
                      reports: nextReports,
                      require_balanced_trial_balance: nextReports.includes("trial_balance"),
                    },
                  },
                });
              }}
              className={`rounded-full border px-2.5 py-1 text-[9px] ${selected ? "border-[#A37849]/25 bg-[#A37849]/10 text-[#76583A]" : "border-black/[0.08] bg-white text-[#7D776E]"}`}
            >
              {label(report)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepEditor({ step, index, allSteps, expanded, onToggle, onChange, onRemove }) {
  const dependencyOptions = allSteps.filter((candidate) => clean(candidate.step_key) !== clean(step.step_key));
  const dependencies = step.dependency_step_keys || [];
  return (
    <div className="border-b border-black/[0.06] last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FBFAF8]">
        {expanded ? <ChevronDown size={14} className="text-[#9A744B]" /> : <ChevronRight size={14} className="text-[#A29D95]" />}
        <span className="w-8 text-[10px] tabular-nums text-[#9C968D]">{String(step.sequence_no || index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#3B3833]">{step.title || "Untitled procedure"}</span>
        <span className="hidden rounded-full border border-black/[0.07] bg-[#F8F7F4] px-2 py-0.5 text-[8px] uppercase text-[#827C74] md:inline">{label(step.required_role)}</span>
        {step.evidence_required ? <FileCheck2 size={12} className="text-[#A37849]" /> : null}
      </button>
      {expanded ? (
        <div className="bg-[#FBFAF8] px-4 pb-4 pt-1">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Title<input value={step.title} onChange={(event) => onChange({ ...step, title: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal outline-none focus:border-[#A37849]/60" /></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Procedure key<input value={step.step_key} onChange={(event) => onChange({ ...step, step_key: event.target.value.replace(/\s+/g, "_").toLowerCase() })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal outline-none focus:border-[#A37849]/60" /></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Role<select value={step.required_role} onChange={(event) => onChange({ ...step, required_role: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal"><option>PREPARER</option><option>REVIEWER</option><option>PARTNER</option></select></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Work type<select value={step.work_type} onChange={(event) => onChange({ ...step, work_type: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal"><option>INTERNAL</option><option>CLIENT_REQUEST</option><option>FINANCE_REVIEW</option><option>SYSTEM_CHECK</option></select></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Capability<input value={step.capability_id} onChange={(event) => onChange({ ...step, capability_id: event.target.value })} placeholder="documents, statements, journals..." className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal outline-none focus:border-[#A37849]/60" /></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Budget minutes<input type="number" min="0" value={step.budget_minutes} onChange={(event) => onChange({ ...step, budget_minutes: Math.max(0, Number(event.target.value || 0)) })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal" /></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Due offset<input type="number" value={step.relative_due_days} onChange={(event) => onChange({ ...step, relative_due_days: Number(event.target.value || 0) })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal" /></label>
            <label className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Due anchor<select value={step.due_anchor} onChange={(event) => onChange({ ...step, due_anchor: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal"><option>PERIOD_END</option><option>RUN_START</option></select></label>
          </div>

          <label className="mt-3 block text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Description<textarea value={step.description} onChange={(event) => onChange({ ...step, description: event.target.value })} rows={2} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[10px] normal-case leading-4 tracking-normal outline-none focus:border-[#A37849]/60" /></label>
          <label className="mt-3 block text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Instructions<textarea value={step.instructions} onChange={(event) => onChange({ ...step, instructions: event.target.value })} rows={2} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[10px] normal-case leading-4 tracking-normal outline-none focus:border-[#A37849]/60" /></label>

          <div className="mt-3">
            <div className="text-[9px] font-medium uppercase tracking-[0.11em] text-[#89837B]">Dependencies</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dependencyOptions.map((candidate) => {
                const key = clean(candidate.step_key);
                const selected = dependencies.includes(key);
                return <button key={key || candidate.sequence_no} type="button" onClick={() => onChange({ ...step, dependency_step_keys: selected ? dependencies.filter((value) => value !== key) : [...dependencies, key] })} className={`rounded-full border px-2.5 py-1 text-[9px] ${selected ? "border-[#A37849]/25 bg-[#A37849]/10 text-[#76583A]" : "border-black/[0.08] bg-white text-[#817B72]"}`}>{candidate.title || key}</button>;
              })}
              {!dependencyOptions.length ? <span className="text-[9px] text-[#A19B92]">No other procedures yet.</span> : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[9px] text-[#706A62]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={step.evidence_required} onChange={(event) => onChange({ ...step, evidence_required: event.target.checked })} /> Evidence required</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={step.active !== false} onChange={(event) => onChange({ ...step, active: event.target.checked })} /> Active</label>
            <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1.5 text-red-700"><Trash2 size={11} /> Remove</button>
          </div>
          <VerificationEditor step={step} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceWorkProgramTemplateStudio({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedStep, setExpandedStep] = useState(null);

  async function load(preferredId = null) {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/work-program-templates", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load work programs");
      setState({ loading: false, error: "", data: body });
      const templates = body.templates || [];
      const nextId = preferredId || selectedId || templates.find((row) => row.status === "DRAFT")?.id || templates.find((row) => row.status === "ACTIVE")?.id || templates[0]?.id || null;
      setSelectedId(nextId);
      const selected = templates.find((row) => row.id === nextId) || null;
      setDraft(selected ? editableTemplate(selected) : null);
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load work programs", data: null });
    }
  }

  useEffect(() => { load(); }, [organizationId]);

  const templates = state.data?.templates || [];
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return templates;
    return templates.filter((item) => [item.name, item.lineage_key, item.service_key, item.status].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [templates, query]);
  const issues = useMemo(() => validate(draft), [draft]);
  const ready = Boolean(draft?.editable) && issues.length === 0;
  const activeSteps = (draft?.steps || []).filter((step) => step.active !== false);
  const totalBudget = activeSteps.reduce((sum, step) => sum + Number(step.budget_minutes || 0), 0);

  function select(template) {
    setSelectedId(template.id);
    setDraft(editableTemplate(template));
    setExpandedStep(null);
    setNotice("");
  }

  async function mutate(action, payload = {}) {
    if (busy) return;
    try {
      setBusy(action);
      setNotice("");
      const response = await fetch("/api/workspace/finance/work-program-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Work program update failed");
      const targetId = body?.result?.template_id || selectedId;
      setNotice(action === "clone" ? "Draft version created." : action === "save" ? "Draft saved." : action === "publish" ? "Version published and prior active version archived." : "Version archived.");
      await load(targetId);
    } catch (error) {
      setNotice(error?.message || "Work program update failed");
    } finally {
      setBusy("");
    }
  }

  if (state.loading && !state.data) {
    return <div className="flex min-h-[520px] items-center justify-center bg-[#F7F6F3] text-[12px] text-[#7B756D]"><LoaderCircle size={16} className="mr-2 animate-spin text-[#A37849]" />Loading governed work programs…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#23211E]">
      <div className="mx-auto max-w-[1840px] px-5 py-6 md:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]"><ShieldCheck size={13} /> Finance governance</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] md:text-[32px]">Work Program Library</h1>
            <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-[#777168]">Standardize how accounting work is prepared, evidenced and reviewed. Published versions are immutable; changes always move through a new governed draft.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load()} disabled={state.loading || Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] font-medium text-[#615C55]"><RefreshCw size={12} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
          </div>
        </header>

        {state.error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{state.error}</div> : null}
        {notice ? <div className={`mt-4 rounded-xl border px-4 py-3 text-[10px] ${/failed|error|invalid|required|unknown|immutable/i.test(notice) ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{notice}</div> : null}

        <div className="mt-5 grid min-h-[680px] gap-4 xl:grid-cols-[290px_minmax(620px,1fr)_330px]">
          <aside className="rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.06] p-3.5">
              <div className="relative"><Search size={13} className="absolute left-3 top-2.5 text-[#A39E96]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find work program…" className="h-8 w-full rounded-lg border border-black/[0.075] bg-[#FAF9F7] pl-8 pr-3 text-[10px] outline-none focus:border-[#A37849]/45" /></div>
              <div className="mt-2 text-[8px] uppercase tracking-[0.12em] text-[#99938A]">{state.data?.summary?.lineages || 0} lineages · {state.data?.summary?.drafts || 0} drafts</div>
            </div>
            <div className="max-h-[620px] overflow-y-auto p-2">
              {filtered.map((template) => (
                <button key={template.id} type="button" onClick={() => select(template)} className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition ${selectedId === template.id ? "border-[#A37849]/25 bg-[#FBF6EF]" : "border-transparent hover:border-black/[0.06] hover:bg-[#FAF9F7]"}`}>
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#3B3833]">{template.name}</div><div className="mt-1 text-[8px] text-[#948E85]">v{template.version} · {template.is_system ? "Avantiqo standard" : "Firm version"}</div></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[7px] font-semibold uppercase ${statusTone(template.status)}`}>{template.status}</span></div>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            {!draft ? <div className="p-8 text-[11px] text-[#8A847C]">Select a work program.</div> : (
              <>
                <div className="border-b border-black/[0.06] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase ${statusTone(draft.status)}`}>{draft.status}</span><span className="text-[9px] text-[#918B83]">Version {draft.version} · {draft.is_system ? "System standard" : "Firm controlled"}</span></div>
                      {draft.editable ? <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-3 h-10 w-full max-w-2xl rounded-xl border border-black/[0.08] bg-[#FCFBF9] px-3 text-[18px] font-semibold tracking-[-0.025em] outline-none focus:border-[#A37849]/55" /> : <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.03em]">{draft.name}</h2>}
                      <div className="mt-2 text-[9px] text-[#99938A]">Lineage: {draft.lineage_key || draft.template_key}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!draft.editable ? <button type="button" disabled={Boolean(busy)} onClick={() => mutate("clone", { sourceTemplateId: draft.id, name: draft.name })} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#A37849]/20 bg-[#FFFDF9] px-3 text-[9px] font-semibold text-[#76583A] disabled:opacity-50"><Copy size={12} /> {busy === "clone" ? "Creating…" : "Create draft"}</button> : null}
                      {draft.editable ? <button type="button" disabled={Boolean(busy)} onClick={() => mutate("save", { template: draft })} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#5D5851] disabled:opacity-50"><Save size={12} /> {busy === "save" ? "Saving…" : "Save draft"}</button> : null}
                      {draft.editable ? <button type="button" disabled={!ready || Boolean(busy)} onClick={() => mutate("publish", { templateId: draft.id })} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#2F2A24] px-3 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"><BadgeCheck size={12} /> {busy === "publish" ? "Publishing…" : `Publish v${draft.version}`}</button> : null}
                      {!draft.is_system && draft.status === "ACTIVE" ? <button type="button" disabled={Boolean(busy)} onClick={() => mutate("archive", { templateId: draft.id })} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] px-3 text-[9px] text-[#777168]"><Archive size={12} /> Archive</button> : null}
                    </div>
                  </div>

                  {draft.editable ? <div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8D877F]">Cadence<select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2 text-[10px] normal-case tracking-normal"><option>WEEKLY</option><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option><option>AD_HOC</option></select></label><label className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8D877F]">Service key<input value={draft.service_key || ""} onChange={(event) => setDraft({ ...draft, service_key: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal" /></label><label className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8D877F]">Description<input value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] normal-case tracking-normal" /></label></div> : <p className="mt-4 max-w-3xl text-[10px] leading-5 text-[#817B73]">{draft.description || "Published work program. Create a draft to change procedures, evidence gates, ownership or timing."}</p>}
                </div>

                <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8D877F]">Procedures</div><div className="mt-0.5 text-[9px] text-[#A09A91]">Ordered work with explicit ownership, dependencies and evidence.</div></div>{draft.editable ? <button type="button" onClick={() => { const steps = [...(draft.steps || []), newStep((draft.steps || []).length)]; setDraft({ ...draft, steps }); setExpandedStep(steps.length - 1); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-[#FFFDF9] px-2.5 text-[9px] font-semibold text-[#76583A]"><Plus size={11} /> Add procedure</button> : null}</div>
                <div>
                  {(draft.steps || []).map((step, index) => draft.editable ? <StepEditor key={`${step.id || step.step_key}-${index}`} step={step} index={index} allSteps={draft.steps || []} expanded={expandedStep === index} onToggle={() => setExpandedStep(expandedStep === index ? null : index)} onChange={(next) => setDraft({ ...draft, steps: draft.steps.map((value, itemIndex) => itemIndex === index ? next : value) })} onRemove={() => setDraft({ ...draft, steps: draft.steps.filter((_, itemIndex) => itemIndex !== index).map((value, itemIndex) => ({ ...value, sequence_no: itemIndex + 1 })) })} /> : <div key={step.id || step.step_key} className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-3 last:border-b-0"><span className="w-8 text-[9px] text-[#9A948B]">{String(step.sequence_no).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium text-[#3C3934]">{step.title}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{label(step.required_role)} · {label(step.work_type)} · {step.budget_minutes || 0} min</div></div>{step.evidence_required ? <FileCheck2 size={12} className="text-[#A37849]" /> : null}</div>)}
                </div>
              </>
            )}
          </main>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><GitBranch size={12} /> Version control</div>
              <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase text-[#938D84]">Version</div><div className="mt-1 text-[18px] font-semibold">v{draft?.version || "—"}</div></div><div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase text-[#938D84]">Procedures</div><div className="mt-1 text-[18px] font-semibold">{activeSteps.length}</div></div><div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase text-[#938D84]">Budget</div><div className="mt-1 text-[18px] font-semibold">{Math.round(totalBudget / 6) / 10}h</div></div><div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase text-[#938D84]">Status</div><div className="mt-1 text-[11px] font-semibold">{label(draft?.status || "—")}</div></div></div>
              <div className="mt-3 rounded-xl border border-[#A37849]/12 bg-[#FFFDF9] p-3 text-[9px] leading-4 text-[#756D64]">Published versions never change in place. Create a draft, review the differences, then publish a new immutable version.</div>
            </section>

            <section className={`rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)] ${ready ? "border-emerald-700/15 bg-emerald-50/50" : "border-black/[0.075] bg-white"}`}>
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><Sparkles size={12} /> Publish readiness</div>{ready ? <BadgeCheck size={15} className="text-emerald-700" /> : <CircleDot size={15} className="text-amber-700" />}</div>
              {!draft?.editable ? <div className="mt-3 text-[9px] leading-4 text-[#817B73]">This version is read-only. Clone it to create the next controlled draft.</div> : ready ? <div className="mt-3 text-[9px] leading-4 text-emerald-800">Ready to publish. Server-side validation will re-check dependency cycles and required evidence configuration before promotion.</div> : <div className="mt-3 space-y-2">{issues.slice(0, 10).map((issue) => <div key={issue} className="flex items-start gap-2 rounded-lg border border-amber-700/10 bg-amber-50 px-2.5 py-2 text-[8px] leading-4 text-amber-900"><AlertTriangle size={10} className="mt-0.5 shrink-0" />{issue}</div>)}</div>}
            </section>

            <section className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><ShieldCheck size={12} /> Governance contract</div>
              <div className="mt-3 space-y-2 text-[9px] leading-4 text-[#7C766E]"><div className="flex gap-2"><BadgeCheck size={11} className="mt-0.5 shrink-0 text-[#7A6B52]" />One active version per lineage.</div><div className="flex gap-2"><BadgeCheck size={11} className="mt-0.5 shrink-0 text-[#7A6B52]" />System standards remain immutable.</div><div className="flex gap-2"><BadgeCheck size={11} className="mt-0.5 shrink-0 text-[#7A6B52]" />Dependencies are checked before publish.</div><div className="flex gap-2"><BadgeCheck size={11} className="mt-0.5 shrink-0 text-[#7A6B52]" />Evidence gates are explicit, not implied.</div></div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
