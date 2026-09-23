"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, Building2, CheckCircle2, IdCard, KeyRound, MailCheck, MessageCircle, RefreshCw, ShieldCheck, Smartphone, UploadCloud } from "lucide-react";
import { supabaseClient } from "@/lib/shared/supabase/client";
import beginCentralPasskeyEnrollment, { beginCentralPasskeySignIn } from "@/lib/people/workforce/StaffPasskeyBrokerClient";

function Step({ icon: Icon, title, status, complete, children }) {
  return (
    <section className={`rounded-[26px] border bg-white p-5 shadow-[0_12px_34px_rgba(55,47,38,0.05)] ${complete ? "border-emerald-200" : "border-black/[0.07]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${complete ? "bg-emerald-50 text-[#5E6D58]" : "bg-[#F5F1EA] text-[#76583A]"}`}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0"><div className="text-sm font-black text-[#1B1A18]">{title}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#948E86]">{status}</div></div>
        </div>
        {complete ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#5E6D58]" /> : null}
      </div>
      {!complete ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export default function StaffActivationSetup({ activation, organizationId, organizations = [], onSwitchOrganization, onRefresh }) {
  const identityFileRef = useRef(null);
  const workPermitFileRef = useRef(null);
  const [identityType, setIdentityType] = useState("PASSPORT");
  const [workPermit, setWorkPermit] = useState(null);
  const [workPermitExpiry, setWorkPermitExpiry] = useState("");
  const [workPermitNumber, setWorkPermitNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [passkeyNotice, setPasskeyNotice] = useState("");
  const steps = activation?.steps || {};

  async function refresh(messageText = "") {
    setMessage(messageText);
    setError("");
    await onRefresh?.();
  }

  async function sendPhoneCode() {
    setBusy("phone-send"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/staff/phone-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phoneNumber.trim() || undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send verification code");
      setDelivery(payload);
      setMessage(payload.status === "ACCEPTED" && payload.channel === "WHATSAPP"
        ? "Verification request accepted by WhatsApp. Waiting for delivery confirmation."
        : `Verification code sent by ${payload.channel === "WHATSAPP" ? "WhatsApp" : "SMS"}.`);
    } catch (err) { setError(err?.message || "Unable to send verification code"); }
    finally { setBusy(""); }
  }

  async function verifyPhone() {
    setBusy("phone-verify"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/staff/phone-verification", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: otp, phone: phoneNumber.trim() || undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to verify phone");
      setOtp("");
      await refresh("Phone number verified.");
    } catch (err) { setError(err?.message || "Unable to verify phone"); }
    finally { setBusy(""); }
  }

  async function uploadIdentity(file) {
    if (!file) return;
    setBusy("identity"); setError(""); setMessage("");
    try {
      const body = new FormData(); body.append("file", file); body.append("documentType", identityType);
      const response = await fetch("/api/staff/identity-verification", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to upload identity document");
      await refresh("Identity document uploaded. A manager must verify it before setup can continue.");
    } catch (err) { setError(err?.message || "Unable to upload identity document"); }
    finally { setBusy(""); if (identityFileRef.current) identityFileRef.current.value = ""; }
  }

  async function loadWorkPermit() {
    try {
      const response = await fetch("/api/staff/work-permit", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.success) setWorkPermit(payload.workPermit || null);
    } catch {}
  }

  async function uploadWorkPermit(file) {
    if (!file) return;
    setBusy("work-permit"); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (workPermitExpiry) body.append("expiryDate", workPermitExpiry);
      if (workPermitNumber.trim()) body.append("permitNumber", workPermitNumber.trim());
      const response = await fetch("/api/staff/work-permit", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload work permit");
      setWorkPermit(payload.workPermit || null);
      setMessage("Work permit uploaded. This document is optional and does not block Staff Portal access.");
    } catch (err) {
      setError(err?.message || "Unable to upload work permit");
    } finally {
      setBusy("");
      if (workPermitFileRef.current) workPermitFileRef.current.value = "";
    }
  }

  useEffect(() => { loadWorkPermit(); }, []);

  useEffect(() => {
    let cancelled = false;
    supabaseClient.auth.passkey.list()
      .then(({ error: passkeyError }) => {
        if (cancelled) return;
        setPasskeyNotice(passkeyError?.message || "");
      })
      .catch((passkeyError) => {
        if (cancelled) return;
        setPasskeyNotice(passkeyError?.message || "Passkeys are unavailable on this browser or device.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (delivery?.channel !== "WHATSAPP" || delivery?.status !== "ACCEPTED") return undefined;

    let cancelled = false;
    let attempts = 0;
    let timer = null;

    async function pollDelivery() {
      attempts += 1;
      try {
        const response = await fetch("/api/staff/phone-verification", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success || cancelled) return;

        const challenge = payload.phone?.challenge || null;
        const deliveryStatus = String(challenge?.deliveryStatus || "").toUpperCase();
        const challengeStatus = String(challenge?.status || "").toUpperCase();

        if (deliveryStatus === "FAILED" || challengeStatus === "DELIVERY_FAILED") {
          setDelivery({
            channel: challenge?.deliveryChannel || "WHATSAPP",
            status: "FAILED",
            phoneMasked: challenge?.phoneMasked || delivery?.phoneMasked || null,
          });
          setMessage("");
          setError(challenge?.deliveryFailure || "WhatsApp could not deliver the verification code. Request a new code or contact your employer.");
          return;
        }

        if (["SENT", "DELIVERED", "READ"].includes(deliveryStatus)) {
          setDelivery({
            channel: challenge?.deliveryChannel || "WHATSAPP",
            status: deliveryStatus,
            phoneMasked: challenge?.phoneMasked || delivery?.phoneMasked || null,
          });
          setError("");
          setMessage(deliveryStatus === "SENT"
            ? "Verification code sent by WhatsApp."
            : "Verification code delivered by WhatsApp.");
          return;
        }

        if (["CANCELLED", "EXPIRED", "LOCKED", "VERIFIED"].includes(challengeStatus)) return;
      } catch {
        // Keep the setup usable if delivery-status polling is temporarily unavailable.
      }

      if (!cancelled && attempts < 15) timer = window.setTimeout(pollDelivery, 2000);
    }

    timer = window.setTimeout(pollDelivery, 1200);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [delivery?.channel, delivery?.phoneMasked, delivery?.status]);

  async function registerPasskey() {
    setBusy("passkey-register"); setError(""); setMessage("");
    try {
      await beginCentralPasskeyEnrollment({ returnPath: "/staff" });
    } catch (err) {
      setError(err?.message || "Unable to register passkey");
      setBusy("");
    }
  }

  async function testPasskey() {
    setBusy("passkey-test"); setError(""); setMessage("");
    try {
      await beginCentralPasskeySignIn({ returnPath: "/staff" });
    } catch (err) {
      setError(err?.message || "Passkey verification failed");
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] px-4 py-6 text-[#1B1A18] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 rounded-[30px] border border-black/[0.07] bg-white p-5 shadow-[0_16px_45px_rgba(55,47,38,0.06)] sm:p-7">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> Secure staff setup</div>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">Verify your identity before work access</h1>
          <p className="mt-2 text-sm leading-6 text-[#817B73]">Your email signs you in. Phone ownership, government ID and your device passkey must also be verified before Avantiqo unlocks the Staff Portal.</p>
          {organizations.length > 1 ? (
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-3">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#948E86]"><Building2 className="h-4 w-4" /> Workplace for this setup</div>
              <select
                aria-label="Setup organization"
                value={organizationId || ""}
                disabled={Boolean(busy)}
                onChange={async (event) => {
                  const next = event.target.value;
                  if (!next || next === organizationId) return;
                  setBusy("organization-switch"); setError(""); setMessage("");
                  try { await onSwitchOrganization?.(next); }
                  catch (err) { setError(err?.message || "Unable to switch organization"); setBusy(""); }
                }}
                className="mt-2 h-12 w-full rounded-2xl border border-black/[0.08] bg-white px-3 text-sm font-black text-[#1B1A18] outline-none"
              >
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name || "Organization"}</option>)}
              </select>
              <div className="mt-2 text-[10px] leading-4 text-[#948E86]">Phone, ID and work-permit verification are completed in the organization that employs you. You can switch only to organizations already linked to your staff account.</div>
            </div>
          ) : null}
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">{error}</div> : null}
        {message ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#5E6D58]">{message}</div> : null}

        <div className="space-y-3">
          <Step icon={MailCheck} title="Email login" status={steps.email?.status || "CHECKING"} complete={steps.email?.complete === true}>
            <p className="text-xs leading-5 text-[#817B73]">Confirm the email invitation/login sent through Supabase Auth before continuing.</p>
          </Step>

          <Step icon={Smartphone} title="Phone number" status={steps.phone?.status || "UNVERIFIED"} complete={steps.phone?.complete === true}>
            <p className="text-xs leading-5 text-[#817B73]">We verify the canonical staff phone. WhatsApp is used first; SMS is only a fallback when an SMS transport is configured.</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-black text-[#5E5952]"><MessageCircle className="h-4 w-4" /> {steps.phone?.phoneMasked || "International +country-code phone required"}</div>
            {!steps.phone?.phoneMasked ? <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/[^+\d]/g, "").slice(0, 16))} inputMode="tel" autoComplete="tel" placeholder="+66812345678" aria-label="International phone number" className="mt-4 h-12 w-full rounded-2xl border border-black/[0.08] bg-[#FCFBF9] px-4 text-sm font-bold outline-none" /> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <button onClick={sendPhoneCode} disabled={Boolean(busy) || (!steps.phone?.phoneMasked && !/^\+[1-9]\d{7,14}$/.test(phoneNumber))} className="h-12 rounded-2xl bg-[#D6A66A] px-4 text-xs font-black uppercase tracking-[0.1em] text-[#171614] disabled:opacity-40">{busy === "phone-send" ? "Sending..." : "Send code"}</button>
              <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="h-12 rounded-2xl border border-black/[0.08] bg-[#FCFBF9] px-4 text-center text-base font-black tracking-[0.25em] outline-none" />
              <button onClick={verifyPhone} disabled={Boolean(busy) || otp.length !== 6} className="h-12 rounded-2xl border border-black/[0.08] bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-[#5E5952] disabled:opacity-40">Verify</button>
            </div>
            {delivery?.channel ? <div className="mt-2 text-[10px] text-[#948E86]">Last delivery: {delivery.channel}{delivery.status ? ` · ${delivery.status}` : ""} · {delivery.phoneMasked}</div> : null}
          </Step>

          <Step icon={IdCard} title="Passport / government ID" status={steps.identity?.status || "MISSING"} complete={steps.identity?.complete === true}>
            <p className="text-xs leading-5 text-[#817B73]">Upload the real document. It stays private and a manager verifies it before work access is enabled.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
              <select value={identityType} onChange={(event) => setIdentityType(event.target.value)} className="h-12 rounded-2xl border border-black/[0.08] bg-white px-3 text-sm font-semibold outline-none"><option value="PASSPORT">Passport</option><option value="NATIONAL_ID">National ID</option><option value="GOVERNMENT_ID">Government ID</option></select>
              <input ref={identityFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(event) => uploadIdentity(event.target.files?.[0])} />
              <button onClick={() => identityFileRef.current?.click()} disabled={Boolean(busy)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1B1A18] px-4 text-xs font-black uppercase tracking-[0.1em] text-white disabled:opacity-40"><UploadCloud className="h-4 w-4" /> {busy === "identity" ? "Uploading..." : "Upload document"}</button>
            </div>
          </Step>

          <Step icon={KeyRound} title="Face ID / Touch ID passkey" status={passkeyNotice ? "SERVICE UNAVAILABLE" : (steps.passkey?.status || "NOT_ENROLLED")} complete={steps.passkey?.complete === true}>
            <p className="text-xs leading-5 text-[#817B73]">Your face/fingerprint stays on your phone. Avantiqo receives only the cryptographic passkey proof.</p>
            {passkeyNotice ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-[#76583A]">Passkey setup is temporarily unavailable for this Avantiqo environment. Your completed email, phone and identity checks remain saved. Your employer must enable hosted passkeys before Staff Portal activation can finish.</div> : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={registerPasskey} disabled={Boolean(busy) || Boolean(passkeyNotice) || steps.identity?.complete !== true} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 text-xs font-black uppercase tracking-[0.1em] text-[#171614] disabled:opacity-35"><KeyRound className="h-4 w-4" /> {passkeyNotice ? "Passkey unavailable" : "Register passkey"}</button>
              <button onClick={testPasskey} disabled={Boolean(busy) || Boolean(passkeyNotice) || steps.passkey?.enrolled !== true || steps.identity?.complete !== true} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-[#5E5952] disabled:opacity-35">Test Face ID</button>
            </div>
          </Step>
        </div>

        <section className="mt-4 rounded-[26px] border border-dashed border-[#D6A66A]/35 bg-[#FFFDF8] p-5 shadow-[0_10px_28px_rgba(55,47,38,0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F5F1EA] text-[#76583A]"><BriefcaseBusiness className="h-4 w-4" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><div className="text-sm font-black text-[#1B1A18]">Work permit</div><span className="rounded-full border border-[#D6A66A]/30 bg-[#D6A66A]/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#76583A]">Optional</span></div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#948E86]">{workPermit?.status || "NOT PROVIDED"}</div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#817B73]">Upload a work permit if it applies to your employment. The permit stays optional, but when uploaded Avantiqo binds it to your current legal employer and requires the expiry date so Compliance Intelligence can track it.</p>
          {workPermit?.legalEntity ? <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#948E86]">Legal employer</div><div className="mt-1 text-sm font-black text-[#1B1A18]">{workPermit.legalEntity.legal_name || workPermit.legalEntity.display_name || workPermit.legalEntity.id}</div>{workPermit.expiryDate ? <div className="mt-1 text-[10px] text-[#817B73]">Expires {workPermit.expiryDate}{workPermit.daysUntilExpiry != null ? ` · ${workPermit.daysUntilExpiry} days` : ""}</div> : null}</div> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input value={workPermitNumber} onChange={(event) => setWorkPermitNumber(event.target.value)} placeholder="Permit number (if available)" className="h-12 rounded-2xl border border-black/[0.08] bg-white px-3 text-sm outline-none" />
            <input type="date" value={workPermitExpiry} onChange={(event) => setWorkPermitExpiry(event.target.value)} aria-label="Work permit expiry date" className="h-12 rounded-2xl border border-black/[0.08] bg-white px-3 text-sm outline-none" />
          </div>
          <input ref={workPermitFileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(event) => uploadWorkPermit(event.target.files?.[0])} />
          <button onClick={() => workPermitFileRef.current?.click()} disabled={Boolean(busy) || !workPermitExpiry} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/30 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-[#76583A] disabled:opacity-40"><UploadCloud className="h-4 w-4" /> {busy === "work-permit" ? "Uploading..." : workPermit?.present ? "Replace work permit" : "Upload work permit"}</button>
          <div className="mt-2 text-[10px] leading-4 text-[#948E86]">Expiry is required only when a work permit is uploaded. Avantiqo starts renewal monitoring 60 days before expiry.</div>
        </section>

        <button onClick={() => onRefresh?.()} disabled={Boolean(busy)} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white text-xs font-black uppercase tracking-[0.12em] text-[#5E5952]"><RefreshCw className="h-4 w-4" /> Check setup status</button>
      </div>
    </main>
  );
}
