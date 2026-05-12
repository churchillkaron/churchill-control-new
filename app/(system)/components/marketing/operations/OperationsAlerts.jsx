export default function OperationsAlerts({

  operationalAlerts,

}) {

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        Operational Alerts
      </div>

      <div className="space-y-3">

        {operationalAlerts.map(
          (alert, index) => (

            <div
              key={index}
              className={`

                border
                rounded-2xl
                p-5

                ${
                  alert.level === "critical"

                    ? "bg-red-500/10 border-red-500/30"

                    : alert.level === "high"

                    ? "bg-orange-500/10 border-orange-500/30"

                    : alert.level === "medium"

                    ? "bg-yellow-500/10 border-yellow-500/30"

                    : "bg-white/5 border-white/10"

                }

              `}
            >

              <div
                className={`

                  text-xs
                  uppercase
                  tracking-[0.15em]
                  mb-2

                  ${
                    alert.level === "critical"

                      ? "text-red-400"

                      : alert.level === "high"

                      ? "text-orange-400"

                      : alert.level === "medium"

                      ? "text-yellow-400"

                      : "text-white/40"

                  }

                `}
              >

                {alert.level}

              </div>

              <div className="font-semibold">
                {alert.title}
              </div>

              <div className="text-white/60 text-sm mt-2">
                {alert.message}
              </div>

            </div>

        ))}

      </div>

    </div>

  );

}