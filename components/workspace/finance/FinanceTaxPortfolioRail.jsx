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

function clientDependencyTone(state) {
  const value = upper(state);
  if (value === "CLIENT_RESPONDED") return "text-emerald-800";
  if (["ACCESS_EXPIRED", "FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP", "NOT_ISSUED", "REQUEST_MISSING"].includes(value)) return "text-amber-900";
  return "text-[#4B4640]";
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
  ["CLIENT_RESPONDED", "Client responded"],
  ["FOLLOW_UP", "Follow-up due"],
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
  if (row.client_dependency_title) return row.client_dependency_title;
  const state = upper(row.client_request_state);
  if (state === "CLIENT_RESPONDED") return "Client responded";
  if (state === "WITH_CLIENT") return "With client";
  if (state === "DRAFT") return "Draft request";
  if (state === "ACCEPTED") return "Accepted";
  return row.client_evidence ? "No linked request" : "Not required";
}

export default function FinanceTaxPortfolioRail({ organizationId, entityId, selectedVatReturnId, onSelectedVatReturnIdChange }) {
  const [expanded, setExpanded] = useState(true);
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

  useEffect(() => { load(); }, [organizationId]);

  const filingRows = Array.isArray(state.body?.rows) ? state.body.rows : [];
  const workRows = Array.isArray(state.body?.dependency_rows) ? state.body.dependency_rows : [];
  const summary = state.body?.dependency_summary || {};
  const filingSummary = state.body?.summary || {};
  const visibleWorkRows = useMemo(() => workRows.filter(row => {
    if (filter === "PRIORITY") return true;
    if (filter === "MINE") return row.owned_by_me;
    if (filter === "UNOWNED") return row.unowned;
    if (filter === "CLIENT") return row.client_evidence;
    if (filter === "CLIENT_RESPONDED") return row.client_dependency_state === "CLIENT_RESPONDED";
    if (filter === "FOLLOW_UP") return ["FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP"].includes(row.client_dependency_state);
    if (filter === "DEADLINE") return Number.isFinite(row.days_to_due) && row.days_to_due <= 7;
    if (filter === "ACCOUNTANT") return !row.client_evidence;
    return false;
  }), [filter, workRows]);
  const deadlineRunway = useMemo(() => filingRows
    .filter(row => row.status !== "SUBMITTED" && row.filing_due_date)
    .sort((left, right) => String(left.filing_due_date || "9999-12-31").localeCompare(String(right.filing_due_date || "9999-12-31"))
      || String(left.entity_name || "").localeCompare(String(right.entity_name || "")))
    .slice(0, 5), [filingRows]);
  const currentEntityRows = filingRows.filter(row => row.entity_id === entityId);
  const nextWork = workRows[0] || null;
  const urgentCount = Number(filingSummary.overdue || 0) + Number(filingSummary.due_14_days || 0);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && state.body && !state.loading) load();
  }

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

  const nextIsCurrent = nextWork?.entity_id === entityId;
  const nextOwnershipKey = nextWork ? `${nextWork.vat_return_id}:${nextWork.code}:TAKE_OWNERSHIP` : "";

  return (
    <section className="border-b border-black/[0.07] bg-[#F7F6F3] px-4 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1760px] py-2.5">
        <button type="button" onClick={toggleExpanded} className="flex w-full items-center gap-3 text-left">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.07] bg-white text-[#8C6036]"><Building2 size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]">Tax control tower {urgentCount ? <span className="rounded-full border border-amber-700/15 bg-amber-50 px-1.5 py-0.5 text-[7px] tracking-normal text-amber-900">{urgentCount} filing deadline risk</span> : null}</span>
            <span className="mt-0.5 block text-[10px] text-[#777169]">One priority queue across authorized legal entities. Start with the live next action, then work the exact filing without weakening Business Context or Tax truth.</span>
          </span>
          {currentEntityRows.length ? <span className="hidden text-[8px] text-[#918B83] md:block">Current entity · {currentEntityRows.length} filing{currentEntityRows.length === 1 ? "" : "s"}</span> : null}
          <span className="text-[9px] font-semibold text-[#817B73]">{expanded ? "Close" : "Open portfolio"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded ? <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
          <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,0.8fr)]">
            <div className="bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]">Next tax work</div>
                  <div className="mt-1 text-[10px] text-[#817B73]">One primary task first. The queue below stays ordered by statutory risk, live blocker urgency and safe coordination.</div>
                </div>
                {state.loading ? <RefreshCw size={12} className="animate-spin text-[#A37849]" /> : null}
              </div>

              {nextWork ? <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFF9F0] p-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${nextWork.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{nextWork.blocking ? "Blocks filing" : "Review"}</span>
                      <span className="rounded-md border border-black/[0.07] bg-white px-2 py-1 text-[7px] font-semibold text-[#716B63]">{ownerLabel(nextWork)}</span>
                      {nextWork.client_should_wait ? <span className="rounded-md border border-black/[0.07] bg-[#F4F2EE] px-2 py-1 text-[7px] font-semibold text-[#716B63]">Do not chase client</span> : null}
                    </div>
                    <div className="mt-2 text-[13px] font-semibold tracking-[-0.01em] text-[#312E2A]">{nextWork.title}</div>
                    <div className="mt-1 text-[9px] text-[#716B63]">{nextWork.entity_name} · {date(nextWork.period_start)} — {date(nextWork.period_end)}</div>
                    <div className="mt-2 max-w-3xl text-[9px] leading-4 text-[#817B73]">{nextWork.detail}</div>
                    <div className="mt-2 rounded-lg border border-black/[0.05] bg-white px-3 py-2.5">
                      <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#968F87]">Next safe action</div>
                      <div className="mt-1 text-[10px] font-semibold text-[#3F3A35]">{nextWork.client_dependency_action || nextWork.next_action}</div>
                    </div>
                  </div>
                  <div className="w-full shrink-0 lg:w-[210px]">
                    <div className="rounded-lg border border-black/[0.06] bg-white p-2.5 text-[8px] leading-4 text-[#817B73]">
                      <div className="font-semibold text-[#4B4640]">Due {date(nextWork.filing_due_date)}</div>
                      <div>{Number.isFinite(nextWork.days_to_due) ? nextWork.days_to_due < 0 ? `${Math.abs(nextWork.days_to_due)} days overdue` : nextWork.days_to_due === 0 ? "Due today" : `${nextWork.days_to_due} days left` : "Governed calendar"}</div>
                      {nextWork.target_at ? <div className={nextWork.target_overdue ? "text-red-800" : ""}>Internal target {date(nextWork.target_at)}</div> : null}
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {nextWork.unowned ? <button type="button" onClick={() => takeOwnership(nextWork)} disabled={Boolean(busyKey)} className="h-9 rounded-md bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-35">{busyKey === nextOwnershipKey ? "Taking…" : "Take ownership"}</button> : nextWork.owned_by_me && nextIsCurrent ? <button type="button" onClick={() => openFiling(nextWork)} disabled={Boolean(busyKey)} className="h-9 rounded-md bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-35">Open filing</button> : nextWork.owned_by_me ? <span className="inline-flex h-9 items-center justify-center rounded-md border border-black/[0.08] bg-[#F4F2EE] px-3 text-[9px] font-semibold text-[#716B63]">Switch entity first</span> : <span className="inline-flex h-9 items-center justify-center rounded-md border border-black/[0.08] bg-[#F4F2EE] px-3 text-[9px] font-semibold text-[#716B63]">Colleague owned</span>}
                      {nextWork.unowned && nextIsCurrent ? <button type="button" onClick={() => openFiling(nextWork)} disabled={Boolean(busyKey)} className="h-8 rounded-md border border-black/[0.09] bg-white px-3 text-[8px] font-semibold disabled:opacity-35">Open filing</button> : null}
                      {!nextIsCurrent ? <div className="text-center text-[7px] leading-3 text-[#99938B]">Business Context stays fixed until the legal entity is deliberately switched.</div> : null}
                    </div>
                  </div>
                </div>
              </div> : !state.loading ? <div className="mt-3 rounded-xl border border-emerald-700/15 bg-emerald-50 p-4 text-[9px] text-emerald-800">No open VAT dependency is waiting in the live portfolio.</div> : null}
            </div>

            <div className="bg-[#FAF9F7] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Statutory deadline runway</div>
                  <div className="mt-1 text-[9px] text-[#918B83]">Next unfiled VAT obligations across the authorized practice.</div>
                </div>
                <div className="shrink-0 text-right text-[7px] leading-3.5 text-[#817B73]"><div><b className={filingSummary.overdue ? "text-red-800" : "text-[#4B4640]"}>{filingSummary.overdue ?? "—"}</b> overdue</div><div><b className={filingSummary.due_14_days ? "text-amber-900" : "text-[#4B4640]"}>{filingSummary.due_14_days ?? "—"}</b> due ≤14d</div></div>
              </div>

              {deadlineRunway.length ? <div className="mt-3 overflow-hidden rounded-lg border border-black/[0.06] bg-white">
                {deadlineRunway.map((row, index) => {
                  const isCurrent = row.entity_id === entityId;
                  return <div key={row.id} className="flex items-center gap-3 border-b border-black/[0.055] px-3 py-2.5 last:border-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[9px] font-semibold ${row.days_to_due < 0 ? "border-red-700/15 bg-red-50 text-red-800" : row.days_to_due <= 7 ? "border-amber-700/15 bg-amber-50 text-amber-900" : "border-black/[0.07] bg-[#FAF9F7] text-[#716B63]"}`}>{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-[9px] font-semibold text-[#3D3934]">{row.entity_name}</span><span className={`rounded-md border px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-[0.06em] ${laneTone(row.lane)}`}>{row.lane.replaceAll("_", " ")}</span></div>
                      <div className="mt-0.5 text-[7px] text-[#918B83]">{date(row.period_start)} — {date(row.period_end)}</div>
                      <div className="mt-0.5 text-[8px] font-medium text-[#5E5952]">Due {date(row.filing_due_date)} · {row.days_to_due < 0 ? `${Math.abs(row.days_to_due)}d overdue` : row.days_to_due === 0 ? "today" : `${row.days_to_due}d left`}</div>
                    </div>
                    <button type="button" onClick={() => openFiling({ ...row, vat_return_id: row.id })} disabled={!isCurrent || Boolean(busyKey)} className="h-7 shrink-0 rounded-md border border-black/[0.09] bg-white px-2 text-[7px] font-semibold disabled:cursor-not-allowed disabled:opacity-35">{isCurrent ? "Open" : "Switch entity"}</button>
                  </div>;
                })}
              </div> : !state.loading ? <div className="mt-3 rounded-lg border border-emerald-700/15 bg-emerald-50 px-3 py-3 text-[8px] text-emerald-800">No unfiled VAT deadline is waiting in the current practice scope.</div> : null}

              <div className="mt-3 text-[8px] leading-4 text-[#817B73]">Ordered by governed filing date, not client chasing. {filingSummary.amendments_open ?? 0} amendment{Number(filingSummary.amendments_open || 0) === 1 ? "" : "s"} and {filingSummary.settlement_attention ?? 0} settlement item{Number(filingSummary.settlement_attention || 0) === 1 ? "" : "s"} stay in the lifecycle queue after filing.</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-b border-black/[0.07] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[9px] font-semibold text-[#403C37]">Priority queue</div>
              <div className="mt-0.5 text-[8px] text-[#918B83]">{filter === "FILINGS" ? `${filingRows.length} filing lifecycle records` : `${visibleWorkRows.length} live work item${visibleWorkRows.length === 1 ? "" : "s"}`} · resolution remains live Tax preflight only.</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">{WORK_FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-7 rounded-md border px-2.5 text-[8px] font-semibold ${filter === value ? "border-[#A37849]/20 bg-[#FFF9F0] text-[#76583A]" : "border-black/[0.07] bg-white text-[#777169]"}`}>{label}</button>)}<button type="button" onClick={load} disabled={state.loading || Boolean(busyKey)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold disabled:opacity-40"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button></div>
          </div>

          <div className="border-b border-black/[0.06] bg-[#FAF9F7] px-3 py-2 text-[8px] text-[#918B83]">Statutory risk first · live blocker urgency · then safe coordination. Client chasing never clears Tax truth.</div>
          {state.error ? <div className="border-b border-red-700/15 bg-red-50 px-3 py-2.5 text-[9px] text-red-800">{state.error}</div> : null}

          {filter !== "FILINGS" ? <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full border-collapse text-left text-[9px]">
              <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[8px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Live dependency</th><th className="px-3 py-2.5">Entity / filing</th><th className="px-3 py-2.5">Statutory due</th><th className="px-3 py-2.5">Ownership</th><th className="px-3 py-2.5">Client dependency</th><th className="px-3 py-2.5">Next safe action</th><th className="px-3 py-2.5">Work</th></tr></thead>
              <tbody>{visibleWorkRows.map(row => {
                const isCurrent = row.entity_id === entityId;
                const isSelected = isCurrent && row.vat_return_id === selectedVatReturnId;
                const ownershipKey = `${row.vat_return_id}:${row.code}:TAKE_OWNERSHIP`;
                return <tr key={row.id} className={`border-b border-black/[0.055] ${isSelected ? "bg-[#F5EFE7]" : isCurrent ? "bg-[#FFF9F0]/45" : "hover:bg-[#FAF9F7]"}`}>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${row.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{row.blocking ? <AlertTriangle size={9} /> : <Clock3 size={9} />}{row.blocking ? "Blocks filing" : "Review"}</span>{row.target_overdue ? <span className="rounded-md border border-red-700/15 bg-red-50 px-2 py-1 text-[7px] font-semibold text-red-800">Internal target overdue</span> : null}</div><div className="mt-1.5 max-w-[260px] font-semibold text-[#37332F]">{row.title}</div><div className="mt-0.5 max-w-[280px] text-[8px] leading-3.5 text-[#817B73]">{row.resolution_rule}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-[#37332F]">{row.entity_name}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{date(row.period_start)} — {date(row.period_end)} · {row.jurisdiction_code || "VAT"}</div><div className="mt-0.5 text-[7px] uppercase tracking-[0.07em] text-[#99938B]">{row.entity_code || "—"}{isCurrent ? " · current entity" : ""}</div></td>
                  <td className="px-3 py-3 font-medium">{date(row.filing_due_date)}<div className={`mt-0.5 text-[8px] ${row.days_to_due < 0 ? "text-red-800" : row.days_to_due <= 7 ? "text-amber-900" : "text-[#918B83]"}`}>{Number.isFinite(row.days_to_due) ? row.days_to_due < 0 ? `${Math.abs(row.days_to_due)}d overdue` : row.days_to_due === 0 ? "due today" : `${row.days_to_due}d left` : "governed calendar"}</div></td>
                  <td className="px-3 py-3"><div className="inline-flex items-center gap-1 font-semibold text-[#4B4640]">{row.owned_by_me ? <UserCheck size={10} /> : <Users size={10} />}{ownerLabel(row)}</div>{row.target_at ? <div className={`mt-0.5 text-[8px] ${row.target_overdue ? "text-red-800" : "text-[#918B83]"}`}>Target {date(row.target_at)}</div> : <div className="mt-0.5 text-[8px] text-[#A09A92]">No internal target</div>}{row.acknowledged_at ? <div className="mt-0.5 text-[7px] text-emerald-800">Acknowledged</div> : null}</td>
                  <td className="px-3 py-3"><div className={`max-w-[260px] font-semibold ${clientDependencyTone(row.client_dependency_state)}`}>{requestLabel(row)}</div>{row.client_dependency_detail ? <div className="mt-0.5 max-w-[280px] text-[8px] leading-3.5 text-[#817B73]">{row.client_dependency_detail}</div> : null}{row.client_next_eligible_follow_up_at ? <div className="mt-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#9A7045]">Next eligible {date(row.client_next_eligible_follow_up_at)}</div> : row.client_request_due_at ? <div className="mt-1 text-[8px] text-[#918B83]">Client due {date(row.client_request_due_at)}</div> : null}{row.client_should_wait ? <div className="mt-1 text-[7px] font-semibold text-[#716B63]">Do not chase</div> : null}</td>
                  <td className="px-3 py-3"><div className="max-w-[250px] font-semibold leading-4 text-[#3F3A35]">{row.client_dependency_action || row.next_action}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{row.client_evidence ? "Client can supply evidence; accountant still validates live Tax truth." : "Accounting team action."}</div>{row.client_safe_to_follow_up ? <div className="mt-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-amber-900">Human follow-up is eligible</div> : null}</td>
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
          <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3 py-2 text-[8px] leading-4 text-[#817B73]">Scope is limited to legal entities inside the currently authorized organization. Client-response and follow-up state is advisory coordination from the shared Finance dependency policy; no reminder is sent here. Dependency resolution authority remains live Tax preflight only.</div>
        </div> : null}
      </div>
    </section>
  );
}
