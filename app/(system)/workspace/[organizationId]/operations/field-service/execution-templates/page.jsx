"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const STEPS = [["basics", "Basics"], ["questions", "Technician questions"], ["proof", "Required proof"], ["review", "Review"]];
const ANSWER_TYPES = [
  ["text", "Short answer"],
  ["textarea", "Detailed note"],
  ["select", "Choose from a list"],
  ["checkbox", "Confirm yes / no"],
  ["number", "Number"],
  ["measurement", "Measurement with unit"],
  ["date", "Date"],
  ["datetime", "Date & time"],
];
const SECTIONS = ["Inspection", "Pest activity", "Treatment", "Safety", "Customer", "Completion"];
const EMPTY_FORM = Object.freeze({ name: "", description: "", instructions: "", before_photos: true, after_photos: true, customer_signature: false, technician_signature: true, location_confirmation: true });
const EMPTY_QUESTION = Object.freeze({ label: "", section: "Inspection", type: "text", required: true, help_text: "", unit: "", options_text: "" });

function slug(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function typeLabel(type) { return ANSWER_TYPES.find(([value]) => value === type)?.[1] || type; }
function proofCount(form) { return [form.before_photos, form.after_photos, form.customer_signature, form.technician_signature, form.location_confirmation].filter(Boolean).length; }

function Labeled({ label, hint, children }) {
  return <label className="block"><span className="text-[9px] font-medium text-[#4E4943]">{label}</span>{hint ? <span className="ml-2 text-[8px] text-[#99928A]">{hint}</span> : null}{children}</label>;
}
function ProofToggle({ label, description, checked, onChange }) {
  return <button type="button" onClick={() => onChange(!checked)} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition ${checked ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.055]" : "border-black/[0.07] bg-[#FBFAF8]"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-[#D6A66A] bg-[#D6A66A] text-[#2C2925]" : "border-black/[0.15] bg-white text-transparent"}`}><Check size={11} /></span><span><span className="block text-[10px] font-medium text-[#4E4943]">{label}</span><span className="mt-0.5 block text-[8px] leading-4 text-[#8A837A]">{description}</span></span></button>;
}

export default function ServiceExecutionTemplatesPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [questions, setQuestions] = useState([{ ...EMPTY_QUESTION }]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputClass = "mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-3 text-[11px] text-[#2B2926] outline-none transition focus:border-[#D6A66A]/60";

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/service-management/execution-templates?organizationId=${encodeURIComponent(organizationId)}&industry_key=pest_control&status=all&limit=500`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment protocols could not be loaded.");
      setTemplates(json.rows || []);
    } catch (loadError) { setError(loadError.message || "Treatment protocols could not be loaded."); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  const activeTemplates = useMemo(() => templates.filter((template) => template.status === "active"), [templates]);

  function updateForm(name, value) { setForm((current) => ({ ...current, [name]: value })); setError(""); }
  function updateQuestion(index, name, value) { setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, [name]: value } : question)); setError(""); }
  function addQuestion() { setQuestions((current) => [...current, { ...EMPTY_QUESTION }]); }
  function removeQuestion(index) { setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index)); }

  function validateStep(index) {
    if (index === 0 && !form.name.trim()) return "Give this protocol a clear name technicians and supervisors will recognize.";
    if (index === 1) {
      if (!questions.length) return "Add at least one technician question so the protocol captures the work performed.";
      const incomplete = questions.find((question) => !question.label.trim() || (question.type === "select" && !question.options_text.split("\n").some((value) => value.trim())) || (question.type === "measurement" && !question.unit.trim()));
      if (incomplete) return "Finish each technician question, including choices or measurement unit where required.";
      const keys = questions.map((question) => slug(question.label));
      if (new Set(keys).size !== keys.length) return "Two technician questions have the same name. Rename one so each answer is unambiguous.";
    }
    return "";
  }
  function next() { const validation = validateStep(step); if (validation) { setError(validation); return; } setStep((current) => Math.min(STEPS.length - 1, current + 1)); }

  async function createProtocol() {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const validation = validateStep(index);
      if (validation) { setStep(index); setError(validation); return; }
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const fieldSchema = questions.map((question) => ({
        section: question.section || "Inspection",
        label: question.label.trim(),
        key: slug(question.label),
        type: question.type,
        required: Boolean(question.required),
        help_text: question.help_text.trim() || null,
        unit: question.type === "measurement" ? question.unit.trim() || null : null,
        options: question.type === "select" ? question.options_text.split("\n").map((value) => value.trim()).filter(Boolean) : [],
      }));
      const response = await fetch("/api/service-management/execution-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: form.name.trim(),
          code: slug(form.name),
          industry_key: "pest_control",
          description: form.description.trim() || null,
          instructions: form.instructions.trim() || null,
          field_schema: fieldSchema,
          evidence_requirements: {
            before_photos: form.before_photos,
            after_photos: form.after_photos,
            customer_signature: form.customer_signature,
            technician_signature: form.technician_signature,
            location_confirmation: form.location_confirmation,
          },
          completion_rules: { allow_follow_up: true, require_outcome: true },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment protocol could not be created.");
      setForm({ ...EMPTY_FORM }); setQuestions([{ ...EMPTY_QUESTION }]); setStep(0);
      setNotice(`${json.row?.name || "Treatment protocol"} v${json.row?.version || 1} is ready to use in Pest Control service plans.`);
      await load();
    } catch (saveError) { setError(saveError.message || "Treatment protocol could not be created."); }
    finally { setSaving(false); }
  }

  if (organizationLoading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing treatment protocols…</div>;

  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-9 lg:py-7"><div className="mx-auto max-w-[1580px]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5"><div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> Pest Control</Link><div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Treatment protocols</div><h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Define good field work once</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Supervisors define what technicians must check and prove. Avantiqo handles codes, keys, versions and execution structure behind the scenes.</p></div><div className="flex gap-2"><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-plans`} className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3.5 py-2.5 text-[9px] text-[#725434]">Service plans</Link><button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={loading ? "animate-spin" : ""} />Refresh</button></div></header>

    {error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]">{error}</div> : null}
    {notice ? <div className="mt-4 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] px-4 py-3 text-[10px] text-[#607057]">{notice}</div> : null}

    <section className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Active protocols</div><div className="mt-2 text-[24px] font-medium">{activeTemplates.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Versions</div><div className="mt-2 text-[24px] font-medium">{templates.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">New protocol questions</div><div className="mt-2 text-[24px] font-medium">{questions.length}</div></div></section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[620px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white"><div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Create protocol</div><h2 className="mt-1 text-[18px] font-medium">What must happen on site?</h2></div><div className="grid grid-cols-4 border-b border-black/[0.06] bg-[#FBFAF8]">{STEPS.map(([id, label], index) => <button key={id} type="button" onClick={() => index <= step && setStep(index)} className={`px-2 py-3 text-center ${index === step ? "bg-white" : ""}`}><span className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[8px] ${index < step ? "bg-[#748267] text-white" : index === step ? "bg-[#D6A66A] text-[#2C2925]" : "bg-[#ECE9E4] text-[#958F87]"}`}>{index < step ? <Check size={9} /> : index + 1}</span><span className="mt-1 block text-[7px] text-[#817A72]">{label}</span></button>)}</div>
        <div className="min-h-[470px] p-5">
          {step === 0 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><ShieldCheck size={13} />Protocol basics</div><Labeled label="Protocol name" hint="What supervisors and technicians call it"><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} className={inputClass} placeholder="Monthly preventive pest treatment" /></Labeled><Labeled label="When should this protocol be used?" hint="Optional"><textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} className={`${inputClass} min-h-20 resize-y`} placeholder="Routine preventive service for hotels, restaurants and commercial sites." /></Labeled><Labeled label="Instructions shown before work" hint="Optional"><textarea value={form.instructions} onChange={(event) => updateForm("instructions", event.target.value)} className={`${inputClass} min-h-28 resize-y`} placeholder="Walk the site with the contact, inspect agreed areas, record activity before applying treatment…" /></Labeled><div className="rounded-xl bg-[#FBFAF8] p-3 text-[9px] leading-4 text-[#756F68]">Avantiqo creates the technical protocol code and field keys automatically. Staff never need to manage them.</div></div> : null}

          {step === 1 ? <div><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[12px] font-medium"><ClipboardCheck size={13} />What must the technician record?</div><div className="mt-1 text-[8px] text-[#8A837A]">Ask only questions that change a decision, prove the service, or matter next visit.</div></div><button type="button" onClick={addQuestion} className="inline-flex items-center gap-1 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.06] px-3 py-2 text-[8px] font-medium text-[#725434]"><Plus size={9} />Add question</button></div><div className="mt-4 space-y-3">{questions.map((question, index) => <div key={index} className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4"><div className="flex items-center justify-between"><div className="text-[8px] uppercase tracking-[0.09em] text-[#958D84]">Question {index + 1}</div>{questions.length > 1 ? <button type="button" onClick={() => removeQuestion(index)} className="inline-flex items-center gap-1 text-[8px] text-[#98513D]"><Trash2 size={9} />Remove</button> : null}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Labeled label="What should they record?"><input value={question.label} onChange={(event) => updateQuestion(index, "label", event.target.value)} className={inputClass} placeholder="Pest activity observed" /></Labeled><Labeled label="Part of the visit"><select value={question.section} onChange={(event) => updateQuestion(index, "section", event.target.value)} className={inputClass}>{SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}</select></Labeled><Labeled label="How should they answer?"><select value={question.type} onChange={(event) => updateQuestion(index, "type", event.target.value)} className={inputClass}>{ANSWER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Labeled><Labeled label="Helpful instruction" hint="Optional"><input value={question.help_text} onChange={(event) => updateQuestion(index, "help_text", event.target.value)} className={inputClass} placeholder="Record exact room, zone or area." /></Labeled>{question.type === "select" ? <Labeled label="Choices" hint="One per line"><textarea value={question.options_text} onChange={(event) => updateQuestion(index, "options_text", event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder={"None\nLow\nMedium\nHigh"} /></Labeled> : null}{question.type === "measurement" ? <Labeled label="Measurement unit"><input value={question.unit} onChange={(event) => updateQuestion(index, "unit", event.target.value)} className={inputClass} placeholder="ml, g, ppm, °C…" /></Labeled> : null}</div><button type="button" onClick={() => updateQuestion(index, "required", !question.required)} className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[8px] ${question.required ? "border-[#748267]/20 bg-[#748267]/[0.05] text-[#607057]" : "border-black/[0.08] bg-white text-[#817A72]"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${question.required ? "border-[#748267] bg-[#748267] text-white" : "border-black/[0.15]"}`}>{question.required ? <Check size={8} /> : null}</span>{question.required ? "Required before completion" : "Optional answer"}</button></div>)}</div></div> : null}

          {step === 2 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><FileCheck2 size={13} />What proof should every visit include?</div><ProofToggle label="Before photos" description="Show conditions before treatment or corrective work begins." checked={form.before_photos} onChange={(value) => updateForm("before_photos", value)} /><ProofToggle label="After photos" description="Show the completed treatment area or corrected condition." checked={form.after_photos} onChange={(value) => updateForm("after_photos", value)} /><ProofToggle label="Customer signature" description="Ask the customer or site representative to acknowledge the service." checked={form.customer_signature} onChange={(value) => updateForm("customer_signature", value)} /><ProofToggle label="Technician signature" description="Technician confirms responsibility for the recorded service." checked={form.technician_signature} onChange={(value) => updateForm("technician_signature", value)} /><ProofToggle label="Location confirmation" description="Bind completion evidence to the customer site." checked={form.location_confirmation} onChange={(value) => updateForm("location_confirmation", value)} /></div> : null}

          {step === 3 ? <div className="space-y-4"><div className="text-[12px] font-medium">Review the technician experience</div><div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-4"><div className="text-[13px] font-medium">{form.name || "Unnamed protocol"}</div><div className="mt-1 text-[9px] leading-4 text-[#817A72]">{form.description || "No usage description added."}</div></div><div className="rounded-2xl border border-black/[0.07] p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#958D84]">Technician records</div><div className="mt-3 space-y-2">{questions.map((question, index) => <div key={index} className="flex items-start justify-between gap-4 rounded-xl bg-[#FBFAF8] px-3 py-3"><div><div className="text-[10px] font-medium">{question.label || `Question ${index + 1}`}</div><div className="mt-0.5 text-[8px] text-[#8A837A]">{question.section} · {typeLabel(question.type)}</div></div><span className={`text-[7px] uppercase ${question.required ? "text-[#9A744B]" : "text-[#9A938A]"}`}>{question.required ? "Required" : "Optional"}</span></div>)}</div></div><div className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-4 py-3"><span className="text-[9px] text-[#817A72]">Required proof types</span><span className="text-[11px] font-medium">{proofCount(form)}</span></div><div className="rounded-xl border border-black/[0.06] bg-white p-3 text-[8px] leading-4 text-[#817A72]">Creating this protocol creates a versioned Pest Control execution template. Existing scheduled visits keep their snapshotted protocol; new visits can use this version without silently changing past work.</div></div> : null}
        </div>
        <div className="flex items-center justify-between border-t border-black/[0.06] bg-[#FBFAF8] p-4"><button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[9px] disabled:opacity-30">Back</button>{step < STEPS.length - 1 ? <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] font-medium text-white">Continue <ChevronRight size={10} /></button> : <button type="button" disabled={saving} onClick={createProtocol} className="rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] font-medium text-white disabled:opacity-35">{saving ? "Creating…" : "Create protocol"}</button>}</div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white"><div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4"><div><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Protocol library</div><h2 className="mt-1 text-[16px] font-medium">Pest Control protocols</h2></div><span className="text-[10px] text-[#817A72]">{activeTemplates.length} active · {templates.length} versions</span></div><div className="divide-y divide-black/[0.05]">{templates.map((template) => { const requiredQuestions = Array.isArray(template.field_schema) ? template.field_schema.filter((field) => field.required).length : 0; const evidence = Object.values(template.evidence_requirements || {}).filter(Boolean).length; return <div key={template.id} className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.08em] ${template.status === "active" ? "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]" : "border-black/[0.08] bg-black/[0.025] text-[#817A72]"}`}>{template.status}</span><span className="text-[8px] text-[#99928A]">v{template.version || 1}</span></div><div className="mt-2 text-[13px] font-medium">{template.name}</div><div className="mt-1 text-[9px] leading-4 text-[#817A72]">{template.description || template.instructions || "No description recorded."}</div></div><ShieldCheck size={17} className="text-[#9A744B]" /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Questions</div><div className="mt-1 text-[11px] font-medium">{Array.isArray(template.field_schema) ? template.field_schema.length : 0}</div></div><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Required</div><div className="mt-1 text-[11px] font-medium">{requiredQuestions}</div></div><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Proof types</div><div className="mt-1 text-[11px] font-medium">{evidence}</div></div></div></div>; })}{!loading && templates.length === 0 ? <div className="p-12 text-center"><ShieldCheck className="mx-auto text-[#9A744B]" size={20} /><div className="mt-2 text-[11px] font-medium">No Pest Control protocol yet</div><div className="mt-1 text-[9px] text-[#817A72]">Create the first protocol on the left before creating customer service plans.</div></div> : null}</div></section>
    </div>
  </div></main>;
}