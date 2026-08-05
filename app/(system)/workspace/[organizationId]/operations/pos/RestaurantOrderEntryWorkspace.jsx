"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import useRestaurantPOSRealtime from "@/lib/restaurant/pos/realtime/useRestaurantPOSRealtime";
import { loadWaiterData } from "@/lib/restaurant/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/restaurant/pos/waiter/groupMenuByCategory";

const FALLBACK_REFRESH_MS = 10000;

function normalizeReference(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^table\s+/i, "")
    .replace(/\s+/g, " ");
}

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function tableReference(table) {
  return table?.table_number || table?.table_name || table?.id || "";
}

function tableMatches(table, requestedReference) {
  const requested = normalizeReference(requestedReference);
  if (!requested) return false;

  return [
    table?.id,
    table?.table_number,
    table?.table_name,
    table?.name,
  ].some((value) => normalizeReference(value) === requested);
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

function realtimeLabel(status, refreshing) {
  if (refreshing) return "Refreshing";
  if (status === "live") return "Live";
  if (status === "connecting") return "Connecting";
  if (status === "polling") return "Polling fallback";
  return "Offline";
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
                  }
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
                  }
            )
          : [],
      }))
      .filter((group) => group.options.length);
  }

  return [];
}

function Modal({ children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <div
        className={
          wide
            ? "max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#080808] p-5 text-white shadow-2xl"
            : "max-h-[90vh] w-full max-w-[390px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#080808] p-5 text-white shadow-2xl"
        }
      >
        {children}
      </div>
    </div>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export default function RestaurantOrderEntryWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;

  const requestKeyRef = useRef(null);
  const orderRequestKey = useRef(null);
  const runtimeRefreshRef = useRef(false);

  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [handoffError, setHandoffError] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [customerDraft, setCustomerDraft] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [guestDraft, setGuestDraft] = useState(1);
  const [draftSetupTableId, setDraftSetupTableId] = useState(null);

  const [dishDraft, setDishDraft] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({});
  const [cart, setCart] = useState([]);

  const requestedReference =
    searchParams.get("service_context") || searchParams.get("table") || "";
  const requestedAction = String(searchParams.get("action") || "")
    .trim()
    .toLowerCase();

  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];
  const dishes = runtime?.dishes || [];
  const settings = runtime?.posSettings || {};
  const activeTable =
    tables.find((table) => table.id === activeTableId) || null;

  const menuGroups = useMemo(
    () => groupMenuByCategory(dishes),
    [dishes]
  );
  const categories = Object.keys(menuGroups || {});
  const currentCategory = activeCategory || categories[0] || null;
  const visibleDishes = currentCategory
    ? menuGroups[currentCategory] || []
    : [];
  const modifierGroups = useMemo(
    () => normalizeModifierGroups(settings),
    [settings]
  );
  const visibleTables = useMemo(() => {
    if (!activeZoneId) return tables;
    return tables.filter((table) => table.zone_id === activeZoneId);
  }, [activeZoneId, tables]);
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    [cart]
  );

  const loadRuntime = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId || runtimeRefreshRef.current) return;

    runtimeRefreshRef.current = true;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const loaded = await loadWaiterData(organizationId);
      setRuntime(loaded);
      setError(null);
      setActiveZoneId((current) => current || loaded?.zones?.[0]?.id || null);

      const grouped = groupMenuByCategory(loaded?.dishes || []);
      setActiveCategory((current) => current || Object.keys(grouped || {})[0] || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load restaurant order entry");
    } finally {
      runtimeRefreshRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  const refreshFromRealtime = useCallback(() => {
    if (!busy) {
      loadRuntime({ silent: true });
    }
  }, [busy, loadRuntime]);

  const realtimeStatus = useRestaurantPOSRealtime({
    organizationId,
    enabled: Boolean(organizationId),
    onChange: refreshFromRealtime,
  });

  useEffect(() => {
    if (!organizationId) return undefined;

    const onFocus = () => {
      if (!busy) loadRuntime({ silent: true });
    };

    window.addEventListener("focus", onFocus);

    if (realtimeStatus === "live") {
      return () => {
        window.removeEventListener("focus", onFocus);
      };
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) {
        loadRuntime({ silent: true });
      }
    }, FALLBACK_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [busy, loadRuntime, organizationId, realtimeStatus]);

  useEffect(() => {
    if (!runtime || !requestedReference) {
      if (!requestedReference) requestKeyRef.current = null;
      return;
    }

    const requestKey = `${organizationId}:${normalizeReference(
      requestedReference
    )}:${requestedAction}`;

    if (requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;

    const requestedTable = tables.find((table) =>
      tableMatches(table, requestedReference)
    );

    if (!requestedTable) {
      setHandoffError(
        `Table ${requestedReference} is not available in the current restaurant floor.`
      );
      return;
    }

    if (isMerged(requestedTable)) {
      setHandoffError(
        `${tableName(requestedTable)} belongs to a merged table group. Open the master table from Mobile Service.`
      );
      return;
    }

    setHandoffError(null);
    setActiveZoneId(requestedTable.zone_id || null);
    selectTable(requestedTable, {
      forceCustomer: requestedAction === "customer",
    });
  }, [
    organizationId,
    requestedAction,
    requestedReference,
    runtime,
    tables,
  ]);

  function resetOrderIdentity() {
    orderRequestKey.current = null;
  }

  function clearCustomerDraft() {
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerDraft(null);
    setCustomerForm({ name: "", phone: "", email: "" });
  }

  function closeCustomerSetup() {
    clearCustomerDraft();
    setModal(null);
  }

  function selectTable(table, { forceCustomer = false } = {}) {
    if (!table || isMerged(table)) {
      setHandoffError("Merged tables must be opened from their master table.");
      return;
    }

    if (activeTableId !== table.id) {
      setCart([]);
      resetOrderIdentity();
      clearCustomerDraft();
    }

    setActiveTableId(table.id);
    setActiveZoneId(table.zone_id || activeZoneId || null);
    setGuestDraft(Math.max(1, Number(table.current_guests || 1)));

    if (forceCustomer || !isOccupied(table)) {
      setModal("CUSTOMER");
      return;
    }

    setModal(null);
  }

  function chooseZone(zoneId) {
    setActiveZoneId(zoneId);
    setActiveTableId(null);
    setCart([]);
    clearCustomerDraft();
    resetOrderIdentity();
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

  async function searchCustomers() {
    if (!customerSearch.trim() || !organizationId) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/customers/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          query: customerSearch,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Customer search failed");
      }

      setCustomerResults(result.customers || []);
    } catch (searchError) {
      setError(searchError?.message || "Customer search failed");
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer() {
    if (!customerForm.name.trim()) {
      setError("Customer name is required");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/customers/upsert", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          customer_name: customerForm.name,
          customer_phone: customerForm.phone,
          customer_email: customerForm.email,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Customer creation failed");
      }

      const customer = result.customer?.customer || result.customer || null;
      if (!customer?.id) {
        throw new Error("Created customer response is incomplete");
      }

      setCustomerDraft({
        id: customer.id,
        name: customer.customer_name,
        phone: customer.customer_phone,
        email: customer.customer_email,
      });
      setModal("GUESTS");
    } catch (createError) {
      setError(createError?.message || "Customer creation failed");
    } finally {
      setBusy(false);
    }
  }

  function walkInCustomer() {
    setCustomerDraft({
      id: null,
      name: settings?.walk_in_label || settings?.walkInLabel || "Walk-in",
      type: "WALK_IN",
    });
    setModal("GUESTS");
  }

  async function confirmGuests() {
    if (!activeTable) return;

    const guestCount = Math.max(1, Number(guestDraft || 1));
    const existingSession = Boolean(activeTable.active_session_id);

    setBusy(true);
    setError(null);

    try {
      if (existingSession && customerDraft) {
        await posAction("CHANGE_CUSTOMER", {
          tableId: activeTable.id,
          sessionId: activeTable.active_session_id,
          customerId: customerDraft.id || null,
          customerName: customerDraft.name || null,
          customerEmail: customerDraft.email || null,
          customerPhone: customerDraft.phone || null,
        });
      }

      if (existingSession || isOccupied(activeTable)) {
        await posAction("MOVE_GUESTS", {
          tableId: activeTable.id,
          guestCount,
        });
      } else {
        setRuntime((current) => {
          if (!current) return current;

          return {
            ...current,
            tables: (current.tables || []).map((table) =>
              table.id === activeTable.id
                ? {
                    ...table,
                    current_guests: guestCount,
                    status: "OCCUPIED",
                  }
                : table
            ),
          };
        });
        setDraftSetupTableId(activeTable.id);
      }

      setGuestDraft(guestCount);
      setModal(null);
    } catch (guestError) {
      setError(guestError?.message || "Unable to update guests");
    } finally {
      setBusy(false);
    }
  }

  function openDish(dish) {
    if (!activeTable) {
      setError("Select a table before adding items");
      return;
    }

    if (!Number(activeTable.current_guests || 0)) {
      setError("Set the guest count before adding items");
      return;
    }

    setError(null);
    setDishDraft(dish);
    setModifierDraft({ seat: "", notes: "" });
    setModal("DISH");
  }

  function addDishToCart() {
    if (!dishDraft) return;

    if (!modifierDraft.seat) {
      setError("Select a seat for this item");
      return;
    }

    const missingRequired = modifierGroups.find(
      (group) => group.required && !modifierDraft[group.key]
    );
    if (missingRequired) {
      setError(`Select ${missingRequired.label}`);
      return;
    }

    const dynamicModifiers = {};
    modifierGroups.forEach((group) => {
      dynamicModifiers[group.key] = modifierDraft[group.key] || null;
    });

    resetOrderIdentity();
    setCart((current) => [
      ...current,
      {
        id: `${dishDraft.id}-${Date.now()}-${crypto.randomUUID()}`,
        dish_id: dishDraft.id,
        name: dishDraft.name || dishDraft.dish_name,
        price: Number(dishDraft.price || 0),
        quantity: 1,
        seatPosition: Number(modifierDraft.seat),
        cookingLevel:
          dynamicModifiers.cooking ||
          dynamicModifiers.cooking_level ||
          dynamicModifiers.cookingLevel ||
          null,
        notes: modifierDraft.notes || null,
        modifiers: {
          seat: modifierDraft.seat,
          notes: modifierDraft.notes || null,
          ...dynamicModifiers,
        },
      },
    ]);

    setDishDraft(null);
    setModifierDraft({});
    setModal(null);
    setError(null);
  }

  function updateQuantity(itemId, delta) {
    resetOrderIdentity();
    setCart((current) =>
      current
        .map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantity: Math.max(0, Number(item.quantity || 1) + delta),
              }
            : item
        )
        .filter((item) => Number(item.quantity || 0) > 0)
    );
  }

  async function sendOrder() {
    if (!activeTable) {
      setError("Select a table before sending the order");
      return;
    }
    if (!cart.length) {
      setError("Add at least one item before sending the order");
      return;
    }
    if (cart.some((item) => !item.seatPosition)) {
      setError("Every order item must have a seat");
      return;
    }

    if (!orderRequestKey.current) {
      orderRequestKey.current = crypto.randomUUID();
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/pos/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": orderRequestKey.current,
        },
        body: JSON.stringify({
          organizationId,
          idempotencyKey: orderRequestKey.current,
          table: activeTable.table_number || activeTable.table_name,
          tableId: activeTable.id,
          items: cart,
          customerId: customerDraft?.id || null,
          customerName: customerDraft?.name || null,
          customerEmail: customerDraft?.email || null,
          customerPhone: customerDraft?.phone || null,
          guestCount: Number(activeTable.current_guests || guestDraft || 1),
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false || result.error) {
        throw new Error(result.error || "Order failed");
      }

      setCart([]);
      resetOrderIdentity();
      clearCustomerDraft();
      setDraftSetupTableId(null);
      setSuccessMessage(
        result.dispatch_pending
          ? "Order saved. Kitchen dispatch is pending."
          : "Order sent to kitchen."
      );
      await loadRuntime();
      setActiveTableId(activeTable.id);
    } catch (sendError) {
      setError(sendError?.message || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  function openPayment() {
    if (!activeTable || !organizationId) return;

    const query = new URLSearchParams({ view: "checkout" });
    query.set("table", String(tableReference(activeTable)));
    router.push(`/workspace/${organizationId}/operations/pos?${query.toString()}`);
  }

  function openMobileService() {
    if (!organizationId) return;
    router.push(`/workspace/${organizationId}/operations/pos?view=mobile-service`);
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-[1180px] px-4 py-12 text-white/45">
        Loading restaurant order entry...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-5 text-white">
      <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
              Restaurant Order Entry
            </div>
            <h1 className="mt-2 text-2xl font-semibold">
              {activeTable ? tableName(activeTable) : "Select a table"}
            </h1>
            <div className="mt-1 text-xs text-white/40">
              {activeTable
                ? `${Number(activeTable.current_guests || 0)} guest(s) · seat-controlled ordering`
                : "Choose a service area and table to begin"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {realtimeLabel(realtimeStatus, refreshing)}
            </div>
            <button
              type="button"
              onClick={openMobileService}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/65"
            >
              Mobile Service
            </button>
            <button
              type="button"
              disabled={!activeTable || !isOccupied(activeTable)}
              onClick={openPayment}
              className="rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-black text-black disabled:opacity-30"
            >
              Checkout
            </button>
            <button
              type="button"
              disabled={!cart.length || busy}
              onClick={() => setModal("CART")}
              className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-xs font-black text-[#E2C48A] disabled:opacity-30"
            >
              Order {cartCount}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {handoffError ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {handoffError}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => chooseZone(zone.id)}
              className={
                activeZoneId === zone.id
                  ? "shrink-0 rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
                  : "shrink-0 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/55"
              }
            >
              {zone.name}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visibleTables.map((table) => {
            const selected = activeTableId === table.id;
            const merged = isMerged(table);
            const occupied = isOccupied(table);

            return (
              <button
                key={table.id}
                type="button"
                disabled={merged}
                onClick={() => selectTable(table)}
                className={
                  selected
                    ? "rounded-2xl border border-white bg-white p-4 text-left text-black"
                    : merged
                      ? "rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-left text-red-200 opacity-60"
                      : occupied
                        ? "rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/10 p-4 text-left text-[#F3D7A2]"
                        : "rounded-2xl border border-white/10 bg-black/20 p-4 text-left text-white/70"
                }
              >
                <div className="font-semibold">{tableName(table)}</div>
                <div className={selected ? "mt-1 text-xs text-black/50" : "mt-1 text-xs text-white/35"}>
                  {merged
                    ? "Merged"
                    : occupied
                      ? `${Number(table.current_guests || 0)} guest(s)`
                      : "Available"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={
                  currentCategory === category
                    ? "shrink-0 rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
                    : "shrink-0 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/55"
                }
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {visibleDishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                disabled={!activeTable || busy}
                onClick={() => openDish(dish)}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#D6A66A]/35 disabled:opacity-30"
              >
                <div className="font-semibold text-white">
                  {dish.name || dish.dish_name}
                </div>
                <div className="mt-2 text-xs text-white/35">
                  Select seat and modifiers
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {modal === "CUSTOMER" && activeTable ? (
        <Modal>
          <div className="text-lg font-semibold">
            Customer · {tableName(activeTable)}
          </div>
          <div className="mt-1 text-xs text-white/40">
            Choose a customer or continue as walk-in.
          </div>

          <input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") searchCustomers();
            }}
            placeholder="Search name, phone or email"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm outline-none"
          />
          <SecondaryButton disabled={busy} onClick={searchCustomers}>
            Search Customer
          </SecondaryButton>

          <div className="mt-3 max-h-[210px] space-y-2 overflow-y-auto">
            {customerResults.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  setCustomerDraft({
                    id: customer.customer_id || customer.id,
                    name: customer.customer_name,
                    phone: customer.customer_phone,
                    email: customer.customer_email,
                  });
                  setModal("GUESTS");
                }}
                className="w-full rounded-xl border border-white/10 px-3 py-3 text-left text-sm"
              >
                <div>{customer.customer_name}</div>
                <div className="mt-1 text-xs text-white/35">
                  {customer.customer_phone || customer.customer_email || ""}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={walkInCustomer}
              className="w-full rounded-xl border border-[#D6A66A]/35 py-3 text-sm font-semibold text-[#E2C48A]"
            >
              Walk-in Customer
            </button>
            <button
              type="button"
              onClick={() => setModal("CREATE_CUSTOMER")}
              className="w-full rounded-xl bg-[#D6A66A] py-3 text-sm font-semibold text-black"
            >
              Create Customer
            </button>
            <button
              type="button"
              onClick={closeCustomerSetup}
              className="w-full rounded-xl border border-white/10 py-3 text-sm text-white/65"
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {modal === "CREATE_CUSTOMER" ? (
        <Modal>
          <div className="text-lg font-semibold">Create Customer</div>
          <div className="mt-4 space-y-2">
            <input
              value={customerForm.name}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Full name"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />
            <input
              value={customerForm.phone}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="Phone"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />
            <input
              value={customerForm.email}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="Email"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={createCustomer}
              className="w-full rounded-xl bg-white py-3 text-sm font-bold text-black disabled:opacity-30"
            >
              Save Customer
            </button>
            <SecondaryButton onClick={() => setModal("CUSTOMER")}>
              Back
            </SecondaryButton>
          </div>
        </Modal>
      ) : null}

      {modal === "GUESTS" && activeTable ? (
        <Modal>
          <div className="text-lg font-semibold">
            Guests · {tableName(activeTable)}
          </div>
          <div className="mt-5 flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setGuestDraft((current) => Math.max(1, current - 1))}
              className="h-12 w-12 rounded-2xl border border-white/10 bg-white/[0.05] text-2xl"
            >
              −
            </button>
            <div className="min-w-[80px] text-center text-4xl font-black">
              {guestDraft}
            </div>
            <button
              type="button"
              onClick={() => setGuestDraft((current) => current + 1)}
              className="h-12 w-12 rounded-2xl border border-white/10 bg-white/[0.05] text-2xl"
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={confirmGuests}
            className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Continue Ordering
          </button>
          <SecondaryButton onClick={closeCustomerSetup}>
            Cancel
          </SecondaryButton>
        </Modal>
      ) : null}

      {modal === "DISH" && dishDraft && activeTable ? (
        <Modal wide>
          <div className="text-lg font-semibold">
            {dishDraft.name || dishDraft.dish_name}
          </div>
          <div className="mt-1 text-xs text-white/40">
            {tableName(activeTable)} · assign every item to a seat
          </div>

          <div className="mt-4">
            <div className="text-xs text-white/50">Seat</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(
                { length: Number(activeTable.current_guests || guestDraft || 0) },
                (_, index) => String(index + 1)
              ).map((seat) => (
                <button
                  key={seat}
                  type="button"
                  onClick={() =>
                    setModifierDraft((current) => ({ ...current, seat }))
                  }
                  className={
                    String(modifierDraft.seat) === seat
                      ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
                      : "rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/65"
                  }
                >
                  S{seat}
                </button>
              ))}
            </div>
          </div>

          {modifierGroups.map((group) => (
            <div key={group.key} className="mt-4">
              <div className="text-xs text-white/50">
                {group.label}{group.required ? " · required" : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setModifierDraft((current) => ({
                        ...current,
                        [group.key]: option.value,
                      }))
                    }
                    className={
                      modifierDraft[group.key] === option.value
                        ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
                        : "rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/65"
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
            onChange={(event) =>
              setModifierDraft((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder={settings?.notes_label || "Preparation notes"}
            className="mt-4 h-24 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
          />

          <button
            type="button"
            onClick={addDishToCart}
            className="mt-4 w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
          >
            Add to Order
          </button>
          <SecondaryButton
            onClick={() => {
              setDishDraft(null);
              setModifierDraft({});
              setModal(null);
            }}
          >
            Cancel
          </SecondaryButton>
        </Modal>
      ) : null}

      {modal === "CART" ? (
        <Modal wide>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Order</div>
              <div className="mt-1 text-xs text-white/40">
                {activeTable ? tableName(activeTable) : "No table"}
              </div>
            </div>
            <div className="text-xs text-white/40">{cartCount} item(s)</div>
          </div>

          <div className="mt-4 max-h-[380px] space-y-2 overflow-y-auto">
            {cart.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.025] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="mt-1 text-xs text-white/35">
                      Seat {item.seatPosition}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      className="h-8 w-8 rounded-lg border border-white/10"
                    >
                      −
                    </button>
                    <div className="min-w-5 text-center text-sm">
                      {item.quantity}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      className="h-8 w-8 rounded-lg border border-white/10"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={busy || !cart.length}
            onClick={sendOrder}
            className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Send to Kitchen
          </button>
          <SecondaryButton onClick={() => setModal(null)}>
            Continue Ordering
          </SecondaryButton>
        </Modal>
      ) : null}

      {successMessage ? (
        <Modal>
          <div className="text-lg font-semibold">{successMessage}</div>
          <div className="mt-2 text-sm text-white/45">
            The order is stored in the POS runtime and linked to the selected table.
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
          >
            Continue
          </button>
        </Modal>
      ) : null}
    </section>
  );
}
