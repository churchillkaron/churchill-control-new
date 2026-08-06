"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { loadWaiterData } from "@/lib/restaurant/pos/waiter/loadWaiterData";
import {
  canExecutePOSAction,
  getPOSAccessSnapshot,
} from "@/lib/operations/commerce/security/POSActionPolicy";

const LONG_PRESS_MS = 550;
const REFRESH_MS = 10000;

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function tableReference(table) {
  return table?.table_number || table?.table_name || table?.id || "";
}

function normalizedStatus(table) {
  return String(table?.status || "AVAILABLE").trim().toUpperCase();
}

function isMerged(table) {
  return normalizedStatus(table) === "MERGED";
}

function isOccupied(table) {
  return Boolean(
    !isMerged(table) &&
      (Number(table?.current_guests || 0) > 0 ||
        table?.active_session_id ||
        normalizedStatus(table) === "OCCUPIED")
  );
}

function isEmpty(table) {
  return !isMerged(table) && !isOccupied(table);
}

function Modal({ children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        className={
          wide
            ? "max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#080808] p-5 shadow-2xl"
            : "max-h-[90vh] w-full max-w-[390px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#080808] p-5 shadow-2xl"
        }
      >
        {children}
      </div>
    </div>
  );
}

function ActionButton({ children, disabled, primary = false, danger = false, onClick }) {
  const classes = primary
    ? "border-[#D6A66A]/50 bg-[#D6A66A] text-black"
    : danger
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : "border-white/10 bg-white/[0.045] text-white";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition ${classes} disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

export default function WaiterServiceWorkspace() {
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    businessContext.organization_id || organization?.id || null;
  const holdTimer = useRef(null);
  const heldTableId = useRef(null);
  const longPressFired = useRef(false);

  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [modal, setModal] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [targetTableId, setTargetTableId] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [mergeTargetIds, setMergeTargetIds] = useState([]);
  const [busy, setBusy] = useState(false);

  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];
  const selectedTable =
    tables.find((table) => table.id === selectedTableId) || null;
  const access = runtime?.access || {};
  const accessSnapshot = getPOSAccessSnapshot(access);

  const canOrder = canExecutePOSAction({ access, action: "ORDER_ENTRY" });
  const canMoveGuests = canExecutePOSAction({ access, action: "MOVE_GUESTS" });
  const canMoveSeat = canExecutePOSAction({ access, action: "MOVE_SEAT" });
  const canChangeCustomer = canExecutePOSAction({ access, action: "CHANGE_CUSTOMER" });
  const canPay = canExecutePOSAction({ access, action: "PAYMENT" });
  const canTransfer = canExecutePOSAction({ access, action: "TRANSFER_TABLE" });
  const canMerge = canExecutePOSAction({ access, action: "MERGE_TABLES" });
  const canClose = canExecutePOSAction({ access, action: "CLOSE_TABLE" });

  const visibleTables = useMemo(() => {
    if (!activeZoneId) return tables;
    return tables.filter((table) => table.zone_id === activeZoneId);
  }, [activeZoneId, tables]);

  const emptyDestinations = useMemo(
    () =>
      tables.filter(
        (table) =>
          table.id !== selectedTableId &&
          isEmpty(table)
      ),
    [selectedTableId, tables]
  );

  const mergeDestinations = useMemo(
    () =>
      tables.filter(
        (table) =>
          table.id !== selectedTableId &&
          !isMerged(table)
      ),
    [selectedTableId, tables]
  );

  const loadRuntime = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const loaded = await loadWaiterData(organizationId);
      setRuntime(loaded);
      setError(null);
      setActiveZoneId((current) => current || loaded?.zones?.[0]?.id || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load waiter service");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  useEffect(() => {
    if (!organizationId) return undefined;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) {
        loadRuntime({ silent: true });
      }
    }, REFRESH_MS);

    const onFocus = () => loadRuntime({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [busy, loadRuntime, organizationId]);

  function clearHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    heldTableId.current = null;
  }

  function startHold(event, table) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearHold();
    longPressFired.current = false;
    heldTableId.current = table.id;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    holdTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setSelectedTableId(table.id);
      setTargetTableId(null);
      setSelectedSeat(null);
      setMergeTargetIds([]);
      setModal("ACTIONS");
    }, LONG_PRESS_MS);
  }

  function endHold(event, table) {
    const sameTable = heldTableId.current === table.id;
    clearHold();

    if (!sameTable || longPressFired.current) {
      longPressFired.current = false;
      return;
    }

    openOrdering(table);
  }

  function cancelHold() {
    clearHold();
    longPressFired.current = false;
  }

  function closeModal() {
    setModal(null);
    setTargetTableId(null);
    setSelectedSeat(null);
    setMergeTargetIds([]);
  }

  function openOrdering(table = selectedTable) {
    if (!table || !canOrder) return;
    if (isMerged(table)) {
      setError("This table belongs to a merged table group. Open the master table instead.");
      return;
    }

    const query = new URLSearchParams({ view: "sell" });
    query.set("table", String(tableReference(table)));
    router.push(`/workspace/${organizationId}/operations/pos?${query.toString()}`);
  }

  function openPayment(table = selectedTable) {
    if (!table || !canPay || !isOccupied(table)) return;

    const query = new URLSearchParams({ view: "checkout" });
    query.set("table", String(tableReference(table)));
    router.push(`/workspace/${organizationId}/operations/pos?${query.toString()}`);
  }

  function openCustomer(table = selectedTable) {
    if (!table || !canChangeCustomer || isMerged(table)) return;

    const query = new URLSearchParams({ view: "sell" });
    query.set("table", String(tableReference(table)));
    query.set("action", "customer");
    router.push(`/workspace/${organizationId}/operations/pos?${query.toString()}`);
  }

  async function posAction(action, payload = {}) {
    const response = await fetch("/api/pos/tables/action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload: {
          ...payload,
          organizationId,
        },
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "POS action failed");
    }

    return result;
  }

  async function executeAction(callback) {
    setBusy(true);
    setError(null);

    try {
      await callback();
      closeModal();
      await loadRuntime({ silent: true });
    } catch (actionError) {
      setError(actionError?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmMoveTable() {
    if (!selectedTable || !targetTableId || !canTransfer) return;
    executeAction(() =>
      posAction("TRANSFER_TABLE", {
        fromTableId: selectedTable.id,
        toTableId: targetTableId,
      })
    );
  }

  async function loadSeatOptions() {
    if (!selectedTable || !canMoveSeat) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/tables/open", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          tableId: selectedTable.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to open table");
      }

      const seats = [
        ...new Set(
          (result.orders || [])
            .flatMap((order) => order.order_items || [])
            .map((item) =>
              item.seat_position || item.seat_number || item.modifiers?.seat
            )
            .filter(Boolean)
            .map(String)
        ),
      ];

      setSelectedSeat(seats[0] || null);
      setModal("MOVE_GUEST");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load guest seats");
    } finally {
      setBusy(false);
    }
  }

  function confirmMoveGuest() {
    if (!selectedTable || !targetTableId || !selectedSeat || !canMoveSeat) return;

    executeAction(async () => {
      const response = await fetch("/api/pos/tables/move-seat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          fromTableId: selectedTable.id,
          toTableId: targetTableId,
          seatPosition: selectedSeat,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Move guest failed");
      }
    });
  }

  function confirmMerge() {
    if (!selectedTable || !mergeTargetIds.length || !canMerge) return;

    executeAction(() =>
      posAction("MERGE_TABLES", {
        masterTableId: selectedTable.id,
        targetTableIds: mergeTargetIds,
      })
    );
  }

  function confirmClose() {
    if (!selectedTable || !canClose) return;

    if (!window.confirm(`Close ${tableName(selectedTable)} and release the service context?`)) {
      return;
    }

    executeAction(() =>
      posAction("CLOSE_TABLE", {
        tableId: selectedTable.id,
      })
    );
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-[1100px] px-4 py-12 text-white/45">
        Loading mobile service...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-6 text-white">
      <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
              Restaurant service adapter
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Waiter · Mobile Service</h1>
            <p className="mt-2 text-sm text-white/45">
              Tap a table to order. Hold a table for controlled actions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/50">
              {accessSnapshot.role || "SERVICE ACCESS"}
            </div>
            <button
              type="button"
              onClick={() => loadRuntime({ silent: true })}
              disabled={refreshing}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 disabled:opacity-40"
            >
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setActiveZoneId(zone.id)}
              className={
                activeZoneId === zone.id
                  ? "shrink-0 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-black"
                  : "shrink-0 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs text-white/55"
              }
            >
              {zone.name || zone.zone_name || "Area"}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibleTables.map((table) => {
            const merged = isMerged(table);
            const occupied = isOccupied(table);
            const classes = merged
              ? "border-red-400/25 bg-red-500/10 text-red-200"
              : occupied
                ? "border-[#D6A66A]/45 bg-[#D6A66A]/10 text-[#F3D7A2]"
                : "border-white/10 bg-black/25 text-white/75";

            return (
              <button
                key={table.id}
                type="button"
                onPointerDown={(event) => startHold(event, table)}
                onPointerUp={(event) => endHold(event, table)}
                onPointerCancel={cancelHold}
                onPointerLeave={cancelHold}
                onContextMenu={(event) => event.preventDefault()}
                className={`min-h-[112px] touch-none select-none rounded-2xl border p-4 text-left transition active:scale-[0.98] ${classes}`}
              >
                <div className="text-lg font-semibold">{tableName(table)}</div>
                <div className="mt-2 text-xs opacity-60">
                  {merged
                    ? "Merged"
                    : occupied
                      ? `${Number(table.current_guests || 0)} guest(s)`
                      : "Available"}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.18em] opacity-40">
                  Tap order · Hold actions
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {modal === "ACTIONS" && selectedTable ? (
        <Modal>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                Table actions
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {tableName(selectedTable)}
              </div>
              <div className="mt-1 text-xs text-white/40">
                {isMerged(selectedTable)
                  ? "Merged table"
                  : isOccupied(selectedTable)
                    ? `${Number(selectedTable.current_guests || 0)} guest(s)`
                    : "Available table"}
              </div>
            </div>
            <button type="button" onClick={closeModal} className="text-sm text-white/40">
              Close
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {!isMerged(selectedTable) ? (
              <ActionButton primary disabled={!canOrder} onClick={() => openOrdering()}>
                {isOccupied(selectedTable) ? "Continue Ordering" : "Start Order"}
              </ActionButton>
            ) : null}

            {isOccupied(selectedTable) ? (
              <ActionButton disabled={!canPay} onClick={() => openPayment()}>
                Checkout & Payment
              </ActionButton>
            ) : null}

            {!isMerged(selectedTable) ? (
              <ActionButton disabled={!canChangeCustomer} onClick={() => openCustomer()}>
                Change Customer
              </ActionButton>
            ) : null}

            {isOccupied(selectedTable) ? (
              <ActionButton disabled={!canMoveSeat} onClick={loadSeatOptions}>
                Move Guest
              </ActionButton>
            ) : null}

            {isOccupied(selectedTable) ? (
              <ActionButton
                disabled={!canTransfer || !emptyDestinations.length}
                onClick={() => setModal("MOVE_TABLE")}
              >
                Move Complete Table
              </ActionButton>
            ) : null}

            {!isMerged(selectedTable) ? (
              <ActionButton
                disabled={!canMerge || !mergeDestinations.length}
                onClick={() => setModal("MERGE")}
              >
                Merge Tables
              </ActionButton>
            ) : null}

            {isOccupied(selectedTable) ? (
              <ActionButton danger disabled={!canClose} onClick={confirmClose}>
                Close & Release Table
              </ActionButton>
            ) : null}
          </div>

          {!canPay || !canTransfer || !canMerge || !canClose ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-white/35">
              Manager-only actions remain visible but disabled. Server-side permission checks also protect every action.
            </div>
          ) : null}
        </Modal>
      ) : null}

      {modal === "MOVE_TABLE" && selectedTable ? (
        <Modal>
          <div className="text-xl font-semibold">Move Complete Table</div>
          <div className="mt-1 text-sm text-white/40">
            From {tableName(selectedTable)}. Only empty destinations are available.
          </div>
          <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto">
            {emptyDestinations.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setTargetTableId(table.id)}
                className={
                  targetTableId === table.id
                    ? "w-full rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 p-4 text-left text-[#F3D7A2]"
                    : "w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left"
                }
              >
                {tableName(table)}
              </button>
            ))}
          </div>
          <ActionButton primary disabled={!targetTableId || busy} onClick={confirmMoveTable}>
            Confirm Move
          </ActionButton>
          <div className="mt-2">
            <ActionButton onClick={() => setModal("ACTIONS")}>Back</ActionButton>
          </div>
        </Modal>
      ) : null}

      {modal === "MOVE_GUEST" && selectedTable ? (
        <Modal wide>
          <div className="text-xl font-semibold">Move Guest</div>
          <div className="mt-1 text-sm text-white/40">
            Move a seat from {tableName(selectedTable)}.
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">Seat</div>
              <input
                type="number"
                min="1"
                value={selectedSeat || ""}
                onChange={(event) => setSelectedSeat(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3"
              />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">Destination</div>
              <select
                value={targetTableId || ""}
                onChange={(event) => setTargetTableId(event.target.value || null)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3"
              >
                <option value="">Select table</option>
                {tables
                  .filter((table) => table.id !== selectedTable.id && !isMerged(table))
                  .map((table) => (
                    <option key={table.id} value={table.id}>
                      {tableName(table)} · {isOccupied(table) ? "Occupied" : "Available"}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-5">
            <ActionButton
              primary
              disabled={!selectedSeat || !targetTableId || busy}
              onClick={confirmMoveGuest}
            >
              Confirm Guest Move
            </ActionButton>
          </div>
          <div className="mt-2">
            <ActionButton onClick={() => setModal("ACTIONS")}>Back</ActionButton>
          </div>
        </Modal>
      ) : null}

      {modal === "MERGE" && selectedTable ? (
        <Modal>
          <div className="text-xl font-semibold">Merge Tables</div>
          <div className="mt-1 text-sm text-white/40">
            {tableName(selectedTable)} remains the master table.
          </div>
          <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto">
            {mergeDestinations.map((table) => {
              const selected = mergeTargetIds.includes(table.id);
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() =>
                    setMergeTargetIds((current) =>
                      selected
                        ? current.filter((id) => id !== table.id)
                        : [...current, table.id]
                    )
                  }
                  className={
                    selected
                      ? "w-full rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 p-4 text-left text-[#F3D7A2]"
                      : "w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left"
                  }
                >
                  <div>{tableName(table)}</div>
                  <div className="mt-1 text-xs text-white/35">
                    {isOccupied(table) ? `${Number(table.current_guests || 0)} guest(s)` : "Available"}
                  </div>
                </button>
              );
            })}
          </div>
          <ActionButton primary disabled={!mergeTargetIds.length || busy} onClick={confirmMerge}>
            Confirm Merge
          </ActionButton>
          <div className="mt-2">
            <ActionButton onClick={() => setModal("ACTIONS")}>Back</ActionButton>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
