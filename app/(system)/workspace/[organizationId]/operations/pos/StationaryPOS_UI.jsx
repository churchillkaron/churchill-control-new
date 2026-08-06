"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  Banknote,
  ClipboardList,
  Monitor,
  ReceiptText,
  Wallet,
} from "lucide-react";

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

const SECTIONS = Object.freeze([
  Object.freeze({
    id: "sale",
    queryValue: "sell",
    label: "Sale",
    icon: Monitor,
  }),
  Object.freeze({
    id: "orders",
    queryValue: "orders",
    label: "Orders",
    icon: ClipboardList,
  }),
  Object.freeze({
    id: "payment",
    queryValue: "checkout",
    label: "Payment",
    icon: Banknote,
  }),
  Object.freeze({
    id: "receipts",
    queryValue: "receipts",
    label: "Receipts",
    icon: ReceiptText,
  }),
  Object.freeze({
    id: "cash",
    queryValue: "cash-control",
    label: "Cash Control",
    icon: Wallet,
  }),
]);

const SECTION_ALIASES =
  Object.freeze({
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

function resolveSection(value) {
  return (
    SECTION_ALIASES[
      String(value || "")
        .trim()
        .toLowerCase()
    ] ||
    "sale"
  );
}

function applicationName(runtime) {
  return (
    runtime?.application?.name ||
    runtime?.application?.id ||
    "Point of Sale"
  );
}

function bindingName(runtime) {
  const source =
    runtime
      ?.applicationBinding
      ?.source;

  if (
    source ===
    "operational_settings"
  ) {
    return "Operational settings";
  }

  if (
    source ===
    "workspace_template"
  ) {
    return "Workspace template";
  }

  return "Canonical runtime";
}

function RestaurantSaleSurface(
  props
) {
  const [
    panel,
    setPanel,
  ] = useState("terminal");

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
              panel === "terminal"
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

      {panel === "terminal" ? (
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

function RetailReceiptsSurface() {
  return (
    <section className="min-h-[620px] bg-[#030712] px-6 py-12 text-white">
      <div className="mx-auto max-w-[1000px] rounded-[30px] border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
          Retail receipts
        </p>

        <h2 className="mt-4 text-3xl font-semibold">
          Receipt rendering is not connected yet
        </h2>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
          The receipt surface remains inside the Stationary POS terminal.
          It will use the completed retail sale and settlement records when
          the retail receipt contract is activated.
        </p>
      </div>
    </section>
  );
}

function UnsupportedApplication({
  applicationId,
}) {
  return (
    <section className="min-h-[620px] bg-[#030712] px-6 py-12 text-white">
      <div className="mx-auto max-w-[1000px] rounded-[30px] border border-amber-300/20 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
          Stationary POS
        </p>

        <h2 className="mt-4 text-3xl font-semibold">
          Application surface unavailable
        </h2>

        <p className="mt-3 text-sm text-white/50">
          No Stationary POS presentation is registered for application{" "}
          {applicationId || "unknown"}.
        </p>
      </div>
    </section>
  );
}

function resolveSurface({
  applicationId,
  section,
}) {
  if (
    applicationId ===
    "restaurant"
  ) {
    return {
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
    }[section];
  }

  if (
    applicationId ===
    "retail"
  ) {
    return {
      sale:
        RetailCatalogWorkspace,
      orders:
        RetailOrdersWorkspace,
      payment:
        RetailCheckoutWorkspace,
      receipts:
        RetailReceiptsSurface,
      cash:
        RetailCashControlWorkspace,
    }[section];
  }

  return null;
}

export default function StationaryPOSUI({
  posConfiguration,
  posRuntime,
}) {
  const params = useParams();
  const router = useRouter();

  const searchParams =
    useSearchParams();

  const organizationId =
    String(
      params?.organizationId ||
      posRuntime
        ?.organization?.id ||
      ""
    ).trim();

  const applicationId =
    posRuntime
      ?.application?.id ||
    null;

  const section =
    resolveSection(
      searchParams.get("view")
    );

  const activeDefinition =
    useMemo(
      () =>
        SECTIONS.find(
          item =>
            item.id ===
            section
        ) ||
        SECTIONS[0],
      [section]
    );

  const ActiveSurface =
    resolveSurface({
      applicationId,
      section:
        activeDefinition.id,
    });

  function changeSection(
    definition
  ) {
    const next =
      new URLSearchParams(
        searchParams.toString()
      );

    next.set(
      "view",
      definition.queryValue
    );

    if (
      definition.id !==
      "payment"
    ) {
      next.delete(
        "service_context"
      );

      next.delete("table");
      next.delete("sale");
    }

    if (
      definition.id !==
      "receipts"
    ) {
      next.delete("order_id");
    }

    router.replace(
      `/workspace/${organizationId}/operations/pos?${next.toString()}`,
      {
        scroll: false,
      }
    );
  }

  return (
    <div
      className="min-h-screen bg-black text-white"
      data-pos-application={
        applicationId || ""
      }
      data-pos-binding-source={
        posRuntime
          ?.applicationBinding
          ?.source || ""
      }
    >
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto">
          <div className="mr-4 shrink-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
              Stationary POS
            </div>

            <div className="mt-0.5 text-sm font-semibold">
              Sale · Order · Payment
            </div>

            <div className="mt-1 text-[10px] text-white/35">
              {applicationName(
                posRuntime
              )}{" "}
              ·{" "}
              {bindingName(
                posRuntime
              )}
            </div>
          </div>

          {SECTIONS.map(
            definition => {
              const Icon =
                definition.icon;

              const active =
                definition.id ===
                activeDefinition.id;

              return (
                <button
                  key={
                    definition.id
                  }
                  type="button"
                  onClick={() =>
                    changeSection(
                      definition
                    )
                  }
                  className={
                    active
                      ? "flex shrink-0 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-black"
                      : "flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/60"
                  }
                >
                  <Icon className="h-4 w-4" />

                  {definition.label}
                </button>
              );
            }
          )}
        </div>
      </header>

      {ActiveSurface ? (
        <ActiveSurface
          posConfiguration={
            posConfiguration
          }
          posRuntime={
            posRuntime
          }
          applicationBinding={
            posRuntime
              ?.applicationBinding ||
            null
          }
          posInstallation={
            posRuntime
              ?.posInstallation ||
            null
          }
          templateBinding={
            posRuntime
              ?.templateBinding ||
            null
          }
        />
      ) : (
        <UnsupportedApplication
          applicationId={
            applicationId
          }
        />
      )}
    </div>
  );
}
