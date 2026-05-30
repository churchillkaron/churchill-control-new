"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

export default function JournalExplorerPage() {

  const [journals, setJournals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedJournal, setSelectedJournal] =
    useState(null);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const res =
        await fetch(
          "/api/finance/journals"
        );

      const json =
        await res.json();

      setJournals(
        json.journals || []
      );

    } catch (error) {

      console.error(
        error
      );

    }

    setLoading(false);

  }

  async function openJournal(id) {

    try {

      const res =
        await fetch(

          `/api/finance/journal?id=${id}`

        );

      const json =
        await res.json();

      setSelectedJournal(
        json
      );

    } catch (error) {

      console.error(
        error
      );

    }

  }

  if (loading) {

    return (

      <div className={theme.page}>

        <div className={theme.container}>

          <div className={theme.card}>
            Loading Journal Runtime...
          </div>

        </div>

      </div>

    );

  }

  return (

    <div className={theme.page}>

      <div className={theme.container}>

        <div className="mb-10">

          <div className="uppercase tracking-[0.3em] text-xs text-purple-400 mb-4">

            Financial Audit Runtime

          </div>

          <h1 className={theme.title}>
            Journal Explorer
          </h1>

        </div>

        <div className="space-y-6">

          {journals.map((journal) => (

            <button
              key={journal.id}
              onClick={() =>
                openJournal(
                  journal.id
                )
              }
              className={`${theme.glassStrong} w-full p-6 text-left hover:border-purple-400/30 transition-all`}
            >

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">

                    {journal.source_type}

                  </div>

                  <div className="text-2xl font-semibold">

                    {journal.entry_number}

                  </div>

                  <div className="text-zinc-400 mt-2">

                    {journal.description}

                  </div>

                </div>

                <div className="text-right">

                  <div className="text-sm text-zinc-500">

                    {journal.entry_date}

                  </div>

                </div>

              </div>

            </button>

          ))}

        </div>

        {selectedJournal && (

          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-8">

            <div className={`${theme.glassStrong} w-full max-w-5xl max-h-[90vh] overflow-auto p-8`}>

              <div className="flex items-start justify-between mb-8">

                <div>

                  <div className="uppercase tracking-[0.2em] text-xs text-purple-400 mb-3">

                    Journal Inspection

                  </div>

                  <h2 className="text-4xl font-bold">

                    {
                      selectedJournal
                        ?.journal
                        ?.entry_number
                    }

                  </h2>

                  <div className="text-zinc-400 mt-3">

                    {
                      selectedJournal
                        ?.journal
                        ?.description
                    }

                  </div>

                </div>

                <button
                  onClick={() =>
                    setSelectedJournal(
                      null
                    )
                  }
                  className={theme.button}
                >

                  Close

                </button>

              </div>

              <div className="grid grid-cols-3 gap-6 mb-10">

                <div className={theme.card}>

                  <div className="text-zinc-500 text-sm mb-2">

                    Total Debits

                  </div>

                  <div className="text-3xl font-bold text-green-400">

                    {
                      Number(
                        selectedJournal
                          ?.totals
                          ?.debits || 0
                      ).toLocaleString()
                    }

                  </div>

                </div>

                <div className={theme.card}>

                  <div className="text-zinc-500 text-sm mb-2">

                    Total Credits

                  </div>

                  <div className="text-3xl font-bold text-red-400">

                    {
                      Number(
                        selectedJournal
                          ?.totals
                          ?.credits || 0
                      ).toLocaleString()
                    }

                  </div>

                </div>

                <div className={theme.card}>

                  <div className="text-zinc-500 text-sm mb-2">

                    Integrity

                  </div>

                  <div className={`text-3xl font-bold ${
                    selectedJournal
                      ?.balanced
                        ? "text-green-400"
                        : "text-red-400"
                  }`}>

                    {
                      selectedJournal
                        ?.balanced
                          ? "BALANCED"
                          : "UNBALANCED"
                    }

                  </div>

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

                  {(selectedJournal
                    ?.journal
                    ?.lines || [])
                    .map((line) => (

                    <tr
                      key={line.id}
                      className={theme.tableRow}
                    >

                      <td className="py-5">

                        <div className="font-medium">

                          {
                            line.account
                              ?.name
                          }

                        </div>

                        <div className="text-zinc-500 text-sm">

                          {
                            line.account
                              ?.code
                          }

                        </div>

                      </td>

                      <td className="py-5 text-zinc-500">

                        {
                          line.account
                            ?.category
                        }

                      </td>

                      <td className="py-5 text-right text-green-400">

                        {
                          Number(
                            line.debit
                          ).toLocaleString()
                        }

                      </td>

                      <td className="py-5 text-right text-red-400">

                        {
                          Number(
                            line.credit
                          ).toLocaleString()
                        }

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        )}

      </div>

    </div>

  );

}
