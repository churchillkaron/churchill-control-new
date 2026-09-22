"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Building2, Camera, CreditCard, IdCard, KeyRound, RefreshCw, ShieldCheck, TestTube2, UploadCloud, UserRound } from "lucide-react";
import { supabaseClient } from "@/lib/shared/supabase/client";
import beginCentralPasskeyEnrollment, { beginCentralPasskeySignIn } from "@/lib/people/workforce/StaffPasskeyBrokerClient";


function compensation(profile) {
  if (!profile) return "Not configured";
  const type = String(profile.salary_type || "").toUpperCase();
  const currency = profile.currency_code || profile.currency || "";
  if (type === "MONTHLY") return `${Number(profile.monthly_salary || 0).toLocaleString()} ${currency} / month`;
  if (type === "HOURLY") return `${Number(profile.hourly_rate || 0).toLocaleString()} ${currency} / hour`;
  return type || "Configured";
}

export default function StaffProfilePage() {
  const fileRef = useRef(null);
  const identityFileRef = useRef(null);
  const workPermitFileRef = useRef(null);
  const [identityType, setIdentityType] = useState("PASSPORT");
  const [identity, setIdentity] = useState(null);
  const [workPermit, setWorkPermit] = useState(null);
  const [workPermitExpiry, setWorkPermitExpiry] = useState("");
  const [workPermitNumber, setWorkPermitNumber] = useState("");
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyNotice, setPasskeyNotice] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [state, setState] = useState({ loading: true, saving: false, profile: null, error: "", message: "" });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [response, identityResponse, workPermitResponse, passkeyResult] = await Promise.all([
        fetch("/api/staff/profile-overview", { cache: "no-store" }),
        fetch("/api/staff/identity-verification", { cache: "no-store" }),
        fetch("/api/staff/work-permit", { cache: "no-store" }),
        supabaseClient.auth.passkey.list().catch((error) => ({ data: [], error })),
      ]);
      const [payload, identityPayload, workPermitPayload] = await Promise.all([
        response.json().catch(() => ({})),
        identityResponse.json().catch(() => ({})),
        workPermitResponse.json().catch(() => ({})),
      ]);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load profile");
      if (!identityResponse.ok || !identityPayload?.success) throw new Error(identityPayload?.error || "Unable to load identity verification");
      if (!workPermitResponse.ok || !workPermitPayload?.success) throw new Error(workPermitPayload?.error || "Unable to load work permit");
      setIdentity(identityPayload.identity || null);
      setWorkPermit(workPermitPayload.workPermit || null);
      if (passkeyResult?.error) {
        setPasskeys([]);
        setPasskeyNotice(passkeyResult.error?.message || "Passkeys are unavailable on this browser or device.");
      } else {
        setPasskeys(Array.isArray(passkeyResult?.data) ? passkeyResult.data : passkeyResult?.data?.passkeys || []);
        setPasskeyNotice("");
      }
      setState((current) => ({ ...current, loading: false, profile: payload.profile || null, error: "" }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load profile" }));
    }
  }

  useEffect(() => { load(); }, []);

  async function upload(file) {
    if (!file) return;
    setState((current) => ({ ...current, saving: true, error: "", message: "" }));
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/staff/upload-profile-picture", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update photo");
      setState((current) => ({ ...current, saving: false, message: "Profile photo updated." }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error?.message || "Unable to update photo" }));
    }
  }

  async function uploadIdentity(file) {
    if (!file) return;
    setSecurityBusy(true);
    setState((current) => ({ ...current, error: "", message: "" }));
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("documentType", identityType);
      const response = await fetch("/api/staff/identity-verification", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload identity document");
      setIdentity(payload.identity || null);
      setState((current) => ({ ...current, message: "Identity document uploaded. Verification is pending." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to upload identity document" }));
    } finally {
      setSecurityBusy(false);
      if (identityFileRef.current) identityFileRef.current.value = "";
    }
  }

  async function uploadWorkPermit(file) {
    if (!file) return;
    if (!workPermitExpiry) {
      setState((current) => ({ ...current, error: "Work permit expiry date is required.", message: "" }));
      if (workPermitFileRef.current) workPermitFileRef.current.value = "";
      return;
    }
    setSecurityBusy(true);
    setState((current) => ({ ...current, error: "", message: "" }));
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("expiryDate", workPermitExpiry);
      if (workPermitNumber.trim()) body.append("permitNumber", workPermitNumber.trim());
      const response = await fetch("/api/staff/work-permit", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload work permit");
      setWorkPermit(payload.workPermit || null);
      setState((current) => ({ ...current, message: "Work permit uploaded for review and expiry tracking." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to upload work permit" }));
    } finally {
      setSecurityBusy(false);
      if (workPermitFileRef.current) workPermitFileRef.current.value = "";
    }
  }

  async function registerPasskey() {
    setSecurityBusy(true);
    setState((current) => ({ ...current, error: "", message: "" }));
    try {
      await beginCentralPasskeyEnrollment({ returnPath: "/staff/profile" });
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to register Face ID / passkey" }));
      setSecurityBusy(false);
    }
  }

  async function testPasskey() {
    setSecurityBusy(true);
    setState((current) => ({ ...current, error: "", message: "" }));
    try {
      await beginCentralPasskeySignIn({ returnPath: "/staff/profile" });
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Passkey verification failed" }));
      setSecurityBusy(false);
    }
  }

  const profile = state.profile || {};
  const staff = profile.staff || {};
  const party = profile.party || {};
  const employment = profile.employment || {};
  const comp = profile.compensation || {};
  const activationBypass = String(staff.role || "").toUpperCase() === "SUPER_ADMIN";

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#1B1A18] lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-black/[0.09] bg-white">
                {staff.profile_picture ? <Image src={staff.profile_picture} alt="Profile" width={80} height={80} className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8 text-[#AAA49C]" />}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D6A66A]">Staff profile</div>
                <h1 className="mt-2 text-3xl font-black">{staff.name || party.display_name || staff.email || "My profile"}</h1>
                <div className="mt-2 text-sm text-[#8A847C]">{staff.position || staff.role || "Staff"}{staff.department ? ` · ${staff.department}` : ""}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={state.saving} className="flex h-11 items-center gap-2 rounded-xl border border-[#D6A66A]/30 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#76583A] disabled:opacity-40"><Camera className="h-4 w-4" /> {state.saving ? "Uploading" : "Change photo"}</button>
              <button onClick={load} disabled={state.loading} className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.14em] text-[#67615A]"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>
        </section>

        {state.error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-[#984C43]">{state.error}</div> : null}
        {state.message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-[#5E6D58]">{state.message}</div> : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[28px] border border-black/[0.075] bg-white p-5 shadow-[0_12px_32px_rgba(55,47,38,0.05)]">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]"><IdCard className="h-4 w-4" /> Verified identity</div>
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-black">{identity?.status === "VERIFIED" ? "Identity verified" : identity?.status === "PENDING" ? "Verification pending" : identity?.status === "REJECTED" ? "Verification rejected" : identity?.status === "EXPIRED" ? "Document expired" : activationBypass ? "Identity document optional" : "Identity document required"}</div>
                  <div className="mt-1 text-xs leading-5 text-[#817B73]">{identity?.documentType ? `${identity.documentType.replaceAll("_", " ")}${identity.documentNumberMasked ? ` · ${identity.documentNumberMasked}` : ""}` : activationBypass ? "Super admin access does not require a passport or government ID. You can add one voluntarily if this account also needs staff identity verification." : "Upload your passport or government ID. A manager must verify the actual document before clock-in is enabled."}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${identity?.status === "VERIFIED" ? "bg-emerald-100 text-[#5E6D58]" : identity?.status === "REJECTED" || identity?.status === "EXPIRED" ? "bg-red-50 text-[#984C43]" : "bg-amber-50 text-[#76583A]"}`}>{identity?.status || "MISSING"}</span>
              </div>
              {identity?.rejectedReason ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-[#984C43]">{identity.rejectedReason}</div> : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
              <select aria-label="Identity document type" value={identityType} onChange={(event) => setIdentityType(event.target.value)} className="h-12 rounded-2xl border border-black/[0.08] bg-white px-3 text-sm font-semibold outline-none">
                <option value="PASSPORT">Passport</option>
                <option value="NATIONAL_ID">National ID</option>
                <option value="GOVERNMENT_ID">Government ID</option>
              </select>
              <input ref={identityFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(event) => uploadIdentity(event.target.files?.[0])} />
              <button onClick={() => identityFileRef.current?.click()} disabled={securityBusy} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#171614] disabled:opacity-40"><UploadCloud className="h-4 w-4" /> {securityBusy ? "Working..." : identity?.status === "VERIFIED" ? "Replace identity document" : "Upload identity document"}</button>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#948E86]">The file is stored privately. Avantiqo does not expose the passport/ID number in the staff portal; only verification status and masked last characters are shown.</p>
          </article>

          <article className="rounded-[28px] border border-black/[0.075] bg-white p-5 shadow-[0_12px_32px_rgba(55,47,38,0.05)]">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> Work permit</div>
            <p className="mt-3 text-xs leading-5 text-[#817B73]">Optional. If a work permit applies to your employment, upload it here so Avantiqo can verify the legal employer and track the expiry date.</p>
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-black">{workPermit?.present ? "Work permit on file" : "No work permit provided"}</div>
                  <div className="mt-1 text-xs leading-5 text-[#817B73]">
                    {workPermit?.present
                      ? [workPermit.legalEntity?.legal_name || workPermit.legalEntity?.display_name || "Legal employer", workPermit.expiryDate ? "expires " + workPermit.expiryDate : null].filter(Boolean).join(" · ")
                      : "This does not block activation. Add a permit only when it applies to this employment."}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#76583A]">{workPermit?.status || "OPTIONAL"}</span>
              </div>
              {workPermit?.present ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Info label="Days until expiry" value={workPermit.daysUntilExpiry === null || workPermit.daysUntilExpiry === undefined ? "Not available" : String(workPermit.daysUntilExpiry)} />
                  <Info label="Compliance" value={workPermit.complianceStatus || "Pending review"} />
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#817B73]">
                Expiry date
                <input aria-label="Work permit expiry date" type="date" value={workPermitExpiry} onChange={(event) => setWorkPermitExpiry(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-black/[0.08] bg-white px-3 text-sm font-semibold outline-none" />
              </label>
              <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#817B73]">
                Permit number · optional
                <input aria-label="Work permit number" value={workPermitNumber} onChange={(event) => setWorkPermitNumber(event.target.value)} placeholder="Optional" className="mt-2 h-12 w-full rounded-2xl border border-black/[0.08] bg-white px-3 text-sm font-semibold outline-none" />
              </label>
            </div>
            <input ref={workPermitFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(event) => uploadWorkPermit(event.target.files?.[0])} />
            <button onClick={() => workPermitFileRef.current?.click()} disabled={securityBusy || !workPermitExpiry} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/30 bg-white px-4 text-xs font-black uppercase tracking-[0.12em] text-[#76583A] disabled:opacity-35"><UploadCloud className="h-4 w-4" /> {workPermit?.present ? "Replace work permit" : "Upload work permit"}</button>
          </article>

          <article className="rounded-[28px] border border-black/[0.075] bg-white p-5 shadow-[0_12px_32px_rgba(55,47,38,0.05)]">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]"><KeyRound className="h-4 w-4" /> Face ID / passkey</div>
            <p className="mt-3 text-xs leading-5 text-[#817B73]">Your phone can use Face ID or Touch ID to unlock a passkey tied to this verified staff account. The biometric template stays on your device; Avantiqo never stores your face or fingerprint.</p>
            {passkeyNotice ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-[#76583A]">{passkeyNotice}</div> : null}
            <div className="mt-4 space-y-2">
              {passkeys.length ? passkeys.map((passkey) => (
                <div key={passkey.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-sm font-black text-[#5E6D58]">{passkey.friendly_name || "Registered passkey"}</div>
                  <div className="mt-1 text-[10px] text-[#817B73]">{passkey.last_used_at ? `Last used ${new Date(passkey.last_used_at).toLocaleString()}` : "Registered · not verified on this device yet"}</div>
                </div>
              )) : <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-[#76583A]">No passkey is registered yet.</div>}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={registerPasskey} disabled={securityBusy || Boolean(passkeyNotice) || (!activationBypass && identity?.status !== "VERIFIED")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1B1A18] px-4 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-35"><KeyRound className="h-4 w-4" /> {passkeyNotice ? "Passkey unavailable" : activationBypass ? "Add optional passkey" : "Register passkey"}</button>
              <button onClick={testPasskey} disabled={securityBusy || Boolean(passkeyNotice) || passkeys.length === 0 || (!activationBypass && identity?.status !== "VERIFIED")} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-xs font-black uppercase tracking-[0.12em] text-[#5E5952] disabled:opacity-35"><TestTube2 className="h-4 w-4" /> Test Face ID</button>
            </div>
            {identity?.status !== "VERIFIED" ? <div className="mt-3 text-[10px] leading-4 text-[#948E86]">{activationBypass ? (passkeyNotice ? "Optional for super admin. Hosted passkeys must be enabled before one can be added; identity documents are not required for this account." : "Optional for super admin. A passkey can be added for stronger device security without uploading identity documents.") : "Verify your passport/ID first. Passkey enrollment is intentionally locked until employment identity is approved."}</div> : null}
          </article>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card icon={IdCard} title="Identity">
            <Info label="Name" value={staff.name || party.display_name || "Not recorded"} />
            <Info label="Email" value={staff.email || party.email || "Not recorded"} />
            <Info label="Phone" value={party.phone || "Not recorded"} />
            <Info label="Role" value={staff.role || "Not recorded"} />
            <Info label="Position" value={staff.position || "Not recorded"} />
            <Info label="Department" value={staff.department || "Not recorded"} />
          </Card>

          <Card icon={Building2} title="Employment">
            <Info label="Legal entity" value={employment.legal_entity?.name || "Not assigned"} />
            <Info label="Effective from" value={employment.effective_from || "Not recorded"} />
            <Info label="Effective to" value={employment.effective_to || "Current"} />
            <Info label="Business timezone" value={profile.timezone || "UTC"} />
          </Card>

          <Card icon={CreditCard} title="Compensation & payment">
            <Info label="Compensation" value={compensation(comp)} />
            <Info label="Payroll frequency" value={comp.payroll_frequency || staff.payroll_frequency || "Not recorded"} />
            <Info label="Bank" value={staff.bank_name || "Not recorded"} />
            <Info label="Bank account" value={staff.bank_account_masked || "Not recorded"} />
            <Info label="Tax ID" value={staff.tax_id_masked || "Not recorded"} />
          </Card>

          <Card icon={ShieldCheck} title="Account security">
            <Info label="Login email" value={staff.email || "Not recorded"} />
            <Info label="Portal identity" value={staff.auth_linked ? "Linked" : "Not linked"} />
            <p className="mt-4 text-xs leading-5 text-[#948E86]">Sensitive employment and payroll data is read only here. Changes that affect payroll, legal identity or employment terms remain governed management actions.</p>
          </Card>
        </section>
      </div>
    </main>
  );
}

function Card({ icon: Icon, title, children }) {
  return <article className="rounded-[28px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]"><Icon className="h-4 w-4" /> {title}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div></article>;
}

function Info({ label, value, mono = false }) {
  return <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-[#AAA49C]">{label}</div><div className={`mt-1 break-words text-sm text-[#4F4A43] ${mono ? "font-mono text-xs" : "font-semibold"}`}>{value}</div></div>;
}
