"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ClosePage({
  params,
}) {
  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      accountingPeriods: 0,
      financialPeriods: 0,
      lockExceptions: 0,
      closeReadiness: "READY",
    });

  useEffect(() => {

    async function loadRuntime() {

      try {

        const res = await fetch(
          "/api/finance/close/runtime",
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
      title: "Month End Close",
      count: runtime.accountingPeriods,
      href: `/workspace/${organizationId}/finance/close`,
    },
    {
      title: "Accounting Periods",
      count: runtime.accountingPeriods,
      href: `/workspace/${organizationId}/finance/accounting`,
    },
    {
      title: "Financial Periods",
      count: runtime.financialPeriods,
      href: `/workspace/${organizationId}/finance/reports`,
    },
    {
      title: "Lock Exceptions",
      count: runtime.lockExceptions,
      href: `/workspace/${organizationId}/finance/close`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="mt-8 mb-8">
        <h1 className="text-5xl font-extralight">
          Period Close
        </h1>

        <p className="mt-2 text-white/50">
          Finance Control Center
        </p>
      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-amber-400 mb-6">
          Attention Required
        </div>

        <div className="space-y-3">

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Lock Exceptions
            </span>

            <span>
              {runtime.lockExceptions}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Accounting Periods
            </span>

            <span>
              {runtime.accountingPeriods}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Financial Periods
            </span>

            <span>
              {runtime.financialPeriods}
            </span>
          </div>

        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-white/50 mb-6">
          Close Operations
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
              Accounting Periods
            </div>

            <div className="text-2xl mt-2">
              {runtime.accountingPeriods}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Financial Periods
            </div>

            <div className="text-2xl mt-2">
              {runtime.financialPeriods}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Lock Exceptions
            </div>

            <div className="text-2xl mt-2">
              {runtime.lockExceptions}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Close Readiness
            </div>

            <div className="text-2xl mt-2">
              {runtime.closeReadiness}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
