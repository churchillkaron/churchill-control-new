"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  FileWarning,
  Mail,
  Phone,
  ShieldCheck,
  Upload,
} from "lucide-react";

const TYPE_LABELS = Object.freeze({
  passport: "Passport",
  national_id: "National ID",
  work_permit: "Work permit",
});

function dateOnly(value) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function expiryCopy(document) {
  const expiry = document?.expiry;
  if (!document) return "Not uploaded";
  if (!expiry || expiry.state === "NO_EXPIRY") return "No expiry recorded";
  if (expiry.state === "EXPIRED") {
    return `Expired ${Math.abs(Number(expiry.days_remaining || 0))} days ago`;
  }
  if (expiry.state === "VALID") {
    return `Valid · ${expiry.days_remaining} days remaining`;
  }
  return `Expires in ${expiry.days_remaining} days`;
}

function documentTone(document) {
  if (!document) return "border-white/[0.08] bg-white/[0.03]";
  const state = document.expiry?.state;
  if (state === "EXPIRED" || state === "EXPIRING_7") {
    return "border-red-400/20 bg-red-400/[0.07]";
  }
  if (["EXPIRING_14", "EXPIRING_30"].includes(state)) {
    return "border-amber-300/20 bg-amber-300/[0.06]";
  }
  if (["EXPIRING_60", "EXPIRING_90"].includes(state)) {
    return "border-[#D6A66A]/20 bg-[#D6A66A]/[0.06]";
  }
  return "border-emerald-400/15 bg-emerald-400/[0.04]";
}

export default function StaffIdentitySecurityCard() {
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({
    document_type: "passport",
    document_number: "",
    effective_date: "",
    expiry_date: "",
    file: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/identity-documents", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load identity security");
      }
      setIdentity(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load identity security");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const documents = useMemo(() => {
    const source = identity?.documents || {};
    return [
      ["passport", "Passport", source.passport],
      ["national_id", "National ID", source.national_id],
      ["work_permit", "Work permit", source.work_permit],
    ];
  }, [identity]);

  async function uploadDocument() {
    if (!form.file) {
      setError("Choose a passport, ID or work-permit image/PDF first.");
      return;
    }
    if (
      ["passport", "work_permit"].includes(form.document_type) &&
      !form.expiry_date
    ) {
      setError("Passport and work permit require an expiry date.");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("document_type", form.document_type);
      body.set("document_number", form.document_number || "");
      body.set("effective_date", form.effective_date || "");
      body.set("expiry_date", form.expiry_date || "");
      body.set("file", form.file);

      const response = await fetch("/api/staff/identity-documents", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to upload identity document");
      }

      setMessage(
        `${TYPE_LABELS[form.document_type]} uploaded securely for owner/HR verification.`,
      );
      setForm({
        document_type: form.document_type,
        document_number: "",
        effective_date: "",
        expiry_date: "",
        file: null,
      });
      setShowUpload(false);
      await load();
    } catch (uploadError) {
      setError(uploadError?.message || "Unable to upload identity document");
    } finally {
      setWorking(false);
    }
  }

  const attention = identity?.documents?.attention || [];

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">
            <ShieldCheck className="h-4 w-4" /> Identity & Security
          </div>
          <h2 className="mt-2 text-xl font-black">Your verified staff identity</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
            Login verification, private identity documents, legal-employer binding and expiry tracking remain connected to the same staff record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload((value) => !value)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-[#E8C18C]"
        >
          <Upload className="h-4 w-4" />
          {showUpload ? "Close upload" : "Upload / replace"}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["Private by default","Passport, ID and work-permit files stay in restricted document storage — not public links."],
          ["Owner / HR review","New or replacement identity evidence stays pending until an authorized reviewer verifies it."],
          ["Expiry stays visible","The page keeps showing remaining validity or an expiry warning from the stored document date."],
        ].map(([title,copy])=><div key={title} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#D6A66A]">{title}</div>
          <div className="mt-1 text-[10px] leading-5 text-white/35">{copy}</div>
        </div>)}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.08] p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">
          Loading identity security...
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SecuritySignal
              icon={Mail}
              label="Email"
              value={identity?.security?.email || "Not configured"}
              verified={identity?.security?.email_verified}
            />
            <SecuritySignal
              icon={Phone}
              label="Phone"
              value={identity?.security?.phone || "Not configured"}
              verified={identity?.security?.phone_verified}
            />
            <SecuritySignal
              icon={BadgeCheck}
              label="Staff identity"
              value={identity?.security?.staff_id ? "Bound" : "Missing"}
              verified={Boolean(identity?.security?.staff_id)}
            />
            <SecuritySignal
              icon={ShieldCheck}
              label="Legal entity"
              value={identity?.security?.legal_entity_id ? "Bound" : "Not configured"}
              verified={Boolean(identity?.security?.legal_entity_id)}
            />
          </div>

          {attention.length ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-black text-amber-100">
                <CalendarClock className="h-4 w-4" /> Identity attention
              </div>
              <div className="mt-2 space-y-1 text-xs text-amber-100/70">
                {attention.map((item) => (
                  <div key={item.key}>
                    {item.label}: {attentionLabel(item)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {documents.map(([key, label, entry]) => (
              <IdentityDocumentStatus key={key} label={label} entry={entry} />
            ))}
          </div>
        </>
      )}

      {showUpload ? (
        <div className="mt-5 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.045] p-4">
          <div className="text-sm font-black">Secure identity document upload</div>
          <div className="mt-1 text-xs leading-5 text-white/40">
            Files go to private controlled-document storage. A new upload does not silently replace the current verified document; owner/HR reviews it first.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label>
              <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                Document type
              </div>
              <select
                value={form.document_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    document_type: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
              >
                <option value="passport">Passport</option>
                <option value="national_id">National ID</option>
                <option value="work_permit">Work permit</option>
              </select>
            </label>

            <label>
              <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                Document number
              </div>
              <input
                value={form.document_number}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    document_number: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
              />
            </label>

            <label>
              <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                Effective date
              </div>
              <input
                type="date"
                value={form.effective_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    effective_date: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
              />
            </label>

            <label>
              <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                Expiry date
              </div>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiry_date: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
              />
            </label>

            <label>
              <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                Image / PDF
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                  }))
                }
                className="block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-[0.1em] file:text-white/65"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] leading-5 text-white/30">
              Work permit is optional, but when uploaded it is automatically bound to your current legal employer.
            </div>
            <button
              type="button"
              onClick={uploadDocument}
              disabled={working || !form.file}
              className="rounded-xl bg-[#D6A66A] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
            >
              {working ? "Uploading..." : "Upload securely"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SecuritySignal({ icon: Icon, label, value, verified }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">{label}</div>
        <Icon className={`h-4 w-4 ${verified ? "text-emerald-300" : "text-amber-200"}`} />
      </div>
      <div className="mt-2 truncate text-sm font-black">{value}</div>
      <div className={`mt-1 text-[9px] font-black uppercase tracking-[0.12em] ${verified ? "text-emerald-200/70" : "text-amber-200/70"}`}>
        {verified ? "Verified" : "Verification required"}
      </div>
    </div>
  );
}

function IdentityDocumentStatus({ label, entry }) {
  const document = entry?.verified || entry?.current || null;
  const pending = entry?.pending_replacement || (
    entry?.current?.verification === "PENDING" ? entry.current : null
  );

  return (
    <div className={`rounded-[22px] border p-4 ${documentTone(document)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
          <div className="mt-2 text-sm font-black">
            {document
              ? document.verification === "VERIFIED"
                ? "Verified"
                : "Pending verification"
              : entry?.required
                ? "Missing"
                : "Optional"}
          </div>
        </div>
        {document?.verification === "VERIFIED" ? (
          <BadgeCheck className="h-5 w-5 text-emerald-300" />
        ) : (
          <FileWarning className="h-5 w-5 text-amber-200/70" />
        )}
      </div>

      <div className="mt-3 text-xs font-semibold text-white/55">
        {expiryCopy(document)}
      </div>
      {document?.expiry_date ? (
        <div className="mt-1 text-[9px] text-white/30">
          Expiry {dateOnly(document.expiry_date)}
        </div>
      ) : null}
      {document?.document_number ? (
        <div className="mt-1 text-[9px] text-white/30">
          No. {document.document_number}
        </div>
      ) : null}

      {pending && pending.id !== entry?.verified?.id ? (
        <div className="mt-3 rounded-xl border border-[#D6A66A]/20 bg-black/20 p-3 text-[9px] text-[#E8C18C]">
          Replacement uploaded · waiting for owner/HR verification.
        </div>
      ) : null}
    </div>
  );
}

function attentionLabel(item) {
  if (item.state === "MISSING") return "document missing";
  if (item.state === "PENDING_VERIFICATION") return "waiting for owner/HR verification";
  if (item.state === "EXPIRED") {
    return `expired ${Math.abs(Number(item.days_remaining || 0))} days ago`;
  }
  if (Number(item.days_remaining) >= 0) {
    return `expires in ${item.days_remaining} days`;
  }
  return item.state;
}
