"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ServerCog } from "lucide-react";

const text = (value) => String(value ?? "").trim();

async function postActivation(payload) {
  const response = await fetch("/api/finance/provider-activation", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || "Provider activation failed");
  return body;
}

export default function FinanceProviderActivationForm({
  mode,
  organizationId,
  onActivated,
  compact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [bank, setBank] = useState({
    environment: "sandbox",
    baseUrl: "https://statement.sandbox.bnk.to",
    apiKey: "",
  });
  const [etax, setEtax] = useState({
    providerCode: "netbay_invoicechain",
    senderIdentifier: "",
    baseUrl: "",
    uploadPath: "",
    statusPath: "",
    authPath: "",
    healthPath: "",
    apiKey: "",
    accessToken: "",
    username: "",
    password: "",
    serverKey: "",
    apiKeyHeader: "x-api-key",
    serverKeyHeader: "x-server-key",
    authScheme: "Bearer",
  });

  const isBank = mode === "bank";
  const canSubmit = useMemo(() => {
    if (isBank) return Boolean(text(bank.apiKey) && /^https:\/\//i.test(text(bank.baseUrl)));
    const hasAuth = Boolean(text(etax.apiKey) || text(etax.accessToken) || (text(etax.username) && text(etax.password)));
    return Boolean(
      text(etax.senderIdentifier) &&
      /^https:\/\//i.test(text(etax.baseUrl)) &&
      text(etax.uploadPath) &&
      text(etax.statusPath) &&
      hasAuth
    );
  }, [isBank, bank, etax]);

  async function submit(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      setDone("");
      const payload = isBank
        ? {
            organizationId,
            action: "activate_bank_feed",
            environment: bank.environment,
            baseUrl: bank.baseUrl,
            apiKey: bank.apiKey,
          }
        : {
            organizationId,
            action: "activate_etax",
            ...etax,
          };
      const result = await postActivation(payload);
      setDone(isBank
        ? "Brankas credential secured in Vault. Bank connection is ready for consent."
        : "Certified e-Tax provider secured in Vault and the Thailand profile is active.");
      if (isBank) setBank((current) => ({ ...current, apiKey: "" }));
      else setEtax((current) => ({
        ...current,
        apiKey: "",
        accessToken: "",
        password: "",
        serverKey: "",
      }));
      await onActivated?.(result);
    } catch (candidate) {
      setError(candidate?.message || "Provider activation failed");
    } finally {
      setBusy(false);
    }
  }

  if (isBank) {
    return (
      <form onSubmit={submit} className={compact ? "mt-2 space-y-2" : "mt-3 space-y-2.5 rounded-xl border border-black/[0.06] bg-white p-3"}>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold text-[#514B44]"><KeyRound size={11}/>Install Brankas credential</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[8px] font-medium text-[#716B63]">Environment
            <select
              value={bank.environment}
              onChange={(event) => {
                const environment = event.target.value;
                setBank((current) => ({
                  ...current,
                  environment,
                  baseUrl: environment === "sandbox" ? "https://statement.sandbox.bnk.to" : "",
                }));
              }}
              className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]"
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label className="text-[8px] font-medium text-[#716B63]">Provider API base URL
            <input
              value={bank.baseUrl}
              onChange={(event) => setBank((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://..."
              className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"
            />
          </label>
        </div>
        <label className="block text-[8px] font-medium text-[#716B63]">Brankas API key
          <input
            type="password"
            autoComplete="new-password"
            value={bank.apiKey}
            onChange={(event) => setBank((current) => ({ ...current, apiKey: event.target.value }))}
            placeholder="Stored only in Supabase Vault"
            className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"
          />
        </label>
        <div className="text-[8px] leading-4 text-[#918B83]">The key is sent only to the authenticated Finance activation endpoint and persisted as a Vault secret reference. It is never returned by the Finance API.</div>
        <button type="submit" disabled={busy || !canSubmit} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-35">
          {busy ? <LoaderCircle size={10} className="animate-spin"/> : <KeyRound size={10}/>}
          {busy ? "Securing…" : "Secure credential"}
        </button>
        {error ? <div className="rounded-lg border border-red-700/15 bg-red-50 p-2 text-[8px] text-red-800">{error}</div> : null}
        {done ? <div className="flex items-start gap-1.5 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2 text-[8px] text-emerald-800"><CheckCircle2 size={10} className="mt-0.5 shrink-0"/>{done}</div> : null}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? "mt-2 space-y-2" : "mt-3 space-y-2.5 rounded-xl border border-black/[0.06] bg-white p-3"}>
      <div className="flex items-center gap-1.5 text-[9px] font-semibold text-[#514B44]"><ServerCog size={11}/>Certified Thailand e-Tax provider</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[8px] font-medium text-[#716B63]">Certified provider
          <select value={etax.providerCode} onChange={(e) => setEtax((f) => ({ ...f, providerCode: e.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]">
            <option value="netbay_invoicechain">Netbay InvoiceChain</option>
            <option value="inet_etax">INET One E-Tax</option>
            <option value="certified_etax_rest">Other certified REST provider</option>
          </select>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Registered sender identifier
          <input value={etax.senderIdentifier} onChange={(e) => setEtax((f) => ({ ...f, senderIdentifier: e.target.value }))} placeholder="Tax / participant identifier" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Provider base URL
          <input value={etax.baseUrl} onChange={(e) => setEtax((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://provider.example" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Upload path
          <input value={etax.uploadPath} onChange={(e) => setEtax((f) => ({ ...f, uploadPath: e.target.value }))} placeholder="/api/invoices" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63] sm:col-span-2">Status path
          <input value={etax.statusPath} onChange={(e) => setEtax((f) => ({ ...f, statusPath: e.target.value }))} placeholder="/api/invoices/{{tracking_id}}" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[8px] font-medium text-[#716B63]">API key
          <input type="password" autoComplete="new-password" value={etax.apiKey} onChange={(e) => setEtax((f) => ({ ...f, apiKey: e.target.value }))} placeholder="Optional if using token/login" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Access token
          <input type="password" autoComplete="new-password" value={etax.accessToken} onChange={(e) => setEtax((f) => ({ ...f, accessToken: e.target.value }))} placeholder="Optional" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Username
          <input autoComplete="off" value={etax.username} onChange={(e) => setEtax((f) => ({ ...f, username: e.target.value }))} placeholder="Optional login flow" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Password
          <input type="password" autoComplete="new-password" value={etax.password} onChange={(e) => setEtax((f) => ({ ...f, password: e.target.value }))} placeholder="Optional login flow" className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] px-2 text-[9px]"/>
        </label>
      </div>

      <button type="button" onClick={() => setExpanded((value) => !value)} className="text-[8px] font-semibold text-[#76583A]">
        {expanded ? "Hide advanced provider settings" : "Advanced provider settings"}
      </button>
      {expanded ? <div className="grid gap-2 rounded-lg bg-[#F8F6F2] p-2 sm:grid-cols-2">
        <label className="text-[8px] font-medium text-[#716B63]">Auth path
          <input value={etax.authPath} onChange={(e) => setEtax((f) => ({ ...f, authPath: e.target.value }))} placeholder="/oauth/token" className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Read-only health path
          <input value={etax.healthPath} onChange={(e) => setEtax((f) => ({ ...f, healthPath: e.target.value }))} placeholder="/health or /api/status" className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Server key
          <input type="password" autoComplete="new-password" value={etax.serverKey} onChange={(e) => setEtax((f) => ({ ...f, serverKey: e.target.value }))} placeholder="Stored in Vault" className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">API key header
          <input value={etax.apiKeyHeader} onChange={(e) => setEtax((f) => ({ ...f, apiKeyHeader: e.target.value }))} className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px]"/>
        </label>
        <label className="text-[8px] font-medium text-[#716B63]">Server key header
          <input value={etax.serverKeyHeader} onChange={(e) => setEtax((f) => ({ ...f, serverKeyHeader: e.target.value }))} className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px]"/>
        </label>
      </div> : null}

      <div className="text-[8px] leading-4 text-[#918B83]">Authentication secrets are persisted only inside Supabase Vault. Endpoint paths and header names remain non-secret provider configuration.</div>
      <button type="submit" disabled={busy || !canSubmit} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-35">
        {busy ? <LoaderCircle size={10} className="animate-spin"/> : <KeyRound size={10}/>}
        {busy ? "Securing…" : "Activate e-Tax provider"}
      </button>
      {error ? <div className="rounded-lg border border-red-700/15 bg-red-50 p-2 text-[8px] text-red-800">{error}</div> : null}
      {done ? <div className="flex items-start gap-1.5 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2 text-[8px] text-emerald-800"><CheckCircle2 size={10} className="mt-0.5 shrink-0"/>{done}</div> : null}
    </form>
  );
}
