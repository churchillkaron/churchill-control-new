"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currencyCode) {
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(numeric(value));
  } catch {
    return numeric(value).toFixed(2);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

const TYPES = [
  { value: "PAID_IN", label: "Cash In", direction: "IN" },
  { value: "PAID_OUT", label: "Cash Out", direction: "OUT" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In", direction: "IN" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out", direction: "OUT" },
];

export default function POSCashMovementsPanel({
  organizationId,
  entityId,
  applicationId,
  currencyCode,
  activeSessionId,
  onChanged,
}) {
  const [actor, setActor] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movementType, setMovementType] = useState("PAID_IN");
  const [amount, setAmount] = useState("");
  const [counterAccountId, setCounterAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const selectedType = useMemo(
    () => TYPES.find((type) => type.value === movementType) || TYPES[0],
    [movementType]
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [String(account.id), account])),
    [accounts]
  );

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ organizationId, entityId, applicationId });
      const response = await fetch(`/api/pos/cash-movements?${search.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load cash movements");
      }
      setActor(result.actor || null);
      setAccounts(result.counter_accounts || []);
      setMovements(result.movements || []);
      setCounterAccountId((current) => current || result.counter_accounts?.[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function execute() {
    const movementAmount = numeric(amount);
    if (!activeSessionId) {
      setError("Open a cash session before recording a cash movement.");
      return;
    }
    if (!counterAccountId) {
      setError("Select the Finance counter account.");
      return;
    }
    if (movementAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setError("A business reason is required.");
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/cash-movements", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `pos-cash-movement:${movementType.toLowerCase()}:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          cashSessionId: activeSessionId,
          movementType,
          amount: movementAmount,
          counterAccountId,
          reason: reason.trim(),
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Cash movement failed");
      }
      setAmount("");
      setReason("");
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
            Drawer movements
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Cash In & Cash Out</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
            Record non-transfer cash entering or leaving the active drawer. Every movement creates a Finance journal against the selected legal-entity account and changes expected cash without changing sales revenue. Use Cash Custody above for safe, petty-cash, or other location transfers.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/40">
        <span className="rounded-full border border-white/10 px-3 py-1.5">Active drawer only</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Manager / Owner</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Finance journal required</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Does not change revenue</span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!activeSessionId ? (
        <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/70">
          Open a cash session before recording drawer movements.
        </div>
      ) : null}

      {!actor?.can_move_cash ? (
        <div className="mt-5 rounded-2xl border border-white/10 p-4 text-sm text-white/40">
          Manager or owner authority is required to record cash movements.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setMovementType(type.value)}
                className={`rounded-xl border px-3 py-3 text-xs font-semibold transition ${
                  movementType === type.value
                    ? "border-[#D6A66A]/50 bg-[#D6A66A]/10 text-[#E8C98D]"
                    : "border-white/10 text-white/45"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <label className="mt-5 block text-[10px] uppercase tracking-[0.18em] text-white/35">
            Amount
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg outline-none"
          />

          <label className="mt-4 block text-[10px] uppercase tracking-[0.18em] text-white/35">
            Finance counter account
          </label>
          <select
            value={counterAccountId}
            onChange={(event) => setCounterAccountId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none"
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_code} · {account.account_name}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-[10px] uppercase tracking-[0.18em] text-white/35">
            Business reason
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required — e.g. owner float top-up, non-transfer drawer expense, correction"
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
          />

          <button
            type="button"
            disabled={
              actionLoading ||
              !activeSessionId ||
              !actor?.can_move_cash ||
              numeric(amount) <= 0 ||
              !counterAccountId ||
              !reason.trim()
            }
            onClick={execute}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-35"
          >
            {selectedType.direction === "IN" ? (
              <ArrowDownToLine size={16} />
            ) : (
              <ArrowUpFromLine size={16} />
            )}
            {actionLoading ? "Posting..." : `Post ${selectedType.label}`}
          </button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/35">
            Movement evidence
          </div>
          <div className="mt-3 max-h-[540px] space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                Loading movements...
              </div>
            ) : movements.length ? (
              movements.map((movement) => {
                const type = String(movement.movement_type || "").toUpperCase();
                const directionIn = type.endsWith("_IN");
                const account = accountMap.get(String(movement.counter_account_id));
                return (
                  <div
                    key={movement.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/70">
                        {type.replaceAll("_", " ")}
                      </span>
                      <span
                        className={
                          directionIn
                            ? "font-semibold text-emerald-300"
                            : "font-semibold text-amber-200"
                        }
                      >
                        {directionIn ? "+" : "-"}
                        {formatMoney(movement.amount, movement.currency_code || currencyCode)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      {account
                        ? `${account.account_code} · ${account.account_name}`
                        : movement.counter_account_id}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-white/40">
                      {movement.reason}
                    </div>
                    <div className="mt-2 text-[10px] text-white/25">
                      {movement.created_at
                        ? new Date(movement.created_at).toLocaleString()
                        : movement.id}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                No cash movements recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/35">
        Safe and petty-cash custody transfers belong in Cash Custody above. Closing shortages and overages are not entered here; the counted variance remains visible for manager review and is recognized to the configured Cash Over / Short account only when Accounting confirms the closed drawer.
      </div>
    </article>
  );
}
