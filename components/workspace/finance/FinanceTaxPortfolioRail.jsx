"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, ChevronUp, Clock3, RefreshCw, ShieldCheck } from "lucide-react";

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function money(value, currency = "THB") {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

function laneTone(lane) {
  const value = upper(lane);
  if (value === "OVERDUE") return "border-red-700/15 bg-red-50 text-red-800";
  if (["DEADLINE", "AMENDMENT", "SETTLEMENT"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-900";
  if (["CLEARED", "COMPLETE"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function laneIcon(lane) {
  const value = upper(lane);
  if (value === "OVERDUE") return <AlertTriangle size={11} />;
  if (["DEADLINE", "UPCOMING"].includes(value)) return <Clock3 size={11} />;
  return <ShieldCheck size={11} />;
}

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

const FILTERS = [
  ["ACTION", "Needs action"],
  ["OVERDUE", "Overdue"],
  ["DEADLINE", "Deadline"],
  ["AMENDMENT", "Amendments"],
  ["SETTLEMENT", "Settlement"],
  ["ALL", "All filings"],
];

export default function FinanceTaxPortfolioRail({ organizationId, entityId }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("ACTION");
  const [state, setState] = useState({ loading: false, error: "", body: null });

  async function load() {
    if (!organizationId) return;
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/tax/portfolio", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const body = await requestJson(url.toString());
      setState({ loading: false, error: "", body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax portfolio could not be loaded", body: null });
    }
  }

  useEffect(() => { if (expanded) load(); }, [expanded, organizationId]);

  const rows = Array.isArray(state.body?.rows) ? state.body.rows : [];
  const visibleRows = useMemo(() => rows.filter(row => {
    if (filter === "ALL") return true;
    if (filter === "ACTION") return !["CLEARED", "COMPLETE"].includes(row.lane);
    return row.lane === filter;
  }), [filter, rows]);
  const currentEntityRows = rows.filter(row => row.entity_id === entityId);
  const urgentCount = rows.filter(row => ["OVERDUE", "DEADLINE", "AMENDMENT", "SETTLEMENT"].includes(row.lane)).length;

  return (
    <section className="border-b border-black/[0.07] bg-[#F7F6F3] px-4 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1760px] py-2.5">
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-3 text-left">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.07] bg-white text-[#8C6036]"><Building2 size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]">Tax control tower {urgentCount ? <span className="rounded-full border border-amber-700/15 bg-amber-50 px-1.5 py-0.5 text-[7px] tracking-normal text-amber-900">{urgentCount} priority</span> : null}</span>
            <span className="mt-0.5 block text-[10px] text-[#777169]">Firm-wide work order across legal entities · statutory deadlines, amendments, authority balances and bank-clearance evidence in one queue.</span>
          </span>
          {currentEntityRows.length ? <span className="hidden text-[8px] text-[#918B83] md:block">Current entity · {currentEntityRows.length} filing{currentEntityRows.length === 1 ? "" : "s"}</span> : null}
          <span className="text-[9px] font-semibold text-[#817B73]">{expanded ? "Close" : "Open portfolio"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded ? <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
          <div className="flex flex-col gap-2 border-b border-black/[0.07] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">{FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-7 rounded-md border px-2.5 text-[8px] font-semibold ${filter === value ? "border-[#A37849]/20 bg-[#FFF9F0] text-[#76583A]" : "border-black/[0.07] bg-white text-[#777169]"}`}>{label}</button>)}</div>
            <div className="flex items-center gap-3"><span className="text-[8px] text-[#918B83]">Ranked by statutory risk and unresolved accounting control—not alphabetical order.</span><button type="button" onClick={load} disabled={state.loading} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button></div>
          </div>

          {state.error ? <div className="border-b border-red-700/15 bg-red-50 px-3 py-2.5 text-[9px] text-red-800">{state.error}</div> : null}

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-[9px]">
              <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[8px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Priority work</th><th className="px-3 py-2.5">Entity</th><th className="px-3 py-2.5">Period</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Filing</th><th className="px-3 py-2.5">Authority balance</th><th className="px-3 py-2.5">Next human action</th></tr></thead>
              <tbody>{visibleRows.map(row => {
                const balance = row.settlement_remaining > 0 ? row.settlement_remaining : row.tax_payable > 0 ? row.tax_payable : row.tax_refund;
                const isCurrent = row.entity_id === entityId;
                return <tr key={row.id} className={`border-b border-black/[0.055] ${isCurrent ? "bg-[#FFF9F0]/60" : "hover:bg-[#FAF9F7]"}`}>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${laneTone(row.lane)}`}>{laneIcon(row.lane)}{row.lane.replaceAll("_", " ")}</span><div className="mt-1 max-w-[240px] text-[8px] leading-3.5 text-[#817B73]">{row.reason}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#37332F]">{row.entity_name}</div><div className="mt-0.5 text-[7px] uppercase tracking-[0.07em] text-[#99938B]">{row.entity_code || "—"}{isCurrent ? " · current" : ""}</div></td>
                  <td className="px-3 py-3">{date(row.period_start)} — {date(row.period_end)}<div className="mt-0.5 text-[8px] text-[#918B83]">{row.jurisdiction_code || "VAT"}</div></td>
                  <td className="px-3 py-3 font-medium">{date(row.filing_due_date)}{row.days_to_due !== null && row.status !== "SUBMITTED" ? <div className={`mt-0.5 text-[8px] ${row.days_to_due < 0 ? "text-red-800" : row.days_to_due <= 3 ? "text-amber-900" : "text-[#918B83]"}`}>{row.days_to_due < 0 ? `${Math.abs(row.days_to_due)}d overdue` : row.days_to_due === 0 ? "due today" : `${row.days_to_due}d left`}</div> : null}</td>
                  <td className="px-3 py-3"><div className="font-medium">{row.status}</div>{row.amendment_active ? <div className="mt-0.5 text-[8px] text-amber-900">{row.amendment_active.label} · {row.amendment_active.status}</div> : row.amendment_count ? <div className="mt-0.5 text-[8px] text-[#918B83]">{row.amendment_count} filed amendment{row.amendment_count === 1 ? "" : "s"}</div> : null}</td>
                  <td className="px-3 py-3 font-medium tabular-nums">{balance ? money(balance, row.currency_code) : "—"}<div className="mt-0.5 text-[8px] text-[#918B83]">{row.settlement_state ? row.settlement_state.replaceAll("_", " ") : row.tax_refund > 0 ? "refund" : row.tax_payable > 0 ? "payable" : "no balance"}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#3F3A35]">{row.next_action}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{isCurrent ? "Work in the filing cockpit below." : "Switch legal entity in Business Context to work this item."}</div></td>
                </tr>;
              })}</tbody>
            </table>
            {!state.loading && !visibleRows.length ? <div className="p-8 text-center text-[9px] text-[#8A857D]">No tax work matches this lane.</div> : null}
            {state.loading && !state.body ? <div className="p-8 text-center text-[9px] text-[#8A857D]">Building the governed tax work order…</div> : null}
          </div>
        </div> : null}
      </div>
    </section>
  );
}
