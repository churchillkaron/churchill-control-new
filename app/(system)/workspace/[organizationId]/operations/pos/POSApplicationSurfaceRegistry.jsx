"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import RestaurantAvantiqoTheme from "@/components/workspace/operations/RestaurantAvantiqoTheme";
import POSInlineCheckout from "./POSInlineCheckout";
import PaymentWorkspace from "./PaymentWorkspace";
import RestaurantPaymentCorrections from "./RestaurantPaymentCorrections";
import RestaurantStationaryOrderSurface from "./RestaurantStationaryOrderSurface";
import RestaurantWaiterPhoneSurface from "./RestaurantWaiterPhoneSurface";
import RetailCatalogWorkspace from "./RetailCatalogWorkspace";
import RetailOrdersWorkspace from "./RetailOrdersWorkspace";
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
  const requestedTable = String(searchParams.get("table") || "").trim() || null;
  const waiterMode = requestedView === "waiter" || requestedView === "service";
  const actions = props.posRuntime?.capabilities?.actions || {};
  const canOrder = actions.order_entry === true;
  const canSettle = actions.payment === true;
  const canCorrectPayment = actions.payment_correction === true;
  const [checkoutVersion, setCheckoutVersion] = useState(0);
  const [activeTableReference, setActiveTableReference] = useState(requestedTable);

  useEffect(() => {
    setActiveTableReference(requestedTable);
  }, [requestedTable]);

  if (waiterMode) {
    return (
      <RestaurantAvantiqoTheme mode="service">
        <div className="min-h-screen bg-black text-white" data-restaurant-waiter-surface="true">
          <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
            <div className="mx-auto max-w-[480px]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Waiter</div>
              <div className="mt-1 text-sm font-semibold">Table · seat · order · split · move</div>
              <div className="mt-1 text-[10px] text-white/35">Phone service workspace · settlement stays at the stationary POS</div>
            </div>
          </div>

          <RestaurantWaiterPhoneSurface {...props} />
        </div>
      </RestaurantAvantiqoTheme>
    );
  }

  function refreshStationary() {
    setCheckoutVersion((current) => current + 1);
    props.refreshPOSRuntime?.();
  }

  return (
    <RestaurantAvantiqoTheme mode="service">
      <div className="min-h-screen bg-black text-white" data-restaurant-stationary-pos="true" data-pos-unified-sale="true">
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1760px] flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Stationary POS</div>
              <div className="mt-1 text-sm font-semibold">Table · order · send · split · settle</div>
              <div className="mt-1 text-[10px] text-white/35">Desktop cashier workstation · order and settlement remain visible together.</div>
            </div>

            <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#E7C991]">One continuous cashier screen</div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1760px] gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_430px] xl:p-4">
          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]" data-stationary-order-entry="true">
            {canOrder ? (
              <RestaurantStationaryOrderSurface
                {...props}
                preferredTableReference={requestedTable}
                onActiveContextChange={setActiveTableReference}
                onOrderComplete={refreshStationary}
              />
            ) : (
              <div
                className="m-4 rounded-[22px] border border-[#A37849]/20 bg-white p-5 text-[#191919]"
                data-stationary-order-authority-boundary="true"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">Order entry</div>
                <div className="mt-2 text-sm font-semibold">Service authority required</div>
                <div className="mt-2 text-xs leading-5 text-[#6C6963]">
                  Menu entry and order submission are hidden because the signed-in role is not authorized to create restaurant orders.
                </div>
              </div>
            )}
          </div>

          <aside className="min-w-0 xl:sticky xl:top-[124px] xl:self-start">
            {canSettle ? (
              <>
                <POSInlineCheckout
                  key={checkoutVersion}
                  posConfiguration={props.posConfiguration}
                  preferredContextReference={activeTableReference}
                  compact
                  onRefresh={props.refreshPOSRuntime}
                  onPaymentComplete={refreshStationary}
                />
                {canCorrectPayment ? (
                  <RestaurantPaymentCorrections
                    posConfiguration={props.posConfiguration}
                    refreshKey={checkoutVersion}
                    onCorrected={refreshStationary}
                  />
                ) : null}
              </>
            ) : (
              <div
                className="rounded-[22px] border border-[#A37849]/20 bg-white p-5 text-[#191919]"
                data-stationary-payment-authority-boundary="true"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">Settlement</div>
                <div className="mt-2 text-sm font-semibold">Cashier authority required</div>
                <div className="mt-2 text-xs leading-5 text-[#6C6963]">
                  Payment is hidden because the signed-in role is not authorized to settle checks.
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </RestaurantAvantiqoTheme>
  );
}

function RestaurantOrdersSurface(props) {
  return (
    <RestaurantAvantiqoTheme mode="service">
      <POSOrdersPage {...props} />
    </RestaurantAvantiqoTheme>
  );
}

function RestaurantReceiptsSurface(props) {
  return (
    <RestaurantAvantiqoTheme mode="service">
      <ReceiptsPage {...props} />
    </RestaurantAvantiqoTheme>
  );
}

function RestaurantCashSurface(props) {
  return (
    <RestaurantAvantiqoTheme mode="service">
      <ShiftPage {...props} />
    </RestaurantAvantiqoTheme>
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
          <RetailCatalogWorkspace {...props} onSaleReady={refreshCheckout} />
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
    orders: RestaurantOrdersSurface,
    payment: RestaurantSaleSurface,
    receipts: RestaurantReceiptsSurface,
    cash: RestaurantCashSurface,
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
