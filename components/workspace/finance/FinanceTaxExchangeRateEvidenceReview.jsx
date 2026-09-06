import { ArrowUpRight } from "lucide-react";

const EXCHANGE_RATE_ISSUE_CODES = new Set([
  "OUTPUT_EXCHANGE_RATE_MISSING",
  "INPUT_EXCHANGE_RATE_MISSING",
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

function exchangeRatePresentation(value) {
  const raw = text(value);
  if (!raw) return { state: "Missing", value: "Missing" };
  const number = Number(value);
  if (!Number.isFinite(number)) return { state: "Invalid", value: raw };
  if (number === 0) return { state: "Zero", value: "0" };
  return {
    state: "Stored",
    value: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 8 }).format(number),
  };
}

export function isFinanceTaxExchangeRateIssue(code) {
  return EXCHANGE_RATE_ISSUE_CODES.has(upper(code));
}

export default function FinanceTaxExchangeRateEvidenceReview({ issue, source, journal, navigation }) {
  if (!isFinanceTaxExchangeRateIssue(issue?.code)) return null;

  const output = upper(issue?.code).startsWith("OUTPUT_");
  const sourceLabel = output ? "Customer invoice" : "Vendor invoice";
  const sideLabel = output ? "Sales VAT conversion" : "Purchase VAT conversion";
  const rate = exchangeRatePresentation(source?.exchange_rate);
  const postingContext = journal
    ? `${journal.reference || journal.id || "Journal"} · ${journal.status || "—"}${journal.reversed ? " · reversed" : ""}`
    : "No posting journal needed to identify this FX blocker";

  return <div className="mt-3 overflow-hidden rounded-lg border border-red-700/15 bg-red-50/25">
    <div className="flex flex-col gap-2 border-b border-red-700/12 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-red-800">VAT exchange-rate proof</div>
        <div className="mt-1 text-[10px] font-semibold">{sideLabel} · exact foreign-currency source document</div>
        <div className="mt-0.5 max-w-4xl text-[8px] leading-4 text-[#817B73]">This is presentation of the same full-population FX blocker decided by live Tax preflight. Evidence does not create a second exchange-rate rule or infer a replacement rate.</div>
      </div>
      <span className="shrink-0 rounded-md border border-red-700/15 bg-red-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-red-800">{rate.state} FX rate</span>
    </div>

    <div className="border-b border-red-700/10 bg-red-50 px-3 py-2 text-[8px] leading-4 text-red-900"><b>Calculation and filing blocked:</b> {issue?.detail}</div>

    <div className="grid gap-px bg-black/[0.05] sm:grid-cols-4">
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Source document</div><div className="mt-1 text-[9px] font-semibold">{source?.reference || source?.id || "—"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{sourceLabel} · {date(source?.date || issue?.date)}</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Document currency</div><div className="mt-1 text-[9px] font-semibold">{source?.currency_code || "Missing"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">Stored on the exact source document</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Stored exchange rate</div><div className="mt-1 text-[9px] font-semibold text-red-800">{rate.value}</div><div className="mt-0.5 text-[7px] text-[#918B83]">Source state · {rate.state}</div></div>
      <div className="bg-white p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">VAT amount affected</div><div className="mt-1 text-[9px] font-semibold">{money(issue?.amount)}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{source?.currency_code || "Document currency"}</div></div>
    </div>

    <div className="grid gap-2 p-3 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5">
        <div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Governed functional-currency requirement</div>
        <div className="mt-1 text-[9px] font-semibold text-[#4E4943]">{issue?.detail || "Live Tax preflight requires governed foreign-currency conversion evidence."}</div>
        <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Live Tax preflight names the functional currency in this governed blocker detail. Evidence deliberately does not parse or re-derive that accounting context.</div>
        <div className="mt-2 text-[7px] text-[#918B83]">Posting context · {postingContext}</div>
      </div>
      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5">
        <div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">What the accountant fixes</div>
        <div className="mt-1 text-[9px] font-semibold text-[#4E4943]">Open the exact {output ? "customer" : "vendor"} invoice and correct its governed exchange-rate evidence. Do not substitute an implicit 1.0 rate.</div>
        <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Evidence cannot write, approve or infer an exchange rate. Live Tax preflight re-evaluates the source document after the governed accounting record changes.</div>
      </div>
    </div>

    <div className="flex flex-col gap-2 border-t border-red-700/12 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[8px] font-semibold text-red-800">Blocking · only corrected source accounting truth can clear this FX control.</div>
      {navigation?.href ? <a href={navigation.href} className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">{output ? "Fix this sales exchange rate" : "Fix this purchase exchange rate"} <ArrowUpRight size={9}/></a> : <span className="text-[8px] font-semibold text-[#918B83]">Exact source route unavailable</span>}
    </div>
  </div>;
}
