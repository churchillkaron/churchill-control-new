"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function nameOf(row) {
  return row?.display_name || row?.legal_name || row?.vendor_code || "Supplier";
}

function statusBadge(status) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE" || value === "ACCEPTED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (value === "PENDING") return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[.08] bg-[#F3F0EB] text-[#746D65]";
}

function deliveryLabel(delivery) {
  const status=String(delivery?.status||"").toUpperCase();
  if(status==="SENT") return { label:"Email sent", tone:"border-emerald-700/15 bg-emerald-50 text-emerald-800" };
  if(status==="MANUAL_REQUIRED") return { label:"Email not connected · copy link", tone:"border-amber-700/15 bg-amber-50 text-amber-800" };
  if(status==="DELIVERY_FAILED") return { label:"Email delivery failed · invitation still valid", tone:"border-red-700/15 bg-red-50 text-red-800" };
  if(status==="SKIPPED_TEST_ADDRESS") return { label:"Test address · email skipped", tone:"border-black/[.08] bg-[#F3F0EB] text-[#746D65]" };
  return { label:"Invitation link ready", tone:"border-black/[.08] bg-[#F3F0EB] text-[#746D65]" };
}

export default function SupplierPortalAccessWorkCenter({ organizationId }) {
  const [suppliers, setSuppliers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [emailDrafts, setEmailDrafts] = useState({});

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [supplierResponse, accessResponse] = await Promise.all([
        fetch(`/api/procurement/vendors/list?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" }),
        fetch(`/api/supplier-portal/invitations?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" }),
      ]);
      const [supplierData, accessData] = await Promise.all([supplierResponse.json(), accessResponse.json()]);
      if (!supplierResponse.ok || !supplierData?.success) throw new Error(supplierData?.error || "Unable to load suppliers");
      if (!accessResponse.ok || !accessData?.success) throw new Error(accessData?.error || "Unable to load supplier portal access");
      const nextSuppliers = supplierData.vendors || [];
      setSuppliers(nextSuppliers);
      setEmailDrafts((current) => {
        const next = { ...current };
        for (const supplier of nextSuppliers) {
          if (!(supplier.supplier_profile_id in next)) next[supplier.supplier_profile_id] = supplier.email || "";
        }
        return next;
      });
      setInvitations(accessData.invitations || []);
      setAccessRows(accessData.access || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load supplier portal access");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const activeBySupplier = useMemo(() => new Map(accessRows.filter(row => row.status === "ACTIVE").map(row => [String(row.supplier_profile_id), row])), [accessRows]);
  const pendingBySupplier = useMemo(() => new Map(invitations.filter(row => row.status === "PENDING").map(row => [String(row.supplier_profile_id), row])), [invitations]);

  async function saveSupplierEmail(supplier) {
    const supplierProfileId = supplier.supplier_profile_id;
    const email = String(emailDrafts[supplierProfileId] || "").trim().toLowerCase();
    if (!email) { setError("Enter the supplier email before saving."); return; }
    setBusyId(`email:${supplierProfileId}`);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/invitations", {
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ organizationId, supplierProfileId, email, action:"update_supplier_email" }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to update supplier email");
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to update supplier email");
    } finally {
      setBusyId("");
    }
  }

  async function createInvite(supplier) {
    setBusyId(supplier.supplier_profile_id);
    setError("");
    setInvite(null);
    try {
      const response = await fetch("/api/supplier-portal/invitations", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ organizationId, supplierProfileId:supplier.supplier_profile_id }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to create supplier invitation");
      setInvite({ ...data.invite, delivery:data.delivery || null });
      await load();
    } catch (inviteError) {
      setError(inviteError?.message || "Unable to create supplier invitation");
    } finally {
      setBusyId("");
    }
  }

  async function revoke({ accessId = null, invitationId = null }) {
    const id = accessId || invitationId;
    setBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/invitations", {
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ organizationId, accessId, invitationId, action:accessId ? "revoke_access" : "revoke_invitation" }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to revoke supplier access");
      await load();
    } catch (revokeError) {
      setError(revokeError?.message || "Unable to revoke supplier access");
    } finally {
      setBusyId("");
    }
  }

  async function copyInvite() {
    if (!invite?.url) return;
    await navigator.clipboard.writeText(invite.url);
  }

  return <main className="min-h-screen bg-[#F6F3EE] px-4 py-5 text-[#1D1B18] sm:px-6 lg:px-8 lg:py-7">
    <div className="mx-auto max-w-[1380px]">
      <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
        <div><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">SUPPLY CHAIN / PROCUREMENT</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-.04em] sm:text-[38px]">Supplier Portal Access</h1><p className="mt-3 max-w-2xl text-[10px] leading-5 text-[#746D65]">Invite an existing canonical supplier Party into a customer-scoped external portal. Supplier identities never receive internal workspace membership from this flow.</p></div>
        <div className="grid grid-cols-3 gap-2 lg:justify-self-end lg:min-w-[390px]">{[[suppliers.length,"Suppliers"],[invitations.filter(x=>x.status==="PENDING").length,"Pending"],[accessRows.filter(x=>x.status==="ACTIVE").length,"Active access"]].map(([value,label])=><div key={label} className="rounded-[18px] border border-black/[.07] bg-white p-4"><div className="text-[22px] font-semibold tabular-nums">{value}</div><div className="mt-1 text-[7px] uppercase tracking-[.12em] text-[#91877C]">{label}</div></div>)}</div>
      </div>

      {error?<div className="mt-5 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}
      {invite?<div className="mt-5 rounded-[20px] border border-[#B98A52]/22 bg-[#F3E7D7]/62 p-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">INVITATION CREATED</div><div className="mt-2 text-[12px] font-semibold">{invite.supplierName} · {invite.email}</div>{(()=>{const d=deliveryLabel(invite.delivery);return <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[7px] font-semibold ${d.tone}`}>{d.label}</div>;})()}<p className="mt-2 break-all text-[9px] leading-5 text-[#6D6257]">{invite.url}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copyInvite} className="rounded-lg bg-[#211C17] px-3.5 py-2 text-[9px] font-semibold text-white">Copy invitation link</button><a href={invite.url} target="_blank" rel="noreferrer" className="rounded-lg border border-black/[.09] bg-white px-3.5 py-2 text-[9px] font-semibold text-[#62584E]">Preview invitation</a></div></div>:null}

      <section className="mt-7 overflow-hidden rounded-[22px] border border-black/[.07] bg-white">
        <div className="flex flex-col gap-2 border-b border-black/[.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-[15px] font-semibold">Canonical suppliers</h2><p className="mt-1 text-[8px] text-[#817A72]">Supplier email must exist before an invitation can be created.</p></div><button type="button" onClick={load} className="self-start rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold text-[#655C52]">Refresh</button></div>
        {loading?<div className="p-6 text-[10px] text-[#817A72]">Loading supplier access…</div>:null}
        <div className="divide-y divide-black/[.055]">{suppliers.map(supplier=>{
          const active=activeBySupplier.get(String(supplier.supplier_profile_id));
          const pending=pendingBySupplier.get(String(supplier.supplier_profile_id));
          return <div key={supplier.supplier_profile_id} className="grid gap-4 p-5 lg:grid-cols-[1fr_.72fr_auto] lg:items-center"><div><div className="text-[12px] font-semibold">{nameOf(supplier)}</div><div className="mt-1 text-[8px] text-[#847C73]">{supplier.vendor_code||"No vendor code"} · {supplier.email||"No email"}</div>{!supplier.email&&!active&&!pending?<div className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row"><input type="email" value={emailDrafts[supplier.supplier_profile_id]||""} onChange={event=>setEmailDrafts(current=>({...current,[supplier.supplier_profile_id]:event.target.value}))} placeholder="supplier@company.com" className="h-9 min-w-0 flex-1 rounded-lg border border-black/[.09] bg-[#FBFAF8] px-3 text-[9px] outline-none focus:border-[#B98A52]/60"/><button type="button" disabled={busyId===`email:${supplier.supplier_profile_id}`||!String(emailDrafts[supplier.supplier_profile_id]||"").trim()} onClick={()=>saveSupplierEmail(supplier)} className="h-9 rounded-lg border border-[#B98A52]/25 bg-[#F3E7D7]/65 px-3 text-[8px] font-semibold text-[#76502E] disabled:opacity-40">{busyId===`email:${supplier.supplier_profile_id}`?"Saving…":"Save email"}</button></div>:null}</div><div className="flex flex-wrap gap-1.5">{active?<span className={`rounded-full border px-2.5 py-1 text-[7px] font-semibold ${statusBadge(active.status)}`}>ACTIVE PORTAL ACCESS</span>:null}{pending?<span className={`rounded-full border px-2.5 py-1 text-[7px] font-semibold ${statusBadge(pending.status)}`}>INVITE PENDING</span>:null}{!active&&!pending?<span className="rounded-full border border-black/[.08] bg-[#F7F5F1] px-2.5 py-1 text-[7px] font-semibold text-[#847C73]">NO PORTAL ACCESS</span>:null}</div><div className="flex flex-wrap justify-start gap-2 lg:justify-end">{active?<button type="button" disabled={busyId===active.id} onClick={()=>revoke({accessId:active.id})} className="rounded-lg border border-red-700/15 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-800 disabled:opacity-40">Revoke access</button>:pending?<><button type="button" disabled={busyId===pending.id} onClick={()=>revoke({invitationId:pending.id})} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold text-[#655C52] disabled:opacity-40">Revoke invite</button><button type="button" disabled={busyId===supplier.supplier_profile_id} onClick={()=>createInvite(supplier)} className="rounded-lg bg-[#211C17] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-40">Reissue</button></>:<button type="button" disabled={!supplier.email||busyId===supplier.supplier_profile_id} onClick={()=>createInvite(supplier)} className="rounded-lg bg-[#211C17] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-40">Invite supplier</button>}</div></div>;
        })}</div>
        {!loading&&!suppliers.length?<div className="p-6 text-[10px] text-[#817A72]">No canonical suppliers exist for this organization yet.</div>:null}
      </section>
    </div>
  </main>;
}
