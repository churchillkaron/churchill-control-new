"use client";

function Stat({title,value}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}

function Card({title,children}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 text-[11px] uppercase tracking-[0.28em] text-[#c8a96a]">
        {title}
      </div>
      {children}
    </section>
  );
}

export default function TimelineWorkspace({
  runtime,
}) {

  const timeline =
    runtime.timelineRuntime?.current || {};

  const scenes =
    runtime.timelineRuntime?.items || [];

  return (

    <div className="h-full overflow-auto p-8 text-white">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Production Timeline
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Timeline
        </div>

      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">

        <Stat title="Scenes" value={timeline.total_scenes || 0} />
        <Stat title="Shots" value={timeline.total_shots || 0} />
        <Stat title="Assets" value={timeline.total_assets || 0} />
        <Stat title="Timeline" value={scenes.length} />

      </div>

      <Card title="Scene Timeline">

        <div className="space-y-4">

          {scenes.length===0 && (
            <div className="text-white/40">
              No timeline available.
            </div>
          )}

          {scenes.map(scene=>(

            <div
              key={scene.id}
              className="rounded-xl border border-white/10 p-4"
            >

              <div className="flex justify-between">

                <div className="font-semibold">
                  {scene.title || `Scene ${scene.scene_number}`}
                </div>

                <div className="text-white/45">
                  {scene.status || "Ready"}
                </div>

              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">

                <div>
                  Shots: {(scene.shots||[]).length}
                </div>

                <div>
                  Assets:
                  {" "}
                  {(scene.shots||[])
                    .reduce(
                      (n,s)=>n+((s.assets||[]).length),
                      0
                    )}
                </div>

              </div>

            </div>

          ))}

        </div>

      </Card>

    </div>

  );

}
