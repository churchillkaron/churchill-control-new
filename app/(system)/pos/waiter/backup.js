
"use client";
import { supabase } from "@/lib/shared/supabase/client";


import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTenant } from "@/app/providers/TenantProvider";

import { loadWaiterData } from "@/lib/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/pos/waiter/groupMenuByCategory";
import { createWaiterModule } from "@/lib/shared/ubte/modules/waiter";

const spicyOptions = [
  "No spicy",
  "Mild",
  "Medium",
  "Thai spicy",
];

const cookingOptions = [
  "Rare",
  "Medium rare",
  "Medium",
  "Medium well",
  "Well done",
];

const sideOptions = [
  "Fries",
  "Rice",
  "Salad",
  "Mash",
];

const sauceOptions = [
  "Pepper",
  "Mushroom",
  "Garlic",
  "No sauce",
];


async function posAction(action, payload) {
  try {
    await fetch("/api/pos/tables/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userEmail: staff?.email || "unknown",
        action,
        payload
      })
    });
  } catch (err) {
    console.error("POS ACTION ERROR", err);
  }
}


async function refreshPOS() {
  try {
    const res = await fetch("/api/pos/tables?tenant_id=live");
    const data = await res.json();
    setData(data);
  } catch (err) {
    console.error("REFRESH ERROR", err);
  }
}

export default function POSFinalUI() {
  const tenant = useTenant();
  const posConfig = tenant?.settings?.pos || {};
  const waiter = createWaiterModule({ supabase });
  const undefined = tenant?.id;

  const holdTimer = useRef(null);
  const longPressFired = useRef(false);

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

    if ((activeTable && (activeTable?.id || activeTable?.table?.id)) !== table.id) {
      setActiveTable(table);
    }

    setOrderOpen(false);
    setTableActions(table);
    setMergeSource(null);
    setMergeTargets([]);
  }, 600);
}

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
  const [customerSearch, setCustomerSearch] = useState("");
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
    spicy: "",
    cooking: "",
    side: "",
    sauce: "",
    notes: "",
  });

  const [orderOpen, setOrderOpen] = useState(false);
const modalLock = useRef(false);
  
function handleTableAction(action) {
  const table = tableActions?.table || tableActions;

  if (!table) return;

  switch (action) {
    case "Move guests":
      setGuestDraft(activeTable?.current_guests || 1);
      setShowCustomerModal(false); setShowGuestModal(true); setShowCustomerModal(false);
      break;

    case "Transfer table":
      setMergeSource(table);
      setMergeTargets([]);
      setTableView("TRANSFER");
      break;

    case "Merge tables":
      setMergeSource(table);
      setMergeTargets([]);
      setMergeConfirm(true);
      break;

    case "Split table":
      setTableView("SPLIT");
      break;

    case "Close table":
      waiter.closeTable({ tableId: table?.id || table?.table?.id });
      setActiveTable(null);
      setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]);
      break;

    default:
      break;
  }
}

const [tableActions, setTableActions] = useState(null);
  const [tableView, setTableView] = useState(null);

  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTargets, setMergeTargets] = useState([]);
  const [mergeConfirm, setMergeConfirm] = useState(false);

  const [tableOrders, setTableOrders] = useState([]);
  const [tableTotal, setTableTotal] = useState(0);


  async function loadStaffRuntime() {
    const {
      data: { session },
    } = await null;

    if (!session?.user?.email) return;

    const response = await fetch(
      `/api/staff/runtime?email=${session.user.email}`
    );

    const runtime = await response.json();

    if (runtime.success) {
      setStaff(runtime.staff);
    }
  }


  useEffect(() => {
    if (!undefined) return;

    loadStaffRuntime();

    loadWaiterData(undefined).then((loaded) => {
      setData(loaded);

      if (loaded?.zones?.length) {
        setActiveZone(loaded.zones[0].id);
      }

      const grouped =
        groupMenuByCategory(loaded?.dishes || []);

      const firstCategory =
        Object.keys(grouped)[0] || null;

      setActiveCategory(firstCategory);
    });
  }, [undefined ]);

  const zones =
    data?.zones || [];

  const activeZoneName =
    zones.find((z) => z.id === activeZone)?.name || "--";

  const tables =
    useMemo(() => {
      const all = data?.tables || [];

      if (!activeZone) return all;

      return all.filter(
        (table) => table.zone_id === activeZone
      );
    }, [data, activeZone]);

  const groupedMenu =
    useMemo(() => {
      return groupMenuByCategory(
        data?.dishes || []
      );
    }, [data]);

  const categories =
    Object.keys(groupedMenu || {});

  const currentCategory =
    activeCategory || categories[0];

  const dishes =
    groupedMenu[currentCategory] || [];

  const menuUnlocked = waiter.canUnlockMenu({
  table: activeTable,
  customer,
  guestCount,
  config: posConfig
});

 function tableName(table) {
  return table?.table_name || "--";
}

function selectZone(zoneId) {
  setActiveZone(zoneId);
  waiter.closeTable({ tableId: (activeTable && (activeTable?.id || activeTable?.table?.id)) });
setActiveTable(null);
setCustomer(null);
setCart([]);
}

  async function openTable(table) {
  const result = await waiter.openTable({ table });

  if (!result?.ok) return;


  setActiveTable(result.table); 
  setOrderOpen(false);
}

async function confirmGuests(count) {
  setShowGuestModal(false); 

  if (false) { 
    await waiter.moveGuests({
      undefined,
      fromTable: (activeTable && (activeTable?.id || activeTable?.table?.id)) || activeTable?.table_number,
      toTable: (tableActions?.table?.id || tableActions?.id) || (tableActions?.table?.table_number || tableActions?.table_number),
      guestCount: Number(count || 1),
    });

    setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]); 
    return;
  }

  setGuestCount(Number(count || 1));
  setShowGuestModal(false); 
setShowCustomerModal(true);
  setCustomerMode(null);
}


function walkIn() {
  setCustomer({
    id: null,
    name: "Walk-In Guest",
    phone: null,
    email: null,
    type: "WALK_IN"
  });

  setShowCustomerModal(false);
  setCustomerMode(null);
}

async function confirmSearchCustomer() {
  if (!customerSearch?.trim()) return;

  const response = await fetch(
    "/api/customers/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: customerSearch,
        undefined,
      }),
    }
  );

  const result = await response.json();

  const selected =
    result?.customers?.[0];

  if (!selected) {
    alert("Customer not found");
    return;
  }

  setCustomer({
    id: selected.id,
    name: selected.customer_name,
    phone: selected.customer_phone,
    email: selected.customer_email,
  });

  setShowCustomerModal(false); 
  setCustomerMode(null);
  setCustomerSearch("");
}

async function confirmCreateCustomer() {
  if (!newCustomer.name?.trim()) {
    alert("Customer name required");
    return;
  }

  const response = await fetch(
    "/api/customers/upsert",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        undefined /* moved to backend */,
        customer_name: newCustomer.name,
        customer_phone: newCustomer.phone,
        customer_email: newCustomer.email,
      }),
    }
  );

  const result = await response.json();

  const created =
    result?.customer;

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
        id:
          `${dishModal.id}-${Date.now()}`,
        dish_id:
          dishModal.id,
        name:
          dishModal.name,
        category:
          dishModal.category || currentCategory,
        price:
          Number(dishModal.price || 0),
        qty:
          1,
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
      if (!activeTable) return;

const res = await fetch
fetch("/api/pos/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table: activeTable.table_name,

          items: cart.map((item) => ({
            id: item.dish_id || item.id,
            dish_id: item.dish_id || item.id,
            item_name: item.name,
            name: item.name,
            quantity: item.qty || 1,
            notes: item.modifiers?.notes || null,
            cookingLevel:
              item.modifiers?.cooking || null,
            station: "HOT",
            price:
              Number(item.price || 0),
          })),

          total: cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0),

          customerName:
            (customer && customer.name) || null,

          customerPhone:
            (customer && customer.phone) || null,

          customerEmail:
            customer?.email || null,

          customerId:
            customer?.id || null,

          guestCount:
            Number(guestCount || 0),

          staff_id:
            staff?.id,

          staff_name:
            staff?.name,

          tenant_id:
            undefined /* moved to backend */,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Order failed"
        );
      }

      setCart([]);
      setOrderOpen(false);

      alert("Order sent");

    } catch (err) {
      console.error(err);
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

          {/* HEADER */}
          <div className="border-b border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold tracking-tight">
                  {activeZoneName}
                  {activeTable
                    ? ` • ${tableName(activeTable)}`
                    : ""}
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

          {/* ZONES */}
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

          {/* TABLES */}
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
                    if (!table) return;
                    e.preventDefault();
                    if ((activeTable && (activeTable?.id || activeTable?.table?.id)) !== table.id) setActiveTable(table);
    setTimeout(() => setOrderOpen(false), 0);
                    setTableActions(table);
    setMergeSource(null);
    setMergeTargets([]);
                  }}
                  className={
                    (activeTable && (activeTable?.id || activeTable?.table?.id)) === table.id
                      ? "shrink-0 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black"
                      : (
                          (table.status === "OCCUPIED" || table.current_guests > 0) ||
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

          {/* CATEGORIES */}
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

          {/* MENU */}
          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div
              className={
                "grid grid-cols-3 gap-2"
              }
            >
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

        {/* CUSTOMER MODAL */}
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="w-[320px] rounded-[32px] border border-white/10 bg-black/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-4 text-lg font-semibold">
                Customer
              </div>

              <div className="space-y-3">

                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer name or phone"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                />

                <button
                  onClick={confirmSearchCustomer}
                  className="w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
                >
                  Select Customer
                </button>

                <button
                  onClick={() => setShowCustomerModal(true)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 text-sm font-semibold"
                >
                  Create Customer
                </button>

                <button
                  onClick={() => setCustomerMode('WALK_IN')}
                  className="w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
                >
                  Walk-In Guest
                </button>

              </div>

              {true && (
                <div className="hidden">
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Name or phone"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none"
                  />

                  <button
                    onClick={confirmSearchCustomer}
                    className="w-full rounded-2xl bg-white py-4 text-sm font-semibold text-black"
                  >
                    Select customer
                  </button>
                </div>
              )}

              {true && (
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

        {/* GUEST MODAL */}
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
                    onClick={() =>
                      setGuestDraft(
                        Math.max(1, guestDraft - 1)
                      )
                    }
                    className="h-14 w-14 rounded-2xl bg-white/[0.06] text-2xl font-black"
                  >
                    -
                  </button>

                  <div className="min-w-[80px] text-center text-4xl font-black">
                    {guestDraft}
                  </div>

                  <button
                    onClick={() =>
                      setGuestDraft(
                        guestDraft + 1
                      )
                    }
                    className="h-14 w-14 rounded-2xl bg-white/[0.06] text-2xl font-black"
                  >
                    +
                  </button>

                </div>

                <button
                  onClick={() =>
                    waiter.moveGuests ? waiter.moveGuests({ guestCount: guestDraft }) : confirmGuests(guestDraft)
                  }
                  className="col-span-5 mt-4 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black"
                >
                  Start Order
                </button>

              </div>
            </div>
          </div>
        )}

        {/* DISH MODAL */}
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


        {/* TABLE ACTIONS */}
        {tableActions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4">
            <div className="w-[320px] rounded-[32px] border border-white/10 bg-black/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">

              <div className="mb-4 text-lg font-semibold">
                {tableName(tableActions)}
              </div>

              <button
                onClick={async () => {
                  setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]); 

                  const session = null // backend handled await null;
const { data: orders } = await supabase
  .from("orders")
  .select("id, table_number, status, tenant_id, order_items(*)")
  
  .eq("table_number", tableActions?.table || tableActions_name)
  .eq("status", "OPEN");

                  const orderIds =
                    (orders || []).map(o => o.id);

                
const { data: items } =
                    orderIds.length
                      ? await supabase
                          .from("order_items")
                          .select("*")
                          .in("order_id", orderIds)
                      : { data: [] };

                  setTableOrders(items || []);

                  setTableTotal((items || []).filter(Boolean).reduce(
                      (sum, item) =>
                        sum +
                        Number(item.price || 0) *
                        Number(item.quantity || 0),
                      0
                    )
                  );

                  setTableView(tableActions);
                }}
                className="mb-2 w-full rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-4 text-left text-sm font-black text-[#E2C48A]"
              >
                Open Table
              </button>

              {[
                "Transfer table",
                "Merge tables",
                "Split table",
                "Move guests",
                "Close table",
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => {
                    const table = tableActions?.table || tableActions;

                    if (action === "Merge tables") {
                      setMergeSource(table);
                      setMergeTargets([]);
                      setMergeConfirm(false);
                      setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]);
                      return;
                    }

                    if (action === "Transfer table") {
                      setActiveTable(table);
                      setTableView("TRANSFER");
                      setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]);
                      return;
                    }

                    if (action === "Move guests") {
                      setGuestMode("MOVE_GUESTS");
                      setGuestDraft(activeTable?.current_guests || 1);
                      setShowCustomerModal(false); setShowGuestModal(true);
                      return;
                    }

                    if (action === "Split table") {
                      setTableView("SPLIT");
                      setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]);
                      return;
                    }

                    if (action === "Close table") {
                      waiter.closeTable({
                        tableId: table?.id
                      });
                      setActiveTable(null);
                      setCustomer(null);
                      setCart([]);
                      setTableActions(null); setMergeSource(null); setMergeTargets([]); setActiveTable(null); setMergeSource(null); setMergeTargets([]);
                    }
                  }}

                 
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
                Destination Table
              </div>

              <div className="mt-1 text-xl font-semibold text-[#E2C48A]">
                {tableName(mergeSource)}
              </div>

              <div className="mt-5 text-sm text-white/50">
                Tables To Merge
              </div>

              <div className="mt-2 space-y-2">
                {mergeTargets.map(table => (
                  <div
                    key={table.id}
                    className="rounded-2xl bg-white/[0.05] px-4 py-3"
                  >
                    {tableName(table)}
                  </div>
               ))}
              </div>

              <button
                onClick={async () => {

                  await Promise.all(mergeTargets.map(async (table) => {

                    const {
                      error: mergeError
                    } = await
                        tenant_id:
                          undefined,

                        master_table_id:
                          (mergeSource?.id || mergeSource?.table?.id),

                        merged_table_id:
                          table.id,
                      });

                    console.log(
                      "MERGE ERROR",
                      mergeError
                    );

                    if (mergeError) {
                      alert(
                        JSON.stringify(
                          mergeError,
                          null,
                          2
                        )
                      );
                      return;
                    }

                    await supabase
                    
                      .update({
                        status:
                          "MERGED",
                        current_guests:
                          0,
                      })
                      .eq(
                        "id",
                        table.id
                      );

                  }));

const totalGuests =
                    Number(mergeSource.current_guests || 0) +
                    mergeTargets.reduce(
                      (sum, table) =>
                        sum + Number(table.current_guests || 0),
                      0
                    );

                  await supabase
                  
                    .update({
                      status:
                        "OCCUPIED",
                      current_guests:
                        totalGuests,
                    })
                    .eq(
                      "id",
                      (mergeSource?.id || mergeSource?.table?.id)
                    );

                  const loaded =
                    await loadWaiterData(
                      undefined /* moved to backend */
                    );

                  setData(loaded);

                  setMergeConfirm(false);
                  setMergeSource(null);
                  setMergeTargets([]);

                }}
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


{mergeSource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-[340px] rounded-[32px] border border-white/10 bg-black/90 p-5 backdrop-blur-xl">

              <div className="text-lg font-semibold text-white">
                Merge Tables
              </div>

              <div className="mt-2 text-sm text-white/50">
                Select tables to merge into {tableName(mergeSource)}
              </div>

              <div className="mt-5 space-y-2 max-h-[300px] overflow-y-auto">

                {tables
                  .filter(
                    t => t.id !== (mergeSource?.id || mergeSource?.table?.id)
                  )
                  .map(table => (

                    <button
                      key={table.id}
                      onClick={(e) => {

                        const exists =
                          mergeTargets.some(
                            t => t.id === table.id
                          );

                        if (exists) {

                          setMergeTargets(
                            mergeTargets.filter(
                              t => t.id !== table.id
                            )
                          );

                        } else {

                          setMergeTargets([
                            ...mergeTargets,
                            table
                          ]);

                        }

                      }}
                      className={
                        mergeTargets.some(
                          t => t.id === table.id
                        )
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
                onClick={(e) => {

                  setMergeConfirm(true);
                  setMergeSource(mergeSource);

                }}
                className="mt-4 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-30"
              >
                Continue
              </button>

              <button
                onClick={(e) => {
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


        {/* TABLE VIEW */}
        {tableView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-[360px] rounded-[32px] border border-[#D6A66A]/20 bg-[#0B0B0B] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl">

              <div className="mb-5">
                <div className="text-xs tracking-[0.30em] uppercase text-[#E2C48A]">
                  Table View
                </div>

                <div className="mt-4 text-2xl font-light tracking-wide text-white">
                  {tableName(tableView)}
                </div>

                <div className="mt-2 text-sm text-white/80">
                  {(customer && customer.name) || "Walk-in"}
                </div>

                <div className="mt-1 text-xs tracking-[0.22em] uppercase text-[#E2C48A]">
                  {(tableView.current_guests || 0) + (tableView.mergedOrders?.reduce((sum, o) => sum + (o.guest_count || 0), 0) || 0)} Guests
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold">
                  Orders
                </div>

                <div className="mt-3 space-y-2">

                  {Object.values(

                    (tableOrders || tableOrders).reduce(
                      (acc, item) => {

                        if (!acc[item.item_name]) {

                          acc[item.item_name] = {
                            item_name:
                              item.item_name,

                            quantity: 0,

                            total: cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0),
                          };

                        }

                        acc[item.item_name].quantity +=
                          Number(
                            item.quantity || 0
                          );

                        acc[item.item_name].total +=
                          Number(
                            item.price || 0
                          ) *
                          Number(
                            item.quantity || 0
                          );

                        return acc;

                      },
                      {}
                    )

                  ).map(item => (

                    <div
                      key={item.item_name}
                      className="flex items-center justify-between text-sm"
                    >

                      <div>
                        <div className="font-medium text-white">
                          {item.item_name}
                        </div>

                        <div className="text-xs text-white/40">
                          x{item.quantity}
                        </div>
                      </div>

                      <div className="font-semibold text-[#E2C48A]">
                        {item.total.toLocaleString()}
                      </div>

                    </div>

                 ))}

                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="text-center">

                    <div className="text-[10px] tracking-[0.30em] uppercase text-white/40">
                      Open Amount
                    </div>

                    <div className="mt-2 text-2xl font-black text-[#E2C48A]">
                      {(tableTotal + (tableOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0)).toLocaleString()} THB
                    </div>

                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  openTable(tableView);
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


        {/* ORDER DRAWER */}
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
</section>
  </main>
);
}
