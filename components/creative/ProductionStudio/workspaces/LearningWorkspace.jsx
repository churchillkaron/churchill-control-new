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

export default function LearningWorkspace({
  runtime,
}) {

  const mission =
    runtime.missionRuntime?.current || {};

  const production =
    runtime.productionRuntime?.items || [];

  const publishing =
    runtime.publishingRuntime?.items || [];

  const assets =
    runtime.assetRuntime?.items || [];

  return (

    <div className="h-full overflow-auto p-8 text-white">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Learning Center
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Creative Intelligence
        </div>

      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">

        <Stat
          title="Production"
          value={production.length}
        />

        <Stat
          title="Publishing"
          value={publishing.length}
        />

        <Stat
          title="Assets"
          value={assets.length}
        />

        <Stat
          title="Learning"
          value={
            mission.learning_summary
              ? 1
              : 0
          }
        />

      </div>

      <div className="grid grid-cols-2 gap-6">

        <Card title="Mission Learning">

          <div className="whitespace-pre-wrap text-white/80">

            {mission.learning_summary ||
             "No learning summary available."}

          </div>

        </Card>

        <Card title="Creative Metrics">

          <div className="space-y-4">

            <div className="flex justify-between">
              <span className="text-white/45">
                Production Jobs
              </span>
              <span>{production.length}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-white/45">
                Published Jobs
              </span>
              <span>{publishing.length}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-white/45">
                Asset Library
              </span>
              <span>{assets.length}</span>
            </div>

          </div>

        </Card>

      </div>

    </div>

  );

}
