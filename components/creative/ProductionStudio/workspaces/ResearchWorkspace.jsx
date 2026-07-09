"use client";

export default function ResearchWorkspace({
  runtime,
}) {

  const reports =
    runtime.researchRuntime?.items || [];

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Research
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Market Intelligence
        </div>

      </div>

      {!reports.length ? (

        <div className="text-white/40">
          No research reports available.
        </div>

      ) : (

        <div className="space-y-4">

          {reports.map(report => (

            <div
              key={report.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-6"
            >

              <div className="flex justify-between">

                <div>

                  <div className="font-semibold">
                    {report.title || "Research Report"}
                  </div>

                  <div className="mt-2 text-sm text-white/50">
                    {report.summary}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    {report.status}
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    {report.created_at}
                  </div>

                </div>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}
