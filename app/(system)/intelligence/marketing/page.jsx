"use client";

import { useEffect, useState } from "react";

export default function MarketingAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/marketing",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            tenant_id:
              "demo",
          }),
        }
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-bold">
            Marketing Optimization AI
          </h1>

          <div className="text-zinc-500 mt-3">
            Campaign Intelligence & Growth Optimization
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Campaigns
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.campaigns || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Impressions
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.impressions || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Clicks
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.clicks || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Avg CTR
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.average_ctr || 0
            }%
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.analysis?.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-start justify-between">

                <div>

                  <div className="text-2xl">
                    {item.campaign}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {item.platform}
                  </div>

                  <div className="mt-4 text-sm">
                    {item.recommendation}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    CTR:
                    {" "}
                    {item.ctr}%
                  </div>

                  <div className="mt-2">
                    Clicks:
                    {" "}
                    {item.clicks}
                  </div>

                  <div className="mt-2">
                    Score:
                    {" "}
                    {item.engagement_score}
                  </div>

                  <div className="mt-2">
                    {item.performance}
                  </div>

                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
