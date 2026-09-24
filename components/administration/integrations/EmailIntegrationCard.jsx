"use client";

import { useMemo, useState } from "react";

const PRESETS = {
  icloud: {
    label: "iCloud Mail",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecurity: "STARTTLS",
    hint: "Use an app-specific password from the Apple Account security settings.",
  },
  yahoo: {
    label: "Yahoo Mail",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecurity: "TLS",
    hint: "Use the mailbox password or an app password if Yahoo requires one.",
  },
  other: {
    label: "Other Mail Account",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "TLS",
    hint: "Enter the incoming IMAP and outgoing SMTP settings supplied by the email provider.",
  },
};

export default function EmailIntegrationCard({ organizationId, onboarding = false }) {
  const [manualType, setManualType] = useState(null);
  const preset = useMemo(() => PRESETS[manualType] || null, [manualType]);
  const [form, setForm] = useState({ email: "", username: "", password: "", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465, smtpSecurity: "TLS" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function selectManual(type) {
    const next = PRESETS[type];
    setManualType(type);
    setMessage("");
    setForm((current) => ({
      ...current,
      imapHost: next.imapHost,
      imapPort: next.imapPort,
      smtpHost: next.smtpHost,
      smtpPort: next.smtpPort,
      smtpSecurity: next.smtpSecurity,
    }));
  }

  async function connectManual() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/administration/integrations/email/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...form }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Mailbox connection failed");
      setMessage(`${data.mailbox?.email || "Mailbox"} connected.`);
      setForm((current) => ({ ...current, password: "" }));
    } catch (error) {
      setMessage(error?.message || "Mailbox connection failed");
    } finally {
      setBusy(false);
    }
  }

  const org = encodeURIComponent(organizationId);
  const onboardingQuery = onboarding ? "&onboarding=1" : "";
  const backHref = onboarding
    ? `/workspace/${org}/administration/communications-setup?onboarding=1`
    : `/workspace/${org}/administration/integrations`;

  const shell = onboarding ? "min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10" : "min-h-screen bg-[#F7F6F3] p-6 text-[#191919] lg:p-10";
  const panel = onboarding ? "mx-auto max-w-4xl rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8" : "mx-auto max-w-4xl rounded-[30px] border border-black/[0.08] bg-[#FBF8F3] p-6 lg:p-8";
  const option = onboarding ? "rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5 hover:bg-[#FBF5EC]" : "rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5 hover:bg-[#F7F6F3]";
  const muted = onboarding ? "text-[#817B73]" : "text-[#817A72]";

  if (onboarding) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
        <div className="mx-auto max-w-4xl">
          <a href={backHref} className="text-[9px] font-semibold text-[#8A633C]">← Communication setup</a>
          <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Communication</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Connect Email</h1>
            <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Choose the organization’s mailbox provider. OAuth is used where available; standard IMAP/SMTP mailboxes are verified before Avantiqo stores the connection.</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <a href={`/api/email/google/auth?organizationId=${org}${onboardingQuery}`} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5 transition hover:border-[#C9AD89] hover:bg-[#FBF5EC]">
                <div className="text-[11px] font-semibold">Google Workspace / Gmail</div>
                <div className="mt-2 text-[9px] leading-5 text-[#817B73]">Sign in with Google and authorize the business mailbox.</div>
              </a>
              <a href={`/api/email/microsoft/auth?organizationId=${org}${onboardingQuery}`} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5 transition hover:border-[#C9AD89] hover:bg-[#FBF5EC]">
                <div className="text-[11px] font-semibold">Microsoft 365 / Outlook</div>
                <div className="mt-2 text-[9px] leading-5 text-[#817B73]">Sign in with Microsoft and authorize the business mailbox.</div>
              </a>
              {Object.entries(PRESETS).map(([key, value]) => (
                <button key={key} type="button" onClick={() => selectManual(key)} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5 text-left transition hover:border-[#C9AD89] hover:bg-[#FBF5EC]">
                  <div className="text-[11px] font-semibold">{value.label}</div>
                  <div className="mt-2 text-[9px] leading-5 text-[#817B73]">{value.hint}</div>
                </button>
              ))}
            </div>

            {preset ? (
              <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
                <div className="text-[11px] font-semibold text-[#5C4731]">{preset.label}</div>
                <div className="mt-1 text-[9px] leading-4 text-[#817566]">Avantiqo verifies incoming and outgoing access before saving this mailbox.</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <LightField label="Email address" value={form.email} onChange={(value) => setForm({ ...form, email: value, username: form.username || value })} />
                  <LightField label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
                  <LightField label="Password / app password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
                  <div />
                  <LightField label="Incoming IMAP server" value={form.imapHost} onChange={(value) => setForm({ ...form, imapHost: value })} />
                  <LightField label="IMAP port" type="number" value={form.imapPort} onChange={(value) => setForm({ ...form, imapPort: Number(value) })} />
                  <LightField label="Outgoing SMTP server" value={form.smtpHost} onChange={(value) => setForm({ ...form, smtpHost: value })} />
                  <LightField label="SMTP port" type="number" value={form.smtpPort} onChange={(value) => setForm({ ...form, smtpPort: Number(value) })} />
                </div>
                <label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">Outgoing security</label>
                <select value={form.smtpSecurity} onChange={(event) => setForm({ ...form, smtpSecurity: event.target.value })} className="mt-2 h-10 rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] text-[#3D372F]">
                  <option value="TLS">TLS</option>
                  <option value="STARTTLS">STARTTLS</option>
                </select>
                <button type="button" onClick={connectManual} disabled={busy || !form.email || !form.password || !form.imapHost || !form.smtpHost} className="mt-4 h-10 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] disabled:opacity-35">{busy ? "Verifying…" : "Connect mailbox"}</button>
              </div>
            ) : null}

            {message ? <div className="mt-4 rounded-xl border border-[#C9AD89]/20 bg-[#FBF6EF] px-4 py-3 text-[10px] text-[#6E5942]">{message}</div> : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={shell}>
      <div className={panel}>
        <a href={backHref} className="text-sm text-[#D6A66A]">← {onboarding ? "Communication setup" : "Integrations"}</a>
        <div className={`mt-8 text-xs uppercase tracking-[0.22em] ${onboarding ? "text-[#A37849]" : "text-[#A19A92]"}`}>Communication</div>
        <h1 className={`mt-2 text-4xl font-light ${onboarding ? "text-[#2D2822]" : "text-[#191919]"}`}>Connect Email</h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${onboarding ? "text-[#777169]" : "text-[#746E66]"}`}>
          Choose the business mailbox provider. Avantiqo handles OAuth where available and supports standard IMAP/SMTP accounts like a mail client.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a href={`/api/email/google/auth?organizationId=${org}${onboardingQuery}`} className={option}>
            <div className="font-medium">Google Workspace / Gmail</div>
            <div className={`mt-2 text-xs leading-5 ${muted}`}>Sign in with Google and approve the mailbox.</div>
          </a>
          <a href={`/api/email/microsoft/auth?organizationId=${org}${onboardingQuery}`} className={option}>
            <div className="font-medium">Microsoft 365 / Outlook</div>
            <div className={`mt-2 text-xs leading-5 ${muted}`}>Sign in with Microsoft and approve the mailbox.</div>
          </a>
          {Object.entries(PRESETS).map(([key, value]) => (
            <button key={key} type="button" onClick={() => selectManual(key)} className={`${option} text-left`}>
              <div className="font-medium">{value.label}</div>
              <div className={`mt-2 text-xs leading-5 ${muted}`}>{value.hint}</div>
            </button>
          ))}
        </div>

        {preset ? (
          <div className="mt-7 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5">
            <div className="text-lg font-medium">{preset.label}</div>
            <div className="mt-1 text-xs text-[#817A72]">Avantiqo verifies incoming and outgoing access before saving this mailbox.</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Email address" value={form.email} onChange={(value) => setForm({ ...form, email: value, username: form.username || value })} />
              <Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
              <Field label="Password / app password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
              <div />
              <Field label="Incoming IMAP server" value={form.imapHost} onChange={(value) => setForm({ ...form, imapHost: value })} />
              <Field label="IMAP port" type="number" value={form.imapPort} onChange={(value) => setForm({ ...form, imapPort: Number(value) })} />
              <Field label="Outgoing SMTP server" value={form.smtpHost} onChange={(value) => setForm({ ...form, smtpHost: value })} />
              <Field label="SMTP port" type="number" value={form.smtpPort} onChange={(value) => setForm({ ...form, smtpPort: Number(value) })} />
            </div>
            <label className="mt-4 block text-xs text-[#746E66]">Outgoing security</label>
            <select value={form.smtpSecurity} onChange={(event) => setForm({ ...form, smtpSecurity: event.target.value })} className="mt-2 rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-4 py-3 text-sm text-[#191919] outline-none">
              <option value="TLS">TLS</option>
              <option value="STARTTLS">STARTTLS</option>
            </select>
            <button type="button" onClick={connectManual} disabled={busy || !form.email || !form.password || !form.imapHost || !form.smtpHost} className="mt-5 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">
              {busy ? "Verifying…" : "Connect mailbox"}
            </button>
          </div>
        ) : null}

        {message ? <div className="mt-5 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-3 text-sm text-[#5F5A54]">{message}</div> : null}
      </div>
    </main>
  );
}

function LightField({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold text-[#6C6258]">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] text-[#3D372F] outline-none focus:border-[#D6A66A]/70 focus:ring-2 focus:ring-[#D6A66A]/10" />
    </label>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-xs text-[#746E66]">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} className="mt-2 w-full rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-4 py-3 text-sm text-[#191919] outline-none" />
    </label>
  );
}
