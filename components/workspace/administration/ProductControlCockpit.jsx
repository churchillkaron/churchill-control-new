"use client";

import { useMemo, useState } from "react";
import { CONTROL_DIMENSIONS, CONTROL_STATE, completionScore } from "@/components/public/productControlCatalog";
import { PRODUCT_FAMILIES } from "@/components/public/productCatalog";

const stateClass = {
  PROVEN: "border-emerald-700/15 bg-emerald-50 text-emerald-800",
  PARTIAL: "border-[#B68A55]/20 bg-[#F8F1E7] text-[#76532D]",
  VERIFY: "border-amber-700/15 bg-amber-50 text-amber-800",
  NOT_STARTED: "border-black/[.08] bg-[#F4F2EE] text-[#858078]",
};

function Cell({ value }) {
  const [state, detail] = value || ["NOT_STARTED", "Not assessed"];
  return <div title={detail} className={`rounded-lg border px-2 py-1.5 text-center text-[8px] font-semibold ${stateClass[state] || stateClass.NOT_STARTED}`}>{CONTROL_STATE[state]?.label || state}</div>;
}

export default function ProductControlCockpit({ records }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("all");
  const [source, setSource] = useState("all");
  const [selectedId, setSelectedId] = useState("workforce");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (family !== "all" && record.family !== family) return false;
      if (source !== "all" && record.controlSource !== source) return false;
      if (!needle) return true;
      return [record.name, record.engine, record.buyers, ...(record.verticals || [])].join(" ").toLowerCase().includes(needle);
    });
  }, [records, query, family, source]);
  const selected = records.find((record) => record.id === selectedId) || filtered[0] || records[0];
  const verified = records.filter((record) => record.controlSource === "VERIFIED_SPEC").length;
  const avg = records.length ? Math.round(records.reduce((sum, record) => sum + completionScore(record), 0) / records.length) : 0;
  return <div className="mx-auto max-w-[1800px] space-y-5 pb-12 text-[#1B1A18]">
    <section className="rounded-[28px] border border-black/[.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,.055)] md:p-7">
      <div className="grid gap-7 xl:grid-cols-[1fr_auto] xl:items-end"><div><div className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#A37849]">Owner · Product Control</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-.045em]">Avantiqo Product Portfolio</h1><p className="mt-2 max-w-4xl text-[12px] leading-6 text-[#6F6B64]">One control plane for every sellable product: engine, UI, API, intelligence, billing, documentation, website, tests and production readiness. Baseline rows are intentionally marked for verification rather than presented as proven.</p></div><div className="grid grid-cols-3 gap-2"><Metric value={records.length} label="Products"/><Metric value={verified} label="Verified specs"/><Metric value={`${avg}%`} label="Baseline score"/></div></div>
    </section>
    <section className="rounded-[24px] border border-black/[.075] bg-white p-5"><div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search product, engine, buyer or industry" className="h-11 rounded-xl border border-black/[.09] bg-[#FCFBF9] px-4 text-[11px] outline-none focus:border-[#D6A66A]"/><select value={family} onChange={(e)=>setFamily(e.target.value)} className="h-11 rounded-xl border border-black/[.09] bg-[#FCFBF9] px-3 text-[11px]"><option value="all">All families</option>{PRODUCT_FAMILIES.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select><select value={source} onChange={(e)=>setSource(e.target.value)} className="h-11 rounded-xl border border-black/[.09] bg-[#FCFBF9] px-3 text-[11px]"><option value="all">All control states</option><option value="VERIFIED_SPEC">Verified specification</option><option value="BASELINE">Needs verification</option></select></div></section>
    <section className="overflow-hidden rounded-[24px] border border-black/[.075] bg-white"><div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-left"><thead className="bg-[#F5F2EC] text-[8px] uppercase tracking-[.12em] text-[#817B73]"><tr><th className="px-4 py-3">Product</th><th className="px-3 py-3">Control</th><th className="px-3 py-3">Score</th>{CONTROL_DIMENSIONS.map(([,label])=><th key={label} className="px-2 py-3 text-center">{label}</th>)}</tr></thead><tbody className="divide-y divide-black/[.055]">{filtered.map((record)=><tr key={record.id} onClick={()=>setSelectedId(record.id)} className={`cursor-pointer transition hover:bg-[#FCFAF6] ${selected?.id===record.id?"bg-[#FBF6EE]":""}`}><td className="px-4 py-3"><div className="text-[11px] font-semibold text-[#37342F]">{record.name}</div><div className="mt-0.5 text-[9px] text-[#918B83]">{record.engine}</div></td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[.08em] ${record.controlSource==="VERIFIED_SPEC"?"border-emerald-700/15 bg-emerald-50 text-emerald-800":"border-amber-700/15 bg-amber-50 text-amber-800"}`}>{record.controlSource==="VERIFIED_SPEC"?"Verified spec":"Verify"}</span></td><td className="px-3 py-3 text-[11px] font-semibold text-[#76532D]">{completionScore(record)}%</td>{CONTROL_DIMENSIONS.map(([key])=><td key={key} className="px-2 py-2"><Cell value={record.completion?.[key]}/></td>)}</tr>)}</tbody></table></div>{!filtered.length?<div className="p-10 text-center text-[11px] text-[#918B83]">No products match the current filters.</div>:null}</section>
    {selected ? <ProductDetail record={selected}/> : null}
  </div>;
}

function Metric({ value, label }) { return <div className="min-w-[110px] rounded-2xl border border-black/[.07] bg-[#FCFBF9] px-4 py-3"><div className="text-[22px] font-semibold tracking-[-.04em]">{value}</div><div className="mt-1 text-[7px] font-semibold uppercase tracking-[.12em] text-[#918B83]">{label}</div></div>; }

function ProductDetail({ record }) {
  const spec = record.specification;
  return <section className="rounded-[28px] border border-black/[.075] bg-white p-6 md:p-7"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">{record.controlSource === "VERIFIED_SPEC" ? "Verified product specification" : "Baseline control record"}</div><h2 className="mt-2 text-[28px] font-semibold tracking-[-.04em]">{record.name}</h2><p className="mt-2 max-w-4xl text-[11px] leading-6 text-[#6F6B64]">{record.controlNote}</p></div><div className="rounded-2xl border border-black/[.07] bg-[#F7F3EC] px-5 py-4"><div className="text-[28px] font-semibold tracking-[-.05em] text-[#76532D]">{completionScore(record)}%</div><div className="text-[7px] uppercase tracking-[.12em] text-[#918B83]">completion control score</div></div></div>
    <div className="mt-6 grid gap-3 md:grid-cols-3">{CONTROL_DIMENSIONS.map(([key,label])=>{const value=record.completion?.[key]||["NOT_STARTED","Not assessed"];return <div key={key} className="rounded-2xl border border-black/[.065] bg-[#FCFBF9] p-4"><div className="flex items-center justify-between gap-3"><div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#817B73]">{label}</div><Cell value={value}/></div><p className="mt-3 text-[10px] leading-5 text-[#777169]">{value[1]}</p></div>;})}</div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><ListBlock title="Missing before sellable completion" items={record.missing}/><ListBlock title="Next actions" items={record.nextActions}/></div>
    {spec ? <div className="mt-6 rounded-[24px] border border-[#D6A66A]/25 bg-[#FBF6EE] p-5"><div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Workforce completion contract</div><p className="mt-3 max-w-5xl text-[12px] leading-6 text-[#5F5952]">{spec.northStar}</p><div className="mt-5 grid gap-5 lg:grid-cols-2"><ListBlock title="Customer jobs" items={spec.jobs}/><ListBlock title="Release acceptance" items={spec.acceptance}/></div><div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-5">{spec.capabilities.map(([name,detail])=><div key={name} className="rounded-xl border border-[#D6A66A]/20 bg-white/70 p-3"><div className="text-[9px] font-semibold text-[#76532D]">{name}</div><div className="mt-1 text-[9px] leading-4 text-[#817B73]">{detail}</div></div>)}</div></div> : null}
  </section>;
}

function ListBlock({ title, items = [] }) {
  return <div className="rounded-2xl border border-black/[.065] bg-[#FCFBF9] p-4"><div className="text-[9px] font-semibold uppercase tracking-[.13em] text-[#817B73]">{title}</div><div className="mt-3 space-y-2">{items.map((item,index)=><div key={`${item}-${index}`} className="grid grid-cols-[22px_1fr] gap-2 text-[10px] leading-5 text-[#625D55]"><span className="text-[#A37849]">{String(index+1).padStart(2,"0")}</span><span>{item}</span></div>)}</div></div>;
}
