"use client";

import { useEffect, useState } from "react";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";

export default function TimelinePage() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  async function fetchEvents() {
    try {
      const res = await fetch("/api/timeline?tenantId=cbdc9308-5515-4d38-8e64-edae68dd5872");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  const filters = [
    { label: "All Activity", value: "ALL" },
    { label: "Order Created", value: SYSTEM_EVENTS.ORDER_CREATED },
    { label: "Order Paid", value: SYSTEM_EVENTS.ORDER_PAID },
    { label: "Customer Visits", value: SYSTEM_EVENTS.CUSTOMER_VISIT },
    { label: "Loyalty Changes", value: SYSTEM_EVENTS.CUSTOMER_SEGMENT_CHANGED },
    { label: "Table Opened", value: SYSTEM_EVENTS.TABLE_OPENED },
    { label: "Table Closed", value: SYSTEM_EVENTS.TABLE_CLOSED },
  ];

  const filteredEvents = events.filter((e) =>
    filter === "ALL" ? true : e.type === filter
  );


  function getEventTitle(event) {

    switch (event.type) {

      case "ORDER_PAID":
        return "Payment Received";

      case "ORDER_CREATED":
        return "Order Started";

      case "CUSTOMER_VISIT":
        return `${event.payload?.customer_name || "Customer"} Returned`;

      case "CUSTOMER_SEGMENT_CHANGED":
        return "Loyalty Tier Updated";

      case "TABLE_OPENED":
        return "Table Opened";

      case "TABLE_CLOSED":
        return "Table Closed";

      default:
        return event.type.replaceAll("_", " ");
    }
  }

  return (
    <div className="bg-[#050505] text-white p-8">

      {/* HERO */}
      <div className="relative -mt-3 overflow-hidden rounded-[52px] border border-[#D6C39A]/25 bg-gradient-to-br from-[#0B0B0B] via-[#101010] to-[#050505] py-8 px-14 mb-12 shadow-[0_30px_120px_rgba(214,195,154,0.22)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,166,106,0.18),transparent_40%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-[0.35em] uppercase text-[#D6C39A]">
              Synthetic Intelligence OS
            </div>

            <div className="mt-2 text-[11px] tracking-[0.25em] uppercase text-white/40">
              Powered by Avantiqo
            </div>
            <h1 className="mt-4 text-5xl font-extralight tracking-tight">
              Churchill Restaurant & Bar
            </h1>

            <div className="mt-3 text-[#D6C39A] uppercase tracking-[0.35em] text-sm">
              
            </div>
            
<div className="mt-4 text-sm tracking-[0.2em] uppercase text-[#D6C39A]/70">
  Restaurant • Phuket • Active Runtime
</div>

<p className="mt-4 text-white/55 max-w-3xl text-base leading-relaxed">

              Every customer. Every payment. Every table. Every loyalty movement. Recorded forever.
            </p>
          </div>
          <div className="hidden lg:block w-[280px]">

            <div className="rounded-[36px] border border-[#D6C39A]/20 bg-black/40 backdrop-blur-2xl p-7">

              <div className="text-xs tracking-[0.25em] uppercase text-[#D6C39A] mb-6">
                Live Intelligence
              </div>

              <div className="flex justify-between mb-4">
                <span className="text-white/50">Events</span>
                <span>{events.length}</span>
              </div>

              <div className="flex justify-between mb-4">
                <span className="text-white/50">Customers</span>
                <span>
                  {
                    new Set(
                      events
                        .map(e => e.payload?.customer_phone)
                        .filter(Boolean)
                    ).size
                  }
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-white/50">Status</span>
                <span className="text-emerald-400">
                  Live
                </span>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-12 gap-6">

        {/* FILTERS */}
        <div className="col-span-12 lg:col-span-2">
          <div className="sticky top-6">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 h-full overflow-y-auto">
            <div className="text-xs uppercase tracking-[0.25em] text-[#D6C39A] mb-5">
              Filters
            </div>
            <div className="space-y-2">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`w-full text-left px-4 py-3 rounded-2xl transition-all duration-300 ${
                    filter === f.value
                      ? "bg-[#D6C39A]/15 border border-[#D6C39A]/30 text-[#D6C39A]"
                      : "border border-transparent hover:border-white/10 hover:bg-white/[0.03]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          </div>
        </div>

        {/* TIMELINE FEED */}
        <div className="col-span-12 lg:col-span-7 space-y-6 space-y-6 pr-3">
          {loading && <div className="text-white/50">Loading...</div>}
          {!loading && filteredEvents.length === 0 && <div className="text-white/50">No events</div>}
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_0_30px_rgba(214,166,106,0.1)]"
            >
              <div className="text-xl font-medium text-white">

                {event.type === "CUSTOMER_VISIT"
                  ? `${event.payload?.customer_name || "Customer"} Returned`
                  : getEventTitle(event)
                }

              </div>

              {event.type === "CUSTOMER_VISIT" && (
                <div className="mt-3 text-[#D6C39A] text-lg">
                  Visit #{event.payload?.visit_count || 1}
                </div>
              )}

              {event.type === "CUSTOMER_SEGMENT_CHANGED" && (
                <div className="mt-4">

                  <div className="text-2xl">
                    {event.payload?.new_tier === "VIP"
                      ? "👑 VIP Status Achieved"
                      : "🏆 Loyalty Upgrade"}
                  </div>

                  <div className="mt-2 text-[#D6C39A]">
                    {event.payload?.previous_tier}
                    {" → "}
                    {event.payload?.new_tier}
                  </div>

                </div>
              )}

              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-[#D6C39A]">
                {event.type.replaceAll("_", " ")}
              </div>
              <div className="mt-1 text-white/80 text-xs">
                {new Date(event.created_at).toLocaleString()}
              </div>
              
{event.type === "CUSTOMER_VISIT" ? (

<div className="mt-6 grid grid-cols-4 gap-8">

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Tier
    </div>
    <div className="mt-2 text-lg text-[#D6C39A]">
      {event.payload.tier || "REGULAR"}
    </div>
  </div>

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Lifetime Spend
    </div>
    <div className="mt-2 text-lg">
      ฿{Number(event.payload.total_spent || 0).toLocaleString()}
    </div>
  </div>

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Loyalty Points
    </div>
    <div className="mt-2 text-lg">
      {Number(event.payload.loyalty_points || 0).toLocaleString()}
    </div>
  </div>

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Favorite Dish
    </div>
    <div className="mt-2 text-lg">
      {event.payload.favorite_dish || "-"}
    </div>
  </div>

</div>

) : (

<div className="mt-6 grid grid-cols-3 gap-8">

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Customer
    </div>
    <div className="mt-2 text-lg">
      {event.payload.customer_name || "-"}
    </div>
  </div>

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Table
    </div>
    <div className="mt-2 text-lg">
      {event.payload.table_number || "-"}
    </div>
  </div>

  <div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
      Amount
    </div>

    <div
      className={`mt-2 ${
        event.type === "ORDER_PAID"
          ? "text-3xl font-light text-[#D6C39A]"
          : "text-lg text-[#D6C39A]"
      }`}
    >
      {event.payload.amount
        ? `฿${event.payload.amount}`
        : event.payload.visit_total
        ? `฿${event.payload.visit_total}`
        : "-"}
    </div>
  </div>

</div>

)}

            </div>
          ))}

        </div>

        {/* BUSINESS OVERVIEW */}
        <div className="col-span-12 lg:col-span-3 lg:sticky lg:top-6 h-fit">
          <div className="rounded-[32px] border border-[#D6C39A]/10 bg-white/[0.03] backdrop-blur-xl p-6">

            <div className="text-xs uppercase tracking-[0.25em] text-[#D6C39A] mb-6">
              Business Overview
            </div>

            <div className="flex justify-between mb-4">
              <span className="text-white/50">Events</span>
              <span>{events.length}</span>
            </div>

            <div className="flex justify-between mb-4">
              <span className="text-white/50">Customers</span>
              <span>
                {
                  new Set(
                    events
                      .map(e => e.payload?.customer_phone)
                      .filter(Boolean)
                  ).size
                }
              </span>
            </div>

            <div className="flex justify-between mb-4">
              <span className="text-white/50">Visits</span>
              <span>
                {
                  events.filter(
                    e => e.type === "CUSTOMER_VISIT"
                  ).length
                }
              </span>
            </div>

            <div className="flex justify-between mb-6">
              <span className="text-white/50">Payments</span>
              <span className="text-[#D6C39A]">
                {
                  events.filter(
                    e => e.type === "ORDER_PAID"
                  ).length
                }
              </span>
            </div>

            <div className="border-t border-white/10 pt-6">

              <div className="flex justify-between mb-4">
                <span className="text-white/50">Latest Customer</span>
                <span>
                  {events?.[0]?.payload?.customer_name || "-"}
                </span>
              </div>

              <div className="flex justify-between mb-4">
                <span className="text-white/50">Platform</span>
                <span className="text-[#D6C39A]">
                  Avantiqo
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-white/50">Runtime</span>
                <span className="text-emerald-400">
                  Active
                </span>
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
