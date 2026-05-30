"use client";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

import {
  getJournalSourceRoute,
} from "@/lib/finance/getJournalSourceRoute";

export default function JournalDetailsModal({
  open,
  onClose,
  journal,
  lines = [],
}) {

  if (!open || !journal) {
    return null;
  }

  const sourceRoute =
    getJournalSourceRoute(

      journal.source_type,
      journal.source_id,

    );

  async function reverseJournal() {

    try {

      const confirmed =
        confirm(
          `Reverse ${journal.entry_number}?`
        );

      if (!confirmed) {
        return;
      }

      const reason =
        prompt(
          "Enter reversal reason",
          "Manual correction"
        );

      if (!reason) {
        return;
      }

      const res =
        await fetch(

          "/api/finance/journals/reverse",

          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

            },

            body:
              JSON.stringify({

                journalId:
                  journal.id,

                reason,

              }),

          }

        );

      const json =
        await res.json();

      if (!json.success) {

        alert(
          json.error ||
          "Reversal failed"
        );

        return;

      }

      alert(
        "Journal reversed successfully"
      );

      window.location.reload();

    } catch (error) {

      console.error(error);

      alert(
        "Unexpected error"
      );

    }

  }

  return (

    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">

      <div className={`${theme.glassStrong} w-full max-w-5xl max-h-[90vh] overflow-auto p-8`}>

        <div className="flex items-start justify-between mb-8">

          <div>

            <div className="uppercase tracking-[0.3em] text-xs text-zinc-500 mb-3">

              Journal Entry

            </div>

            <h2 className="text-4xl font-black mb-3">

              {journal.entry_number}

            </h2>

            <div className="text-zinc-400">

              {journal.description}

            </div>

          </div>

          <div className="flex items-center gap-3">



          {

            sourceRoute && (

              <a
                href={sourceRoute}
                className="px-5 py-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
              >

                Open Source Transaction

              </a>

            )

          }




          {

            !journal.reversed && (

              <button
                onClick={reverseJournal}
                className="px-5 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all"
              >

                Reverse Journal

              </button>

            )

          }



            <button
              onClick={onClose}
              className="px-4 py-2 rounded-2xl border border-white/10 hover:bg-white/10 transition-all"
            >

              Close

            </button>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">

          <MetaCard
            label="Date"
            value={journal.entry_date}
          />

          <MetaCard
            label="Source"
            value={journal.source_type}
          />

          <MetaCard
            label="Reference"
            value={
              journal.source_id || "-"
            }
          />

          <MetaCard
            label="Created By"
            value={
              journal.created_by || "-"
            }
          />

        </div>

        <div className={`${theme.glass} p-6`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Journal Lines
            </h3>

            <div className="text-zinc-500 text-sm">

              {lines.length} lines

            </div>

          </div>

          <table className={theme.table}>

            <thead>

              <tr className="border-b border-white/10 text-zinc-500">

                <th className="text-left py-4">
                  Account
                </th>

                <th className="text-left py-4">
                  Category
                </th>

                <th className="text-right py-4">
                  Debit
                </th>

                <th className="text-right py-4">
                  Credit
                </th>

              </tr>

            </thead>

            <tbody>

              {lines.map((line) => (

                <tr
                  key={line.id}
                  className={theme.tableRow}
                >

                  <td className="py-4">

                    <div className="font-medium">

                      {
                        line.chart_of_accounts?.name
                      }

                    </div>

                    <div className="text-zinc-500 text-sm mt-1">

                      {
                        line.chart_of_accounts?.code
                      }

                    </div>

                  </td>

                  <td className="py-4 text-zinc-400">

                    {
                      line.chart_of_accounts?.category
                    }

                  </td>

                  <td className="py-4 text-right text-green-400">

                    {
                      Number(
                        line.debit || 0
                      ).toLocaleString()
                    }

                  </td>

                  <td className="py-4 text-right text-red-400">

                    {
                      Number(
                        line.credit || 0
                      ).toLocaleString()
                    }

                  </td>

                </tr>

              ))}

            </tbody>

          </table>















        {

          journal.description?.includes("•") && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Reversal Reason

              </div>

              <div className="text-xl font-semibold text-yellow-400">

                {

                  journal.description
                    .split("•")[1]
                    ?.trim()

                }

              </div>

            </div>

          )

        }


        {

          journal.reversal_of && (

            <div className={`${theme.glass} p-6 mt-8 border border-yellow-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-yellow-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Audit Trail

                  </div>

                  <div className="text-2xl font-bold">

                    Reversal Journal Entry

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal was generated as a reversal transaction for a previous accounting entry.

                  </div>

                  <div className="text-zinc-500 text-sm mt-4 break-all">

                    Original Journal:
                    {" "}
                    {journal.reversal_of}

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-yellow-400" />

              </div>

            </div>

          )

        }


        {

          journal.reversal_journal_id && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Relationship

                  </div>

                  <div className="text-2xl font-bold">

                    Linked Reversal Journal

                  </div>

                  <div className="text-zinc-400 mt-3 break-all">

                    {journal.reversal_journal_id}

                  </div>

                </div>

                <a
                  href={`/finance/journals/${journal.reversal_journal_id}`}
                  className="px-5 py-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
                >

                  Open Reversal

                </a>

              </div>

            </div>

          )

        }


        {

          journal.reversed && (

            <div className={`${theme.glass} p-6 mt-8 border border-red-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-red-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Status

                  </div>

                  <div className="text-2xl font-bold">

                    Journal Reversed

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal has already been reversed and should no longer impact operational accounting decisions.

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-red-400" />

              </div>

            </div>

          )

        }


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Financial Statement Impact
            </h3>

            <div className="text-zinc-500 text-sm">

              Statement Distribution

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <FinancialEffectCard
              label="Assets"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Assets"

                  )
                  .length
              }
              color="text-cyan-400"
            />

            <FinancialEffectCard
              label="Liabilities"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Liabilities"

                  )
                  .length
              }
              color="text-yellow-400"
            />

            <FinancialEffectCard
              label="Equity"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Equity"

                  )
                  .length
              }
              color="text-purple-400"
            />

            <FinancialEffectCard
              label="P&L"
              value={
                lines
                  .filter(

                    (line) =>

                      [
                        "Revenue",
                        "Expense",
                        "COGS",
                      ].includes(

                        line.chart_of_accounts
                          ?.category

                      )

                  )
                  .length
              }
              color="text-green-400"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Metadata
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Posting Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingMetaCard
              label="Entry Number"
              value={
                journal.entry_number || "-"
              }
            />

            <PostingMetaCard
              label="Entry Date"
              value={
                journal.entry_date || "-"
              }
            />

            <PostingMetaCard
              label="Created By"
              value={
                journal.created_by || "-"
              }
            />

            <PostingMetaCard
              label="Status"
              value={
                journal.status || "posted"
              }
            />

          </div>

        </div>








        {

          journal.description?.includes("•") && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Reversal Reason

              </div>

              <div className="text-xl font-semibold text-yellow-400">

                {

                  journal.description
                    .split("•")[1]
                    ?.trim()

                }

              </div>

            </div>

          )

        }


        {

          journal.reversal_of && (

            <div className={`${theme.glass} p-6 mt-8 border border-yellow-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-yellow-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Audit Trail

                  </div>

                  <div className="text-2xl font-bold">

                    Reversal Journal Entry

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal was generated as a reversal transaction for a previous accounting entry.

                  </div>

                  <div className="text-zinc-500 text-sm mt-4 break-all">

                    Original Journal:
                    {" "}
                    {journal.reversal_of}

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-yellow-400" />

              </div>

            </div>

          )

        }


        {

          journal.reversal_journal_id && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Relationship

                  </div>

                  <div className="text-2xl font-bold">

                    Linked Reversal Journal

                  </div>

                  <div className="text-zinc-400 mt-3 break-all">

                    {journal.reversal_journal_id}

                  </div>

                </div>

                <a
                  href={`/finance/journals/${journal.reversal_journal_id}`}
                  className="px-5 py-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
                >

                  Open Reversal

                </a>

              </div>

            </div>

          )

        }


        {

          journal.reversed && (

            <div className={`${theme.glass} p-6 mt-8 border border-red-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-red-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Status

                  </div>

                  <div className="text-2xl font-bold">

                    Journal Reversed

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal has already been reversed and should no longer impact operational accounting decisions.

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-red-400" />

              </div>

            </div>

          )

        }


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Financial Statement Impact
            </h3>

            <div className="text-zinc-500 text-sm">

              Statement Distribution

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <FinancialEffectCard
              label="Assets"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Assets"

                  )
                  .length
              }
              color="text-cyan-400"
            />

            <FinancialEffectCard
              label="Liabilities"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Liabilities"

                  )
                  .length
              }
              color="text-yellow-400"
            />

            <FinancialEffectCard
              label="Equity"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Equity"

                  )
                  .length
              }
              color="text-purple-400"
            />

            <FinancialEffectCard
              label="P&L"
              value={
                lines
                  .filter(

                    (line) =>

                      [
                        "Revenue",
                        "Expense",
                        "COGS",
                      ].includes(

                        line.chart_of_accounts
                          ?.category

                      )

                  )
                  .length
              }
              color="text-green-400"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Metadata
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Posting Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingMetaCard
              label="Entry Number"
              value={
                journal.entry_number || "-"
              }
            />

            <PostingMetaCard
              label="Entry Date"
              value={
                journal.entry_date || "-"
              }
            />

            <PostingMetaCard
              label="Created By"
              value={
                journal.created_by || "-"
              }
            />

            <PostingMetaCard
              label="Status"
              value={
                journal.status || "posted"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Source Document
            </h3>

            <div className="text-zinc-500 text-sm">

              ERP Origin Record

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <SourceDocumentCard
              label="Document Type"
              value={
                journal.source_type || "-"
              }
            />

            <SourceDocumentCard
              label="Document Reference"
              value={
                journal.source_id || "-"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Transaction Lineage
            </h3>

            <div className="text-zinc-500 text-sm">

              ERP Flow Traceability

            </div>

          </div>

          <div className="space-y-4">

            <LineageStep
              title="Source Transaction"
              value={
                journal.source_type || "-"
              }
            />

            <LineageStep
              title="Journal Entry Created"
              value={
                journal.entry_number || "-"
              }
            />

            <LineageStep
              title="Ledger Posted"
              value="General Ledger"
            />

            <LineageStep
              title="Financial Statements Updated"
              value="P&L / Balance Sheet / Cash Flow"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Status
            </h3>

            <div className="text-zinc-500 text-sm">

              Ledger Validation

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingCard
              label="Status"
              value={
                journal.status || "posted"
              }
              color="text-green-400"
            />

            <PostingCard
              label="Source Type"
              value={
                journal.source_type || "-"
              }
              color="text-cyan-400"
            />

            <PostingCard
              label="Entry Lines"
              value={
                lines.length
              }
              color="text-purple-400"
            />

            <PostingCard
              label="Integrity"
              value={
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "VALID"
                  : "INVALID"
              }
              color={
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "text-green-400"
                  : "text-red-400"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Audit Trail
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Governance

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <AuditItem
              label="Created At"
              value={
                journal.created_at || "-"
              }
            />

            <AuditItem
              label="Updated At"
              value={
                journal.updated_at || "-"
              }
            />

            <AuditItem
              label="Tenant"
              value={
                journal.tenant_id || "-"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Account Impact Summary
            </h3>

            <div className="text-zinc-500 text-sm">

              Ledger Distribution

            </div>

          </div>

          <div className="space-y-4">

            {

              lines.map((line) => {

                const account =
                  line.chart_of_accounts;

                const impact =
                  Number(line.debit || 0) -
                  Number(line.credit || 0);

                return (

                  <div
                    key={`impact-${line.id}`}
                    className={`${theme.card} flex items-center justify-between`}
                  >

                    <div>

                      <div className="font-semibold text-lg">

                        {
                          account?.name
                        }

                      </div>

                      <div className="text-zinc-500 text-sm mt-1">

                        {
                          account?.code
                        }
                        {" • "}
                        {
                          account?.category
                        }

                      </div>

                    </div>

                    <div className={`text-2xl font-bold ${
                      impact >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}>

                      {
                        impact >= 0
                          ? "+"
                          : "-"
                      }

                      {
                        Math.abs(
                          impact
                        ).toLocaleString()
                      }

                    </div>

                  </div>

                );

              })

            }

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Transaction Traceability
            </h3>

            <div className="text-zinc-500 text-sm">

              Source Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <TraceCard
              label="Source Type"
              value={
                journal.source_type || "-"
              }
            />

            <TraceCard
              label="Source ID"
              value={
                journal.source_id || "-"
              }
            />

            <TraceCard
              label="Created At"
              value={
                journal.created_at || "-"
              }
            />

          </div>

        </div>


          <div className="mt-8 flex items-center justify-between">

            <div className="text-zinc-500 text-sm">

              Journal Integrity Validation

            </div>

            <div className={`px-5 py-3 rounded-2xl border ${
              Number(

                lines.reduce(

                  (sum, line) =>

                    sum +
                    Number(line.debit || 0),

                  0

                )

              ) ===
              Number(

                lines.reduce(

                  (sum, line) =>

                    sum +
                    Number(line.credit || 0),

                  0

                )

              )
                ? "border-green-500/20 bg-green-500/10 text-green-400"
                : "border-red-500/20 bg-red-500/10 text-red-400"
            }`}>

              {
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "BALANCED"
                  : "UNBALANCED"
              }

            </div>

          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

            <div className={`${theme.card} border border-green-500/20`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Total Debits

              </div>

              <div className="text-4xl font-bold text-green-400">

                {
                  Number(

                    lines.reduce(

                      (sum, line) =>

                        sum +
                        Number(
                          line.debit || 0
                        ),

                      0

                    )

                  ).toLocaleString()
                }

              </div>

            </div>

            <div className={`${theme.card} border border-red-500/20`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Total Credits

              </div>

              <div className="text-4xl font-bold text-red-400">

                {
                  Number(

                    lines.reduce(

                      (sum, line) =>

                        sum +
                        Number(
                          line.credit || 0
                        ),

                      0

                    )

                  ).toLocaleString()
                }

              </div>

            </div>

          </div>
















        {

          journal.description?.includes("•") && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Reversal Reason

              </div>

              <div className="text-xl font-semibold text-yellow-400">

                {

                  journal.description
                    .split("•")[1]
                    ?.trim()

                }

              </div>

            </div>

          )

        }


        {

          journal.reversal_of && (

            <div className={`${theme.glass} p-6 mt-8 border border-yellow-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-yellow-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Audit Trail

                  </div>

                  <div className="text-2xl font-bold">

                    Reversal Journal Entry

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal was generated as a reversal transaction for a previous accounting entry.

                  </div>

                  <div className="text-zinc-500 text-sm mt-4 break-all">

                    Original Journal:
                    {" "}
                    {journal.reversal_of}

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-yellow-400" />

              </div>

            </div>

          )

        }


        {

          journal.reversal_journal_id && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Relationship

                  </div>

                  <div className="text-2xl font-bold">

                    Linked Reversal Journal

                  </div>

                  <div className="text-zinc-400 mt-3 break-all">

                    {journal.reversal_journal_id}

                  </div>

                </div>

                <a
                  href={`/finance/journals/${journal.reversal_journal_id}`}
                  className="px-5 py-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
                >

                  Open Reversal

                </a>

              </div>

            </div>

          )

        }


        {

          journal.reversed && (

            <div className={`${theme.glass} p-6 mt-8 border border-red-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-red-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Status

                  </div>

                  <div className="text-2xl font-bold">

                    Journal Reversed

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal has already been reversed and should no longer impact operational accounting decisions.

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-red-400" />

              </div>

            </div>

          )

        }


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Financial Statement Impact
            </h3>

            <div className="text-zinc-500 text-sm">

              Statement Distribution

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <FinancialEffectCard
              label="Assets"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Assets"

                  )
                  .length
              }
              color="text-cyan-400"
            />

            <FinancialEffectCard
              label="Liabilities"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Liabilities"

                  )
                  .length
              }
              color="text-yellow-400"
            />

            <FinancialEffectCard
              label="Equity"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Equity"

                  )
                  .length
              }
              color="text-purple-400"
            />

            <FinancialEffectCard
              label="P&L"
              value={
                lines
                  .filter(

                    (line) =>

                      [
                        "Revenue",
                        "Expense",
                        "COGS",
                      ].includes(

                        line.chart_of_accounts
                          ?.category

                      )

                  )
                  .length
              }
              color="text-green-400"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Metadata
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Posting Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingMetaCard
              label="Entry Number"
              value={
                journal.entry_number || "-"
              }
            />

            <PostingMetaCard
              label="Entry Date"
              value={
                journal.entry_date || "-"
              }
            />

            <PostingMetaCard
              label="Created By"
              value={
                journal.created_by || "-"
              }
            />

            <PostingMetaCard
              label="Status"
              value={
                journal.status || "posted"
              }
            />

          </div>

        </div>








        {

          journal.description?.includes("•") && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Reversal Reason

              </div>

              <div className="text-xl font-semibold text-yellow-400">

                {

                  journal.description
                    .split("•")[1]
                    ?.trim()

                }

              </div>

            </div>

          )

        }


        {

          journal.reversal_of && (

            <div className={`${theme.glass} p-6 mt-8 border border-yellow-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-yellow-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Audit Trail

                  </div>

                  <div className="text-2xl font-bold">

                    Reversal Journal Entry

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal was generated as a reversal transaction for a previous accounting entry.

                  </div>

                  <div className="text-zinc-500 text-sm mt-4 break-all">

                    Original Journal:
                    {" "}
                    {journal.reversal_of}

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-yellow-400" />

              </div>

            </div>

          )

        }


        {

          journal.reversal_journal_id && (

            <div className={`${theme.glass} p-6 mt-8`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Relationship

                  </div>

                  <div className="text-2xl font-bold">

                    Linked Reversal Journal

                  </div>

                  <div className="text-zinc-400 mt-3 break-all">

                    {journal.reversal_journal_id}

                  </div>

                </div>

                <a
                  href={`/finance/journals/${journal.reversal_journal_id}`}
                  className="px-5 py-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
                >

                  Open Reversal

                </a>

              </div>

            </div>

          )

        }


        {

          journal.reversed && (

            <div className={`${theme.glass} p-6 mt-8 border border-red-500/20`}>

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-red-400 text-xs uppercase tracking-[0.2em] mb-3">

                    Reversal Status

                  </div>

                  <div className="text-2xl font-bold">

                    Journal Reversed

                  </div>

                  <div className="text-zinc-400 mt-3">

                    This journal has already been reversed and should no longer impact operational accounting decisions.

                  </div>

                </div>

                <div className="h-4 w-4 rounded-full bg-red-400" />

              </div>

            </div>

          )

        }


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Financial Statement Impact
            </h3>

            <div className="text-zinc-500 text-sm">

              Statement Distribution

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <FinancialEffectCard
              label="Assets"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Assets"

                  )
                  .length
              }
              color="text-cyan-400"
            />

            <FinancialEffectCard
              label="Liabilities"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Liabilities"

                  )
                  .length
              }
              color="text-yellow-400"
            />

            <FinancialEffectCard
              label="Equity"
              value={
                lines
                  .filter(

                    (line) =>

                      line.chart_of_accounts
                        ?.category === "Equity"

                  )
                  .length
              }
              color="text-purple-400"
            />

            <FinancialEffectCard
              label="P&L"
              value={
                lines
                  .filter(

                    (line) =>

                      [
                        "Revenue",
                        "Expense",
                        "COGS",
                      ].includes(

                        line.chart_of_accounts
                          ?.category

                      )

                  )
                  .length
              }
              color="text-green-400"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Metadata
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Posting Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingMetaCard
              label="Entry Number"
              value={
                journal.entry_number || "-"
              }
            />

            <PostingMetaCard
              label="Entry Date"
              value={
                journal.entry_date || "-"
              }
            />

            <PostingMetaCard
              label="Created By"
              value={
                journal.created_by || "-"
              }
            />

            <PostingMetaCard
              label="Status"
              value={
                journal.status || "posted"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Source Document
            </h3>

            <div className="text-zinc-500 text-sm">

              ERP Origin Record

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <SourceDocumentCard
              label="Document Type"
              value={
                journal.source_type || "-"
              }
            />

            <SourceDocumentCard
              label="Document Reference"
              value={
                journal.source_id || "-"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Transaction Lineage
            </h3>

            <div className="text-zinc-500 text-sm">

              ERP Flow Traceability

            </div>

          </div>

          <div className="space-y-4">

            <LineageStep
              title="Source Transaction"
              value={
                journal.source_type || "-"
              }
            />

            <LineageStep
              title="Journal Entry Created"
              value={
                journal.entry_number || "-"
              }
            />

            <LineageStep
              title="Ledger Posted"
              value="General Ledger"
            />

            <LineageStep
              title="Financial Statements Updated"
              value="P&L / Balance Sheet / Cash Flow"
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Posting Status
            </h3>

            <div className="text-zinc-500 text-sm">

              Ledger Validation

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            <PostingCard
              label="Status"
              value={
                journal.status || "posted"
              }
              color="text-green-400"
            />

            <PostingCard
              label="Source Type"
              value={
                journal.source_type || "-"
              }
              color="text-cyan-400"
            />

            <PostingCard
              label="Entry Lines"
              value={
                lines.length
              }
              color="text-purple-400"
            />

            <PostingCard
              label="Integrity"
              value={
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "VALID"
                  : "INVALID"
              }
              color={
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "text-green-400"
                  : "text-red-400"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Audit Trail
            </h3>

            <div className="text-zinc-500 text-sm">

              Financial Governance

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <AuditItem
              label="Created At"
              value={
                journal.created_at || "-"
              }
            />

            <AuditItem
              label="Updated At"
              value={
                journal.updated_at || "-"
              }
            />

            <AuditItem
              label="Tenant"
              value={
                journal.tenant_id || "-"
              }
            />

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Account Impact Summary
            </h3>

            <div className="text-zinc-500 text-sm">

              Ledger Distribution

            </div>

          </div>

          <div className="space-y-4">

            {

              lines.map((line) => {

                const account =
                  line.chart_of_accounts;

                const impact =
                  Number(line.debit || 0) -
                  Number(line.credit || 0);

                return (

                  <div
                    key={`impact-${line.id}`}
                    className={`${theme.card} flex items-center justify-between`}
                  >

                    <div>

                      <div className="font-semibold text-lg">

                        {
                          account?.name
                        }

                      </div>

                      <div className="text-zinc-500 text-sm mt-1">

                        {
                          account?.code
                        }
                        {" • "}
                        {
                          account?.category
                        }

                      </div>

                    </div>

                    <div className={`text-2xl font-bold ${
                      impact >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}>

                      {
                        impact >= 0
                          ? "+"
                          : "-"
                      }

                      {
                        Math.abs(
                          impact
                        ).toLocaleString()
                      }

                    </div>

                  </div>

                );

              })

            }

          </div>

        </div>


        <div className={`${theme.glass} p-6 mt-8`}>

          <div className="flex items-center justify-between mb-6">

            <h3 className={theme.sectionTitle}>
              Transaction Traceability
            </h3>

            <div className="text-zinc-500 text-sm">

              Source Runtime

            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <TraceCard
              label="Source Type"
              value={
                journal.source_type || "-"
              }
            />

            <TraceCard
              label="Source ID"
              value={
                journal.source_id || "-"
              }
            />

            <TraceCard
              label="Created At"
              value={
                journal.created_at || "-"
              }
            />

          </div>

        </div>


          <div className="mt-8 flex items-center justify-between">

            <div className="text-zinc-500 text-sm">

              Journal Integrity Validation

            </div>

            <div className={`px-5 py-3 rounded-2xl border ${
              Number(

                lines.reduce(

                  (sum, line) =>

                    sum +
                    Number(line.debit || 0),

                  0

                )

              ) ===
              Number(

                lines.reduce(

                  (sum, line) =>

                    sum +
                    Number(line.credit || 0),

                  0

                )

              )
                ? "border-green-500/20 bg-green-500/10 text-green-400"
                : "border-red-500/20 bg-red-500/10 text-red-400"
            }`}>

              {
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.debit || 0),

                    0

                  )

                ) ===
                Number(

                  lines.reduce(

                    (sum, line) =>

                      sum +
                      Number(line.credit || 0),

                    0

                  )

                )
                  ? "BALANCED"
                  : "UNBALANCED"
              }

            </div>

          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

            <div className={`${theme.card} border border-green-500/20`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Total Debits

              </div>

              <div className="text-4xl font-bold text-green-400">

                {
                  Number(

                    lines.reduce(

                      (sum, line) =>

                        sum +
                        Number(
                          line.debit || 0
                        ),

                      0

                    )

                  ).toLocaleString()
                }

              </div>

            </div>

            <div className={`${theme.card} border border-red-500/20`}>

              <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

                Total Credits

              </div>

              <div className="text-4xl font-bold text-red-400">

                {
                  Number(

                    lines.reduce(

                      (sum, line) =>

                        sum +
                        Number(
                          line.credit || 0
                        ),

                      0

                    )

                  ).toLocaleString()
                }

              </div>

            </div>

          </div>


        </div>

      </div>

    </div>

  );

}

function MetaCard({
  label,
  value,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className="text-lg font-semibold break-words">

        {value}

      </div>

    </div>

  );

}


function TraceCard({
  label,
  value,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className="text-lg font-semibold break-all">

        {value}

      </div>

    </div>

  );

}


function AuditItem({
  label,
  value,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className="text-lg font-semibold break-all">

        {value}

      </div>

    </div>

  );

}


function PostingCard({
  label,
  value,
  color,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className={`text-2xl font-bold ${color}`}>

        {value}

      </div>

    </div>

  );

}


function LineageStep({
  title,
  value,
}) {

  return (

    <div className={`${theme.card} flex items-center justify-between`}>

      <div>

        <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-2">

          {title}

        </div>

        <div className="text-lg font-semibold">

          {value}

        </div>

      </div>

      <div className="h-3 w-3 rounded-full bg-green-400" />

    </div>

  );

}


function SourceDocumentCard({
  label,
  value,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className="text-xl font-semibold break-all">

        {value}

      </div>

    </div>

  );

}


function PostingMetaCard({
  label,
  value,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className="text-lg font-semibold break-all">

        {value}

      </div>

    </div>

  );

}




function FinancialEffectCard({
  label,
  value,
  color,
}) {

  return (

    <div className={theme.card}>

      <div className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-3">

        {label}

      </div>

      <div className={`text-4xl font-bold ${color}`}>

        {value}

      </div>

    </div>

  );

}
