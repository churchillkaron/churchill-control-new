
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTenant } from "@/app/providers/TenantProvider";
import { loadWaiterData } from "@/lib/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/pos/waiter/groupMenuByCategory";

const spicyOptions = ["No spicy", "Mild", "Medium", "Thai spicy"];
const cookingOptions = ["Rare", "Medium rare", "Medium", "Medium well", "Well done"];
const sideOptions = ["Fries", "Rice", "Salad", "Mash"];
const sauceOptions = ["Pepper", "Mushroom", "Garlic", "No sauce"];

function OptionRow({ title, options, value, onChange }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>

      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={
              value === option
                ? "rounded-lg bg-[#D6A66A] px-2 py-1 text-[11px] font-semibold text-black"
                : "rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-white/65"
            }
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function POSFinalUI() {
  const tenant = useTenant();

  const tenantId = tenant?.id;
  const organizationId =
    tenant?.activeOrganization ||
    tenant?.active_organization_id ||
    tenant?.organizationId ||
    tenant?.organization_id;

  console.log("TENANT_RUNTIME", tenant);

const posConfig = tenant?.settings?.pos || {};



  const holdTimer = useRef(null);
  const longPressFired = useRef(false);

  const [data, setData] = useState(null);
  const [staff, setStaff] = useState(null);

  const [activeZone, setActiveZone] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  const [customer, setCustomer] = useState(null);
  const [guestCount, setGuestCount] = useState(0);
  const [cart, setCart] = useState([]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerMode, setCustomerMode] = useState(null);
  const [customerChangeMode, setCustomerChangeMode] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
  });

  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestDraft, setGuestDraft] = useState(1);
  const [guestMode, setGuestMode] = useState("OPEN_TABLE");

  const [dishModal, setDishModal] = useState(null);
  const [modifierDraft, setModifierDraft] = useState({
    seat: "",
    spicy: "",
    cooking: "",
    side: "",
    sauce: "",
    notes: "",
  });

  const [orderOpen, setOrderOpen] = useState(false);
  const [tableActions, setTableActions] = useState(null);
  const [tableView, setTableView] = useState(null);

  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTargets, setMergeTargets] = useState([]);
  const [mergeConfirm, setMergeConfirm] = useState(false);

  const [transferSource, setTransferSource] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferConfirm, setTransferConfirm] = useState(false);

  const [moveGuestSource, setMoveGuestSource] = useState(null);
  const [moveGuestTarget, setMoveGuestTarget] = useState(null);
  const [moveGuestCount, setMoveGuestCount] = useState(1);

  const [tableOrders, setTableOrders] = useState([]);
const [selectedGroup, setSelectedGroup] = useState(0);
const [selectedItems, setSelectedItems] = useState([]);
const [targetGroup, setTargetGroup] = useState(0);
const [billGroups, setBillGroups] = useState([]);
const [paymentGroup, setPaymentGroup] = useState(null);
const [paymentMethod, setPaymentMethod] = useState(null);
const [posSettings, setPosSettings] = useState(null);

console.log("POS_CONFIG", posConfig);
console.log("POS_SETTINGS", posSettings);

  const [tableTotal, setTableTotal] = useState(0);

  function tableId(table) {
    return table?.id || table?.table?.id || null;
  }

  function tableName(table) {
    return table?.table_name || table?.name || "--";
  }

  function closeAllActionState() {
    setTableActions(null);
    setMergeSource(null);
    setMergeTargets([]);
    setMergeConfirm(false);
  }

  function clearTableHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function startTableHold(table) {
    clearTableHold();
    longPressFired.current = false;

    holdTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setActiveTable(table);
      setOrderOpen(false);
      setTableActions(table);
      setMergeSource(null);
      setMergeTargets([]);
      setMergeConfirm(false);
    }, 600);
  }

  async function refreshPOS() {
    if (!tenantId) return;

    const loaded = await loadWaiterData(tenantId);
    setData(loaded);
    setPosSettings(
      loaded?.posSettings || null
    );

    if (loaded?.zones?.length && !activeZone) {
      setActiveZone(loaded.zones[0].id);
    }

    const grouped = groupMenuByCategory(loaded?.dishes || []);
    const firstCategory = Object.keys(grouped)[0] || null;

    if (!activeCategory && firstCategory) {
      setActiveCategory(firstCategory);
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
          tenantId,
          tenant_id: tenantId,
          organizationId,
          organization_id: organizationId,
          staffId: staff?.id || null,
        },
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "POS action failed");
    }

    await refreshPOS();
    return result;
  }

  async function loadStaffRuntime() {
    const email =
      tenant?.user?.email ||
      tenant?.email ||
      tenant?.userEmail ||
      tenant?.staff?.email ||
      null;

    if (!email) return;

    const response = await fetch(
      `/api/staff/runtime?email=${encodeURIComponent(email)}`
    );

    const runtime = await response.json();

    if (runtime?.success) {
      setStaff(runtime.staff);
    }
  }

  useEffect(() => {
    if (!tenantId) return;

    loadStaffRuntime();

    loadWaiterData(tenantId).then((loaded) => {
      setData(loaded);

      setPosSettings(
        loaded?.posSettings || null
      );

      if (
        loaded?.zones?.length &&
        !activeZone
      ) {
        setActiveZone(
          loaded.zones[0].id
        );
      }

      const grouped = groupMenuByCategory(loaded?.dishes || []);
      const firstCategory = Object.keys(grouped)[0] || null;
      setActiveCategory(firstCategory);
    });
  }, [tenantId]);

  useEffect(() => {

    if (!paymentGroup) return;

    const methods = [
      posSettings?.allow_cash_payment && "CASH",
      posSettings?.allow_card_payment && "CARD",
      posSettings?.allow_room_charge && "ROOM_CHARGE",
      posSettings?.allow_bank_transfer && "BANK_TRANSFER",
      posSettings?.allow_mobile_payment && "MOBILE_PAYMENT",
      posSettings?.allow_house_account && "HOUSE_ACCOUNT",
    ].filter(Boolean);

    if (
      methods.length &&
      !methods.includes(paymentMethod)
    ) {
      setPaymentMethod(methods[0]);
    }

  }, [
    paymentGroup,
    posSettings,
    paymentMethod
  ]);

  const zones = data?.zones || [];

  const activeZoneName =
    zones.find((z) => z.id === activeZone)?.name || "--";

  const tables = useMemo(() => {
    const all = data?.tables || [];

    console.log("ZONE_DEBUG", {
      activeZone,
      totalTables: all.length,
      t9: all.find(t => t.table_number === "T9")
    });

    if (!activeZone) return all;

    const filtered =
      all.filter(
        (table) => table.zone_id === activeZone
      );

    console.log("VISIBLE_TABLES", {
      activeZone,
      count: filtered.length,
      t9Visible: filtered.some(
        t => t.table_number === "T9"
      )
    });

    return filtered;
  }, [data, activeZone]);

  const groupedMenu = useMemo(() => {
    return groupMenuByCategory(data?.dishes || []);
  }, [data]);

  const categories = Object.keys(groupedMenu || {});
  const currentCategory = activeCategory || categories[0];
  const dishes = groupedMenu[currentCategory] || [];

  const menuUnlocked =
    Boolean(activeTable) &&
    (!posSettings?.require_guest_count || Number(guestCount || 0) > 0) &&
    (!posSettings?.require_customer || Boolean(customer));

  function selectZone(zoneId) {
    setActiveZone(zoneId);
    setActiveTable(null);
    setCustomer(null);
    setCart([]);
    closeAllActionState();
  }

  async function openTable(table) {

    if (table?.status === "MERGED") {
      alert("This table is merged into another table");
      return;
    }

    setMergeSource(null);
    setMergeTargets([]);
    setMergeConfirm(false);
    setTableActions(null);

    setActiveTable(table);

    setOrderOpen(false);

    setShowCustomerModal(false);
    setShowGuestModal(false);

    setCustomerMode(null);

    closeAllActionState();

    console.log("TABLE_OPEN_WORKFLOW", {
      table: table?.table_number,
      guests: table?.current_guests,
      requireCustomer: posSettings?.require_customer,
      requireGuests: posSettings?.require_guest_count
    });

    if (!Number(table?.current_guests || 0)) {

      setGuestMode("OPEN_TABLE");
      setGuestDraft(0);

      setShowGuestModal(false);
      setShowCustomerModal(true);
    }
  }

  async function confirmGuests(count) {
    const guests = Number(count || 1);

    setShowGuestModal(false);

    if (guestMode === "MOVE_GUESTS") {
      const target = tableActions || activeTable;

      if (target) {
        await posAction("MOVE_GUESTS", {
          tableId: tableId(target),
          guestCount: guests,
        });
      }

      await refreshPOS();

      setShowGuestModal(false);
      setTableActions(null);
      setGuestMode("OPEN_TABLE");

      return;
    }

    setGuestCount(guests);

    if (activeTable) {
      await posAction("MOVE_GUESTS", {
        tableId: tableId(activeTable),
        guestCount: guests,
      }).catch(() => {});
    }

    setShowCustomerModal(false);
    setCustomerMode(null);
    setOrderOpen(false);
  }

  function walkIn() {
    setCustomer({
      id: null,
      name: "Walk-In Guest",
      phone: null,
      email: null,
      type: "WALK_IN",
    });

    setShowCustomerModal(false);
    setCustomerMode(null);

    if (customerChangeMode) {
      setCustomerChangeMode(false);
      return;
    }

    if (guestMode === "OPEN_TABLE") {

      setShowGuestModal(true);

    }
  }

  async function confirmSearchCustomer() {
    if (!customerSearch?.trim()) return;

    const response = await fetch("/api/customers/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: customerSearch,
        tenantId,
        tenant_id: tenantId,
        organizationId,
        organization_id: organizationId,
      }),
    });

    const result = await response.json();

    setCustomerResults(
      result?.customers || []
    );
  }

  async function confirmCreateCustomer() {
    if (!newCustomer.name?.trim()) {
      alert("Customer name required");
      return;
    }

    const response = await fetch("/api/customers/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId,
        tenant_id: tenantId,
        organizationId,
        organization_id: organizationId,
        customer_name: newCustomer.name,
        customer_phone: newCustomer.phone,
        customer_email: newCustomer.email,
      }),
    });

    const result = await response.json();
    const created = result?.customer;

    if (!created) {
      alert("Unable to create customer");
      return;
    }

    setCustomer({
      id: created.id,
      name: created.customer_name,
      phone: created.customer_phone,
      email: created.customer_email,
    });

    setShowCustomerModal(false);
    setCustomerMode(null);

    if (customerChangeMode) {
      setCustomerChangeMode(false);
      return;
    }

    if (guestMode === "OPEN_TABLE") {

      setShowGuestModal(true);

    }

    setNewCustomer({
      name: "",
      phone: "",
      email: "",
    });
  }

  function openDish(dish) {
    if (!menuUnlocked) return;

    setDishModal(dish);
    setModifierDraft({
      seat: "",
      spicy: "",
      cooking: "",
      side: "",
      sauce: "",
      notes: "",
    });
  }

  function addDishToOrder() {
    if (!dishModal) return;

    setCart((prev) => [
      ...prev,
      {
        id: `${dishModal.id}-${Date.now()}`,
        dish_id: dishModal.id,
        name: dishModal.name,
        category: dishModal.category || currentCategory,
        price: Number(dishModal.price || 0),
        qty: 1,
        modifiers: {
          ...modifierDraft,
        },
      },
    ]);

    setDishModal(null);
  }

  async function sendOrderToKitchen() {
    if (!activeTable) {
      alert("Select a table");
      return;
    }

    if (!Array.isArray(cart) || cart.length === 0) {
      alert("No items");
      return;
    }

    try {
      const res = await fetch("/api/pos/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table: activeTable.table_name,
          table_id: tableId(activeTable),

          items: cart.map((item) => ({
            id: item.dish_id || item.id,
            dish_id: item.dish_id || item.id,
            item_name: item.name,
            name: item.name,
            quantity: item.qty || 1,
            notes: item.modifiers?.notes || null,
            cookingLevel: item.modifiers?.cooking || null,
            seatPosition: Number(item.modifiers?.seat || 0),
            modifiers: item.modifiers || null,
            station: null,
            price: Number(item.price || 0),
          })),

          total: cart.reduce(
            (sum, item) =>
              sum +
              Number(item.price || 0) *
                Number(item.qty || 1),
            0
          ),

          customerName: customer?.name || null,
          customerPhone: customer?.phone || null,
          customerEmail: customer?.email || null,
          customerId: customer?.id || null,
          guestCount: Number(guestCount || 0),

          staff_id: staff?.id || null,
          staff_name: staff?.name || null,

          tenant_id: tenantId,
          organization_id: organizationId,
          tenant_id: tenantId,
        }),
      });

      const result = await res.json();

      console.log(
        "OPEN_TABLE_RESULT",
        result
      );

      console.log(
        "OPEN_TABLE_ORDERS",
        JSON.stringify(
          result.orders,
          null,
          2
        )
      );

      if (!res.ok) {
        throw new Error(result?.error || "Order failed");
      }

      setCart([]);
      setOrderOpen(false);

      await refreshPOS();

      alert("Order sent");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  async function openTableView(table) {

    if (table?.status === "MERGED") {
      alert("This table is merged into another table");
      return;
    }

    setMergeSource(null);
    setMergeTargets([]);
    setMergeConfirm(false);
    setTableActions(null);
    try {
      console.log("OPEN_TABLE_REQUEST", {
  tableId: tableId(table),
  organization_id: organizationId,
  tenant_id: tenantId,
});

const res = await fetch("/api/pos/tables/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableId: tableId(table),
          organization_id: organizationId,
          tenant_id: tenantId,
        }),
      });

      const result = await res.json();

      console.log(
        "OPEN_TABLE_RESULT",
        result
      );

      console.log(
        "OPEN_TABLE_ORDERS",
        JSON.stringify(
          result.orders,
          null,
          2
        )
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to load table");
      }

      const orders = result.orders || [];

      const items = orders.flatMap(
        (order) => order.order_items || []
      );

      const total =
        Number(
          result.summary?.total || 0
        );

      console.log(
        "OPEN_TABLE_ITEMS",
        items
      );

      setTableOrders(orders);

      const grouped = {};

      items.forEach((item) => {
        const key =
          item.bill_group ||
          "Group 1";

        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            group_name: key,
            order_items: []
          };
        }

        console.log(
  "GROUP_ITEM",
  item
);

grouped[key].order_items.push(item);
      });

      setBillGroups(
        Object.values(grouped)
      );

      setSelectedGroup(0);

      setTableTotal(total); // unchanged
      setTableView(table);
      closeAllActionState();

    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  function moveSelectedItemsToGroup() {

    if (
      selectedGroup === targetGroup ||
      selectedItems.length === 0
    ) {
      return;
    }

    setBillGroups((prev) => {

      const groups =
        JSON.parse(JSON.stringify(prev));

      const source =
        groups[selectedGroup];

      const target =
        groups[targetGroup];

      if (!source || !target) {
        return prev;
      }

      const moving =
        source.order_items.filter(
          item =>
            selectedItems.includes(
              item.id
            )
        );

      source.order_items =
        source.order_items.filter(
          item =>
            !selectedItems.includes(
              item.id
            )
        );

      target.order_items.push(
        ...moving.map(item => ({
          ...item,
          bill_group:
            target.group_name
        }))
      );

      return groups;
    });

    setSelectedItems([]);
  }



  async function handleTableAction(action) {
    const table = tableActions;

    if (!table) return;

    if (action === "Merge Table") {
      setMergeSource(table);
      setMergeTargets([]);
      setMergeConfirm(false);
      setTableActions(null);
      return;
    }

    if (action === "Move table") {
      setTransferSource(table);
      setTransferTarget(null);
      setTransferConfirm(true);
      setTableActions(null);
      return;
    }

    if (action === "Transfer table") {
      setTransferSource(table);
      setTransferTarget(null);
      setTransferConfirm(true);
      setTableActions(null);
      return;
    }

    if (action === "Move guests") {
      setMoveGuestSource(table);
      setMoveGuestTarget(null);
      setMoveGuestCount(1);
      setTableActions(null);
      setShowCustomerModal(false);
      setShowGuestModal(false);
      return;
    }

    if (action === "Change Customer") {
      setCustomerChangeMode(true);
      setCustomerMode(null);
      setCustomerSearch("");
      setShowCustomerModal(true);
      setTableActions(null);
      return;
    }

    if (action === "Split Bill Group") {
      await openTableView(table);

      setSelectedGroup(0);

      setActiveTable(table);
      setTableView("SPLIT_BILL_GROUP");
      setTableActions(null);
      return;
    }

  }

  async function confirmMoveGuests() {
    if (!moveGuestSource || !moveGuestTarget) return;

    const sourceGuests =
      Number(moveGuestSource.current_guests || 0);

    const targetGuests =
      Number(moveGuestTarget.current_guests || 0);

    const moving =
      Math.max(
        1,
        Math.min(
          Number(moveGuestCount || 1),
          sourceGuests || 1
        )
      );

    try {
      await posAction("MOVE_GUESTS", {
        tableId: tableId(moveGuestSource),
        guestCount: Math.max(0, sourceGuests - moving),
      });

      await posAction("MOVE_GUESTS", {
        tableId: tableId(moveGuestTarget),
        guestCount: targetGuests + moving,
      });

      setMoveGuestSource(null);
      setMoveGuestTarget(null);
      setMoveGuestCount(1);

      await refreshPOS();
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmMergeTables() {
    if (!mergeSource || !mergeTargets.length) return;

    try {
      for (const target of mergeTargets) {
        await posAction("MERGE_TABLES", {
          masterTableId: tableId(mergeSource),
          targetTableId: tableId(target),
        });
      }

      setMergeConfirm(false);
      setMergeSource(null);
      setMergeTargets([]);
      await refreshPOS();
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmTransferTable() {
    if (!transferSource || !transferTarget) return;

    try {
      await posAction("TRANSFER_TABLE", {
        fromTableId: tableId(transferSource),
        toTableId: tableId(transferTarget),
      });

      setTransferSource(null);
      setTransferTarget(null);
      setTransferConfirm(false);
      setActiveTable(null);
      setOrderOpen(false);
      setTableView(null);

      await refreshPOS();
    } catch (err) {
      alert(err.message);
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-black p-4 text-white">
        <div className="mx-auto flex h-[844px] w-[390px] items-center justify-center rounded-[38px] border border-white/10 bg-[#060606] text-xs text-white/40">
          Loading waiter...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white">
      <section className="mx-auto flex h-[844px] w-[390px] overflow-hidden rounded-[38px] border border-white/10 bg-[#060606] shadow-2xl">
        <div className="flex min-h-0 w-full flex-col">
          <div className="border-b border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold tracking-tight">
                  {activeZoneName}
                  {activeTable ? ` • ${tableName(activeTable)}` : ""}
                </div>

                <div className="mt-1 text-[10px] text-white/35">
                  {(customer && customer.name) || "No customer"} • {guestCount || 0} guests
                </div>
              </div>

              <button
                onClick={() => setOrderOpen(true)}
                className="rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-2 text-sm font-black text-[#E2C48A]"
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[10px] tracking-[0.18em]">
                    ORDER
                  </span>
                  <span className="mt-1 text-sm font-black">
                    {cart.length} ITEMS
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-2 overflow-x-auto">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => selectZone(zone.id)}
                  className={
                    zone.id === activeZone
                      ? "shrink-0 rounded-full bg-[#D6A66A] px-4 py-2 text-[9px] uppercase tracking-[0.18em] font-semibold text-black"
                      : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold text-white/60"
                  }
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-2 overflow-x-auto">
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => openTable(table)}
                  onPointerDown={() => startTableHold(table)}
                  onPointerUp={clearTableHold}
                  onPointerLeave={clearTableHold}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveTable(table);
                    setOrderOpen(false);
                    setTableActions(table);
                    setMergeSource(null);
                    setMergeTargets([]);
                    setMergeConfirm(false);
                  }}
                  className={
                    tableId(activeTable) === table.id
                      ? "shrink-0 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black"
                      : (
                          table.status === "OCCUPIED" ||
                          Number(table.current_guests || 0) > 0
                        )
                      ? "shrink-0 rounded-2xl border border-[#D6A66A]/50 bg-[#D6A66A]/10 px-5 py-4 text-sm font-black text-[#F3D7A2] shadow-[0_0_20px_rgba(214,166,106,0.15)]"
                      : table.status === "MERGED"
                      ? "shrink-0 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-black text-red-300 opacity-70"
                      : "shrink-0 rounded-2xl border border-[#D6A66A]/35 bg-[#D6A66A]/15 px-5 py-4 text-sm font-black text-[#E2C48A]"
                  }
                >
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-black tracking-[0.08em]">
                      {tableName(table)}
                    </span>

                    {table.status === "MERGED" ? (
                      <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-red-300">
                        MERGED
                      </span>
                    ) : Number(table.current_guests || 0) > 0 ? (
                      <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-[#E2C48A]">
                        {table.current_guests} Guests
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-2 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={
                    category === currentCategory
                      ? "shrink-0 rounded-full bg-[#D6A66A] px-4 py-2 text-[9px] uppercase tracking-[0.18em] font-semibold text-black"
                      : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[9px] uppercase tracking-[0.18em] font-semibold text-white/55"
                  }
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              {dishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => openDish(dish)}
                  className="min-h-[74px] rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-left text-[10px] font-medium leading-snug text-white/85 active:scale-[0.98]"
                >
                  {dish.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="w-[320px] rounded-[32px] border border-white/10 bg-black/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-4 text-lg font-semibold">
                {customerChangeMode
                  ? "Change Customer"
                  : "Customer"}
              </div>

              <div className="space-y-3">
                <input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);

                    if (
                      e.target.value &&
                      e.target.value.length >= 2
                    ) {
                      confirmSearchCustomer(
                        e.target.value
                      );
                    }
                  }}
                  placeholder="Search customer name or phone"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                />

                {(customerResults || []).length > 0 && (
                  <div className="space-y-2">

                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCustomer({
                            id: c.id,
                            name: c.customer_name,
                            phone: c.customer_phone,
                            email: c.customer_email,
                          });

                          setCustomerResults([]);
                          setShowCustomerModal(false);
                          setCustomerMode(null);

                          if (customerChangeMode) {
                            setCustomerChangeMode(false);
                            return;
                          }

                          setGuestDraft(
                            Number(guestCount || 1)
                          );

                          setShowGuestModal(true);
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left"
                      >
                        <div className="font-semibold">
                          {c.customer_name}
                        </div>

                        <div className="text-xs text-white/50">
                          {c.customer_phone || "-"}
                        </div>
                      </button>
                    ))}

                  </div>
                )}


                <button
                  onClick={() => setCustomerMode("CREATE")}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 text-sm font-semibold"
                >
                  Create Customer
                </button>

                <button
                  onClick={walkIn}
                  className="w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
                >
                  Walk-In Guest
                </button>

                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setCustomerMode(null);
                    setActiveTable(null);
                    setCustomer(null);
                    setGuestCount(0);
                  }}
                  className="w-full rounded-2xl border border-white/10 py-4 text-sm font-black text-white/70"
                >
                  Cancel
                </button>
              </div>

              {customerMode === "CREATE" && (
                <div className="mt-4 space-y-3">
                  <input
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        name: e.target.value,
                      })
                    }
                    placeholder="Name"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                  />

                  <input
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        phone: e.target.value,
                      })
                    }
                    placeholder="Phone"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                  />

                  <input
                    value={newCustomer.email}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        email: e.target.value,
                      })
                    }
                    placeholder="Email"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                  />

                  <button
                    onClick={confirmCreateCustomer}
                    className="w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
                  >
                    Create customer
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showGuestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="w-[320px] rounded-[32px] border border-white/10 bg-black/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-4 text-lg font-semibold">
                Guests
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-5 text-center text-sm text-white/60">
                  How many guests?
                </div>

                <div className="col-span-5 mt-3 flex items-center justify-center gap-4">
                  <button
                    onClick={() => setGuestDraft(Math.max(0, guestDraft - 1))}
                    className="h-14 w-14 rounded-2xl bg-white/[0.06] text-2xl font-black"
                  >
                    -
                  </button>

                  <div className="min-w-[80px] text-center text-4xl font-black">
                    {guestDraft}
                  </div>

                  <button
                    onClick={() => setGuestDraft(guestDraft + 1)}
                    className="h-14 w-14 rounded-2xl bg-white/[0.06] text-2xl font-black"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => confirmGuests(guestDraft)}
                  className="col-span-5 mt-4 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
                >
                  {guestMode === "MOVE_GUESTS"
                    ? "Update Guests"
                    : "Start Order"}
                </button>

                <button
                  onClick={() => {
                    setShowGuestModal(false);

                    if (guestMode === "MOVE_GUESTS") {
                      setTableActions(null);
                    } else {
                      setActiveTable(null);
                      setCustomer(null);
                      setGuestCount(0);
                    }

                    setGuestMode("OPEN_TABLE");
                  }}
                  className="col-span-5 mt-2 rounded-2xl border border-white/10 py-4 text-sm font-black text-white/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {dishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="max-h-[88vh] w-[390px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#0B0B0B] p-5 shadow-2xl">
              <div className="mb-4 text-lg font-semibold">
                {dishModal.name}
              </div>

              <OptionRow
                title="Spicy"
                options={spicyOptions}
                value={modifierDraft.spicy}
                onChange={(value) =>
                  setModifierDraft({
                    ...modifierDraft,
                    spicy: value,
                  })
                }
              />

              <OptionRow
                title="Seat"
                options={[
                  "1","2","3","4",
                  "5","6","7","8"
                ]}
                value={modifierDraft.seat}
                onChange={(value) =>
                  setModifierDraft({
                    ...modifierDraft,
                    seat: value,
                  })
                }
              />

              <OptionRow
                title="Cooking"
                options={cookingOptions}
                value={modifierDraft.cooking}
                onChange={(value) =>
                  setModifierDraft({
                    ...modifierDraft,
                    cooking: value,
                  })
                }
              />

              <OptionRow
                title="Side"
                options={sideOptions}
                value={modifierDraft.side}
                onChange={(value) =>
                  setModifierDraft({
                    ...modifierDraft,
                    side: value,
                  })
                }
              />

              <OptionRow
                title="Sauce"
                options={sauceOptions}
                value={modifierDraft.sauce}
                onChange={(value) =>
                  setModifierDraft({
                    ...modifierDraft,
                    sauce: value,
                  })
                }
              />

              <textarea
                value={modifierDraft.notes}
                onChange={(e) =>
                  setModifierDraft({
                    ...modifierDraft,
                    notes: e.target.value,
                  })
                }
                placeholder="Notes"
                className="mt-4 h-24 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm outline-none"
              />

              <button
                onClick={addDishToOrder}
                className="mt-4 w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
              >
                Add to order
              </button>
            </div>
          </div>
        )}

        {tableActions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="w-[320px] rounded-[32px] border border-white/10 bg-black/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-4 text-lg font-semibold">
                {tableName(tableActions)}
              </div>

              <button
                onClick={() => openTableView(tableActions)}
                className="mb-2 w-full rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-4 text-left text-sm font-black text-[#E2C48A]"
              >
                Open Table
              </button>

              {[
                "Merge Table",
                "Move table",
                "Move guests",
                "Change Customer",
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => handleTableAction(action)}
                  className="mb-2 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left text-sm font-semibold"
                >
                  {action}
                </button>
              ))}

              <button
                onClick={() => setTableActions(null)}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mergeConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="w-[340px] rounded-[32px] border border-[#D6A66A]/20 bg-[#0B0B0B] p-5">
              <div className="text-lg font-semibold text-white">
                Confirm Merge
              </div>

              <div className="mt-4 text-sm text-white/50">
                Source Table
              </div>

              <div className="mt-1 text-xl font-semibold text-[#E2C48A]">
                {tableName(mergeSource)}
              </div>

              <div className="mt-5 text-sm text-white/50">
                Destination Table
              </div>

              <div className="mt-2 space-y-2">
                {mergeTargets.map((table) => (
                  <div
                    key={table.id}
                    className="rounded-2xl bg-white/[0.05] px-4 py-3"
                  >
                    {tableName(table)}
                  </div>
                ))}
              </div>

              <button
                onClick={confirmMergeTables}
                className="mt-5 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
              >
                Confirm Merge
              </button>

              <button
                onClick={() => setMergeConfirm(false)}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {moveGuestSource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-[340px] rounded-[32px] border border-white/10 bg-black/90 p-5 backdrop-blur-xl">
              <div className="text-lg font-semibold text-white">
                Move Guests
              </div>

              <div className="mt-2 text-sm text-white/50">
                From: {tableName(moveGuestSource)}
              </div>

              <div className="mt-4 flex items-center justify-center gap-4">
                <button
                  onClick={() =>
                    setMoveGuestCount(
                      Math.max(1, moveGuestCount - 1)
                    )
                  }
                  className="h-12 w-12 rounded-2xl bg-white/[0.06] text-2xl font-black"
                >
                  -
                </button>

                <div className="min-w-[80px] text-center text-4xl font-black text-white">
                  {moveGuestCount}
                </div>

                <button
                  onClick={() =>
                    setMoveGuestCount(moveGuestCount + 1)
                  }
                  className="h-12 w-12 rounded-2xl bg-white/[0.06] text-2xl font-black"
                >
                  +
                </button>
              </div>

              <div className="mt-5 text-xs uppercase tracking-[0.22em] text-[#E2C48A]">
                Choose destination table
              </div>

              <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto">
                {(data?.tables || [])
                  .filter((t) => t.id !== tableId(moveGuestSource))
                  .filter((t) => t.status !== "MERGED")
                  .map((table) => (
                    <button
                      key={table.id}
                      onClick={() => setMoveGuestTarget(table)}
                      className={
                        moveGuestTarget?.id === table.id
                          ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                          : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                      }
                    >
                      <div className="font-semibold">
                        {tableName(table)}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        {Number(table.current_guests || 0)} guests
                      </div>
                    </button>
                  ))}
              </div>

              <button
                disabled={!moveGuestTarget}
                onClick={confirmMoveGuests}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
              >
                Move Guests
              </button>

              <button
                onClick={() => {
                  setMoveGuestSource(null);
                  setMoveGuestTarget(null);
                  setMoveGuestCount(1);
                }}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {transferSource && transferConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-[340px] rounded-[32px] border border-white/10 bg-black/90 p-5 backdrop-blur-xl">
              <div className="text-lg font-semibold text-white">
                Move Table
              </div>

              <div className="mt-2 text-sm text-white/50">
                From: {tableName(transferSource)}
              </div>

              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#E2C48A]">
                Choose destination table
              </div>

              <div className="mt-5 max-h-[300px] space-y-2 overflow-y-auto">
                {(data?.tables || [])
                  .filter((t) => t.id !== tableId(transferSource))
                  .map((table) => (
                    <button
                      key={table.id}
                      onClick={() => setTransferTarget(table)}
                      className={
                        transferTarget?.id === table.id
                          ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                          : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                      }
                    >
                      <div className="font-semibold">
                        {tableName(table)}
                      </div>

                      <div className="mt-1 text-xs text-white/40">
                        {table.status || "AVAILABLE"} • {Number(table.current_guests || 0)} guests
                      </div>
                    </button>
                  ))}
              </div>

              <button
                disabled={!transferTarget}
                onClick={confirmTransferTable}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
              >
                Move Table
              </button>

              <button
                onClick={() => {
                  setTransferSource(null);
                  setTransferTarget(null);
                  setTransferConfirm(false);
                }}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mergeSource && !mergeConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-[340px] rounded-[32px] border border-white/10 bg-black/90 p-5 backdrop-blur-xl">
              <div className="text-lg font-semibold text-white">
                Merge Table
              </div>

              <div className="mt-2 text-sm text-white/50">
                Selected table: {tableName(mergeSource)}
              </div>

              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#E2C48A]">
                Choose destination table
              </div>

              <div className="mt-5 max-h-[300px] space-y-2 overflow-y-auto">
                {tables
                  .filter((t) => t.id !== tableId(mergeSource))
                  .map((table) => (
                    <button
                      key={table.id}
                      onClick={() => {
                        const exists = mergeTargets.some((t) => t.id === table.id);

                        if (exists) {
                          setMergeTargets(
                            mergeTargets.filter((t) => t.id !== table.id)
                          );
                        } else {
                          setMergeTargets([...mergeTargets, table]);
                        }
                      }}
                      className={
                        mergeTargets.some((t) => t.id === table.id)
                          ? "w-full rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/15 px-4 py-4 text-left text-[#E2C48A]"
                          : "w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-left"
                      }
                    >
                      {tableName(table)}
                    </button>
                  ))}
              </div>

              <button
                disabled={!mergeTargets.length}
                onClick={() => setMergeConfirm(true)}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
              >
                Continue
              </button>

              <button
                onClick={() => {
                  setMergeSource(null);
                  setMergeTargets([]);
                }}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tableView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-[360px] rounded-[32px] border border-[#D6A66A]/20 bg-[#0B0B0B] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl">
              <div className="mb-5">
                <div className="text-xs uppercase tracking-[0.30em] text-[#E2C48A]">
                  Table View
                </div>

                <div className="mt-4 text-2xl font-light tracking-wide text-white">
                  {tableView === "TRANSFER"
                    ? "Transfer Table"
                    : tableView === "SPLIT"
                    ? "Split Table"
                    : tableView === "SPLIT_BILL_GROUP"
                    ? "Split Bill Group"
                    : tableName(tableView)}
                </div>

                <div className="mt-2 text-sm text-white/80">
                  {(customer && customer.name) || "Walk-in"}
                </div>

                <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#E2C48A]">
                  {tableView?.current_guests || 0} Guests
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold">
                  Orders
                </div>

                <div className="mt-3 space-y-3">

                  <div className="text-xs uppercase tracking-[0.25em] text-white/40">
                    Bill Groups
                  </div>

                  {(billGroups || []).length === 0 && (
                    <div className="text-xs text-white/40">
                      No bill groups yet
                    </div>
                  )}

                  {(billGroups || []).map((group, idx) => (
                    <button
                      key={group.id || idx}
                      onClick={() => setSelectedGroup(idx)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedGroup === idx
                          ? "border-[#E2C48A] bg-[#E2C48A]/10"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-white">
                          {group.customer_name || group.group_name || `Group ${idx + 1}`}
                        </div>

                        <div className="text-right">
                          <div className="text-[#E2C48A] font-semibold">
                            {group.order_items?.length || 0} items
                          </div>

                          <div className="text-xs text-white/50">
                            {(
                              (group.order_items || []).reduce(
                                (sum, item) =>
                                  sum +
                                  (Number(item.price || 0) *
                                   Number(item.quantity || 1)),
                                0
                              )
                            ).toLocaleString()} THB
                          </div>

                          <div
                            className={`text-[10px] font-semibold ${
                              (group.order_items || []).every(
                                item => item.bill_group_paid
                              )
                                ? "text-green-400"
                                : "text-orange-400"
                            }`}
                          >
                            {(group.order_items || []).every(
                              item => item.bill_group_paid
                            )
                              ? "PAID"
                              : "UNPAID"}
                          </div>
                        </div>
                      </div>

                    </button>
                  ))}

                </div>

{billGroups[selectedGroup] && (
  <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">

    <div className="mb-3 text-xs uppercase tracking-[0.25em] text-[#E2C48A]">
      Selected Group
    </div>

    {Object.entries(
      (billGroups[selectedGroup].order_items || []).reduce(
        (acc, item) => {
          const seat =
            item.seat_number ||
            item.modifiers?.seat ||
            "No Seat";

          if (!acc[seat]) acc[seat] = [];
          acc[seat].push(item);

          return acc;
        },
        {}
      )
    ).map(([seat, items]) => {

      const seatTotal = items.reduce(
        (sum, item) =>
          sum +
          Number(item.price || 0) *
          Number(item.quantity || 1),
        0
      );

      return (
        <div
          key={seat}
          className="mb-3 rounded-xl border border-white/10 p-3"
        >
          <div className="flex items-center justify-between">

            <div className="font-semibold text-white">
              Seat {seat}
            </div>

            <div className="text-[#E2C48A] font-semibold">
              {seatTotal.toLocaleString()} THB
            </div>

          </div>

          <div className="mt-2 space-y-2">

            {items.map((item, idx) => (
              <label
                key={idx}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedItems.includes(item.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedItems(prev => [
                        ...prev,
                        item.id
                      ]);
                    } else {
                      setSelectedItems(prev =>
                        prev.filter(id => id !== item.id)
                      );
                    }
                  }}
                />

                <span className="text-white">
                  {item.item_name || item.name}
                </span>
              </label>
            ))}

          </div>

          <button
            onClick={() =>
              setPaymentGroup({
                groupName: `Seat ${seat}`,
                total: seatTotal,
                itemIds: items.map(i => i.id)
              })
            }
            className="mt-3 w-full rounded-lg bg-[#D6A66A] py-2 text-xs font-semibold text-black"
          >
            Pay Seat
          </button>
        </div>
      );
    })}

    <div className="mt-3 border-t border-white/10 pt-3">

      <div className="mb-2 text-xs uppercase tracking-[0.25em] text-white/40">
        Move Selected To Group
      </div>

      <select
        value={targetGroup}
        onChange={(e) =>
          setTargetGroup(Number(e.target.value))
        }
        className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm"
      >
        {(billGroups || []).map((group, idx) => (
          <option
            key={idx}
            value={idx}
          >
            {group.group_name || `Group ${idx + 1}`}
          </option>
        ))}
      </select>

      <button
        onClick={moveSelectedItemsToGroup}
        className="mt-3 w-full rounded-xl bg-[#D6A66A] py-3 text-sm font-semibold text-black"
      >
        Move Selected Items
      </button>

    </div>

  </div>
)}


                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-[0.30em] text-white/40">
                      Open Amount
                    </div>

                    <div className="mt-2 text-2xl font-black text-[#E2C48A]">
                      {Number(tableTotal || 0).toLocaleString()} THB
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (typeof tableView === "object") {
                    openTable(tableView);
                  }
                  setTableView(null);
                }}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
              >
                Continue Ordering
              </button>

              <button
                onClick={() => setTableView(null)}
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm font-black"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {orderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="max-h-[88vh] w-[390px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#0B0B0B] p-5 shadow-2xl">
              <div className="space-y-3">
                {cart.length === 0 && (
                  <div className="rounded-2xl border border-white/10 p-6 text-center text-xs text-white/40">
                    No items yet
                  </div>
                )}

                {cart.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="font-semibold">
                      {item.modifiers?.seat && (
                        <span className="mr-2 text-[10px] font-black text-cyan-400">
                          S{item.modifiers.seat}
                        </span>
                      )}
                      {item.name}
                    </div>

                    {Object.values(item.modifiers || {}).some(Boolean) && (
                      <div className="mt-2 space-y-1 text-xs text-white/55">
                        {item.modifiers.spicy && <div>• {item.modifiers.spicy}</div>}
                        {item.modifiers.cooking && <div>• {item.modifiers.cooking}</div>}
                        {item.modifiers.side && <div>• {item.modifiers.side}</div>}
                        {item.modifiers.sauce && <div>• {item.modifiers.sauce}</div>}
                        {item.modifiers.notes && <div>• {item.modifiers.notes}</div>}
                      </div>
                    )}

                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                      className="mt-3 text-xs text-white/35"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={sendOrderToKitchen}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
              >
                Send to kitchen
              </button>
            </div>
          </div>
        )}

        {paymentGroup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
            <div className="w-[360px] rounded-[30px] border border-white/10 bg-[#0B0B0B] p-5">

              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.30em] text-[#E2C48A]">
                  Payment
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {paymentGroup.groupName}
                </div>

                <div className="mt-3 text-3xl font-black text-[#E2C48A]">
                  {Number(paymentGroup.total || 0).toLocaleString()} THB
                </div>
              </div>

              <div className="mt-6 space-y-3">

                {[
                  posSettings?.allow_cash_payment && "CASH",
                  posSettings?.allow_card_payment && "CARD",
                  posSettings?.allow_room_charge && "ROOM_CHARGE",
                  posSettings?.allow_bank_transfer && "BANK_TRANSFER",
                  posSettings?.allow_mobile_payment && "MOBILE_PAYMENT",
                  posSettings?.allow_house_account && "HOUSE_ACCOUNT",
                ]
                  .filter(Boolean)
                  .map(method => (
                  <button
                    key={method}
                    onClick={() =>
                      setPaymentMethod(method)
                    }
                    className={
                      paymentMethod === method
                        ? "w-full rounded-2xl border border-[#D6A66A] bg-[#D6A66A]/15 py-3 text-[#E2C48A]"
                        : "w-full rounded-2xl border border-white/10 py-3 text-white"
                    }
                  >
                    {method.replace("_"," ")}
                  </button>
                ))}

              </div>

              <button
                onClick={async () => {

                  const res =
                    await fetch(
                      "/api/pos/items/pay-group",
                      {
                        method:"POST",
                        headers:{
                          "Content-Type":"application/json"
                        },
                        body:JSON.stringify({
                          itemIds:
                            paymentGroup.itemIds,
                          paymentMethod:
                            paymentMethod
                        })
                      }
                    );

                  const result =
                    await res.json();

                  if (!result.success) {
                    alert(
                      result.error ||
                      "Payment failed"
                    );
                    return;
                  }

                  setPaymentGroup(null);

                  if (activeTable) {
                    await openTableView(
                      activeTable
                    );
                  }

                }}
                className="mt-6 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
              >
                Confirm Payment
              </button>

              <button
                onClick={() =>
                  setPaymentGroup(null)
                }
                className="mt-3 w-full rounded-2xl border border-white/10 py-4 text-sm text-white"
              >
                Cancel
              </button>

            </div>
          </div>
        )}


      </section>
    </main>
  );
}