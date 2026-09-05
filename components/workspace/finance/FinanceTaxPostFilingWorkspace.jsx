"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FilePenLine, Landmark, RefreshCw, ShieldCheck } from "lucide-react";

import FinanceTaxAmendmentRail from "./FinanceTaxAmendmentRail";
import FinanceTaxSettlementRail from "./FinanceTaxSettlementRail";

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function amendmentChain(row) {
  const raw = row?.metadata?.tax_amendments;
  return {
    active: raw?.active && typeof raw.active === "object" ? raw.active : null,
    history: Array.isArray(raw?.history) ? raw.history : [],
  };
}

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function settlementNext(state) {
  const value = upper(state);
  if (value === "SETTLEMENT_SETUP_REQUIRED") return "Map the governed VAT control accounts.";
  if (value === "LIABILITY_POSTING_REQUIRED") return "Post the filed VAT position into settlement control.";
  if (["PAYMENT_DUE", "PART_PAID"].includes(value)) return "Record the authority payment and keep the remaining balance visible.";
  if (["REFUND_DUE", "PART_REFUNDED"].includes(value)) return "Record the authority refund and keep the remaining balance visible.";
  if (["PAID_AWAITING_BANK_MATCH", "REFUNDED_AWAITING_BANK_MATCH"].includes(value)) return "Match the cash event to reconciled bank evidence.";
  if (value === "NO_BALANCE") return "No authority cash balance remains for this filed version.";
  if (value === "CLEARED") return "Filed VAT is cleared through accounting and bank evidence.";
  return "Review the filed VAT settlement evidence.";
}

function stateTone(state) {
  const value = upper(state);
  if (["CLEARED", "NO_BALANCE"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["SETTLEMENT_SETUP_REQUIRED", "LIABILITY_POSTING_REQUIRED", "PAYMENT_DUE", "REFUND_DUE"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-900";
  if (["PART_PAID", "PART_REFUNDED", "PAID_AWAITING_BANK_MATCH", "REFUNDED_AWAITING_BANK_MATCH"].includes(value)) return "border-[#A37849]/18 bg-[#FFF9F0] text-[#76583A]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

export default function FinanceTaxPostFilingWorkspace({ organizationId, entityId, selectedVatReturnId, onStageChange }) {
  const [state, setState] = useState({ loading: false, error: "", row: null, settlement: null });
  const [mode, setMode] = useState("SETTLEMENT");

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", row: null, settlement: null });
      return;
    }

    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const taxUrl = new URL("/api/finance/tax/runtime", window.location.origin);
      taxUrl.searchParams.set("organizationId", organizationId);
      taxUrl.searchParams.set("entityId", entityId);
      taxUrl.searchParams.set("vatReturnId", selectedVatReturnId);
      const tax = await requestJson(taxUrl.toString());
      const row = tax?.preflight?.return || null;
      if (!row || row.id !== selectedVatReturnId) throw new Error("Post-filing Tax work could not resolve the selected VAT filing. Refresh Tax before continuing.");

      if (upper(row.status) !== "SUBMITTED") {
        setMode("SETTLEMENT");
        setState({ loading: false, error: "", row, settlement: null });
        return;
      }

      const settlementUrl = new URL("/api/finance/vat-returns/settlement", window.location.origin);
      settlementUrl.searchParams.set("organizationId", organizationId);
      settlementUrl.searchParams.set("entityId", entityId);
      settlementUrl.searchParams.set("vatReturnId", selectedVatReturnId);
      const settlementBody = await requestJson(settlementUrl.toString());
      if (settlementBody?.return?.id !== selectedVatReturnId) throw new Error("Post-filing settlement evidence resolved a different VAT filing. Refresh Tax before continuing.");

      const chain = amendmentChain(row);
      setMode(chain.active ? "AMENDMENT" : "SETTLEMENT");
      setState({ loading: false, error: "", row, settlement: settlementBody?.settlement || null });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Post-filing Tax work could not be loaded", row: null, settlement: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  if (!organizationId || !entityId || !selectedVatReturnId) return null;

  const row = state.row;
  const chain = amendmentChain(row);
  const activeAmendment = chain.active;
  const settlementState = state.settlement?.state || null;
  const submitted = upper(row?.status) === "SUBMITTED";
  const recommendedMode = activeAmendment ? "AMENDMENT" : "SETTLEMENT";
  const nextTitle = activeAmendment
    ? `Finish ${activeAmendment.label || "the open amendment"} before treating the revised filing as final.`
    : settlementNext(settlementState);

  return <>
    <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white text-[#2A2723] shadow-[0_10px_35px_rgba(35,31,27,0.04)]">
        <div className="flex flex-col gap-3 border-b border-black/[0.07] p-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Post-filing close</span>
              {submitted ? <span className="rounded-md border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-emerald-800">Authority filing recorded</span> : null}
              {activeAmendment ? <span className="rounded-md border border-amber-700/15 bg-amber-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-amber-900">Amendment open</span> : null}
              {settlementState ? <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${stateTone(settlementState)}`}>{settlementState.replaceAll("_", " ")}</span> : null}
            </div>
            <div className="mt-1 text-[13px] font-semibold">One close path after filing: correct only if wrong, then clear the filed balance.</div>
            <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Amendment is the exception path. Settlement is the normal close path. Avantiqo keeps the original filing immutable, then carries the latest filed version through liability posting, payment or refund, and reconciled bank evidence.</div>
          </div>
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold disabled:opacity-40"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh filed state</button>
        </div>

        {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
        {state.loading && !row ? <div className="p-4 text-[9px] text-[#817B73]">Rebuilding filed version, amendment and settlement evidence…</div> : null}

        {row && !submitted ? <div className="p-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-amber-950"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><div><div className="text-[10px] font-semibold">Post-filing work starts only after a real authority submission is recorded.</div><div className="mt-1 text-[9px] leading-4 text-amber-900/80">This filing is currently {upper(row.status) || "not submitted"}. Return to the filing stage rather than creating settlement or amendment evidence early.</div><button type="button" onClick={() => onStageChange?.("RETURN")} className="mt-2 h-8 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white">Return to filing</button></div></div>
        </div> : null}

        {row && submitted ? <>
          <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Filed return</div><div className="mt-1 text-[10px] font-semibold">{row.jurisdiction_code || "VAT"} · {date(row.period_start)} — {date(row.period_end)}</div></div>
            <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Authority reference</div><div className="mt-1 text-[10px] font-semibold">{row.submission_reference || "Recorded filing · receipt reference missing"}</div></div>
            <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Filed version chain</div><div className="mt-1 text-[10px] font-semibold">Original + {chain.history.length} filed amendment{chain.history.length === 1 ? "" : "s"}</div></div>
            <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Recommended next</div><div className="mt-1 text-[10px] font-semibold leading-4">{nextTitle}</div></div>
          </div>

          <div className="p-4">
            <div className="grid gap-2 lg:grid-cols-2">
              <button type="button" onClick={() => setMode("SETTLEMENT")} className={`rounded-xl border p-3 text-left ${mode === "SETTLEMENT" ? "border-[#8C6036]/30 bg-[#FFF9F0]" : "border-black/[0.07] bg-white"}`}>
                <div className="flex items-center gap-2"><Landmark size={13} className="text-[#8C6036]" /><span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6B655E]">Settlement & bank evidence</span>{recommendedMode === "SETTLEMENT" ? <span className="rounded-md bg-[#1F1E1B] px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.06em] text-white">Next</span> : null}</div>
                <div className="mt-1.5 text-[10px] font-semibold">{settlementNext(settlementState)}</div>
                <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Post the latest filed version, settle cash, then prove the bank match. Paid alone is not cleared.</div>
              </button>
              <button type="button" onClick={() => setMode("AMENDMENT")} className={`rounded-xl border p-3 text-left ${mode === "AMENDMENT" ? "border-[#8C6036]/30 bg-[#FFF9F0]" : "border-black/[0.07] bg-white"}`}>
                <div className="flex items-center gap-2"><FilePenLine size={13} className="text-[#8C6036]" /><span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6B655E]">Filed correction</span>{recommendedMode === "AMENDMENT" ? <span className="rounded-md bg-[#1F1E1B] px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.06em] text-white">Next</span> : null}</div>
                <div className="mt-1.5 text-[10px] font-semibold">{activeAmendment ? `${activeAmendment.label || "Amendment"} · ${activeAmendment.status || "OPEN"}` : "Use only when the filed return is actually wrong."}</div>
                <div className="mt-1 text-[8px] leading-4 text-[#817B73]">The original filing is never rewritten. Every correction gets fresh evidence, a deterministic delta and a new authority receipt.</div>
              </button>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5 text-[8px] leading-4 text-[#716B63]"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-[#9A7045]" /><div>One work surface is shown at a time. Switching views does not change accounting truth, amendment state, settlement state or authority evidence.</div></div>
          </div>
        </> : null}
      </div>
    </section>

    {row && submitted && mode === "SETTLEMENT" ? <FinanceTaxSettlementRail organizationId={organizationId} entityId={entityId} selectedVatReturnId={selectedVatReturnId} /> : null}
    {row && submitted && mode === "AMENDMENT" ? <FinanceTaxAmendmentRail organizationId={organizationId} entityId={entityId} selectedVatReturnId={selectedVatReturnId} /> : null}

    {row && submitted && settlementState && ["CLEARED", "NO_BALANCE"].includes(upper(settlementState)) && !activeAmendment ? <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6"><div className="flex items-start gap-2 rounded-xl border border-emerald-700/15 bg-emerald-50 p-3 text-[9px] text-emerald-800"><CheckCircle2 size={13} className="mt-0.5 shrink-0" /><div><b>Post-filing close is complete for the latest filed version.</b> Leave the filing untouched unless real correction evidence requires a governed amendment.</div></div></section> : null}
  </>;
}
