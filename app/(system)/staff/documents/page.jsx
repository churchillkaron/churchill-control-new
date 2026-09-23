"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, RefreshCw, ShieldCheck, Upload } from "lucide-react";

function sizeLabel(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StaffDocumentsPage() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/staff/documents", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load documents");
      setState({ loading: false, data: payload, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error?.message || "Unable to load documents" });
    }
  }

  useEffect(() => { load(); }, []);

  const documents = state.data?.documents || [];

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#1B1A18] lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> Personal records</div>
              <h1 className="mt-3 text-3xl font-black">My Documents</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#8A847C]">Only documents owned by you, explicitly linked to your staff/Party identity, or assigned to you for signature appear here.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/staff/documents/upload" className="flex h-11 items-center gap-2 rounded-xl border border-[#D6A66A]/30 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#76583A]"><Upload className="h-4 w-4" /> Upload</Link>
              <button onClick={load} disabled={state.loading} className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.14em] text-[#67615A] disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>
        </section>

        {state.error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-[#984C43]">{state.error}</div> : null}

        {state.loading ? (
          <section className="rounded-[28px] border border-black/[0.075] bg-white p-8 text-sm text-[#948E86]">Loading your documents…</section>
        ) : documents.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-[26px] border border-black/[0.075] bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-2.5 text-[#D6A66A]"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black">{document.document_name || "Document"}</h2>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#A09A92]">{document.document_type || "Document"} · {document.document_status || "-"}</div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-black/[0.08] px-2.5 py-1 text-[9px] uppercase tracking-[0.1em] text-[#948E86]">v{document.version_number || 1}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#817B73]">
                  <div className="rounded-xl border border-black/[0.06] p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">Classification</div><div className="mt-1">{document.classification || "Standard"}</div></div>
                  <div className="rounded-xl border border-black/[0.06] p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">File</div><div className="mt-1">{document.mime_type || "File"}{sizeLabel(document.file_size_bytes) ? ` · ${sizeLabel(document.file_size_bytes)}` : ""}</div></div>
                </div>
                <a href={`/api/documents/${document.id}/download?redirect=1`} className="mt-4 flex h-10 items-center justify-center rounded-xl border border-[#D6A66A]/30 text-[10px] font-black uppercase tracking-[0.14em] text-[#76583A]">Open document</a>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[28px] border border-dashed border-black/[0.08] p-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-[#B4AEA6]" />
            <h2 className="mt-4 text-lg font-black">No staff documents assigned yet</h2>
            <p className="mt-2 text-sm text-[#948E86]">Employment records, policies or documents assigned for signature will appear here.</p>
          </section>
        )}
      </div>
    </main>
  );
}
