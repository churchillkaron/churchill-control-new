"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileSignature, LoaderCircle, RefreshCw, Send } from "lucide-react";

function tone(state) {
  return state === "READY" ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : state === "AWAITING_SIGNATURE" ? "border-amber-700/15 bg-amber-50 text-amber-800" : "border-red-700/15 bg-red-50 text-red-800";
}
function label(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function FinancePracticeOnboarding({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [forms, setForms] = useState({});

  async function load() {
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/practice-onboarding", window.location.origin); url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" }); const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load onboarding");
      setState({ loading: false, error: "", data: body });
    } catch (error) { setState({ loading: false, error: error?.message || "Unable to load onboarding", data: null }); }
  }
  useEffect(() => { if (organizationId) load(); }, [organizationId]);

  function patchForm(id, patch) { setForms((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } })); }
  async function act(engagementId, action, extra = {}) {
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/workspace/finance/practice-onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ organizationId, engagementId, action, ...extra }) });
      const body = await response.json().catch(() => ({})); if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to update onboarding");
      setNotice(action === "request_signature" ? "Signature request created in the governed Documents runtime." : "Engagement document linked."); await load();
    } catch (error) { setNotice(error?.message || "Unable to update onboarding"); }
    finally { setSaving(false); }
  }

  const data = state.data;
  if (state.loading && !data) return <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Loading client onboarding…</div>;
  if (state.error && !data) return <div className="rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800">{state.error}</div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold text-[#403C37]">Client onboarding</div><div className="mt-0.5 text-[9px] text-[#918B83]">One setup path from engagement scope to signed authority and billing policy. No guessed signer and no parallel signature engine.</div></div><button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} />Refresh</button></div>
    <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-black/[0.07] bg-white p-3"><div className="text-[8px] uppercase tracking-[0.12em] text-[#918B83]">Engagements</div><div className="mt-1 text-[20px] font-semibold">{data?.summary?.total || 0}</div></div><div className="rounded-xl border border-black/[0.07] bg-white p-3"><div className="text-[8px] uppercase tracking-[0.12em] text-[#918B83]">Ready</div><div className="mt-1 text-[20px] font-semibold text-emerald-700">{data?.summary?.ready || 0}</div></div><div className="rounded-xl border border-black/[0.07] bg-white p-3"><div className="text-[8px] uppercase tracking-[0.12em] text-[#918B83]">Needs setup</div><div className="mt-1 text-[20px] font-semibold text-[#9A533D]">{data?.summary?.attention || 0}</div></div></div>
    {notice ? <div className="rounded-xl border border-[#A37849]/15 bg-[#FBF7F1] px-3 py-2 text-[8px] text-[#76583A]">{notice}</div> : null}
    <div className="space-y-2">{(data?.engagements || []).map((engagement) => { const form = forms[engagement.id] || {}; const latestSignature = engagement.signatures?.[0]; return <section key={engagement.id} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-semibold text-[#403C37]">{engagement.client_name}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{engagement.service_package || "Accounting engagement"}</div></div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(engagement.readiness.state)}`}>{label(engagement.readiness.state)}</span></div><div className="mt-2 text-[8px] text-[#76583A]">Next: {engagement.readiness.next_action}</div>
      <div className="mt-3 grid gap-2 lg:grid-cols-4"><div className="rounded-lg bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>Legal entity</b><div className="mt-0.5 text-[#918B83]">{engagement.entity_id ? "Configured" : "Missing"}</div></div><div className="rounded-lg bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>Engagement document</b><div className="mt-0.5 truncate text-[#918B83]">{engagement.engagement_document?.document_name || "Not linked"}</div></div><div className="rounded-lg bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>Signature</b><div className="mt-0.5 text-[#918B83]">{latestSignature ? label(latestSignature.status) : "Not requested"}</div></div><div className="rounded-lg bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>Billing</b><div className="mt-0.5 text-[#918B83]">{engagement.billing_profile ? label(engagement.billing_profile.billing_method) : "Not configured"}</div></div></div>
      {!engagement.engagement_document ? <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-[280px] flex-1 text-[7px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Approved controlled document<select value={form.documentId || ""} onChange={(event) => patchForm(engagement.id, { documentId: event.target.value })} className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] bg-white px-2 text-[8px] normal-case tracking-normal"><option value="">Select engagement letter…</option>{(data?.approved_documents || []).map((document) => <option key={document.id} value={document.id}>{document.document_name} · v{document.version_number}</option>)}</select></label><button type="button" disabled={saving || !form.documentId} onClick={() => act(engagement.id, "link_engagement_document", { documentId: form.documentId })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-[#FBF7F1] px-3 text-[8px] font-semibold text-[#76583A] disabled:opacity-40"><FileSignature size={10} />Link document</button></div> : null}
      {engagement.engagement_document && !engagement.signatures?.some((row) => row.status === "SIGNED") ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_110px] sm:items-end"><label className="text-[7px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Signer name<input value={form.signerName || ""} onChange={(event) => patchForm(engagement.id, { signerName: event.target.value })} className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px] normal-case tracking-normal" /></label><label className="text-[7px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Signer email<input type="email" value={form.signerEmail || ""} onChange={(event) => patchForm(engagement.id, { signerEmail: event.target.value })} className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] px-2 text-[8px] normal-case tracking-normal" /></label><button type="button" disabled={saving || (!form.signerName && !form.signerEmail)} onClick={() => act(engagement.id, "request_signature", { signerName: form.signerName, signerEmail: form.signerEmail })} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#76583A] px-3 text-[8px] font-semibold text-white disabled:opacity-40"><Send size={9} />Request</button></div> : null}
      {engagement.readiness.state === "READY" ? <div className="mt-3 flex items-center gap-1.5 text-[8px] font-medium text-emerald-700"><CheckCircle2 size={10} />Governed engagement setup complete.</div> : null}
    </section>; })}</div>
  </div>;
}
