"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export default function ShiftPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;
  const currencyCode =
    organization?.currency_code || organization?.currency || businessContext.currency || null;

  const [actor, setActor] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("0");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadShifts = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/pos/shifts?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load shifts");
      }
      setActor(result.actor || null);
      setShifts(result.shifts || []);
      setActiveShift(result.activeShift || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  async function execute(action) {
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pos/shifts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organizationId,
          shiftId: activeShift?.id || null,
          openingCash: Number(openingCash || 0),
          closingCash: Number(closingCash || 0),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Shift action failed");
      }
      await loadShifts();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1300px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">Restaurant Operations</p>
              <h1 className="mt-3 text-4xl font-semibold">POS Shift & Cash Control</h1>
              <p className="mt-2 text-sm text-white/45">
                Authenticated cashier identity, opening float and shift close.
              </p>
            </div>
            <button onClick={loadShifts} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </header>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 p-10 text-center text-white/35">Loading shift control...</div>
        ) : (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Authenticated operator</div>
              <h2 className="mt-3 text-2xl font-semibold">{actor?.staff_name || "Current staff member"}</h2>
              <div className="mt-1 text-sm text-white/40">{actor?.staff_id || actor?.user_id || "Authenticated session"}</div>

              {!activeShift ? (
                <>
                  <label className="mt-8 block text-xs uppercase tracking-[0.2em] text-white/40">Opening float</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                  />
                  <button
                    onClick={() => execute("OPEN")}
                    disabled={actionLoading}
                    className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {actionLoading ? "Opening..." : "Open Shift"}
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/60">Active shift</div>
                    <div className="mt-2 text-lg font-semibold">{activeShift.id}</div>
                    <div className="mt-3 text-sm text-white/45">
                      Opened {activeShift.opened_at || activeShift.created_at ? new Date(activeShift.opened_at || activeShift.created_at).toLocaleString() : ""}
                    </div>
                    <div className="mt-2 text-sm text-white/45">
                      Opening float {formatMoney(activeShift.opening_cash, currencyCode)}
                    </div>
                  </div>

                  <label className="mt-6 block text-xs uppercase tracking-[0.2em] text-white/40">Closing cash count</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingCash}
                    onChange={(event) => setClosingCash(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-4 text-xl"
                  />
                  <button
                    onClick={() => execute("CLOSE")}
                    disabled={actionLoading}
                    className="mt-5 w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-4 text-sm font-semibold text-red-100 disabled:opacity-40"
                  >
                    {actionLoading ? "Closing..." : "Close Shift"}
                  </button>
                </>
              )}
            </article>

            <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Recent shifts</div>
              <div className="mt-5 max-h-[580px] space-y-3 overflow-y-auto">
                {shifts.length ? shifts.map((shift) => (
                  <div key={shift.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-medium">{shift.staff_name || "Staff"}</div>
                        <div className="mt-1 text-xs text-white/35">{shift.id}</div>
                      </div>
                      <div className={String(shift.status).toUpperCase() === "CLOSED" ? "text-xs text-white/40" : "text-xs text-emerald-300"}>{shift.status}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/45">
                      <div>Open: {formatMoney(shift.opening_cash, currencyCode)}</div>
                      <div>Close: {formatMoney(shift.closing_cash, currencyCode)}</div>
                    </div>
                  </div>
                )) : <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">No POS shifts found.</div>}
              </div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
