"use client";

export default function PublishingWorkspace({
  runtime,
}) {

  const jobs =
    runtime.publishingRuntime?.items ||
    runtime.publishingRuntime?.items ||
    [];

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Publishing
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Distribution
        </div>

      </div>

      {!jobs.length ? (

        <div className="text-white/40">
          No publishing jobs have been created yet.
        </div>

      ) : (

        <div className="space-y-3">

          {jobs.map(job => (

            <div
              key={job.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >

              <div className="flex justify-between">

                <div>

                  <div className="font-medium">
                    {job.channel || "Channel"}
                  </div>

                  <div className="mt-1 text-sm text-white/50">
                    {job.provider_id}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    {job.status}
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    {job.render_job_id || "-"}
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
