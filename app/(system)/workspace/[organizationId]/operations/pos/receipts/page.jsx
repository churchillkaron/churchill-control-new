"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export default function ReceiptsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    organization?.id ||
    null;
  const currencyCode =
    organization?.currency_code || organization?.currency || businessContext.currency || null;
  const requestedOrderId = searchParams.get("order_id");

  const [receipts, setReceipts] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(requestedOrderId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReceipts = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/restaurant/receipts?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load receipts");
      }
      const rows = result.receipts || [];
      setReceipts(rows);
      setSelectedOrderId((current) => current || rows[0]?.order_id || null);
    } catch (loadError) {
      setReceipts([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const receipt = receipts.find((row) => row.order_id === selectedOrderId) || null;

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .receipt-navigation, .receipt-actions, header { display: none !important; }
          .receipt-document { border: none !important; color: black !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">Restaurant Operations</p>
              <h1 className="mt-3 text-4xl font-semibold">Receipts</h1>
              <p className="mt-2 text-sm text-white/45">Paid transactions, receipt preview and reprint.</p>
            </div>
            <button onClick={loadReceipts} className="receipt-actions inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.65fr_1.35fr]">
          <div className="receipt-navigation rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">Paid transactions</div>
            <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-white/35">Loading receipts...</div>
              ) : receipts.length ? receipts.map((row) => (
                <button
                  key={row.order_id}
                  onClick={() => setSelectedOrderId(row.order_id)}
                  className={`w-full rounded-2xl border p-4 text-left ${selectedOrderId === row.order_id ? "border-[#D6A66A]/45 bg-[#D6A66A]/10" : "border-white/10 bg-black/20"}`}
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.receipt_number}</div>
                      <div className="mt-1 text-xs text-white/35">Table {row.table_number || "—"}</div>
                    </div>
                    <div className="text-sm text-white/60">{formatMoney(row.total, currencyCode)}</div>
                  </div>
                  <div className="mt-3 text-xs text-white/30">{row.created_at ? new Date(row.created_at).toLocaleString() : ""}</div>
                </button>
              )) : (
                <div className="p-8 text-center text-sm text-white/35">No paid receipts found.</div>
              )}
            </div>
          </div>

          <div className="receipt-document rounded-[30px] border border-white/10 bg-white/[0.03] p-8">
            {receipt ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-semibold">{organization?.name || "Receipt"}</h2>
                    <div className="mt-2 text-sm text-white/40">{receipt.receipt_number}</div>
                    <div className="mt-1 text-sm text-white/40">Table {receipt.table_number || "—"}</div>
                  </div>
                  <button onClick={() => window.print()} className="receipt-actions inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black">
                    <Printer size={16} /> Print Receipt
                  </button>
                </div>

                <div className="mt-8 space-y-3">
                  {(receipt.items || []).map((item) => (
                    <div key={item.id} className="flex justify-between gap-4 border-b border-white/10 pb-3">
                      <div>
                        <div>{item.item_name || item.name || "Item"}</div>
                        <div className="mt-1 text-xs text-white/35">{Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}</div>
                      </div>
                      <div>{formatMoney(item.total, currencyCode)}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-3 border-t border-white/10 pt-5">
                  <div className="flex justify-between text-white/55"><span>Subtotal</span><span>{formatMoney(receipt.subtotal, currencyCode)}</span></div>
                  <div className="flex justify-between text-white/55"><span>Discount</span><span>-{formatMoney(receipt.discount, currencyCode)}</span></div>
                  <div className="flex justify-between text-white/55"><span>Tax</span><span>{formatMoney(receipt.tax, currencyCode)}</span></div>
                  <div className="flex justify-between text-white/55"><span>Service charge</span><span>{formatMoney(receipt.service_charge, currencyCode)}</span></div>
                  <div className="flex justify-between text-2xl font-semibold"><span>Total</span><span>{formatMoney(receipt.total, currencyCode)}</span></div>
                </div>

                <div className="mt-8 border-t border-white/10 pt-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">Payment breakdown</div>
                  <div className="mt-4 space-y-2">
                    {(receipt.payment_breakdown || []).map((payment) => (
                      <div key={payment.id} className="flex justify-between rounded-xl border border-white/10 p-3 text-sm">
                        <span>{payment.payment_method || payment.method || "Payment"}</span>
                        <span>{formatMoney(payment.amount, currencyCode)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[500px] items-center justify-center text-sm text-white/35">Select a receipt to preview it.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
