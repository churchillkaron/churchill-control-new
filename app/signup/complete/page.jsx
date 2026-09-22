"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function SignupCompletePage(){
  const [error,setError]=useState("");
  useEffect(()=>{ let active=true; (async()=>{ try {
    const rawIntent=new URLSearchParams(window.location.search).get("intent");
    const intent=rawIntent==="accounting_firm"?"accounting_firm":rawIntent==="supplier"?"supplier":"business";
    const {data}=await supabase.auth.getSession();
    if(!data?.session) throw new Error("Email confirmation session was not found. Please sign in and continue.");
    if(intent==="supplier"){
      window.location.href="/supplier-portal";
      return;
    }
    const response=await fetch("/api/onboarding/self-service-owner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intent})});
    const result=await response.json();
    if(!response.ok||!result?.success) throw new Error(result?.error||"Unable to prepare onboarding");
    window.location.href=`/onboarding?intent=${encodeURIComponent(result.intent||intent)}`;
  } catch(e){ if(active)setError(e?.message||"Unable to continue onboarding"); } })(); return()=>{active=false}; },[]);
  return <main className="flex min-h-screen items-center justify-center bg-[#F7F3EC] px-5"><div className="max-w-md rounded-[24px] border border-black/[.07] bg-white p-7 text-center"><div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">AVANTIQO</div><h1 className="mt-3 text-[24px] font-medium">Preparing your account…</h1><p className="mt-3 text-[11px] leading-6 text-[#746D65]">We are linking your verified identity to the correct Avantiqo experience.</p>{error?<><div className="mt-4 text-[10px] text-red-800">{error}</div><a href="/login" className="mt-5 inline-flex text-[10px] font-semibold text-[#815B36]">Return to Login →</a></>:null}</div></main>;
}
