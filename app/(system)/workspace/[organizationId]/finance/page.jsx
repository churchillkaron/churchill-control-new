"use client";

import Link from "next/link";

export default function FinancePage({ params }) {
  const { organizationId } = params;

  const sections = [
    {
      title: "Ledger",
      href: `/workspace/${organizationId}/finance/ledger`,
      description: "General ledger and account activity",
    },
    {
      title: "Journal Entries",
      href: `/workspace/${organizationId}/finance/journals`,
      description: "Create, review and post journals",
    },
    {
      title: "Accounts Payable",
      href: `/workspace/${organizationId}/finance/ap`,
      description: "Vendor invoices and payments",
    },
    {
      title: "Accounts Receivable",
      href: `/workspace/${organizationId}/finance/ar`,
      description: "Customer invoices and collections",
    },
    {
      title: "VAT & Tax",
      href: `/workspace/${organizationId}/finance/tax`,
      description: "VAT engine, PP30 and tax controls",
    },
    {
      title: "Filings",
      href: `/workspace/${organizationId}/finance/filings`,
      description: "Draft, review, approve and file",
    },
    {
      title: "Reports",
      href: `/workspace/${organizationId}/finance/reports`,
      description: "Trial balance, P&L, balance sheet",
    },
    {
      title: "Month End Close",
      href: `/workspace/${organizationId}/finance/close`,
      description: "Close and lock accounting periods",
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">
      <h1 className="text-3xl font-light mb-2">
        Finance
      </h1>

      <p className="text-white/50 mb-8">
        Accounting operations workspace
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <Link
            key={section.title}
            href={section.href}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-[#D6A66A]/40 transition"
          >
            <div className="text-lg">
              {section.title}
            </div>

            <div className="text-sm text-white/50 mt-2">
              {section.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
