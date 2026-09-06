"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import POSInlineCheckout from "./POSInlineCheckout";
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
  const requestedView = String(searchParams.get("view") || "").trim().toLowerCase();
  const waiterMode = requestedView === "waiter" || requestedView === "service";
  const [checkoutVersion, setCheckoutVersion] = useState(0);

  if (waiterMode) {
    return (
      <div
        className="min-h-screen bg-black text-white"
        data-restaurant-waiter-surface="true"
      >
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto max-w-[480px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">
              Waiter
            </div>
            <div className="mt-1 text-sm font-semibold">
              Table · seat · order · split · move
            </div>
            <div className="mt-1 text-[10px] text-white/35">
              Phone service workspace · settlement stays at the stationary POS
            </div>
          </div>
        </div>

        <POSFinalUI
          {...props}
          surfaceMode="waiter"
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-black text-white"
      data-restaurant-stationary-pos="true"
      data-pos-unified-sale="true"
    >
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">
              Stationary POS
            </div>
            <div className="mt-1 text-sm font-semibold">
              Table · order · send · split · settle
            </div>
            <div className="mt-1 text-[10px] text-white/35">
              The check stays editable while tender and split payment stay visible.
            </div>
          </div>

          <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#E7C991]">
            One continuous cashier screen
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1760px] gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_430px] xl:p-4">
        <div
          className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]"
          data-stationary-order-entry="true"
        >
          <style jsx global>{`
            [data-stationary-order-entry="true"] > main {
              padding: 0;
            }
            [data-stationary-order-entry="true"] > main > section {
              max-width: none;
              min-height: calc(100vh - 150px);
              border: 0;
              border-radius: 0;
              box-shadow: none;
            }
            @media (min-width: 1100px) {
              [data-stationary-order-entry="true"] > main > section .grid.grid-cols-2 {
                grid-template-columns: repeat(4, minmax(0, 1fr));
              }
            }
          `}</style>

          <POSFinalUI
            {...props}
            surfaceMode="stationary"
          />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-[124px] xl:self-start">
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">
            Retail POS
          </div>
          <div className="mt-1 text-sm font-semibold">
            Scan · Basket · Reserve · Pay · Receipt
          </div>
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
    payment: RestaurantSaleSurface,
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
