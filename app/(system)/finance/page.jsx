"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

import JournalDetailsModal
from "./components/JournalDetailsModal";

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

  const [
    selectedJournal,
    setSelectedJournal,
  ] = useState(null);

  const [
    journalLines,
    setJournalLines,
  ] = useState([]);

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

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

        fetch("/api/finance/profit-loss"),
        fetch("/api/finance/balance-sheet"),
        fetch("/api/finance/cash-flow"),
        fetch("/api/finance/trial-balance"),
        fetch("/api/finance/journals"),
        fetch("/api/finance/health"),
        fetch("/api/finance/anomalies"),
        fetch("/api/finance/kpis"),

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

      console.error(error);

    }

    setLoading(false);

  }


  async function openJournal(
    journalId
  ) {

    try {

      const res =
        await fetch(

          `/api/finance/journals/${journalId}`

        );

      const json =
        await res.json();

      if (!json.success) {

        console.error(json);

        return;

      }

      setSelectedJournal(
        json.journal
      );

      setJournalLines(
        json.lines || []
      );

      setModalOpen(true);

    } catch (error) {

      console.error(error);

    }

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

                Churchill Enterprise Finance

              </div>

              <h1 className="text-5xl font-black tracking-tight mb-4">

                Financial Command Center

              </h1>

              <p className="text-zinc-400 max-w-2xl leading-relaxed">

                Real-time accounting, treasury,
                journals, cash flow, profitability
                and enterprise financial governance.

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
                value={`${health?.healthScore || 0}%`}
                color="text-yellow-400"
              />

            </div>

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
                  data?.pl?.summary?.revenue
                }
                color="text-green-400"
              />

              <MetricCard
                title="Net Profit"
                value={
                  data?.pl?.netProfit
                }
                color="text-purple-400"
              />

              <MetricCard
                title="Assets"
                value={
                  data?.bs?.summary?.assets
                }
                color="text-cyan-400"
              />

              <MetricCard
                title="Cash Flow"
                value={
                  data?.cf?.netCashFlow
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

              <button
                key={journal.id}
                onClick={() =>
                  openJournal(
                    journal.id
                  )
                }
                className={`${theme.glassStrong} p-6 w-full text-left hover:border-purple-500/20 transition-all`}
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

                  <div className="flex items-center gap-3">

                    {

                      journal.reversed && (

                        <div className="px-3 py-1 rounded-full border border-red-500/20 bg-red-500/10 text-red-400 text-xs uppercase tracking-[0.2em]">

                          Reversed

                        </div>

                      )

                    }

                    <div className="text-zinc-500">

                      {journal.entry_date}

                    </div>

                  </div>

                </div>

                <div className="text-zinc-400">

                  {journal.description}

                </div>

              </button>

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


        <JournalDetailsModal
          open={modalOpen}
          onClose={() => {

            setModalOpen(false);

            setSelectedJournal(null);

            setJournalLines([]);

          }}
          journal={selectedJournal}
          lines={journalLines}
        />

      </div>

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
