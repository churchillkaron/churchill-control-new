"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Brain,
  Building2,
  ChefHat,
  Clock3,
  Cpu,
  DollarSign,
  LineChart,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Workflow,
} from "lucide-react";

import {
  loadExecutiveDashboard,
} from "@/lib/dashboard/runtime/loadExecutiveDashboard";

import {
  useTenant,
} from "@/app/providers/TenantProvider";



function money(value) {

  return `฿${Number(
    value || 0
  ).toLocaleString()}`;

}

function Section({
  title,
  children,
}) {

  return (

    <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8">

      <div className="text-2xl font-light text-white mb-6">
        {title}
      </div>

      {children}

    </div>

  );

}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  danger,
  warning,
}) {

  return (

    <div className={`rounded-[30px] border p-6 backdrop-blur-xl transition-all duration-300 ${
      danger
        ? "border-red-500/20 bg-red-500/5"
        : warning
          ? "border-yellow-500/20 bg-yellow-500/5"
          : "border-white/10 bg-white/[0.03]"
    }`}>

      <div className="flex items-center justify-between mb-5">

        <div className="text-xs uppercase tracking-[0.24em] text-white/40">
          {title}
        </div>

        <div className="text-violet-400">
          {icon}
        </div>

      </div>

      <div className="text-4xl font-light text-white mb-2">
        {value}
      </div>

      <div className="text-sm text-white/40">
        {subtitle}
      </div>

    </div>

  );

}

function RuntimeRow({
  title,
  value,
  subtitle,
  icon,
}) {

  return (

    <div className="rounded-2xl border border-white/10 bg-black/30 p-5">

      <div className="flex items-start justify-between">

        <div>

          <div className="text-sm text-white/40 mb-2">
            {title}
          </div>

          <div className="text-2xl font-medium text-white mb-1">
            {value}
          </div>

          {subtitle && (

            <div className="text-xs text-white/30">
              {subtitle}
            </div>

          )}

        </div>

        <div className="text-violet-400">
          {icon}
        </div>

      </div>

    </div>

  );

}

export default function ExecutiveDashboardPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [
    dashboard,
    setDashboard,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  async function refresh() {

    try {

      setRefreshing(true);

      if (!tenantId) {

        return;

      }

      const data =
        await loadExecutiveDashboard({

          tenantId,

        });

      setDashboard(data);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

      setRefreshing(false);

    }

  }

  useEffect(() => {

    refresh();

    const interval =
      setInterval(
        refresh,
        10000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  const runtimeHealth =
    useMemo(() => {

      const failed =
        (dashboard?.workflowLogs || []).filter(
          log =>
            log.status === "FAILED"
        ).length;

      if (failed >= 5) {

        return "WARNING";

      }

      return "STABLE";

    }, [dashboard]);

  if (loading) {

    return (

      <div className="min-h-screen bg-black text-white flex items-center justify-center text-3xl">

        LOADING AVANTIQO RUNTIME

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}

      <div className="flex items-center justify-between mb-12">

        <div className="flex flex-col">

          <img
            src="/branding/avantiqo-logo.png"
            alt="AVANTIQO"
            className="h-28 w-auto object-contain mb-4"
          />

          <div className="text-white/40 uppercase tracking-[0.25em] text-sm">
            Enterprise Operating System
          </div>

        </div>

        <div className="flex items-center gap-4">

          <button
            onClick={refresh}
            className="flex items-center gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/10 px-5 py-3 hover:bg-violet-500/20 transition-all"
          >

            <RefreshCw
              size={16}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh Runtime

          </button>

          <div className={`rounded-full border px-6 py-3 text-xs uppercase tracking-[0.24em] ${
            runtimeHealth === "STABLE"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}>

            {runtimeHealth}

          </div>

        </div>

      </div>

      {/* EXECUTIVE KPIs */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6 mb-12">

        <MetricCard
          title="Revenue"
          value={
            money(
              dashboard?.financials?.pnl?.revenue
            )
          }
          subtitle="Enterprise Revenue"
          icon={<DollarSign />}
        />

        <MetricCard
          title="Net Profit"
          value={
            money(
              dashboard?.financials?.pnl?.netProfit
            )
          }
          subtitle="Profit After Expenses"
          icon={<Activity />}
          danger={
            Number(
              dashboard?.financials?.pnl?.netProfit || 0
            ) < 0
          }
        />

        <MetricCard
          title="Orders"
          value={
            dashboard?.operationalAnalytics?.total_orders || 0
          }
          subtitle="Orders Processed"
          icon={<ShoppingCart />}
        />

        <MetricCard
          title="Average Order"
          value={
            money(
              dashboard?.operationalAnalytics?.average_order_value
            )
          }
          subtitle="Average Ticket Size"
          icon={<Wallet />}
        />

        <MetricCard
          title="Occupied Tables"
          value={
            dashboard?.operationalAnalytics?.occupied_tables || 0
          }
          subtitle="Restaurant Activity"
          icon={<Utensils />}
        />

        <MetricCard
          title="Waste Cost"
          value={
            money(
              dashboard?.operationalAnalytics?.waste_cost
            )
          }
          subtitle="Production Waste"
          icon={<ShieldAlert />}
          warning={
            Number(
              dashboard?.operationalAnalytics?.waste_cost || 0
            ) > 0
          }
        />

      </div>

      {/* OPERATIONS */}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-12">

        <Section title="Operations Runtime">

          <div className="space-y-4">

            <RuntimeRow
              title="POS Runtime"
              value="CONNECTED"
              subtitle="Sales + Tables + Payments"
              icon={<ShoppingCart size={22} />}
            />

            <RuntimeRow
              title="Kitchen Runtime"
              value={
                dashboard?.kitchen?.kitchenLoad || "LOW"
              }
              subtitle="Kitchen Queue Pressure"
              icon={<ChefHat size={22} />}
            />

            <RuntimeRow
              title="Workflow Events"
              value={
                dashboard?.runtime?.workflowCount || 0
              }
              subtitle="Realtime Runtime Events"
              icon={<Workflow size={22} />}
            />

            <RuntimeRow
              title="Realtime Decisions"
              value={
                dashboard?.runtime?.aiDecisionCount || 0
              }
              subtitle="AI Runtime Decisions"
              icon={<Brain size={22} />}
            />

          </div>

        </Section>

        <Section title="Finance Runtime">

          <div className="space-y-4">

            <RuntimeRow
              title="Gross Profit"
              value={
                money(
                  dashboard?.financials?.pnl?.grossProfit
                )
              }
              subtitle="Gross Enterprise Margin"
              icon={<TrendingUp size={22} />}
            />

            <RuntimeRow
              title="Accounts Payable"
              value={
                money(
                  dashboard?.financials?.totalAccountsPayable
                )
              }
              subtitle="Outstanding Payables"
              icon={<Receipt size={22} />}
            />

            <RuntimeRow
              title="Finance Runtime"
              value="ACTIVE"
              subtitle="Accounting Workflow Engine"
              icon={<Building2 size={22} />}
            />

            <RuntimeRow
              title="Audit Runtime"
              value="ONLINE"
              subtitle="Enterprise Governance"
              icon={<BadgeCheck size={22} />}
            />

          </div>

        </Section>

        <Section title="Payroll & Attendance">

          <div className="space-y-4">

            <RuntimeRow
              title="Attendance Runtime"
              value="96%"
              subtitle="Enterprise Attendance Health"
              icon={<Users size={22} />}
            />

            <RuntimeRow
              title="Late Arrivals"
              value="3"
              subtitle="Realtime Late Tracking"
              icon={<Clock3 size={22} />}
            />

            <RuntimeRow
              title="Payroll Runtime"
              value="ACTIVE"
              subtitle="Monthly Payroll Engine"
              icon={<Wallet size={22} />}
            />

            <RuntimeRow
              title="Service Charge"
              value="5%"
              subtitle="Current Unlock Level"
              icon={<Sparkles size={22} />}
            />

          </div>

        </Section>

        <Section title="Governance & AI">

          <div className="space-y-4">

            <RuntimeRow
              title="Approval Queue"
              value={
                dashboard?.runtime?.approvalCount || 0
              }
              subtitle="Pending Enterprise Approvals"
              icon={<AlertTriangle size={22} />}
            />

            <RuntimeRow
              title="AI Runtime"
              value="CONNECTED"
              subtitle="Enterprise AI Layer"
              icon={<Cpu size={22} />}
            />

            <RuntimeRow
              title="Automation Stability"
              value={runtimeHealth}
              subtitle="Operational Runtime Health"
              icon={<Activity size={22} />}
            />

            <RuntimeRow
              title="Tenant Runtime"
              value={
                String(
                  dashboard?.runtime?.tenantId || ""
                ).slice(0, 8)
              }
              subtitle="Multi-Tenant Runtime"
              icon={<LineChart size={22} />}
            />

          </div>

        </Section>

      </div>

      {/* ENTERPRISE FLOW */}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">

        <Section title="Connected Enterprise Systems">

          <div className="space-y-4">

            <RuntimeRow
              title="POS System"
              value="CONNECTED"
              subtitle="Orders + Payments + Tables"
              icon={<ShoppingCart size={22} />}
            />

            <RuntimeRow
              title="Kitchen System"
              value="CONNECTED"
              subtitle="Queue + Production + Runtime"
              icon={<ChefHat size={22} />}
            />

            <RuntimeRow
              title="Finance System"
              value="CONNECTED"
              subtitle="Accounting + P&L + AP"
              icon={<Receipt size={22} />}
            />

            <RuntimeRow
              title="Payroll System"
              value="CONNECTED"
              subtitle="Attendance + Salaries"
              icon={<Wallet size={22} />}
            />

            <RuntimeRow
              title="Marketing AI"
              value="CONNECTED"
              subtitle="Campaign + AI Runtime"
              icon={<Sparkles size={22} />}
            />

          </div>

        </Section>

        <Section title="Enterprise Runtime Flow">

          <div className="space-y-4">

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">

              <div className="text-violet-400 font-medium mb-2">
                Daily Runtime
              </div>

              <div className="text-white/50 leading-relaxed">
                POS → Kitchen → Production →
                Accounting → Payroll →
                Approval → Analytics
              </div>

            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">

              <div className="text-violet-400 font-medium mb-2">
                Monthly Runtime
              </div>

              <div className="text-white/50 leading-relaxed">
                History → Performance →
                Attendance → Payroll →
                Approval → Accounting →
                Service Charge Unlock
              </div>

            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">

              <div className="text-violet-400 font-medium mb-2">
                AI Runtime
              </div>

              <div className="text-white/50 leading-relaxed">
                Predictions →
                Recommendations →
                Workflow Automation →
                Enterprise Optimization
              </div>

            </div>

          </div>

        </Section>

        <Section title="Enterprise Runtime State">

          <div className="space-y-4">

            <RuntimeRow
              title="Enterprise Runtime"
              value="ONLINE"
              subtitle="Core Runtime Layer"
              icon={<Cpu size={22} />}
            />

            <RuntimeRow
              title="Monitoring"
              value={
                dashboard?.monitoring?.status || "ONLINE"
              }
              subtitle="Realtime Monitoring"
              icon={<BadgeCheck size={22} />}
            />

            <RuntimeRow
              title="Realtime Sync"
              value="ACTIVE"
              subtitle="Runtime Synchronization"
              icon={<RefreshCw size={22} />}
            />

            <RuntimeRow
              title="Owner AI"
              value="CONNECTED"
              subtitle="Enterprise Intelligence"
              icon={<Brain size={22} />}
            />

          </div>

        </Section>

      </div>

      {/* OWNER AI + LIVE FEED */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">

        <Section title="Owner AI Recommendations">

          <div className="space-y-4">

            {(dashboard?.predictions || []).length === 0 && (

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-emerald-400">

                Owner AI reports stable enterprise conditions

              </div>

            )}

            {(dashboard?.predictions || []).map(

              (
                prediction,
                index
              ) => (

                <div
                  key={index}
                  className={`rounded-2xl border p-5 ${
                    prediction.severity === "HIGH"
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-yellow-500/20 bg-yellow-500/5"
                  }`}
                >

                  <div className="flex items-center justify-between mb-3">

                    <div className="font-medium text-white">
                      {prediction.type}
                    </div>

                    <div className={`text-xs uppercase tracking-[0.24em] ${
                      prediction.severity === "HIGH"
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}>

                      {prediction.severity}

                    </div>

                  </div>

                  <div className="text-sm text-white/50 leading-relaxed">
                    {prediction.recommendation}
                  </div>

                </div>

              )

            )}

          </div>

        </Section>

        <Section title="Realtime Activity Feed">

          <div className="space-y-4">

            {(dashboard?.workflowLogs || []).slice(0, 10).map(

              (
                log,
                index
              ) => (

                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >

                  <div className="flex items-center justify-between mb-2">

                    <div className="font-medium text-white">
                      {log.workflow_name || "Workflow"}
                    </div>

                    <div className={`text-xs uppercase tracking-[0.24em] ${
                      log.status === "FAILED"
                        ? "text-red-400"
                        : "text-emerald-400"
                    }`}>

                      {log.status || "OK"}

                    </div>

                  </div>

                  <div className="text-xs text-white/40">
                    {log.created_at || "No timestamp"}
                  </div>

                </div>

              )

            )}

          </div>

        </Section>

      </div>

      {/* EXECUTIVE ANALYTICS */}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        <Section title="Enterprise Analytics">

          <div className="space-y-4">

            <RuntimeRow
              title="FOH Performance"
              value="GOOD"
              subtitle="Revenue + Order Score"
              icon={<BarChart3 size={22} />}
            />

            <RuntimeRow
              title="Kitchen Performance"
              value="GOOD"
              subtitle="Kitchen Runtime Health"
              icon={<ChefHat size={22} />}
            />

            <RuntimeRow
              title="Bar Performance"
              value="GOOD"
              subtitle="Waste + Efficiency"
              icon={<ShieldAlert size={22} />}
            />

          </div>

        </Section>

        <Section title="Executive Intelligence">

          <div className="space-y-4">

            <RuntimeRow
              title="Automation Runtime"
              value="ACTIVE"
              subtitle="Workflow Automation"
              icon={<Workflow size={22} />}
            />

            <RuntimeRow
              title="AI Decisions"
              value={
                dashboard?.runtime?.aiDecisionCount || 0
              }
              subtitle="Realtime Decisions"
              icon={<Brain size={22} />}
            />

            <RuntimeRow
              title="Workflow Stability"
              value={runtimeHealth}
              subtitle="Operational Runtime"
              icon={<Activity size={22} />}
            />

          </div>

        </Section>

        <Section title="Platform Runtime">

          <div className="space-y-4">

            <RuntimeRow
              title="Enterprise Modules"
              value="12"
              subtitle="Connected Systems"
              icon={<Building2 size={22} />}
            />

            <RuntimeRow
              title="Monitoring Runtime"
              value="ONLINE"
              subtitle="Realtime Monitoring"
              icon={<BadgeCheck size={22} />}
            />

            <RuntimeRow
              title="AI Enterprise Layer"
              value="CONNECTED"
              subtitle="Executive Intelligence"
              icon={<Brain size={22} />}
            />

          </div>

        </Section>

      </div>

    </div>

  );

}
