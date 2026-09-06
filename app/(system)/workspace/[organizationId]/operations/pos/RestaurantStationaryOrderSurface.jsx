"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Layers3,
  Minus,
  Plus,
  Search,
  Send,
  Settings2,
  Users,
  X,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { groupMenuByCategory } from "@/lib/restaurant/pos/waiter/groupMenuByCategory";

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function tableReference(table) {
  const value = table?.table_number || table?.table_name || table?.name || table?.id || null;
  return value === null || value === undefined ? null : String(value);
}

function matchesTableReference(table, reference) {
  const preferred = String(reference || "").trim().toLowerCase();
  if (!preferred) return false;
  return [table?.id, table?.table_number, table?.table_name, table?.name]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .some((value) => value === preferred || `table ${value}` === preferred);
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
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function tableTone(table, active) {
  if (active) return "border-[#D6A66A]/70 bg-[#D6A66A]/12 text-[#F2D7A3]";
  if (String(table?.status || "").toUpperCase() === "MERGED") {
    return "border-red-400/20 bg-red-500/[0.06] text-red-200/60";
  }
  if (Number(table?.current_guests || 0) > 0 || String(table?.status || "").toUpperCase() === "OCCUPIED") {
    return "border-white/15 bg-white/[0.045] text-white";
  }
  return "border-white/10 bg-white/[0.02] text-white/60";
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-[28px] border border-white/10 bg-[#090909] p-5 shadow-2xl ${wide ? "max-w-[620px]" : "max-w-[430px]"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-white/35">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-white/45 transition hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export default function RestaurantStationaryOrderSurface({
  posRuntime,
  refreshPOSRuntime,
  preferredTableReference = null,
  onActiveContextChange,
  onOrderComplete,
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
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [dishDraft, setDishDraft] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({});
  const [modal, setModal] = useState(null);
  const [targetTableId, setTargetTableId] = useState(null);
  const [mergeTargetIds, setMergeTargetIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const orderKey = useRef(null);
  const preferredApplied = useRef(null);

  useEffect(() => {
    if (!posRuntime) return;
    setRuntime(posRuntime);
    setActiveZoneId((current) => current || posRuntime?.zones?.[0]?.id || null);
  }, [posRuntime]);

  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];
  const dishes = runtime?.dishes || [];
  const settings = runtime?.posSettings || runtime?.settings || {};
  const modifierGroups = useMemo(() => normalizeModifierGroups(settings), [settings]);
  const activeTable = tables.find((table) => table.id === activeTableId) || null;

  function guestsFor(table) {
    if (!table) return 0;
    return Number(guestOverrides[table.id] ?? table.current_guests ?? 0);
  }

  const guestCount = Math.max(0, guestsFor(activeTable));
  const seats = Array.from({ length: guestCount }, (_, index) => index + 1);
  const visibleTables = useMemo(
    () => tables
      .filter((table) => !activeZoneId || table.zone_id === activeZoneId)
      .sort((a, b) => String(tableName(a)).localeCompare(String(tableName(b)), undefined, { numeric: true })),
    [activeZoneId, tables],
  );
  const menuGroups = useMemo(() => groupMenuByCategory(dishes), [dishes]);
  const categories = Object.keys(menuGroups || {});
  const currentCategory = activeCategory || categories[0] || null;
  const visibleDishes = useMemo(() => {
    const source = currentCategory ? menuGroups[currentCategory] || [] : dishes;
    const needle = search.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((dish) =>
      String(dish.name || dish.dish_name || "").toLowerCase().includes(needle),
    );
  }, [currentCategory, dishes, menuGroups, search]);
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0),
    [cart],
  );
  const cartUnits = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    [cart],
  );

  useEffect(() => {
    const preferred = String(preferredTableReference || "").trim();
    if (!preferred || !tables.length || preferredApplied.current === preferred) return;
    const match = tables.find((table) => matchesTableReference(table, preferred));
    if (!match) return;
    preferredApplied.current = preferred;
    setActiveZoneId(match.zone_id || activeZoneId);
    setActiveTableId(match.id);
    setSelectedSeat(1);
    onActiveContextChange?.(tableReference(match));
    if (!guestsFor(match)) {
      setGuestDraft(1);
      setModal("GUESTS");
    }
  }, [preferredTableReference, tables]);

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
      body: JSON.stringify({ action, payload: { ...payload, organizationId } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Restaurant action failed");
    }
    return result;
  }

  function chooseZone(zoneId) {
    setActiveZoneId(zoneId);
    setActiveTableId(null);
    setCart([]);
    setSelectedSeat(1);
    setMessage(null);
    setError(null);
    orderKey.current = null;
    onActiveContextChange?.(null);
  }

  function chooseTable(table) {
    if (String(table.status || "").toUpperCase() === "MERGED") return;
    if (table.id !== activeTableId) {
      setCart([]);
      orderKey.current = null;
    }
    setActiveTableId(table.id);
    setActiveZoneId(table.zone_id || activeZoneId);
    setSelectedSeat(1);
    setMessage(null);
    setError(null);
    onActiveContextChange?.(tableReference(table));

    if (!guestsFor(table)) {
      setGuestDraft(1);
      setModal("GUESTS");
    }
  }

  async function confirmGuests() {
    if (!activeTable) return;
    const next = Math.max(1, Number(guestDraft || 1));
    setBusy(true);
    setError(null);
    try {
      if (activeTable.active_session_id || Number(activeTable.current_guests || 0) > 0) {
        await posAction("MOVE_GUESTS", { tableId: activeTable.id, guestCount: next });
        await refreshRuntime();
      } else {
        setGuestOverrides((current) => ({ ...current, [activeTable.id]: next }));
      }
      setSelectedSeat(1);
      setModal(null);
    } catch (actionError) {
      setError(actionError?.message || "Unable to update guest count");
    } finally {
      setBusy(false);
    }
  }

  function openDish(dish) {
    if (!activeTable) {
      setError("Choose a table first.");
      return;
    }
    if (!guestCount) {
      setGuestDraft(1);
      setModal("GUESTS");
      return;
    }

    const initial = { seat: String(selectedSeat || 1), notes: "" };
    modifierGroups.forEach((group) => {
      initial[group.key] = "";
    });
    setDishDraft(dish);
    setModifierDraft(initial);
    setModal("DISH");
  }

  function addDish() {
    if (!dishDraft) return;
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
    setSelectedSeat(seat);
    setDishDraft(null);
    setModal(null);
    setError(null);
  }

  function changeQuantity(itemId, delta) {
    setCart((current) => current
      .map((item) => item.id === itemId
        ? { ...item, quantity: Math.max(0, Number(item.quantity || 1) + delta) }
        : item)
      .filter((item) => Number(item.quantity || 0) > 0));
    orderKey.current = null;
  }

  function removeItem(itemId) {
    setCart((current) => current.filter((item) => item.id !== itemId));
    orderKey.current = null;
  }

  async function sendOrder() {
    if (!activeTable || !cart.length || !entityId || !guestCount) return;
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
      setMessage(result.dispatch_pending ? "Order saved · kitchen dispatch pending" : "Order sent to kitchen");
      await refreshRuntime();
      onOrderComplete?.({ result, table: activeTable });
    } catch (actionError) {
      setError(actionError?.message || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer() {
    if (!activeTable || !targetTableId) return;
    setBusy(true);
    setError(null);
    try {
      await posAction("TRANSFER_TABLE", {
        fromTableId: activeTable.id,
        toTableId: targetTableId,
      });
      const next = tables.find((table) => table.id === targetTableId) || null;
      setModal(null);
      setTargetTableId(null);
      setCart([]);
      orderKey.current = null;
      if (next) {
        setActiveTableId(next.id);
        setActiveZoneId(next.zone_id || activeZoneId);
        onActiveContextChange?.(tableReference(next));
      }
      await refreshRuntime();
      setMessage("Table moved.");
    } catch (actionError) {
      setError(actionError?.message || "Unable to move table");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (!activeTable || !mergeTargetIds.length) return;
    setBusy(true);
    setError(null);
    try {
      await posAction("MERGE_TABLES", {
        masterTableId: activeTable.id,
        targetTableIds: mergeTargetIds,
      });
      setModal(null);
      setMergeTargetIds([]);
      await refreshRuntime();
      setMessage("Tables merged.");
    } catch (actionError) {
      setError(actionError?.message || "Unable to merge tables");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-h-[calc(100vh-132px)] bg-[#050505]" data-restaurant-stationary-order-surface="true">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Active service</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-xl font-light tracking-tight">
                {activeTable ? `Table ${tableName(activeTable)}` : "Choose a table"}
              </h2>
              {activeTable ? (
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/45">
                  {guestCount} guest{guestCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[10px] text-white/30">
              Table and order stay left · authoritative settlement stays visible at right.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTable ? (
              <button
                type="button"
                onClick={() => setModal("TABLE_ACTIONS")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs text-white/55"
              >
                <Settings2 size={14} /> Table
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || !cart.length || !activeTable || !entityId || !guestCount}
              onClick={sendOrder}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-bold text-black disabled:opacity-30"
            >
              <Send size={14} /> {busy ? "Sending..." : `Send ${cartUnits || ""}`}
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-3 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-2 text-xs text-[#E9CF9A]">{message}</div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
        ) : null}
      </div>

      <div className="grid min-h-[calc(100vh-230px)] xl:grid-cols-[210px_minmax(0,1fr)_310px]">
        <aside className="border-b border-white/10 p-3 xl:border-b-0 xl:border-r">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">Areas</div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 xl:flex-wrap">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => chooseZone(zone.id)}
                className={activeZoneId === zone.id
                  ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-[10px] font-bold text-black"
                  : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/45"}
              >
                {zone.name || zone.zone_name || "Area"}
              </button>
            ))}
          </div>

          <div className="mt-4 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">Tables</div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-2">
            {visibleTables.map((table) => {
              const active = table.id === activeTableId;
              const merged = String(table.status || "").toUpperCase() === "MERGED";
              const guests = guestsFor(table);
              return (
                <button
                  key={table.id}
                  type="button"
                  disabled={merged}
                  onClick={() => chooseTable(table)}
                  className={`min-h-16 rounded-2xl border px-3 py-2.5 text-left transition ${tableTone(table, active)} disabled:opacity-35`}
                >
                  <div className="text-sm font-semibold">{tableName(table)}</div>
                  <div className="mt-1 text-[9px] opacity-45">{merged ? "Merged" : guests ? `${guests} guests` : "Free"}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 border-b border-white/10 p-3 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search menu"
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-xs outline-none placeholder:text-white/25"
              />
            </div>
            {activeTable && guestCount ? (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="mr-1 text-[9px] uppercase tracking-[0.15em] text-white/30">Seat</span>
                {seats.map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    onClick={() => setSelectedSeat(seat)}
                    className={selectedSeat === seat
                      ? "h-9 min-w-9 rounded-xl bg-[#D6A66A] px-3 text-xs font-bold text-black"
                      : "h-9 min-w-9 rounded-xl border border-white/10 px-3 text-xs text-white/50"}
                  >
                    {seat}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={currentCategory === category
                  ? "shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-black"
                  : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/45"}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-3">
            {visibleDishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                disabled={!activeTable || !guestCount}
                onClick={() => openDish(dish)}
                className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/[0.035] disabled:opacity-25"
              >
                <div className="line-clamp-2 text-sm font-medium">{dish.name || dish.dish_name}</div>
                {dish.price != null ? (
                  <div className="mt-3 text-[10px] font-medium text-[#D6A66A]/75">{money(dish.price, currencyCode)}</div>
                ) : null}
              </button>
            ))}
          </div>

          {!visibleDishes.length ? (
            <div className="mt-3 flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-white/30">
              No menu items match this view.
            </div>
          ) : null}
        </div>

        <aside className="p-3" data-stationary-draft-order="true">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Draft order</div>
              <div className="mt-1 text-base font-semibold">{cartUnits} item{cartUnits === 1 ? "" : "s"}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Draft subtotal</div>
              <div className="mt-1 text-sm font-semibold">{money(cartSubtotal, currencyCode)}</div>
            </div>
          </div>

          <div className="mt-3 max-h-[calc(100vh-365px)] space-y-2 overflow-y-auto pr-1">
            {cart.length ? cart.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{item.name}</div>
                    <div className="mt-1 text-[9px] text-white/35">Seat {item.seatPosition}{item.notes ? ` · ${item.notes}` : ""}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.05] hover:text-white/70"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => changeQuantity(item.id, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/55"><Minus size={12} /></button>
                    <div className="min-w-8 text-center text-xs font-semibold">{item.quantity}</div>
                    <button type="button" onClick={() => changeQuantity(item.id, 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/55"><Plus size={12} /></button>
                  </div>
                  <div className="text-xs text-white/55">{money(Number(item.price || 0) * Number(item.quantity || 1), currencyCode)}</div>
                </div>
              </div>
            )) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 text-center">
                <div className="text-xs font-medium text-white/45">No draft items</div>
                <div className="mt-1 text-[10px] leading-4 text-white/25">Choose a table and seat, then tap menu items.</div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={busy || !cart.length || !activeTable || !entityId || !guestCount}
            onClick={sendOrder}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 py-3.5 text-sm font-bold text-black disabled:opacity-30"
          >
            <Send size={15} /> {busy ? "Sending..." : "Send to kitchen"}
          </button>
        </aside>
      </div>

      {modal === "GUESTS" && activeTable ? (
        <Modal title={`Guests · Table ${tableName(activeTable)}`} subtitle="Set covers before adding items." onClose={() => setModal(null)}>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGuestDraft(value)}
                className={Number(guestDraft) === value
                  ? "rounded-xl bg-[#D6A66A] py-3 text-sm font-bold text-black"
                  : "rounded-xl border border-white/10 py-3 text-sm text-white/60"}
              >
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={confirmGuests}
            className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:opacity-35"
          >
            {busy ? "Saving..." : "Continue"}
          </button>
        </Modal>
      ) : null}

      {modal === "DISH" && dishDraft ? (
        <Modal title={dishDraft.name || dishDraft.dish_name || "Item"} subtitle={`Table ${tableName(activeTable)} · choose the exact seat and preparation.`} onClose={() => setModal(null)} wide>
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">Seat</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {seats.map((seat) => (
              <button
                key={seat}
                type="button"
                onClick={() => setModifierDraft((current) => ({ ...current, seat: String(seat) }))}
                className={String(modifierDraft.seat) === String(seat)
                  ? "rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-bold text-black"
                  : "rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/55"}
              >
                Seat {seat}
              </button>
            ))}
          </div>

          {modifierGroups.map((group) => (
            <div key={group.key} className="mt-4">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{group.label}{group.required ? " · required" : ""}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setModifierDraft((current) => ({ ...current, [group.key]: option.value }))}
                    className={modifierDraft[group.key] === option.value
                      ? "rounded-xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2.5 text-xs text-[#E9CF9A]"
                      : "rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50"}
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
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black px-3 py-3 text-sm outline-none placeholder:text-white/25"
          />
          <button type="button" onClick={addDish} className="mt-3 w-full rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-bold text-black">
            Add to seat {modifierDraft.seat || selectedSeat}
          </button>
        </Modal>
      ) : null}

      {modal === "TABLE_ACTIONS" && activeTable ? (
        <Modal title={`Table ${tableName(activeTable)}`} subtitle="Operational changes only. Settlement remains in the payment rail." onClose={() => setModal(null)}>
          <div className="grid gap-2">
            <button type="button" onClick={() => { setGuestDraft(Math.max(1, guestCount)); setModal("GUESTS"); }} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Users size={16} className="text-[#D6A66A]" /> Change guest count</button>
            <button type="button" onClick={() => { setTargetTableId(null); setModal("TRANSFER"); }} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><ArrowRightLeft size={16} className="text-[#D6A66A]" /> Move whole table</button>
            <button type="button" onClick={() => { setMergeTargetIds([]); setModal("MERGE"); }} className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm"><Layers3 size={16} className="text-[#D6A66A]" /> Merge tables</button>
          </div>
        </Modal>
      ) : null}

      {modal === "TRANSFER" && activeTable ? (
        <Modal title="Move whole table" subtitle={`Move Table ${tableName(activeTable)} and its open service to another table.`} onClose={() => setModal(null)}>
          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {tables.filter((table) => table.id !== activeTable.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setTargetTableId(table.id)}
                className={targetTableId === table.id
                  ? "w-full rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 px-4 py-3 text-left text-[#E9CF9A]"
                  : "w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-white/60"}
              >
                <div className="text-sm font-medium">Table {tableName(table)}</div>
                <div className="mt-1 text-[10px] opacity-50">{guestsFor(table)} guests</div>
              </button>
            ))}
          </div>
          <button type="button" disabled={busy || !targetTableId} onClick={confirmTransfer} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-bold text-black disabled:opacity-30">
            {busy ? "Moving..." : "Move table"}
          </button>
        </Modal>
      ) : null}

      {modal === "MERGE" && activeTable ? (
        <Modal title="Merge tables" subtitle={`Table ${tableName(activeTable)} remains the master table.`} onClose={() => setModal(null)}>
          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {tables.filter((table) => table.id !== activeTable.id && String(table.status || "").toUpperCase() !== "MERGED").map((table) => {
              const selected = mergeTargetIds.includes(table.id);
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setMergeTargetIds((current) => selected ? current.filter((id) => id !== table.id) : [...current, table.id])}
                  className={selected
                    ? "w-full rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 px-4 py-3 text-left text-[#E9CF9A]"
                    : "w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-white/60"}
                >
                  <div className="text-sm font-medium">Table {tableName(table)}</div>
                  <div className="mt-1 text-[10px] opacity-50">{guestsFor(table)} guests</div>
                </button>
              );
            })}
          </div>
          <button type="button" disabled={busy || !mergeTargetIds.length} onClick={confirmMerge} className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-bold text-black disabled:opacity-30">
            {busy ? "Merging..." : `Merge ${mergeTargetIds.length} table${mergeTargetIds.length === 1 ? "" : "s"}`}
          </button>
        </Modal>
      ) : null}
    </section>
  );
}
