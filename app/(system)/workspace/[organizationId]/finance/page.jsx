"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function FinancePage({
  params,
}) {
  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      procureToPay: 0,
      accounting: 0,
      tax: 0,
      close: 0,
    });

  useEffect(() => {

    async function loadRuntime() {

      try {

        const res = await fetch(
          "/api/finance/runtime",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              organizationId,
            }),
          }
        );

        const json =
          await res.json();

        if (json.success) {

          setRuntime({

            procureToPay:
              json.procureToPay || 0,

            accounting:
              json.accounting || 0,

            tax:
              json.tax || 0,

            close:
              json.close || 0,

          });

        }

      } catch (error) {

        console.error(error);

      }

    }

    loadRuntime();

  }, [organizationId]);

  const workflowCenters = [
    {
      title: "Procure to Pay",
      href: `/workspace/${organizationId}/finance/procure-to-pay`,
      description:
        "Vendor → Purchase Order → Receipt → Invoice → Matching → AP → Payment",
    },
    {
      title: "Accounting",
      href: `/workspace/${organizationId}/finance/accounting`,
      description:
        "Journals → General Ledger → Trial Balance",
    },
    {
      title: "Tax",
      href: `/workspace/${organizationId}/finance/tax`,
      description:
        "VAT → Filings → Compliance",
    },
    {
      title: "Period Close",
      href: `/workspace/${organizationId}/finance/close`,
      description:
        "Reconciliation → Adjustments → Close Checklist",
    },
  ];

  const attentionItems = [
    {
      title: "Procure-to-Pay",
      count: runtime.procureToPay,
    },
    {
      title: "Accounting",
      count: runtime.accounting,
    },
    {
      title: "Tax",
      count: runtime.tax,
    },
    {
      title: "Period Close",
      count: runtime.close,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <div className="mb-8">
        <h1 className="text-5xl font-extralight">
          Finance
        </h1>

        <p className="mt-2 text-white/50">
          Finance Operations Center
        </p>
      </div>

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="mt-8 rounded-3xl border border-amber-500/20 bg-white/[0.03] p-8">

        <div className="mb-6">

          <div className="text-xs uppercase tracking-[0.35em] text-amber-400">
            Attention Required
          </div>

        </div>

        <div className="space-y-3">

          {attentionItems.map((item) => (

            <div
              key={item.title}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4"
            >

              <div className="text-white/90">
                ⚠ {item.title}
              </div>

              <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
                {item.count}
              </div>

            </div>

          ))}

        </div>

      </div>

      <div className="mt-8">

        <div className="mb-4 text-xs uppercase tracking-[0.35em] text-white/50">
          Workflow Centers
        </div>

        <div className="grid gap-6 lg:grid-cols-2">

          {workflowCenters.map((center) => (

            <Link
              key={center.title}
              href={center.href}
              className="group rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-amber-500/30 hover:bg-white/[0.05]"
            >

              <div className="text-2xl font-light">
                {center.title}
              </div>

              <div className="mt-4 text-white/50 leading-relaxed">
                {center.description}
              </div>

            </Link>

          ))}

        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="mb-6 text-xs uppercase tracking-[0.35em] text-white/50">
          Operational Metrics
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-white/50">
              Purchase Orders
            </div>
            <div className="mt-2 text-xl font-light">
              {runtime.procureToPay}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-white/50">
              Journal Entries
            </div>
            <div className="mt-2 text-xl font-light">
              {runtime.accounting}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-white/50">
              Tax Reports
            </div>
            <div className="mt-2 text-xl font-light">
              {runtime.tax}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-white/50">
              Accounting Periods
            </div>
            <div className="mt-2 text-xl font-light">
              {runtime.close}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-white/50">
              Finance Readiness
            </div>
            <div className="mt-2 text-xl font-light">
              ACTIVE
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
