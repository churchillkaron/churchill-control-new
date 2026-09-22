"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export default function AccountingClientInvitePage(){
  const params=useParams();
  const token=String(params?.token||"");
  const [data,setData]=useState(null);
  const [selected,setSelected]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch(`/api/accounting-firm/client-invitations/${encodeURIComponent(token)}`,{cache:"no-store"});
      const d=await r.json();if(!r.ok||!d?.success)throw new Error(d?.error||"Invitation unavailable");setData(d);if((d.eligibleOrganizations||[]).length===1)setSelected(d.eligibleOrganizations[0].id);
    }catch(e){setError(e?.message||"Invitation unavailable");}finally{setLoading(false);}
  },[token]);
  useEffect(()=>{load();},[load]);

  async function accept(){
    if(!selected)return;setBusy(true);setError("");
    try{const r=await fetch(`/api/accounting-firm/client-invitations/${encodeURIComponent(token)}/accept`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientOrganizationId:selected})});const d=await r.json();if(!r.ok||!d?.success)throw new Error(d?.error||"Unable to accept client relationship");setDone(true);await load();}catch(e){setError(e?.message||"Unable to accept client relationship");}finally{setBusy(false);}
  }

  const invite=data?.invitation;
  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]"><PublicSiteHeader context="Accounting client invitation" audience="business" tone="light"/><section className="mx-auto max-w-[980px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">ACCOUNTING FIRM CLIENT ACCESS</p><h1 className="mt-4 text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">You decide which organization the accounting firm may serve.</h1><p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6B645C]">Acceptance creates a governed firm↔client relationship. It does not transfer ownership of your organization or silently grant unrestricted access.</p>{loading?<div className="mt-8 text-[10px] text-[#746D65]">Loading invitation…</div>:null}{error?<div className="mt-6 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}{invite?<div className="mt-8 grid gap-4 lg:grid-cols-[.86fr_1.14fr]"><div className="rounded-[24px] border border-black/[.07] bg-white p-6"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">INVITATION</div><div className="mt-5 text-[17px] font-semibold">{invite.firmName}</div><div className="mt-2 text-[10px] text-[#746D65]">Invited email: {invite.email}</div><div className="mt-2 text-[10px] text-[#746D65]">Billing model: {invite.billingModel}</div><div className="mt-4 text-[8px] text-[#8B8177]">Status: {invite.status} · Expires {new Date(invite.expiresAt).toLocaleString()}</div></div><div className="rounded-[24px] border border-[#B98A52]/22 bg-[#F3E7D7]/58 p-6"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">CLIENT AUTHORITY</div>{done?<div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 p-4 text-[10px] leading-5 text-emerald-900">Client relationship accepted. The accounting firm can now operate only through the governed accounting-firm/client boundary.</div>:!data.authenticated?<><p className="mt-4 text-[11px] leading-6 text-[#6D6257]">Sign in with the invited email. Avantiqo will then show only organizations where that identity has owner/admin authority.</p><a href={`/login?portal=business&next=${encodeURIComponent(`/accounting-client-invite/${token}`)}`} className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#211C17] px-4 text-[9px] font-semibold text-white">Sign in to review →</a></>:!data.emailMatches?<div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[10px] leading-5 text-red-800">You are signed in with a different email. Use the address that received this invitation.</div>:<><p className="mt-4 text-[11px] leading-6 text-[#6D6257]">Choose the client organization you are authorized to connect.</p><select value={selected} onChange={e=>setSelected(e.target.value)} className="mt-5 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3 text-[10px]"><option value="">Select your organization</option>{(data.eligibleOrganizations||[]).map(org=><option key={org.id} value={org.id}>{org.name||org.legal_name}</option>)}</select>{!(data.eligibleOrganizations||[]).length?<div className="mt-3 text-[9px] leading-5 text-[#7A6D60]">No eligible client organization is available for this identity. If the company is not on Avantiqo yet, create the business organization first.</div>:null}<button type="button" disabled={busy||!selected||invite.status!=="PENDING"} onClick={accept} className="mt-4 h-11 rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white disabled:opacity-40">{busy?"Connecting…":"Accept firm relationship →"}</button></>}</div></div>:null}</section></main>;
}
