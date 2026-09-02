"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileClock,
  History,
  Link2,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Signature,
  Upload,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: value.includes?.("T") ? "short" : undefined }).format(new Date(value));
  } catch {
    return String(value).slice(0, 16);
  }
}

function Pill({ children, attention = false }) {
  return <span className={attention ? "rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]" : "rounded-full border border-black/[0.08] bg-[#F7F6F3] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#747069]"}>{children}</span>;
}

export default function DocumentDetailWorkspace({ organizationId: organizationIdProp, documentId }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = text(organizationIdProp || businessContext.organization_id || businessContext.organization?.id);
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const fileRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState({});
  const [changeSummary, setChangeSummary] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !documentId) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}?${params.toString()}`, { cache: "no-store", credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load document");
      setState({ loading: false, error: null, data: result });
      const document = result.document || {};
      setDraft({
        documentName: document.name || "",
        documentNumber: document.document_number || "",
        documentType: document.document_type || "FILE",
        classification: document.classification || "INTERNAL",
        effectiveDate: document.effective_date || "",
        expiryDate: document.expiry_date || "",
        reviewDueAt: document.review_due_at || "",
        retentionUntil: document.retention_until || "",
        legalHold: document.legal_hold === true,
        tags: (document.tags || []).join(", "),
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load document" }));
    }
  }, [documentId, organizationId]);

  useEffect(() => { load(); }, [load]);

  const document = state.data?.document || {};
  const versions = Array.isArray(state.data?.versions) ? state.data.versions : [];
  const approvals = Array.isArray(state.data?.approvals) ? state.data.approvals : [];
  const signatures = Array.isArray(state.data?.signatures) ? state.data.signatures : [];
  const links = Array.isArray(state.data?.links) ? state.data.links : [];
  const access = Array.isArray(state.data?.access) ? state.data.access : [];
  const openApproval = approvals.find((row) => ["pending", "requested", "open", "in_review", "under_review"].includes(text(row.status).toLowerCase()));
  const canSign = ["approved", "active"].includes(text(document.status).toLowerCase()) || Boolean(document.approved_at);

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "include", ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw new Error(result.error || "Action failed");
    return result;
  }

  async function saveMetadata() {
    setBusy("save");
    try {
      await api(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...draft,
          tags: text(draft.tags).split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to save document" }));
    } finally {
      setBusy(null);
    }
  }

  async function approval(action) {
    setBusy(action);
    try {
      await api(`/api/documents/${encodeURIComponent(documentId)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action }),
      });
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Approval action failed" }));
    } finally {
      setBusy(null);
    }
  }

  async function uploadVersion() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy("version");
    try {
      const form = new FormData();
      form.set("organizationId", organizationId);
      form.set("file", file);
      form.set("changeSummary", changeSummary);
      await api(`/api/documents/${encodeURIComponent(documentId)}/versions`, { method: "POST", body: form });
      if (fileRef.current) fileRef.current.value = "";
      setChangeSummary("");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Version upload failed" }));
    } finally {
      setBusy(null);
    }
  }

  async function download(versionNumber = null) {
    setBusy(`download:${versionNumber || "current"}`);
    try {
      const params = new URLSearchParams({ organizationId });
      if (versionNumber) params.set("versionNumber", String(versionNumber));
      const result = await api(`/api/documents/${encodeURIComponent(documentId)}/download?${params.toString()}`);
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to download document" }));
    } finally {
      setBusy(null);
    }
  }

  async function requestSignature() {
    setBusy("signature");
    try {
      await api(`/api/documents/${encodeURIComponent(documentId)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId: entityId || null, signerName, signerEmail }),
      });
      setSignerName(""); setSignerEmail("");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to request signature" }));
    } finally {
      setBusy(null);
    }
  }

  if (state.loading && !state.data) {
    return <div className="flex min-h-[420px] items-center justify-center bg-[#F7F6F3] text-[12px] text-[#77736C]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading document…</div>;
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Link href={`/workspace/${encodeURIComponent(organizationId)}/documents/library`} className="inline-flex items-center gap-1.5 text-[10px] text-[#8D8982] hover:text-[#8D6338]"><ArrowLeft size={12} /> Library</Link>
              <div className="mt-3 flex flex-wrap items-center gap-2"><Pill>{titleCase(document.classification || "Internal")}</Pill><Pill>{titleCase(document.status || "Draft")}</Pill><Pill>v{document.version_number || 1}</Pill>{document.legal_hold ? <Pill attention>Legal hold</Pill> : null}</div>
              <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em]">{document.name || "Document"}</h1>
              <div className="mt-2 text-[11px] text-[#8E8A82]">{document.document_number || titleCase(document.document_type || "File")} · Updated {formatDate(document.updated_at || document.created_at)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => download()} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 py-2.5 text-[11px] font-medium"><Download size={13} /> Open file</button>
              <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 py-2.5 text-[11px]"><RefreshCw size={13} /> Refresh</button>
            </div>
          </div>
        </header>

        {state.error ? <div className="mt-4 flex gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]"><AlertTriangle size={15} />{state.error}</div> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="flex items-center justify-between border-b border-black/[0.07] pb-4"><div><div className="text-[10px] uppercase tracking-[0.17em] text-[#8D8982]">Control metadata</div><h2 className="mt-1.5 text-[19px] font-medium">Business context & lifecycle</h2></div><ShieldCheck size={16} className="text-[#A37849]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={draft.documentName || ""} onChange={(e) => setDraft((d) => ({ ...d, documentName: e.target.value }))} placeholder="Document name" className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" />
              <input value={draft.documentNumber || ""} onChange={(e) => setDraft((d) => ({ ...d, documentNumber: e.target.value }))} placeholder="Document number" className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" />
              <input value={draft.documentType || ""} onChange={(e) => setDraft((d) => ({ ...d, documentType: e.target.value }))} placeholder="Type" className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" />
              <select value={draft.classification || "INTERNAL"} onChange={(e) => setDraft((d) => ({ ...d, classification: e.target.value }))} className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]"><option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></select>
              <label className="text-[10px] text-[#77736C]">Effective date<input type="date" value={draft.effectiveDate || ""} onChange={(e) => setDraft((d) => ({ ...d, effectiveDate: e.target.value }))} className="mt-1 block w-full rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /></label>
              <label className="text-[10px] text-[#77736C]">Expiry date<input type="date" value={draft.expiryDate || ""} onChange={(e) => setDraft((d) => ({ ...d, expiryDate: e.target.value }))} className="mt-1 block w-full rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /></label>
              <label className="text-[10px] text-[#77736C]">Review due<input type="date" value={draft.reviewDueAt || ""} onChange={(e) => setDraft((d) => ({ ...d, reviewDueAt: e.target.value }))} className="mt-1 block w-full rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /></label>
              <label className="text-[10px] text-[#77736C]">Retention until<input type="date" value={draft.retentionUntil || ""} onChange={(e) => setDraft((d) => ({ ...d, retentionUntil: e.target.value }))} className="mt-1 block w-full rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /></label>
              <input value={draft.tags || ""} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="Tags" className="sm:col-span-2 rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" />
              <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-3 py-2.5 text-[11px]"><input type="checkbox" checked={draft.legalHold === true} onChange={(e) => setDraft((d) => ({ ...d, legalHold: e.target.checked }))} /> Legal hold — block disposition/deletion workflow</label>
            </div>
            <button onClick={saveMetadata} disabled={busy === "save"} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[11px] font-medium text-white"><Save size={13} />{busy === "save" ? "Saving…" : "Save controls"}</button>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="border-b border-black/[0.07] pb-4"><div className="text-[10px] uppercase tracking-[0.17em] text-[#8D8982]">Approval & signature</div><h2 className="mt-1.5 text-[19px] font-medium">Controlled release</h2></div>
            <div className="mt-4 rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4 text-[11px] leading-5 text-[#706C64]">Approval is bound to the current file version. Uploading a new version clears prior approval so stale approval cannot authorize changed content.</div>
            <div className="mt-4 flex flex-wrap gap-2">{!openApproval && !canSign ? <button onClick={() => approval("request")} className="rounded-xl bg-[#1D1B18] px-3.5 py-2.5 text-[11px] font-medium text-white">Request approval</button> : null}{openApproval ? <><button onClick={() => approval("approve")} className="rounded-xl bg-[#1D1B18] px-3.5 py-2.5 text-[11px] font-medium text-white">Approve</button><button onClick={() => approval("reject")} className="rounded-xl border border-[#B36B52]/20 px-3.5 py-2.5 text-[11px] text-[#9A533D]">Reject</button></> : null}{canSign ? <Pill><CheckCircle2 size={10} className="mr-1 inline" />Approved</Pill> : null}</div>
            <div className="mt-5 border-t border-black/[0.07] pt-4"><div className="flex items-center gap-2 text-[11px] font-medium"><Signature size={14} className="text-[#A37849]" /> Request signature</div><div className="mt-3 grid gap-2"><input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Signer name" className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /><input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="Signer email" className="rounded-xl border border-black/[0.09] px-3 py-2.5 text-[11px]" /><button disabled={!canSign || (!signerName && !signerEmail)} onClick={requestSignature} className="rounded-xl border border-black/[0.09] px-3.5 py-2.5 text-[11px] font-medium disabled:opacity-35">Create signature request</button></div></div>
            <div className="mt-4 space-y-2">{signatures.map((row) => <div key={row.id} className="rounded-xl border border-black/[0.07] px-3 py-2.5 text-[10px]"><div className="flex justify-between gap-2"><span className="font-medium">{row.signer_name || row.signer_email || "Signer"}</span><Pill attention={["PENDING","SENT","VIEWED"].includes(text(row.status).toUpperCase())}>{row.status}</Pill></div><div className="mt-1 text-[#99958D]">Version {row.version_number} · {formatDate(row.requested_at || row.created_at)}</div></div>)}</div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2 border-b border-black/[0.07] pb-4"><History size={15} className="text-[#A37849]" /><h2 className="text-[18px] font-medium">Version history</h2></div><div className="mt-3 flex flex-wrap gap-2"><input ref={fileRef} type="file" className="min-w-[220px] flex-1 rounded-xl border border-black/[0.09] px-3 py-2 text-[10px]" /><input value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="What changed?" className="min-w-[220px] flex-1 rounded-xl border border-black/[0.09] px-3 py-2 text-[10px]" /><button onClick={uploadVersion} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.09] px-3 py-2 text-[10px]"><Upload size={12} /> New version</button></div><div className="mt-3 divide-y divide-black/[0.06]">{versions.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 py-3"><div><div className="text-[11px] font-medium">Version {row.version_number}</div><div className="mt-1 text-[10px] text-[#99958D]">{row.change_summary || row.source_filename || "Controlled revision"} · {formatDate(row.created_at)}</div></div><button onClick={() => download(row.version_number)} className="rounded-lg border border-black/[0.08] p-2 text-[#77736C]"><Download size={12} /></button></div>)}</div></section>
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2 border-b border-black/[0.07] pb-4"><Link2 size={15} className="text-[#A37849]" /><h2 className="text-[18px] font-medium">Business links</h2></div>{links.length ? <div className="divide-y divide-black/[0.06]">{links.map((row) => <div key={row.id} className="py-3 text-[10px]"><div className="font-medium">{titleCase(row.relation_type)} · {titleCase(row.reference_type)}</div><div className="mt-1 font-mono text-[#99958D]">{row.reference_id}</div></div>)}</div> : <div className="py-8 text-[11px] text-[#8E8A82]">No canonical business-record links yet.</div>}</section>
        </div>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2 border-b border-black/[0.07] pb-4"><FileClock size={15} className="text-[#A37849]" /><h2 className="text-[18px] font-medium">Audit trail</h2></div>{access.length ? <div className="divide-y divide-black/[0.06]">{access.slice(0, 40).map((row) => <div key={row.id} className="grid gap-2 py-3 text-[10px] sm:grid-cols-[170px_150px_1fr]"><span>{formatDate(row.accessed_at || row.created_at)}</span><span className="font-medium">{titleCase(row.access_type)}</span><span className="text-[#99958D]">{row.metadata ? JSON.stringify(row.metadata) : "—"}</span></div>)}</div> : <div className="py-8 text-[11px] text-[#8E8A82]">No access events recorded yet.</div>}</section>
      </div>
    </main>
  );
}
