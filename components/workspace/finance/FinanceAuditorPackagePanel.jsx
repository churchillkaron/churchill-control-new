"use client";

import { useEffect, useState } from "react";
import { Archive, CheckCircle2, Copy, Download, FileLock2, LoaderCircle, RefreshCw, ShieldAlert, Share2, XCircle } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const text = (value) => String(value ?? "").trim();
const label = (value) => text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortDate = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";

export default function FinanceAuditorPackagePanel({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [state, setState] = useState({ loading: false, error: "", data: null });
  const [busy, setBusy] = useState("");
  const [shareId, setShareId] = useState("");
  const [shareForm, setShareForm] = useState({ name: "", email: "", ttl: 30 });
  const [issuedPath, setIssuedPath] = useState("");

  async function load() {
    if (!organizationId || !entityId || !periodId) { setState({ loading: false, error: "", data: null }); return; }
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/auditor-package", window.location.origin);
      url.searchParams.set("organizationId", organizationId); url.searchParams.set("entityId", entityId); url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load auditor package status");
      setState({ loading: false, error: "", data: body });
    } catch (error) { setState({ loading: false, error: error?.message || "Unable to load auditor package status", data: null }); }
  }
  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  async function post(payload) {
    const response = await fetch("/api/finance/auditor-package", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, periodId, ...payload }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) { const error = new Error(body?.error || "Auditor package action failed"); error.blockers = body?.blockers || []; throw error; }
    return body;
  }
  async function generate() { try { setBusy("generate"); setState((c) => ({ ...c, error: "" })); await post({ action: "generate" }); await load(); } catch (e) { setState((c) => ({ ...c, error: e?.blockers?.join(" ") || e?.message || "Generation failed" })); } finally { setBusy(""); } }
  async function download(row) { try { setBusy(`download:${row.id}`); const body = await post({ action: "download", packageId: row.id }); if (body.url) window.open(body.url, "_blank", "noopener,noreferrer"); } catch (e) { setState((c) => ({ ...c, error: e?.message || "Download failed" })); } finally { setBusy(""); } }
  async function share(row) { try { setBusy(`share:${row.id}`); const body = await post({ action: "grant", packageId: row.id, auditorName: shareForm.name, auditorEmail: shareForm.email, ttlDays: Number(shareForm.ttl || 30) }); if (body.auditor_path) setIssuedPath(body.auditor_path); setShareId(""); setShareForm({ name: "", email: "", ttl: 30 }); await load(); } catch (e) { setState((c) => ({ ...c, error: e?.message || "Unable to issue auditor access" })); } finally { setBusy(""); } }
  async function revoke(grantId) { try { setBusy(`revoke:${grantId}`); await post({ action: "revoke_grant", grantId }); await load(); } catch (e) { setState((c) => ({ ...c, error: e?.message || "Unable to revoke auditor access" })); } finally { setBusy(""); } }
  async function copyIssued() { if (!issuedPath) return; await navigator.clipboard.writeText(`${window.location.origin}${issuedPath}`); }

  const readiness = state.data?.readiness;
  const packages = state.data?.packages || [];
  return <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><Archive size={13}/>Auditor package</div><div className="mt-1 text-[13px] font-semibold text-[#3E3933]">Frozen period evidence for external audit</div><div className="mt-1 max-w-3xl text-[10px] leading-5 text-[#8E877F]">Only a governed, current close can be packaged. Avantiqo freezes reports, ledger evidence, reconciliations, tax, close controls, review evidence and supporting documents into an immutable private ZIP.</div></div><div className="flex gap-2"><button type="button" onClick={load} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 text-[8px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""}/>Refresh</button><button type="button" onClick={generate} disabled={!readiness?.ready || Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-35">{busy === "generate" ? <LoaderCircle size={10} className="animate-spin"/> : <FileLock2 size={10}/>}Generate frozen package</button></div></div>
    {!entityId || !periodId ? <div className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[9px] text-amber-900">Select a legal entity and accounting period to inspect auditor-package readiness.</div> : null}
    {state.error ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{state.error}</div> : null}
    {readiness ? <div className={`mt-4 rounded-xl border p-3 ${readiness.ready ? "border-emerald-700/15 bg-emerald-50" : "border-amber-700/15 bg-amber-50"}`}><div className="flex items-center gap-2 text-[9px] font-semibold">{readiness.ready ? <CheckCircle2 size={12} className="text-emerald-700"/> : <ShieldAlert size={12} className="text-amber-800"/>}{readiness.ready ? "Ready to freeze" : "Not ready to package"}</div>{(readiness.blockers || []).map((blocker) => <div key={blocker} className="mt-1 text-[8px] leading-4 text-[#76583A]">• {blocker}</div>)}{readiness.freshness ? <div className="mt-2 text-[8px] text-[#817A72]">Close freshness: <b>{label(readiness.freshness.state)}</b> · {readiness.freshness.reason}</div> : null}</div> : null}
    {issuedPath ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#A37849]/20 bg-[#FFF9EF] p-3"><div className="text-[8px] text-[#76583A]"><b>Auditor link created.</b> It is shown once; copy it securely now.</div><button type="button" onClick={copyIssued} className="inline-flex items-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-white px-2.5 py-2 text-[8px] font-semibold text-[#76583A]"><Copy size={10}/>Copy auditor link</button></div> : null}
    <div className="mt-4 space-y-2">{packages.length ? packages.map((row) => <div key={row.id} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold">Package v{row.package_version}</div><div className="mt-1 text-[8px] text-[#918B83]">Generated {shortDate(row.generated_at)} · digest {text(row.package_digest).slice(0, 12)}… · close {text(row.close_fingerprint_digest).slice(0, 12)}…</div></div><div className="flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => download(row)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold"><Download size={10}/>Download</button><button type="button" disabled={Boolean(busy)} onClick={() => setShareId(shareId === row.id ? "" : row.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#76583A] px-2.5 text-[8px] font-semibold text-white"><Share2 size={10}/>Auditor access</button></div></div>{shareId === row.id ? <div className="mt-3 grid gap-2 rounded-lg border border-black/[0.06] bg-white p-3 md:grid-cols-[1fr_1.4fr_90px_auto]"><input value={shareForm.name} onChange={(e) => setShareForm((f) => ({ ...f, name: e.target.value }))} placeholder="Auditor name" className="h-9 rounded-lg border border-black/[0.08] px-2 text-[9px]"/><input value={shareForm.email} onChange={(e) => setShareForm((f) => ({ ...f, email: e.target.value }))} placeholder="auditor@example.com" className="h-9 rounded-lg border border-black/[0.08] px-2 text-[9px]"/><input type="number" min="1" max="90" value={shareForm.ttl} onChange={(e) => setShareForm((f) => ({ ...f, ttl: e.target.value }))} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[9px]"/><button type="button" disabled={!shareForm.email || Boolean(busy)} onClick={() => share(row)} className="h-9 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-35">Issue read-only link</button></div> : null}{(row.finance_auditor_package_grants || []).length ? <div className="mt-3 space-y-1">{row.finance_auditor_package_grants.map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[8px]"><span>{grant.auditor_email} · expires {shortDate(grant.expires_at)} · downloads {grant.download_count || 0}</span>{grant.revoked_at ? <span className="text-[#918B83]">Revoked</span> : <button type="button" disabled={Boolean(busy)} onClick={() => revoke(grant.id)} className="inline-flex items-center gap-1 font-semibold text-red-700"><XCircle size={9}/>Revoke</button>}</div>)}</div> : null}</div>) : <div className="rounded-xl bg-[#F8F6F2] p-4 text-center text-[9px] text-[#918B83]">No auditor package has been generated for this period.</div>}</div>
  </section>;
}
