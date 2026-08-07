"use client";

import {
  useState,
} from "react";

import RestaurantStationaryPOSSurface from "./RestaurantStationaryPOSSurface";
import PaymentWorkspace from "./PaymentWorkspace";
import RetailCatalogWorkspace from "./RetailCatalogWorkspace";
import RetailCheckoutWorkspace from "./RetailCheckoutWorkspace";
import RetailOrdersWorkspace from "./RetailOrdersWorkspace";
import RetailCashControlWorkspace from "./RetailCashControlWorkspace";
import POSFinalUI from "./waiter/POS_FINAL_UI";
import POSOrdersPage from "./orders/page";
import ReceiptsPage from "./receipts/page";
import ShiftPage from "./shifts/page";

function normalizeApplicationId(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}

function RestaurantSaleSurface(
  props
) {
  const [
    panel,
    setPanel,
  ] = useState(
    "terminal"
  );

  return (
    <div>
      <div className="border-b border-white/10 bg-[#050505] px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] gap-2">
          <button
            type="button"
            onClick={() =>
              setPanel(
                "terminal"
              )
            }
            className={
              panel ===
              "terminal"
                ? "rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black"
                : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"
            }
          >
            Tables and bills
          </button>

          <button
            type="button"
            onClick={() =>
              setPanel(
                "order-entry"
              )
            }
            className={
              panel ===
              "order-entry"
                ? "rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black"
                : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55"
            }
          >
            Order entry
          </button>
        </div>
      </div>

      {panel ===
      "terminal" ? (
        <RestaurantStationaryPOSSurface
          {...props}
        />
      ) : (
        <POSFinalUI
          {...props}
        />
      )}
    </div>
  );
}

const APPLICATION_SURFACES =
  Object.freeze({
    restaurant:
      Object.freeze({
        sale:
          RestaurantSaleSurface,

        orders:
          POSOrdersPage,

        payment:
          PaymentWorkspace,

        receipts:
          ReceiptsPage,

        cash:
          ShiftPage,
      }),

    retail:
      Object.freeze({
        sale:
          RetailCatalogWorkspace,

        orders:
          RetailOrdersWorkspace,

        payment:
          RetailCheckoutWorkspace,

        receipts:
          ReceiptsPage,

        cash:
          RetailCashControlWorkspace,
      }),
  });

export function resolvePOSApplicationSurface({
  applicationId,
  section,
}) {
  const normalizedApplicationId =
    normalizeApplicationId(
      applicationId
    );

  const application =
    APPLICATION_SURFACES[
      normalizedApplicationId
    ];

  if (!application) {
    return null;
  }

  return (
    application[
      String(
        section || ""
      )
        .trim()
        .toLowerCase()
    ] ||
    null
  );
}

export function hasPOSApplicationSurface(
  applicationId
) {
  return Boolean(
    APPLICATION_SURFACES[
      normalizeApplicationId(
        applicationId
      )
    ]
  );
}

export default APPLICATION_SURFACES;
