"use client";

import { useEffect, useState } from "react";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { supabase } from "@/lib/shared/supabase/client";

export default function SignupPage() {
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [intent,setIntent]=useState("business");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("intent");
    setIntent(requested === "accounting_firm" ? "accounting_firm" : requested === "supplier" ? "supplier" : "business");
  }, []);

  async function submit(event){
    event.preventDefault();
    setError(""); setMessage("");
    if (!name.trim() || !email.trim()) return setError("Enter your name and email.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("The passwords do not match.");
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/signup/complete?intent=${encodeURIComponent(intent)}`;
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { emailRedirectTo: redirectTo, data: { full_name:name.trim(), avantiqo_self_signup:true, avantiqo_signup_intent:intent } },
      });
      if (signupError) throw signupError;
      if (data?.session) {
        if (intent === "supplier") {
          window.location.href = "/supplier-portal";
          return;
        }
        const response = await fetch("/api/onboarding/self-service-owner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name.trim(),intent}) });
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error(result?.error || "Unable to prepare onboarding");
        window.location.href = `/onboarding?intent=${encodeURIComponent(intent)}`;
        return;
      }
      setMessage("Check your email to confirm your Avantiqo account. After confirmation, onboarding will continue automatically.");
    } catch (e) { setError(e?.message || "Unable to create account"); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader context="Sign up" audience="platform" tone="light" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[linear-gradient(180deg,#F8F2E9_0%,#EEE2D3_100%)]">
      <div className="mx-auto grid max-w-[1260px] gap-10 px-5 py-14 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-20">
        <div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">START AVANTIQO</p><h1 className="mt-4 text-[50px] font-medium leading-[.95] tracking-[-.06em] sm:text-[66px]">{intent === "accounting_firm" ? "Create the firm account. Then configure the accounting practice." : intent === "supplier" ? "Create your supplier identity. Your shop can stay free." : "Create your account. Then set up the real business."}</h1><p className="mt-6 max-w-xl text-[14px] leading-7 text-[#6B645C]">{intent === "accounting_firm" ? "This path creates the accounting firm as its own Avantiqo organization. Client organizations are connected separately through governed client access." : intent === "supplier" ? "This creates only your Avantiqo identity. Inside Supplier Portal you can accept customer invitations, create a free supplier shop, publish products and become discoverable. A full Avantiqo Business remains optional." : "Your account comes first. Then Avantiqo guides you through organization, business type, country, currency, accounting context and owner confirmation before provisioning the workspace."}</p><div className="mt-8 text-[9px] text-[#81776D]">Already have access? <a href={intent === "supplier" ? "/login?portal=supplier" : "/login?portal=business"} className="font-semibold text-[#815B36]">{intent === "supplier" ? "Supplier Login →" : "Business Login →"}</a></div></div>
        <form onSubmit={submit} className="rounded-[28px] border border-white/80 bg-white/62 p-6 shadow-[0_26px_80px_rgba(65,45,24,.10)] backdrop-blur-xl sm:p-8">
          <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">{intent === "accounting_firm" ? "NEW ACCOUNTING FIRM ACCOUNT" : intent === "supplier" ? "NEW SUPPLIER NETWORK ACCOUNT" : "NEW BUSINESS OWNER ACCOUNT"}</div>
          <div className="mt-6 grid gap-4"><label className="text-[9px] font-semibold text-[#62584E]">Your name<input value={name} onChange={e=>setName(e.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3.5 text-[12px] font-normal outline-none focus:border-[#B98A52]/65" placeholder="Full name"/></label><label className="text-[9px] font-semibold text-[#62584E]">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3.5 text-[12px] font-normal outline-none focus:border-[#B98A52]/65" placeholder="you@company.com"/></label><label className="text-[9px] font-semibold text-[#62584E]">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3.5 text-[12px] font-normal outline-none focus:border-[#B98A52]/65" placeholder="At least 8 characters"/></label><label className="text-[9px] font-semibold text-[#62584E]">Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} className="mt-2 h-11 w-full rounded-xl border border-black/[.09] bg-white px-3.5 text-[12px] font-normal outline-none focus:border-[#B98A52]/65" placeholder="Repeat password"/></label></div>
          {error?<div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-3.5 py-3 text-[10px] text-red-800">{error}</div>:null}{message?<div className="mt-4 rounded-xl border border-[#6F7E68]/15 bg-[#F5F7F3] px-3.5 py-3 text-[10px] text-[#5D6A57]">{message}</div>:null}
          <button disabled={loading} className="mt-6 h-11 w-full rounded-xl bg-[#211C17] text-[10px] font-semibold text-white disabled:opacity-45">{loading?"Creating account…":"Create account and continue →"}</button>
        </form>
      </div>
    </section>
  </main>;
}
