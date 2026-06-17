"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function serviceEnabled(value) {
  return value
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
    : "border-white/10 bg-white/[0.04] text-white/35";
}

export default function AccountingWorkspacePage() {
  const { organization } =
    useOrganization();

  const [loading, setLoading] =
    useState(true);

  const [operations, setOperations] =
    useState(null);

  const [clients, setClients] =
    useState([]);

  const [workQueue, setWorkQueue] =
    useState([]);

  const organizationId =
    organization?.id;

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    async function load() {
      try {
        const res =
          await fetch(
            `/api/accounting/operations?organizationId=${organizationId}`
          );

        const json =
          await res.json();

        if (!json.success) {
          throw new Error(json.error);
        }

        setOperations(json.operations || null);
        setClients(json.clients || []);
        setWorkQueue(json.workQueue || []);
      } catch (error) {
        console.error(
          "ACCOUNTING OPERATIONS LOAD ERROR",
          error
        );
      }

      setLoading(false);
    }

    load();
  }, [organizationId]);

  const urgentClients =
    useMemo(() => {
      return clients.filter(
        client =>
          !client?.profile?.assigned_accountant_id ||
          !client?.profile?.assigned_reviewer_id
      );
    }, [clients]);

  const modules = [
    {
      title: "Clients",
      href: "clients",
      text: "Client companies, profiles, assignments and engagements.",
    },
    {
      title: "Documents",
      href: "documents",
      text: "Receipts, invoices, uploads, intake and missing files.",
    },
    {
      title: "Bookkeeping",
      href: "bookkeeping",
      text: "Monthly books, transaction review and client processing.",
    },
    {
      title: "Tax",
      href: "tax",
      text: "VAT, WHT, filings, deadlines and tax review.",
    },
    {
      title: "Payroll",
      href: "payroll",
      text: "Payroll clients, runs, approvals and filing status.",
    },
    {
      title: "Approvals",
      href: "approvals",
      text: "Client approvals, payroll approvals and review queue.",
    },
    {
      title: "Compliance",
      href: "compliance",
      text: "Client health, missing setup and accounting controls.",
    },
    {
      title: "Reports",
      href: "reports",
      text: "Client financial reports and management packs.",
    },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-[#030712] p-8 text-white">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8">
          Loading Accounting Operations Center...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#030712] p-6 text-white md:p-8">
      <section className="relative mb-8 overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_32%),linear-gradient(135deg,rgba(4,18,16,0.98),rgba(3,7,18,0.99))] p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),transparent_28%,transparent_70%,rgba(255,255,255,0.035))]" />

        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-emerald-300/75">
              Accounting Firm Workspace
            </p>

            <h1 className="mt-4 max-w-5xl text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
              Operations Center
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
              The daily control room for client work, filing obligations,
              bookkeeping progress, payroll runs, approvals and accounting team workload.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-white/35">
              Firm
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              {organization?.name || "Accounting Firm"}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">
            Clients
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
            {operations?.totalClients || 0}
          </p>
          <p className="mt-3 text-sm text-white/45">
            Active accounting relationships.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">
            Monthly Fees
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
            {money(operations?.monthlyRevenue)}
          </p>
          <p className="mt-3 text-sm text-white/45">
            Recurring firm revenue.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">
            VAT / Tax
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
            {operations?.taxDeadlines || 0}
          </p>
          <p className="mt-3 text-sm text-white/45">
            Clients requiring tax work.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">
            Payroll
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
            {operations?.payrollRuns || 0}
          </p>
          <p className="mt-3 text-sm text-white/45">
            Payroll clients this cycle.
          </p>
        </div>

        <div className="rounded-[28px] border border-amber-300/20 bg-amber-300/[0.06] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-200/70">
            Action Needed
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
            {operations?.complianceAlerts || 0}
          </p>
          <p className="mt-3 text-sm text-amber-100/55">
            Assignment or setup issues.
          </p>
        </div>
      </section>

      <section className="mb-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/70">
                Client Portfolio
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                Firm Client Workload
              </h2>
            </div>

            <Link
              href="/accounting/clients/create"
              className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-5 py-2.5 text-sm text-emerald-100 transition hover:bg-emerald-300/20"
            >
              Add Client
            </Link>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/[0.045] text-xs uppercase tracking-[0.18em] text-white/35">
                <tr>
                  <th className="px-4 py-4">Client</th>
                  <th className="px-4 py-4">Accountant</th>
                  <th className="px-4 py-4">Reviewer</th>
                  <th className="px-4 py-4">Services</th>
                  <th className="px-4 py-4 text-right">Fee</th>
                </tr>
              </thead>

              <tbody>
                {clients.map(client => (
                  <tr
                    key={client.id}
                    className="border-t border-white/10 text-white/68"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-white">
                        {client.name}
                      </div>
                      <div className="mt-1 text-xs text-white/35">
                        {client.legal_name ||
                          client.industry ||
                          "Client organization"}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      {client?.profile?.assigned_accountant_name || (
                        <span className="text-amber-200">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {client?.profile?.assigned_reviewer_name || (
                        <span className="text-amber-200">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${serviceEnabled(client?.engagement?.bookkeeping_enabled)}`}>
                          Books
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${serviceEnabled(client?.engagement?.vat_enabled || client?.engagement?.tax_enabled)}`}>
                          Tax
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${serviceEnabled(client?.engagement?.payroll_enabled)}`}>
                          Payroll
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-white">
                      {money(client?.engagement?.monthly_fee)}
                    </td>
                  </tr>
                ))}

                {!clients.length && (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-4 py-10 text-center text-white/40"
                    >
                      No accounting clients connected yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">
              Today&apos;s Work
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
              Action Queue
            </h2>

            <div className="mt-6 space-y-3">
              {workQueue.map(item => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/70">
                      {item.title}
                    </span>
                    <span className="text-xl font-semibold text-white">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
              Team Workload
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
              Assigned Clients
            </h2>

            <div className="mt-6 space-y-3">
              {(operations?.team || []).map(member => (
                <div
                  key={member.name}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">
                        {member.name}
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        Tax {member.tax} · Payroll {member.payroll}
                      </p>
                    </div>

                    <p className="text-2xl font-semibold">
                      {member.clients}
                    </p>
                  </div>
                </div>
              ))}

              {!(operations?.team || []).length && (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-white/45">
                  No team assignments yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map(module => (
          <Link
            key={module.href}
            href={`/workspace/${organizationId}/accounting/${module.href}`}
            className="group rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-xl transition hover:border-emerald-300/30 hover:bg-white/[0.06]"
          >
            <p className="text-xl font-semibold tracking-[-0.035em]">
              {module.title}
            </p>
            <p className="mt-3 text-sm leading-6 text-white/45">
              {module.text}
            </p>
            <p className="mt-5 text-sm text-emerald-200/70 group-hover:text-emerald-100">
              Open →
            </p>
          </Link>
        ))}
      </section>

      {urgentClients.length > 0 && (
        <section className="rounded-[34px] border border-amber-300/20 bg-amber-300/[0.06] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">
            Setup Required
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
            Clients Missing Assignments
          </h2>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {urgentClients.map(client => (
              <div
                key={client.id}
                className="rounded-2xl border border-amber-300/15 bg-black/20 p-4"
              >
                <p className="font-medium">
                  {client.name}
                </p>
                <p className="mt-1 text-sm text-amber-100/55">
                  Assign accountant and reviewer.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
