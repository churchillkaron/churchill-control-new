"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function ProcureToPayPage({
  params,
}) {
  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      vendors: 0,
      purchaseOrders: 0,
      receipts: 0,
      invoices: 0,
      matches: 0,
      payables: 0,
      payments: 0,
    });

  useEffect(() => {
    async function loadRuntime() {
      try {
        const res = await fetch(
          "/api/finance/procure-to-pay/runtime",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              organizationId,
            }),
          }
        );

        const json = await res.json();

        if (json.success) {
          setRuntime({
            vendors: json.vendors || 0,
            purchaseOrders: json.purchaseOrders || 0,
            receipts: json.receipts || 0,
            invoices: json.invoices || 0,
            matches: json.matches || 0,
            payables: json.payables || 0,
            payments: json.payments || 0,
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadRuntime();
  }, [organizationId]);

  const attentionItems = [
    {
      title: "Purchase Orders Awaiting Receipt",
      count: runtime.purchaseOrders,
      href: `/workspace/${organizationId}/finance/purchase-orders`,
    },
    {
      title: "Vendor Invoices Awaiting Match",
      count: runtime.invoices,
      href: `/workspace/${organizationId}/finance/invoices`,
    },
    {
      title: "Accounts Payable Awaiting Payment",
      count: runtime.payables,
      href: `/workspace/${organizationId}/finance/ap`,
    },
    {
      title: "Payments Completed",
      count: runtime.payments,
      href: `/workspace/${organizationId}/finance/payments`,
    },
  ];

  const workflowStages = [
    {
      title: "Vendors",
      count: runtime.vendors,
      href: `/workspace/${organizationId}/finance/vendors`,
    },
    {
      title: "Purchase Orders",
      count: runtime.purchaseOrders,
      href: `/workspace/${organizationId}/finance/purchase-orders`,
    },
    {
      title: "Goods Receipts",
      count: runtime.receipts,
      href: `/workspace/${organizationId}/finance/receiving`,
    },
    {
      title: "Vendor Invoices",
      count: runtime.invoices,
      href: `/workspace/${organizationId}/finance/invoices`,
    },
    {
      title: "Matching",
      count: runtime.matches,
      href: `/workspace/${organizationId}/finance/matching`,
    },
    {
      title: "Accounts Payable",
      count: runtime.payables,
      href: `/workspace/${organizationId}/finance/ap`,
    },
    {
      title: "Payments",
      count: runtime.payments,
      href: `/workspace/${organizationId}/finance/payments`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="mt-8 mb-8">
        <h1 className="text-5xl font-extralight">
          Procure to Pay
        </h1>

        <p className="mt-2 text-white/50">
          Vendor procurement and payment workflow
        </p>
      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-amber-400 mb-6">
          Attention Required
        </div>

        <div className="space-y-3">
          {attentionItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition hover:border-amber-500/30"
            >
              <div className="text-white/90">
                ⚠ {item.title}
              </div>

              <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
                {item.count}
              </div>
            </Link>
          ))}
        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-white/50 mb-6">
          Workflow
        </div>

        <div className="grid gap-4 lg:grid-cols-3">

          {workflowStages.map((stage) => (
            <Link
              key={stage.title}
              href={stage.href}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-amber-500/30"
            >
              <div className="text-lg">
                {stage.title}
              </div>

              <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
                {stage.count}
              </div>
            </Link>
          ))}

        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-white/50 mb-6">
          Command Center
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Create Vendor",
            "Create Purchase Order",
            "Receive Goods",
            "Create Vendor Invoice",
            "Run Matching",
            "Create Payment",
          ].map((action) => (
            <div
              key={action}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-white/70"
            >
              {action}
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}
