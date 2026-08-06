"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banknote, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currency
        ? { style: "currency", currency }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export default function RetailCheckoutWorkspace() {
  const params = useParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;

  const [contexts, setContexts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [state, setState] = useState(null);
  const [tendered, setTendered] = useState("");
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState(null);
  const paymentKey = useRef(null);

  const loadContexts = useCallback(async () => {
    if (!organizationId || !entityId) {
      setContexts([]);
      setSelectedId(null);
      setState(null);
      setError("Select an active legal entity before checkout");
      setLoading(false);
      return [];
    }

    const search = new URLSearchParams({
      organizationId,
      entityId,
      applicationId: "retail",
    });
    const response = await fetch(`/api/pos/payable-contexts?${search.toString()}`, {
      cache: "no-store",
      credentials: "include",
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to load retail checkout orders");
    }
    const rows = result.contexts || [];
    setContexts(rows);
    setSelectedId((current) =>
      rows.some((entry) => entry.context?.id === current)
        ? current
        : rows[0]?.context?.id || null
    );
    return rows;
  }, [entityId, organizationId]);

  const loadState = useCallback(
    async (salesOrderId) => {
      if (!salesOrderId || !organizationId || !entityId) {
        setState(null);
        return;
      }
      const response = await fetch("/api/pos/payment-state", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId: "retail",
          context: { type: "sale", id: salesOrderId },
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load retail payment state");
      }
      const nextState = result.state || null;
      setState(nextState);
      setTendered(
        Number(nextState?.remainingBalance || 0) > 0
          ? Number(nextState.remainingBalance).toFixed(2)
          : ""
      );
      paymentKey.current = null;
    },
    [entityId, organizationId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadContexts();
      const nextId = rows.some((entry) => entry.context?.id === selectedId)
        ? selectedId
        : rows[0]?.context?.id || null;
      if (nextId) await loadState(nextId);
      else setState(null);
    } catch (refreshError) {
      setError(refreshError.message);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [loadContexts, loadState, selectedId]);

  useEffect(() => {
    refresh();
  }, [entityId, organizationId]);

  useEffect(() => {
    if (!selectedId || loading) return;
    setError(null);
    loadState(selectedId).catch((loadError) => {
      setError(loadError.message);
      setState(null);
    });
  }, [selectedId]);

  async function settle() {
    const remaining = Number(state?.remainingBalance || 0);
    const tenderedAmount = Number(tendered || 0);
    if (!state?.context?.id) return;
    if (!state?.settlement?.ready) {
      setError(state?.settlement?.blocker || "Retail cash session is not ready");
      return;
    }
    if (!Number.isFinite(tenderedAmount) || tenderedAmount < remaining) {
      setError("Tendered cash must cover the full balance");
      return;
    }

    if (!paymentKey.current) paymentKey.current = crypto.randomUUID();
    setSettling(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/payments/settle", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": paymentKey.current,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId: "retail",
          context: state.context,
          salesOrderId: state.context.id,
          cashSessionId: state.settlement.cash_session_id,
          paymentMethod: "CASH",
          paidAmount: tenderedAmount,
          tenderedAmount,
          partial: false,
          idempotencyKey: paymentKey.current,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Retail cash settlement failed");
      }
      paymentKey.current = null;
      router.push(`/workspace/${organizationId}/operations/pos?view=orders`);
    } catch (settlementError) {
      setError(settlementError.message);
    } finally {
      setSettling(false);
    }
  }

  const order = state?.orders?.[0] || null;
  const currency = state?.currency_code || order?.currency_code || null;
  const remaining = Number(state?.remainingBalance || 0);
  const tenderedAmount = Number(tendered || 0);
  const change = Math.max(0, tenderedAmount - remaining);

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1450px]">
        <header className="rounded-[32px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
                Retail Finance Settlement
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Cash checkout</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
                Full cash settlement for confirmed, inventory-reserved sales orders.
                Provider-authorized tenders remain separate confirmation flows.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Payable sales orders
            </div>
            <div className="mt-4 space-y-2">
              {contexts.length ? (
                contexts.map((entry) => (
                  <button
                    key={entry.context.id}
                    type="button"
                    onClick={() => setSelectedId(entry.context.id)}
                    className={`w-full rounded-2xl border p-4 text-left ${
                      selectedId === entry.context.id
                        ? "border-[#D6A66A]/45 bg-[#D6A66A]/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="font-semibold">{entry.context.label}</div>
                    <div className="mt-2 text-sm text-white/45">
                      {money(entry.remaining_balance, entry.currency)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 p-6 text-sm text-white/35">
                  No confirmed unpaid retail orders.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            {order ? (
              <>
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                      Confirmed Sale
                    </p>
                    <h2 className="mt-2 text-3xl font-light">
                      {order.order_number || order.id}
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/35">Balance</div>
                    <div className="mt-1 text-3xl font-semibold">
                      {money(remaining, currency)}
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  {(state.items || []).map((line) => (
                    <div
                      key={line.id}
                      className="flex justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div>
                        <div className="font-medium">{line.item_name || line.name}</div>
                        <div className="mt-1 text-xs text-white/35">
                          {Number(line.quantity)} × {money(line.unit_price, currency)}
                        </div>
                      </div>
                      <div className="text-sm text-white/55">
                        {money(line.line_total, currency)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center gap-2 text-sm text-white/55">
                    <Banknote size={17} /> Cash tender
                  </div>
                  <input
                    type="number"
                    min={remaining}
                    step="0.01"
                    value={tendered}
                    onChange={(event) => {
                      paymentKey.current = null;
                      setTendered(event.target.value);
                    }}
                    className="mt-4 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-2xl"
                  />
                  <div className="mt-3 flex justify-between text-sm text-white/45">
                    <span>Change</span>
                    <span>{money(change, currency)}</span>
                  </div>
                </div>

                {!state.settlement?.ready ? (
                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100/70">
                    {state.settlement?.blocker}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={settle}
                  disabled={settling || !state.settlement?.ready || tenderedAmount < remaining}
                  className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                >
                  {settling ? "Posting settlement..." : "Accept Cash and Post Payment"}
                </button>

                <div className="mt-4 text-xs leading-5 text-white/35">
                  Payment is posted through configured Finance rules. Inventory remains
                  reserved until the separate fulfilment transition consumes it.
                </div>
              </>
            ) : (
              <div className="text-sm text-white/35">Select a payable sales order.</div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
