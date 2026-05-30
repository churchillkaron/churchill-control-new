"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

export default function FinanceHealthPage() {

  const [report, setReport] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const res =
        await fetch(
          "/api/finance/health"
        );

      const json =
        await res.json();

      setReport(
        json.report
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
            Loading Financial Health Runtime...
          </div>

        </div>

      </div>

    );

  }

  const score =
    report?.healthScore || 0;

  const healthy =
    score >= 90;

  return (

    <div className={theme.page}>

      <div className={theme.container}>

        <div className="mb-10">

          <div className="uppercase tracking-[0.3em] text-xs text-cyan-400 mb-4">

            Enterprise Financial Integrity

          </div>

          <h1 className={theme.title}>
            Financial Health Runtime
          </h1>

          <p className={`${theme.subtitle} mt-3`}>

            Live accounting integrity,
            governance and audit health.

          </p>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

          <HealthCard
            title="Health Score"
            value={score}
            color={
              healthy
                ? "text-green-400"
                : "text-red-400"
            }
          />

          <HealthCard
            title="Journal Count"
            value={
              report?.journalCount
            }
            color="text-purple-400"
          />

          <HealthCard
            title="Debits"
            value={
              report?.totalDebits
            }
            color="text-blue-400"
          />

          <HealthCard
            title="Credits"
            value={
              report?.totalCredits
            }
            color="text-yellow-400"
          />

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

          <div className={`${theme.glassStrong} p-8`}>

            <div className="flex items-center justify-between mb-8">

              <h2 className={theme.sectionTitle}>
                Integrity Status
              </h2>

              <div className={`px-5 py-3 rounded-2xl border ${
                healthy
                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
              }`}>

                {
                  healthy
                    ? "HEALTHY"
                    : "RISK DETECTED"
                }

              </div>

            </div>

            <div className="space-y-5">

              <IntegrityRow
                label="Trial Balance"
                value={
                  report?.balancedTrialBalance
                }
              />

              <IntegrityRow
                label="Retained Earnings"
                value={
                  report?.retainedEarningsPresent
                }
              />

              <IntegrityRow
                label="Income Summary"
                value={
                  report?.incomeSummaryPresent
                }
              />

            </div>

          </div>

          <div className={`${theme.glassStrong} p-8`}>

            <h2 className={`${theme.sectionTitle} mb-8`}>
              Runtime Risk Metrics
            </h2>

            <div className="space-y-5">

              <RiskRow
                title="Unbalanced Journals"
                value={
                  report?.unbalancedJournals
                }
              />

              <RiskRow
                title="Missing Sources"
                value={
                  report?.missingSources
                }
              />

              <RiskRow
                title="Duplicate Entries"
                value={
                  report?.duplicateEntries
                }
              />

              <RiskRow
                title="Orphaned Journals"
                value={
                  report?.orphanedJournals
                }
              />

            </div>

          </div>

        </div>

        <div className={`${theme.glassStrong} p-8 mt-8`}>

          <h2 className={`${theme.sectionTitle} mb-8`}>
            Detected Issues
          </h2>

          {(report?.issues || []).length === 0 && (

            <div className="text-green-400">

              ✓ No integrity issues detected

            </div>

          )}

          <div className="space-y-4">

            {(report?.issues || [])
              .map((issue, index) => (

              <div
                key={index}
                className={`${theme.card} border border-red-500/10`}
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-red-400 font-semibold">

                      {issue.type}

                    </div>

                    <div className="text-zinc-500 mt-2">

                      {issue.entry}

                    </div>

                  </div>

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </div>

  );

}

function HealthCard({
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

function IntegrityRow({
  label,
  value,
}) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div className="text-zinc-300">

        {label}

      </div>

      <div className={
        value
          ? "text-green-400"
          : "text-red-400"
      }>

        {
          value
            ? "PASS"
            : "FAIL"
        }

      </div>

    </div>

  );

}

function RiskRow({
  title,
  value,
}) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div className="text-zinc-300">

        {title}

      </div>

      <div className={
        Number(value) > 0
          ? "text-red-400 font-semibold"
          : "text-green-400"
      }>

        {value}

      </div>

    </div>

  );

}
