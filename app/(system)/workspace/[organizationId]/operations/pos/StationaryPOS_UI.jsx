"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  ClipboardList,
  Monitor,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { resolvePOSApplicationSurface } from "./POSApplicationSurfaceRegistry";

const SECTIONS = Object.freeze([
  { id: "sale", queryValue: "sell", label: "POS", icon: Monitor },
  { id: "orders", queryValue: "orders", label: "Orders", icon: ClipboardList },
  { id: "payment", queryValue: "checkout", label: "Payment", icon: Banknote },
  { id: "receipts", queryValue: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "cash", queryValue: "cash-control", label: "Cash Control", icon: Wallet },
]);

const SECTION_ALIASES = Object.freeze({
  sell: "sale",
  sale: "sale",
  stationary: "sale",
  pos: "sale",
  service: "sale",
  waiter: "sale",
  order: "sale",
  orders: "orders",
  checkout: "payment",
  payment: "payment",
  payments: "payment",
  settlement: "payment",
  receipt: "receipts",
  receipts: "receipts",
  cash: "cash",
  "cash-control": "cash",
  shift: "cash",
  shifts: "cash",
  drawer: "cash",
  till: "cash",
});

function requestedSection(value) {
  return SECTION_ALIASES[String(value || "").trim().toLowerCase()] || "sale";
}

function applicationName(runtime) {
  return runtime?.application?.name || runtime?.application?.id || "Point of Sale";
}

function bindingName(runtime) {
  const source = runtime?.applicationBinding?.source;
  if (source === "operational_settings") return "Operational settings";
  if (source === "workspace_template") return "Workspace template";
  return "Canonical runtime";
}

function UnsupportedApplication({ applicationId, light = false }) {
  return (
    <section className={light ? "min-h-[620px] bg-[#F7F6F3] px-6 py-12 text-[#191919]" : "min-h-[620px] bg-[#030712] px-6 py-12 text-white"}>
      <div className={light ? "mx-auto max-w-[1000px] rounded-[22px] border border-black/[0.075] bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.025)]" : "mx-auto max-w-[1000px] rounded-[30px] border border-amber-300/20 bg-white/[0.03] p-8"}>
        <p className={light ? "text-xs uppercase tracking-[0.24em] text-[#9A744B]" : "text-xs uppercase tracking-[0.24em] text-[#D6A66A]"}>Point of Sale</p>
        <h2 className={light ? "mt-4 text-3xl font-medium tracking-[-0.03em] text-[#181817]" : "mt-4 text-3xl font-semibold"}>Application surface unavailable</h2>
        <p className={light ? "mt-3 text-sm text-[#6C6963]" : "mt-3 text-sm text-white/50"}>
          No POS presentation is registered for application {applicationId || "unknown"}.
        </p>
      </div>
    </section>
  );
}

export default function StationaryPOSUI({
  posConfiguration,
  posRuntime,
  refreshPOSRuntime,
}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = String(
    params?.organizationId || posRuntime?.organization?.id || "",
  ).trim();
  const applicationId = posRuntime?.application?.id || null;
  const isRestaurant = String(applicationId || "").toLowerCase() === "restaurant";

  const requested = requestedSection(searchParams.get("view"));
  const section = isRestaurant && requested === "payment" ? "sale" : requested;

  const visibleSections = useMemo(
    () => isRestaurant
      ? SECTIONS.filter((item) => item.id !== "payment")
      : SECTIONS,
    [isRestaurant],
  );

  const activeDefinition =
    visibleSections.find((item) => item.id === section) || visibleSections[0];

  const ActiveSurface = resolvePOSApplicationSurface({
    applicationId,
    section: activeDefinition.id,
  });

  function changeSection(definition) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", definition.queryValue);
    next.delete("service_context");
    next.delete("table");
    next.delete("sale");
    if (definition.id !== "receipts") next.delete("order_id");

    router.replace(
      `/workspace/${organizationId}/operations/pos?${next.toString()}`,
      { scroll: false },
    );
  }

  const shellClass = isRestaurant
    ? "min-h-screen bg-[#F7F6F3] text-[#191919]"
    : "min-h-screen bg-black text-white";

  const headerClass = isRestaurant
    ? "sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 py-3 backdrop-blur-xl"
    : "sticky top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl";

  return (
    <div
      className={shellClass}
      data-pos-application={applicationId || ""}
      data-pos-binding-source={posRuntime?.applicationBinding?.source || ""}
      data-avantiqo-pos-shell={isRestaurant ? "light" : "dark"}
    >
      <header className={headerClass}>
        <div className="mx-auto flex max-w-[1760px] items-center gap-2 overflow-x-auto">
          <div className="mr-4 shrink-0">
            <div className={isRestaurant ? "text-[10px] font-medium uppercase tracking-[0.2em] text-[#9A744B]" : "text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]"}>
              Point of Sale
            </div>
            <div className={isRestaurant ? "mt-0.5 text-sm font-medium text-[#181817]" : "mt-0.5 text-sm font-semibold"}>
              {isRestaurant ? "Order and payment in one workspace" : "Sell · Order · Payment"}
            </div>
            <div className={isRestaurant ? "mt-1 text-[10px] text-[#8A867F]" : "mt-1 text-[10px] text-white/35"}>
              {applicationName(posRuntime)} · {bindingName(posRuntime)}
            </div>
          </div>

          {visibleSections.map((definition) => {
            const Icon = definition.icon;
            const active = definition.id === activeDefinition.id;
            const className = isRestaurant
              ? active
                ? "flex shrink-0 items-center gap-2 rounded-lg bg-[#25231F] px-4 py-2.5 text-xs font-semibold text-white"
                : "flex shrink-0 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-4 py-2.5 text-xs text-[#6C6963] shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
              : active
                ? "flex shrink-0 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-black"
                : "flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/60";

            return (
              <button
                key={definition.id}
                type="button"
                onClick={() => changeSection(definition)}
                className={className}
              >
                <Icon className="h-4 w-4" />
                {definition.label}
              </button>
            );
          })}
        </div>
      </header>

      {ActiveSurface ? (
        <ActiveSurface
          posConfiguration={posConfiguration}
          posRuntime={posRuntime}
          refreshPOSRuntime={refreshPOSRuntime}
          applicationBinding={posRuntime?.applicationBinding || null}
          posInstallation={posRuntime?.posInstallation || null}
          templateBinding={posRuntime?.templateBinding || null}
        />
      ) : (
        <UnsupportedApplication applicationId={applicationId} light={isRestaurant} />
      )}
    </div>
  );
}
