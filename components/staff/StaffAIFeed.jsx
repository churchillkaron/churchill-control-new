export default function StaffAIFeed({
  runtimeData,
}) {

  const notifications =
    Array.isArray(runtimeData?.notifications)
      ? runtimeData.notifications
      : [];

  const recommendations =
    Array.isArray(runtimeData?.recommendations)
      ? runtimeData.recommendations
      : [];

  const actions =
    Array.isArray(runtimeData?.actions)
      ? runtimeData.actions
      : [];

  function safeRender(value) {

    if (
      typeof value === "string"
    ) {
      return value;
    }

    if (
      typeof value === "number"
    ) {
      return String(value);
    }

    if (
      typeof value === "object" &&
      value !== null
    ) {

      return (
        value.message ||
        value.recommendation ||
        value.title ||
        JSON.stringify(value)
      );

    }

    return "AI Runtime Event";

  }

  return (

    <div className="mb-6 overflow-hidden rounded-[28px] border border-cyan-500/10 bg-gradient-to-br from-cyan-500/10 via-black to-fuchsia-500/10 backdrop-blur-3xl transition-all duration-500 hover:scale-[1.005] hover:border-white/20">

      <div className="border-b border-white/5 px-5 py-4">

        <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">
          Live AI Runtime
        </div>

        <div className="mt-1 text-xl font-black text-white">
          Operational Intelligence
        </div>

      </div>

      <div className="space-y-4 p-4">

        {notifications.map((item, index) => (

          <div
            key={`notification-${index}`}
            className="rounded-[18px] border border-fuchsia-500/10 bg-white/[0.03] p-4"
          >

            <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
              AI Notification
            </div>

            <div className="mt-2 text-sm text-white">
              {safeRender(item)}
            </div>

          </div>

        ))}

        {recommendations.map((item, index) => (

          <div
            key={`recommendation-${index}`}
            className="rounded-[18px] border border-cyan-500/10 bg-white/[0.03] p-4"
          >

            <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">
              Recommendation
            </div>

            <div className="mt-2 text-sm text-white">
              {safeRender(item)}
            </div>

          </div>

        ))}

        {actions.map((item, index) => (

          <div
            key={`action-${index}`}
            className="rounded-[18px] border border-emerald-500/10 bg-white/[0.03] p-4"
          >

            <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">
              Suggested Action
            </div>

            <div className="mt-2 text-sm text-white">
              {safeRender(item)}
            </div>

          </div>

        ))}

      </div>

    </div>

  );

}
