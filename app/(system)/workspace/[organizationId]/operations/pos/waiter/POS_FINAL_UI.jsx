"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";
import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";
import { loadWaiterData } from "@/lib/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/pos/waiter/groupMenuByCategory";
import { assignSeatToBillGroup } from "@/lib/pos/assignSeatToBillGroup";

function tableId(table) {
  return table?.id || null;
}

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "--";
}



function seatOf(item) {
  return item?.seat_position || item?.seat_number || item?.modifiers?.seat || null;
}

function itemTotal(item) {
  return Number(item?.price || 0) * Number(item?.quantity || 1);
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
    return Object.entries(raw).map(([key, options]) => ({
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
    }));
  }

  return [];
}

function Modal({ children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div
        className={
          wide
            ? "max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#070707]/95 p-5 text-white shadow-2xl backdrop-blur-xl"
            : "max-h-[88vh] w-full max-w-[360px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#070707]/95 p-5 text-white shadow-2xl backdrop-blur-xl"
        }
      >
        {children}
      </div>
    </div>
  );
}

function SmallTitle({ children }) {
  return (
    <div className="text-xs font-medium text-white/55">
      {children}
    </div>
  );
}

export default function POSFinalUI() {
  const tenant = useTenant();
  const { runtime: workspaceRuntime } = useWorkspaceRuntime();

  const waiterStaff =
    workspaceRuntime?.access?.staff || null;

  const organizationId =
    tenant?.activeOrganization ||
    tenant?.active_organization_id ||
    tenant?.organizationId ||
    tenant?.organization_id ||
    null;

  const holdTimer = useRef(null);
  const longPressFired = useRef(false);

  const [runtime, setRuntime] = useState(null);
  const [staff, setStaff] = useState(null);

  const [activeZoneId, setActiveZoneId] = useState(null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  const [modal, setModal] = useState(null);
  const [modalTableId, setModalTableId] = useState(null);
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

  const [dishDraft, setDishDraft] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({});
  const [cart, setCart] = useState([]);

  const [openTableId, setOpenTableId] = useState(null);
  const [openOrders, setOpenOrders] = useState([]);

  const [selectedSeat, setSelectedSeat] = useState(null);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [targetGroupIndex, setTargetGroupIndex] = useState(0);
  const [draftGroups, setDraftGroups] = useState([]);

  const [moveSeatValue, setMoveSeatValue] = useState(null);
  const [moveSeatOrders, setMoveSeatOrders] = useState([]);
  const [targetTableId, setTargetTableId] = useState(null);
  const [mergeTargetIds, setMergeTargetIds] = useState([]);

  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];
  const dishes = runtime?.dishes || [];
  const settings = runtime?.posSettings || {};

  const activeTable = tables.find((table) => table.id === activeTableId) || null;
  const modalTable = tables.find((table) => table.id === modalTableId) || null;
  const openTable = tables.find((table) => table.id === openTableId) || null;
  const targetTable = tables.find((table) => table.id === targetTableId) || null;

  const menuGroups = useMemo(() => groupMenuByCategory(dishes || []), [dishes]);
  const categories = Object.keys(menuGroups || {});
  const currentCategory = activeCategory || categories[0] || null;
  const visibleDishes = currentCategory ? menuGroups[currentCategory] || [] : [];

  const modifierGroups = useMemo(
    () => normalizeModifierGroups(settings),
    [settings]
  );

  const visibleTables = useMemo(() => {
    if (!activeZoneId) return tables;
    return tables.filter((table) => table.zone_id === activeZoneId);
  }, [tables, activeZoneId]);

  const openItems = useMemo(
    () =>
      openOrders.flatMap((order) =>
        (order.order_items || []).map((item) => ({
          ...item,
          _order_id: order.id,
        }))
      ),
    [openOrders]
  );

  const openSeats = useMemo(() => {
    const guestCount = Number(
      openTable?.current_guests || 0
    );

    return Array.from(
      { length: guestCount },
      (_, index) => String(index + 1)
    );
  }, [openTable]);

  const billGroups = useMemo(() => {
    const grouped = {};

    openItems.forEach((item) => {
      const key = item.bill_group || settings?.default_bill_group || "Group 1";

      if (!grouped[key]) {
        grouped[key] = {
          group_name: key,
          order_items: [],
        };
      }

      grouped[key].order_items.push(item);
    });

    const result = Object.values(grouped);

    draftGroups.forEach((groupName) => {
      if (!result.some((group) => group.group_name === groupName)) {
        result.push({
          group_name: groupName,
          order_items: [],
          draft: true,
        });
      }
    });

    return result;
  }, [openItems, draftGroups, settings]);

  const moveSeatOptions = useMemo(() => {
    const items = moveSeatOrders.flatMap((order) => order.order_items || []);
    const fromItems = [
      ...new Set(items.map((item) => seatOf(item)).filter(Boolean).map(String)),
    ];

    if (fromItems.length) return fromItems;

    const guestCount = Number(modalTable?.current_guests || 0);
    return Array.from({ length: guestCount }, (_, index) => String(index + 1));
  }, [moveSeatOrders, modalTable]);

  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);

  async function loadRuntime() {
    if (!organizationId) return;

    const loaded = await loadWaiterData(organizationId);
    setRuntime(loaded);

    if (!activeZoneId && loaded?.zones?.[0]?.id) {
      setActiveZoneId(loaded.zones[0].id);
    }

    const grouped = groupMenuByCategory(loaded?.dishes || []);
    const firstCategory = Object.keys(grouped || {})[0];

    if (!activeCategory && firstCategory) {
      setActiveCategory(firstCategory);
    }
  }

  async function loadStaffRuntime() {
    const email =
      typeof window !== "undefined"
        ? localStorage.getItem("staff_email") ||
          localStorage.getItem("userEmail")
        : null;

    console.log("WAITER_EMAIL_CHECK", {
      staff_email:
        typeof window !== "undefined"
          ? localStorage.getItem("staff_email")
          : null,
      userEmail:
        typeof window !== "undefined"
          ? localStorage.getItem("userEmail")
          : null,
    });

    if (!email) return;

    const response = await fetch(
      `/api/staff/runtime?email=${encodeURIComponent(email)}`
    );

    const result = await response.json();

    if (result?.success) {
      console.log("WAITER_STAFF", result.staff);
      setStaff(result.staff);
    }
  }

  async function posAction(action, payload = {}) {
    const response = await fetch("/api/pos/tables/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        payload: {
          ...payload,
          organizationId,
          organization_id: organizationId,
          organizationId,
          organization_id: organizationId,
        },
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "POS action failed");
    }

    return result;
  }

  async function openTableOrders(table) {
    const response = await fetch("/api/pos/tables/open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tableId: tableId(table),
        organization_id: organizationId,
        organization_id: organizationId,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to open table");
    }

    return result;
  }

  useEffect(() => {
    loadRuntime();
    loadStaffRuntime();
  }, [organizationId]);

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function startHold(table) {
    clearHold();
    longPressFired.current = false;

    holdTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setModalTableId(table.id);
      setModal("TABLE_ACTIONS");
    }, 550);
  }

  function closeModal() {
    setModal(null);
    setModalTableId(null);
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerDraft(null);
    setCustomerForm({ name: "", phone: "", email: "" });
    setMoveSeatValue(null);
    setMoveSeatOrders([]);
    setTargetTableId(null);
    setMergeTargetIds([]);
  }

  function chooseZone(zoneId) {
    setActiveZoneId(zoneId);
    setActiveTableId(null);
    setCart([]);
  }

  async function chooseTable(table) {
    if (table.status === "MERGED") {
      alert("This table is merged into another table");
      return;
    }

    setActiveTableId(table.id);

    if (!Number(table.current_guests || 0)) {
      setModalTableId(table.id);
      setModal("CUSTOMER");
      return;
    }

    setModal(null);
  }

  async function searchCustomers() {
    if (!customerSearch.trim()) return;

    const response = await fetch("/api/customers/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        organizationId,
        query: customerSearch,
      }),
    });

    const result = await response.json();

    if (result.success) {
      setCustomerResults(result.customers || []);
    }
  }

  async function createCustomer() {
    const response = await fetch("/api/customers/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        customer_name: customerForm.name,
        customer_phone: customerForm.phone,
        customer_email: customerForm.email,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.error || "Customer failed");
      return;
    }

    const customer = result.customer;

    setCustomerDraft({
      id: customer.id,
      name: customer.customer_name,
      phone: customer.customer_phone,
      email: customer.customer_email,
    });

    setModal("GUESTS");
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
    const table = tables.find((item) => item.id === modalTableId || item.id === activeTableId);

    if (!table) return;

    await posAction("MOVE_GUESTS", {
      tableId: table.id,
      guestCount: Number(guestDraft || 1),
    });

    setActiveTableId(table.id);
    closeModal();

    await loadRuntime();
  }

  function openDish(dish) {
    if (!activeTable) {
      alert("Select table first");
      return;
    }

    if (!Number(activeTable.current_guests || 0)) {
      alert("Set guest count first");
      return;
    }

    setDishDraft(dish);
    setModifierDraft({
      seat: "",
      notes: "",
    });
    setModal("DISH");
  }

  function addDishToCart() {
    if (!modifierDraft.seat) {
      alert("Select seat first");
      return;
    }

    const dynamicModifiers = {};

    modifierGroups.forEach((group) => {
      dynamicModifiers[group.key] = modifierDraft[group.key] || null;
    });

    setCart((prev) => [
      ...prev,
      {
        id: `${dishDraft.id}-${Date.now()}`,
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
          notes: modifierDraft.notes,
          ...dynamicModifiers,
        },
      },
    ]);

    setDishDraft(null);
    setModal(null);
  }

  async function sendOrder() {
    if (!activeTable) return;

    if (!cart.length) {
      alert("No items");
      return;
    }

    if (cart.some((item) => !item.seatPosition)) {
      alert("Every item must have a seat");
      return;
    }

    const response = await fetch("/api/pos/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: activeTable.table_number || activeTable.table_name,
        table_id: activeTable.id,
        items: cart,
        total: cartTotal,
        staff_name:
          waiterStaff?.name || "Waiter",
        staff_id:
          waiterStaff?.id || null,
        organization_id: organizationId,
        organization_id: organizationId,
        customerId: customerDraft?.id || null,
        customerName: customerDraft?.name || null,
        customerEmail: customerDraft?.email || null,
        customerPhone: customerDraft?.phone || null,
        guestCount: Number(activeTable.current_guests || 0),
      }),
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      alert(result.error || "Order failed");
      return;
    }

    setCart([]);
    setModal(null);
    setSuccessMessage("Order sent to kitchen");

    await loadRuntime();
  }

  async function showOpenTable(table) {
    const result = await openTableOrders(table);

    setOpenTableId(table.id);
    setOpenOrders(result.orders || []);
    setSelectedSeat(null);
    setSelectedGroupIndex(0);
    setTargetGroupIndex(0);
    setDraftGroups([]);
    setModal("OPEN_TABLE");
    setModalTableId(table.id);
  }

  async function moveSeatToGroup() {
    if (!selectedSeat) return;

    const destination = billGroups[targetGroupIndex];

    if (!destination) return;

    const itemIds = openItems
      .filter((item) => String(seatOf(item)) === String(selectedSeat))
      .map((item) => item.id);

    if (!itemIds.length) {
      alert("No items for this seat");
      return;
    }

    const result = await assignSeatToBillGroup({
      itemIds,
      billGroup: destination.group_name,
    });

    if (!result.success) {
      alert(result.error || "Bill group failed");
      return;
    }

    if (openTable) {
      await showOpenTable(openTable);
    }
  }

  async function openMoveGuest(table) {
    const result = await openTableOrders(table);

    setMoveSeatOrders(result.orders || []);
    setMoveSeatValue(null);
    setTargetTableId(null);
    setModalTableId(table.id);
    setModal("MOVE_GUEST");
  }

  async function confirmMoveGuest() {
    if (!modalTable || !targetTable || !moveSeatValue) return;

    const response = await fetch("/api/pos/tables/move-seat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        organizationId,
        fromTableId: modalTable.id,
        toTableId: targetTable.id,
        seatPosition: moveSeatValue,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.error || "Move guest failed");
      return;
    }

    closeModal();
    await loadRuntime();
  }

  async function confirmTransferTable() {
    if (!modalTable || !targetTableId) return;

    await posAction("TRANSFER_TABLE", {
      fromTableId: modalTable.id,
      toTableId: targetTableId,
    });

    closeModal();
    await loadRuntime();
  }

  async function confirmMergeTables() {
    if (!modalTable || !mergeTargetIds.length) return;

    for (const targetId of mergeTargetIds) {
      await posAction("MERGE_TABLES", {
        masterTableId: modalTable.id,
        targetTableId: targetId,
      });
    }

    closeModal();
    await loadRuntime();
  }

  if (!runtime) {
    return (
      <main className="min-h-screen bg-black p-4 text-white">
        <div className="mx-auto flex min-h-[80vh] w-full max-w-[430px] items-center justify-center rounded-[32px] border border-white/10 bg-[#060606] text-xs text-white/40">
          Loading waiter...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[430px] overflow-hidden rounded-[32px] border border-white/10 bg-[#060606] shadow-2xl">
        <div className="flex min-h-0 w-full flex-col">
          <header className="border-b border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {zones.find((zone) => zone.id === activeZoneId)?.name || "Waiter"}
                  {activeTable ? ` • ${tableName(activeTable)}` : ""}
                </div>

                <div className="mt-1 text-[10px] text-white/35">
                  {activeTable
                    ? `${Number(activeTable.current_guests || 0)} guests`
                    : "Select table"}
                </div>
              </div>

              <button
                onClick={() => setModal("ORDER")}
                className="rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-2 text-xs font-black text-[#E2C48A]"
              >
                ORDER {cart.length}
              </button>
            </div>
          </header>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-2 overflow-x-auto">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => chooseZone(zone.id)}
                  className={
                    activeZoneId === zone.id
                      ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-xs font-bold text-black"
                      : "shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60"
                  }
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-2 overflow-x-auto">
              {visibleTables.map((table) => (
                <button
                  key={table.id}
                  onMouseDown={() => startHold(table)}
                  onMouseUp={clearHold}
                  onMouseLeave={clearHold}
                  onTouchStart={() => startHold(table)}
                  onTouchEnd={() => {
                    clearHold();
                    if (!longPressFired.current) chooseTable(table);
                  }}
                  onClick={() => {
                    if (!longPressFired.current) chooseTable(table);
                  }}
                  className={
                    activeTable?.id === table.id
                      ? "shrink-0 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black"
                      : table.status === "MERGED"
                      ? "shrink-0 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-black text-red-300 opacity-70"
                      : Number(table.current_guests || 0) > 0 ||
                        table.status === "OCCUPIED"
                      ? "shrink-0 rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 px-5 py-4 text-sm font-black text-[#F3D7A2]"
                      : "shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black text-white/70"
                  }
                >
                  <div>{tableName(table)}</div>
                  {table.status !== "MERGED" &&
                    Number(table.current_guests || 0) > 0 && (
                      <div className="mt-1 text-xs text-white/45">
                        {table.current_guests} Guests
                      </div>
                    )}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={
                    currentCategory === category
                      ? "shrink-0 rounded-xl bg-[#D6A66A] px-3 py-2 text-xs font-bold text-black"
                      : "shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60"
                  }
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibleDishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => openDish(dish)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.07]"
                >
                  <div className="line-clamp-2 text-sm font-semibold text-white">
                    {dish.name || dish.dish_name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {modal === "TABLE_ACTIONS" && modalTable && (
        <Modal>
          <div className="mb-4 text-lg font-semibold">
            {tableName(modalTable)}
          </div>

          <button
            onClick={() => showOpenTable(modalTable)}
            className="mb-2 w-full rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-4 text-left text-sm font-black text-[#E2C48A]"
          >
            Open Table
          </button>

          <button
            onClick={() => {
              setModal("MERGE_TABLE");
              setMergeTargetIds([]);
            }}
            className="mb-2 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold"
          >
            Merge Table
          </button>

          <button
            onClick={() => {
              setModal("TRANSFER_TABLE");
              setTargetTableId(null);
            }}
            className="mb-2 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold"
          >
            Move Table
          </button>

          <button
            onClick={() => openMoveGuest(modalTable)}
            className="mb-2 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold"
          >
            Move Guest
          </button>

          <button
            onClick={() => {
              setCustomerSearch("");
              setCustomerResults([]);
              setCustomerDraft(null);
              setModal("CUSTOMER");
            }}
            className="mb-2 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold"
          >
            Change Customer
          </button>

          <button
            onClick={closeModal}
            className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </Modal>
      )}

      {modal === "CUSTOMER" && (
        <Modal>
          <div className="text-lg font-semibold">Customer</div>

          

          
          <div className="mt-4">
            <input
              value={customerSearch}
              onChange={(event) => {
                const value = event.target.value;
                setCustomerSearch(value);

                if (value.trim().length >= 2) {
                  setTimeout(() => {
                    searchCustomers();
                  }, 150);
                }
              }}
              placeholder="Search customer name, phone, email"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm outline-none"
            />

            <div className="mt-3 space-y-2">
              {customerResults.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setCustomerDraft({
                      id: customer.id,
                      name: customer.customer_name,
                      phone: customer.customer_phone,
                      email: customer.customer_email,
                    });
                    setModal("GUESTS");
                  }}
                  className="w-full rounded-xl border border-white/10 px-3 py-3 text-left text-sm"
                >
                  <div>{customer.customer_name}</div>
                  <div className="text-xs text-white/40">
                    {customer.customer_phone || ""}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={walkInCustomer}
              className="mt-4 w-full rounded-xl border border-[#D6A66A]/30 py-3 text-sm font-semibold text-[#D6A66A]"
            >
              Walk-in Customer
            </button>

            <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
              <button
                onClick={() => setModal("CREATE_CUSTOMER")}
                className="w-full rounded-xl bg-[#D6A66A] py-3 text-sm font-semibold text-black"
              >
                Create New Customer
              </button>

              <button
                onClick={closeModal}
                className="w-full rounded-xl border border-white/10 py-3 text-sm text-white/70"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "CREATE_CUSTOMER" && (
        <Modal>
          <div className="text-lg font-semibold">
            Create Customer
          </div>

          <div className="mt-4 space-y-2">

            <input
              value={customerForm.name}
              onChange={(event) =>
                setCustomerForm({
                  ...customerForm,
                  name: event.target.value,
                })
              }
              placeholder="Full Name"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />

            <input
              value={customerForm.phone}
              onChange={(event) =>
                setCustomerForm({
                  ...customerForm,
                  phone: event.target.value,
                })
              }
              placeholder="Phone"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />

            <input
              value={customerForm.email}
              onChange={(event) =>
                setCustomerForm({
                  ...customerForm,
                  email: event.target.value,
                })
              }
              placeholder="Email"
              className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
            />

            <button
              onClick={createCustomer}
              className="w-full rounded-xl bg-white py-3 text-sm font-bold text-black"
            >
              Save Customer
            </button>

            <button
              onClick={() => setModal("CUSTOMER")}
              className="w-full rounded-xl border border-white/10 py-3 text-sm"
            >
              Back
            </button>

            <button
              onClick={closeModal}
              className="w-full rounded-xl border border-white/10 py-3 text-sm text-white/70"
            >
              Cancel
            </button>

          </div>
        </Modal>
      )}


      {modal === "GUESTS" && (
        <Modal>
          <div className="text-lg font-semibold">Guests</div>

          <div className="mt-5 flex items-center justify-center gap-4">
            <button
              onClick={() => setGuestDraft(Math.max(1, guestDraft - 1))}
              className="h-12 w-12 rounded-2xl bg-white/[0.06] text-2xl font-black"
            >
              -
            </button>

            <div className="min-w-[80px] text-center text-4xl font-black">
              {guestDraft}
            </div>

            <button
              onClick={() => setGuestDraft(guestDraft + 1)}
              className="h-12 w-12 rounded-2xl bg-white/[0.06] text-2xl font-black"
            >
              +
            </button>
          </div>

          <button
            onClick={confirmGuests}
            className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
          >
            Start Order
          </button>

          <button
            onClick={closeModal}
            className="mt-2 w-full rounded-2xl border border-white/10 py-4 text-sm font-semibold text-white/70"
          >
            Cancel
          </button>
        </Modal>
      )}

      {modal === "DISH" && dishDraft && activeTable && (
        <Modal wide>
          <div className="text-lg font-semibold">
            {dishDraft.name || dishDraft.dish_name}
          </div>

          <div className="mt-4">
            <SmallTitle>Seat</SmallTitle>

            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from(
                { length: Number(activeTable.current_guests || 0) },
                (_, index) => String(index + 1)
              ).map((seat) => (
                <button
                  key={seat}
                  onClick={() =>
                    setModifierDraft({ ...modifierDraft, seat })
                  }
                  className={
                    String(modifierDraft.seat) === String(seat)
                      ? "rounded-lg bg-[#D6A66A] px-3 py-2 text-xs font-semibold text-black"
                      : "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65"
                  }
                >
                  S{seat}
                </button>
              ))}
            </div>
          </div>

          {modifierGroups.map((group) => (
            <div key={group.key} className="mt-4">
              <SmallTitle>{group.label}</SmallTitle>

              <div className="mt-2 flex flex-wrap gap-1">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      setModifierDraft({
                        ...modifierDraft,
                        [group.key]: option.value,
                      })
                    }
                    className={
                      modifierDraft[group.key] === option.value
                        ? "rounded-lg bg-[#D6A66A] px-3 py-2 text-xs font-semibold text-black"
                        : "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65"
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
              setModifierDraft({ ...modifierDraft, notes: event.target.value })
            }
            placeholder={settings?.notes_label || "Notes"}
            className="mt-4 h-20 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
          />

          <button
            onClick={addDishToCart}
            className="mt-4 w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
          >
            Add to Order
          </button>

          <button
            onClick={() => {
              setDishDraft(null);
              setModal(null);
            }}
            className="mt-2 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </Modal>
      )}

      {modal === "ORDER" && (
        <Modal wide>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Order</div>
            <div className="text-xs text-white/40">
              {cart.length} Items
            </div>
          </div>

          <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto">
            {!cart.length && (
              <div className="rounded-2xl border border-white/10 p-6 text-center text-xs text-white/40">
                No items yet
              </div>
            )}

            {cart.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-[42px_1fr_54px] gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="rounded-md border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-2 py-1 text-center text-[10px] font-black text-[#E2C48A]">
                  S{item.seatPosition}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {item.name}
                  </div>
                  <div className="truncate text-[10px] text-white/35">
                    {item.notes || ""}
                  </div>
                </div>

                <button
                  onClick={() =>
                    setCart((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="text-xs text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={sendOrder}
            className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
          >
            Send Order
          </button>

          <button
            onClick={() => setModal(null)}
            className="mt-2 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Close
          </button>
        </Modal>
      )}

      {modal === "OPEN_TABLE" && openTable && (
        <Modal wide>
          <div className="flex items-start justify-between">
            <div>
              <SmallTitle>Order Management</SmallTitle>
              <div className="mt-2 text-xl font-semibold">
                {tableName(openTable)}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={async () => {
                    await posAction("MOVE_GUESTS", {
                      tableId: openTable.id,
                      guestCount: Math.max(
                        1,
                        Number(openTable.current_guests || 1) - 1
                      ),
                    });

                    await loadRuntime();
                    await showOpenTable(openTable);
                  }}
                  className="h-7 w-7 rounded-lg border border-white/10 bg-white/[0.04] text-xs"
                >
                  -
                </button>

                <div className="text-xs text-white/45">
                  {openTable.current_guests || 0} Guests
                </div>

                <button
                  onClick={async () => {
                    await posAction("MOVE_GUESTS", {
                      tableId: openTable.id,
                      guestCount:
                        Number(openTable.current_guests || 0) + 1,
                    });

                    await loadRuntime();
                    await showOpenTable(openTable);
                  }}
                  className="h-7 w-7 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/10 text-xs text-[#E2C48A]"
                >
                  +
                </button>
              </div>
            </div>          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <SmallTitle>Seats</SmallTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {openSeats.map((seat) => (
                <button
                  key={seat}
                  onClick={() => setSelectedSeat(seat)}
                  className={
                    String(selectedSeat) === String(seat)
                      ? "rounded-lg border border-[#D6A66A] bg-[#D6A66A]/15 px-2.5 py-1.5 text-[11px] font-semibold text-[#E2C48A]"
                      : "rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/80"
                  }
                >
                  S{seat}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <SmallTitle>Groups</SmallTitle>
              <button
                onClick={() => {
                  const label =
                    settings?.next_group_label ||
                    `Group ${String.fromCharCode(65 + billGroups.length)}`;

                  setDraftGroups((prev) => [...prev, label]);
                }}
                className="rounded-lg border border-[#D6A66A]/25 px-2 py-1 text-[10px] font-semibold text-[#E2C48A]"
              >
                + Group
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {billGroups.map((group, index) => {
                const seats = [
                  ...new Set(
                    (group.order_items || [])
                      .map((item) => seatOf(item))
                      .filter(Boolean)
                  ),
                ];

                return (
                  <button
                    key={`${group.group_name}-${index}`}
                    onClick={() => {
                      setSelectedGroupIndex(index);
                      setTargetGroupIndex(index);
                    }}
                    className={
                      selectedGroupIndex === index
                        ? "rounded-lg border border-[#D6A66A]/60 bg-[#D6A66A]/15 px-2.5 py-1.5 text-[11px] font-semibold text-[#E2C48A]"
                        : "rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/70"
                    }
                  >
                    {group.group_name}
                    {!!seats.length && (
                      <span className="ml-1 text-white/40">
                        {seats.map((seat) => `S${seat}`).join(",")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/5 p-3">
              <div className="text-xs font-medium text-white/55">
                Assignment
              </div>

              <div className="mt-2 text-xs text-white/70">
                Seat:
                <span className="ml-1 font-semibold text-[#E2C48A]">
                  {selectedSeat ? `S${selectedSeat}` : "-"}
                </span>
              </div>

              <div className="mt-1 text-xs text-white/70">
                Group:
                <span className="ml-1 font-semibold text-[#E2C48A]">
                  {billGroups[targetGroupIndex]?.group_name || "-"}
                </span>
              </div>

              <button
                onClick={moveSeatToGroup}
                disabled={!selectedSeat}
                className="mt-3 w-full rounded-lg bg-[#D6A66A] py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                Move Seat To Group
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <SmallTitle>Orders</SmallTitle>

            <div className="mt-2 space-y-3">
              {billGroups.map((group) => {
                const bySeat = {};

                (group.order_items || []).forEach((item) => {
                  const seat = seatOf(item) || "Unassigned";
                  if (!bySeat[seat]) bySeat[seat] = [];
                  bySeat[seat].push(item);
                });

                return (
                  <div
                    key={group.group_name}
                    className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
                  >
                    <div className="mb-2 text-xs font-semibold text-[#E2C48A]">
                      {group.group_name}
                    </div>

                    {Object.entries(bySeat).map(([seat, items]) => (
                      <div key={seat} className="mt-2">
                        <div className="mb-1 text-xs font-medium text-white/55">
                          {seat === "Unassigned" ? "Unassigned" : `Seat ${seat}`}
                        </div>

                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[1fr_52px] border-b border-white/10 py-1 text-xs last:border-b-0"
                          >
                            <div className="truncate">
                              {item.item_name || item.name || "Item"}
                              {(item.notes || item.cooking_level) && (
                                <span className="ml-1 text-white/35">
                                  {item.cooking_level || item.notes}
                                </span>
                              )}
                            </div>
                            <div className="text-right text-white/25">
                              •
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => {
              setActiveTableId(openTable.id);
              setModal(null);
            }}
            className="mt-4 w-full rounded-xl bg-[#D6A66A] py-3 text-xs font-semibold text-black"
          >
            Continue Ordering
          </button>

          <button
            onClick={closeModal}
            className="mt-2 w-full rounded-xl border border-white/10 py-3 text-xs font-semibold text-white/70"
          >
            Close
          </button>
        </Modal>
      )}

      {modal === "MOVE_GUEST" && modalTable && (
        <Modal>
          <div className="text-lg font-semibold text-white">Move Guest</div>
          <div className="mt-2 text-sm text-white/50">
            From: {tableName(modalTable)}
          </div>

          <div className="mt-4">
            <SmallTitle>Select Seat</SmallTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              {moveSeatOptions.map((seat) => (
                <button
                  key={seat}
                  onClick={() => setMoveSeatValue(seat)}
                  className={
                    String(moveSeatValue) === String(seat)
                      ? "rounded-xl border border-[#D6A66A] bg-[#D6A66A]/15 px-4 py-3 text-[#E2C48A]"
                      : "rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white"
                  }
                >
                  S{seat}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <SmallTitle>Destination</SmallTitle>

            <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto">
              {tables
                .filter((table) => table.id !== modalTable.id)
                .filter((table) => table.status !== "MERGED")
                .map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setTargetTableId(table.id)}
                    className={
                      targetTableId === table.id
                        ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                        : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                    }
                  >
                    <div className="font-semibold">{tableName(table)}</div>
                    <div className="mt-1 text-xs text-white/40">
                      {Number(table.current_guests || 0)} guests
                    </div>
                  </button>
                ))}
            </div>
          </div>

          <button
            disabled={!targetTableId || !moveSeatValue}
            onClick={confirmMoveGuest}
            className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Move Guest
          </button>

          <button
            onClick={closeModal}
            className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </Modal>
      )}

      {modal === "TRANSFER_TABLE" && modalTable && (
        <Modal>
          <div className="text-lg font-semibold">Move Table</div>
          <div className="mt-2 text-sm text-white/50">
            From: {tableName(modalTable)}
          </div>

          <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto">
            {tables
              .filter((table) => table.id !== modalTable.id)
              .filter((table) => table.status !== "MERGED")
              .map((table) => (
                <button
                  key={table.id}
                  onClick={() => setTargetTableId(table.id)}
                  className={
                    targetTableId === table.id
                      ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                      : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                  }
                >
                  {tableName(table)}
                </button>
              ))}
          </div>

          <button
            onClick={confirmTransferTable}
            disabled={!targetTableId}
            className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Move Table
          </button>

          <button
            onClick={closeModal}
            className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </Modal>
      )}

      {successMessage && (
        <Modal>
          <div className="text-lg font-semibold text-white">
            {successMessage}
          </div>

          <div className="mt-2 text-sm text-white/45">
            Kitchen has received the order.
          </div>

          <button
            onClick={() => setSuccessMessage(null)}
            className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
          >
            OK
          </button>
        </Modal>
      )}

      {modal === "MERGE_TABLE" && modalTable && (
        <Modal>
          <div className="text-lg font-semibold">Merge Table</div>
          <div className="mt-2 text-sm text-white/50">
            Source: {tableName(modalTable)}
          </div>

          <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto">
            {tables
              .filter((table) => table.id !== modalTable.id)
              .filter((table) => table.status !== "MERGED")
              .map((table) => {
                const selected = mergeTargetIds.includes(table.id);

                return (
                  <button
                    key={table.id}
                    onClick={() =>
                      setMergeTargetIds((prev) =>
                        selected
                          ? prev.filter((id) => id !== table.id)
                          : [...prev, table.id]
                      )
                    }
                    className={
                      selected
                        ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                        : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                    }
                  >
                    {tableName(table)}
                  </button>
                );
              })}
          </div>

          <button
            onClick={confirmMergeTables}
            disabled={!mergeTargetIds.length}
            className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
          >
            Confirm Merge
          </button>

          <button
            onClick={closeModal}
            className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </Modal>
      )}
    </main>
  );
}
