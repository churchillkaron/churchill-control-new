"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Minus, Plus, RefreshCw, Split, Users } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { groupMenuByCategory } from "@/lib/restaurant/pos/waiter/groupMenuByCategory";
import { assignSeatToBillGroup } from "@/lib/restaurant/pos/tables/assignSeatToBillGroup";

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function seatOf(item) {
  return item?.seat_position || item?.seat_number || item?.modifiers?.seat || null;
}

function normalizeModifierGroups(settings) {
  const raw =
    settings?.modifier_groups ||
    settings?.modifierGroups ||
    settings?.order_modifiers ||
    settings?.orderModifiers ||
    settings?.waiter_modifiers ||
    settings?.waiterModifiers ||
    settings?.modifiers ||
    settings?.menuModifiers ||
    [];

  if (Array.isArray(raw)) {
    return raw
      .map((group) => ({
        key: group.key || group.id || group.name || group.label,
        label: group.label || group.name || group.key || "Modifier",
        required: Boolean(group.required),
        options: Array.isArray(group.options)
          ? group.options.map((option) =>
              typeof option === "string"
                ? { value: option, label: option }
                : {
                    value: option.value || option.name || option.label,
                    label: option.label || option.name || option.value,
                  },
            )
          : [],
      }))
      .filter((group) => group.key && group.options.length);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([key, options]) => ({
        key,
        label: key,
        required: false,
        options: Array.isArray(options)
          ? options.map((option) =>
              typeof option === "string"
                ? { value: option, label: option }
                : {
                    value: option.value || option.name || option.label,
                    label: option.label || option.name || option.value,
                  },
            )
          : [],
      }))
      .filter((group) => group.options.length);
  }

  return [];
}

function Modal({ children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-2 sm:items-center">
      <div className="max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#080808] p-4 text-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function RestaurantWaiterPhone({ posRuntime, refreshPOSRuntime }) {
  const businessContext = useBusinessContext() || {};
  const organizationId =
    posRuntime?.organization?.id ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId =
    posRuntime?.terminal?.entity_id ||
    posRuntime?.entity_id ||
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;

  const requestKey = useRef(null);
  const [runtime, setRuntime] = useState(posRuntime || null);
  const [activeZoneId, setActiveZoneId] = useState(posRuntime?.zones?.[0]?.id || null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [guestDraft, setGuestDraft] = useState(1);
  const [draftTableId, setDraftTableId] = useState(null);
  const [cart, setCart] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [openSummary, setOpenSummary] = useState(null);
  const [dishDraft, setDishDraft] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({});
  const [modal, setModal] = useState(null);
  const [targetTableId, setTargetTableId] = useState(null);
  const [moveSeat, setMoveSeat] = useState(null);
  const [mergeTargetIds, setMergeTargetIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!posRuntime) return;
    setRuntime(posRuntime);
    setActiveZoneId((current) => current || posRuntime?.zones?.[0]?.id || null);
  }, [posRuntime]);

  const zones = runtime?.zones || [];
  const tables = useMemo(
    () =>
      [...(runtime?.tables || [])].sort((a, b) =>
        String(tableName(a)).localeCompare(String(tableName(b)), undefined, {
          numeric: true,
        }),
      ),
    [runtime?.tables],
  );
  const dishes = runtime?.dishes || [];
  const settings = runtime?.posSettings || runtime?.settings || {};
  const activeTable = tables.find((table) => table.id === activeTableId) || null;
  const targetTable = tables.find((table) => table.id === targetTableId) || null;
  const currentGuestCount = Number(
    activeTable?.current_guests ||
    (draftTableId === activeTableId ? guestDraft : 0) ||
    0,
  );

  const menuGroups = useMemo(() => groupMenuByCategory(dishes), [dishes]);
  const categories = Object.keys(menuGroups || {});
  const currentCategory = activeCategory || categories[0] || null;
  const visibleDishes = currentCategory ? menuGroups[currentCategory] || [] : [];
  const modifierGroups = useMemo(() => normalizeModifierGroups(settings), [settings]);
  const visibleTables = useMemo(
    () => tables.filter((table) => !activeZoneId || table.zone_id === activeZoneId),
    [activeZoneId, tables],
  );

  const openItems = useMemo(
    () =>
      openOrders.flatMap((order) =>
        (order.order_items || []).map((item) => ({ ...item, _order_id: order.id })),
      ),
    [openOrders],
  );
  const occupiedSeatNumbers = useMemo(
    () => [
      ...new Set(openItems.map((item) => seatOf(item)).filter(Boolean).map(Number)),
    ].sort((a, b) => a - b),
    [openItems],
  );

  async function refreshRuntime() {
    try {
      const next = typeof refreshPOSRuntime === "function"
        ? await refreshPOSRuntime()
        : posRuntime;
      if (next) setRuntime(next);
      return next;
    } catch (refreshError) {
      setError(refreshError?.message || "Unable to refresh waiter");
      return null;
    }
  }

  async function tableAction(action, payload = {}) {
    const response = await fetch("/api/pos/tables/action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload: { ...payload, organizationId },
      }),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Table action failed");
    }
    return result;
  }

  async function loadOpenTable(table = activeTable) {
    if (!table) return null;
    const response = await fetch("/api/pos/tables/open", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, tableId: table.id }),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to open table");
    }
    setOpenOrders(result.orders || []);
    setOpenSummary(result.summary || null);
    return result;
  }

  function chooseZone(zoneId) {
    setActiveZoneId(zoneId);
    setActiveTableId(null);
    setDraftTableId(null);
    setCart([]);
    setOpenOrders([]);
    setOpenSummary(null);
    setMessage(null);
    setError(null);
  }

  async function chooseTable(table) {
    if (String(table.status || "").toUpperCase() === "MERGED") {
      setError("This table is merged into another table.");
      return;
    }

    setActiveTableId(table.id);
    setCart([]);
    setOpenOrders([]);
    setOpenSummary(null);
    setError(null);
    setMessage(null);
    requestKey.current = null;

    const guests = Number(table.current_guests || 0);
    if (!guests) {
      setGuestDraft(1);
      setDraftTableId(table.id);
      setSelectedSeat(1);
      setModal("GUESTS");
      return;
    }

    setDraftTableId(null);
    setGuestDraft(guests);
    setSelectedSeat((current) => Math.min(Math.max(1, current), guests));
    try {
      await loadOpenTable(table);
    } catch (openError) {
      setError(openError.message);
    }
  }

  function confirmGuestDraft() {
    const count = Math.max(1, Math.min(99, Number(guestDraft || 1)));
    setGuestDraft(count);
    setSelectedSeat(1);
    setModal(null);
  }

  async function changeGuestCount(nextCount) {
    if (!activeTable) return;
    const count = Math.max(1, Math.min(99, Number(nextCount || 1)));
    if (!activeTable.active_session_id) {
      setGuestDraft(count);
      setDraftTableId(activeTable.id);
      setSelectedSeat((current) => Math.min(current, count));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await tableAction("MOVE_GUESTS", {
        tableId: activeTable.id,
        guestCount: count,
      });
      setGuestDraft(count);
      setSelectedSeat((current) => Math.min(current, count));
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  function openDish(dish) {
    if (!activeTable) {
      setError("Select a table first.");
      return;
    }
    if (!currentGuestCount) {
      setModal("GUESTS");
      return;
    }
    setDishDraft(dish);
    setModifierDraft({ notes: "" });
    setModal("DISH");
  }

  function addDish() {
    if (!dishDraft || !selectedSeat) return;
    const missingRequired = modifierGroups.find(
      (group) => group.required && !modifierDraft[group.key],
    );
    if (missingRequired) {
      setError(`Choose ${missingRequired.label}.`);
      return;
    }

    const modifiers = { seat: selectedSeat, notes: modifierDraft.notes || null };
    modifierGroups.forEach((group) => {
      if (modifierDraft[group.key]) modifiers[group.key] = modifierDraft[group.key];
    });

    setCart((current) => [
      ...current,
      {
        id: `${dishDraft.id}-${crypto.randomUUID()}`,
        dish_id: dishDraft.id,
        name: dishDraft.name || dishDraft.dish_name,
        price: Number(dishDraft.price || 0),
        quantity: 1,
        seatPosition: Number(selectedSeat),
        notes: modifierDraft.notes || null,
        modifiers,
      },
    ]);
    requestKey.current = null;
    setDishDraft(null);
    setModifierDraft({});
    setModal(null);
    setError(null);
  }

  function changeCartQuantity(id, delta) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.max(0, Number(item.quantity || 1) + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
    requestKey.current = null;
  }

  async function sendOrder() {
    if (!activeTable || !cart.length || !entityId) return;
    if (!requestKey.current) requestKey.current = crypto.randomUUID();

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          idempotencyKey: requestKey.current,
          table: activeTable.table_number || activeTable.table_name,
          tableId: activeTable.id,
          guestCount: currentGuestCount,
          items: cart,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false || result.error) {
        throw new Error(result.error || "Unable to send order");
      }

      setCart([]);
      requestKey.current = null;
      setDraftTableId(null);
      setMessage(result.dispatch_pending ? "Order saved · kitchen dispatch pending" : "Sent to kitchen");
      await refreshRuntime();
      await loadOpenTable(activeTable);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  }

  async function splitBySeat() {
    if (!activeTable) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loadOpenTable(activeTable);
      const items = (result?.orders || []).flatMap((order) => order.order_items || []);
      const seats = [...new Set(items.map((item) => seatOf(item)).filter(Boolean).map(String))];
      if (!seats.length) throw new Error("No seat-assigned items to split.");

      for (const seat of seats) {
        const itemIds = items
          .filter((item) => String(seatOf(item)) === seat)
          .map((item) => item.id)
          .filter(Boolean);
        if (!itemIds.length) continue;
        const assigned = await assignSeatToBillGroup({
          organizationId,
          tableId: activeTable.id,
          itemIds,
          billGroup: `Seat ${seat}`,
        });
        if (!assigned.success) throw new Error(assigned.error || `Unable to split Seat ${seat}`);
      }

      setMessage("Check split by seat");
      await loadOpenTable(activeTable);
    } catch (splitError) {
      setError(splitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveGuestToTable() {
    if (!activeTable || !targetTable || !moveSeat) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/tables/move-seat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          fromTableId: activeTable.id,
          toTableId: targetTable.id,
          seatPosition: moveSeat,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to move guest");
      }
      setModal(null);
      setTargetTableId(null);
      setMoveSeat(null);
      setMessage("Guest moved");
      await refreshRuntime();
    } catch (moveError) {
      setError(moveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function transferTable() {
    if (!activeTable || !targetTableId) return;
    setBusy(true);
    setError(null);
    try {
      await tableAction("TRANSFER_TABLE", {
        fromTableId: activeTable.id,
        toTableId: targetTableId,
      });
      setModal(null);
      setTargetTableId(null);
      setMessage("Table moved");
      setActiveTableId(null);
      await refreshRuntime();
    } catch (moveError) {
      setError(moveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function mergeTables() {
    if (!activeTable || !mergeTargetIds.length) return;
    setBusy(true);
    setError(null);
    try {
      await tableAction("MERGE_TABLES", {
        masterTableId: activeTable.id,
        targetTableIds: mergeTargetIds,
      });
      setModal(null);
      setMergeTargetIds([]);
      setMessage("Tables merged");
      await refreshRuntime();
      await loadOpenTable(activeTable);
    } catch (mergeError) {
      setError(mergeError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!runtime) {
    return <div className="min-h-[70vh] bg-black p-6 text-center text-sm text-white/35">Loading waiter...</div>;
  }

  return (
    <main className="min-h-screen bg-black p-2 text-white sm:p-3">
      <section className="mx-auto flex min-h-[calc(100vh-16px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#070707]">
        <header className="border-b border-white/10 bg-black/85 px-3 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Waiter service</div>
              <div className="mt-1 truncate text-base font-semibold">
                {activeTable ? `Table ${tableName(activeTable)}` : zones.find((zone) => zone.id === activeZoneId)?.name || "Floor"}
              </div>
            </div>
            <button type="button" onClick={refreshRuntime} className="rounded-xl border border-white/10 p-2 text-white/40" aria-label="Refresh waiter">
              <RefreshCw size={15} />
            </button>
          </div>

          {error ? <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div> : null}
          {message ? <div className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100">{message}</div> : null}
        </header>

        <div className="border-b border-white/10 px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => chooseZone(zone.id)}
                className={activeZoneId === zone.id
                  ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-[11px] font-bold text-black"
                  : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[11px] text-white/50"}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-white/10 px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {visibleTables.map((table) => {
              const active = table.id === activeTableId;
              const occupied = Number(table.current_guests || 0) > 0 || ["OCCUPIED", "OPEN", "ACTIVE", "DINING"].includes(String(table.status || "").toUpperCase());
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => chooseTable(table)}
                  className={active
                    ? "min-w-[76px] shrink-0 rounded-2xl bg-white px-3 py-3 text-left text-black"
                    : occupied
                      ? "min-w-[76px] shrink-0 rounded-2xl border border-[#D6A66A]/35 bg-[#D6A66A]/[0.07] px-3 py-3 text-left text-[#F0D59D]"
                      : "min-w-[76px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-3 text-left text-white/65"}
                >
                  <div className="text-sm font-bold">{tableName(table)}</div>
                  <div className="mt-1 text-[9px] opacity-55">{Number(table.current_guests || 0)} guests</div>
                </button>
              );
            })}
          </div>
        </div>

        {activeTable ? (
          <>
            <div className="border-b border-white/10 px-2 py-2">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                  {Array.from({ length: Math.max(1, currentGuestCount) }, (_, index) => index + 1).map((seat) => (
                    <button
                      key={seat}
                      type="button"
                      onClick={() => setSelectedSeat(seat)}
                      className={selectedSeat === seat
                        ? "h-9 min-w-9 rounded-xl bg-[#D6A66A] text-xs font-bold text-black"
                        : "h-9 min-w-9 rounded-xl border border-white/10 text-xs text-white/50"}
                    >
                      {seat}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setModal("GUESTS")} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 px-2.5 py-2 text-[10px] text-white/50">
                  <Users size={13} /> {currentGuestCount}
                </button>
              </div>
            </div>

            <div className="border-b border-white/10 px-2 py-2">
              <div className="flex gap-1.5 overflow-x-auto">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={currentCategory === category
                      ? "shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-black"
                      : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/48"}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-2 gap-2">
                {visibleDishes.map((dish) => (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => openDish(dish)}
                    className="min-h-[78px] rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left active:scale-[0.98]"
                  >
                    <div className="line-clamp-2 text-sm font-semibold">{dish.name || dish.dish_name}</div>
                    <div className="mt-2 text-[10px] text-white/30">Seat {selectedSeat}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/80 p-2">
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setModal("CHECK")} className="rounded-xl border border-white/10 py-2.5 text-[10px] font-semibold text-white/55">
                  Check {openItems.length}
                </button>
                <button type="button" onClick={() => setModal("TABLE")} className="rounded-xl border border-white/10 py-2.5 text-[10px] font-semibold text-white/55">
                  Table actions
                </button>
                <button type="button" onClick={() => setModal("CART")} className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/[0.08] py-2.5 text-[10px] font-bold text-[#F0D59D]">
                  Order {cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0)}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-white/30">
            Select a table to start service.
          </div>
        )}
      </section>

      {modal === "GUESTS" && activeTable ? (
        <Modal>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]">Table {tableName(activeTable)}</div>
              <div className="mt-1 text-xl font-semibold">Guests</div>
            </div>
            <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-white/10 p-2 text-white/45"><ChevronLeft size={16} /></button>
          </div>
          <div className="mt-5 flex items-center justify-center gap-5">
            <button type="button" disabled={busy || guestDraft <= 1} onClick={() => setGuestDraft((value) => Math.max(1, Number(value || 1) - 1))} className="h-12 w-12 rounded-2xl border border-white/10 text-white/65 disabled:opacity-25"><Minus className="mx-auto" /></button>
            <div className="min-w-16 text-center text-4xl font-light">{guestDraft}</div>
            <button type="button" disabled={busy} onClick={() => setGuestDraft((value) => Math.min(99, Number(value || 1) + 1))} className="h-12 w-12 rounded-2xl border border-white/10 text-white/65"><Plus className="mx-auto" /></button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => activeTable.active_session_id ? changeGuestCount(guestDraft).then(() => setModal(null)) : confirmGuestDraft()}
            className="mt-6 w-full rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-bold text-black disabled:opacity-35"
          >
            Confirm guests
          </button>
        </Modal>
      ) : null}

      {modal === "DISH" && dishDraft ? (
        <Modal>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]">Seat {selectedSeat}</div>
          <div className="mt-1 text-xl font-semibold">{dishDraft.name || dishDraft.dish_name}</div>
          <div className="mt-4 space-y-4">
            {modifierGroups.map((group) => (
              <div key={group.key}>
                <div className="mb-2 text-xs text-white/45">{group.label}{group.required ? " · required" : ""}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setModifierDraft((current) => ({ ...current, [group.key]: option.value }))}
                      className={modifierDraft[group.key] === option.value
                        ? "rounded-xl bg-[#D6A66A] px-3 py-2.5 text-xs font-bold text-black"
                        : "rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/55"}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <textarea
              value={modifierDraft.notes || ""}
              onChange={(event) => setModifierDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Kitchen note"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-white/10 py-3 text-xs font-semibold text-white/55">Cancel</button>
            <button type="button" onClick={addDish} className="rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black">Add to order</button>
          </div>
        </Modal>
      ) : null}

      {modal === "CART" ? (
        <Modal>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]">Current order</div>
          <div className="mt-1 text-xl font-semibold">Send to kitchen</div>
          <div className="mt-4 space-y-2">
            {cart.length ? cart.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="mt-1 text-[10px] text-white/35">Seat {item.seatPosition}{item.notes ? ` · ${item.notes}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => changeCartQuantity(item.id, -1)} className="h-8 w-8 rounded-lg border border-white/10 text-white/55">−</button>
                    <div className="w-6 text-center text-xs">{item.quantity}</div>
                    <button type="button" onClick={() => changeCartQuantity(item.id, 1)} className="h-8 w-8 rounded-lg border border-white/10 text-white/55">+</button>
                  </div>
                </div>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">No new items.</div>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-white/10 py-3 text-xs font-semibold text-white/55">Keep ordering</button>
            <button type="button" disabled={busy || !cart.length} onClick={() => sendOrder().then(() => setModal(null))} className="rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black disabled:opacity-35">{busy ? "Sending..." : "Send"}</button>
          </div>
        </Modal>
      ) : null}

      {modal === "CHECK" && activeTable ? (
        <Modal>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]">Table {tableName(activeTable)}</div>
              <div className="mt-1 text-xl font-semibold">Open check</div>
            </div>
            <button type="button" onClick={() => loadOpenTable(activeTable)} className="rounded-xl border border-white/10 p-2 text-white/45"><RefreshCw size={15} /></button>
          </div>
          <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto">
            {openItems.length ? openItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium">{Number(item.quantity || 1)} × {item.item_name || item.name || "Item"}</div>
                  <div className="mt-0.5 text-[10px] text-white/32">Seat {seatOf(item) || "—"} · {item.bill_group || "Shared check"}</div>
                </div>
                <div className="ml-2 text-white/40">{item.status || ""}</div>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">No sent items yet.</div>}
          </div>
          {openSummary ? (
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
              <span className="text-white/45">Table total</span>
              <span className="font-semibold">{Number(openSummary.total || 0).toFixed(2)}</span>
            </div>
          ) : null}
          <button type="button" disabled={busy || !openItems.length} onClick={splitBySeat} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/35 bg-[#D6A66A]/[0.08] py-3 text-xs font-bold text-[#F0D59D] disabled:opacity-30">
            <Split size={14} /> Split check by seat
          </button>
          <button type="button" onClick={() => setModal(null)} className="mt-2 w-full rounded-xl border border-white/10 py-3 text-xs text-white/45">Done</button>
        </Modal>
      ) : null}

      {modal === "TABLE" && activeTable ? (
        <Modal>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]">Table {tableName(activeTable)}</div>
          <div className="mt-1 text-xl font-semibold">Service actions</div>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={() => { setTargetTableId(null); setMoveSeat(occupiedSeatNumbers[0] || 1); setModal("MOVE_GUEST"); }} className="rounded-2xl border border-white/10 px-4 py-3 text-left text-sm">Move guest</button>
            <button type="button" onClick={() => { setTargetTableId(null); setModal("MOVE_TABLE"); }} className="rounded-2xl border border-white/10 px-4 py-3 text-left text-sm">Move whole table</button>
            <button type="button" onClick={() => { setMergeTargetIds([]); setModal("MERGE"); }} className="rounded-2xl border border-white/10 px-4 py-3 text-left text-sm">Merge tables</button>
            <button type="button" onClick={() => setModal("GUESTS")} className="rounded-2xl border border-white/10 px-4 py-3 text-left text-sm">Change guests</button>
          </div>
          <button type="button" onClick={() => setModal(null)} className="mt-4 w-full rounded-xl border border-white/10 py-3 text-xs text-white/45">Done</button>
        </Modal>
      ) : null}

      {modal === "MOVE_GUEST" && activeTable ? (
        <Modal>
          <div className="text-xl font-semibold">Move guest</div>
          <div className="mt-4 text-xs text-white/40">Seat</div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {(occupiedSeatNumbers.length ? occupiedSeatNumbers : Array.from({ length: currentGuestCount }, (_, index) => index + 1)).map((seat) => (
              <button key={seat} type="button" onClick={() => setMoveSeat(seat)} className={String(moveSeat) === String(seat) ? "h-10 min-w-10 rounded-xl bg-[#D6A66A] text-xs font-bold text-black" : "h-10 min-w-10 rounded-xl border border-white/10 text-xs text-white/55"}>{seat}</button>
            ))}
          </div>
          <div className="mt-4 text-xs text-white/40">To table</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {tables.filter((table) => table.id !== activeTable.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => (
              <button key={table.id} type="button" onClick={() => setTargetTableId(table.id)} className={targetTableId === table.id ? "rounded-xl bg-white px-2 py-3 text-xs font-bold text-black" : "rounded-xl border border-white/10 px-2 py-3 text-xs text-white/55"}>{tableName(table)}</button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModal("TABLE")} className="rounded-xl border border-white/10 py-3 text-xs text-white/50">Back</button>
            <button type="button" disabled={busy || !moveSeat || !targetTableId} onClick={moveGuestToTable} className="rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black disabled:opacity-35">Move guest</button>
          </div>
        </Modal>
      ) : null}

      {modal === "MOVE_TABLE" && activeTable ? (
        <Modal>
          <div className="text-xl font-semibold">Move whole table</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {tables.filter((table) => table.id !== activeTable.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => (
              <button key={table.id} type="button" onClick={() => setTargetTableId(table.id)} className={targetTableId === table.id ? "rounded-xl bg-white px-2 py-3 text-xs font-bold text-black" : "rounded-xl border border-white/10 px-2 py-3 text-xs text-white/55"}>{tableName(table)}</button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModal("TABLE")} className="rounded-xl border border-white/10 py-3 text-xs text-white/50">Back</button>
            <button type="button" disabled={busy || !targetTableId} onClick={transferTable} className="rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black disabled:opacity-35">Move table</button>
          </div>
        </Modal>
      ) : null}

      {modal === "MERGE" && activeTable ? (
        <Modal>
          <div className="text-xl font-semibold">Merge into Table {tableName(activeTable)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {tables.filter((table) => table.id !== activeTable.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => {
              const selected = mergeTargetIds.includes(table.id);
              return (
                <button key={table.id} type="button" onClick={() => setMergeTargetIds((current) => selected ? current.filter((id) => id !== table.id) : [...current, table.id])} className={selected ? "rounded-xl bg-white px-2 py-3 text-xs font-bold text-black" : "rounded-xl border border-white/10 px-2 py-3 text-xs text-white/55"}>{tableName(table)}</button>
              );
            })}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModal("TABLE")} className="rounded-xl border border-white/10 py-3 text-xs text-white/50">Back</button>
            <button type="button" disabled={busy || !mergeTargetIds.length} onClick={mergeTables} className="rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black disabled:opacity-35">Merge</button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
