"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function ComplianceAuditWorkspace({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [rows,setRows] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const url = new URL("/api/workspace/compliance/command-center", window.location.origin);
      url.searchParams.set("organizationId",organizationId);
      if (entityId) url.searchParams.set("entityId",entityId);
      if (periodId) url.searchParams.set("periodId",periodId);
      const response = await fetch(url.toString(),{credentials:"include",cache:"no-store"});
      const json = await response.json().catch(()=>({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Audit failed (${response.status})`);
      setRows(Array.isArray(json.recentAudit)?json.recentAudit:[]);
    } catch(e) { setRows([]); setError(e?.message || "Audit evidence could not load"); }
    finally { setLoading(false); }
  }

  useEffect(()=>{load();},[organizationId,entityId,periodId]);

  return <div className="mx-auto max-w-[1750px] space-y-4 pb-10 text-[#1B1A18]">
    <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 md:p-6"><div className="flex items-end justify-between gap-4"><div><Link href={`/workspace/${organizationId}/compliance`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8B6238]"><ArrowLeft size={11}/>Compliance</Link><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.035em]">Audit Trail</h1><p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#77726A]">Recent organization audit evidence. Compliance-specific controls, tests, issues and remediation keep their own lifecycle evidence alongside this cross-domain audit trail.</p></div><button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[11px]"><RefreshCw size={13} className={loading?"animate-spin":""}/>Refresh</button></div></section>
    {error?<div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800">{error}</div>:null}
    <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">{loading?<div className="flex min-h-56 items-center justify-center text-[12px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin"/>Loading…</div>:<div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead className="bg-[#FAF9F7] text-[9px] uppercase tracking-[0.12em] text-[#817D76]"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Object</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Actor</th></tr></thead><tbody className="divide-y divide-black/[0.055] text-[11px]">{rows.map(row=><tr key={row.id}><td className="px-4 py-3 text-[#6F6A63]">{row.created_at || "—"}</td><td className="px-4 py-3"><div className="font-medium text-[#3D3933]">{row.entity_type || "Record"}</div><div className="mt-0.5 font-mono text-[9px] text-[#9A948C]">{row.entity_id || "—"}</div></td><td className="px-4 py-3 text-[#514D46]">{row.action || "—"}</td><td className="px-4 py-3 text-[#6F6A63]">{row.actor_email || "System"}</td></tr>)}{!rows.length?<tr><td colSpan={4} className="px-4 py-12 text-center text-[11px] text-[#918B83]">No audit rows in the current result window.</td></tr>:null}</tbody></table></div>}</section>
  </div>;
}
