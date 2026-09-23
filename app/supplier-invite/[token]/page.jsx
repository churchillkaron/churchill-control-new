"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { supabase } from "@/lib/shared/supabase/client";

export default function SupplierInvitePage(){
  const params=useParams();
  const token=String(params?.token||"");
  const [invite,setInvite]=useState(null);
  const [session,setSession]=useState(null);
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{let active=true;(async()=>{try{const [{data:auth},response]=await Promise.all([supabase.auth.getSession(),fetch(`/api/supplier-portal/invitations/${encodeURIComponent(token)}`,{cache:"no-store"})]);const data=await response.json();if(!response.ok||!data?.success)throw new Error(data?.error||"Invitation unavailable");if(active){setInvite(data.invitation);setSession(auth?.session||null);}}catch(e){if(active)setError(e?.message||"Invitation unavailable");}finally{if(active)setLoading(false);}})();return()=>{active=false};},[token]);

  async function createAccount(){
    if(!invite?.email||password.length<8){setError("Use at least 8 characters for your password.");return;}
    setError("");setMessage("");
    const redirectTo=`${window.location.origin}/supplier-invite/${encodeURIComponent(token)}`;
    const {data,error:signError}=await supabase.auth.signUp({email:invite.email,password,options:{emailRedirectTo:redirectTo,data:{avantiqo_supplier_invite:true}}});
    if(signError){setError(signError.message);return;}
    if(data?.session){setSession(data.session);setMessage("Account ready. Accept the invitation to enter the supplier portal.");return;}
    setMessage("Check your email to confirm the account, then return to this invitation link.");
  }

  const signedInEmail=String(session?.user?.email||"").trim().toLowerCase();
  const invitedEmail=String(invite?.email||"").trim().toLowerCase();
  const emailMatches=Boolean(session&&signedInEmail&&invitedEmail&&signedInEmail===invitedEmail);

  async function useInvitedEmail(){
    await supabase.auth.signOut();
    window.location.href=`/login?portal=supplier&next=${encodeURIComponent(`/supplier-invite/${token}`)}`;
  }

  async function accept(){
    setError("");
    const response=await fetch(`/api/supplier-portal/invitations/${encodeURIComponent(token)}/accept`,{method:"POST"});
    const data=await response.json();
    if(!response.ok||!data?.success){setError(data?.error||"Unable to accept invitation");return;}
    window.location.href=data.redirect||"/supplier-portal";
  }

  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader context="Supplier invitation" audience="platform" tone="light" />
    <section className="mx-auto max-w-[980px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
      <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">SUPPLIER ACCESS</p>
      <h1 className="mt-4 text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Join a customer organization without becoming an internal user.</h1>
      {loading?<div className="mt-8 text-[11px] text-[#746D65]">Loading invitation…</div>:null}
      {error?<div className="mt-6 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}
      {invite?<div className="mt-8 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[24px] border border-black/[.07] bg-white p-6"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">INVITATION</div><div className="mt-5 text-[14px] font-semibold">{invite.organizationName}</div><div className="mt-2 text-[10px] text-[#746D65]">Supplier: {invite.supplierName}</div><div className="mt-2 text-[10px] text-[#746D65]">Email: {invite.email}</div><div className="mt-4 text-[8px] text-[#8B8177]">Status: {invite.status} · Expires {new Date(invite.expiresAt).toLocaleString()}</div></div>
        <div className="rounded-[24px] border border-[#B98A52]/22 bg-[#F3E7D7]/58 p-6"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">YOUR ACCESS</div>{session?(emailMatches?<><p className="mt-4 text-[11px] leading-6 text-[#6D6257]">You are signed in with the invited email. Accepting creates supplier-only access for this customer relationship. It does not create a business organization or internal workspace membership.</p><button onClick={accept} disabled={invite.status!=="PENDING"} className="mt-6 h-11 rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white disabled:opacity-40">Accept supplier access →</button></>:<><div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[10px] leading-5 text-red-800">This invitation belongs to <strong>{invite.email}</strong>, but you are signed in as <strong>{session.user?.email}</strong>.</div><button type="button" onClick={useInvitedEmail} className="mt-4 h-11 rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white">Sign out and use invited email →</button></>):<><p className="mt-4 text-[11px] leading-6 text-[#6D6257]">Create an account with the invited email, or sign in if you already use Avantiqo.</p><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create password" className="mt-5 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3.5 text-[11px]"/><button onClick={createAccount} className="mt-3 h-11 w-full rounded-xl bg-[#211C17] text-[10px] font-semibold text-white">Create supplier account</button><a href={`/login?portal=supplier&next=${encodeURIComponent(`/supplier-invite/${token}`)}`} className="mt-4 inline-flex text-[9px] font-semibold text-[#815B36]">Already have an account? Sign in →</a></>}{message?<div className="mt-4 text-[9px] leading-5 text-[#5D6A57]">{message}</div>:null}</div>
      </div>:null}
    </section>
  </main>;
}
