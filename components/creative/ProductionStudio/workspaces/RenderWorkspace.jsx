"use client";

export default function RenderWorkspace({
  runtime,
}) {

  const jobs =
    runtime.renderingRuntime?.items ||
    runtime.renderingRuntime?.items ||
    [];

  const assets =
    runtime.assetRuntime?.items || [];

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Render Engine
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Rendering
        </div>

      </div>

      {!jobs.length ? (

        <div className="text-white/40">
          No render jobs have been created yet.
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
                    {job.title || job.name || "Render Job"}
                  </div>

                  <div className="mt-1 text-sm text-white/50">
                    {job.provider || "-"}
                  </div>

                </div>

                <div className="text-right">

                  <div>{job.status}</div>

                  <div className="mt-1 text-xs text-white/40">
                    {job.model || ""}
                  </div>

                </div>

              </div>

            </div>

          ))}

        </div>

      )}

      <div className="mt-10">

        <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/40">
          Generated Assets
        </div>

        <div className="space-y-2">

          {assets.map(asset => (

            <div
              key={asset.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >

              <div>{asset.title}</div>

              <div className="text-xs text-white/40">
                {asset.type}
              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}
