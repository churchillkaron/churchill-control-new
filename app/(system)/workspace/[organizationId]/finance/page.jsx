"use client";

import Link from "next/link";

export default function FinancePage({
  params,
}) {
  const { organizationId } = params;

  const workCenters = [
    {
      title: "Accounting",
      description:
        "Journals, ledger, trial balance and close control.",
      href: `/workspace/${organizationId}/finance/accounting`,
    },
    {
      title: "Accounts Payable",
      description:
        "Vendors, invoices, payments and procure-to-pay.",
      href: `/workspace/${organizationId}/finance/ap`,
    },
    {
      title: "Accounts Receivable",
      description:
        "Customer invoices, payments and aging.",
      href: `/workspace/${organizationId}/finance/ar`,
    },
    {
      title: "Procurement",
      description:
        "Purchase orders, receiving and invoice matching.",
      href: `/workspace/${organizationId}/finance/procure-to-pay`,
    },
    {
      title: "Tax & Compliance",
      description:
        "VAT, filings and statutory reporting.",
      href: `/workspace/${organizationId}/finance/tax`,
    },
    {
      title: "Reports",
      description:
        "Financial statements and management reporting.",
      href: `/workspace/${organizationId}/finance/reports`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] p-8 text-white">

      <div className="mb-10">
        <h1 className="text-5xl font-extralight">
          Finance
        </h1>

        <p className="mt-2 text-white/50">
          Financial Work Centers
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {workCenters.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-[#D6A66A]/40 hover:bg-white/[0.05]"
          >
            <div className="text-2xl font-light">
              {item.title}
            </div>

            <div className="mt-3 text-white/50">
              {item.description}
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
