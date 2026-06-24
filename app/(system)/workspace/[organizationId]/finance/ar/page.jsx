"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function Page({ params }) {

  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      invoices: 0,
      receivables: 0,
      payments: 0,
      overdue: 0,
    });

  useEffect(() => {

    async function loadRuntime() {

      try {

        const res = await fetch(
          "/api/finance/ar/runtime",
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
            invoices:
              json.invoices || 0,
            receivables:
              json.receivables || 0,
            payments:
              json.payments || 0,
            overdue:
              json.overdue || 0,
          });

        }

      } catch (error) {

        console.error(error);

      }

    }

    loadRuntime();

  }, [organizationId]);

  const sections = [
    {
      title: "Customer Invoices",
      count: runtime.invoices,
      href:
        `/workspace/${organizationId}/finance/ar/invoices`,
    },
    {
      title: "Accounts Receivable",
      count: runtime.receivables,
      href:
        `/workspace/${organizationId}/finance/ar/receivables`,
    },
    {
      title: "Customer Payments",
      count: runtime.payments,
      href:
        `/workspace/${organizationId}/finance/ar/payments`,
    },
    {
      title: "Aging",
      count: runtime.overdue,
      href:
        `/workspace/${organizationId}/finance/ar/aging`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <div className="mb-8">
        <h1 className="text-5xl font-extralight">
          Accounts Receivable
        </h1>

        <p className="mt-2 text-white/50">
          Order-to-Cash Control Center
        </p>
      </div>

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="grid gap-4 md:grid-cols-4">

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50">
            Invoices
          </div>
          <div className="mt-2 text-3xl font-light">
            {runtime.invoices}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50">
            Receivables
          </div>
          <div className="mt-2 text-3xl font-light">
            {runtime.receivables}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50">
            Payments
          </div>
          <div className="mt-2 text-3xl font-light">
            {runtime.payments}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50">
            Overdue
          </div>
          <div className="mt-2 text-3xl font-light">
            {runtime.overdue}
          </div>
        </div>

      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">

        {sections.map((section) => (

          <Link
            key={section.title}
            href={section.href}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-[#D6A66A]/30 hover:bg-white/[0.05]"
          >

            <div className="flex items-center justify-between">

              <div className="text-2xl font-light">
                {section.title}
              </div>

              <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
                {section.count}
              </div>

            </div>

          </Link>

        ))}

      </div>

    </div>
  );
}
