"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

export default function StaffIdentityVerificationPage({ params }) {
  const organizationId = params?.organizationId;
  const [state, setState] = useState({ loading: true, queue: [], error: "", message: "" });
  const [review, setReview] = useState({});

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/people/workforce/identity-verification?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load identity verification queue");
      setState((current) => ({ ...current, loading: false, queue: payload.queue || [] }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load identity verification queue" }));
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  function patch(id, key, value) {
    setReview((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));
  }

  async function openDocument(documentId) {
    const response = await fetch(`/api/people/workforce/identity-verification?organizationId=${encodeURIComponent(organizationId)}&documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.signed?.url) {
      setState((current) => ({ ...current, error: payload.error || "Unable to open identity document" }));
      return;
    }
    window.open(payload.signed.url, "_blank", "noopener,noreferrer");
  }

  async function submit(item, decision) {
    const values = review[item.documentId] || {};
    setState((current) => ({ ...current, error: "", message: "" }));
    try {
      const response = await fetch("/api/people/workforce/identity-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          documentId: item.documentId,
          decision,
          documentNumber: values.documentNumber || "",
          expiryDate: values.expiryDate || null,
          notes: values.notes || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to review identity document");
      setState((current) => ({ ...current, message: decision === "APPROVE" ? "Identity verified." : "Identity rejected." }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to review identity document" }));
    }
  }

  const pending = (state.queue || []).filter((item) => item.status === "PENDING");
  const reviewed = (state.queue || []).filter((item) => item.status !== "PENDING");

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#1B1A18] lg:p-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> People · Identity</div>
              <h1 className="mt-2 text-3xl font-black">Staff identity verification</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817B73]">Review the actual private passport/ID before approving clock-in identity. Type the verified document number from the document; Avantiqo only exposes a masked suffix back to staff.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/workspace/${organizationId}/people/work-permit-verification`} className="flex h-11 items-center justify-center rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#5E5952]">Work permits</Link>
              <button onClick={load} disabled={state.loading} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#5E5952]"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>
        </section>

        {state.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">{state.error}</div> : null}
        {state.message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#5E6D58]">{state.message}</div> : null}

        <section className="space-y-3">
          {pending.length ? pending.map((item) => {
            const values = review[item.documentId] || {};
            return (
              <article key={item.documentId} className="rounded-[26px] border border-black/[0.075] bg-white p-5 shadow-[0_10px_28px_rgba(55,47,38,0.05)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-black">{item.staff?.name || item.staff?.email || "Staff"}</div>
                    <div className="mt-1 text-xs text-[#817B73]">{item.staff?.position || item.staff?.role || "Staff"} · {item.documentType?.replaceAll("_", " ") || "Identity document"}</div>
                  </div>
                  <button onClick={() => openDocument(item.documentId)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/30 px-4 text-xs font-black uppercase tracking-[0.12em] text-[#76583A]"><FileText className="h-4 w-4" /> Open private document</button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <input value={values.documentNumber || ""} onChange={(e) => patch(item.documentId, "documentNumber", e.target.value)} placeholder="Verified document number" className="h-12 rounded-xl border border-black/[0.08] bg-[#FCFBF9] px-3 text-sm outline-none" />
                  <input type="date" value={values.expiryDate || ""} onChange={(e) => patch(item.documentId, "expiryDate", e.target.value)} className="h-12 rounded-xl border border-black/[0.08] bg-[#FCFBF9] px-3 text-sm outline-none" />
                  <input value={values.notes || ""} onChange={(e) => patch(item.documentId, "notes", e.target.value)} placeholder="Review notes" className="h-12 rounded-xl border border-black/[0.08] bg-[#FCFBF9] px-3 text-sm outline-none" />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button onClick={() => submit(item, "APPROVE")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] text-xs font-black uppercase tracking-[0.12em] text-[#171614]"><CheckCircle2 className="h-4 w-4" /> Verify identity</button>
                  <button onClick={() => submit(item, "REJECT")} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-xs font-black uppercase tracking-[0.12em] text-[#984C43]"><XCircle className="h-4 w-4" /> Reject</button>
                </div>
              </article>
            );
          }) : <div className="rounded-[26px] border border-black/[0.075] bg-white p-6 text-sm text-[#817B73]">No identity documents are waiting for review.</div>}
        </section>

        {reviewed.length ? <section className="rounded-[26px] border border-black/[0.075] bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]">Recent reviewed</div><div className="mt-3 space-y-2">{reviewed.slice(0, 20).map((item) => <div key={item.documentId} className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div><div className="text-sm font-black">{item.staff?.name || item.staff?.email || "Staff"}</div><div className="mt-1 text-[10px] text-[#817B73]">{item.documentType?.replaceAll("_", " ") || "Identity"} {item.documentNumberMasked ? `· ${item.documentNumberMasked}` : ""}</div></div><span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#5E5952]">{item.status}</span></div>)}</div></section> : null}
      </div>
    </main>
  );
}
