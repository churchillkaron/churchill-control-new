"use client";

function Section({
  title,
  children,
}) {
  return (
    <div className="mb-8">
      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-white/35">
        {title}
      </div>

      {children}

    </div>
  );
}

function Mission({
  runtime,
  mission,
}) {

  const active =
    runtime.missionRuntime?.current?.id === mission.id;

  return (

    <button
      type="button"
      className={[
        "mb-2 block w-full rounded-xl border p-4 text-left transition",
        active
          ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      ].join(" ")}
    >

      <div className="font-medium">
        {mission.title ||
          mission.business_goal ||
          "Untitled Mission"}
      </div>

      <div className="mt-1 text-xs text-white/45">
        {mission.status || "draft"}
      </div>

    </button>

  );
}

export default function MissionExplorer({
  runtime,
}) {

  const missions =
    runtime.missionRuntime?.items || [];

  return (

    <Section title="Missions">

      {missions.map(mission => (

        <Mission
          key={mission.id}
          runtime={runtime}
          mission={mission}
        />

      ))}

      {!missions.length && (

        <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
          No missions created
        </div>

      )}

    </Section>

  );

}
