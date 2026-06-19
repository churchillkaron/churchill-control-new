"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { loadWaiterData } from "@/lib/pos/waiter/loadWaiterData";
import { useTenant } from "@/app/providers/TenantProvider";




function money(value) {
  return `฿${Number(value || 0).toLocaleString("en-US")}`;
}

export default function StationaryPOSUI() {

  const tenant = useTenant();



  const tenantId =
    tenant?.id;

  const organizationId =
    tenant?.activeOrganization ||
    tenant?.active_organization_id ||
    tenant?.organizationId ||
    tenant?.organization_id;

  const [zones, setZones] =
    useState([]);

  const [tables, setTables] =
    useState([]);

  useEffect(() => {

    if (
      !tenantId &&
      !organizationId
    ) {
      return;
    }

    async function loadTables() {

      const params =
        new URLSearchParams();

      if (organizationId) {
        params.set(
          "organization_id",
          organizationId
        );
      } else {
        params.set(
          "tenant_id",
          tenantId
        );
      }

      const res =
        await fetch(
          `/api/pos/tables?${params.toString()}`
        );

      const json =
        await res.json();

      if (json?.success) {
        console.log(
          "TABLES API",
          json.tables
        );

        setTables(
          json.tables || []
        );
      }

    }

    loadTables();

  }, [
    tenantId,
    organizationId,
  ]);


  const [activeSection, setActiveSection] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);

  const [paymentSummary, setPaymentSummary] = useState({
    subtotal: 0,
    vat: 0,
    service: 0,
    total: 0,
    item_count: 0,
  });

  const [tableActions, setTableActions] = useState(null);
  const holdTimer = useRef(null);


  function startHold(table) {
    if (holdTimer.current) clearTimeout(holdTimer.current);

    holdTimer.current = setTimeout(() => {
      setTableActions(table);
    }, 600);
  }

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }


  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [splitPaymentOpen, setSplitPaymentOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [received, setReceived] = useState("");


  async function posAction(action, payload = {}) {
    try {
      const res = await fetch("/api/pos/tables/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...payload,
          organization_id: organizationId,
          tenant_id: tenantId,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Action failed");
      }

      await refreshPOS?.();
      return json;
    } catch (err) {
      console.error("POS ACTION ERROR:", err);
      alert(err.message);
    }
  }


  

  

  useEffect(() => {
    async function load() {
      console.log("POS TENANT DEBUG", {
        tenant,
        tenantId,
        organizationId,
      });

      const data =
        await loadWaiterData(
          tenantId
        );


      console.log("POS ZONES", data?.zones);
      setZones(data?.zones || []);
      setTables(data?.tables || []);

      if (!activeSection && data?.zones?.length) {
        setActiveSection(data.zones[0].id);
      }
    }

    if (tenantId) load();
  }, [tenantId]);

  async function openStationaryTable(table) {
    setSelectedTable(table);
    setTableOrders([]);
    setPaymentSummary({
      subtotal: 0,
      vat: 0,
      service: 0,
      total: 0,
      item_count: 0,
    });

    try {
      const res = await fetch("/api/pos/tables/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableId: table.id,
          organization_id: organizationId,
          tenant_id: tenantId,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load table");
      }

      const effectiveTable =
        (tables || []).find(
          (t) => t.id === result.effective_table_id
        ) || table;

      setSelectedTable(effectiveTable);

      const orders = result.orders || [];

      const items = orders.flatMap(
        (order) => order.order_items || []
      );

      setTableOrders(items);

      setPaymentSummary(
        result.summary || {
          subtotal: 0,
          vat: 0,
          service: 0,
          total: 0,
          item_count: 0,
        }
      );
    } catch (err) {
      console.error("OPEN STATIONARY TABLE ERROR", err);
      alert(err.message);
    }
  }

  const visibleTables = useMemo(() => {

    const priority = {
      "BILL REQUESTED": 1,
      "FOOD READY": 2,
      DINING: 3,
      AVAILABLE: 4,
    };

    return tables
      .filter(
        (table) =>
          !activeSection ||
          table.zone_id === activeSection
      )
      
      .sort((a, b) => {
        const statusSort = priority[a.status] - priority[b.status];
        if (statusSort !== 0) return statusSort;
        return b.total - a.total;
      });
  }, [activeSection]);

  const subtotal =
    paymentSummary.subtotal || 0;

  const vat =
    paymentSummary.vat || 0;

  const service =
    paymentSummary.service || 0;

  const total =
    paymentSummary.total || 0;

  const change =
    Number(received || 0) - total;

  const salesToday =
    tables.reduce(
      (sum, table) =>
        sum + Number(table.total || 0),
      0
    );

  const vatToday =
    Math.round(
      salesToday * 0.07
    );

  const serviceToday =
    Math.round(
      salesToday * 0.05
    );
  const openTables =
    tables.reduce(
      (sum, table) =>
        sum +
        Number(
          table.current_guests || 0
        ),
      0
    );

  function tableClass(table) {
    if (table.status === "BILL REQUESTED") {
      return "border-[#D6A66A]/70 bg-[#D6A66A]/15 shadow-[0_0_30px_rgba(214,166,106,0.18)]";
    }

    if (table.status === "FOOD READY") {
      return "border-orange-300/45 bg-orange-400/10";
    }

    if (table.status === "DINING") {
      return "border-white/15 bg-white/[0.055]";
    }

    return "border-white/10 bg-white/[0.025] opacity-70";
  }

  return (
    <main className="min-h-screen bg-[#030712] px-6 py-6 text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <header className="relative overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-2xl">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#D6A66A]/10 blur-3xl" />

          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-[#D6A66A]">
                Avantiqo POS
              </p>
              <h1 className="mt-3 text-4xl font-extralight tracking-tight">
                Churchill Table Control
              </h1>

              <div className="mt-6 flex flex-wrap gap-3">
                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    onClick={() => setActiveSection(zone.id)}
                    className={
                      activeSection === zone.id
                        ? "rounded-full border border-[#D6A66A]/70 bg-[#D6A66A]/20 px-5 py-3 text-xs font-semibold tracking-[0.28em] text-white"
                        : "rounded-full border border-white/10 bg-white/[0.035] px-5 py-3 text-xs tracking-[0.28em] text-white/55 hover:text-white"
                    }
                  >
                    {zone.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-[310px] rounded-[28px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.35em] text-white/45">
                Today Operations
              </p>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/50">Sales</span>
                  <span className="text-xl font-light text-white">
                    {money(salesToday)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/50">VAT</span>
                  <span>{money(vatToday)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/50">Service</span>
                  <span>{money(serviceToday)}</span>
                </div>

                <div className="flex justify-between border-t border-white/10 pt-3">
                  <span className="text-white/50">Open Tables</span>
                  <span className="text-[#D6A66A]">{openTables}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-12 gap-6">
          <div className="col-span-7 rounded-[34px] border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-white/35">
                  Active Tables First
                </p>
                <h2 className="mt-2 text-2xl font-light">{
  zones.find(
    z => z.id === activeSection
  )?.name || "Tables"
}</h2>
              </div>

              <div className="text-right text-sm text-white/45">
                {visibleTables.filter((t) => t.status !== "AVAILABLE").length} active
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {visibleTables.map((table) => {
                console.log("TABLE CARD", table.table_name || table.table_number, "TOTAL:", table.total, table);

                return (
                <button
                  key={table.id}
                  onMouseDown={() => {
  holdTimer.current = setTimeout(() => {
    setTableActions(table);
  }, 500);
}}
onMouseUp={() => clearTimeout(holdTimer.current)}
onMouseLeave={() => clearTimeout(holdTimer.current)}
onClick={() => openStationaryTable(table)}
                  onMouseDown={() => startHold(table)}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setTableActions(table);
                  }}
                  className={`min-h-[165px] rounded-[28px] border p-5 text-left transition hover:scale-[1.015] ${tableClass(table)} ${
                    selectedTable?.id === table.id ? "ring-1 ring-[#D6A66A]/70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl font-light">
                      {table.table_name || table.table_number}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                      {table.status}
                    </span>
                  </div>

                  {table.status === "AVAILABLE" ? (
                    <div className="mt-12 text-sm uppercase tracking-[0.25em] text-white/35">
                      Available
                    </div>
                  ) : (
                    <div className="mt-7 space-y-2">
                      <div className="text-sm text-white/55">{table.waiter}</div>
                      <div className="text-sm">{table.current_guests || 0} Guests</div>
                      <div className="text-2xl font-light text-[#D6A66A]">
                        {money(
  table.total || 0
)}
                      </div>
                      <div className="text-sm text-white/45">{table.openTime}</div>
                    </div>
                  )}
                </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-5 rounded-[34px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
            <div className="flex items-start justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[#D6A66A]">
                  Reference
                </p>
                <h2 className="mt-2 text-3xl font-light">
                  {
    selectedTable?.table_name ||
    selectedTable?.table_number ||
    "No Table"
  }
                </h2>
              </div>

              <div className="text-right text-sm text-white/50">
                <div>{selectedTable?.current_guests || 0} Guests</div>
                <div>{selectedTable?.waiter || "No waiter"}</div>
                <div>{selectedTable?.openTime || "Available"}</div>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.35em] text-white/35">
                Order
              </p>

              <div className="mt-4 space-y-3">
                {tableOrders.map((item) => (
                  <div
                    key={item.id || item.dish_id || item.item_name}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div>
                      <div>{item.item_name || item.name || "Item"}</div>
                      <div className="text-xs text-white/35">Qty {item.quantity || item.qty || 0}</div>
                    </div>
                    <div>{money(Number(item.quantity || item.qty || 0) * Number(item.price || 0))}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                Notes: Birthday table
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
              <div className="flex justify-between text-white/55">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>

              <div className="flex justify-between text-white/55">
                <span>VAT</span>
                <span>{money(vat)}</span>
              </div>

              <div className="flex justify-between text-white/55">
                <span>Service</span>
                <span>{money(service)}</span>
              </div>

              <div className="flex justify-between border-t border-white/10 pt-4 text-2xl">
                <span>Total</span>
                <span className="text-[#D6A66A]">{money(total)}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm uppercase tracking-[0.25em] text-white/70">
                Add Order
              </button>

              <button
                onClick={() => {
                  setPaymentMethod("");
                  setReceived("");
                  setPaymentOpen(true);
                }}
                className="rounded-2xl border border-[#D6A66A]/60 bg-[#D6A66A]/20 px-5 py-4 text-sm uppercase tracking-[0.25em] text-white"
              >
                Payment
              </button>

              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm uppercase tracking-[0.25em] text-white/70">
                Print Bill
              </button>

              <button
                onClick={() => setSplitPaymentOpen(true)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm uppercase tracking-[0.25em] text-white/70"
              >
                Split Payment
              </button>
            </div>
          </div>
        </section>
      </div>

      {tableActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[34px] border border-white/10 bg-[#060914]/95 p-7 shadow-2xl">

            <div className="text-2xl font-light">
              {tableActions?.table_name ||
               tableActions?.table_number}
            </div>

            <div className="mt-6 space-y-3">

              <button
                onClick={() => {
                  openStationaryTable(tableActions);
                  setTableActions(null);
                }}
                className="w-full rounded-2xl border border-[#D6A66A]/60 bg-[#D6A66A]/20 px-5 py-4 text-left"
              >
                Open Table
              </button>

              {[
                "Transfer Table",
                "Move Guests",
                "Split Bill Group",
                "Close Table",
              ].map(action => (
                <button
                  key={action}
                  onClick={async () => {
                    if (!selectedTable) return;

                    if (action === "Move Guests") {
                      setPaymentOpen(true);
                      setTableActions(null);
                      return;
                    }

                    if (action === "Split Bill Group") {
                      alert("Split Bill Group - Coming Next");
                      setTableActions(null);
                      return;
                    }

                    if (action === "Transfer Table") {
                      await fetch("/api/pos/tables/action", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "TRANSFER_TABLE",
                          tenantId,
                          fromTableId: selectedTable.id,
                          toTableId: null
                        })
                      });
                      setTableActions(null);
                      return;
                    }

                    if (action === "Close Table") {
                      await fetch("/api/pos/tables/action", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "CLOSE_TABLE",
                          tenantId,
                          tableId: selectedTable.id
                        })
                      });
                      setSelectedTable(null);
                      setTableActions(null);
                      return;
                    }
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left"
                >
                  {action}
                </button>
              ))}

              <button
                onClick={() => setTableActions(null)}
                className="w-full rounded-2xl border border-white/10 px-5 py-4"
              >
                Cancel
              </button>

            </div>
          </div>
        </div>
      )}


      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-[34px] border border-white/10 bg-[#060914]/95 p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[#D6A66A]">
                  Payment
                </p>
                <h2 className="mt-2 text-3xl font-light">
                  {paymentMethod ? `${paymentMethod} Payment` : "Select Method"}
                </h2>
              </div>

              <button
                onClick={() => setPaymentOpen(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-white/50"
              >
                Close
              </button>
            </div>

            <div className="mt-7 rounded-[26px] border border-white/10 bg-white/[0.035] p-5">
              <div className="flex justify-between text-sm text-white/50">
                <span>Reference</span>
                <span>{selectedTable?.table_name || selectedTable?.table_number}</span>
              </div>

              <div className="mt-4 flex justify-between">
                <span>Total</span>
                <span className="text-3xl font-light text-[#D6A66A]">
                  {money(total)}
                </span>
              </div>
            </div>

            {!paymentMethod && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {["Cash", "Card", "QR", "Room", "Comp"].map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5 text-sm uppercase tracking-[0.25em] hover:border-[#D6A66A]/60"
                  >
                    {method}
                  </button>
                ))}
              </div>
            )}

            {paymentMethod && (
              <div className="mt-6 space-y-5">
                {paymentMethod === "Cash" && (
                  <>
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-white/35">
                        Received
                      </label>
                      <input
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-2xl outline-none"
                        placeholder="5000"
                      />
                    </div>

                    <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                      <span className="text-white/50">Change</span>
                      <span className="text-2xl text-[#D6A66A]">
                        {money(Math.max(change, 0))}
                      </span>
                    </div>
                  </>
                )}

                <button
                  onClick={() => setPaymentOpen(false)}
                  className="w-full rounded-2xl border border-[#D6A66A]/60 bg-[#D6A66A]/20 px-5 py-5 text-sm uppercase tracking-[0.28em]"
                >
                  Complete Payment
                </button>

                <button
                  onClick={() => setPaymentMethod("")}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm uppercase tracking-[0.28em] text-white/50"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
