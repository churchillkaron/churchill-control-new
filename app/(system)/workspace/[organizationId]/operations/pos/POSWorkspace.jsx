"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  ClipboardList,
  Monitor,
  ReceiptText,
  Smartphone,
  Users,
} from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  buildPOSWorkspaceConfiguration,
  resolvePOSMode,
} from "@/lib/operations/commerce/POSWorkspaceConfiguration";
import StationaryPOSUI from "./StationaryPOS_UI";
import RetailCatalogWorkspace from "./RetailCatalogWorkspace";
import PaymentWorkspace from "./PaymentWorkspace";
import POSFinalUI from "./waiter/POS_FINAL_UI";
import POSOrdersPage from "./orders/page";
import ReceiptsPage from "./receipts/page";
import ShiftPage from "./shifts/page";

const ICONS = Object.freeze({
  Banknote,
  ClipboardList,
  Monitor,
  ReceiptText,
  Smartphone,
  Users,
});

const RETAIL_BINDINGS = Object.freeze([
  Object.freeze({ owner: "Supply Chain", label: "Catalog items and stock availability", state: "Active" }),
  Object.freeze({ owner: "Commercial", label: "Canonical sales orders and lines", state: "Blocked" }),
  Object.freeze({ owner: "Finance", label: "Tender settlement, refunds and posting handoff", state: "Blocked" }),
]);

function RetailReadiness({ posConfiguration, posMode }) {
  return (
    <section className="mx-auto max-w-[1100px] px-6 py-16">
      <div className="rounded-[32px] border border-[#D6A66A]/20 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
          Retail Operations
        </p>
        <h1 className="mt-4 text-3xl font-semibold">
          {posConfiguration?.presentation?.readinessTitle ||
            "Retail transaction bindings required"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50">
          {posConfiguration?.presentation?.readinessDescription ||
            "Complete the canonical retail bindings before transaction execution is enabled."}
        </p>

        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {RETAIL_BINDINGS.map((binding) => (
            <div
              key={`${binding.owner}:${binding.label}`}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]">
                  {binding.owner}
                </div>
                <div className={binding.state === "Active" ? "text-xs text-emerald-300/70" : "text-xs text-white/30"}>
                  {binding.state}
                </div>
              </div>
              <div className="mt-2 text-sm text-white/70">{binding.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/40">
          Application: {posConfiguration?.applicationId || "retail"} · Capability:{" "}
          {posMode?.capability || posConfiguration?.capability || "point-of-sale"} · State: partial readiness
        </div>
      </div>
    </section>
  );
}

const COMPONENTS = Object.freeze({
  "restaurant-order-capture": StationaryPOSUI,
  "restaurant-checkout": PaymentWorkspace,
  "restaurant-orders": POSOrdersPage,
  "restaurant-receipts": ReceiptsPage,
  "restaurant-cash-control": ShiftPage,
  "restaurant-service": POSFinalUI,
  "retail-catalog": RetailCatalogWorkspace,
  "retail-readiness": RetailReadiness,
  "retail-cash-control": ShiftPage,
});

function POSApplicationRequired({ posConfiguration, posMode }) {
  return (
    <section className="mx-auto max-w-[1100px] px-6 py-16">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
          Point of Sale
        </p>
        <h1 className="mt-4 text-3xl font-semibold">
          Configure an industry application
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
          The universal POS capability is active, but this organization has no
          transaction application configured for {posMode?.label || "this view"}.
          Connect an application profile that maps catalog, order context,
          fulfillment and settlement behavior for this business.
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/40">
          Capability: {posMode?.capability || posConfiguration?.capability || "point-of-sale"}
        </div>
      </div>
    </section>
  );
}

export default function POSWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    "";

  const configuration = useMemo(
    () =>
      buildPOSWorkspaceConfiguration({
        organization,
        applicationId:
          businessContext.operations_application ||
          businessContext.industry_application ||
          null,
      }),
    [
      businessContext.industry_application,
      businessContext.operations_application,
      organization,
    ]
  );
  const mode = resolvePOSMode(configuration, searchParams.get("view"));
  const activeMode =
    configuration.modes.find((item) => item.id === mode) ||
    configuration.modes[0];
  const ActiveComponent = COMPONENTS[activeMode?.component] || POSApplicationRequired;

  function changeMode(nextMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextMode);

    if (nextMode !== "checkout") {
      next.delete("service_context");
      next.delete("table");
      next.delete("sale");
    }

    if (nextMode !== "receipts") {
      next.delete("order_id");
    }

    router.replace(
      `/workspace/${organizationId}/operations/pos?${next.toString()}`,
      { scroll: false }
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto">
          <div className="mr-3 shrink-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
              Avantiqo POS
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              Order · Settle · Control
            </div>
          </div>

          {configuration.modes.map((item) => {
            const Icon = ICONS[item.icon] || Monitor;
            const active = item.id === mode;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeMode(item.id)}
                data-capability={item.capability}
                className={
                  active
                    ? "flex shrink-0 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-black"
                    : "flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/60 transition hover:border-[#D6A66A]/35 hover:text-white"
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <ActiveComponent
        posConfiguration={configuration}
        posMode={activeMode}
      />
    </main>
  );
}
