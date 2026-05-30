export default function StaffTimeline({
  runtime,
}) {

  const feed = [

    {
      type: "vip",
      title: "VIP Momentum",
      message:
        `${runtime?.nightlifePhase || "Warmup"} phase active across venue`,
    },

    {
      type: "pressure",
      title: "Operational Pressure",
      message:
        `${runtime?.pressureLevel || "Controlled"} pressure detected`,
    },

    {
      type: "energy",
      title: "Venue Energy",
      message:
        `${runtime?.shiftEnergy || "Stable"} shift energy reported`,
    },

    {
      type: "revenue",
      title: "Revenue Runtime",
      message:
        `Revenue tonight reached ฿${runtime?.revenueToday || 0}`,
    },

  ];

  const staffFeed =
    (runtime?.staffWithPayout || [])
      .slice(0, 4)
      .map((staff, index) => ({

        type: "staff",

        title:
          `${staff.name} entering runtime`,

        message:
          `${staff.role} performance score ${staff.score || 0}`,

        id:
          index,

      }));

  const finalFeed = [
    ...feed,
    ...staffFeed,
  ];

  function getAccent(type) {

    switch(type) {

      case "vip":
        return "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300";

      case "pressure":
        return "border-orange-500/20 bg-orange-500/10 text-orange-300";

      case "energy":
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";

      case "revenue":
        return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";

      default:
        return "border-white/10 bg-white/[0.04] text-white";

    }

  }

  return (

    <div className="mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl transition-all duration-500 hover:scale-[1.005] hover:border-white/20">

      <div className="border-b border-white/5 px-5 py-5">

        <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
          Live Venue Feed
        </div>

        <div className="mt-2 text-2xl font-black text-white">
          Operational Social Hub
        </div>

        <div className="mt-2 text-sm text-white/45">
          Live team momentum, runtime intelligence and venue activity
        </div>

      </div>

      <div className="space-y-4 p-5">

        {finalFeed.map((item, index) => (

          <div
            key={index}
            className={`rounded-[24px] border p-5 transition-all duration-300 ${getAccent(item.type)}`}
          >

            <div className="flex items-start justify-between gap-4">

              <div>

                <div className="text-[10px] uppercase tracking-[0.3em] opacity-70">
                  LIVE EVENT
                </div>

                <div className="mt-2 text-lg font-black">
                  {item.title}
                </div>

                <div className="mt-3 text-sm opacity-80">
                  {item.message}
                </div>

              </div>

              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
                LIVE
              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}
