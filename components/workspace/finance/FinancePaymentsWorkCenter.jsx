"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import RowActionEngine from "@/components/workspace/engines/RowActionEngine";

const GOLD = "#D6A66A";
const TABS = [
  { id: "ready", label: "Ready to Pay" },
  { id: "hold", label: "On Hold" },
  { id: "out", label: "Money Out" },
  { id: "in", label: "Money In" },
];

const VENDOR_PAYMENT_ACTION = {
  id: "vendor_payment",
  label: "Pay Vendor",
  title: "Pay Vendor",
  capability: "vendor_payments",
  action: "create",
  form: "vendor-payment",
  endpoint: "/api/finance/accounts-payable/pay",
  method: "POST",
};

const CUSTOMER_RECEIPT_ACTION = {
  id: "customer_payment",
  label: "Record Receipt",
  title: "Receive Customer Payment",
  capability: "customer_payments",
  action: "create",
  form: "customer-payment",
  endpoint: "/api/finance/customer-payments/create",
  method: "POST",
};

function numberValue(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function amountForPayable(row) {
  return numberValue(row, [
    "outstanding_amount",
    "balance_due",
    "amount_due",
    "open_amount",
    "remaining_amount",
    "total_amount",
    "amount",
  ]);
}

function amountForPayment(row) {
  return numberValue(row, [
    "amount",
    "payment_amount",
    "paid_amount",
    "total_amount",
  ]);
}

function currencyFor(row) {
  return String(row?.currency_code || row?.currency || "THB").toUpperCase();
}

function statusFor(row) {
  return String(row?.status || "OPEN").trim().toUpperCase().replace(/[-\s]+/g, "_");
}

function isSettled(row) {
  const status = statusFor(row);
  return ["PAID", "SETTLED", "CLOSED", "VOID", "CANCELLED", "REVERSED"].includes(status);
}

function isOnHold(row) {
  return row?.payment_hold === true || statusFor(row).includes("HOLD");
}

function isReady(row) {
  return !isOnHold(row) && !isSettled(row) && amountForPayable(row) > 0;
}

function isOverdue(row) {
  const due = row?.due_date ? new Date(row.due_date) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today && !isSettled(row);
}

function dateLabel(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: includeTime ? "2-digit" : undefined,
    minute: includeTime ? "2-digit" : undefined,
  }).format(date);
}

function money(value, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "THB",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "THB"} ${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function totalsByCurrency(rows, amountGetter) {
  const totals = new Map();
  for (const row of rows) {
    const currency = currencyFor(row);
    totals.set(currency, (totals.get(currency) || 0) + amountGetter(row));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function TotalLines({ totals, empty = "—" }) {
  if (!totals.length) return <span className="text-white/35">{empty}</span>;
  return (
    <div className="space-y-1">
      {totals.slice(0, 3).map(([currency, value]) => (
        <div key={currency} className="tabular-nums text-white/88">
          {money(value, currency)}
        </div>
      ))}
      {totals.length > 3 ? (
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
          +{totals.length - 3} currencies
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-400/20 bg-red-400/[0.08] text-red-200/85"
      : tone === "success"
        ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200/85"
        : tone === "gold"
          ? "border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[#E6C28F]"
          : "border-white/[0.09] bg-white/[0.03] text-white/55";

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${toneClass}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, supporting, emphasis = false }) {
  return (
    <div className={`min-h-[112px] border-r border-white/[0.07] px-5 py-4 last:border-r-0 ${emphasis ? "bg-[#D6A66A]/[0.035]" : ""}`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div className={`mt-3 text-xl font-light tracking-[-0.02em] ${emphasis ? "text-[#E6C28F]" : "text-white/90"}`}>
        {value}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-white/38">{supporting}</div>
    </div>
  );
}

async function loadJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) {
      throw new Error(json?.error || json?.message || `Request failed (${response.status})`);
    }
    return { data: json, error: null };
  } catch (error) {
    return { data: null, error: error.message || "Request failed" };
  }
}

function searchText(row) {
  return [
    row?.vendor_name,
    row?.customer_name,
    row?.invoice_number,
    row?.reference_number,
    row?.bank_account_name,
    row?.payment_method,
    row?.status,
    row?.hold_reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function payableTitle(row) {
  return row?.vendor_name || row?.supplier_name || "Vendor";
}

function paymentTitle(row, direction) {
  return direction === "in"
    ? row?.customer_name || "Customer receipt"
    : row?.vendor_name || "Vendor payment";
}

function EmptyState({ tab, canAct, onAction }) {
  const copy = {
    ready: ["No payable items are ready to release.", "Approved, open payables will appear here once they are not on payment hold."],
    hold: ["No payments are on hold.", "Payment holds and their reasons will surface here before cash can be released."],
    out: ["No vendor payments have been posted.", "Posted vendor payments will appear here with bank, reference and invoice context."],
    in: ["No customer receipts have been posted.", "Customer receipts will appear here with allocation, bank and reference context."],
  }[tab];

  return (
    <div className="flex min-h-[330px] flex-col items-center justify-center px-6 text-center">
      <div className="h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <div className="mt-6 text-base font-light text-white/80">{copy[0]}</div>
      <div className="mt-2 max-w-md text-sm leading-6 text-white/38">{copy[1]}</div>
      {canAct ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.08] px-4 py-2 text-xs font-medium text-[#E6C28F] transition hover:bg-[#D6A66A]/[0.13]"
        >
          {tab === "in" ? "Record Receipt" : "Pay Vendor"}
        </button>
      ) : null}
    </div>
  );
}

export default function FinancePaymentsWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const [tab, setTab] = useState("ready");
  const [search, setSearch] = useState("");
  const [payables, setPayables] = useState([]);
  const [moneyOut, setMoneyOut] = useState([]);
  const [moneyIn, setMoneyIn] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId || !entityId) return;
    setLoading(true);

    const base = `organizationId=${encodeURIComponent(organizationId)}&entityId=${encodeURIComponent(entityId)}`;
    const [apResult, outResult, inResult] = await Promise.all([
      loadJson(`/api/finance/payments/list?${base}&view=accounts_payable`),
      loadJson(`/api/finance/payments/list?${base}&view=vendor_payments`),
      loadJson(`/api/finance/customer-payments/list?${base}`),
    ]);

    setPayables(apResult.data?.rows || apResult.data?.payables || []);
    setMoneyOut(outResult.data?.rows || outResult.data?.payments || []);
    setMoneyIn(inResult.data?.rows || inResult.data?.payments || []);
    setErrors({
      payables: apResult.error,
      out: outResult.error,
      in: inResult.error,
    });
    setLoading(false);
  }, [entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelected(null);
  }, [tab]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        document.getElementById("finance-payments-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const readyRows = useMemo(() => payables.filter(isReady), [payables]);
  const holdRows = useMemo(() => payables.filter(isOnHold), [payables]);
  const overdueRows = useMemo(() => readyRows.filter(isOverdue), [readyRows]);

  const visibleRows = useMemo(() => {
    const source =
      tab === "ready" ? readyRows :
      tab === "hold" ? holdRows :
      tab === "out" ? moneyOut :
      moneyIn;

    const needle = search.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(row => searchText(row).includes(needle));
  }, [holdRows, moneyIn, moneyOut, readyRows, search, tab]);

  const readyTotals = useMemo(() => totalsByCurrency(readyRows, amountForPayable), [readyRows]);
  const overdueTotals = useMemo(() => totalsByCurrency(overdueRows, amountForPayable), [overdueRows]);
  const outTotals = useMemo(() => totalsByCurrency(moneyOut, amountForPayment), [moneyOut]);
  const inTotals = useMemo(() => totalsByCurrency(moneyIn, amountForPayment), [moneyIn]);

  const activeError = tab === "out" ? errors.out : tab === "in" ? errors.in : errors.payables;

  function makeIdempotencyKey(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}:${crypto.randomUUID()}`;
    }
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  function openVendorPayment(row = null) {
    setAction({
      action: VENDOR_PAYMENT_ACTION,
      row: {
        ...(row || {}),
        ...(row ? { accounts_payable_id: row.id } : {}),
        idempotency_key: makeIdempotencyKey("vendor-payment"),
      },
    });
  }

  function openReceipt() {
    setAction({
      action: CUSTOMER_RECEIPT_ACTION,
      row: { idempotency_key: makeIdempotencyKey("customer-receipt") },
    });
  }

  if (!entityId) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-8">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/80">Finance / Treasury</div>
        <h2 className="mt-3 text-xl font-light text-white/90">Payments</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/40">
          Select a legal entity to operate payments. Cash release, receipts and their accounting evidence are entity-scoped.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#080808] text-white">
      <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080808]/95 px-5 py-4 backdrop-blur-xl lg:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#D6A66A]/75">
              Finance / Treasury
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <h1 className="text-[22px] font-light tracking-[-0.025em] text-white/92">
                {capability?.name || capability?.label || "Payments"}
              </h1>
              <span className="hidden text-xs text-white/28 md:inline">Cash release and receipt control tower</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-xs text-white/55 transition hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-40"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={openReceipt}
              className="rounded-lg border border-white/[0.11] bg-white/[0.035] px-3 py-2 text-xs font-medium text-white/72 transition hover:bg-white/[0.06]"
            >
              Record Receipt
            </button>
            <button
              type="button"
              onClick={() => openVendorPayment(selected && tab === "ready" ? selected : null)}
              className="rounded-lg border border-[#D6A66A]/35 bg-[#D6A66A]/[0.09] px-3.5 py-2 text-xs font-medium text-[#E6C28F] transition hover:bg-[#D6A66A]/[0.14]"
            >
              Pay Vendor
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.07] bg-black/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Ready to Pay"
            value={<TotalLines totals={readyTotals} />}
            supporting={`${readyRows.length} payable item${readyRows.length === 1 ? "" : "s"} cleared for payment`}
            emphasis
          />
          <Metric
            label="Overdue Payables"
            value={<TotalLines totals={overdueTotals} />}
            supporting={`${overdueRows.length} overdue item${overdueRows.length === 1 ? "" : "s"} currently releasable`}
          />
          <Metric
            label="Money Out"
            value={<TotalLines totals={outTotals} />}
            supporting={`${moneyOut.length} posted vendor payment${moneyOut.length === 1 ? "" : "s"} in this entity`}
          />
          <Metric
            label="Money In"
            value={<TotalLines totals={inTotals} />}
            supporting={`${moneyIn.length} posted customer receipt${moneyIn.length === 1 ? "" : "s"} in this entity`}
          />
        </div>
      </div>

      <div className="grid min-h-[610px] grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 border-r border-white/[0.07]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-7">
            <div className="flex min-w-0 gap-1 overflow-x-auto">
              {TABS.map(item => {
                const count =
                  item.id === "ready" ? readyRows.length :
                  item.id === "hold" ? holdRows.length :
                  item.id === "out" ? moneyOut.length : moneyIn.length;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs transition ${
                      active
                        ? "bg-white/[0.07] text-white/88"
                        : "text-white/38 hover:bg-white/[0.035] hover:text-white/65"
                    }`}
                  >
                    {item.label}
                    <span className={`ml-2 tabular-nums ${active ? "text-[#D6A66A]" : "text-white/25"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:w-[280px]">
              <input
                id="finance-payments-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search payments…"
                className="w-full rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 pr-10 text-xs text-white/75 outline-none placeholder:text-white/24 focus:border-[#D6A66A]/35"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/22">/</span>
            </div>
          </div>

          {activeError ? (
            <div className="border-b border-red-400/10 bg-red-400/[0.035] px-5 py-3 text-xs text-red-200/65 lg:px-7">
              This queue could not be loaded: {activeError}
            </div>
          ) : null}

          {visibleRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.15em] text-white/28">
                    <th className="px-5 py-3 font-medium lg:px-7">Counterparty</th>
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium">{tab === "ready" || tab === "hold" ? "Due" : "Date"}</th>
                    <th className="px-4 py-3 font-medium">Bank / Method</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-right font-medium lg:px-7">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => {
                    const payable = tab === "ready" || tab === "hold";
                    const direction = tab === "in" ? "in" : "out";
                    const title = payable ? payableTitle(row) : paymentTitle(row, direction);
                    const date = payable ? row?.due_date : row?.paid_at || row?.payment_date || row?.created_at;
                    const amount = payable ? amountForPayable(row) : amountForPayment(row);
                    const selectedRow = selected?.id === row?.id && selected?.id !== undefined;
                    const overdue = payable && isOverdue(row);
                    const hold = payable && isOnHold(row);
                    const reference = row?.invoice_number || row?.reference_number || "—";
                    const bank = row?.bank_account_name || row?.payment_method || "—";

                    return (
                      <tr
                        key={row?.id || `${tab}-${index}`}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer border-b border-white/[0.055] transition hover:bg-white/[0.025] ${
                          selectedRow ? "bg-[#D6A66A]/[0.045]" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5 lg:px-7">
                          <div className="max-w-[250px] truncate text-[13px] text-white/78">{title}</div>
                          <div className="mt-1 text-[11px] text-white/28">{currencyFor(row)}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs text-white/58">{reference}</div>
                          {row?.reference_number && row?.invoice_number ? (
                            <div className="mt-1 max-w-[180px] truncate text-[10px] text-white/26">Ref {row.reference_number}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className={`text-xs ${overdue ? "text-red-200/75" : "text-white/52"}`}>
                            {dateLabel(date, !payable)}
                          </div>
                          {overdue ? <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-red-300/55">Overdue</div> : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="max-w-[190px] truncate text-xs text-white/52">{bank}</div>
                          {row?.bank_account_number ? (
                            <div className="mt-1 text-[10px] text-white/24">•••• {String(row.bank_account_number).slice(-4)}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-right text-[13px] tabular-nums text-white/80">
                          {money(amount, currencyFor(row))}
                        </td>
                        <td className="px-5 py-3.5 text-right lg:px-7">
                          {hold ? (
                            <StatusPill tone="danger">Hold</StatusPill>
                          ) : payable ? (
                            <StatusPill tone="gold">Ready</StatusPill>
                          ) : (
                            <StatusPill tone="success">{statusFor(row)}</StatusPill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              tab={tab}
              canAct={tab === "ready" || tab === "in"}
              onAction={tab === "in" ? openReceipt : () => openVendorPayment()}
            />
          )}
        </section>

        <aside className="hidden bg-black/25 2xl:block">
          <div className="sticky top-[77px] p-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.19em] text-white/28">Selected item</div>
            {selected ? (
              <div className="mt-4">
                <div className="text-lg font-light leading-7 text-white/86">
                  {tab === "ready" || tab === "hold" ? payableTitle(selected) : paymentTitle(selected, tab === "in" ? "in" : "out")}
                </div>
                <div className="mt-1 text-xs text-white/32">
                  {selected?.invoice_number || selected?.reference_number || "No document reference"}
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/28">Amount</div>
                  <div className="mt-2 text-xl font-light tabular-nums text-white/88">
                    {money(
                      tab === "ready" || tab === "hold" ? amountForPayable(selected) : amountForPayment(selected),
                      currencyFor(selected)
                    )}
                  </div>
                </div>

                <dl className="mt-5 space-y-0 border-t border-white/[0.07]">
                  {[
                    ["Status", isOnHold(selected) ? "Payment hold" : statusFor(selected)],
                    ["Due date", selected?.due_date ? dateLabel(selected.due_date) : "—"],
                    ["Payment date", selected?.paid_at || selected?.payment_date ? dateLabel(selected.paid_at || selected.payment_date, true) : "—"],
                    ["Bank account", selected?.bank_account_name || "—"],
                    ["Method", selected?.payment_method || "—"],
                    ["Reference", selected?.reference_number || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[105px_1fr] gap-3 border-b border-white/[0.06] py-3 text-xs">
                      <dt className="text-white/28">{label}</dt>
                      <dd className="break-words text-right text-white/58">{value}</dd>
                    </div>
                  ))}
                </dl>

                {selected?.payment_hold === true ? (
                  <div className="mt-5 rounded-xl border border-red-400/15 bg-red-400/[0.04] p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-red-200/55">Release blocked</div>
                    <div className="mt-2 text-xs leading-5 text-red-100/65">
                      {selected?.hold_reason || "This payable is on payment hold and cannot be released until the underlying control is resolved."}
                    </div>
                  </div>
                ) : null}

                {tab === "ready" ? (
                  <button
                    type="button"
                    onClick={() => openVendorPayment(selected)}
                    className="mt-5 w-full rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.08] px-4 py-2.5 text-xs font-medium text-[#E6C28F] transition hover:bg-[#D6A66A]/[0.13]"
                  >
                    Pay selected payable
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-10 text-sm leading-6 text-white/30">
                Select a row to inspect its payment control context without leaving the queue.
              </div>
            )}
          </div>
        </aside>
      </div>

      {action ? (
        <RowActionEngine
          action={action.action}
          row={action.row}
          organizationId={organizationId}
          entityId={entityId}
          periodId={periodId}
          workspaceId="finance"
          moduleKey={action.action.capability}
          onClose={() => setAction(null)}
          onComplete={load}
        />
      ) : null}
    </div>
  );
}
