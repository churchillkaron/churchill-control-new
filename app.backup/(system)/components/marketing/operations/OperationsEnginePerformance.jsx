import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function OperationsEnginePerformance({

  enginePerformance = [],

}) {

  return (

    <div
      className="
        bg-white/5
        border
        border-white/10
        rounded-2xl
        p-5
      "
    >

      <div className="text-lg font-semibold mb-6">
        AI Engine Performance
      </div>

      <div className="h-[320px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <BarChart
            data={
              enginePerformance
            }
          >

            <XAxis
              dataKey="engine"
            />

            <YAxis />

            <Tooltip />

            <Bar
              dataKey="averageScore"
              radius={[6, 6, 0, 0]}
            />

          </BarChart>

        </ResponsiveContainer>

      </div>

      <div className="space-y-3 mt-6">

        {enginePerformance.map(
          (engine) => (

            <div
              key={engine.engine}
              className="
                bg-black/20
                border
                border-white/5
                rounded-xl
                p-4
              "
            >

              <div className="flex items-center justify-between">

                <div className="font-semibold uppercase">
                  {engine.engine}
                </div>

                <div className="text-green-400 text-sm">
                  {engine.successRate}% success
                </div>

              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 text-sm">

                <div>

                  <div className="text-white/40">
                    Avg Score
                  </div>

                  <div className="mt-1">
                    {engine.averageScore}
                  </div>

                </div>

                <div>

                  <div className="text-white/40">
                    Avg Duration
                  </div>

                  <div className="mt-1">
                    {engine.avgDuration}s
                  </div>

                </div>

                <div>

                  <div className="text-white/40">
                    Campaigns
                  </div>

                  <div className="mt-1">
                    {engine.totalCampaigns}
                  </div>

                </div>

              </div>

            </div>

        ))}

      </div>

    </div>

  );

}