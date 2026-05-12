export default function OperationsRecommendations({

  recommendations,

}) {

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        AI Recommendations
      </div>

      <div className="space-y-3">

        {recommendations.map(
          (recommendation, index) => (

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
                {recommendation.priority}
              </div>

              <div className="font-semibold">
                {recommendation.title}
              </div>

              <div className="text-white/60 text-sm mt-2">
                {recommendation.message}
              </div>

            </div>

          )

        )}

      </div>

    </div>

  );

}