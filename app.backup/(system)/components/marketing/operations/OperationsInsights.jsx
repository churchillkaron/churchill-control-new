export default function OperationsInsights({

  ownerInsights,

}) {

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        Owner Insights
      </div>

      <div className="space-y-3">

        {ownerInsights.map(
          (insight, index) => (

            <div
              key={index}
              className="
                bg-white/5
                border
                border-white/10
                rounded-2xl
                p-5
              "
            >

              <div className="text-orange-400 text-xs uppercase tracking-[0.15em] mb-2">
                {insight.type}
              </div>

              <div className="font-semibold">
                {insight.title}
              </div>

              <div className="text-white/60 text-sm mt-2">
                {insight.message}
              </div>

            </div>

          )

        )}

      </div>

    </div>

  );

}