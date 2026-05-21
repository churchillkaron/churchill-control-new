"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function InvoiceMatchingPage() {

  const [invoices, setInvoices] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("*")
        .in("status", [
          "approved",
          "paid",
        ])
        .order("created_at", {
          ascending: false,
        });

    const { data: poData } =
      await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    const { data: grnData } =
      await supabase
        .from("goods_receipts")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    const { data: matchData } =
      await supabase
        .from("invoice_matches")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    setInvoices(invoiceData || []);
    setPurchaseOrders(poData || []);
    setGoodsReceipts(grnData || []);
    setMatches(matchData || []);

    setLoading(false);

  }

  // ---------------------------------
  // CREATE MATCH
  // ---------------------------------

  async function createMatch(
    invoice
  ) {

    const po =
      purchaseOrders.find(
        (p) =>
          p.vendor_id ===
          invoice.vendor_id
      );

    const grn =
      goodsReceipts.find(
        (g) =>
          g.vendor_id ===
          invoice.vendor_id
      );

    if (!po || !grn) {

      alert(
        "Matching PO or GRN not found"
      );

      return;

    }

    const invoiceTotal =
      Number(
        invoice.total_amount || 0
      );

    const poTotal =
      Number(
        po.total_amount || 0
      );

    const grnTotal =
      Number(
        po.total_amount || 0
      );

    const varianceAmount =
      invoiceTotal - poTotal;

    const variancePercent =
      poTotal > 0
        ? (
            varianceAmount /
            poTotal
          ) * 100
        : 0;

    let matchStatus =
      "matched";

    if (
      Math.abs(
        variancePercent
      ) > 20
    ) {

      matchStatus =
        "blocked";

    } else if (
      Math.abs(
        variancePercent
      ) > 5
    ) {

      matchStatus =
        "variance_warning";

    }

    const { error } =
      await supabase
        .from("invoice_matches")
        .insert([{

          invoice_id:
            invoice.id,

          purchase_order_id:
            po.id,

          goods_receipt_id:
            grn.id,

          match_status:
            matchStatus,

          po_total:
            poTotal,

          grn_total:
            grnTotal,

          invoice_total:
            invoiceTotal,

          variance_amount:
            varianceAmount,

          variance_percent:
            variancePercent,

          matched_by:
            "system",

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    await fetchData();

  }

  // ---------------------------------
  // UI
  // ---------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading invoice matching...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Invoice Matching
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise 3-way procurement validation
        </div>

      </div>

      {/* INVOICES */}
      <div className="mb-16">

        <h2 className="text-2xl mb-6">
          Invoices Awaiting Match
        </h2>

        {invoices.length === 0 && (

          <Empty text="No invoices available" />

        )}

        {invoices.map((invoice) => (

          <div
            key={invoice.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {invoice.vendor || "Unknown Vendor"}
                </div>

                <div className="text-white/40 mt-1">
                  Invoice #{invoice.id}
                </div>

                <div className="mt-4 text-white/70">

                  Total:
                  {" "}
                  ฿{Number(
                    invoice.total_amount || 0
                  ).toLocaleString()}

                </div>

              </div>

              <button

                onClick={() =>
                  createMatch(invoice)
                }

                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"

              >

                Match Invoice

              </button>

            </div>

          </div>

        ))}

      </div>

      {/* MATCH RESULTS */}
      <div>

        <h2 className="text-2xl mb-6">
          Match Results
        </h2>

        {matches.length === 0 && (

          <Empty text="No invoice matches created" />

        )}

        {matches.map((match) => (

          <div
            key={match.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-xl font-semibold">

                  Invoice Match

                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    PO Total:
                    {" "}
                    ฿{Number(
                      match.po_total || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    GRN Total:
                    {" "}
                    ฿{Number(
                      match.grn_total || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Invoice Total:
                    {" "}
                    ฿{Number(
                      match.invoice_total || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Variance:
                    {" "}
                    ฿{Number(
                      match.variance_amount || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Variance %:
                    {" "}
                    {Number(
                      match.variance_percent || 0
                    ).toFixed(2)}%
                  </div>

                </div>

              </div>

              <div
                className={`px-4 py-2 rounded-full text-sm ${
                  match.match_status === "matched"
                    ? "bg-green-600/20 text-green-300"
                    : match.match_status === "variance_warning"
                    ? "bg-yellow-600/20 text-yellow-300"
                    : "bg-red-600/20 text-red-300"
                }`}
              >

                {match.match_status}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}