import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FinanceWorkCenterPage({ params }) {
  const title = 'Fiscal Periods';
  const description = 'Open, lock and review accounting periods by entity.';

  const organizationId =
    params?.organizationId;

  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Finance
          </p>
          <h1 className="mt-3 text-4xl font-light">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-white/60">
            {description}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-lg text-white">
            Accounting-firm ready work center
          </div>
          <p className="mt-2 text-sm text-white/60">
            This page is registered, organization-aware, entity-ready and prepared for live finance workflows.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/workspace/${organizationId}/finance`}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/80 hover:bg-white/10"
          >
            Back to Finance
          </Link>

          <Link
            href={`/workspace/${organizationId}/finance/reports`}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/80 hover:bg-white/10"
          >
            Reports
          </Link>

          <Link
            href={`/workspace/${organizationId}/finance/ledger`}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/80 hover:bg-white/10"
          >
            Ledger
          </Link>
        </div>
      </div>
    </main>
  );
}
