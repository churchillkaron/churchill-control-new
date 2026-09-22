"use client";
import { useEffect, useState } from "react";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export default function DeveloperAccessPage(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [authRequired,setAuthRequired]=useState(false);

  useEffect(()=>{
    fetch("/api/developers/access/organizations",{cache:"no-store"})
      .then(async response=>{
        const data=await response.json();
        if(response.status===401){setAuthRequired(true);return;}
        if(!response.ok||!data?.success)throw new Error(data?.error||"Unable to load developer access");
        setRows(data.organizations||[]);
      })
      .catch(loadError=>setError(loadError?.message||"Unable to load developer access"))
      .finally(()=>setLoading(false));
  },[]);

  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader context="Developer Access" audience="developers" tone="light" action={{label:"Developer Login",href:"/login?portal=developer"}}/>
    <section className="mx-auto max-w-[1120px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
      <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">DEVELOPER ORGANIZATIONS</p>
      <h1 className="mt-4 max-w-4xl text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Choose the organization you are allowed to build against.</h1>
      <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6B645C]">Each organization is a separate authority boundary. External Developer Portal access is invitation-based and never grants the normal business workspace or an employee relationship.</p>
      {loading?<div className="mt-8 text-[10px] text-[#746D65]">Checking developer access…</div>:null}
      {authRequired?<div className="mt-10 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-[26px] border border-black/[.07] bg-white p-6 sm:p-7"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">HOW EXTERNAL ACCESS WORKS</div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["01","Organization invites","An owner/admin grants Developer Portal access to a specific developer email."],["02","Developer verifies","The developer signs in or creates an account with that exact invited email."],["03","Authority stays scoped","The developer receives only the organization, role and Operations permissions explicitly granted."]].map(([n,title,copy])=><div key={n} className="rounded-[18px] border border-black/[.06] bg-[#FBFAF8] p-4"><div className="text-[8px] font-semibold text-[#B7793B]">{n}</div><div className="mt-4 text-[11px] font-semibold">{title}</div><div className="mt-2 text-[8px] leading-4 text-[#756E66]">{copy}</div></div>)}</div></div>
        <div className="rounded-[26px] border border-[#B98A52]/22 bg-[#F3E7D7]/58 p-6 sm:p-7"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">ALREADY HAVE ACCESS?</div><h2 className="mt-4 text-[28px] font-medium leading-[1.04] tracking-[-.04em]">Sign in with the developer identity that was granted access.</h2><p className="mt-4 text-[10px] leading-5 text-[#6D6257]">If you have a fresh invitation, open the invitation link first. If access is already active, Developer Login resolves the organizations available to your developer identity.</p><a href="/login?portal=developer" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white">Developer Login →</a><div className="mt-4 text-[8px] leading-4 text-[#81776D]">No access yet? Ask the organization owner/admin to invite you from Developer Portal → Access.</div></div>
      </div>:null}
      {error?<div className="mt-6 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}
      {!authRequired&&!loading&&!error?<><div className="mt-10 grid gap-4 md:grid-cols-2">{rows.map(row=><a key={row.id} href={`/workspace/${row.organization_id}/developers`} className="rounded-[24px] border border-black/[.07] bg-white p-6 shadow-[0_12px_36px_rgba(48,35,22,.035)] transition hover:-translate-y-1 hover:border-[#B98A52]/45"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">{row.role}</div><h2 className="mt-3 text-[20px] font-semibold">{row.organization?.name||row.organization?.legal_name}</h2><div className="mt-3 text-[9px] leading-5 text-[#746D65]">{(row.permissions||[]).join(" · ")}</div><div className="mt-5 text-[9px] font-semibold text-[#815B36]">Open Developer Portal →</div></a>)}</div>{!rows.length?<div className="mt-8 rounded-[22px] border border-black/[.07] bg-white p-6 text-[11px] text-[#746D65]">No active external Developer Portal access is linked to this identity. Open the organization invitation link first, or ask its owner/admin to grant access.</div>:null}</>:null}
    </section>
  </main>;
}
