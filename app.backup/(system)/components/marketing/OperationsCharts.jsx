"use client";

import {

  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,

} from "recharts";

export default function OperationsCharts({

  campaigns = [],

  queue = [],

}) {

  // PERFORMANCE TREND

  const performanceData =

    campaigns

      .slice(0, 10)

      .reverse()

      .map((campaign, index) => ({

        name:
          campaign.title ||
          `Campaign ${index + 1}`,

        score:
          campaign.performance_score || 0,

      }));

  // PUBLISH STATUS

  const publishStatusData = [

    {
      name: "Published",

      value:
        queue.filter(
          (q) =>
            q.status === "published"
        ).length,
    },

    {
      name: "Queued",

      value:
        queue.filter(
          (q) =>
            q.status === "queued"
        ).length,
    },

    {
      name: "Failed",

      value:
        queue.filter(
          (q) =>
            q.status === "failed"
        ).length,
    },

  ];

  const COLORS = [

    "#f97316",
    "#22c55e",
    "#ef4444",

  ];

  return (

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

      {/* PERFORMANCE CHART */}

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-2xl
          p-5
          h-[350px]
        "
      >

        <div className="font-semibold mb-5">
          Campaign Performance Trend
        </div>

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <LineChart
            data={performanceData}
          >

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />

            <XAxis
              dataKey="name"
              stroke="#999"
            />

            <YAxis
              stroke="#999"
            />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="score"
              stroke="#f97316"
              strokeWidth={3}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

      {/* PUBLISH STATUS */}

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-2xl
          p-5
          h-[350px]
        "
      >

        <div className="font-semibold mb-5">
          Publish Status
        </div>

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <PieChart>

            <Pie

              data={publishStatusData}

              dataKey="value"

              nameKey="name"

              outerRadius={120}

            >

              {publishStatusData.map(
                (entry, index) => (

                  <Cell
                    key={index}
                    fill={
                      COLORS[index % COLORS.length]
                    }
                  />

              ))}

            </Pie>

            <Tooltip />

          </PieChart>

        </ResponsiveContainer>

      </div>

    </div>

  );

}