"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, LoaderCircle, Plus, RefreshCw, Save, Search, X } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const MODES = {
  requirements: {
    title: "Requirements",
    resource: "requirements",
    description: "Map the exact clauses and obligations within each configured framework.",
    columns: [["requirement_code","Code"],["title","Requirement"],["mandatory","Mandatory"],["effective_from","Effective"],["status","Status"]],
    fields: [
      ["framework_id","Framework ID","text",true],
      ["requirement_code","Requirement code","text",true],
      ["title","Title","text",true],
      ["description","Description","textarea"],
      ["parent_requirement_id","Parent requirement ID","text"],
      ["mandatory","Mandatory","select",true,["true","false"]],
      ["effective_from","Effective from","date"],
      ["effective_to","Effective to","date"],
      ["status","Status","select",true,["DRAFT","ACTIVE","SUPERSEDED","ARCHIVED"]],
    ],
  },
  tests: {
    title: "Control Tests",
    resource: "tests",
    description: "Test control design and operating effectiveness, capture exceptions, and preserve evidence.",
    columns: [["control_id","Control ID"],["test_type","Test"],["due_date","Due"],["result","Result"],["exceptions_found","Exceptions"]],
    fields: [
      ["control_id","Control ID","text",true],
      ["test_type","Test type","select",true,["DESIGN_EFFECTIVENESS","OPERATING_EFFECTIVENESS","DESIGN_AND_OPERATING_EFFECTIVENESS","CONTINUOUS_MONITORING"]],
      ["period_start","Period start","date"],
      ["period_end","Period end","date"],
      ["due_date","Due date","date"],
      ["performed_at","Performed at","datetime-local"],
      ["result","Result","select",true,["NOT_TESTED","PASS","PASS_WITH_EXCEPTIONS","FAIL","NOT_APPLICABLE"]],
      ["sample_size","Sample size","number"],
      ["exceptions_found","Exceptions found","number"],
      ["notes","Notes","textarea"],
    ],
  },
};

function pretty(value) { return String(value ?? "").replace(/[_-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }
function empty(definition) { return Object.fromEntries(definition.fields.map(([name,,type,,options]) => [name, type === "select" ? options?.[0] || "" : ""])); }

export default function ComplianceLinkedRecordsWorkspace({ organizationId, mode }) {
  const definition = MODES[mode] || MODES.requirements;
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [rows,setRows] = useState([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [open,setOpen] = useState(false);
  const [editingId,setEditingId] = useState(null);
  const [form,setForm] = useState(() => empty(definition));

  useEffect(() => { setForm(empty(definition)); setEditingId(null); setOpen(false); }, [mode]);

  async function load() {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ organizationId, resource: definition.resource });
      if (entityId) params.set("entityId",entityId);
      if (periodId) params.set("periodId",periodId);
      const response = await fetch(`/api/workspace/compliance/records?${params}`, { credentials:"include", cache:"no-store" });
      const json = await response.json().catch(()=>({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Load failed (${response.status})`);
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e) { setRows([]); setError(e?.message || "Compliance records could not load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [organizationId,entityId,periodId,definition.resource]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => Object.values(row || {}).some(value => String(value ?? "").toLowerCase().includes(needle)));
  },[rows,query]);

  function edit(row) {
    setEditingId(row.id);
    const next = {};
    for (const [name] of definition.fields) next[name] = row?.[name] ?? "";
    setForm(next); setOpen(true); setError("");
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const data = {};
      for (const [name,,type] of definition.fields) {
        let value = form[name];
        if (value === "") continue;
        if (type === "number") value = Number(value);
        if (name === "mandatory") value = value === true || value === "true";
        if (type === "datetime-local" && value) value = new Date(value).toISOString();
        data[name] = value;
      }
      const response = await fetch("/api/workspace/compliance/records", {
        method: editingId ? "PATCH" : "POST",
        credentials:"include",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({organizationId,entityId:entityId||null,periodId:periodId||null,resource:definition.resource,id:editingId||undefined,data}),
      });
      const json = await response.json().catch(()=>({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Save failed (${response.status})`);
      setOpen(false); setEditingId(null); await load();
    } catch (e) { setError(e?.message || "Save failed"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-[1750px] space-y-4 pb-10 text-[#1B1A18]">
    <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><Link href={`/workspace/${organizationId}/compliance`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8B6238]"><ArrowLeft size={11}/>Compliance</Link><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.035em]">{definition.title}</h1><p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#77726A]">{definition.description}</p></div>
        <div className="flex gap-2"><button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[11px]"><RefreshCw size={13} className={loading?"animate-spin":""}/>Refresh</button><button onClick={()=>{setEditingId(null);setForm(empty(definition));setOpen(true);}} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[11px] font-medium text-white"><Plus size={13}/>New</button></div>
      </div>
    </section>
    {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800"><AlertTriangle size={13} className="mr-2 inline"/>{error}</div>:null}
    <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] p-4"><div className="text-[11px] text-[#77726A]">{filtered.length} records</div><label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search" className="h-9 w-60 rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none"/></label></div>
      {loading ? <div className="flex min-h-56 items-center justify-center text-[12px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin"/>Loading…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#FAF9F7] text-[9px] uppercase tracking-[0.12em] text-[#817D76]"><tr>{definition.columns.map(([field,label])=><th key={field} className="px-4 py-3">{label}</th>)}<th className="w-20 px-4 py-3"/></tr></thead><tbody className="divide-y divide-black/[0.055] text-[11px]">{filtered.map(row=><tr key={row.id}>{definition.columns.map(([field])=><td key={field} className="px-4 py-3 text-[#514D46]">{typeof row[field]==="boolean"?(row[field]?"Yes":"No"):row[field]??"—"}</td>)}<td className="px-4 py-3 text-right"><button onClick={()=>edit(row)} className="rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[10px]">Edit</button></td></tr>)}{!filtered.length?<tr><td colSpan={definition.columns.length+1} className="px-4 py-12 text-center text-[11px] text-[#918B83]">No records yet.</td></tr>:null}</tbody></table></div>}
    </section>
    {open?<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-[2px] sm:items-center"><div className="max-h-[88vh] w-full max-w-[720px] overflow-y-auto rounded-[24px] border border-black/10 bg-[#F7F6F3]"><div className="sticky top-0 flex items-center justify-between border-b border-black/[0.07] bg-white px-5 py-4"><div className="text-[17px] font-semibold">{editingId?"Edit":"Create"} {definition.title}</div><button onClick={()=>setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08]"><X size={14}/></button></div><div className="grid gap-4 p-5 md:grid-cols-2">{definition.fields.map(([name,label,type,required,options])=><label key={name} className={type==="textarea"?"md:col-span-2":""}><span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-[#77726A]">{label}{required?" *":""}</span>{type==="select"?<select value={form[name]??""} onChange={e=>setForm(v=>({...v,[name]:e.target.value}))} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[11px]">{options.map(option=><option key={option} value={option}>{pretty(option)}</option>)}</select>:type==="textarea"?<textarea rows={4} value={form[name]??""} onChange={e=>setForm(v=>({...v,[name]:e.target.value}))} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-[11px]"/>:<input type={type} value={form[name]??""} onChange={e=>setForm(v=>({...v,[name]:e.target.value}))} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[11px]"/>}</label>)}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-black/[0.07] bg-white px-5 py-4"><button onClick={()=>setOpen(false)} className="h-9 rounded-lg border border-black/[0.09] px-3 text-[11px]">Cancel</button><button disabled={busy} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-4 text-[11px] font-medium text-white disabled:opacity-50">{busy?<LoaderCircle size={13} className="animate-spin"/>:<Save size={13}/>}Save</button></div></div></div>:null}
  </div>;
}
