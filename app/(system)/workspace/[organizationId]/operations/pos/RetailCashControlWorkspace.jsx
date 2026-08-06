"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
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

export default function RetailCashControlWorkspace() {
  const params = useParams();
  const context = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    context.organization_id ||
    context.organization?.id ||
    null;
  const entityId = context.entity_id || context.entity?.id || null;
  const currency =
    context.entity?.currency ||
    context.entity?.currency_code ||
    context.organization?.currency_code ||
    null;

  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [actor, setActor] = useState(null);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCount, setClosingCount] = useState("0");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId || !entityId) {
      setError("Select an active legal entity before cash control");
      setSessions([]);
      setActive(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        organizationId,
        entityId,
        applicationId: "retail",
      });
      const response = await fetch(`/api/pos/cash-sessions?${search.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load retail cash sessions");
      }
      setSessions(result.sessions || []);
      setActive(result.active_session || null);
      setActor(result.actor || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function execute(action) {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/cash-sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organizationId,
          entityId,
          applicationId: "retail",
          sessionId: active?.id || active?.session_id || null,
          openingFloat: Number(openingFloat || 0),
          closingCount: Number(closingCount || 0),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Retail cash-session action failed");
      }
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1300px]">
        <header className="rounded-[32px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
                Retail Cash Control
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Entity-scoped till session</h1>
              <p className="mt-2 text-sm text-white/45">
                One active retail cash session per legal entity. Cash checkout is blocked without it.
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">Operator</div>
            <h2 className="mt-3 text-2xl font-semibold">
              {actor?.staff_name || "Authenticated staff"}
            </h2>
            <div className="mt-1 text-xs text-white/35">
              {actor?.staff_id || actor?.user_id || "Authenticated session"}
            </div>

            {!active ? (
              <>
                <label className="mt-8 block text-xs uppercase tracking-[0.2em] text-white/40">
                  Opening float
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingFloat}
                  onChange={(event) => setOpeningFloat(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                />
                <button
                  type="button"
                  onClick={() => execute("OPEN")}
                  disabled={working || !entityId}
                  className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                >
                  {working ? "Opening..." : "Open Retail Cash Session"}
                </button>
              </>
            ) : (
              <>
                <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/60">
                    Active session
                  </div>
                  <div className="mt-2 font-semibold">{active.id || active.session_id}</div>
                  <div className="mt-3 text-sm text-white/45">
                    Opening float {money(active.opening_float, currency)}
                  </div>
                </div>
                <label className="mt-6 block text-xs uppercase tracking-[0.2em] text-white/40">
                  Closing cash count
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingCount}
                  onChange={(event) => setClosingCount(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                />
                <button
                  type="button"
                  onClick={() => execute("CLOSE")}
                  disabled={working}
                  className="mt-5 w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-4 text-sm font-semibold text-red-100 disabled:opacity-35"
                >
                  {working ? "Closing..." : "Close Retail Cash Session"}
                </button>
              </>
            )}
          </article>

          <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">Recent sessions</div>
            <div className="mt-5 space-y-3">
              {sessions.length ? (
                sessions.map((session) => (
                  <div
                    key={session.id || session.session_id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-medium">{session.staff_name || "Staff"}</div>
                        <div className="mt-1 text-xs text-white/30">{session.id || session.session_id}</div>
                      </div>
                      <div className="text-xs text-[#D6A66A]">{session.status}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/45">
                      <div>Open: {money(session.opening_float, currency)}</div>
                      <div>Close: {money(session.closing_count, currency)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">
                  No retail cash sessions in this entity.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
