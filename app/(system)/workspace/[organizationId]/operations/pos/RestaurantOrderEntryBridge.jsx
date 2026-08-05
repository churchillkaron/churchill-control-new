"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import POSFinalUI from "./waiter/POS_FINAL_UI";

const TABLE_SELECTION_TIMEOUT_MS = 8000;
const CUSTOMER_ACTION_HOLD_MS = 620;

function normalizeReference(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^table\s+/i, "")
    .replace(/\s+/g, " ");
}

function directLabel(button) {
  const directChild = Array.from(button?.children || []).find(
    (child) => child?.tagName === "DIV"
  );

  return normalizeReference(directChild?.textContent || button?.textContent || "");
}

function findTableButton(root, requestedReference) {
  const requested = normalizeReference(requestedReference);
  if (!root || !requested) return null;

  return (
    Array.from(root.querySelectorAll("button")).find((button) => {
      const label = directLabel(button);
      return label === requested || label === `table ${requested}`;
    }) || null
  );
}

function findButtonByText(root, label) {
  const expected = normalizeReference(label);

  return (
    Array.from(root?.querySelectorAll("button") || []).find(
      (button) => normalizeReference(button.textContent) === expected
    ) || null
  );
}

function customerEditorOpen(root) {
  return Boolean(
    root?.querySelector(
      'input[placeholder="Search customer name, phone, email"]'
    )
  );
}

function dispatchMouse(target, type) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "mousedown" ? 1 : 0,
      view: window,
    })
  );
}

export default function RestaurantOrderEntryBridge(props) {
  const searchParams = useSearchParams();
  const rootRef = useRef(null);
  const completedKeyRef = useRef(null);
  const [bridgeState, setBridgeState] = useState("idle");

  const requestedReference =
    searchParams.get("service_context") || searchParams.get("table") || "";
  const requestedAction = normalizeReference(searchParams.get("action"));

  useEffect(() => {
    const root = rootRef.current;
    const normalizedTable = normalizeReference(requestedReference);
    const requestKey = `${normalizedTable}:${requestedAction}`;

    if (!root || !normalizedTable || completedKeyRef.current === requestKey) {
      setBridgeState("idle");
      return undefined;
    }

    let cancelled = false;
    let customerHoldStarted = false;
    let customerHoldTimer = null;
    const startedAt = Date.now();

    setBridgeState("selecting");

    function finish(state = "ready") {
      if (cancelled) return;
      completedKeyRef.current = requestKey;
      setBridgeState(state);
    }

    function attempt() {
      if (cancelled) return;

      if (Date.now() - startedAt > TABLE_SELECTION_TIMEOUT_MS) {
        finish("not-found");
        return;
      }

      if (requestedAction === "customer" && customerEditorOpen(root)) {
        finish();
        return;
      }

      if (requestedAction === "customer") {
        const changeCustomer = findButtonByText(root, "Change Customer");
        if (changeCustomer) {
          changeCustomer.click();
          window.setTimeout(() => finish(), 50);
          return;
        }
      }

      const tableButton = findTableButton(root, requestedReference);
      if (!tableButton) return;

      if (!requestedAction) {
        tableButton.click();
        window.setTimeout(() => finish(), 50);
        return;
      }

      if (requestedAction === "customer" && !customerHoldStarted) {
        tableButton.click();

        window.setTimeout(() => {
          if (cancelled || customerEditorOpen(root)) {
            if (customerEditorOpen(root)) finish();
            return;
          }

          customerHoldStarted = true;
          dispatchMouse(tableButton, "mousedown");
          customerHoldTimer = window.setTimeout(() => {
            dispatchMouse(tableButton, "mouseup");
          }, CUSTOMER_ACTION_HOLD_MS);
        }, 100);
      }
    }

    attempt();

    const observer = new MutationObserver(attempt);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    const interval = window.setInterval(attempt, 150);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearInterval(interval);
      if (customerHoldTimer) window.clearTimeout(customerHoldTimer);
    };
  }, [requestedAction, requestedReference]);

  return (
    <div ref={rootRef} className="relative">
      {bridgeState === "selecting" ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full border border-[#D6A66A]/30 bg-black/85 px-4 py-2 text-[11px] font-semibold text-[#E2C48A] shadow-xl backdrop-blur-xl">
          Opening table {requestedReference}…
        </div>
      ) : null}

      {bridgeState === "not-found" ? (
        <div className="mx-auto mt-3 max-w-[430px] rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          Table {requestedReference} could not be selected automatically. Refresh the
          service floor and try again.
        </div>
      ) : null}

      <POSFinalUI {...props} />
    </div>
  );
}
