"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Layers3,
  Move,
  Send,
  Split,
  Users,
  X,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { assignSeatToBillGroup } from "@/lib/restaurant/pos/tables/assignSeatToBillGroup";
import { groupMenuByCategory } from "@/lib/restaurant/pos/waiter/groupMenuByCategory";

const TRANSFER_UNAVAILABLE_STATUSES = new Set([
  "OCCUPIED",
  "IN_SERVICE",
  "ACTIVE",
  "SEATED",
  "ORDERING",
  "ORDERED",
  "RESERVED",
  "MERGED",
  "OUT_OF_SERVICE",
  "BLOCKED",
  "UNAVAILABLE",
]);

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function seatOf(item) {
  return item?.seat_position || item?.seat_number || item?.modifiers?.seat || null;
}

function tableIsFreeForTransfer(table) {
  const status = String(table?.status || "").trim().toUpperCase();
  return Boolean(
    table &&
      !table.active_session_id &&
      Number(table.current_guests || 0) <= 0 &&
      !TRANSFER_UNAVAILABLE_STATUSES.has(status)
  );
}

function normalizeModifierGroups(settings = {}) {
  const raw =
    settings.modifier_groups ||
    settings.modifierGroups ||
    settings.order_modifiers ||
    settings.orderModifiers ||
    settings.waiter_modifiers ||
    settings.waiterModifiers ||
    settings.modifiers ||
    settings.menuModifiers ||
    [];

  if (!Array.isArray(raw)) return [];

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

function money(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        : {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-2 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#090909] p-4 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-white/35">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-white/50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function RestaurantWaiterPhoneSurface({
  posRuntime,
  refreshPOSRuntime,
}) {
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    posRuntime?.organization?.id ||
    businessContext.organization_id ||
    organization?.id ||
    null;
  const entityId =
    posRuntime?.terminal?.entity_id ||
    posRuntime?.entity_id ||
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;

  const [runtime, setRuntime] = useState(posRuntime || null);
  const [activeZoneId, setActiveZoneId] = useState(posRuntime?.zones?.[0]?.id || null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [guestOverrides, setGuestOverrides] = useState({});
  const [guestDraft, setGuestDraft] = useState(1);
  const [cart, setCart] = useState([]);
  const [dishDraft, setDishDraft] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({});
  const [panel, setPanel] = useState(null);
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [panelData, setPanelData] = useState(null);
  const [selectedSplitSeat, setSelectedSplitSeat] = useState(null);
  const [selectedSplitGroup, setSelectedSplitGroup] = useState(null);
  const [moveSeat, setMoveSeat] = useState(null);
  const [targetTableId, setTargetTableId] = useState(null);
  const [mergeTargets, setMergeTargets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const orderKey = useRef(null);

  useEffect(() => {
    if (!posRuntime) return;
    setRuntime(posRuntime);
    setActiveZoneId((current) => current || posRuntime?.zones?.[0]?.id || null);
  }, [posRuntime]);

  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];
  const dishes = runtime?.dishes || [];
  const settings = runtime?.posSettings || runtime?.settings || {};
  const actionCapabilities = runtime?.capabilities?.actions || {};
  const canOrder = actionCapabilities.order_entry === true;
  const canMoveGuests = actionCapabilities.move_guests === true;
  const canMoveSeat = actionCapabilities.move_seat === true;
  const canAssignItems = actionCapabilities.assign_items_to_group === true;
  const canTransferTable = actionCapabilities.transfer_table === true;
  const canMergeTables = actionCapabilities.merge_tables === true;

  const modifierGroups = useMemo(
    () => normalizeModifierGroups(settings),
    [settings],
  );
  const activeTable = tables.find((table) => table.id === activeTableId) || null;
  const visibleTables = useMemo(
    () => tables.filter((table) => !activeZoneId || table.zone_id === activeZoneId),
    [activeZoneId, tables],
  );
  const transferTargets = useMemo(
    () => tables.filter((table) => table.id !== activeTableId && tableIsFreeForTransfer(table)),
    [activeTableId, tables],
  );
  const menuGroups = useMemo(() => groupMenuByCategory(dishes), [dishes]);
  const categories = Object.keys(menuGroups || {});
  const currentCategory = activeCategory || categories[0] || null;
  const visibleDishes = currentCategory ? menuGroups[currentCategory] || [] : [];

  function guestsFor(table) {
    if (!table) return 0;
    return Number(guestOverrides[table.id] ?? table.current_guests ?? 0);
  }

  const guestCount = Math.max(0, guestsFor(activeTable));
  const seats = Array.from({ length: guestCount }, (_, index) => index + 1);
  const cartUnits = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    [cart],
  );
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0),
    [cart],
  );

  async function refreshRuntime() {
    if (typeof refreshPOSRuntime !== "function") return runtime;
    const next = await refreshPOSRuntime();
    setRuntime(next || null);
    return next;
  }

  async function posAction(action, payload = {}) {
    const response = await fetch("/api/pos/tables/action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload: { ...payload, organizationId },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Restaurant action failed");
    }
    return result;
  }

  async function openTableState(table) {
    const response = await fetch("/api/pos/tables/open", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, tableId: table.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Unable to open table");
    }
    return result;
  }

  function applyZoneSelection(zoneId) {
    setActiveZoneId(zoneId);
    setActiveTableId(null);
    setSelectedSeat(1);
    setMessage(null);
    setError(null);
    orderKey.current = null;
  }

  function applyTableSelection(table) {
    if (!table || String(table.status || "").toUpperCase() === "MERGED") return;
    setActiveTableId(table.id);
    setActiveZoneId(table.zone_id || activeZoneId);
    setMessage(null);
    setError(null);
    orderKey.current = null;

    const guests = guestsFor(table);
    if (!guests) {
      setGuestDraft(1);
      setPanel("GUESTS");
    } else {
      setSelectedSeat(1);
    }
  }

  function chooseZone(zoneId) {
    if (zoneId === activeZoneId && !activeTableId) return;
    if (cart.length && activeTableId) {
      setPendingSwitch({ kind: "zone", zoneId });
      setPanel("DRAFT_SWITCH");
      return;
    }
    applyZoneSelection(zoneId);
  }

  function chooseTable(table) {
    if (!table || String(table.status || "").toUpperCase() === "MERGED") return;
    if (table.id === activeTableId) return;
    if (cart.length && activeTableId) {
      setPendingSwitch({ kind: "table", tableId: table.id });
      setPanel("DRAFT_SWITCH");
      return;
    }
    applyTableSelection(table);
  }

  function cancelDraftSwitch() {
    setPendingSwitch(null);
    setPanel(null);
  }

  function confirmDraftSwitch() {
    const next = pendingSwitch;
    if (!next) return;

    setCart([]);
    orderKey.current = null;
    setPendingSwitch(null);
    setPanel(null);

    if (next.kind === "zone") {
      applyZoneSelection(next.zoneId);
      return;
    }

    if (next.kind === "table") {
      const table = tables.find((candidate) => candidate.id === next.tableId) || null;
      if (table) applyTableSelection(table);
    }
  }

  function confirmGuestDraft() {
    if (!activeTable) return;
    const next = Math.max(1, Number(guestDraft || 1));
    setGuestOverrides((current) => ({ ...current, [activeTable.id]: next }));
    setSelectedSeat(1);
    setPanel(null);
  }

  function openDish(dish) {
    if (!canOrder) {
      setError("Your signed-in role cannot create restaurant orders.");
      return;
    }
    if (!activeTable || !guestCount) {
      setError("Choose a table and guest count first.");
      return;
    }
    setDishDraft(dish);
    const initial = { seat: String(selectedSeat || 1), notes: "" };
    modifierGroups.forEach((group) => {
      initial[group.key] = "";
    });
    setModifierDraft(initial);
    setPanel("DISH");
  }

  function addDish() {
    if (!dishDraft || !canOrder) return;
    const seat = Number(modifierDraft.seat || selectedSeat || 0);
    if (!Number.isInteger(seat) || seat < 1) {
      setError("Choose a seat before adding the item.");
      return;
    }

    for (const group of modifierGroups) {
      if (group.required && !modifierDraft[group.key]) {
        setError(`${group.label} is required.`);
        return;
      }
    }

    const dynamicModifiers = {};
    modifierGroups.forEach((group) => {
      if (modifierDraft[group.key]) dynamicModifiers[group.key] = modifierDraft[group.key];
    });

    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        dish_id: dishDraft.id,
        name: dishDraft.name || dishDraft.dish_name || "Item",
        price: Number(dishDraft.price || 0),
        quantity: 1,
        seatPosition: seat,
        notes: modifierDraft.notes || null,
        cookingLevel:
          dynamicModifiers.cooking ||
          dynamicModifiers.cooking_level ||
          dynamicModifiers.cookingLevel ||
          null,
        modifiers: {
          ...dynamicModifiers,
          seat: String(seat),
          notes: modifierDraft.notes || null,
        },
      },
    ]);
    orderKey.current = null;
    setDishDraft(null);
    setPanel(null);
    setError(null);
  }

  async function sendOrder() {
    if (!canOrder) {
      setError("Your signed-in role cannot create restaurant orders.");
      return;
    }
    if (!activeTable || !cart.length || !entityId) return;
    if (!orderKey.current) orderKey.current = crypto.randomUUID();

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": orderKey.current,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          idempotencyKey: orderKey.current,
          table: activeTable.table_number || activeTable.table_name,
          tableId: activeTable.id,
          guestCount,
          items: cart,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Order failed");
      }

      setCart([]);
      orderKey.current = null;
      setGuestOverrides((current) => {
        const next = { ...current };
        delete next[activeTable.id];
        return next;
      });
      setMessage(
        result.dispatch_pending
          ? "Order saved. Kitchen dispatch is pending."
          : "Order sent to kitchen.",
      );
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  function panelAllowed(type) {
    if (type === "SPLIT") return canAssignItems;
    if (type === "MOVE_GUEST") return canMoveSeat;
    if (type === "TRANSFER") return canTransferTable;
    if (type === "MERGE") return canMergeTables;
    if (type === "EDIT_GUESTS") return canMoveGuests;
    return true;
  }

  async function openServicePanel(type) {
    if (!activeTable) return;
    if (!panelAllowed(type)) {
      setPanel(null);
      setError("That table action is not available for your signed-in role.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const state = await openTableState(activeTable);
      setPanelData(state);
      setSelectedSplitSeat(null);
      setSelectedSplitGroup(null);
      setMoveSeat(null);
      setTargetTableId(null);
      setMergeTargets([]);
      setPanel(type);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  const openItems = useMemo(
    () =>
      (panelData?.orders || []).flatMap((order) =>
        (order.order_items || []).map((item) => ({ ...item, _order_id: order.id })),
      ),
    [panelData],
  );
  const splitSeats = useMemo(
    () => [...new Set(openItems.map((item) => seatOf(item)).filter(Boolean).map(String))],
    [openItems],
  );
  const splitGroups = useMemo(() => {
    const names = [
      ...new Set(
        openItems
          .map((item) => item.bill_group || settings.default_bill_group || "Group 1")
          .filter(Boolean),
      ),
    ];
    if (!names.length) names.push("Group 1");
    names.push(`Group ${names.length + 1}`);
    return [...new Set(names)];
  }, [openItems, settings.default_bill_group]);

  async function assignSeatGroup() {
    if (!canAssignItems) {
      setPanel(null);
      setError("Your role cannot change bill groups.");
      return;
    }
    if (!activeTable || !selectedSplitSeat || !selectedSplitGroup) return;
    const itemIds = openItems
      .filter((item) => String(seatOf(item)) === String(selectedSplitSeat))
      .map((item) => item.id)
      .filter(Boolean);
    if (!itemIds.length) return;

    setBusy(true);
    setError(null);
    try {
      const result = await assignSeatToBillGroup({
        organizationId,
        tableId: activeTable.id,
        itemIds,
        billGroup: selectedSplitGroup,
      });
      if (!result.success) throw new Error(result.error || "Unable to split seat");
      const state = await openTableState(activeTable);
      setPanelData(state);
      setMessage(`Seat ${selectedSplitSeat} moved to ${selectedSplitGroup}.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveGuest() {
    if (!canMoveSeat) {
      setPanel(null);
      setError("Your role cannot move a guest between tables.");
      return;
    }
    if (!activeTable || !moveSeat || !targetTableId) return;
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
          toTableId: targetTableId,
          seatPosition: moveSeat,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to move guest");
      }
      setPanel(null);
      setMessage(`Seat ${moveSeat} moved.`);
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function transferTable() {
    if (!canTransferTable) {
      setPanel(null);
      setError("Supervisor authority is required to move a whole table.");
      return;
    }
    if (!activeTable || !targetTableId) return;
    setBusy(true);
    setError(null);
    try {
      await posAction("TRANSFER_TABLE", {
        fromTableId: activeTable.id,
        toTableId: targetTableId,
      });
      const target = tables.find((table) => table.id === targetTableId) || null;
      setPanel(null);
      orderKey.current = null;
      if (target) {
        setActiveTableId(target.id);
        setActiveZoneId(target.zone_id || activeZoneId);
      }
      setMessage(cart.length ? "Table moved · unsent order kept with this service." : "Table moved.");
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function mergeTables() {
    if (!canMergeTables) {
      setPanel(null);
      setError("Supervisor authority is required to merge tables.");
      return;
    }
    if (!activeTable || !mergeTargets.length) return;
    setBusy(true);
    setError(null);
    try {
      await posAction("MERGE_TABLES", {
        masterTableId: activeTable.id,
        targetTableIds: mergeTargets,
      });
      setPanel(null);
      setMessage("Tables merged.");
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function persistGuestCount() {
    if (!canMoveGuests) {
      setPanel(null);
      setError("Your role cannot change the guest count for an active table.");
      return;
    }
    if (!activeTable) return;
    setBusy(true);
    setError(null);
    try {
      await posAction("MOVE_GUESTS", {
        tableId: activeTable.id,
        guestCount: Math.max(1, Number(guestDraft || guestCount || 1)),
      });
      setPanel(null);
      setGuestOverrides((current) => {
        const next = { ...current };
        delete next[activeTable.id];
        return next;
      });
      setMessage("Guest count updated.");
      await refreshRuntime();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black p-2 text-white" data-restaurant-waiter-phone="true">
      <section className="mx-auto flex min-h-[calc(100vh-16px)] w-full max-w-[480px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#070707]">
        <header className="border-b border-white/10 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">
                Service
              </div>
              <div className="mt-1 truncate text-base font-semibold">
                {activeTable ? `Table ${tableName(activeTable)}` : "Choose table"}
              </div>
              <div className="mt-0.5 text-[10px] text-white/35">
                {activeTable ? `${guestCount} guests · seat ${selectedSeat || "—"}` : "Order · seats · split · move"}
              </div>
            </div>

            <button
              type="button"
              disabled={!activeTable}
              onClick={() => openServicePanel("ACTIONS")}
              className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-semibold text-white/55 disabled:opacity-30"
            >
              Table actions
            </button>
          </div>
        </header>

        <div className="border-b border-white/10 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => chooseZone(zone.id)}
                className={
                  activeZoneId === zone.id
                    ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-xs font-semibold text-black"
                    : "shrink-0 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/50"
                }
              >
                {zone.name || zone.zone_name || "Area"}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-white/10 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleTables.map((table) => {
              const occupied = guestsFor(table) > 0;
              const active = table.id === activeTableId;
              const merged = String(table.status || "").toUpperCase() === "MERGED";
              return (
                <button
                  key={table.id}
                  type="button"
                  disabled={merged}
                  onClick={() => chooseTable(table)}
                  className={
                    active
                      ? "min-w-20 shrink-0 rounded-2xl bg-white px-4 py-3 text-left text-black"
                      : occupied
                        ? "min-w-20 shrink-0 rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 px-4 py-3 text-left text-[#E9CF9A]"
                        : "min-w-20 shrink-0 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-left text-white/65 disabled:opacity-25"
                  }
                >
                  <div className="text-sm font-semibold">{tableName(table)}</div>
                  <div className="mt-1 text-[9px] opacity-55">{merged ? "Merged" : occupied ? `${guestsFor(table)} guests` : "Free"}</div>
                </button>
              );
            })}
          </div>
        </div>

        {activeTable && guestCount ? (
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-[9px] uppercase tracking-[0.18em] text-white/30">Seat</span>
              {seats.map((seat) => (
                <button
                  key={seat}
                  type="button"
                  onClick={() => setSelectedSeat(seat)}
                  className={
                    selectedSeat === seat
                      ? "h-9 min-w-9 rounded-xl bg-[#D6A66A] px-3 text-xs font-bold text-black"
                      : "h-9 min-w-9 rounded-xl border border-white/10 px-3 text-xs text-white/55"
                  }
                >
                  {seat}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!canOrder ? (
            <div className="mb-3 rounded-2xl border border-[#A37849]/20 bg-[#A37849]/[0.06] px-3 py-3 text-xs text-[#9A744B]" data-waiter-order-authority-boundary="true">
              Order entry is not available for your signed-in role.
            </div>
          ) : null}

          {categories.length ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={
                    currentCategory === category
                      ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-[11px] font-semibold text-black"
                      : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[11px] text-white/50"
                  }
                >
                  {category}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {visibleDishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                disabled={!canOrder || !activeTable || !guestCount}
                onClick={() => openDish(dish)}
                className="min-h-20 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left disabled:opacity-25"
              >
                <div className="line-clamp-2 text-sm font-medium">{dish.name || dish.dish_name}</div>
                {dish.price != null ? (
                  <div className="mt-2 text-[10px] text-[#D6A66A]/75">{money(dish.price, currencyCode)}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <footer className="border-t border-white/10 bg-black/60 p-3">
          {error ? <div className="mb-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div> : null}
          {message ? <div className="mb-2 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-2 text-xs text-[#E9CF9A]">{message}</div> : null}

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/30">Current order</div>
              <div className="mt-1 text-sm font-semibold">{cartUnits} item{cartUnits === 1 ? "" : "s"}</div>
              <div className="mt-0.5 text-[10px] text-white/30">{money(cartSubtotal, currencyCode)}</div>
            </div>
            <button
              type="button"
              disabled={busy || !canOrder || !cart.length || !activeTable || !entityId}
              onClick={sendOrder}
              className="inline-flex min-w-40 items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 py-3 text-sm font-bold text-black disabled:opacity-30"
            >
              <Send size={16} /> {busy ? "Sending..." : "Send order"}
            </button>
          </div>

          {cart.length ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {cart.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCart((current) => current.filter((row) => row.id !== item.id));
                    orderKey.current = null;
                  }}
                  className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-left text-[10px] text-white/55"
                >
                  S{item.seatPosition} · {item.name} ×
                </button>
              ))}
            </div>
          ) : null}
        </footer>
      </section>

      {panel === "DRAFT_SWITCH" && pendingSwitch && activeTable ? (
        <Modal
          title="Unsent order on this table"
          subtitle={`${cartUnits} unsent item${cartUnits === 1 ? "" : "s"} belong to Table ${tableName(activeTable)}.`}
          onClose={cancelDraftSwitch}
        >
          <div className="space-y-3" data-waiter-draft-switch-guard="true">
            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-3 text-xs leading-5 text-amber-100">
              Keep working here, or explicitly discard this unsent order before switching tables or areas.
            </div>
            <button type="button" onClick={cancelDraftSwitch} className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black">
              Keep current order
            </button>
            <button type="button" onClick={confirmDraftSwitch} className="w-full rounded-2xl border border-red-400/25 bg-red-500/[0.06] py-3 text-sm font-semibold text-red-200">
              Discard order & switch
            </button>
          </div>
        </Modal>
      ) : null}

      {panel === "GUESTS" && activeTable ? (
        <Modal title={`Guests · ${tableName(activeTable)}`} onClose={() => setPanel(null)}>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGuestDraft(value)}
                className={
                  Number(guestDraft) === value
                    ? "rounded-xl bg-[#D6A66A] py-3 text-sm font-bold text-black"
                    : "rounded-xl border border-white/10 py-3 text-sm text-white/60"
                }
              >
                {value}
              </button>
            ))}
          </div>
          <button type="button" onClick={confirmGuestDraft} className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black">
            Continue
          </button>
        </Modal>
      ) : null}

      {panel === "DISH" && dishDraft ? (
        <Modal title={dishDraft.name || dishDraft.dish_name || "Item"} onClose={() => setPanel(null)}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Seat</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {seats.map((seat) => (
              <button
                key={seat}
                type="button"
                onClick={() => setModifierDraft((current) => ({ ...current, seat: String(seat) }))}
                className={
                  String(modifierDraft.seat) === String(seat)
                    ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
                    : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"
                }
              >
                {seat}
              </button>
            ))}
          </div>

          {modifierGroups.map((group) => (
            <div key={group.key} className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                {group.label}{group.required ? " · required" : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setModifierDraft((current) => ({ ...current, [group.key]: option.value }))}
                    className={
                      modifierDraft[group.key] === option.value
                        ? "rounded-xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2 text-xs text-[#E9CF9A]"
                        : "rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50"
                    }
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
            rows={3}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black px-3 py-3 text-sm outline-none"
          />
          <button type="button" onClick={addDish} className="mt-3 w-full rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-bold text-black">
            Add to seat {modifierDraft.seat || selectedSeat}
          </button>
        </Modal>
      ) : null}

      {panel === "ACTIONS" && activeTable ? (
        <Modal title={`Table ${tableName(activeTable)}`} onClose={() => setPanel(null)}>
          <div className="grid gap-2" data-waiter-authorized-actions="true">
            {canAssignItems ? (
              <button type="button" onClick={() => openServicePanel("SPLIT")} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Split size={17} className="text-[#D6A66A]" /> Split by seat / bill group</button>
            ) : null}
            {canMoveSeat ? (
              <button type="button" onClick={() => openServicePanel("MOVE_GUEST")} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Move size={17} className="text-[#D6A66A]" /> Move guest / seat</button>
            ) : null}
            {canTransferTable ? (
              <button type="button" onClick={() => openServicePanel("TRANSFER")} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><ArrowRightLeft size={17} className="text-[#D6A66A]" /> Move whole table</button>
            ) : null}
            {canMergeTables ? (
              <button type="button" onClick={() => openServicePanel("MERGE")} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Layers3 size={17} className="text-[#D6A66A]" /> Merge tables</button>
            ) : null}
            {canMoveGuests ? (
              <button type="button" onClick={() => { setGuestDraft(Math.max(1, guestCount)); setPanel("EDIT_GUESTS"); }} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Users size={17} className="text-[#D6A66A]" /> Change guest count</button>
            ) : null}
          </div>
          {!canTransferTable || !canMergeTables ? (
            <div className="mt-3 rounded-xl border border-[#A37849]/20 bg-[#A37849]/[0.06] px-3 py-2 text-[10px] leading-4 text-[#9A744B]" data-waiter-supervisor-boundary="true">
              Whole-table move and merge are supervisor actions and only appear when your signed-in role is authorized.
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] px-3 py-2 text-[10px] leading-4 text-[#E9CF9A]/70">
            Payment is intentionally not available on the waiter phone. Settlement is completed at the stationary POS.
          </div>
        </Modal>
      ) : null}

      {panel === "SPLIT" && canAssignItems ? (
        <Modal title="Split check" onClose={() => setPanel(null)}>
          <div className="text-xs text-white/45">Move all items for a seat into a bill group. The same groups are visible to the stationary POS.</div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/30">Seat</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {splitSeats.map((seat) => (
              <button key={seat} type="button" onClick={() => setSelectedSplitSeat(seat)} className={selectedSplitSeat === seat ? "rounded-xl bg-white px-4 py-2 text-xs font-bold text-black" : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"}>{seat}</button>
            ))}
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/30">Bill group</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {splitGroups.map((group) => (
              <button key={group} type="button" onClick={() => setSelectedSplitGroup(group)} className={selectedSplitGroup === group ? "rounded-xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 px-4 py-2 text-xs text-[#E9CF9A]" : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"}>{group}</button>
            ))}
          </div>
          <button type="button" disabled={busy || !selectedSplitSeat || !selectedSplitGroup} onClick={assignSeatGroup} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3 text-sm font-bold text-black disabled:opacity-30">Move seat to bill group</button>
        </Modal>
      ) : null}

      {panel === "MOVE_GUEST" && canMoveSeat ? (
        <Modal title="Move guest" onClose={() => setPanel(null)}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Seat</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {splitSeats.map((seat) => (
              <button key={seat} type="button" onClick={() => setMoveSeat(seat)} className={String(moveSeat) === String(seat) ? "rounded-xl bg-white px-4 py-2 text-xs font-bold text-black" : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"}>{seat}</button>
            ))}
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/30">Destination table</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {tables.filter((table) => table.id !== activeTable?.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => (
              <button key={table.id} type="button" onClick={() => setTargetTableId(table.id)} className={targetTableId === table.id ? "rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black" : "rounded-xl border border-white/10 py-3 text-xs text-white/55"}>{tableName(table)}</button>
            ))}
          </div>
          <button type="button" disabled={busy || !moveSeat || !targetTableId} onClick={moveGuest} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3 text-sm font-bold text-black disabled:opacity-30">Move guest</button>
        </Modal>
      ) : null}

      {panel === "TRANSFER" && canTransferTable ? (
        <Modal title="Move whole table" subtitle="Only empty available tables can receive the service." onClose={() => setPanel(null)}>
          <div className="grid grid-cols-3 gap-2">
            {transferTargets.map((table) => (
              <button key={table.id} type="button" onClick={() => setTargetTableId(table.id)} className={targetTableId === table.id ? "rounded-xl bg-[#D6A66A] py-3 text-xs font-bold text-black" : "rounded-xl border border-white/10 py-3 text-xs text-white/55"}>{tableName(table)}</button>
            ))}
          </div>
          {!transferTargets.length ? (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/35">No empty available table. Use Merge tables for an occupied service.</div>
          ) : null}
          <button type="button" disabled={busy || !targetTableId} onClick={transferTable} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3 text-sm font-bold text-black disabled:opacity-30">Move table</button>
        </Modal>
      ) : null}

      {panel === "MERGE" && canMergeTables ? (
        <Modal title="Merge tables" onClose={() => setPanel(null)}>
          <div className="grid grid-cols-3 gap-2">
            {tables.filter((table) => table.id !== activeTable?.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => {
              const selected = mergeTargets.includes(table.id);
              return (
                <button key={table.id} type="button" onClick={() => setMergeTargets((current) => selected ? current.filter((id) => id !== table.id) : [...current, table.id])} className={selected ? "rounded-xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 py-3 text-xs font-bold text-[#E9CF9A]" : "rounded-xl border border-white/10 py-3 text-xs text-white/55"}>{tableName(table)}</button>
              );
            })}
          </div>
          <button type="button" disabled={busy || !mergeTargets.length} onClick={mergeTables} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3 text-sm font-bold text-black disabled:opacity-30">Merge into {tableName(activeTable)}</button>
        </Modal>
      ) : null}

      {panel === "EDIT_GUESTS" && canMoveGuests ? (
        <Modal title="Guest count" onClose={() => setPanel(null)}>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <button key={value} type="button" onClick={() => setGuestDraft(value)} className={Number(guestDraft) === value ? "rounded-xl bg-[#D6A66A] py-3 text-sm font-bold text-black" : "rounded-xl border border-white/10 py-3 text-sm text-white/60"}>{value}</button>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={persistGuestCount} className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:opacity-30">Update guests</button>
        </Modal>
      ) : null}
    </main>
  );
}
