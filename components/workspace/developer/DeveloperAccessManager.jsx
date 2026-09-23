"use client";

import { useCallback, useEffect, useState } from "react";

function deliveryLabel(delivery) {
  const status=String(delivery?.status||"").toUpperCase();
  if(status==="SENT") return { label:"Email sent", tone:"border-emerald-700/15 bg-emerald-50 text-emerald-800" };
  if(status==="MANUAL_REQUIRED") return { label:"Email not connected · copy link", tone:"border-amber-700/15 bg-amber-50 text-amber-800" };
  if(status==="DELIVERY_FAILED") return { label:"Email delivery failed · invitation still valid", tone:"border-red-700/15 bg-red-50 text-red-800" };
  if(status==="SKIPPED_TEST_ADDRESS") return { label:"Test address · email skipped", tone:"border-black/[.08] bg-[#F3F0EB] text-[#746D65]" };
  return { label:"Invitation link ready", tone:"border-black/[.08] bg-[#F3F0EB] text-[#746D65]" };
}

const ACCESS_PROFILES = {
  read_only: {
    label:"Read-only integration",
    permissions:["operations.view"],
    copy:"Read live governed Operations data and create Development/Staging credentials limited to read scope.",
  },
  webhooks: {
    label:"Webhook operator",
    permissions:["operations.view","developer.webhooks.manage"],
    copy:"Read Operations data and manage signed Development/Staging webhook endpoints. Production still requires security authority.",
  },
  administrator: {
    label:"Developer administrator",
    permissions:["operations.view","developer.security.manage","developer.webhooks.manage"],
    copy:"High authority: manage developer identities, environment policy, Production authority, credentials and webhooks for this organization.",
  },
};

export default function DeveloperAccessManager({ organizationId }) {
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("DEVELOPER");
  const [profile,setProfile]=useState("read_only");
  const [invitations,setInvitations]=useState([]);
  const [access,setAccess]=useState([]);
  const [invite,setInvite]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const r=await fetch(`/api/developers/access/invitations?organizationId=${encodeURIComponent(organizationId)}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok||!d?.success)throw new Error(d?.error||"Unable to load developer access");
      setInvitations(d.invitations||[]);setAccess(d.access||[]);
    }catch(e){setError(e?.message||"Unable to load developer access");}
    finally{setLoading(false);}
  },[organizationId]);

  useEffect(()=>{load();},[load]);

  async function createInvite(){
    setBusy(true);setError("");setInvite(null);
    try{
      const r=await fetch("/api/developers/access/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,name,email,role,permissions:ACCESS_PROFILES[profile].permissions})});
      const d=await r.json();
      if(!r.ok||!d?.success)throw new Error(d?.error||"Unable to create developer invitation");
      setInvite({ ...d.invite, delivery:d.delivery || null });setName("");setEmail("");setRole("DEVELOPER");setProfile("read_only");await load();
    }catch(e){setError(e?.message||"Unable to create developer invitation");}
    finally{setBusy(false);}
  }

  async function revoke({accessId=null,invitationId=null}){
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/developers/access/invitations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,accessId,invitationId,action:accessId?"revoke_access":"revoke_invitation"})});
      const d=await r.json();if(!r.ok||!d?.success)throw new Error(d?.error||"Unable to revoke developer access");await load();
    }catch(e){setError(e?.message||"Unable to revoke developer access");}finally{setBusy(false);}
  }

  async function copyLink(){if(invite?.url)await navigator.clipboard.writeText(invite.url);}

  return <div className="space-y-4">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Invite external developer</div>
      <h2 className="mt-3 text-[28px] font-medium tracking-[-.04em]">Grant Developer Portal access without staff membership.</h2>
      <p className="mt-3 max-w-3xl text-[10px] leading-5 text-[#746D65]">New invitations default to read-only <span className="font-mono">operations.view</span>. External developer access does not create employee, payroll or normal business-workspace access.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1.2fr_160px_220px_auto] md:items-end">
        <label><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Name</span><input value={name} onChange={e=>setName(e.target.value)} className="h-10 w-full rounded-xl border border-black/[.08] px-3 text-[10px]" placeholder="Developer name"/></label>
        <label><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="h-10 w-full rounded-xl border border-black/[.08] px-3 text-[10px]" placeholder="developer@company.com"/></label>
        <label><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Role</span><select value={role} onChange={e=>setRole(e.target.value)} className="h-10 w-full rounded-xl border border-black/[.08] px-3 text-[10px]"><option>DEVELOPER</option><option>INTEGRATOR</option><option>PARTNER</option></select></label>
        <label><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Access profile</span><select value={profile} onChange={e=>setProfile(e.target.value)} className="h-10 w-full rounded-xl border border-black/[.08] px-3 text-[10px]"><option value="read_only">Read-only integration</option><option value="webhooks">Webhook operator</option><option value="administrator">Developer administrator</option></select></label>
        <button type="button" disabled={busy||!email.trim()} onClick={createInvite} className="h-10 rounded-xl bg-[#1D1A17] px-4 text-[9px] font-semibold text-white disabled:opacity-40">Create invite</button>
      </div>
      <div className={`mt-3 rounded-xl border p-3 text-[8px] leading-4 ${profile==="administrator"?"border-red-200 bg-red-50 text-red-800":"border-black/[.06] bg-[#FBF9F6] text-[#746D65]"}`}><span className="font-semibold">{ACCESS_PROFILES[profile].label}:</span> {ACCESS_PROFILES[profile].copy}</div>
      {error?<div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2.5 text-[9px] text-red-800">{error}</div>:null}
      {invite?<div className="mt-4 rounded-[16px] border border-[#B7793B]/18 bg-[#FBF6EF] p-4"><div className="text-[8px] font-semibold text-[#76502E]">Invitation ready · {invite.email}</div>{(()=>{const d=deliveryLabel(invite.delivery);return <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[7px] font-semibold ${d.tone}`}>{d.label}</div>;})()}<div className="mt-2 break-all text-[8px] leading-4 text-[#7A6B5B]">{invite.url}</div><div className="mt-3 flex gap-2"><button type="button" onClick={copyLink} className="rounded-lg bg-[#1D1A17] px-3 py-2 text-[8px] font-semibold text-white">Copy link</button><a href={invite.url} target="_blank" rel="noreferrer" className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold text-[#655C52]">Preview</a></div></div>:null}
    </section>

    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Access lifecycle</div><h2 className="mt-2 text-[24px] font-medium tracking-[-.035em]">External Developer Portal identities</h2></div><button type="button" onClick={load} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold">Refresh</button></div>
      {loading?<div className="mt-5 text-[9px] text-[#817A72]">Loading developer access…</div>:null}
      <div className="mt-5 space-y-2">{access.map(row=><div key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-[10px] font-semibold">{row.name||row.email}</div><div className="mt-1 text-[8px] text-[#817A72]">{row.email} · {row.role} · {(row.permissions||[]).join(", ")}</div></div><button type="button" disabled={busy} onClick={()=>revoke({accessId:row.id})} className="rounded-lg border border-red-700/15 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-800">Revoke access</button></div>)}</div>
      <div className="mt-6 border-t border-black/[.06] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#91877C]">Pending invitations</div><div className="mt-3 space-y-2">{invitations.filter(row=>row.status==="PENDING").map(row=><div key={row.id} className="grid gap-3 rounded-[14px] border border-black/[.06] p-3 md:grid-cols-[1fr_auto] md:items-center"><div className="text-[9px] text-[#655C52]">{row.name||row.email} · {row.email} · expires {new Date(row.expires_at).toLocaleDateString()}</div><button type="button" disabled={busy} onClick={()=>revoke({invitationId:row.id})} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold">Revoke invite</button></div>)}</div></div>
    </section>
  </div>;
}
