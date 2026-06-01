"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowUpRight,
  Bot,
  Building2,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Package,
  Users,
} from "lucide-react";

import {
  useOrganization,
} from "@/app/providers/OrganizationProvider";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

import {
  MODULE_GROUPS,
} from "./moduleGroups";

import {
  generateDashboard,
} from "@/lib/platform/dashboard/generateDashboard";

function money(value) {
  return `THB ${Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl transition-all hover:border-violet-400/40 hover:bg-violet-500/10">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/5 opacity-0 transition group-hover:opacity-100" />

      <div className="relative z-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <Icon className="h-5 w-5 text-violet-300" />
          </div>

          <div className="text-xs uppercase tracking-[0.25em] text-white/30">
            Live
          </div>
        </div>

        <div className="text-sm uppercase tracking-[0.22em] text-white/35">
          {label}
        </div>

        <div className="mt-3 text-3xl font-light tracking-tight text-white">
          {value}
        </div>

        <div className="mt-3 text-sm text-white/40">
          {detail}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({
  module,
}) {
  return (
    <Link
      href={`/${module.id}`}
      className="group rounded-[28px] border border-white/10 bg-white/[0.035] p-5 transition-all hover:border-violet-400/40 hover:bg-violet-500/10"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <Building2 className="h-5 w-5 text-violet-300" />
        </div>

        <ArrowUpRight className="h-5 w-5 text-white/25 transition group-hover:text-violet-300" />
      </div>

      <div className="text-lg font-light text-white">
        {module.name}
      </div>

      <div className="mt-2 text-sm text-white/35">
        {module.category || "Workspace module"}
      </div>
    </Link>
  );
}

export default function OrganizationWorkspacePage() {
  const {
    setOrganization,
  } = useOrganization();

  const {
    runtime,
    organization,
    modules,
    dashboards,
    industries,
    loading,
  } = useOrganizationRuntime();

  const [
    command,
    setCommand,
  ] = useState(null);

  const [
    commandLoading,
    setCommandLoading,
  ] = useState(true);

  useEffect(() => {
    if (
      organization &&
      runtime
    ) {
      setOrganization(runtime);
    }
  }, [
    organization?.id,
    runtime,
  ]);

  useEffect(() => {
    async function loadCommandCenter() {
      if (!organization?.tenant_id) {
        return;
      }

      try {
        setCommandLoading(true);

        const response =
          await fetch(
            `/api/workspace/command-center?tenantId=${organization.tenant_id}&organizationId=${organization.id}&organizationType=${organization.organization_type}`
          );

        const data =
          await response.json();

        setCommand(data);
      } catch (error) {
        console.error(
          "workspace command center error",
          error
        );
      } finally {
        setCommandLoading(false);
      }
    }

    loadCommandCenter();
  }, [
    organization?.tenant_id,
  ]);

  const metrics =
    command?.metrics || {};

  const clients =
    command?.clients || [];

  const dashboardWidgets =
    generateDashboard(
      modules.map(
        module => ({
          module_id:
            module.id,
        })
      )
    );

  const isAccounting =
    industries.some(
      item =>
        item?.industry_id ===
        "accounting"
    );

  const isHospitality =
    industries.some(
      item =>
        item?.industry_id ===
        "hospitality"
    );

  const isEntertainment =
    industries.some(
      item =>
        item?.industry_id ===
        "entertainment"
    );

  const isConstruction =
    industries.some(
      item =>
        item?.industry_id ===
        "construction"
    );

  console.log(
    "DASHBOARD WIDGETS",
    dashboardWidgets
  );

  const ownerInsight =
    useMemo(() => {
      if (commandLoading) {
        return "Loading real operating signals from Churchill...";
      }

      if (!command?.success) {
        return "Command center data is not available yet.";
      }

      const alerts = [];

      if (metrics.kitchenQueue > 0) {
        alerts.push(`${metrics.kitchenQueue} kitchen items need attention`);
      }

      if (metrics.lowStockAlerts > 0) {
        alerts.push(`${metrics.lowStockAlerts} inventory items are low`);
      }

      if (metrics.pendingPayables > 0) {
        alerts.push(`${metrics.pendingPayables} payables are still open`);
      }

      if (alerts.length === 0) {
        return "Operations are stable. No critical alerts from live data.";
      }

      return alerts.join(". ") + ".";
    }, [
      commandLoading,
      command,
      metrics,
    ]);

  if (
    loading ||
    !organization
  ) {
    return (
      <main className="min-h-screen bg-[#030712] p-10 text-white">
        Loading organization runtime...
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030712] p-8 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[520px] w-[520px] rounded-full bg-violet-500/10 blur-[150px]" />
        <div className="absolute right-[-10%] top-[10%] h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-[170px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="mb-10 overflow-hidden rounded-[42px] border border-white/10 bg-white/[0.035] p-8 backdrop-blur-3xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-violet-300">
                {organization?.name || "Workspace"} Control Center
              </p>

              <h1 className="mt-4 text-5xl font-light tracking-tight md:text-7xl">
                {organization.name}
              </h1>

              <p className="mt-4 max-w-3xl text-sm text-white/45">
                {isAccounting
                  ? "Manage clients, accounting fees, staff workload, tax deadlines, payroll, documents, approvals and AI accounting workflows."
                  : "Enterprise operating system connected to modules, finance, payroll, operations and owner intelligence."}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-violet-200">
                  {organization.organization_type}
                </span>

                <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/45">
                  {industries.join(", ") || "No industries"}
                </span>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-black/30 p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-white/35">
                {isAccounting
                  ? "Outstanding Fees"
                  : "Service Charge"}
              </p>

              <div className="mt-3 text-4xl font-light text-violet-200">
                {isAccounting
                  ? money(metrics.outstandingFees || 0)
                  : money(metrics.serviceCharge)}
              </div>

              <p className="mt-2 text-sm text-white/35">
                {isAccounting
                  ? "Unpaid accounting fees from clients."
                  : "Calculated from live revenue at 5%."}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">

          {isAccounting ? (

            <>

              <MetricCard
                label="Clients"
                value={metrics.totalClients || 0}
                detail="Active accounting clients"
                icon={Users}
              />

              <MetricCard
                label="Messages"
                value={metrics.newMessages || 0}
                detail="Unread client messages"
                icon={ClipboardList}
              />

              <MetricCard
                label="Client Requests"
                value={metrics.clientRequests || 0}
                detail="Pending client requests"
                icon={ClipboardList}
              />

              <MetricCard
                label="Documents"
                value={metrics.pendingDocuments || 0}
                detail="Awaiting review"
                icon={Building2}
              />

              <MetricCard
                label="Tax Deadlines"
                value={metrics.taxDeadlines || 0}
                detail="Due soon"
                icon={CircleDollarSign}
              />

              <MetricCard
                label="Payroll Due"
                value={metrics.payrollDue || 0}
                detail="Payroll runs pending"
                icon={CircleDollarSign}
              />

              <MetricCard
                label="Compliance Alerts"
                value={metrics.complianceAlerts || 0}
                detail="Requires attention"
                icon={Building2}
              />

              <MetricCard
                label="Active Clients"
                value={metrics.activeClients || 0}
                detail="Currently serviced"
                icon={Users}
              />

            </>

          ) : (

            dashboardWidgets.map(widget => (
              <MetricCard
                key={widget}
                label={widget.replaceAll("_"," ").toUpperCase()}
                value="LIVE"
                detail="Runtime Widget"
                icon={CircleDollarSign}
              />
            ))

          )}

        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[38px] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-3xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3">
                <Bot className="h-6 w-6 text-violet-200" />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-violet-300">
                  Accounting AI
                </p>

                <h2 className="text-2xl font-light">
                  Firm Operations Overview
                </h2>
              </div>
            </div>

            <p className="text-xl font-light leading-relaxed text-white/75">
              {isAccounting
                ? "8 active clients. No tax deadlines due. No payroll runs pending. No compliance risks detected."
                : ownerInsight}
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/30">
                  {isAccounting
                  ? "Fees Collected"
                  : "Monthly Revenue"}
                </p>
                <p className="mt-3 text-2xl font-light">
                  {money(0)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/30">
                  {isAccounting
                  ? "Firm Profit"
                  : "Monthly Profit"}
                </p>
                <p className="mt-3 text-2xl font-light">
                  {money(0)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/30">
                  {isAccounting
                  ? "AI Cost"
                  : "AI Processing Cost"}
                </p>
                <p className="mt-3 text-2xl font-light">
                  {money(0)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[38px] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-3xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3">
                <Package className="h-6 w-6 text-cyan-200" />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                  Firm Alerts
                </p>

                <h2 className="text-2xl font-light">
                  Accounting Operations
                </h2>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">
                  Client Messages
                </p>
                <p className="mt-2 text-3xl font-light">
                  {metrics.newMessages || 0}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">
                  Client Requests
                </p>
                <p className="mt-2 text-3xl font-light">
                  {metrics.clientRequests || 0}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-violet-300" />

              <h2 className="text-xl font-light">
                Client Portfolio
              </h2>
            </div>

            <p className="text-sm text-white/35">
              Manage accounting clients
            </p>
          </div>

          <div className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">

            <div className="mb-6 flex items-center justify-between">

              <h3 className="text-2xl font-light text-white">
                Clients
              </h3>

              <Link
                href={`/accounting/clients/create?accountingFirmId=${organization?.id}&tenantId=${organization?.tenant_id}`}
                className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-200"
              >
                + Add Client
              </Link>

            </div>

            <div className="space-y-3">

              <div className="grid grid-cols-[2fr_140px_120px_80px_80px_120px_60px] gap-4 px-5 py-3 text-xs uppercase tracking-[0.2em] text-white/30">

                <div>Client</div>
                <div>Accountant</div>
                <div>Fee</div>
                <div>Tasks</div>
                <div>Docs</div>
                <div>Health</div>
                <div></div>

              </div>

              {clients.map(client => (

                <Link
                  key={client.id}
                  href={`/workspace/${client.id}`}
                  className="grid grid-cols-[2fr_140px_120px_80px_80px_120px_60px] items-center gap-4 rounded-2xl border border-white/5 bg-black/25 px-5 py-4 transition-all hover:border-violet-400/40 hover:bg-violet-500/10"
                >

                  <div>

                    <div className="text-base font-light text-white">
                      {client.name}
                    </div>

                    <div className="mt-1 text-xs text-white/35">
                      {client.organization_type}
                    </div>

                  </div>

                  <div className="text-white/70 text-sm">
                    Unassigned
                  </div>

                  <div className="text-green-400 text-sm">
                    Paid
                  </div>

                  <div className="text-white/70 text-sm">
                    0
                  </div>

                  <div className="text-white/70 text-sm">
                    0
                  </div>

                  <div className="text-green-400 text-sm">
                    Healthy
                  </div>

                  <ArrowUpRight className="h-4 w-4 text-white/25 transition group-hover:text-violet-300" />

                </Link>

              ))}

            </div>

          </div>
        </section>
      </div>
    </main>
  );
}
