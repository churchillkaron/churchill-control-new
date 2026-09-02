"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileClock,
  FileSearch,
  Files,
  FolderOpen,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Signature,
  Upload,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const NAV = Object.freeze([
  { id: "home", label: "Command Center", route: "/documents" },
  { id: "intake", label: "Inbox", route: "/documents/intake" },
  { id: "library", label: "Library", route: "/documents/library" },
  { id: "approvals", label: "Approvals & Signatures", route: "/documents/approvals" },
  { id: "contracts", label: "Contracts", route: "/documents/contracts" },
  { id: "records", label: "Records", route: "/documents/records" },
  { id: "templates", label: "Templates", route: "/documents/templates" },
  { id: "activity", label: "Activity", route: "/documents/activity" },
]);

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function workspaceHref(organizationId, route) {
  return `/workspace/${encodeURIComponent(organizationId)}${route}`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value).slice(0, 10);
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function Status({ value, attention = false }) {
  return (
    <span className={attention
      ? "rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]"
      : "rounded-full border border-black/[0.08] bg-[#F7F6F3] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#747069]"}
    >
      {titleCase(value || "Open")}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">{label}</div>
        <Icon size={15} className="text-[#A37849]" />
      </div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

function DocumentRow({ organizationId, document }) {
  const controlled = document.source === "controlled";
  const href = controlled
    ? workspaceHref(organizationId, `/documents/library/${document.id}`)
    : null;

  const content = (
    <div className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_140px_110px_100px_auto] sm:items-center">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-[#2B2925]">{document.name}</div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[#99958D]">
          <span>{titleCase(document.document_type || "File")}</span>
          {document.document_number ? <span>{document.document_number}</span> : null}
          <span>{document.source === "controlled" ? `v${document.version_number || 1}` : "Intake"}</span>
        </div>
      </div>
      <div className="text-[10px] text-[#77736C]">{titleCase(document.classification || "Unclassified")}</div>
      <div><Status value={document.status} attention={document.approval_required && !document.approved_at} /></div>
      <div className="text-[10px] text-[#8E8A82]">{formatBytes(document.size_bytes)}</div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-[#A29E96]">
        <span>{formatDate(document.updated_at || document.created_at)}</span>
        {href ? <ArrowRight size={12} /> : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block border-b border-black/[0.055] transition hover:bg-[#FBFAF8]">
      {content}
    </Link>
  ) : (
    <div className="border-b border-black/[0.055]">{content}</div>
  );
}

function UploadPanel({ organizationId, entityId, onUploaded }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState("FILE");
  const [classification, setClassification] = useState("INTERNAL");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!file || !organizationId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("organizationId", organizationId);
      if (entityId) form.set("entityId", entityId);
      form.set("file", file);
      form.set("documentName", name || file.name);
      form.set("documentType", documentType);
      form.set("classification", classification);
      form.set("tags", tags);
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Upload failed");
      setFile(null);
      setName("");
      setTags("");
      if (fileRef.current) fileRef.current.value = "";
      await onUploaded?.(result.document);
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[22px] border border-black/[0.075] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A37849]">Controlled upload</div>
          <div className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-[#25231F]">Add to the governed library</div>
          <div className="mt-1 text-[10px] leading-5 text-[#99958D]">Private storage, checksum and version 1 are created together.</div>
        </div>
        <Upload size={17} className="text-[#A37849]" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input ref={fileRef} type="file" required onChange={(event) => setFile(event.target.files?.[0] || null)} className="col-span-full rounded-xl border border-black/[0.09] bg-[#FBFAF8] px-3 py-2.5 text-[11px]" />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Document name (optional)" className="rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[11px] outline-none focus:border-[#D6A66A]" />
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, comma separated" className="rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[11px] outline-none focus:border-[#D6A66A]" />
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[11px]">
          <option value="FILE">File</option>
          <option value="CONTRACT">Contract</option>
          <option value="POLICY">Policy</option>
          <option value="CERTIFICATE">Certificate</option>
          <option value="REPORT">Report</option>
          <option value="FORM">Form</option>
          <option value="CORRESPONDENCE">Correspondence</option>
          <option value="EVIDENCE">Evidence</option>
        </select>
        <select value={classification} onChange={(event) => setClassification(event.target.value)} className="rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[11px]">
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
          <option value="CONFIDENTIAL">Confidential</option>
          <option value="RESTRICTED">Restricted</option>
        </select>
      </div>
      {error ? <div className="mt-3 text-[11px] text-[#9A533D]">{error}</div> : null}
      <button type="submit" disabled={!file || busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[11px] font-medium text-white disabled:opacity-40">
        {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
        {busy ? "Uploading…" : "Upload document"}
      </button>
    </form>
  );
}

export default function DocumentsWorkspace({ organizationId: organizationIdProp, mode = "home" }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = text(organizationIdProp || businessContext.organization_id || businessContext.organization?.id);
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "All entities";

  const [command, setCommand] = useState({ loading: true, error: null, data: null });
  const [library, setLibrary] = useState({ loading: true, error: null, documents: [] });
  const [query, setQuery] = useState("");

  const loadCommand = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setCommand((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ organizationId });
      if (entityId) params.set("entityId", entityId);
      if (periodId) params.set("periodId", periodId);
      const response = await fetch(`/api/workspace/documents/command-center?${params.toString()}`, { cache: "no-store", credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load Documents");
      setCommand({ loading: false, error: null, data: result });
    } catch (error) {
      setCommand((current) => ({ ...current, loading: false, error: error?.message || "Unable to load Documents" }));
    }
  }, [entityId, organizationId, periodId]);

  const loadLibrary = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setLibrary((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ organizationId, limit: "1000" });
      if (entityId) params.set("entityId", entityId);
      if (query) params.set("q", query);
      const response = await fetch(`/api/documents?${params.toString()}`, { cache: "no-store", credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load library");
      setLibrary({ loading: false, error: null, documents: Array.isArray(result.documents) ? result.documents : [] });
    } catch (error) {
      setLibrary((current) => ({ ...current, loading: false, error: error?.message || "Unable to load library" }));
    }
  }, [entityId, organizationId, query]);

  useEffect(() => { loadCommand(); }, [loadCommand]);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  useEffect(() => {
    const refresh = () => { loadCommand({ silent: true }); loadLibrary({ silent: true }); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadCommand, loadLibrary]);

  const metrics = command.data?.metrics || {};
  const queue = Array.isArray(command.data?.queue) ? command.data.queue : [];
  const allDocuments = library.documents || [];

  const documents = useMemo(() => {
    if (mode === "intake") return allDocuments.filter((row) => row.source === "intake");
    if (mode === "contracts") return allDocuments.filter((row) => text(row.document_type).toUpperCase().includes("CONTRACT") || row.expiry_date);
    if (mode === "approvals") return allDocuments.filter((row) => row.approval_required || ["review", "in_review", "under_review", "pending_approval", "approved"].includes(text(row.status).toLowerCase()));
    if (mode === "records") return allDocuments.filter((row) => row.retention_until || row.legal_hold);
    return allDocuments;
  }, [allDocuments, mode]);

  const activeNav = NAV.find((item) => item.id === mode) || NAV[0];

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Documents · {activeNav.label}</div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Document & Records Control</h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">Capture once, find by business context, control versions, review and approve, sign and distribute, then retain or dispose with evidence.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#77736C]">
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{businessContext.organization?.name || "Organization"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{entityName}</span>
              <button type="button" onClick={() => { loadCommand(); loadLibrary(); }} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 hover:border-[#D6A66A]/45 hover:text-[#8D6338]">
                <RefreshCw size={11} className={command.loading || library.loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <nav className="mt-6 flex gap-1 overflow-x-auto border-t border-black/[0.07] pt-5">
            {NAV.map((item) => (
              <Link key={item.id} href={workspaceHref(organizationId, item.route)} className={item.id === mode
                ? "whitespace-nowrap rounded-xl bg-[#1D1B18] px-3.5 py-2 text-[10px] font-medium text-white"
                : "whitespace-nowrap rounded-xl px-3.5 py-2 text-[10px] font-medium text-[#69655E] hover:bg-[#F7F6F3]"}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        {command.error || library.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>{command.error || library.error}</div>
          </div>
        ) : null}

        {mode === "home" ? (
          <>
            <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard icon={Files} label="Documents" value={command.loading ? "…" : Number(metrics.files?.total || 0)} detail={`${Number(metrics.files?.controlled || 0)} controlled · ${Number(metrics.files?.intake || 0)} intake`} />
              <MetricCard icon={FileSearch} label="Inbox" value={command.loading ? "…" : Number(metrics.inbox?.total_attention || 0)} detail="Files needing classification or approval" attention />
              <MetricCard icon={FileCheck2} label="Approvals" value={command.loading ? "…" : Number(metrics.approvals?.pending || 0)} detail="Review and approval work outstanding" attention />
              <MetricCard icon={Signature} label="Signatures" value={command.loading ? "…" : Number(metrics.signatures?.pending || 0)} detail="Signature requests still open" attention />
              <MetricCard icon={FileClock} label="Expiring" value={command.loading ? "…" : Number(metrics.contracts?.expiring_30d || 0) + Number(metrics.contracts?.expired || 0)} detail="Contracts/documents expired or due in 30 days" attention />
              <MetricCard icon={LockKeyhole} label="Records" value={command.loading ? "…" : Number(metrics.records?.retention_due || 0)} detail={`${Number(metrics.records?.legal_holds || 0)} legal holds`} attention />
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
              <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
                <div className="border-b border-black/[0.07] pb-4">
                  <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Needs attention</div>
                  <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em]">Documents to move now</h2>
                </div>
                <div className="divide-y divide-black/[0.06]">
                  {!command.loading && queue.length === 0 ? (
                    <div className="flex items-center gap-3 py-8 text-[12px] text-[#77736C]"><CheckCircle2 size={16} className="text-[#718167]" />No document-control exceptions need attention.</div>
                  ) : null}
                  {queue.slice(0, 14).map((item) => (
                    <Link key={item.id} href={workspaceHref(organizationId, item.href)} className="group grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className="truncate text-[12px] font-medium text-[#292723] group-hover:text-[#8D6338]">{item.title}</span><Status value={item.status} attention={item.priority === "attention"} /></div>
                        <div className="mt-1 text-[10px] text-[#99958D]">{item.detail}</div>
                      </div>
                      <ArrowRight size={13} className="hidden text-[#B7B3AB] sm:block" />
                    </Link>
                  ))}
                </div>
              </section>
              <UploadPanel organizationId={organizationId} entityId={entityId} onUploaded={async () => { await loadCommand(); await loadLibrary(); }} />
            </div>
          </>
        ) : null}

        {mode !== "home" ? (
          <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">{activeNav.label}</div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em]">{mode === "intake" ? "Capture & classification inbox" : mode === "library" ? "Controlled document library" : mode === "approvals" ? "Review, approval & signature work" : mode === "contracts" ? "Contracts & expiring documents" : mode === "records" ? "Retention, legal hold & records" : mode === "templates" ? "Document templates" : "Document activity & audit"}</h2>
              </div>
              {!["templates", "activity"].includes(mode) ? (
                <div className="relative min-w-[260px] max-w-[390px] flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A39F97]" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" className="w-full rounded-xl border border-black/[0.09] bg-[#FBFAF8] py-2.5 pl-9 pr-3 text-[11px] outline-none focus:border-[#D6A66A]" />
                </div>
              ) : null}
            </div>

            {mode === "templates" ? (
              <div className="grid gap-3 py-5 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard icon={FolderOpen} label="Active templates" value={command.loading ? "…" : Number(metrics.templates?.active || 0)} detail={`${Number(metrics.templates?.total || 0)} templates configured`} />
                <div className="sm:col-span-1 lg:col-span-2 rounded-2xl border border-dashed border-black/[0.1] bg-[#FBFAF8] p-5 text-[11px] leading-5 text-[#77736C]">Templates remain organization/entity configuration and are not mixed with controlled records. Existing template truth is connected; template editing will use the same governed Documents shell rather than a separate design engine.</div>
              </div>
            ) : mode === "activity" ? (
              <div className="grid gap-3 py-5 sm:grid-cols-3">
                <MetricCard icon={History} label="Version events" value={command.loading ? "…" : Number(metrics.versions?.total || 0)} detail="Immutable document-version evidence" />
                <MetricCard icon={Clock3} label="Open deliveries" value={command.loading ? "…" : Number(metrics.distribution?.open || 0)} detail={`${Number(metrics.distribution?.failed || 0)} failed`} attention />
                <MetricCard icon={ShieldCheck} label="Business links" value={command.loading ? "…" : Number(metrics.links?.total || 0)} detail="Documents linked to canonical business records" />
              </div>
            ) : documents.length ? (
              <div className="mt-2">
                {documents.map((document) => <DocumentRow key={`${document.source}:${document.id}`} organizationId={organizationId} document={document} />)}
              </div>
            ) : (
              <div className="py-12 text-center text-[12px] text-[#8E8A82]">No documents match this workspace yet.</div>
            )}
          </section>
        ) : null}

        {mode !== "home" && mode !== "templates" && mode !== "activity" ? (
          <div className="mt-5"><UploadPanel organizationId={organizationId} entityId={entityId} onUploaded={async () => { await loadCommand(); await loadLibrary(); }} /></div>
        ) : null}
      </div>
    </main>
  );
}
