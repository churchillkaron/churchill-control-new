"use client";

import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function JournalsPage({ params }) {
  const { organizationId } = params;

  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/finance/journals?organizationId=${organizationId}`
        );

        const json = await res.json();

        setJournals(json.journals || []);
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    }

    load();
  }, [organizationId]);

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav organizationId={organizationId} />

      <h1 className="text-4xl font-light mb-6">
        Journal Entries
      </h1>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">

        <div className="p-5 border-b border-white/10">
          <div className="text-sm text-white/50">
            Total Journals
          </div>

          <div className="text-2xl font-light">
            {journals.length}
          </div>
        </div>

        {loading && (
          <div className="p-6 text-white/50">
            Loading journals...
          </div>
        )}

        {!loading && journals.length === 0 && (
          <div className="p-6 text-white/50">
            No journal entries found.
          </div>
        )}

        {!loading && journals.length > 0 && (
          <table className="w-full text-sm">

            <thead className="bg-white/[0.04]">
              <tr>
                <th className="text-left p-4">Entry</th>
                <th className="text-left p-4">Date</th>
                <th className="text-left p-4">Description</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Lines</th>
              </tr>
            </thead>

            <tbody>

              {journals.map((journal) => (
                <tr
                  key={journal.id}
                  className="border-t border-white/10"
                >
                  <td className="p-4">
                    {journal.entry_number}
                  </td>

                  <td className="p-4">
                    {journal.entry_date}
                  </td>

                  <td className="p-4">
                    {journal.description}
                  </td>

                  <td className="p-4">
                    {journal.status}
                  </td>

                  <td className="p-4 text-right">
                    {journal.lines?.length || 0}
                  </td>
                </tr>
              ))}

            </tbody>

          </table>
        )}

      </div>

    </div>
  );
}
