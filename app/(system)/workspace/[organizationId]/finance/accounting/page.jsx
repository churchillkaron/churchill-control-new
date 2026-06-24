"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function AccountingPage({
  params,
}) {
  const { organizationId } = params;

  const [runtime, setRuntime] =
    useState({
      journals: 0,
      journalLines: 0,
      accounts: 0,
      reviewQueue: 0,
      trialBalanceIssues: 0,
      reconciliationExceptions: 0,
    });

  useEffect(() => {

    async function loadRuntime() {

      try {

        const res = await fetch(
          "/api/finance/accounting/runtime",
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
      title: "Journals",
      count: runtime.journals,
      href: `/workspace/${organizationId}/finance/journals`,
    },
    {
      title: "General Ledger",
      count: runtime.journalLines,
      href: `/workspace/${organizationId}/finance/ledger`,
    },
    {
      title: "Trial Balance",
      count: runtime.accounts,
      href: `/workspace/${organizationId}/finance/trial-balance`,
    },
    {
      title: "Chart of Accounts",
      count: runtime.accounts,
      href: `/workspace/${organizationId}/finance/accounts`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="mt-8 mb-8">
        <h1 className="text-5xl font-extralight">
          Accounting
        </h1>

        <p className="mt-2 text-white/50">
          Accounting operations and controls
        </p>
      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-amber-400 mb-6">
          Attention Required
        </div>

        <div className="space-y-3">

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Journal Entries Awaiting Review
            </span>

            <span>
              {runtime.reviewQueue}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Trial Balance Validation
            </span>

            <span>
              {runtime.trialBalanceIssues}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <span>
              Reconciliation Exceptions
            </span>

            <span>
              {runtime.reconciliationExceptions}
            </span>
          </div>

        </div>

      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="text-xs uppercase tracking-[0.35em] text-white/50 mb-6">
          Accounting Work Centers
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
              Journal Entries
            </div>
            <div className="text-2xl mt-2">
              {runtime.journals}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Journal Lines
            </div>
            <div className="text-2xl mt-2">
              {runtime.journalLines}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Accounts
            </div>
            <div className="text-2xl mt-2">
              {runtime.accounts}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-5">
            <div className="text-white/50 text-sm">
              Review Queue
            </div>
            <div className="text-2xl mt-2">
              {runtime.reviewQueue}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
