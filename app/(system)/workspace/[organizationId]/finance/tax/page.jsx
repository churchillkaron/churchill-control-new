"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function TaxPage({
  params,
}) {
  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      reports: 0,
      pendingFiling: 0,
      reportsAwaitingReview: 0,
      taxPayable: 0,
      outputTax: 0,
      inputTax: 0,
    });

  useEffect(() => {

    async function loadRuntime() {

      try {

        const res = await fetch(
          "/api/finance/tax/runtime",
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
          setRuntime(json);
        }

      } catch (error) {
        console.error(error);
      }

    }

    loadRuntime();

  }, [organizationId]);

  const workCenters = [
    {
      title: "Tax Reports",
      count: runtime.reports,
      href: `/workspace/${organizationId}/finance/reports`,
    },
    {
      title: "Filings",
      count: runtime.pendingFiling,
      href: `/workspace/${organizationId}/finance/filings`,
    },
    {
      title: "Tax Rules",
      count: 0,
      href: `/workspace/${organizationId}/finance/tax/rules`,
    },
    {
      title: "Tax Regimes",
      count: 0,
      href: `/workspace/${organizationId}/finance/tax/regimes`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="mt-8 mb-8">

        <h1 className="text-5xl font-extralight">
          Tax
        </h1>

        <p className="mt-2 text-white/50">
          Tax management and compliance
        </p>

      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-amber-400 mb-6">
          Attention Required
        </div>

        <div className="space-y-3">

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Reports Pending Filing
            </span>

            <span>
              {runtime.pendingFiling}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Reports Awaiting Review
            </span>

            <span>
              {runtime.reportsAwaitingReview}
            </span>
          </div>

        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-white/50 mb-6">
          Tax Work Centers
        </div>

        <div className="grid gap-4 lg:grid-cols-2">

          {workCenters.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-amber-500/30"
            >
              <div>
                {item.title}
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
          Operational Metrics
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Reports
            </div>
            <div className="text-2xl mt-2">
              {runtime.reports}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Tax Payable
            </div>
            <div className="text-2xl mt-2">
              {runtime.taxPayable}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Output Tax
            </div>
            <div className="text-2xl mt-2">
              {runtime.outputTax}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Input Tax
            </div>
            <div className="text-2xl mt-2">
              {runtime.inputTax}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
