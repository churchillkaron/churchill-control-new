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

const COMPONENTS = Object.freeze({
  "order-capture": StationaryPOSUI,
  checkout: PaymentWorkspace,
  orders: POSOrdersPage,
  receipts: ReceiptsPage,
  "cash-control": ShiftPage,
  "restaurant-service": POSFinalUI,
});

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
  const ActiveComponent = COMPONENTS[activeMode?.component] || StationaryPOSUI;

  function changeMode(nextMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextMode);

    if (nextMode !== "checkout") {
      next.delete("service_context");
      next.delete("table");
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
