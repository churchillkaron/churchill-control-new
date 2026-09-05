"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, ChevronUp, Clock3, RefreshCw, ShieldCheck, UserCheck, Users } from "lucide-react";

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

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

const WORK_FILTERS = [
  ["PRIORITY", "Priority work"],
  ["MINE", "Mine"],
  ["UNOWNED", "Unowned"],
  ["CLIENT", "Client evidence"],
  ["DEADLINE", "Deadline ≤7d"],
  ["ACCOUNTANT", "Accountant blockers"],
  ["FILINGS", "Filing lifecycle"],
];

function ownerLabel(row) {
  if (row.owned_by_me) return "Owned by me";
  if (row.owned_by_colleague) return "Owned by colleague";
  return "Unowned";
}

function requestLabel(row) {
  const state = upper(row.client_request_state);
  if (state === "CLIENT_RESPONDED") return "Client responded";
  if (state === "WITH_CLIENT") return "With client";
  if (state === "DRAFT") return "Draft request";
  if (state === "ACCEPTED") return "Accepted";
  return row.client_evidence ? "No linked request" : "Not required";
}

export default function FinanceTaxPortfolioRail({ organizationId, entityId, selectedVatReturnId, onSelectedVatReturnIdChange }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("PRIORITY");
  const [state, setState] = useState({ loading: false, error: "", body: null });
  const [busyKey, setBusyKey] = useState("");

  async function load() {
    if (!organizationId) return;
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/tax/portfolio", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const body = await requestJson(url.toString());
      if (body.scope !== "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES") throw new Error("Tax portfolio returned an unverified practice scope. Refresh before continuing.");
      if (body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY") throw new Error("Tax portfolio did not return live-preflight resolution authority.");
      setState({ loading: false, error: "", body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax portfolio could not be loaded", body: null });
    }
  }

  useEffect(() => { if (expanded) load(); }, [expanded, organizationId]);

  const filingRows = Array.isArray(state.body?.rows) ? state.body.rows : [];
  const workRows = Array.isArray(state.body?.dependency_rows) ? state.body.dependency_rows : [];
  const summary = state.body?.dependency_summary || {};
  const visibleWorkRows = useMemo(() => workRows.filter(row => {
    if (filter === "PRIORITY") return true;
    if (filter === "MINE") return row.owned_by_me;
    if (filter === "UNOWNED") return row.unowned;
    if (filter === "CLIENT") return row.client_evidence;
    if (filter === "DEADLINE") return Number.isFinite(row.days_to_due) && row.days_to_due <= 7;
    if (filter === "ACCOUNTANT") return !row.client_evidence;
    return false;
  }), [filter, workRows]);
  const currentEntityRows = filingRows.filter(row => row.entity_id === entityId);
  const urgentCount = Number(summary.overdue || 0) + Number(summary.deadline || 0);

  function openFiling(row) {
    if (row.entity_id !== entityId) return;
    onSelectedVatReturnIdChange?.(row.vat_return_id || row.id);
    setExpanded(false);
  }

  async function takeOwnership(row) {
    if (!row?.unowned || busyKey) return;
    const key = `${row.vat_return_id}:${row.code}:TAKE_OWNERSHIP`;
    try {
      setBusyKey(key);
      setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/dependency-work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId: row.entity_id,
          vatReturnId: row.vat_return_id,
          dependencyCode: row.code,
          action: "TAKE_OWNERSHIP",
        }),
      });
      await load();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || "Tax dependency ownership could not be updated" }));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="border-b border-black/[0.07] bg-[#F7F6F3] px-4 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1760px] py-2.5">
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-3 text-left">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.07] bg-white text-[#8C6036]"><Building2 size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]">Tax control tower {urgentCount ? <span className="rounded-full border border-amber-700/15 bg-amber-50 px-1.5 py-0.5 text-[7px] tracking-normal text-amber-900">{urgentCount} deadline risk</span> : null}</span>
            <span className="mt-0.5 block text-[10px] text-[#777169]">Live statutory and accounting dependencies across authorized legal entities, with durable ownership and governed client-request context.</span>
          </span>
          {currentEntityRows.length ? <span className="hidden text-[8px] text-[#918B83] md:block">Current entity · {currentEntityRows.length} filing{currentEntityRows.length === 1 ? "" : "s"}</span> : null}
          <span className="text-[9px] font-semibold text-[#817B73]">{expanded ? "Close" : "Open portfolio"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded ? <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
          <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-4 lg:grid-cols-7">
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Open dependencies</div><div className="mt-1 text-[11px] font-semibold">{summary.total ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Mine</div><div className="mt-1 text-[11px] font-semibold">{summary.mine ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Unowned</div><div className={`mt-1 text-[11px] font-semibold ${summary.unowned ? "text-amber-900" : ""}`}>{summary.unowned ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Client evidence</div><div className="mt-1 text-[11px] font-semibold">{summary.client_evidence ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Client responded</div><div className="mt-1 text-[11px] font-semibold">{summary.client_responded ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Due ≤7d</div><div className={`mt-1 text-[11px] font-semibold ${summary.deadline ? "text-amber-900" : ""}`}>{summary.deadline ?? "—"}</div></div>
            <div className="bg-[#FAF9F7] p-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Overdue</div><div className={`mt-1 text-[11px] font-semibold ${summary.overdue ? "text-red-800" : ""}`}>{summary.overdue ?? "—"}</div></div>
          </div>

          <div className="flex flex-col gap-2 border-b border-black/[0.07] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">{WORK_FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-7 rounded-md border px-2.5 text-[8px] font-semibold ${filter === value ? "border-[#A37849]/20 bg-[#FFF9F0] text-[#76583A]" : "border-black/[0.07] bg-white text-[#777169]"}`}>{label}</button>)}</div>
            <div className="flex items-center gap-3"><span className="text-[8px] text-[#918B83]">Statutory risk first · then live blocker urgency · then coordination state.</span><button type="button" onClick={load} disabled={state.loading || Boolean(busyKey)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold disabled:opacity-40"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button></div>
          </div>

          {state.error ? <div className="border-b border-red-700/15 bg-red-50 px-3 py-2.5 text-[9px] text-red-800">{state.error}</div> : null}

          {filter !== "FILINGS" ? <div className="overflow-x-auto">
            <table className="min-w-[1240px] w-full border-collapse text-left text-[9px]">
              <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[8px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Live dependency</th><th className="px-3 py-2.5">Entity / filing</th><th className="px-3 py-2.5">Statutory due</th><th className="px-3 py-2.5">Ownership</th><th className="px-3 py-2.5">Client request</th><th className="px-3 py-2.5">Next safe action</th><th className="px-3 py-2.5">Work</th></tr></thead>
              <tbody>{visibleWorkRows.map(row => {
                const isCurrent = row.entity_id === entityId;
                const isSelected = isCurrent && row.vat_return_id === selectedVatReturnId;
                const ownershipKey = `${row.vat_return_id}:${row.code}:TAKE_OWNERSHIP`;
                return <tr key={row.id} className={`border-b border-black/[0.055] ${isSelected ? "bg-[#F5EFE7]" : isCurrent ? "bg-[#FFF9F0]/45" : "hover:bg-[#FAF9F7]"}`}>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${row.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{row.blocking ? <AlertTriangle size={9} /> : <Clock3 size={9} />}{row.blocking ? "Blocks filing" : "Review"}</span>{row.target_overdue ? <span className="rounded-md border border-red-700/15 bg-red-50 px-2 py-1 text-[7px] font-semibold text-red-800">Internal target overdue</span> : null}</div><div className="mt-1.5 max-w-[260px] font-semibold text-[#37332F]">{row.title}</div><div className="mt-0.5 max-w-[280px] text-[8px] leading-3.5 text-[#817B73]">{row.resolution_rule}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#37332F]">{row.entity_name}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{date(row.period_start)} — {date(row.period_end)} · {row.jurisdiction_code || "VAT"}</div><div className="mt-0.5 text-[7px] uppercase tracking-[0.07em] text-[#99938B]">{row.entity_code || "—"}{isCurrent ? " · current entity" : ""}</div></td>
                  <td className="px-3 py-3 font-medium">{date(row.filing_due_date)}<div className={`mt-0.5 text-[8px] ${row.days_to_due < 0 ? "text-red-800" : row.days_to_due <= 7 ? "text-amber-900" : "text-[#918B83]"}`}>{Number.isFinite(row.days_to_due) ? row.days_to_due < 0 ? `${Math.abs(row.days_to_due)}d overdue` : row.days_to_due === 0 ? "due today" : `${row.days_to_due}d left` : "governed calendar"}</div></td>
                  <td className="px-3 py-3"><div className="inline-flex items-center gap-1 font-semibold text-[#4B4640]">{row.owned_by_me ? <UserCheck size={10} /> : <Users size={10} />}{ownerLabel(row)}</div>{row.target_at ? <div className={`mt-0.5 text-[8px] ${row.target_overdue ? "text-red-800" : "text-[#918B83]"}`}>Target {date(row.target_at)}</div> : <div className="mt-0.5 text-[8px] text-[#A09A92]">No internal target</div>}{row.acknowledged_at ? <div className="mt-0.5 text-[7px] text-emerald-800">Acknowledged</div> : null}</td>
                  <td className="px-3 py-3"><div className={`font-medium ${row.client_request_state === "CLIENT_RESPONDED" ? "text-emerald-800" : "text-[#4B4640]"}`}>{requestLabel(row)}</div>{row.client_request_due_at ? <div className="mt-0.5 text-[8px] text-[#918B83]">Client due {date(row.client_request_due_at)}</div> : null}</td>
                  <td className="px-3 py-3"><div className="max-w-[250px] font-semibold leading-4 text-[#3F3A35]">{row.next_action}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{row.client_evidence ? "Client can supply evidence; accountant validates truth." : "Accounting team action."}</div></td>
                  <td className="px-3 py-3"><div className="flex flex-col gap-1.5">{row.unowned ? <button type="button" onClick={() => takeOwnership(row)} disabled={Boolean(busyKey)} className="h-8 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white disabled:opacity-35">{busyKey === ownershipKey ? "Taking…" : "Take ownership"}</button> : row.owned_by_me ? <span className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-emerald-700/15 bg-emerald-50 px-2.5 text-[8px] font-semibold text-emerald-800"><UserCheck size={9} /> Mine</span> : <span className="inline-flex h-8 items-center justify-center rounded-md border border-black/[0.07] bg-[#F4F2EE] px-2.5 text-[8px] font-semibold text-[#716B63]">Colleague owned</span>}<button type="button" onClick={() => openFiling(row)} disabled={!isCurrent || Boolean(busyKey)} className="h-8 rounded-md border border-black/[0.09] bg-white px-2.5 text-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-35">{isCurrent ? isSelected ? "Selected" : "Open filing" : "Switch entity first"}</button></div></td>
                </tr>;
              })}</tbody>
            </table>
            {!state.loading && !visibleWorkRows.length ? <div className="p-8 text-center text-[9px] text-[#8A857D]">No live Tax dependency matches this view.</div> : null}
          </div> : <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-[9px]">
              <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[8px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Filing state</th><th className="px-3 py-2.5">Entity</th><th className="px-3 py-2.5">Period</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Authority balance</th><th className="px-3 py-2.5">Next lifecycle action</th></tr></thead>
              <tbody>{filingRows.map(row => {
                const balance = row.settlement_remaining > 0 ? row.settlement_remaining : row.tax_payable > 0 ? row.tax_payable : row.tax_refund;
                const isCurrent = row.entity_id === entityId;
                return <tr key={row.id} className={`border-b border-black/[0.055] ${row.id === selectedVatReturnId ? "bg-[#F5EFE7]" : isCurrent ? "bg-[#FFF9F0]/45" : "hover:bg-[#FAF9F7]"}`}>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${laneTone(row.lane)}`}>{laneIcon(row.lane)}{row.lane.replaceAll("_", " ")}</span><div className="mt-1 max-w-[240px] text-[8px] leading-3.5 text-[#817B73]">{row.reason}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#37332F]">{row.entity_name}</div><div className="mt-0.5 text-[7px] uppercase tracking-[0.07em] text-[#99938B]">{row.entity_code || "—"}{isCurrent ? " · current" : ""}</div></td>
                  <td className="px-3 py-3">{date(row.period_start)} — {date(row.period_end)}<div className="mt-0.5 text-[8px] text-[#918B83]">{row.jurisdiction_code || "VAT"}</div></td>
                  <td className="px-3 py-3 font-medium">{date(row.filing_due_date)}{row.days_to_due !== null && row.status !== "SUBMITTED" ? <div className={`mt-0.5 text-[8px] ${row.days_to_due < 0 ? "text-red-800" : row.days_to_due <= 3 ? "text-amber-900" : "text-[#918B83]"}`}>{row.days_to_due < 0 ? `${Math.abs(row.days_to_due)}d overdue` : row.days_to_due === 0 ? "due today" : `${row.days_to_due}d left`}</div> : null}</td>
                  <td className="px-3 py-3 font-medium tabular-nums">{balance ? money(balance, row.currency_code) : "—"}<div className="mt-0.5 text-[8px] text-[#918B83]">{row.settlement_state ? row.settlement_state.replaceAll("_", " ") : row.tax_refund > 0 ? "refund" : row.tax_payable > 0 ? "payable" : "no balance"}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#3F3A35]">{row.next_action}</div><button type="button" onClick={() => openFiling({ ...row, vat_return_id: row.id })} disabled={!isCurrent || Boolean(busyKey)} className="mt-1.5 h-7 rounded-md border border-black/[0.09] bg-white px-2 text-[8px] font-semibold disabled:opacity-35">{isCurrent ? "Open filing" : "Switch entity first"}</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}

          {state.loading && !state.body ? <div className="p-8 text-center text-[9px] text-[#8A857D]">Rebuilding live Tax evidence across the authorized portfolio…</div> : null}
          <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3 py-2 text-[8px] leading-4 text-[#817B73]">Scope is limited to legal entities inside the currently authorized organization. Portfolio ownership uses the same live-preflight Tax dependency endpoint; it changes coordination only. Dependency resolution authority remains live Tax preflight only.</div>
        </div> : null}
      </div>
    </section>
  );
}
