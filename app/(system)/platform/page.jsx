import Link from "next/link";
import {
  Building2,
  Users,
  Boxes,
  Receipt,
  Brain,
} from "lucide-react";

import {
  loadPlatformRuntime,
} from "@/lib/platform/runtime/loadPlatformRuntime";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {

  const runtime =
    await loadPlatformRuntime();

  const data = {

    organizations:
      runtime.organizations.total,

    users:
      runtime.users.total,

    staff:
      runtime.users.staff,

    activeModules:
      runtime.modules.total,

    openInvoices:
      runtime.invoices.outstanding,

    outstandingValue: 0,

  };

  const cards = [
    {
      label: "Organizations",
      value: data.organizations,
      icon: Building2,
    },
    {
      label: "Users",
      value: data.users,
      icon: Users,
    },
    {
      label: "Staff",
      value: data.staff,
      icon: Users,
    },
    {
      label: "Active Modules",
      value: data.activeModules,
      icon: Boxes,
    },
    {
      label: "Open Invoices",
      value: data.openInvoices,
      icon: Receipt,
    },
    {
      label: "Outstanding",
      value: `$${Number(
        data.outstandingValue || 0
      ).toLocaleString()}`,
      icon: Receipt,
    },
  ];

  return (
    <main className="min-h-screen bg-[#030712] p-10 text-white">

      <div className="mx-auto max-w-7xl">

        <section className="mb-10 rounded-[38px] border border-white/10 bg-white/[0.04] p-10 backdrop-blur-2xl">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-xs uppercase tracking-[0.35em] text-violet-400">
                Platform Runtime
              </div>

              <h1 className="mt-4 text-6xl font-light">
                Avantiqo Command Center
              </h1>

              <p className="mt-4 max-w-3xl text-white/45">
                Portfolio oversight, organizations,
                subscriptions, adoption and financial health.
              </p>

            </div>

            <div className="rounded-[30px] border border-violet-500/20 bg-violet-500/[0.08] p-6">

              <Brain className="mb-3 h-8 w-8 text-violet-300" />

              <div className="text-sm text-white/60">
                Portfolio AI
              </div>

              <div className="mt-2 max-w-xs text-sm text-white">
                {data.organizations} organizations,
                {` ${data.users}`} users and
                {` ${data.activeModules}`} active modules
                across the platform.
              </div>

            </div>

          </div>

        </section>

        <section className="mb-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">

          {cards.map((card) => {

            const Icon =
              card.icon;

            return (

              <div
                key={card.label}
                className="rounded-[30px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl"
              >

                <div className="mb-6 flex items-center justify-between">

                  <Icon className="h-6 w-6 text-violet-300" />

                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    KPI
                  </div>

                </div>

                <div className="text-4xl font-light">
                  {card.value}
                </div>

                <div className="mt-2 text-sm text-white/45">
                  {card.label}
                </div>

              </div>

            );

          })}

        </section>


        <section className="mb-10 rounded-[38px] border border-violet-500/20 bg-violet-500/[0.04] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
              Organizations
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Portfolio Organizations
            </h2>

          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

            {runtime.portfolioOrganizations.map(org => (

              <div
                key={org.id}
                className="rounded-[28px] border border-white/10 bg-black/20 p-6"
              >

                <div className="text-lg">
                  {org.name}
                </div>

                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-white/35">
                  {org.type}
                </div>

                <Link
                  href={`/workspace/${org.id}`}
                  className="mt-5 inline-flex rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-violet-300"
                >
                  Open Workspace
                </Link>

              </div>

            ))}

          </div>

        </section>


        <section className="mb-10 rounded-[38px] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">

          <div className="mb-8 flex items-center justify-between">

            <div>

              <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
                Portfolio
              </div>

              <h2 className="mt-3 text-3xl font-light">
                Portfolio Overview
              </h2>

            </div>

          </div>

          <div className="grid gap-6 lg:grid-cols-2">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-4 text-sm text-white/45">
                Organizations
              </div>

              <div className="space-y-3">

                <div className="flex justify-between">
                  <span className="text-white/60">Active</span>
                  <span>{runtime.portfolio.activeOrganizations}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/60">Inactive</span>
                  <span>{runtime.portfolio.inactiveOrganizations}</span>
                </div>

              </div>

            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-4 text-sm text-white/45">
                Module Adoption
              </div>

              <div className="space-y-4">

                {runtime.moduleAdoption.map(
                  (item) => (

                    <div
                      key={item.module}
                    >

                      <div className="mb-1 flex justify-between text-sm">

                        <span className="text-white/70">
                          {item.module}
                        </span>

                        <span>
                          {item.count}
                        </span>

                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-white/5">

                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{
                            width: `${item.count * 20}%`
                          }}
                        />

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          </div>

        </section>


        <section className="mb-10 rounded-[38px] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
              Organization Structure
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Enterprise Hierarchy
            </h2>

          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-white/45 text-sm">
                Enterprise Groups
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.organizationInsights.enterpriseGroups}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-white/45 text-sm">
                Accounting Firms
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.organizationInsights.accountingFirms}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-white/45 text-sm">
                Direct Businesses
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.organizationInsights.directBusinesses}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-white/45 text-sm">
                Client Companies
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.organizationInsights.clientCompanies}
              </div>
            </div>

          </div>

        </section>


        <section className="mb-10 rounded-[38px] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
              Governance
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Organization Governance
            </h2>

          </div>

          <div className="space-y-3">

            {runtime.organizationTree
              .filter(org => !org.parent)
              .map(org => {

                const children =
                  runtime.organizationTree.filter(
                    child =>
                      child.parent === org.id
                  );

                return (

                  <div
                    key={org.id}
                    className="rounded-[28px] border border-white/10 bg-black/20 p-6"
                  >

                    <div className="text-base">
                      {org.name}
                    </div>

                    <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/35">
                      {org.type}
                    </div>

                    {children.length > 0 && (

                      <div className="mt-5 space-y-2 border-l border-white/10 pl-5">

                        {children.map(child => (

                          <div
                            key={child.id}
                            className="flex items-center gap-3 text-white/70"
                          >
                            <span>└</span>
                            <span>{child.name}</span>
                          </div>

                        ))}

                      </div>

                    )}

                  </div>

                );

              })}

          </div>

        </section>



        <section className="mb-10 rounded-[38px] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
              Platform Intelligence
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Organization Maturity
            </h2>

            <p className="mt-2 text-sm text-white/40">
              Average modules per organization:
              {" "}
              {runtime.platformAverageModules.toFixed(1)}
            </p>

          </div>

          <div className="grid gap-6 xl:grid-cols-2">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-5 text-sm text-white/45">
                Most Mature Organizations
              </div>

              <div className="space-y-3">

                {runtime.organizationMaturity
                  .slice(0, 5)
                  .map((org) => (

                    <div
                      key={org.id}
                      className="flex items-center justify-between"
                    >

                      <div>

                        <div className="text-white">
                          {org.name}
                        </div>

                        <div className="text-xs text-white/35">
                          {org.type}
                        </div>

                      </div>

                      <div className="text-violet-300">
                        {org.modules}
                      </div>

                    </div>

                  ))}

              </div>

            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-5 text-sm text-white/45">
                Expansion Opportunities
              </div>

              <div className="space-y-3">

                {runtime.expansionOpportunities
                  .slice(0, 5)
                  .map((org) => (

                    <div
                      key={org.id}
                      className="flex items-center justify-between"
                    >

                      <span>
                        {org.name}
                      </span>

                      <span className="text-amber-300">
                        {org.modules}
                      </span>

                    </div>

                  ))}

              </div>

            </div>

          </div>

        </section>



        <section className="mb-10 rounded-[38px] border border-violet-500/20 bg-violet-500/[0.04] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-violet-400">
              Platform AI
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Executive Intelligence
            </h2>

          </div>

          <div className="space-y-4">

            {runtime.platformInsights.map(
              (insight, index) => (

                <div
                  key={index}
                  className="rounded-[24px] border border-white/10 bg-black/20 p-5"
                >

                  <div className="text-sm uppercase tracking-[0.2em] text-violet-300">
                    {insight.severity}
                  </div>

                  <div className="mt-2 text-lg">
                    {insight.title}
                  </div>

                  <div className="mt-2 text-sm text-white/50">
                    {insight.message}
                  </div>

                </div>

              )
            )}

          </div>

        </section>



        



        <section className="mb-10 rounded-[38px] border border-emerald-500/20 bg-emerald-500/[0.04] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">
              Portfolio Health
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Platform Adoption
            </h2>

          </div>

          <div className="grid gap-6 md:grid-cols-3">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Active Organizations
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.portfolioHealth.organizationsWithModules}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Needs Activation
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.portfolioHealth.organizationsWithoutModules}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Adoption Rate
              </div>
              <div className="mt-3 text-4xl font-light">
                {runtime.portfolioHealth.adoptionRate.toFixed(1)}%
              </div>
            </div>

          </div>

        </section>



        



        <section className="mb-10 rounded-[38px] border border-amber-500/20 bg-amber-500/[0.04] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-amber-400">
              Onboarding Governance
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Organization Activation
            </h2>

          </div>

          <div className="grid gap-6 md:grid-cols-4">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Completion Rate
              </div>
              <div className="mt-3 text-5xl font-light">
                {runtime.onboarding.rate.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Complete
              </div>
              <div className="mt-3 text-5xl font-light text-emerald-300">
                {runtime.onboarding.complete}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                No Users
              </div>
              <div className="mt-3 text-5xl font-light text-amber-300">
                {runtime.onboarding.noUsers}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="text-sm text-white/45">
                Not Activated
              </div>
              <div className="mt-3 text-5xl font-light text-red-300">
                {runtime.onboarding.notActivated}
              </div>
            </div>

          </div>

        </section>



        



        <section className="mb-10 rounded-[38px] border border-red-500/20 bg-red-500/[0.04] p-8 backdrop-blur-2xl">

          <div className="mb-8">

            <div className="text-xs uppercase tracking-[0.3em] text-red-400">
              Action Queue
            </div>

            <h2 className="mt-3 text-3xl font-light">
              Required Actions
            </h2>

          </div>

          <div className="grid gap-6 xl:grid-cols-2">

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-5 text-lg">
                Needs User Assignment
              </div>

              <div className="space-y-3">

                {runtime.actionQueue.needsUsers.map(org => (

                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3"
                  >

                    <div>

                      <div>
                        {org.name}
                      </div>

                      <div className="text-xs text-white/35">
                        {org.modules} modules
                      </div>

                    </div>

                    <Link
                      href={`/workspace/${org.id}`}
                      className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-300 hover:bg-amber-500/20"
                    >
                      Open
                    </Link>

                  </div>

                ))}

              </div>

            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">

              <div className="mb-5 text-lg">
                Needs Activation
              </div>

              <div className="space-y-3">

                {runtime.actionQueue.needsActivation.map(org => (

                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3"
                  >

                    <div>

                      <div>
                        {org.name}
                      </div>

                      <div className="text-xs text-white/35">
                        Activation required
                      </div>

                    </div>

                    <Link
                      href={`/workspace/${org.id}`}
                      className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-red-300 hover:bg-red-500/20"
                    >
                      Open
                    </Link>

                  </div>

                ))}

              </div>

            </div>

          </div>

        </section>


      </div>

    </main>
  );

}
