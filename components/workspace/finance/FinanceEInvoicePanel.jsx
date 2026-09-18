"use client";

import { useEffect, useState } from "react";
import { CircleAlert, FileCheck2, RefreshCw, Send, Settings2 } from "lucide-react";
import FinanceProviderActivationForm from "@/components/workspace/finance/FinanceProviderActivationForm";

const text = (value) => String(value ?? "").trim();
const label = (value) => text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortTime = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";

export default function FinanceEInvoicePanel({ invoice, organizationId, entityId }) {
  const [state, setState] = useState({ loading: false, error: "", data: null });
  const [busy, setBusy] = useState("");
  const invoiceId = invoice?.id;

  async function load() {
    if (!invoiceId || !organizationId || !entityId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL(`/api/finance/customer-invoices/${encodeURIComponent(invoiceId)}/e-invoice`, window.location.origin);
      url.searchParams.set("organizationId", organizationId); url.searchParams.set("entityId", entityId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load e-Invoice readiness");
      setState({ loading: false, error: "", data: body });
    } catch (error) { setState({ loading: false, error: error?.message || "Unable to load e-Invoice readiness", data: null }); }
  }
  useEffect(() => { load(); }, [invoiceId, organizationId, entityId]);

  async function action(actionName, transmissionId = null) {
    try {
      setBusy(actionName); setState((current) => ({ ...current, error: "" }));
      const response = await fetch(`/api/finance/customer-invoices/${encodeURIComponent(invoiceId)}/e-invoice`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, action: actionName, transmissionId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "e-Invoice action failed");
      await load();
    } catch (error) { setState((current) => ({ ...current, error: error?.message || "e-Invoice action failed" })); }
    finally { setBusy(""); }
  }

  async function verifyProvider() {
    try {
      setBusy("verify_provider"); setState((current) => ({ ...current, error: "" }));
      const response = await fetch("/api/finance/provider-activation", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "verify_etax" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "e-Tax provider verification failed");
      await load();
      if (body?.verification?.verified === false) setState((current) => ({ ...current, error: body.verification.reason || "Provider is configured but does not expose a non-mutating verification endpoint." }));
    } catch (error) { setState((current) => ({ ...current, error: error?.message || "e-Tax provider verification failed" })); await load(); }
    finally { setBusy(""); }
  }

  const data = state.data;
  const latest = data?.transmissions?.[0] || null;
  const terminal = ["ACCEPTED", "REJECTED"].includes(text(latest?.status).toUpperCase());
  const needsStatus = latest?.provider_tracking_id && !terminal;
  const hasProfileBlocker = (data?.blockers || []).some((row) => /PROFILE|PROVIDER/.test(row.code || ""));

  return <section className="mb-4 rounded-xl border border-[#A37849]/15 bg-[#FBF8F3] p-3.5">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9A7045]"><FileCheck2 size={11}/>Thailand e-Tax</div><div className="mt-1 text-[12px] font-semibold text-[#3E3933]">Electronic invoice lifecycle</div><div className="mt-0.5 text-[9px] text-[#817B73]">ETDA source data → certified provider → authority response</div></div>{latest ? <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[8px] font-semibold">{label(latest.status)}</span> : null}</div>
    {state.loading ? <div className="mt-3 flex items-center gap-2 text-[9px] text-[#817B73]"><RefreshCw size={11} className="animate-spin"/>Checking e-Tax readiness…</div> : null}
    {data && !data.ready ? <div className="mt-3 space-y-1.5">{(data.blockers || []).slice(0, 8).map((row) => <div key={`${row.code}-${row.field || ""}`} className="flex gap-2 rounded-lg border border-amber-700/15 bg-amber-50 p-2 text-[8px] leading-4 text-amber-900"><CircleAlert size={10} className="mt-0.5 shrink-0"/><span>{row.message || label(row.code)}</span></div>)}</div> : null}
    {data?.setting ? <div className="mt-3 rounded-lg border border-black/[0.05] bg-white p-2.5 text-[8px]"><div className="text-[#999188]">Provider connection</div><div className="mt-0.5 font-semibold text-[#514B44]">{label(data.setting.provider_status || (data.credential_ready ? "Configured unverified" : "Not configured"))}</div><div className="mt-0.5 text-[#999188]">{data.setting.last_verified_at ? `Verified ${shortTime(data.setting.last_verified_at)}` : "No successful verification yet"}</div>{data.setting.last_error_message ? <div className="mt-1 text-amber-800">{data.setting.last_error_message}</div> : null}</div> : null}
    {latest ? <div className="mt-3 grid grid-cols-2 gap-2 text-[8px]"><div className="rounded-lg border border-black/[0.05] bg-white p-2"><div className="text-[#999188]">Provider reference</div><div className="mt-0.5 font-semibold break-all">{latest.provider_reference || latest.provider_tracking_id || "—"}</div></div><div className="rounded-lg border border-black/[0.05] bg-white p-2"><div className="text-[#999188]">Authority reference</div><div className="mt-0.5 font-semibold break-all">{latest.authority_reference || "—"}</div></div><div className="col-span-2 rounded-lg border border-black/[0.05] bg-white p-2"><div className="text-[#999188]">Last update</div><div className="mt-0.5 font-semibold">{shortTime(latest.updated_at)}</div>{latest.provider_status_message ? <div className="mt-1 text-[#817B73]">{latest.provider_status_message}</div> : null}</div></div> : null}
    {state.error ? <div className="mt-2 rounded-lg border border-red-700/15 bg-red-50 p-2 text-[8px] text-red-800">{state.error}</div> : null}
    <div className="mt-3 flex flex-wrap gap-2">{data?.credential_ready ? <button type="button" disabled={Boolean(busy)} onClick={verifyProvider} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold"><RefreshCw size={10} className={busy === "verify_provider" ? "animate-spin" : ""}/>{busy === "verify_provider" ? "Testing…" : "Test provider"}</button> : null}{data?.ready && (!latest || ["FAILED"].includes(text(latest.status).toUpperCase())) ? <button type="button" disabled={Boolean(busy)} onClick={() => action("submit")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-40"><Send size={10}/>{busy === "submit" ? "Submitting…" : latest ? "Retry transmission" : "Submit e-Tax"}</button> : null}{needsStatus ? <button type="button" disabled={Boolean(busy)} onClick={() => action("status", latest.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold"><RefreshCw size={10} className={busy === "status" ? "animate-spin" : ""}/>Check status</button> : null}{hasProfileBlocker ? <button type="button" onClick={() => window.open(`/workspace/${organizationId}/finance/e-invoicing?create=1`, "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-white px-3 text-[8px] font-semibold text-[#76583A]"><Settings2 size={10}/>Configure e-Invoicing</button> : null}</div>
    {hasProfileBlocker ? <FinanceProviderActivationForm mode="etax" organizationId={organizationId} onActivated={load} /> : null}
  </section>;
}
