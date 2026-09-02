"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import POSInlineCheckout from "./POSInlineCheckout";
import RestaurantStationaryPOSSurface from "./RestaurantStationaryPOSSurface";
import PaymentWorkspace from "./PaymentWorkspace";
import RetailCatalogWorkspace from "./RetailCatalogWorkspace";
import RetailOrdersWorkspace from "./RetailOrdersWorkspace";
import POSFinalUI from "./waiter/POS_FINAL_UI";
import POSOrdersPage from "./orders/page";
import ReceiptsPage from "./receipts/page";
import ShiftPage from "./shifts/page";

function normalizeApplicationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function RestaurantSaleSurface(props) {
  const searchParams = useSearchParams();
  const requestedView = String(searchParams.get("view") || "").toLowerCase();
  const [panel, setPanel] = useState(
    requestedView === "stationary" ? "stationary" : "waiter",
  );
  const [checkoutVersion, setCheckoutVersion] = useState(0);

  useEffect(() => {
    if (requestedView === "service" || requestedView === "waiter") setPanel("waiter");
    if (requestedView === "stationary") setPanel("stationary");
  }, [requestedView]);

  return (
    <div className="min-h-screen bg-black text-white" data-pos-unified-sale="true">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Live POS</div>
            <div className="mt-1 text-sm font-semibold">Table · Order · Send · Split · Pay</div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPanel("waiter")}
              className={panel === "waiter"
                ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                : "rounded-xl border border-[#D6A66A]/25 px-4 py-2 text-xs text-[#E7C991]"}
            >
              Waiter / Floor Service
            </button>
            <button
              type="button"
              onClick={() => setPanel("stationary")}
              className={panel === "stationary"
                ? "rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black"
                : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"}
            >
              Station Overview
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1760px] gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_430px] xl:p-4">
        <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]">
          {panel === "waiter" ? <POSFinalUI {...props} /> : <RestaurantStationaryPOSSurface {...props} />}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-[76px] xl:self-start">
          <POSInlineCheckout
            key={checkoutVersion}
            posConfiguration={props.posConfiguration}
            compact
            onRefresh={props.refreshPOSRuntime}
            onPaymentComplete={() => {
              setCheckoutVersion((current) => current + 1);
              props.refreshPOSRuntime?.();
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function RetailSaleSurface(props) {
  const [checkoutVersion, setCheckoutVersion] = useState(0);

  function refreshCheckout() {
    setCheckoutVersion((current) => current + 1);
    props.refreshPOSRuntime?.();
  }

  return (
    <div className="min-h-screen bg-black text-white" data-pos-unified-sale="true">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-[1760px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Retail POS</div>
          <div className="mt-1 text-sm font-semibold">Scan · Basket · Reserve · Pay · Receipt</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1760px] gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_430px] xl:p-4">
        <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]">
          <RetailCatalogWorkspace
            {...props}
            onSaleReady={refreshCheckout}
          />
        </div>
        <aside className="min-w-0 xl:sticky xl:top-[76px] xl:self-start">
          <POSInlineCheckout
            key={checkoutVersion}
            posConfiguration={props.posConfiguration}
            compact
            onRefresh={props.refreshPOSRuntime}
            onPaymentComplete={refreshCheckout}
          />
        </aside>
      </div>
    </div>
  );
}

const APPLICATION_SURFACES = Object.freeze({
  restaurant: Object.freeze({
    sale: RestaurantSaleSurface,
    orders: POSOrdersPage,
    payment: PaymentWorkspace,
    receipts: ReceiptsPage,
    cash: ShiftPage,
  }),
  retail: Object.freeze({
    sale: RetailSaleSurface,
    orders: RetailOrdersWorkspace,
    payment: PaymentWorkspace,
    receipts: ReceiptsPage,
    cash: ShiftPage,
  }),
});

export function resolvePOSApplicationSurface({ applicationId, section }) {
  const application = APPLICATION_SURFACES[normalizeApplicationId(applicationId)];
  if (!application) return null;
  return application[String(section || "").trim().toLowerCase()] || null;
}

export function hasPOSApplicationSurface(applicationId) {
  return Boolean(APPLICATION_SURFACES[normalizeApplicationId(applicationId)]);
}

export default APPLICATION_SURFACES;
