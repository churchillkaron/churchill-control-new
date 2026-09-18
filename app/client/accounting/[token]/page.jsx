"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Download, FileSignature,
  FileText, FileUp, FolderOpen, Home, Landmark, LoaderCircle, MessageSquare, ReceiptText,
  RefreshCw, Send, ShieldCheck, UserRound, Users,
} from "lucide-react";

function shortDate(value) { return value ? String(value).slice(0, 10) : "—"; }
function label(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function money(value, currency = "THB") { return `${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`; }
function tone(status) {
  const value = String(status || "").toUpperCase();
  if (["PAID","SIGNED","SUBMITTED","COMPLETED","FILED","CLOSED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["OVERDUE","DECLINED","FAILED","CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  return "border-amber-700/15 bg-amber-50 text-amber-800";
}

const TABS = [
  ["home", "Home", Home], ["requests", "Requests", FileUp], ["documents", "Documents", FolderOpen],
  ["messages", "Messages", MessageSquare], ["tax", "Tax & filings", Landmark], ["billing", "Invoices & payments", ReceiptText],
  ["approvals", "Approvals", FileSignature], ["contacts", "Contacts", Users],
];

function Empty({ icon: Icon = CheckCircle2, title, body }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white p-9 text-center"><Icon size={22} className="mx-auto text-[#A37849]" /><div className="mt-2 text-sm font-semibold text-[#3F3A35]">{title}</div><div className="mx-auto mt-1 max-w-lg text-xs leading-5 text-[#90877E]">{body}</div></div>;
}

export default function AccountingClientPortalPage() {
  const params = useParams(); const token = params?.token;
  const [tab, setTab] = useState("home");
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [files, setFiles] = useState({}); const [categories, setCategories] = useState({}); const [responses, setResponses] = useState({});
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const response = await fetch(`/api/public/finance/client-portal/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load client portal");
      setState({ loading: false, error: "", data: body });
    } catch (error) { setState({ loading: false, error: error?.message || "Unable to load client portal", data: null }); }
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function portalPost(form, successMessage) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/public/finance/client-portal/${encodeURIComponent(token)}`, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to update client portal");
      setNotice(successMessage); await load(); return body;
    } catch (error) { setNotice(error?.message || "Unable to update client portal"); return null; }
    finally { setBusy(false); }
  }
  async function upload(requestRow) {
    const file = files[requestRow.id]; if (!file) return;
    const form = new FormData(); form.set("action", "upload"); form.set("requestId", requestRow.id); form.set("file", file);
    const configured = requestRow.categories || []; form.set("evidenceCategory", categories[requestRow.id] || configured[0]?.key || "general");
    const result = await portalPost(form, "Document uploaded securely.");
    if (result) setFiles((current) => ({ ...current, [requestRow.id]: null }));
  }
  async function submit(requestRow) {
    const form = new FormData(); form.set("action", "submit"); form.set("requestId", requestRow.id); form.set("response", responses[requestRow.id] || "");
    await portalPost(form, "Request submitted to your accounting team.");
  }
  async function sendMessage() {
    if (!message.trim()) return;
    const form = new FormData(); form.set("action", "message"); form.set("message", message.trim());
    const result = await portalPost(form, "Message sent to your accounting team."); if (result) setMessage("");
  }
  function openPath(path) { if (path) window.open(`/api/public/finance/client-portal/${encodeURIComponent(token)}/${path}`, "_blank", "noopener,noreferrer"); }

  if (state.loading && !state.data) return <main className="min-h-screen bg-[#F4F0E9] px-4 py-16"><div className="mx-auto flex max-w-xl items-center justify-center rounded-3xl border border-black/[0.07] bg-white p-10 text-sm text-[#706A63]"><LoaderCircle className="mr-2 animate-spin" size={16} />Opening your secure accounting workspace…</div></main>;
  if (state.error && !state.data) return <main className="min-h-screen bg-[#F4F0E9] px-4 py-16"><div className="mx-auto max-w-xl rounded-3xl border border-red-700/15 bg-white p-8 text-center"><ShieldCheck size={24} className="mx-auto text-[#A37849]" /><div className="mt-3 text-base font-semibold text-[#403C37]">This accounting portal is not available</div><div className="mt-2 text-sm text-[#8B8177]">{state.error}</div></div></main>;

  const data = state.data || {};
  const counts = { requests: data.requests?.length || 0, documents: data.documents?.length || 0, messages: data.messages?.length || 0, tax: data.filings?.length || 0, billing: data.invoices?.length || 0, approvals: data.approvals?.filter((row) => ["PENDING","SENT","VIEWED"].includes(String(row.status || "").toUpperCase())).length || 0 };
  const firmName = data.portal?.firm_name || "Accounting team";

  return <main className="min-h-screen bg-[#F4F0E9] text-[#28241F]">
    <header className="border-b border-black/[0.07] bg-[#171512] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-7">
        <div><div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">{firmName}</div><div className="mt-1 text-lg font-semibold tracking-[-0.02em]">Client Portal</div></div>
        <div className="flex items-center gap-2 text-[10px] text-white/55"><ShieldCheck size={13} className="text-[#D6A66A]" /><span>Secure engagement access</span><button onClick={load} className="ml-2 rounded-lg border border-white/10 p-2 text-white/70 hover:bg-white/5" aria-label="Refresh portal"><RefreshCw size={13} /></button></div>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-3 py-4 md:px-7 md:py-6">
      <section className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white">
        <div className="grid gap-5 p-5 md:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A7047]">{data.portal?.service_package || "Accounting engagement"}</div><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] md:text-3xl">{data.portal?.client_name}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#7B746C]">Your secure workspace with {firmName}. Only information intentionally shared for this accounting engagement appears here.</p></div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><div className="rounded-xl bg-[#F7F4EF] px-3 py-2"><div className="text-[9px] uppercase tracking-[0.1em] text-[#948A80]">Work status</div><div className="mt-1 font-semibold">{label(data.work_status?.overall || "With accountant")}</div></div><div className="rounded-xl bg-[#F7F4EF] px-3 py-2"><div className="text-[9px] uppercase tracking-[0.1em] text-[#948A80]">Open requests</div><div className="mt-1 font-semibold">{data.summary?.open_requests || 0}</div></div><div className="col-span-2 rounded-xl bg-[#F7F4EF] px-3 py-2 sm:col-span-1"><div className="text-[9px] uppercase tracking-[0.1em] text-[#948A80]">Access expires</div><div className="mt-1 font-semibold">{shortDate(data.portal?.expires_at)}</div></div></div>
        </div>
      </section>
      {notice ? <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFF9EF] p-3 text-xs text-[#76583A]">{notice}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white p-2 lg:self-start">
          <div className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">{TABS.map(([id, name, Icon]) => { const count = counts[id]; return <button key={id} type="button" onClick={() => setTab(id)} className={`flex h-10 items-center gap-2 rounded-xl px-3 text-left text-xs font-medium transition ${tab === id ? "bg-[#211E1A] text-white" : "text-[#665F57] hover:bg-[#F6F3EE]"}`}><Icon size={14} className={tab === id ? "text-[#D6A66A]" : "text-[#9B8B79]"} /><span className="flex-1">{name}</span>{count ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === id ? "bg-white/10 text-white" : "bg-[#F1ECE5] text-[#7A6A58]"}`}>{count}</span> : null}</button>; })}</div>
          <div className="mt-2 hidden border-t border-black/[0.06] px-3 pt-3 text-[9px] leading-4 text-[#A29A91] lg:block">This portal does not provide access to your general ledger, journals, internal review notes or the accounting firm’s other clients.</div>
        </nav>

        <section className="min-w-0 space-y-3">
          {tab === "home" ? <HomeView data={data} setTab={setTab} /> : null}
          {tab === "requests" ? <RequestsView data={data} busy={busy} files={files} setFiles={setFiles} categories={categories} setCategories={setCategories} responses={responses} setResponses={setResponses} upload={upload} submit={submit} /> : null}
          {tab === "documents" ? <DocumentsView data={data} openPath={openPath} /> : null}
          {tab === "messages" ? <MessagesView data={data} message={message} setMessage={setMessage} sendMessage={sendMessage} busy={busy} /> : null}
          {tab === "tax" ? <TaxView data={data} /> : null}
          {tab === "billing" ? <BillingView data={data} openPath={openPath} /> : null}
          {tab === "approvals" ? <ApprovalsView data={data} token={token} /> : null}
          {tab === "contacts" ? <ContactsView data={data} /> : null}
        </section>
      </div>
    </div>
  </main>;
}

function HomeView({ data, setTab }) {
  const cards = [
    ["Requests", data.summary?.open_requests || 0, "requests", FileUp], ["Documents", data.summary?.documents || 0, "documents", FolderOpen],
    ["Messages", data.summary?.messages || 0, "messages", MessageSquare], ["Outstanding", money(data.summary?.outstanding_amount || 0, data.invoices?.[0]?.currency_code || "THB"), "billing", CircleDollarSign],
  ];
  return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([name, value, target, Icon]) => <button key={name} onClick={() => setTab(target)} className="rounded-2xl border border-black/[0.07] bg-white p-4 text-left"><div className="flex items-center justify-between"><Icon size={15} className="text-[#A37849]" /><ChevronRight size={13} className="text-[#B9B1A8]" /></div><div className="mt-4 text-[10px] uppercase tracking-[0.1em] text-[#928A81]">{name}</div><div className="mt-1 text-xl font-semibold">{value}</div></button>)}</div><div className="grid gap-3 xl:grid-cols-2"><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="text-sm font-semibold">Where your work stands</div><div className="mt-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F8F2E9] text-[#9A7047]"><Clock3 size={16} /></div><div><div className="text-sm font-semibold">{label(data.work_status?.overall)}</div><div className="mt-0.5 text-xs text-[#8D847B]">{data.work_status?.waiting_for_you ? `${data.work_status.waiting_for_you} item${data.work_status.waiting_for_you === 1 ? "" : "s"} need your attention.` : data.work_status?.under_review ? "Your accounting team is reviewing the current work." : upperLocal(data.work_status?.overall) === "COMPLETED" ? "There are no active work items waiting on this engagement." : "Your accounting team is handling the current work."}</div></div></div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="text-sm font-semibold">Next important items</div><div className="mt-3 space-y-2 text-xs">{data.requests?.[0] ? <button onClick={() => setTab("requests")} className="flex w-full items-center justify-between rounded-xl bg-[#F8F6F2] p-3 text-left"><span><b>{data.requests[0].title}</b><span className="ml-2 text-[#918B83]">Due {shortDate(data.requests[0].due_at)}</span></span><ChevronRight size={13} /></button> : null}{data.filings?.find((row) => !["SUBMITTED","FILED","CLOSED"].includes(upperLocal(row.status))) ? <button onClick={() => setTab("tax")} className="flex w-full items-center justify-between rounded-xl bg-[#F8F6F2] p-3 text-left"><span><b>Tax filing</b><span className="ml-2 text-[#918B83]">Review filing status and deadline</span></span><ChevronRight size={13} /></button> : null}{!data.requests?.length && !data.filings?.length ? <div className="rounded-xl bg-[#F8F6F2] p-3 text-[#817970]">Nothing needs your attention right now.</div> : null}</div></div></div></>;
}
function upperLocal(value) { return String(value || "").toUpperCase(); }

function RequestsView({ data, busy, files, setFiles, categories, setCategories, responses, setResponses, upload, submit }) {
  if (!(data.requests || []).length) return <Empty title="Nothing needed from you right now" body="Your accounting team will add requests here when they need information, confirmation or documents." />;
  return <div className="space-y-3">{data.requests.map((requestRow) => <section key={requestRow.id} className="rounded-2xl border border-black/[0.07] bg-white p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">{requestRow.title}</div><div className="mt-1 max-w-2xl text-xs leading-5 text-[#817A72]">{requestRow.instructions || "Please provide the requested accounting evidence."}</div></div><div className="text-right"><span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${tone(requestRow.status)}`}>{label(requestRow.status)}</span><div className="mt-2 text-xs text-[#9A938B]">Due {shortDate(requestRow.due_at)}</div></div></div>{(requestRow.categories || []).length ? <div className="mt-3 flex flex-wrap gap-2">{requestRow.categories.map((category) => <span key={category.key} className={`rounded-full border px-2 py-1 text-[10px] ${category.satisfied ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-800"}`}>{category.label}: {category.linked_count}/{category.min_count}</span>)}</div> : null}<div className="mt-4 grid gap-2 md:grid-cols-[160px_1fr_110px] md:items-end">{(requestRow.categories || []).length ? <label className="text-[10px] font-medium text-[#817A72]">Category<select value={categories[requestRow.id] || requestRow.categories[0]?.key || ""} onChange={(event) => setCategories((current) => ({ ...current, [requestRow.id]: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-xs">{requestRow.categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label> : <div />}<label className="text-[10px] font-medium text-[#817A72]">Document<input type="file" onChange={(event) => setFiles((current) => ({ ...current, [requestRow.id]: event.target.files?.[0] || null }))} className="mt-1 block h-9 w-full rounded-lg border border-black/[0.09] bg-white p-1.5 text-xs" /></label><button type="button" disabled={busy || !files[requestRow.id]} onClick={() => upload(requestRow)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-[#FBF7F1] px-3 text-xs font-semibold text-[#76583A] disabled:opacity-40"><FileUp size={12} />Upload</button></div><div className="mt-3 grid gap-2 md:grid-cols-[1fr_120px] md:items-end"><label className="text-[10px] font-medium text-[#817A72]">Message to accountant<textarea value={responses[requestRow.id] || ""} onChange={(event) => setResponses((current) => ({ ...current, [requestRow.id]: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-black/[0.09] px-3 py-2 text-xs" /></label><button type="button" disabled={busy || !requestRow.ready_to_submit} onClick={() => submit(requestRow)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#76583A] px-3 text-xs font-semibold text-white disabled:opacity-35"><Send size={12} />Submit</button></div></section>)}</div>;
}
function DocumentsView({ data, openPath }) { if (!(data.documents || []).length) return <Empty icon={FolderOpen} title="No shared documents yet" body="Documents you upload for accounting requests and engagement documents intentionally shared by your accounting firm will appear here." />; return <div className="space-y-2">{data.documents.map((row) => <div key={`${row.source}-${row.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F2E9] text-[#9A7047]"><FileText size={15} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{row.name}</div><div className="mt-0.5 text-[10px] text-[#938A80]">{row.source === "ENGAGEMENT_CONTRACT" ? "Engagement document" : `Your upload${row.evidence_category ? ` · ${label(row.evidence_category)}` : ""}`} · {shortDate(row.updated_at || row.created_at)}</div></div><button onClick={() => openPath(row.open_path)} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-3 py-2 text-xs font-semibold"><Download size={12} />Open</button></div>)}</div>; }
function MessagesView({ data, message, setMessage, sendMessage, busy }) { return <div className="rounded-2xl border border-black/[0.07] bg-white p-4 md:p-5"><div className="text-sm font-semibold">Messages with your accounting team</div><div className="mt-1 text-xs text-[#918B83]">Keep accounting questions and follow-ups attached to this engagement.</div><div className="mt-4 max-h-[430px] space-y-2 overflow-y-auto rounded-xl bg-[#F8F6F2] p-3">{(data.messages || []).length ? data.messages.map((row) => <div key={row.id} className={`flex ${row.sender_type === "CLIENT" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${row.sender_type === "CLIENT" ? "bg-[#211E1A] text-white" : "border border-black/[0.06] bg-white text-[#4B453F]"}`}><div className={`mb-1 text-[9px] font-semibold ${row.sender_type === "CLIENT" ? "text-[#D6A66A]" : "text-[#9A7047]"}`}>{row.sender_type === "CLIENT" ? "You" : row.sender_name || data.portal?.firm_name}</div><div className="whitespace-pre-wrap leading-5">{row.body}</div><div className={`mt-1 text-[8px] ${row.sender_type === "CLIENT" ? "text-white/40" : "text-[#A29A91]"}`}>{String(row.created_at || "").replace("T", " ").slice(0, 16)}</div></div></div>) : <div className="py-8 text-center text-xs text-[#928A81]">No messages yet. Start a conversation below.</div>}</div><div className="mt-3 flex gap-2"><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} maxLength={4000} placeholder="Write a message to your accounting team…" className="min-w-0 flex-1 rounded-xl border border-black/[0.09] px-3 py-2 text-xs" /><button disabled={busy || !message.trim()} onClick={sendMessage} className="inline-flex w-24 items-center justify-center gap-1.5 rounded-xl bg-[#76583A] text-xs font-semibold text-white disabled:opacity-35"><Send size={12} />Send</button></div></div>; }
function TaxView({ data }) { if (!(data.filings || []).length) return <Empty icon={Landmark} title="No tax filings shared yet" body="VAT and tax filing status will appear here when it belongs to this engagement." />; return <div className="space-y-2">{data.filings.map((row) => <div key={row.id} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">VAT · {shortDate(row.period_start)} to {shortDate(row.period_end)}</div><div className="mt-1 text-xs text-[#90877E]">Due {shortDate(row.filing_due_date)}{row.jurisdiction_code ? ` · ${row.jurisdiction_code}` : ""}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${tone(row.status)}`}>{label(row.status)}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-[#F8F6F2] p-3 text-xs"><div className="text-[9px] uppercase text-[#968D83]">Tax payable</div><div className="mt-1 font-semibold">{money(row.tax_payable, row.currency_code)}</div></div><div className="rounded-xl bg-[#F8F6F2] p-3 text-xs"><div className="text-[9px] uppercase text-[#968D83]">Tax refund</div><div className="mt-1 font-semibold">{money(row.tax_refund, row.currency_code)}</div></div><div className="rounded-xl bg-[#F8F6F2] p-3 text-xs"><div className="text-[9px] uppercase text-[#968D83]">Submission</div><div className="mt-1 font-semibold">{row.submission_reference || (row.submitted_at ? shortDate(row.submitted_at) : "Not submitted")}</div></div></div></div>)}</div>; }
function BillingView({ data, openPath }) { return <div className="space-y-4"><div className="space-y-2">{(data.invoices || []).length ? data.invoices.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F2E9] text-[#9A7047]"><ReceiptText size={15} /></div><div className="min-w-[180px] flex-1"><div className="text-sm font-semibold">{row.invoice_number}</div><div className="mt-0.5 text-[10px] text-[#938A80]">Issued {shortDate(row.invoice_date)} · Due {shortDate(row.due_date)}</div></div><div className="text-right"><div className="text-sm font-semibold">{money(row.total_amount, row.currency_code)}</div><div className="text-[10px] text-[#938A80]">Outstanding {money(row.outstanding_amount, row.currency_code)}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${tone(row.status)}`}>{label(row.status)}</span><button onClick={() => openPath(row.invoice_path)} className="rounded-lg border border-black/[0.08] px-3 py-2 text-xs font-semibold">Invoice</button>{row.receipt_path ? <button onClick={() => openPath(row.receipt_path)} className="rounded-lg border border-[#A37849]/20 bg-[#FBF7F1] px-3 py-2 text-xs font-semibold text-[#76583A]">Receipt</button> : null}</div>) : <Empty icon={ReceiptText} title="No accounting-firm invoices yet" body="Invoices created from this accounting engagement will appear here automatically." />}</div>{(data.payments || []).length ? <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-sm font-semibold">Payments received</div><div className="mt-3 divide-y divide-black/[0.05]">{data.payments.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><div><b>{row.payment_number || row.reference_number || "Payment"}</b><span className="ml-2 text-[#918B83]">{shortDate(row.payment_date)}</span></div><div className="font-semibold">{money(row.allocated_amount || row.amount, row.currency_code)}</div></div>)}</div></div> : null}</div>; }
function ApprovalsView({ data, token }) { if (!(data.approvals || []).length) return <Empty icon={FileSignature} title="No approvals or signatures waiting" body="Engagement letters and signature requests addressed to this portal email will appear here." />; return <div className="space-y-2">{data.approvals.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.07] bg-white p-4"><FileSignature size={18} className="text-[#A37849]" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{row.document_name}</div><div className="mt-0.5 text-[10px] text-[#918B83]">Requested {shortDate(row.requested_at)}{row.expires_at ? ` · Expires ${shortDate(row.expires_at)}` : ""}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${tone(row.status)}`}>{label(row.status)}</span><button onClick={() => window.location.assign(`/client/accounting/${encodeURIComponent(token)}/sign/${encodeURIComponent(row.id)}`)} className="rounded-lg bg-[#76583A] px-3 py-2 text-xs font-semibold text-white">{String(row.status || "").toUpperCase() === "SIGNED" ? "View signature" : "Review & sign"}</button></div>)}</div>; }
function ContactsView({ data }) { return <div className="grid gap-3 xl:grid-cols-2"><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Building2 size={15} className="text-[#A37849]" />Your company details</div><div className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><Info label="Contact" value={data.profile?.contact_name} /><Info label="Email" value={data.profile?.contact_email} /><Info label="Phone" value={data.profile?.contact_phone} /><Info label="WhatsApp" value={data.profile?.whatsapp} /><Info label="Tax ID" value={data.profile?.tax_id} /><Info label="VAT number" value={data.profile?.vat_number} /></div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="flex items-center gap-2 text-sm font-semibold"><UserRound size={15} className="text-[#A37849]" />Your accounting team</div><div className="mt-4 space-y-3">{(data.contacts || []).length ? data.contacts.map((row, index) => <div key={`${row.role}-${index}`} className="rounded-xl bg-[#F8F6F2] p-3"><div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#9A7047]">{row.role}</div><div className="mt-1 text-sm font-semibold">{row.name}</div>{row.position ? <div className="text-[10px] text-[#918B83]">{row.position}</div> : null}{row.email ? <a href={`mailto:${row.email}`} className="mt-1 block text-xs text-[#76583A]">{row.email}</a> : null}</div>) : <div className="text-xs text-[#918B83]">Your accounting team will appear here when assigned.</div>}</div></div></div>; }
function Info({ label: name, value }) { return <div><div className="text-[9px] uppercase tracking-[0.1em] text-[#998F85]">{name}</div><div className="mt-1 font-medium text-[#49433D]">{value || "—"}</div></div>; }
