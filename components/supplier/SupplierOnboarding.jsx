"use client";

import { useEffect, useMemo, useState } from "react";

function Card({ active, eyebrow, title, body, onClick, action }) {
  return <button
    type="button"
    onClick={onClick}
    className={`w-full rounded-[22px] border p-5 text-left transition ${active ? "border-[#B7793B]/40 bg-[#FBF6EF]" : "border-black/[.07] bg-white hover:border-[#B7793B]/25"}`}
  >
    <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">{eyebrow}</div>
    <div className="mt-3 text-[18px] font-semibold tracking-[-.025em]">{title}</div>
    <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{body}</p>
    <div className="mt-4 text-[9px] font-semibold text-[#76502E]">{action}</div>
  </button>;
}

export default function SupplierOnboarding() {
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [snapshot,setSnapshot]=useState(null);
  const [businessCandidates,setBusinessCandidates]=useState([]);
  const [path,setPath]=useState("");
  const [profile,setProfile]=useState({businessName:"",displayName:"",phone:"",website:""});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [storeResponse,businessResponse] = await Promise.all([
        fetch("/api/supplier-portal/storefront",{cache:"no-store"}),
        fetch("/api/supplier-portal/business",{cache:"no-store"}),
      ]);
      const storePayload = await storeResponse.json().catch(()=>({}));
      const businessPayload = await businessResponse.json().catch(()=>({}));
      if (storeResponse.status === 401) {
        window.location.href="/login?portal=supplier&next=/supplier-portal/onboarding";
        return;
      }
      if (!storeResponse.ok || !storePayload?.success) throw new Error(storePayload?.error || "Unable to load supplier onboarding");
      setSnapshot(storePayload);
      setProfile({
        businessName:storePayload.account?.business_name || "",
        displayName:storePayload.account?.display_name || "",
        phone:storePayload.account?.phone || "",
        website:storePayload.account?.website || "",
      });
      if (businessResponse.ok && businessPayload?.success) setBusinessCandidates(businessPayload.organizations || []);
      const caps=storePayload.capabilities || {};
      if (caps.business) setPath("business");
      else if (caps.storefront) setPath("shop");
      else if (caps.invited_relationships) setPath("invited");
    } catch (e) {
      setError(e?.message || "Unable to load supplier onboarding");
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ void load(); },[]);

  const relationships=snapshot?.relationships || [];
  const capabilities=snapshot?.capabilities || {};
  const account=snapshot?.account || null;
  const storefront=snapshot?.storefront || null;

  const steps=useMemo(()=>[
    {label:"Identity",done:Boolean(account)},
    {label:"Customer access",done:capabilities.invited_relationships || path!=="invited"},
    {label:"Shop",done:capabilities.storefront || path==="invited"},
    {label:"Business",done:capabilities.business || path!=="business"},
  ],[account,capabilities,path]);

  async function ensureProfile() {
    const response=await fetch("/api/supplier-portal/profile",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(profile),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to create supplier profile");
    return payload;
  }

  async function continueInvited() {
    setSaving(true); setError("");
    try {
      await ensureProfile();
      window.location.href="/supplier-portal/customers";
    } catch(e) { setError(e?.message || "Unable to continue supplier invitation"); }
    finally { setSaving(false); }
  }

  async function continueShop() {
    setSaving(true); setError("");
    try {
      if (!profile.businessName.trim()) throw new Error("Business name is required for a free supplier shop");
      await ensureProfile();
      if (!capabilities.storefront) {
        const response=await fetch("/api/supplier-portal/storefront",{method:"POST"});
        const payload=await response.json().catch(()=>({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to create free supplier shop");
      }
      window.location.href="/supplier-portal/catalog";
    } catch(e) { setError(e?.message || "Unable to create supplier shop"); }
    finally { setSaving(false); }
  }

  async function connectExistingBusiness(organizationId) {
    setSaving(true); setError("");
    try {
      if (!account) await ensureProfile();
      const response=await fetch("/api/supplier-portal/business",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({organizationId}),
      });
      const payload=await response.json().catch(()=>({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to connect Avantiqo Business");
      window.location.href="/supplier-portal/settings";
    } catch(e) { setError(e?.message || "Unable to connect Avantiqo Business"); }
    finally { setSaving(false); }
  }

  async function startBusinessOnboarding() {
    setSaving(true); setError("");
    try {
      if (!profile.businessName.trim()) throw new Error("Business name is required");
      await ensureProfile();
      const response=await fetch("/api/onboarding/self-service-owner",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:profile.displayName || profile.businessName,intent:"business",source:"supplier_upgrade"}),
      });
      const payload=await response.json().catch(()=>({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to prepare Business onboarding");
      window.location.href="/onboarding?intent=business&source=supplier";
    } catch(e) { setError(e?.message || "Unable to start Business onboarding"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-7 lg:px-10"><div className="rounded-[22px] border border-black/[.07] bg-white p-6 text-[10px] text-[#756E66]">Preparing Supplier onboarding…</div></div>;

  return <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
    <div className="max-w-3xl">
      <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">Supplier onboarding</div>
      <h1 className="mt-3 text-[42px] font-medium leading-[.98] tracking-[-.05em] sm:text-[56px]">How do you want to use Avantiqo?</h1>
      <p className="mt-5 text-[12px] leading-6 text-[#6B645C]">You can start with one capability and add the others later. Your supplier identity, customer relationships, shop and history stay with you.</p>
    </div>

    <div className="mt-7 grid gap-2 sm:grid-cols-4">
      {steps.map((step,index)=><div key={step.label} className="rounded-[14px] border border-black/[.06] bg-white px-3 py-3"><div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">0{index+1}</div><div className="mt-1 text-[9px] font-semibold">{step.label}</div><div className="mt-1 text-[7px] text-[#81786F]">{step.done ? "Ready" : "Optional / next"}</div></div>)}
    </div>

    {error ? <div className="mt-5 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}

    <div className="mt-6 grid gap-3 lg:grid-cols-3">
      <Card active={path==="invited"} eyebrow="01 · Invitation" title="Work with customers who invited you" body="Keep it lightweight. See purchase orders, invoices, payments and documents for connected customers. No shop or Business subscription required." action={capabilities.invited_relationships ? relationships.length + " customer relationship(s) available" : "Use when a customer invites you"} onClick={()=>setPath("invited")} />
      <Card active={path==="shop"} eyebrow="02 · Free Shop" title="Create a free supplier shop" body="Publish products, share your shop and become discoverable inside the Avantiqo Supplier Network. Full ERP remains optional." action={capabilities.storefront ? "Shop already created" : "Free · no Business workspace required"} onClick={()=>setPath("shop")} />
      <Card active={path==="business"} eyebrow="03 · Business" title="Run the whole business on Avantiqo" body="Use the same supplier profile and shop, then add Finance, Supply Chain, Commercial, People, Operations and the rest of the Avantiqo Business workspace." action={capabilities.business ? "Business already connected" : "Connect or create Business"} onClick={()=>setPath("business")} />
    </div>

    <section className="mt-5 rounded-[24px] border border-black/[.07] bg-white p-5 sm:p-6">
      {!path ? <div className="text-[10px] text-[#756E66]">Choose one of the three paths above. You can add the other capabilities later.</div> : null}

      {path ? <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Business name<input value={profile.businessName} onChange={(e)=>setProfile((current)=>({...current,businessName:e.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none" placeholder={path==="invited" ? "Optional if invitation already identifies the supplier" : "Supplier business name"} /></label>
        <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Your / display name<input value={profile.displayName} onChange={(e)=>setProfile((current)=>({...current,displayName:e.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none" /></label>
        <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Phone<input value={profile.phone} onChange={(e)=>setProfile((current)=>({...current,phone:e.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none" /></label>
        <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Website<input value={profile.website} onChange={(e)=>setProfile((current)=>({...current,website:e.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none" placeholder="https://…" /></label>
      </div> : null}

      {path==="invited" ? <div className="mt-5"><div className="rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 text-[9px] leading-5 text-[#756E66]">{capabilities.invited_relationships ? "Your accepted customer relationships will be attached to this Supplier Network profile. You can add a shop later without changing accounts." : "There is no accepted customer invitation on this login yet. You can still create the profile now, or choose Free Shop instead."}</div><button onClick={continueInvited} disabled={saving} className="mt-4 rounded-xl bg-[#1D1A17] px-5 py-3 text-[9px] font-semibold text-white disabled:opacity-50">Continue with supplier relationships →</button></div> : null}

      {path==="shop" ? <div className="mt-5"><div className="rounded-[16px] border border-[#B7793B]/15 bg-[#FBF6EF] p-4 text-[9px] leading-5 text-[#756E66]">Next: add products in Catalog, configure Storefront, publish, then choose whether the shop is visible only inside Avantiqo or also through a shareable public URL.</div><button onClick={continueShop} disabled={saving} className="mt-4 rounded-xl bg-[#1D1A17] px-5 py-3 text-[9px] font-semibold text-white disabled:opacity-50">{capabilities.storefront ? "Continue to catalog →" : "Create free shop →"}</button></div> : null}

      {path==="business" ? <div className="mt-5 space-y-3">
        {capabilities.business ? <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 p-4 text-[9px] text-emerald-800">This Supplier Network profile is already linked to an Avantiqo Business. The same shop, relationships and history remain connected.</div> : null}
        {!capabilities.business && businessCandidates.length ? <div><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">Existing businesses you own</div><div className="mt-2 grid gap-2">{businessCandidates.map((organization)=><button key={organization.id} onClick={()=>connectExistingBusiness(organization.id)} disabled={saving} className="flex items-center justify-between gap-3 rounded-[14px] border border-black/[.07] bg-[#FBFAF8] px-4 py-3 text-left"><span><span className="block text-[9px] font-semibold">{organization.name || organization.legal_name || "Avantiqo Business"}</span><span className="mt-1 block text-[7px] text-[#81786F]">{organization.role}</span></span><span className="text-[8px] font-semibold text-[#76502E]">Connect →</span></button>)}</div></div> : null}
        {!capabilities.business ? <div className="rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4"><div className="text-[9px] font-semibold">Need a new Avantiqo Business?</div><p className="mt-2 text-[8px] leading-4 text-[#756E66]">Continue with the normal Business onboarding using this same login. Your Supplier Network profile and shop will remain intact and can be linked after the organization is provisioned.</p><button onClick={startBusinessOnboarding} disabled={saving} className="mt-4 rounded-xl bg-[#1D1A17] px-5 py-3 text-[9px] font-semibold text-white disabled:opacity-50">Start Business onboarding →</button></div> : null}
        {capabilities.business ? <a href="/supplier-portal/settings" className="inline-flex rounded-xl border border-black/[.08] px-4 py-2.5 text-[9px] font-semibold">Open Business connection settings →</a> : null}
      </div> : null}
    </section>
  </div>;
}
