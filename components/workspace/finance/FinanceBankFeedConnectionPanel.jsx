"use client";

import { useState } from "react";
import { CircleAlert, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import FinanceProviderActivationForm from "@/components/workspace/finance/FinanceProviderActivationForm";

function text(value) { return String(value ?? "").trim(); }
function label(value) { return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dateTime(value) { if (!value) return "Never"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(parsed); }

export default function FinanceBankFeedConnectionPanel({ connection, organizationId, onRefresh }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  if (!connection || String(connection.connection_type || "").toUpperCase() !== "TRANSACTION_FEED") return null;

  const providerReady = connection.provider_ready === true;
  const active = String(connection.status || "").toUpperCase() === "ACTIVE";
  const hasConsent = Boolean(connection.external_connection_id);

  async function connect() {
    try {
      setBusy("connect"); setError(""); setResult(null);
      const response = await fetch(`/api/finance/banking-integrations/${encodeURIComponent(connection.id)}/consent`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to start bank connection");
      if (!body?.redirect_url) throw new Error("Bank provider did not return a consent URL");
      window.location.assign(body.redirect_url);
    } catch (e) { setError(e?.message || "Unable to start bank connection"); setBusy(""); }
  }

  async function syncNow() {
    try {
      setBusy("sync"); setError(""); setResult(null);
      const response = await fetch(`/api/finance/banking-integrations/${encodeURIComponent(connection.id)}/sync`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Bank feed sync failed");
      setResult(body); await onRefresh?.();
    } catch (e) { setError(e?.message || "Bank feed sync failed"); }
    finally { setBusy(""); }
  }

  return (
    <section className="mb-4 rounded-xl border border-[#A37849]/15 bg-[#FBF8F3] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9A7045]"><Link2 size={11} />Live bank feed</div>
          <div className="mt-1 text-[12px] font-semibold text-[#3E3933]">{connection.provider_display_name || label(connection.provider_name || "Managed provider")}</div>
          <div className="mt-0.5 text-[9px] text-[#817B73]">{connection.bank_name || connection.bank_account_name || "Bank account"}{connection.provider_country_code ? ` · ${connection.provider_country_code}` : ""}</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${active ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : providerReady ? "border-amber-700/15 bg-amber-50 text-amber-800" : "border-red-700/15 bg-red-50 text-red-800"}`}>{label(connection.status || "Pending")}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
        <div className="rounded-lg border border-black/[0.05] bg-white px-2.5 py-2"><div className="text-[#999188]">Sync health</div><div className="mt-0.5 font-semibold text-[#514B44]">{label(connection.sync_status || "Never synced")}</div></div>
        <div className="rounded-lg border border-black/[0.05] bg-white px-2.5 py-2"><div className="text-[#999188]">Last sync</div><div className="mt-0.5 font-semibold text-[#514B44]">{dateTime(connection.last_sync_completed_at || connection.last_sync_at)}</div></div>
      </div>

      {!providerReady ? (
        <div className="mt-3"><div className="flex gap-2 rounded-lg border border-amber-700/15 bg-amber-50 p-2.5 text-[9px] leading-4 text-amber-900"><CircleAlert size={12} className="mt-0.5 shrink-0" /><div><b>Provider credential required.</b> The connection is prepared, but Avantiqo cannot send the customer to bank consent until the managed provider credential is installed.</div></div><FinanceProviderActivationForm mode="bank" organizationId={organizationId} onActivated={onRefresh} /></div>
      ) : !hasConsent || !active ? (
        <div className="mt-3"><button type="button" onClick={connect} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><ShieldCheck size={11} />{busy === "connect" ? "Opening bank…" : hasConsent ? "Reconnect bank" : "Connect bank"}</button></div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={syncNow} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><RefreshCw size={11} className={busy === "sync" ? "animate-spin" : ""} />{busy === "sync" ? "Syncing…" : "Sync now"}</button><span className="text-[8px] text-[#918B83]">Only unseen provider transactions are imported.</span></div>
      )}

      {connection.last_error_message ? <div className="mt-2 rounded-lg border border-red-700/15 bg-red-50 p-2 text-[8px] leading-4 text-red-800">{connection.last_error_message}</div> : null}
      {error ? <div className="mt-2 rounded-lg border border-red-700/15 bg-red-50 p-2 text-[8px] leading-4 text-red-800">{error}</div> : null}
      {result?.sync_run ? <div className="mt-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2 text-[8px] leading-4 text-emerald-800">Sync {label(result.sync_run.status)} · {result.sync_run.imported_transaction_count || 0} new · {result.sync_run.duplicate_transaction_count || 0} already known.</div> : null}
    </section>
  );
}
