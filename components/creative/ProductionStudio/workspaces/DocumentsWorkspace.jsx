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

export default function DocumentsWorkspace({
  runtime,
}) {

  const docs = [

    {
      title: "Mission",
      status: runtime.missionRuntime?.current?.status,
    },

    {
      title: "Creative Brief",
      status: runtime.briefRuntime?.current?.status,
    },

    {
      title: "Research",
      status: runtime.researchRuntime?.current?.status,
    },

    {
      title: "Strategy",
      status: runtime.strategyRuntime?.current?.status,
    },

    {
      title: "Storyboard",
      status: runtime.storyboardRuntime?.current?.status,
    },

    {
      title: "Production",
      status: runtime.productionRuntime?.current?.status,
    },

  ];

  return (

    <div className="h-full overflow-auto p-8 text-white">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Document Center
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Creative Documents
        </div>

      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">

        <Stat
          title="Documents"
          value={docs.length}
        />

        <Stat
          title="Completed"
          value={
            docs.filter(
              d=>d.status==="completed"
            ).length
          }
        />

        <Stat
          title="Draft"
          value={
            docs.filter(
              d=>!d.status || d.status==="draft"
            ).length
          }
        />

        <Stat
          title="Active"
          value={
            docs.filter(
              d=>d.status && d.status!=="completed"
            ).length
          }
        />

      </div>

      <Card title="Business Documents">

        <div className="space-y-3">

          {docs.map(doc=>(

            <div
              key={doc.title}
              className="rounded-xl border border-white/10 p-4 flex justify-between"
            >

              <div className="font-medium">
                {doc.title}
              </div>

              <div className="text-white/45">
                {doc.status || "Draft"}
              </div>

            </div>

          ))}

        </div>

      </Card>

    </div>

  );

}
