export default function OperationsEngineStrategy({

  strategy = {},

  failingEngines = [],

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
        AI Engine Strategy
      </div>

      <div className="space-y-4">

        {Object.entries(strategy).map(

          ([type, data]) => (

            <div
              key={type}
              className="
                bg-black/20
                border
                border-white/5
                rounded-xl
                p-4
              "
            >

              <div className="flex items-center justify-between">

                <div className="uppercase text-sm tracking-[0.15em] text-white/50">
                  {type}
                </div>

                <div className="text-green-400 text-sm">
                  {data.confidence}% confidence
                </div>

              </div>

              <div className="mt-4 text-xl font-semibold">
                {data.bestEngine}
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 text-sm">

                <div>

                  <div className="text-white/40">
                    Avg Score
                  </div>

                  <div className="mt-1">
                    {data.avgScore}
                  </div>

                </div>

                <div>

                  <div className="text-white/40">
                    Success
                  </div>

                  <div className="mt-1">
                    {data.successRate}%
                  </div>

                </div>

                <div>

                  <div className="text-white/40">
                    Avg Duration
                  </div>

                  <div className="mt-1">
                    {data.avgDuration}s
                  </div>

                </div>

              </div>

            </div>

          )

        )}

      </div>

      {failingEngines.length > 0 && (

        <div className="mt-8">

          <div className="text-sm uppercase tracking-[0.15em] text-red-400 mb-4">
            Failing Engines
          </div>

          <div className="space-y-3">

            {failingEngines.map(
              (engine, index) => (

                <div
                  key={index}
                  className="
                    bg-red-500/10
                    border
                    border-red-500/20
                    rounded-xl
                    p-4
                  "
                >

                  <div className="font-semibold">
                    {engine.engine}
                  </div>

                  <div className="text-sm text-white/60 mt-2">
                    {engine.reason}
                  </div>

                  <div className="text-red-400 text-xs mt-2">
                    Failure Rate: {engine.failureRate}%
                  </div>

                </div>

            ))}

          </div>

        </div>

      )}

    </div>

  );

}