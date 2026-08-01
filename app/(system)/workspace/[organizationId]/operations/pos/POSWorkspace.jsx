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
import StationaryPOSUI from "./StationaryPOS_UI";
import PaymentWorkspace from "./PaymentWorkspace";
import POSFinalUI from "./waiter/POS_FINAL_UI";
import POSOrdersPage from "./orders/page";
import ReceiptsPage from "./receipts/page";
import ShiftPage from "./shifts/page";

const MODES = Object.freeze([
  { id: "sell", label: "Sell", icon: Monitor },
  { id: "waiter", label: "Waiter", icon: Smartphone },
  { id: "checkout", label: "Checkout", icon: Banknote },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "shift", label: "Shift & Cash", icon: Users },
]);

const MODE_ALIASES = Object.freeze({
  payment: "checkout",
  payments: "checkout",
  stationary: "sell",
  pos: "sell",
  shifts: "shift",
});

function resolveMode(value) {
  const normalized = String(value || "sell").trim().toLowerCase();
  const resolved = MODE_ALIASES[normalized] || normalized;
  return MODES.some((mode) => mode.id === resolved) ? resolved : "sell";
}

export default function POSWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = params?.organizationId || "";
  const mode = resolveMode(searchParams.get("view"));

  const activeComponent = useMemo(() => {
    if (mode === "waiter") return <POSFinalUI />;
    if (mode === "checkout") return <PaymentWorkspace />;
    if (mode === "orders") return <POSOrdersPage />;
    if (mode === "receipts") return <ReceiptsPage />;
    if (mode === "shift") return <ShiftPage />;
    return <StationaryPOSUI />;
  }, [mode]);

  function changeMode(nextMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextMode);

    if (nextMode !== "checkout") {
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
              Sell · Settle · Control
            </div>
          </div>

          {MODES.map((item) => {
            const Icon = item.icon;
            const active = item.id === mode;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeMode(item.id)}
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

      {activeComponent}
    </main>
  );
}
