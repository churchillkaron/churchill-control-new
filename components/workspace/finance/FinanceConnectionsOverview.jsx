"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, CircleAlert, FileCheck2, Mail, RefreshCw, ShieldCheck } from "lucide-react";

const text = (value) => String(value ?? "").trim();
const label = (value) => text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortTime = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";

function tone(status) {
  const value = text(status).toUpperCase();
  if (value === "VERIFIED" || value === "READY") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (value === "VERIFICATION_FAILED" || value === "FAILED") return "border-red-700/15 bg-red-50 text-red-800";
  if (value === "NOT_CONFIGURED") return "border-black/[0.07] bg-[#F7F5F1] text-[#817B73]";
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

function ConnectionCard({ icon: Icon, title, description, status, detail, history = [], href, actionLabel, onVerify, busy }) {
  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-[#F5F0E9] p-2 text-[#8A633C]"><Icon size={14}/></div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[#403C37]">{title}</div>
            <div className="mt-0.5 text-[9px] leading-4 text-[#918B83]">{description}</div>
          </div>
        </div>
        <span className={"shrink-0 rounded-full border px-2 py-1 text-[8px] font-semibold " + tone(status)}>{label(status || "Not configured")}</span>
      </div>
      <div className="mt-3 min-h-8 text-[8px] leading-4 text-[#817B73]">{detail || "No provider connection has been configured yet."}</div>
      {history.length ? <div className="mt-2 space-y-1 rounded-lg bg-[#F8F6F2] p-2"><div className="text-[8px] font-semibold text-[#716B63]">Recent connection checks</div>{history.slice(0, 3).map((row) => <div key={row.id} className="flex items-center justify-between gap-2 text-[8px] text-[#918B83]"><span>{label(row.verification_status)}</span><span>{shortTime(row.verified_at)}</span></div>)}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onVerify ? <button type="button" onClick={onVerify} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#514B44] disabled:opacity-40"><ShieldCheck size={10}/>{busy ? "Testing…" : "Test connection"}</button> : null}
        <Link href={href} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">{actionLabel}</Link>
      </div>
    </section>
  );
}

export default function FinanceConnectionsOverview({ organizationId }) {
  const [state, setState] = useState({ loading: false, error: "", data: null });
  const [busy, setBusy] = useState("");

  async function load() {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/provider-activation", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load Finance connection health");
      setState({ loading: false, error: "", data: body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load Finance connection health", data: null });
    }
  }

  useEffect(() => { load(); }, [organizationId]);

  async function verify(action) {
    try {
      setBusy(action);
      setState((current) => ({ ...current, error: "" }));
      const response = await fetch("/api/finance/provider-activation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Connection verification failed");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Connection verification failed" }));
      await load();
    } finally {
      setBusy("");
    }
  }

  const data = state.data;
  const bankStatus = data?.bank?.ready ? (data.bank.verification_status || "CONFIGURED_UNVERIFIED") : "NOT_CONFIGURED";
  const etaxStatus = data?.etax?.ready ? (data.etax.credential?.verification_status || data.etax.profile?.provider_status || "CONFIGURED_UNVERIFIED") : "NOT_CONFIGURED";
  const emailStatus = data?.email?.ready ? "READY" : "NOT_CONFIGURED";

  const overall = useMemo(() => {
    const statuses = [bankStatus, etaxStatus, emailStatus];
    if (statuses.every((value) => ["VERIFIED", "READY"].includes(value))) return "READY";
    if (statuses.some((value) => value === "VERIFICATION_FAILED")) return "ATTENTION";
    if (statuses.some((value) => value === "NOT_CONFIGURED")) return "SETUP_REQUIRED";
    return "CONFIGURED_UNVERIFIED";
  }, [bankStatus, etaxStatus, emailStatus]);

  const bankDetail = data?.bank?.ready
    ? ((data.bank.environment ? label(data.bank.environment) + " · " : "") + (data.bank.last_verified_at ? "Verified " + shortTime(data.bank.last_verified_at) : data.bank.last_verification_error?.message || "Credential installed but not verified yet."))
    : "Create a Transaction Feed connection, then secure the Brankas provider credential.";
  const etaxDetail = data?.etax?.ready
    ? (label(data.etax.credential?.provider_id || data.etax.profile?.provider_code || "Certified provider") + " · " + (data.etax.profile?.last_verified_at ? "Verified " + shortTime(data.etax.profile.last_verified_at) : data.etax.profile?.last_error_message || "Configured but not successfully verified yet."))
    : "Configure the certified provider, sender identifier and secure provider credentials.";
  const emailDetail = data?.email?.ready
    ? label(data.email.provider_id) + " mailbox credential is active."
    : "Connect Google, Microsoft, or IMAP/SMTP before automatic portal delivery can send.";

  return (
    <section className="mx-auto max-w-[1720px] rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">External finance connections</div>
          <div className="mt-1 text-[14px] font-semibold text-[#3E3933]">Provider readiness in one place</div>
          <div className="mt-1 max-w-3xl text-[9px] leading-4 text-[#817B73]">See whether bank feeds, Thailand e-Tax and client email are configured and actually verified before live accounting work depends on them.</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={"rounded-full border px-2.5 py-1 text-[8px] font-semibold " + tone(overall === "ATTENTION" ? "FAILED" : overall === "SETUP_REQUIRED" ? "NOT_CONFIGURED" : overall)}>{label(overall)}</span>
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""}/>Refresh</button>
        </div>
      </div>

      {state.error ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] leading-4 text-red-800"><CircleAlert size={11} className="mt-0.5 shrink-0"/>{state.error}</div> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <ConnectionCard
          icon={Building2}
          title="Bank feeds"
          description="Brankas statement feed for supported Thailand bank accounts."
          status={bankStatus}
          detail={bankDetail}
          history={data?.bank?.verification_history || []}
          href={"/workspace/" + organizationId + "/finance/banking-integrations"}
          actionLabel={data?.bank?.ready ? "Open bank feeds" : "Set up bank feed"}
          onVerify={data?.bank?.ready ? () => verify("verify_bank_feed") : null}
          busy={busy === "verify_bank_feed"}
        />
        <ConnectionCard
          icon={FileCheck2}
          title="Thailand e-Tax"
          description="ETDA source document flow through a certified external e-Tax provider."
          status={etaxStatus}
          detail={etaxDetail}
          history={data?.etax?.credential?.verification_history || []}
          href={"/workspace/" + organizationId + "/finance/e-invoicing?create=1"}
          actionLabel={data?.etax?.ready ? "Open e-Tax" : "Set up e-Tax"}
          onVerify={data?.etax?.ready ? () => verify("verify_etax") : null}
          busy={busy === "verify_etax"}
        />
        <ConnectionCard
          icon={Mail}
          title="Client email"
          description="Organization mailbox used for secure portal delivery and Finance communication."
          status={emailStatus}
          detail={emailDetail}
          href={data?.email?.setup_path || ("/workspace/" + organizationId + "/administration/integrations/email-connect")}
          actionLabel={data?.email?.ready ? "Open email connection" : "Connect email"}
        />
      </div>

      {overall === "READY" ? <div className="mt-3 flex items-center gap-1.5 text-[8px] font-medium text-emerald-800"><CheckCircle2 size={10}/>All configured Finance provider connections are ready.</div> : null}
    </section>
  );
}
