"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export default function ManagedClientClaimPage(){
  const params=useParams();
  const token=String(params?.token||"");
  const [data,setData]=useState(null);
  const [industries,setIndustries]=useState([]);
  const [industry,setIndustry]=useState("");
  const [ownerName,setOwnerName]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch(`/api/accounting-firm/managed-client-claims/${encodeURIComponent(token)}`,{cache:"no-store"});
      const d=await r.json();if(!r.ok||!d?.success)throw new Error(d?.error||"Claim invitation unavailable");
      setData(d);
      if(d.authenticated&&d.emailMatches&&(d.claim?.status==="CLAIM_PENDING"||d.claim?.retryable)){
        const i=await fetch("/api/onboarding/industries",{cache:"no-store"});
        const j=await i.json();
        if(i.ok&&j?.success)setIndustries((j.industries||[]).filter(x=>x.value!=="accounting_firm"));
      }
    }catch(e){setError(e?.message||"Claim invitation unavailable");}
    finally{setLoading(false);}
  },[token]);
  useEffect(()=>{load();},[load]);

  async function claim(){
    if(!industry||!ownerName.trim())return;
    setBusy(true);setError("");
    try{
      const r=await fetch(`/api/accounting-firm/managed-client-claims/${encodeURIComponent(token)}`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({industry,ownerName:ownerName.trim()}),
      });
      const d=await r.json();
      if(!r.ok||!d?.success)throw new Error(d?.error||"Unable to claim company");
      window.location.href=d.redirect;
    }catch(e){setError(e?.message||"Unable to claim company");}
    finally{setBusy(false);}
  }

  const claimData=data?.claim;
  const clientName=claimData?.client?.legal_name||claimData?.client?.name||"your company";
  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader context="Managed client claim" audience="business" tone="light"/>
    <section className="mx-auto max-w-[980px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
      <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">ACCOUNTING CLIENT ACTIVATION</p>
      <h1 className="mt-4 text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Claim your existing company. Keep the books exactly where they are.</h1>
      <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6B645C]">Your accountant has already created the accounting organization for {clientName}. Activating Avantiqo adds your owner access and governed business workspace to that same organization. It does not create a duplicate company or move the accounting history.</p>
      {loading?<div className="mt-8 text-[10px] text-[#746D65]">Loading claim invitation…</div>:null}
      {error?<div className="mt-6 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}
      {claimData?<div className="mt-8 grid gap-4 lg:grid-cols-[.86fr_1.14fr]">
        <div className="rounded-[24px] border border-black/[.07] bg-white p-6">
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">EXISTING MANAGED COMPANY</div>
          <div className="mt-5 text-[17px] font-semibold">{clientName}</div>
          <div className="mt-2 text-[10px] text-[#746D65]">Managed by {claimData.firmName}</div>
          <div className="mt-2 text-[10px] text-[#746D65]">Invited email: {claimData.email}</div>
          <div className="mt-4 text-[8px] text-[#8B8177]">Status: {claimData.status}{claimData.expiresAt ? " · Expires " + new Date(claimData.expiresAt).toLocaleString() : ""}</div>
        </div>
        <div className="rounded-[24px] border border-[#B98A52]/22 bg-[#F3E7D7]/58 p-6">
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">ACTIVATE OWNER ACCESS</div>
          {!data.authenticated ? <>
            <p className="mt-4 text-[11px] leading-6 text-[#6D6257]">Sign in with the email that received this claim invitation.</p>
            <a href={"/login?portal=business&next=" + encodeURIComponent("/accounting-managed-client-claim/" + token)} className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#211C17] px-4 text-[9px] font-semibold text-white">Sign in to claim →</a>
          </> : !data.emailMatches ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[10px] leading-5 text-red-800">You are signed in with a different email. Use the address that received this claim invitation.</div> : claimData.status !== "CLAIM_PENDING" && !claimData.retryable ? <div className="mt-4 rounded-xl border border-black/[.08] bg-white p-4 text-[10px] leading-5 text-[#6D6257]">This claim invitation is {String(claimData.status || "unavailable").toLowerCase()}.</div> : <>{claimData.retryable?<div className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[10px] leading-5 text-amber-900">The previous activation attempt did not finish. You can safely retry; Avantiqo will recover the stale reservation before continuing.</div>:null}
            <label className="mt-4 block text-[8px] font-semibold uppercase tracking-[.12em] text-[#7A6D60]">Owner name<input value={ownerName} onChange={e=>setOwnerName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3 text-[10px]" placeholder="Full name"/></label>
            <label className="mt-4 block text-[8px] font-semibold uppercase tracking-[.12em] text-[#7A6D60]">Business type<select value={industry} onChange={e=>setIndustry(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3 text-[10px]"><option value="">Select business type</option>{industries.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <button type="button" disabled={busy||!industry||!ownerName.trim()} onClick={claim} className="mt-5 h-11 rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white disabled:opacity-40">{busy ? "Activating…" : "Claim company and activate Avantiqo →"}</button>
          </>}
        </div>
      </div> : null}
    </section>
  </main>;
}
