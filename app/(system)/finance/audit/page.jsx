"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

export default function FinanceAuditPage() {

  const [journals, setJournals] =
    useState([]);

  const [selected, setSelected] =
    useState(null);

  const [chain, setChain] =
    useState(null);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    const res =
      await fetch(
        "/api/finance/journals"
      );

    const json =
      await res.json();

    setJournals(
      json.journals || []
    );

  }

  async function inspect(journal) {

    setSelected(journal);

    const res =
      await fetch(

        `/api/finance/journal-chain?source_type=${journal.source_type}&source_id=${journal.source_id}`

      );

    const json =
      await res.json();

    setChain(json);

  }

  return (

    <div className={theme.page}>

      <div className={theme.container}>

        <div className="mb-10">

          <div className="uppercase tracking-[0.3em] text-xs text-red-400 mb-4">

            Enterprise Audit Runtime

          </div>

          <h1 className={theme.title}>
            Financial Audit Chain
          </h1>

          <p className={`${theme.subtitle} mt-3`}>

            Trace accounting flows,
            runtime events and
            transaction origins.

          </p>

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

          <div className="space-y-5">

            {journals.map((journal) => (

              <button
                key={journal.id}
                onClick={() =>
                  inspect(journal)
                }
                className={`${theme.glassStrong} w-full text-left p-6 hover:border-red-400/30 transition-all`}
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

                    <div className="text-zinc-500 text-sm">

                      {journal.entry_date}

                    </div>

                  </div>

                </div>

              </button>

            ))}

          </div>

          <div>

            {!selected && (

              <div className={`${theme.glassStrong} p-10 text-zinc-500`}>

                Select journal to inspect audit chain

              </div>

            )}

            {selected && (

              <div className={`${theme.glassStrong} p-8`}>

                <div className="mb-8">

                  <div className="uppercase tracking-[0.2em] text-xs text-purple-400 mb-3">

                    Runtime Trace

                  </div>

                  <h2 className="text-4xl font-bold">

                    {selected.entry_number}

                  </h2>

                  <div className="text-zinc-400 mt-3">

                    {selected.description}

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-5 mb-8">

                  <div className={theme.card}>

                    <div className="text-zinc-500 text-sm mb-2">

                      Source Type

                    </div>

                    <div className="text-xl font-semibold">

                      {selected.source_type}

                    </div>

                  </div>

                  <div className={theme.card}>

                    <div className="text-zinc-500 text-sm mb-2">

                      Source ID

                    </div>

                    <div className="text-sm break-all text-zinc-300">

                      {selected.source_id}

                    </div>

                  </div>

                </div>

                <div className="space-y-5">

                  {(chain?.chain || [])
                    .map((item) => (

                    <div
                      key={item.id}
                      className={`${theme.card} border border-purple-500/10`}
                    >

                      <div className="flex items-center justify-between mb-5">

                        <div>

                          <div className="text-lg font-semibold">

                            {item.entry_number}

                          </div>

                          <div className="text-zinc-500 text-sm mt-1">

                            {item.description}

                          </div>

                        </div>

                        <div className="text-zinc-500 text-sm">

                          {item.entry_date}

                        </div>

                      </div>

                      <table className={theme.table}>

                        <thead>

                          <tr className="border-b border-white/10 text-zinc-500">

                            <th className="text-left py-3">
                              Account
                            </th>

                            <th className="text-right py-3">
                              Debit
                            </th>

                            <th className="text-right py-3">
                              Credit
                            </th>

                          </tr>

                        </thead>

                        <tbody>

                          {(item.lines || [])
                            .map((line) => (

                            <tr
                              key={line.id}
                              className={theme.tableRow}
                            >

                              <td className="py-4">

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

                              <td className="py-4 text-right text-green-400">

                                {
                                  Number(
                                    line.debit
                                  ).toLocaleString()
                                }

                              </td>

                              <td className="py-4 text-right text-red-400">

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

                  ))}

                </div>

              </div>

            )}

          </div>

        </div>

      </div>

    </div>

  );

}
