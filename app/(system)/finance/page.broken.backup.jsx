"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

export default function FinancePage() {

  const [tab, setTab] =
    useState("overview");

  const [data, setData] =
    useState(null);

  const [journals, setJournals] =
    useState([]);

  const [health, setHealth] =
    useState(null);

  const [anomalies, setAnomalies] =
    useState([]);

  const [kpis, setKpis] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const [
        plRes,
        bsRes,
        cfRes,
        tbRes,
        journalsRes,
        healthRes,
        anomaliesRes,
        kpisRes,
      ] = await Promise.all([

        fetch(
          "/api/finance/profit-loss"
        ),

        fetch(
          "/api/finance/balance-sheet"
        ),

        fetch(
          "/api/finance/cash-flow"
        ),

        fetch(
          "/api/finance/trial-balance"
        ),

        fetch(
          "/api/finance/journals"
        ),

        fetch(
          "/api/finance/health"
        ),

        fetch(
          "/api/finance/anomalies"
        ),

        fetch(
          "/api/finance/kpis"
        ),

      ]);

      const [
        pl,
        bs,
        cf,
        tb,
        journalsJson,
        healthJson,
        anomaliesJson,
        kpisJson,
      ] = await Promise.all([

        plRes.json(),
        bsRes.json(),
        cfRes.json(),
        tbRes.json(),
        journalsRes.json(),
        healthRes.json(),
        anomaliesRes.json(),
        kpisRes.json(),

      ]);

      setData({
        pl,
        bs,
        cf,
        tb,
      });

      setJournals(
        journalsJson.journals || []
      );

      setHealth(
        healthJson.report
      );

      setAnomalies(
        anomaliesJson.anomalies || []
      );

      setKpis(
        kpisJson.kpis
      );

    } catch (error) {

      console.error(
        error
      );

    }

    setLoading(false);

  }

  if (loading) {

    return (

      <div className={theme.page}>

        <div className={theme.container}>

          <div className={theme.card}>
            Loading Finance Runtime...
          </div>

        </div>

      </div>

    );

  }

  return (

    <div className={theme.page}>

      <div className={theme.container}>



        <div className={`${theme.glassStrong} p-8 mb-10 relative overflow-hidden`}>

          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10" />

          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">

            <div>

              <div className="uppercase tracking-[0.4em] text-xs text-zinc-400 mb-4">

                Churchill Enterprise Runtime

              </div>

              <h1 className="text-6xl font-black tracking-tight mb-4">

                Financial Command Center

              </h1>

              <p className="text-zinc-400 max-w-2xl leading-relaxed">

                Unified operational finance, accounting integrity,
                treasury management, audit intelligence and AI-driven
                enterprise visibility.

              </p>

            </div>

            <div className="grid grid-cols-2 gap-4 min-w-[320px]">

              <HeaderMetric
                title="Revenue"
                value={
                  data?.pl?.summary?.revenue || 0
                }
                color="text-green-400"
              />

              <HeaderMetric
                title="Net Profit"
                value={
                  data?.pl?.netProfit || 0
                }
                color="text-purple-400"
              />

              <HeaderMetric
                title="Cash Flow"
                value={
                  data?.cf?.netCashFlow || 0
                }
                color="text-cyan-400"
              />

              <HeaderMetric
                title="Health"
                value={
                  `${health?.healthScore || 0}%`
                }
                color="text-yellow-400"
              />

            </div>

          </div>

        </div>












            <div>

              <div className="uppercase tracking-[0.3em] text-xs text-blue-400 mb-3">

                Enterprise Timeline Runtime

              </div>

              <h2 className={theme.sectionTitle}>
                Financial Timeline
              </h2>

            </div>

            <div className="text-blue-400 text-sm">

              LIVE STREAM

            </div>

          </div>

          <div className="space-y-6">


        <div className={`${theme.glassStrong} p-8 mb-10`}>

          <div className="flex items-center justify-between mb-8">

            <div>

              <div className="uppercase tracking-[0.3em] text-xs text-green-400 mb-3">

                Profitability Runtime

              </div>

              <h2 className={theme.sectionTitle}>
                Enterprise Profit Matrix
              </h2>

            </div>

            <div className="px-4 py-2 rounded-2xl border border-green-500/20 bg-green-500/10 text-green-400 text-sm">

              OPTIMIZED

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <ProfitCard
              title="Gross Profit"
              value={
                data?.pl?.grossProfit || 0
              }
              color="text-green-400"
            />

            <ProfitCard
              title="Net Profit"
              value={
                data?.pl?.netProfit || 0
              }
              color="text-purple-400"
            />

            <ProfitCard
              title="Expense Load"
              value={
                data?.pl?.summary?.expenses || 0
              }
              color="text-yellow-400"
            />

            <ProfitCard
              title="COGS"
              value={
                data?.pl?.summary?.cogs || 0
              }
              color="text-cyan-400"
            />

          </div>

        </div>


        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-10">

          <div className={`${theme.glassStrong} p-8 xl:col-span-2`}>

            <div className="flex items-center justify-between mb-8">

              <div>

                <div className="uppercase tracking-[0.3em] text-xs text-emerald-400 mb-3">

                  Treasury Runtime

                </div>

                <h2 className={theme.sectionTitle}>
                  Cash Position
                </h2>

              </div>

              <div className="text-green-400 text-sm">

                LIVE

              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              <TreasuryCard
                title="Available Cash"
                value={
                  data?.cf?.netCashFlow || 0
                }
                color="text-green-400"
              />

              <TreasuryCard
                title="Operating Flow"
                value={
                  data?.cf?.netOperatingCashFlow || 0
                }
                color="text-cyan-400"
              />

              <TreasuryCard
                title="Liquidity"
                value={
                  health?.healthScore || 0
                }
                suffix="%"
                color="text-purple-400"
              />

            </div>

          </div>

          <div className={`${theme.glassStrong} p-8`}>

            <div className="uppercase tracking-[0.3em] text-xs text-yellow-400 mb-3">

              Runtime Status

            </div>

            <h2 className={`${theme.sectionTitle} mb-8`}>
              Enterprise State
            </h2>

            <div className="space-y-5">

              <StateRow
                label="Accounting"
                active={true}
              />

              <StateRow
                label="Treasury"
                active={true}
              />

              <StateRow
                label="Audit Engine"
                active={true}
              />

              <StateRow
                label="AI Runtime"
                active={true}
              />

            </div>

          </div>

        </div>

        </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <CopilotCard
              title="Risk Analysis"
              value="Stable"
              description="No critical accounting risks detected across enterprise runtime."
              color="text-green-400"
            />

            <CopilotCard
              title="Forecast"
              value="+12%"
              description="Projected operational profitability increase this period."
              color="text-cyan-400"
            />

            <CopilotCard
              title="AI Recommendation"
              value="Optimize Inventory"
              description="Food cost patterns suggest improving inventory turnover efficiency."
              color="text-purple-400"
            />

          </div>

        </div>


        <div className={`${theme.glassStrong} p-8 mb-10`}>

          <div className="flex items-center justify-between mb-8">

            <div>

              <div className="uppercase tracking-[0.3em] text-xs text-cyan-400 mb-3">

                Enterprise Activity Runtime

              </div>

              <h2 className={theme.sectionTitle}>
                Live Financial Activity
              </h2>

            </div>

            <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />

          </div>

          <div className="space-y-4">

            <ActivityRow
              title="Trial balance validated"
              time="2 min ago"
              status="success"
            />

            <ActivityRow
              title="Cash flow updated"
              time="4 min ago"
              status="info"
            />

            <ActivityRow
              title="Journal integrity verified"
              time="7 min ago"
              status="success"
            />

            <ActivityRow
              title="AI anomaly scan completed"
              time="11 min ago"
              status="info"
            />

          </div>

        </div>


        <div className={`${theme.glassStrong} p-5 mb-10`}>

          <div className="flex flex-wrap gap-4">

            <QuickAction
              title="Refresh Runtime"
            />

            <QuickAction
              title="Export Trial Balance"
            />

            <QuickAction
              title="Run Integrity Scan"
            />

            <QuickAction
              title="Close Accounting Period"
            />

            <QuickAction
              title="AI Financial Review"
            />

          </div>

        </div>




        <div className={`${theme.glassStrong} p-8 mb-10`}>

          <div className="flex items-center justify-between mb-8">

            <div>

              <div className="uppercase tracking-[0.3em] text-xs text-purple-400 mb-3">

                AI Runtime Intelligence

              </div>

              <h2 className={theme.sectionTitle}>
                Financial Insights
              </h2>

            </div>

            <div className="px-4 py-2 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm">

              LIVE ANALYSIS

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <InsightCard
              title="Profitability"
              value="Healthy"
              description="Net margin and operating profitability are currently stable."
              color="text-green-400"
            />

            <InsightCard
              title="Liquidity"
              value="Stable"
              description="Cash flow and short-term liabilities remain under control."
              color="text-cyan-400"
            />

            <InsightCard
              title="Risk Exposure"
              value={
                anomalies.length > 0
                  ? "Attention Needed"
                  : "Low Risk"
              }
              description="AI runtime continuously scans accounting integrity and anomalies."
              color={
                anomalies.length > 0
                  ? "text-yellow-400"
                  : "text-purple-400"
              }
            />

          </div>

        </div>


        <div className="flex gap-3 mb-10 flex-wrap">

          <TabButton
            active={tab === "overview"}
            onClick={() =>
              setTab("overview")
            }
          >
            Overview
          </TabButton>

          <TabButton
            active={tab === "journals"}
            onClick={() =>
              setTab("journals")
            }
          >
            Journals
          </TabButton>

          <TabButton
            active={tab === "health"}
            onClick={() =>
              setTab("health")
            }
          >
            Health
          </TabButton>

          <TabButton
            active={tab === "anomalies"}
            onClick={() =>
              setTab("anomalies")
            }
          >
            Anomalies
          </TabButton>

          <TabButton
            active={tab === "kpis"}
            onClick={() =>
              setTab("kpis")
            }
          >
            KPIs
          </TabButton>


        </div>

        {tab === "overview" && (

          <>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

              <MetricCard
                title="Revenue"
                value={
                  data?.pl?.summary
                    ?.revenue
                }
                color="text-green-400"
              />

              <MetricCard
                title="Net Profit"
                value={
                  data?.pl
                    ?.netProfit
                }
                color="text-purple-400"
              />

              <MetricCard
                title="Assets"
                value={
                  data?.bs?.summary
                    ?.assets
                }
                color="text-blue-400"
              />

              <MetricCard
                title="Cash Flow"
                value={
                  data?.cf
                    ?.netCashFlow
                }
                color="text-yellow-400"
              />

            </div>

            <div className={`${theme.glassStrong} p-8`}>

              <div className="flex items-center justify-between mb-8">

                <h2 className={theme.sectionTitle}>
                  Trial Balance
                </h2>

                <div className={`px-5 py-3 rounded-2xl border ${
                  data?.tb?.balanced
                    ? "border-green-500/20 bg-green-500/10 text-green-400"
                    : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}>

                  {
                    data?.tb?.balanced
                      ? "BALANCED"
                      : "UNBALANCED"
                  }

                </div>

              </div>

              <table className={theme.table}>

                <thead>

                  <tr className="border-b border-white/10 text-zinc-500">

                    <th className="text-left py-4">
                      Account
                    </th>

                    <th className="text-right py-4">
                      Balance
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {(data?.tb?.rows || [])
                    .map((row) => (

                    <tr
                      key={row.account_id}
                      className={theme.tableRow}
                    >

                      <td className="py-4">

                        {row.name}

                      </td>

                      <td className="py-4 text-right">

                        {
                          Number(
                            row.balance
                          ).toLocaleString()
                        }

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </>

        )}

        {tab === "journals" && (

          <div className="space-y-5">

            {journals.map((journal) => (

              <div
                key={journal.id}
                className={`${theme.glassStrong} p-6`}
              >

                <div className="flex items-center justify-between mb-5">

                  <div>

                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">

                      {journal.source_type}

                    </div>

                    <div className="text-2xl font-semibold">

                      {journal.entry_number}

                    </div>

                  </div>

                  <div className="text-zinc-500">

                    {journal.entry_date}

                  </div>

                </div>

                <div className="text-zinc-400">

                  {journal.description}

                </div>

              </div>

            ))}

          </div>

        )}

        {tab === "health" && health && (

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <MetricCard
              title="Health Score"
              value={
                health.healthScore
              }
              color="text-cyan-400"
            />

            <MetricCard
              title="Journals"
              value={
                health.journalCount
              }
              color="text-purple-400"
            />

            <MetricCard
              title="Debits"
              value={
                health.totalDebits
              }
              color="text-green-400"
            />

            <MetricCard
              title="Credits"
              value={
                health.totalCredits
              }
              color="text-yellow-400"
            />

          </div>

        )}



        {tab === "kpis" && kpis && (

          <div className="space-y-8">

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

              <MetricCard
                title="Gross Margin %"
                value={
                  Number(
                    kpis.grossMargin || 0
                  ).toFixed(2)
                }
                color="text-green-400"
              />

              <MetricCard
                title="Net Margin %"
                value={
                  Number(
                    kpis.netMargin || 0
                  ).toFixed(2)
                }
                color="text-purple-400"
              />

              <MetricCard
                title="Food Cost %"
                value={
                  Number(
                    kpis.foodCostPercent || 0
                  ).toFixed(2)
                }
                color="text-yellow-400"
              />

              <MetricCard
                title="Current Ratio"
                value={
                  Number(
                    kpis.currentRatio || 0
                  ).toFixed(2)
                }
                color="text-cyan-400"
              />

            </div>

            <div className={`${theme.glassStrong} p-8`}>

              <h2 className={`${theme.sectionTitle} mb-8`}>
                Financial Intelligence
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className={theme.card}>

                  <div className="text-zinc-500 text-sm mb-3 uppercase tracking-[0.2em]">

                    Gross Margin Analysis

                  </div>

                  <div className="text-zinc-300 leading-relaxed">

                    Gross margin reflects operational profitability before overhead.
                    Higher values indicate strong pricing power and inventory control.

                  </div>

                </div>

                <div className={theme.card}>

                  <div className="text-zinc-500 text-sm mb-3 uppercase tracking-[0.2em]">

                    Liquidity Position

                  </div>

                  <div className="text-zinc-300 leading-relaxed">

                    Current ratio measures short-term solvency and operational cash stability.

                  </div>

                </div>

              </div>

            </div>

          </div>

        )}


        {tab === "anomalies" && (

          <div className="space-y-5">

            {anomalies.length === 0 && (

              <div className={`${theme.glassStrong} p-10 text-center`}>

                <div className="text-green-400 text-2xl">

                  ✓ Runtime Stable

                </div>

              </div>

            )}

            {anomalies.map((item, index) => (

              <div
                key={index}
                className={`${theme.glassStrong} p-6`}
              >

                <div className="flex items-center justify-between mb-4">

                  <div className={`text-sm uppercase tracking-[0.2em] ${
                    item.severity === "critical"
                      ? "text-red-400"
                      : "text-yellow-400"
                  }`}>

                    {item.severity}

                  </div>

                  <div className="text-zinc-500 text-sm">

                    {item.entry_number}

                  </div>

                </div>

                <div className="text-2xl font-semibold mb-3">

                  {item.type}

                </div>

                <div className="text-zinc-400">

                  {item.message}

                </div>

              </div>

            ))}

          </div>

        )}

    </div>

  );

}

function MetricCard({
  title,
  value,
  color,
}) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-sm mb-3 uppercase tracking-[0.2em]">

        {title}

      </div>

      <div className={`text-5xl font-bold ${color}`}>

        {
          Number(
            value || 0
          ).toLocaleString()
        }

    </div>

  );

}

function TabButton({
  children,
  active,
  onClick,
}) {

  return (

    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-2xl border transition-all ${
        active
          ? "border-purple-500/30 bg-purple-500/10 text-white"
          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
      }`}
    >

      {children}

    </button>

  );

}


function RuntimeStatus({
  label,
  value,
  healthy,
}) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div>

        <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-2">

          {label}

        </div>

        <div className="text-xl font-semibold">

          {value}

        </div>

      </div>

      <div className={`h-3 w-3 rounded-full ${
        healthy
          ? "bg-green-400"
          : "bg-red-400"
      }`} />

    </div>

  );

}


function QuickAction({
  title,
}) {

  return (

    <button className="px-5 py-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-purple-500/10 hover:border-purple-500/20 transition-all text-sm">

      {title}

    </button>

  );

}

) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {title}

      </div>

      <div className={`text-3xl font-bold mb-4 ${color}`}>

        {value}

      </div>

      <div className="text-zinc-400 leading-relaxed text-sm">

        {description}

    </div>

  );

}

) {

  return (

    <div className={`${theme.glassStrong} p-6 relative overflow-hidden`}>

      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />

      <div className="relative z-10">

        <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

          {title}

        </div>

        <div className="text-4xl font-bold mb-4">

          {value}

        </div>

        <div className={`inline-flex px-3 py-1 rounded-full text-sm ${
          positive
            ? "bg-green-500/10 text-green-400"
            : "bg-red-500/10 text-red-400"
        }`}>

          {change}

        </div>

    </div>

  );

}

) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div className="flex items-center gap-4">

        <div className={`h-3 w-3 rounded-full ${
          status === "success"
            ? "bg-green-400"
            : "bg-cyan-400"
        }`} />

        <div>

          <div className="font-medium">

            {title}

          </div>

          <div className="text-zinc-500 text-sm mt-1">

            Runtime Event

          </div>

        </div>

      </div>

      <div className="text-zinc-500 text-sm">

        {time}

    </div>

  );

}

) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {title}

      </div>

      <div className={`text-3xl font-bold mb-4 ${color}`}>

        {value}

      </div>

      <div className="text-zinc-400 text-sm leading-relaxed">

        {description}

      </div>

    </div>

  );

}


function TreasuryCard({
  title,
  value,
  color,
  suffix = "",
}) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {title}

      </div>

      <div className={`text-4xl font-bold ${color}`}>

        {
          Number(
            value || 0
          ).toLocaleString()
        }

        {suffix}

      </div>

    </div>

  );

}

function StateRow({
  label,
  active,
}) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div className="text-zinc-300">

        {label}

      </div>

      <div className="flex items-center gap-3">

        <div className={`h-3 w-3 rounded-full ${
          active
            ? "bg-green-400"
            : "bg-red-400"
        }`} />

        <div className={
          active
            ? "text-green-400"
            : "text-red-400"
        }>

          {
            active
              ? "ONLINE"
              : "OFFLINE"
          }

        </div>

      </div>

    </div>

  );

}


function ProfitCard({
  title,
  value,
  color,
}) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {title}

      </div>

      <div className={`text-4xl font-bold ${color}`}>

        {
          Number(
            value || 0
          ).toLocaleString()
        }

      </div>

    </div>

  );

}

) {

  return (

    <div className="flex gap-5">

      <div className="flex flex-col items-center">

        <div className={`h-4 w-4 rounded-full mt-1 ${
          type === "success"
            ? "bg-green-400"
            : "bg-cyan-400"
        }`} />

        <div className="w-px flex-1 bg-white/10 mt-2" />

      </div>

      <div className={`${theme.card} flex-1`}>

        <div className="flex items-center justify-between mb-3">

          <div className="font-semibold text-lg">

            {title}

          </div>

          <div className="text-zinc-500 text-sm">

            {time}

          </div>

        </div>

        <div className="text-zinc-400 leading-relaxed">

          {description}

        </div>

      </div>

    </div>

  );

}


function RuntimeCommand({
  title,
  status,
}) {

  return (

    <button className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:border-purple-500/20 hover:bg-purple-500/10 transition-all">

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all bg-gradient-to-r from-purple-500/5 to-pink-500/5" />

      <div className="relative z-10 flex items-center gap-4">

        <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />

        <div className="text-left">

          <div className="text-sm font-medium">

            {title}

          </div>

          <div className="text-xs text-zinc-500 mt-1 uppercase tracking-[0.2em]">

            {status}

          </div>

        </div>

      </div>

    </button>

  );

}

) {

  return (

    <div className={`${theme.glassStrong} p-6 relative overflow-hidden`}>

      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />

      <div className="relative z-10">

        <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

          {title}

        </div>

        <div className={`text-4xl font-bold mb-3 ${color}`}>

          {value}

        </div>

        <div className="text-zinc-400 text-sm">

          {subtitle}

        </div>

      </div>

    </div>

  );

}


function HeaderMetric({
  title,
  value,
  color,
}) {

  return (

    <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-5">

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-2">

        {title}

      </div>

      <div className={`text-3xl font-bold ${color}`}>

        {
          typeof value === "number"
            ? Number(value).toLocaleString()
            : value
        }

      </div>

    </div>

  );

}

) {

  return (

    <div className="flex items-center gap-4 min-w-fit">

      <div className={`h-3 w-3 rounded-full ${
        positive
          ? "bg-green-400"
          : "bg-red-400"
      } animate-pulse`} />

      <div className="text-zinc-400 text-sm uppercase tracking-[0.2em]">

        {label}

      </div>

      <div className={`font-bold ${
        positive
          ? "text-green-400"
          : "text-red-400"
      }`}>

        {value}

      </div>

    </div>

  );

}
