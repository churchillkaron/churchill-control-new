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

export default function EmailIntegrationCard({ organizationId }) {
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

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-4xl rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
        <a href={`/workspace/${org}/administration/integrations`} className="text-sm text-[#D6A66A]">← Integrations</a>
        <div className="mt-8 text-xs uppercase tracking-[0.22em] text-white/30">Communication</div>
        <h1 className="mt-2 text-4xl font-light">Connect Email</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
          Choose the business mailbox provider. Avantiqo handles OAuth where available and supports standard IMAP/SMTP accounts like a mail client.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a href={`/api/email/google/auth?organizationId=${org}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07]">
            <div className="font-medium">Google Workspace / Gmail</div>
            <div className="mt-2 text-xs leading-5 text-white/40">Sign in with Google and approve the mailbox.</div>
          </a>
          <a href={`/api/email/microsoft/auth?organizationId=${org}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07]">
            <div className="font-medium">Microsoft 365 / Outlook</div>
            <div className="mt-2 text-xs leading-5 text-white/40">Sign in with Microsoft and approve the mailbox.</div>
          </a>
          {Object.entries(PRESETS).map(([key, value]) => (
            <button key={key} type="button" onClick={() => selectManual(key)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left hover:bg-white/[0.07]">
              <div className="font-medium">{value.label}</div>
              <div className="mt-2 text-xs leading-5 text-white/40">{value.hint}</div>
            </button>
          ))}
        </div>

        {preset ? (
          <div className="mt-7 rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="text-lg font-medium">{preset.label}</div>
            <div className="mt-1 text-xs text-white/40">Avantiqo verifies incoming and outgoing access before saving this mailbox.</div>
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
            <label className="mt-4 block text-xs text-white/45">Outgoing security</label>
            <select value={form.smtpSecurity} onChange={(event) => setForm({ ...form, smtpSecurity: event.target.value })} className="mt-2 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none">
              <option value="TLS">TLS</option>
              <option value="STARTTLS">STARTTLS</option>
            </select>
            <button type="button" onClick={connectManual} disabled={busy || !form.email || !form.password || !form.imapHost || !form.smtpHost} className="mt-5 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">
              {busy ? "Verifying…" : "Connect mailbox"}
            </button>
          </div>
        ) : null}

        {message ? <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">{message}</div> : null}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-xs text-white/45">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none" />
    </label>
  );
}
