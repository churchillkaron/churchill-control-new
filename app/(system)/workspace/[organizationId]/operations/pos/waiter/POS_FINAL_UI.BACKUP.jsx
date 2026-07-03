"use client";
import { moveGuestsBetweenTables } from "@/lib/restaurant/services/moveGuestsBetweenTables";
"use client";
import { moveGuestsBetweenTables } from "@/lib/restaurant/services/moveGuestsBetweenTables";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";
import { loadWaiterData } from "@/lib/restaurant/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/restaurant/pos/waiter/groupMenuByCategory";
import { assignSeatToBillGroup } from "@/lib/restaurant/pos/tables/assignSeatToBillGroup";

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

function normalizeConfigurationGroups(input) {
  const raw =
    Array.isArray(input)
      ? input
      : (
          input?.configurationGroups ||
          input?.configuration_groups ||
          input?.order_modifiers ||
          input?.orderConfigurations ||
          input?.waiter_modifiers ||
          input?.waiterConfigurations ||
          input?.modifiers ||
          input?.menuConfigurations ||
          []
        );

  if (Array.isArray(raw)) {
    return raw
      .map((group) => ({
        key: group.key || group.id || group.name || group.label,
        label: group.label || group.name || group.key || "Configuration",
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
  const businessContext = useBusinessContext();
  const { runtime: workspaceRuntime } = useWorkspaceRuntime();

  const waiterStaff =
    workspaceRuntime?.access?.staff || null;

  const organizationId = businessContext?.organization?.id;
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
  const [configurationDraft, setConfigurationDraft] = useState({});
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

  const configurationGroups = useMemo(() => {
    const groups = normalizeConfigurationGroups(
      dishDraft?.configurationGroups || []
    );

    console.log(
      "NORMALIZED_CONFIGURATION_GROUPS",
      groups
    );

    return groups;
  }, [dishDraft]);

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
    const response = await fetch("/api/restaurant/tables/action", {
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
    const response = await fetch("/api/restaurant/tables/open", {
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
    const serviceUnit = tables.find((item) => item.id === modalTableId || item.id === activeTableId);

    if (!serviceUnit) return;

    await posAction("MOVE_GUESTS", {
      tableId: serviceUnit.id,
      guestCount: Number(guestDraft || 1),
    });

    setActiveTableId(serviceUnit.id);
    closeModal();

    await loadRuntime();
  }

  async function openDish(dish) {
    if (!activeTable) {
      alert("Select table first");
      return;
    }

    if (!Number(activeTable.current_guests || 0)) {
      alert("Set guest count first");
      return;
    }

    let configurationGroups = [];

    try {
      const response = await fetch(
        `/api/configuration/object-groups/get?object_type=dish&object_id=${encodeURIComponent(dish.id)}`
      );

      const result = await response.json();

      if (result?.success) {
        configurationGroups = result.groups || [];

        console.log(
          "CONFIGURATION_GROUPS",
          configurationGroups
        );
      }
    } catch (error) {
      console.error("DISH_MODIFIERS_FAILED", error);
    }

    setDishDraft({
      ...dish,
      configurationGroups,
    });

    setConfigurationDraft({
      seat: "",
      notes: "",
    });

    setModal("DISH");
  }

  function addDishToCart() {
    if (!configurationDraft.seat) {
      alert("Select seat first");
      return;
    }

    const configurationValues = {};

    configurationGroups.forEach((group) => {
      configurationValues[group.key] =
        configurationDraft[group.key] || null;
    });

    setCart((prev) => [
      ...prev,
      {
        id: `${dishDraft.id}-${Date.now()}`,
        dish_id: dishDraft.id,
        name: dishDraft.name || dishDraft.dish_name,
        price: Number(dishDraft.price || 0),
        quantity: 1,
        seatPosition: Number(configurationDraft.seat),
        notes: configurationDraft.notes || null,

        configurationSelections: configurationGroups
          .map((group) => {
            const option =
              (group.options || []).find(
                (o) =>
                  String(o.value) ===
                  String(configurationDraft[group.key])
              );

            if (!option) return null;

            return {
              configuration_group_id: group.id,
              configuration_group_key: group.key,
              group_name: group.label,

              configuration_option_id: option.id,
              configuration_option_value: option.value,
              option_name: option.label,

              value: option.value,
              price_delta: Number(option.price_delta || 0),
            };
          })
          .filter(Boolean),


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

    const response = await fetch("/api/restaurant/orders/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: activeTable.table_number || activeTable.table_name,
        service_unit: activeTable.table_number || activeTable.table_name,
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


    if (!result?.success) {
      alert(result?.error || "Move guest failed");
      return;
    }

    closeModal();
    await loadRuntime();

  } catch (err) {
    console.error("MOVE_GUEST_ERROR", err);
    alert(err?.message || "Move guest failed");
  }
}
async function confirmMoveGuest() {
  if (!modalTable || !targetTable || !moveSeatValue) return;

  try {
    const result = await moveGuestsBetweenTables({
      organizationId,
      sourceTableId: modalTable.id,
      targetTableId: targetTable.id
    });

    if (!result?.success) {
      alert(result?.error || "Move guest failed");
      return;
    }

    closeModal();
    await loadRuntime();

  } catch (err) {
    console.error("MOVE_GUEST_ERROR", err);
    alert(err?.message || "Move guest failed");
  }
}
