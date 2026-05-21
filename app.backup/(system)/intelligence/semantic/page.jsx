"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function SemanticFederationPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/semantic"
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  const summary =
    data?.federation_summary;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Semantic Federation
          </h1>

          <div className="text-zinc-500 mt-3">
            Enterprise Semantic Intelligence & Cross-Brand Learning
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Brands
            </div>

            <div className="text-5xl mt-4">
              {summary?.brands || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Enterprise Patterns
            </div>

            <div className="text-5xl mt-4">
              {
                summary?.enterprise_patterns || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.federation?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-start justify-between mb-6">

                  <div>

                    <div className="text-2xl">
                      {item.tenant_name}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      Revenue:
                      {" "}
                      {item.revenue}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Campaigns:
                      {" "}
                      {item.campaigns}
                    </div>

                    <div className="mt-2">
                      Audit Events:
                      {" "}
                      {item.audit_events}
                    </div>

                  </div>

                </div>

                <div className="space-y-4">

                  {item.semantic_patterns?.map(
                    (
                      pattern,
                      idx
                    ) => (

                      <div
                        key={idx}
                        className="border border-zinc-800 rounded-xl p-4"
                      >

                        <div className="text-lg mb-2">
                          {pattern.category}
                        </div>

                        <div className="text-zinc-400">
                          {
                            pattern.intelligence
                          }
                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
