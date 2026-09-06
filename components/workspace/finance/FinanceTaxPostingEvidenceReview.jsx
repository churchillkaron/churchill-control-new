import { ArrowUpRight } from "lucide-react";
import FinanceTaxExchangeRateEvidenceReview, { isFinanceTaxExchangeRateIssue } from "@/components/workspace/finance/FinanceTaxExchangeRateEvidenceReview";

const POSTING_ISSUE_CODES = new Set([
  "OUTPUT_NOT_POSTED",
  "OUTPUT_POSTING_REVERSED",
  "INPUT_NOT_APPROVED_POSTED",
  "INPUT_POSTING_REVERSED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

export function isFinanceTaxPostingIssue(code) {
  return POSTING_ISSUE_CODES.has(upper(code)) || isFinanceTaxExchangeRateIssue(code);
}

function postingFailureLabel(code) {
  switch (upper(code)) {
    case "OUTPUT_NOT_POSTED": return "Posted journal missing";
    case "OUTPUT_POSTING_REVERSED": return "Sales posting reversed";
    case "INPUT_NOT_APPROVED_POSTED": return "Approval / posting required";
    case "INPUT_POSTING_REVERSED": return "Purchase posting reversed";
    default: return "Posting proof required";
  }
}

function postingRepairText(code) {
  switch (upper(code)) {
    case "OUTPUT_NOT_POSTED":
      return "Open the exact customer invoice and complete governed posting until the VAT-bearing sale is backed by a valid posted, non-reversed journal.";
    case "OUTPUT_POSTING_REVERSED":
      return "Open the exact customer invoice and use the governed correction or repost path until valid non-reversed posting evidence exists.";
    case "INPUT_NOT_APPROVED_POSTED":
      return "Open the exact vendor invoice and complete the governed approval and posting flow; the invoice must be approved, posted and linked to its exact valid posted journal.";
    case "INPUT_POSTING_REVERSED":
      return "Open the exact vendor invoice and use the governed correction or repost path until its linked journal is posted and not reversed.";
    default:
      return "Open the exact source document and restore valid governed posting evidence.";
  }
}

export default function FinanceTaxPostingEvidenceReview({ issue, source, journal, navigation }) {
  if (isFinanceTaxExchangeRateIssue(issue?.code)) {
    return <FinanceTaxExchangeRateEvidenceReview issue={issue} source={source} journal={journal} navigation={navigation}/>;
  }
  if (!POSTING_ISSUE_CODES.has(upper(issue?.code))) return null;

  const output = upper(issue?.code).startsWith("OUTPUT_");
  const sourceLabel = output ? "Customer invoice" : "Vendor invoice";
  const sideLabel = output ? "Sales VAT posting" : "Purchase VAT posting";
  const journalIdentity = journal?.reference || journal?.id || null;
  const sourceStatus = upper(source?.status) || "—";
  const approvalStatus = output ? null : upper(source?.approval_status) || "—";
  const journalStatus = upper(journal?.status) || "Missing";
  const reversed = journal?.reversed === true;
  const linkProof = output
    ? journal?.source_document_id && source?.id && String(journal.source_document_id) === String(source.id)
      ? "Exact sales document link"
      : journal?.source_document_id || "No valid journal link"
    : source?.journal_entry_id && journal?.id && String(source.journal_entry_id) === String(journal.id)
      ? "Exact vendor journal link"
      : source?.journal_entry_id || "No valid journal link";

  return <div className="mt-3 overflow-hidden rounded-lg border border-red-700/15 bg-red-50/25">
    <div className="flex flex-col gap-2 border-b border-red-700/12 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-red-800">VAT posting proof</div>
        <div className="mt-1 text-[10px] font-semibold">{sideLabel} · exact source document, posting state and journal proof</div>
        <div className="mt-0.5 max-w-4xl text-[8px] leading-4 text-[#817B73]">This card presents the same posting evidence evaluated by the full live filing population. It does not post, approve, reverse or repair any accounting record.</div>
      </div>
      <span className="shrink-0 rounded-md border border-red-700/15 bg-red-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-red-800">{postingFailureLabel(issue?.code)}</span>
    </div>

    <div className="border-b border-red-700/10 bg-red-50 px-3 py-2 text-[8px] leading-4 text-red-900"><b>Calculation and filing blocked:</b> {issue?.detail}</div>

    <div className="grid gap-px bg-black/[0.05] sm:grid-cols-4">
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Source document</div><div className="mt-1 text-[9px] font-semibold">{source?.reference || source?.id || "—"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{sourceLabel} · {date(source?.date || issue?.date)}</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Document state</div><div className="mt-1 text-[9px] font-semibold">{sourceStatus}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{output ? "Sales document status" : `Approval · ${approvalStatus}`}</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">VAT amount affected</div><div className="mt-1 text-[9px] font-semibold">{money(issue?.amount)}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{source?.currency_code || "Document currency"}</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Posting link</div><div className={`mt-1 break-all text-[9px] font-semibold ${journalIdentity ? "text-[#4E4943]" : "text-red-800"}`}>{journalIdentity || "Missing"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{linkProof}</div></div>
    </div>

    <div className="grid gap-2 p-3 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="overflow-hidden rounded-lg border border-black/[0.06] bg-white">
        <div className="border-b bg-[#FAF9F7] px-2.5 py-2 text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Posting journal proof</div>
        <div className="grid gap-px bg-black/[0.05] sm:grid-cols-4">
          <div className="bg-white p-2.5"><div className="text-[7px] uppercase text-[#968F87]">Journal</div><div className="mt-1 text-[8px] font-semibold">{journalIdentity || "Missing"}</div></div>
          <div className="bg-white p-2.5"><div className="text-[7px] uppercase text-[#968F87]">Journal status</div><div className={`mt-1 text-[8px] font-semibold ${journalStatus === "POSTED" ? "text-[#4E4943]" : "text-red-800"}`}>{journalStatus}</div></div>
          <div className="bg-white p-2.5"><div className="text-[7px] uppercase text-[#968F87]">Posting date</div><div className="mt-1 text-[8px] font-semibold">{date(journal?.posting_date)}</div></div>
          <div className="bg-white p-2.5"><div className="text-[7px] uppercase text-[#968F87]">Reversed</div><div className={`mt-1 text-[8px] font-semibold ${reversed ? "text-red-800" : journal ? "text-emerald-800" : "text-red-800"}`}>{journal ? reversed ? "Yes" : "No" : "No journal"}</div></div>
        </div>
      </div>
      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5">
        <div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">What the accountant fixes</div>
        <div className="mt-1 text-[9px] font-semibold text-[#4E4943]">{postingRepairText(issue?.code)}</div>
        <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Evidence cannot post, approve, unreverse or mark this blocker fixed. Live Tax preflight clears it only after governed source accounting truth satisfies the posting predicate.</div>
      </div>
    </div>

    <div className="flex flex-col gap-2 border-t border-red-700/12 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[8px] font-semibold text-red-800">Blocking · the source document and posting journal remain authoritative.</div>
      {navigation?.href ? <a href={navigation.href} className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">{output ? "Fix this sales posting" : "Fix this purchase posting"} <ArrowUpRight size={9}/></a> : <span className="text-[8px] font-semibold text-[#918B83]">Exact source route unavailable</span>}
    </div>
  </div>;
}
