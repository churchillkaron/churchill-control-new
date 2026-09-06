"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Check, ChevronRight, ClipboardCheck, FileCheck2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const STEPS = ["Basics", "Technician questions", "Proof & eligibility", "Review"];
const TYPES = [["text","Short answer"],["textarea","Detailed note"],["select","Choose from a list"],["checkbox","Yes / no"],["number","Number"],["measurement","Measurement"],["date","Date"],["datetime","Date & time"]];
const SECTIONS = ["Inspection","Pest activity","Treatment","Safety","Customer","Completion"];
const EMPTY_FORM = { name:"", description:"", instructions:"", before_photos:true, after_photos:true, customer_signature:false, technician_signature:true, location_confirmation:true, required_qualification_codes:[] };
const EMPTY_QUESTION = { label:"", section:"Inspection", type:"text", required:true, help_text:"", unit:"", options_text:"" };
const inputClass = "mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-3 text-[11px] text-[#2B2926] outline-none transition focus:border-[#D6A66A]/60";

function slug(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function Label({ title, hint, children }) { return <label className="block"><span className="text-[9px] font-medium text-[#4E4943]">{title}</span>{hint ? <span className="ml-2 text-[8px] text-[#99928A]">{hint}</span> : null}{children}</label>; }
function Toggle({ title, detail, checked, onClick }) { return <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left ${checked ? "border-[#D6A66A]/35 bg-[#D6A66A]/[0.055]" : "border-black/[0.07] bg-[#FBFAF8]"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-[#D6A66A] bg-[#D6A66A]" : "border-black/[0.15] bg-white"}`}>{checked ? <Check size={11}/> : null}</span><span><span className="block text-[10px] font-medium">{title}</span><span className="mt-0.5 block text-[8px] leading-4 text-[#8A837A]">{detail}</span></span></button>; }

export default function ServiceExecutionTemplatesPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [templates,setTemplates] = useState([]);
  const [qualifications,setQualifications] = useState([]);
  const [form,setForm] = useState({ ...EMPTY_FORM });
  const [questions,setQuestions] = useState([{ ...EMPTY_QUESTION }]);
  const [step,setStep] = useState(0);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const [templateResponse, qualificationResponse] = await Promise.all([
        fetch(`/api/service-management/execution-templates?organizationId=${encodeURIComponent(organizationId)}&industry_key=pest_control&status=all&limit=500`, { cache:"no-store" }),
        fetch(`/api/people/workforce/qualifications?organizationId=${encodeURIComponent(organizationId)}&scope=catalog`, { cache:"no-store" }),
      ]);
      const [templateJson, qualificationJson] = await Promise.all([templateResponse.json().catch(()=>({})), qualificationResponse.json().catch(()=>({}))]);
      if (!templateResponse.ok || !templateJson.success) throw new Error(templateJson.error || "Treatment protocols could not be loaded.");
      if (!qualificationResponse.ok || !qualificationJson.success) throw new Error(qualificationJson.error || "People qualifications could not be loaded.");
      setTemplates(templateJson.rows || []);
      setQualifications(qualificationJson.catalog || []);
    } catch (loadError) { setError(loadError.message || "Treatment protocols could not be loaded."); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(()=>{ load(); },[load]);
  const activeTemplates = useMemo(()=>templates.filter((row)=>row.status === "active"),[templates]);
  const qualName = useMemo(()=>Object.fromEntries(qualifications.map((row)=>[row.code,row.name])),[qualifications]);
  const update = (name,value) => { setForm((current)=>({ ...current,[name]:value })); setError(""); };
  const updateQuestion = (index,name,value) => { setQuestions((current)=>current.map((row,rowIndex)=>rowIndex === index ? { ...row,[name]:value } : row)); setError(""); };
  const toggleQualification = (code) => setForm((current)=>({ ...current, required_qualification_codes:current.required_qualification_codes.includes(code) ? current.required_qualification_codes.filter((value)=>value !== code) : [...current.required_qualification_codes,code] }));

  function validate(index) {
    if (index === 0 && !form.name.trim()) return "Give this protocol a clear name.";
    if (index === 1) {
      if (!questions.length) return "Add at least one technician question.";
      if (questions.some((q)=>!q.label.trim() || (q.type === "measurement" && !q.unit.trim()) || (q.type === "select" && !q.options_text.split("\n").some((v)=>v.trim())))) return "Finish every technician question, including choices or units where required.";
      const keys = questions.map((q)=>slug(q.label));
      if (new Set(keys).size !== keys.length) return "Technician questions must have unique names.";
    }
    return "";
  }
  function next() { const problem = validate(step); if (problem) { setError(problem); return; } setStep((current)=>Math.min(3,current+1)); }

  async function createProtocol() {
    for (let index=0; index<3; index+=1) { const problem = validate(index); if (problem) { setStep(index); setError(problem); return; } }
    setSaving(true); setError(""); setNotice("");
    try {
      const field_schema = questions.map((q)=>({ section:q.section, label:q.label.trim(), key:slug(q.label), type:q.type, required:Boolean(q.required), help_text:q.help_text.trim() || null, unit:q.type === "measurement" ? q.unit.trim() : null, options:q.type === "select" ? q.options_text.split("\n").map((v)=>v.trim()).filter(Boolean) : [] }));
      const response = await fetch("/api/service-management/execution-templates", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ organizationId, name:form.name.trim(), code:slug(form.name), industry_key:"pest_control", description:form.description.trim() || null, instructions:form.instructions.trim() || null, field_schema, required_qualification_codes:form.required_qualification_codes, evidence_requirements:{ before_photos:form.before_photos, after_photos:form.after_photos, customer_signature:form.customer_signature, technician_signature:form.technician_signature, location_confirmation:form.location_confirmation }, completion_rules:{ allow_follow_up:true, require_outcome:true } }) });
      const json = await response.json().catch(()=>({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment protocol could not be created.");
      setForm({ ...EMPTY_FORM }); setQuestions([{ ...EMPTY_QUESTION }]); setStep(0);
      setNotice(`${json.row?.name || "Treatment protocol"} v${json.row?.version || 1} is active and ready for service plans.`);
      await load();
    } catch (saveError) { setError(saveError.message || "Treatment protocol could not be created."); }
    finally { setSaving(false); }
  }

  if (organizationLoading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing treatment protocols…</div>;

  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-9 lg:py-7"><div className="mx-auto max-w-[1580px]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5"><div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10}/> Pest Control</Link><div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Treatment protocols</div><h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Define good field work once</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Define what technicians inspect, record and prove—and which People qualifications are required to perform it.</p></div><div className="flex flex-wrap gap-2"><Link href={`/workspace/${encodeURIComponent(organizationId)}/people/qualifications`} className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]">People qualifications</Link><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-plans`} className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3.5 py-2.5 text-[9px] text-[#725434]">Service plans</Link><button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={loading ? "animate-spin" : ""}/>Refresh</button></div></header>
    {error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]">{error}</div> : null}{notice ? <div className="mt-4 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] px-4 py-3 text-[10px] text-[#607057]">{notice}</div> : null}
    <section className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Active protocols</div><div className="mt-2 text-[24px] font-medium">{activeTemplates.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">People qualifications</div><div className="mt-2 text-[24px] font-medium">{qualifications.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">New protocol questions</div><div className="mt-2 text-[24px] font-medium">{questions.length}</div></div></section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[650px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white"><div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Create protocol</div><h2 className="mt-1 text-[18px] font-medium">What must happen on site?</h2></div><div className="grid grid-cols-4 border-b border-black/[0.06] bg-[#FBFAF8]">{STEPS.map((label,index)=><button key={label} onClick={()=>index <= step && setStep(index)} className={`px-2 py-3 ${index === step ? "bg-white" : ""}`}><span className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[8px] ${index < step ? "bg-[#748267] text-white" : index === step ? "bg-[#D6A66A]" : "bg-[#ECE9E4] text-[#958F87]"}`}>{index < step ? <Check size={9}/> : index+1}</span><span className="mt-1 block text-[7px] text-[#817A72]">{label}</span></button>)}</div>
        <div className="min-h-[490px] p-5">
          {step === 0 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><ShieldCheck size={13}/>Protocol basics</div><Label title="Protocol name"><input value={form.name} onChange={(e)=>update("name",e.target.value)} className={inputClass} placeholder="Monthly preventive pest treatment"/></Label><Label title="When should this be used?" hint="Optional"><textarea value={form.description} onChange={(e)=>update("description",e.target.value)} className={`${inputClass} min-h-20 resize-y`}/></Label><Label title="Instructions before work" hint="Optional"><textarea value={form.instructions} onChange={(e)=>update("instructions",e.target.value)} className={`${inputClass} min-h-28 resize-y`}/></Label><div className="rounded-xl bg-[#FBFAF8] p-3 text-[9px] leading-4 text-[#756F68]">Avantiqo manages codes, field keys and versioning automatically.</div></div> : null}
          {step === 1 ? <div><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[12px] font-medium"><ClipboardCheck size={13}/>Technician questions</div><button onClick={()=>setQuestions((current)=>[...current,{ ...EMPTY_QUESTION }])} className="inline-flex items-center gap-1 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.06] px-3 py-2 text-[8px]"><Plus size={9}/>Add question</button></div><div className="mt-4 space-y-3">{questions.map((q,index)=><div key={index} className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4"><div className="flex justify-between"><span className="text-[8px] uppercase tracking-[0.09em] text-[#958D84]">Question {index+1}</span>{questions.length > 1 ? <button onClick={()=>setQuestions((current)=>current.filter((_,i)=>i !== index))} className="text-[#8A5B4B]"><Trash2 size={10}/></button> : null}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Label title="Question"><input value={q.label} onChange={(e)=>updateQuestion(index,"label",e.target.value)} className={inputClass}/></Label><Label title="Section"><select value={q.section} onChange={(e)=>updateQuestion(index,"section",e.target.value)} className={inputClass}>{SECTIONS.map((v)=><option key={v}>{v}</option>)}</select></Label><Label title="Answer type"><select value={q.type} onChange={(e)=>updateQuestion(index,"type",e.target.value)} className={inputClass}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Label><label className="flex items-end gap-2 pb-3 text-[9px]"><input type="checkbox" checked={q.required} onChange={(e)=>updateQuestion(index,"required",e.target.checked)}/>Required before completion</label>{q.type === "measurement" ? <Label title="Unit"><input value={q.unit} onChange={(e)=>updateQuestion(index,"unit",e.target.value)} className={inputClass}/></Label> : null}{q.type === "select" ? <div className="sm:col-span-2"><Label title="Choices" hint="One per line"><textarea value={q.options_text} onChange={(e)=>updateQuestion(index,"options_text",e.target.value)} className={`${inputClass} min-h-20`}/></Label></div> : null}<div className="sm:col-span-2"><Label title="Help text" hint="Optional"><input value={q.help_text} onChange={(e)=>updateQuestion(index,"help_text",e.target.value)} className={inputClass}/></Label></div></div></div>)}</div></div> : null}
          {step === 2 ? <div className="space-y-5"><div className="flex items-center gap-2 text-[12px] font-medium"><FileCheck2 size={13}/>Required completion proof</div><div className="grid gap-2 sm:grid-cols-2">{[["before_photos","Before photos","Show condition before treatment"],["after_photos","After photos","Show treatment or final condition"],["technician_signature","Technician signature","Technician signs the completed record"],["customer_signature","Customer signature","Customer acknowledgement when required"],["location_confirmation","Location confirmation","Prove execution at the governed site"]].map(([key,title,detail])=><Toggle key={key} title={title} detail={detail} checked={form[key]} onClick={()=>update(key,!form[key])}/>)}</div><div className="border-t border-black/[0.06] pt-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[12px] font-medium"><BadgeCheck size={13}/>Required People qualifications</div><div className="mt-1 text-[8px] leading-4 text-[#8A837A]">Only use genuine legal or operational eligibility requirements. People owns the credential evidence.</div></div><Link href={`/workspace/${encodeURIComponent(organizationId)}/people/qualifications`} className="shrink-0 rounded-lg border border-black/[0.08] px-3 py-2 text-[8px]">Manage in People</Link></div>{qualifications.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{qualifications.map((q)=><Toggle key={q.id} title={q.name} detail={q.description || q.code} checked={form.required_qualification_codes.includes(q.code)} onClick={()=>toggleQualification(q.code)}/>)}</div> : <div className="mt-3 rounded-xl border border-dashed border-black/[0.1] p-4 text-[9px] text-[#756F68]">No People qualifications are defined. Unrestricted services can continue; regulated work should define the qualification first.</div>}</div></div> : null}
          {step === 3 ? <div className="space-y-4"><div className="text-[12px] font-medium">Review before activation</div><div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4"><div className="text-[16px] font-medium">{form.name || "Unnamed protocol"}</div><div className="mt-3 grid grid-cols-3 gap-3 text-[9px]"><div><span className="text-[#9A938A]">Questions</span><div className="mt-1 text-[14px] font-medium">{questions.length}</div></div><div><span className="text-[#9A938A]">Proof controls</span><div className="mt-1 text-[14px] font-medium">{[form.before_photos,form.after_photos,form.customer_signature,form.technician_signature,form.location_confirmation].filter(Boolean).length}</div></div><div><span className="text-[#9A938A]">Qualifications</span><div className="mt-1 text-[14px] font-medium">{form.required_qualification_codes.length}</div></div></div></div>{form.required_qualification_codes.length ? <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A744B]">Eligibility</div><div className="mt-2 flex flex-wrap gap-2">{form.required_qualification_codes.map((code)=><span key={code} className="rounded-full border border-[#D6A66A]/25 bg-white px-2.5 py-1 text-[8px] text-[#725434]">{qualName[code] || code}</span>)}</div></div> : null}</div> : null}
        </div><div className="flex justify-between border-t border-black/[0.06] bg-[#FBFAF8] p-4"><button disabled={step === 0 || saving} onClick={()=>setStep((current)=>Math.max(0,current-1))} className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[9px] disabled:opacity-30">Back</button>{step < 3 ? <button onClick={next} className="inline-flex items-center gap-1 rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] text-white">Continue <ChevronRight size={10}/></button> : <button disabled={saving} onClick={createProtocol} className="rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] text-white disabled:opacity-40">{saving ? "Activating…" : "Activate protocol"}</button>}</div></section>
      <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white"><div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Protocol library</div><h2 className="mt-1 text-[18px] font-medium">Active field standards</h2></div><div className="divide-y divide-black/[0.06]">{templates.map((template)=>{ const required = Array.isArray(template.required_qualification_codes) ? template.required_qualification_codes : []; return <div key={template.id} className="p-5"><div className="flex justify-between gap-3"><div><div className="text-[12px] font-medium">{template.name}</div><div className="mt-1 text-[8px] text-[#99928A]">v{template.version || 1} · {(template.field_schema || []).length} questions</div></div><span className="h-fit rounded-full border border-[#748267]/20 bg-[#748267]/[0.06] px-2 py-1 text-[7px] uppercase text-[#607057]">{template.status}</span></div>{template.description ? <div className="mt-2 text-[9px] leading-4 text-[#756F68]">{template.description}</div> : null}<div className="mt-3 flex flex-wrap gap-1.5">{required.length ? required.map((code)=><span key={code} className="rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] px-2 py-1 text-[7px] text-[#76583A]">{qualName[code] || code}</span>) : <span className="rounded-full border border-black/[0.07] bg-[#FBFAF8] px-2 py-1 text-[7px] text-[#8A837A]">No special qualification required</span>}</div></div>;})}{!loading && !templates.length ? <div className="p-10 text-center text-[10px] text-[#8C857D]">No Pest Control protocols yet.</div> : null}</div></section>
    </div>
  </div></main>;
}
