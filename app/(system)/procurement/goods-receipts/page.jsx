"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function GoodsReceiptsPage() {
  const businessContext = useBusinessContext();
  const organizationId =
    businessContext?.organization_id ||
    businessContext?.organization?.id ||
    null;
  const entityId =
    businessContext?.entity_id ||
    businessContext?.entity?.id ||
    null;

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState("");

  const receivableOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (order) => String(order.status || "").toUpperCase() === "APPROVED",
      ),
    [purchaseOrders],
  );

  async function loadData() {
    if (!organizationId) {
      setPurchaseOrders([]);
      setReceipts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const orderResponse = await fetch(
        "/api/procurement/purchase-orders/list",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: organizationId,
            entity_id: entityId,
          }),
        },
      );

      const orderResult = await orderResponse.json();
      if (!orderResponse.ok || !orderResult.success) {
        throw new Error(orderResult.error || "Unable to load purchase orders");
      }

      const params = new URLSearchParams({
        organization_id: organizationId,
      });
      if (entityId) params.set("entity_id", entityId);

      const receiptResponse = await fetch(
        `/api/procurement/receiving?${params.toString()}`,
      );
      const receiptResult = await receiptResponse.json();

      if (!receiptResponse.ok || !receiptResult.success) {
        throw new Error(receiptResult.error || "Unable to load goods receipts");
      }

      setPurchaseOrders(orderResult.orders || []);
      setReceipts(receiptResult.receipts || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load goods receipts");
    } finally {
      setLoading(false);
    }
  }

  async function receiveSelectedPurchaseOrder() {
    if (!organizationId || !purchaseOrderId || receiving) return;

    setReceiving(true);
    setError("");

    try {
      const response = await fetch("/api/procurement/receiving", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          entity_id: entityId,
          purchase_order_id: purchaseOrderId,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Purchase order receiving failed");
      }

      setPurchaseOrderId("");
      await loadData();
    } catch (receiveError) {
      setError(receiveError.message || "Purchase order receiving failed");
    } finally {
      setReceiving(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [organizationId, entityId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading goods receipts...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Goods Receipts</h1>
        <div className="text-white/50 mt-2">
          Receive approved purchase orders into inventory
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">
        <h2 className="text-2xl mb-6">Receive Purchase Order</h2>

        {!organizationId ? (
          <div className="text-amber-300">Select an organization first.</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={purchaseOrderId}
              onChange={(event) => setPurchaseOrderId(event.target.value)}
              className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3"
            >
              <option value="">Select approved purchase order</option>
              {receivableOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.po_number || order.id}
                  {order.parties?.display_name
                    ? ` — ${order.parties.display_name}`
                    : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={receiveSelectedPurchaseOrder}
              disabled={!purchaseOrderId || receiving}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-6 py-3 rounded-xl font-semibold"
            >
              {receiving ? "Receiving..." : "Receive"}
            </button>
          </div>
        )}

        {organizationId && receivableOrders.length === 0 && (
          <div className="text-white/40 mt-4">
            No approved purchase orders are ready to receive.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
            {error}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-2xl mb-6">Goods Receipts</h2>

        {receipts.length === 0 && <Empty text="No receipts found" />}

        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >
            <div className="flex justify-between items-start gap-6">
              <div>
                <div className="text-2xl font-semibold">
                  {receipt.grn_number || receipt.id}
                </div>

                <div className="text-white/40 mt-1">
                  {receipt.purchase_orders?.po_number || "-"}
                </div>

                <div className="mt-4 space-y-1 text-white/70">
                  <div>Received Date: {receipt.received_date || "-"}</div>
                  <div>Received By: {receipt.received_by || "-"}</div>
                  <div>Status: {receipt.status || "-"}</div>
                </div>
              </div>

              <div className="px-4 py-2 rounded-full text-sm bg-green-600/20 text-green-300">
                RECEIVED
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>
  );
}
