"use client";

import FinanceNav from "@/components/finance/FinanceNav";

export default function Page({ params }) {

  const { organizationId } = params;

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light capitalize">
          reports
        </h1>

        <div className="mt-4 text-white/50">
          Connected to finance engine next.
        </div>
      </div>

    </div>
  );
}
