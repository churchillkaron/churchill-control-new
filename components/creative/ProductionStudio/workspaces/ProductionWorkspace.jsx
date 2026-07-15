"use client";

function assetUrl(asset) {
  return (
    asset?.image_url ||
    asset?.thumbnail_url ||
    asset?.file_url ||
    asset?.url ||
    ""
  );
}

function isVideo(asset) {
  const url = assetUrl(asset).toLowerCase();
  return (
    asset?.asset_type?.toLowerCase?.().includes("video") ||
    url.includes(".mp4") ||
    url.includes(".mov") ||
    url.includes(".webm")
  );
}

export default function ProductionWorkspace({
  runtime,
}) {

  const production =
    runtime.productionRuntime?.current;

  const project =
    runtime.projectRuntime?.current;

  const tasks =
    runtime.taskRuntime?.items || [];

  const assets =
    runtime.assetRuntime?.items || [];

  const selectedAsset =
    assets[0] || null;

  const previewUrl =
    assetUrl(selectedAsset);

  return (

    <div className="h-full overflow-auto">

      <div className="border-b border-white/10 p-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Production
        </div>

        <div className="mt-2 text-3xl font-semibold">
          {project?.name || production?.title || "Production"}
        </div>

        {!production && (
          <div className="mt-3 text-sm text-white/40">
            No production document yet. Showing available creative assets.
          </div>
        )}

      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-0">

        <section className="min-h-[420px] border-r border-white/10 p-8">

          {previewUrl ? (

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">

              {isVideo(selectedAsset) ? (

                <video
                  src={previewUrl}
                  controls
                  className="h-[420px] w-full object-contain"
                />

              ) : (

                <img
                  src={previewUrl}
                  alt={
                    selectedAsset?.name ||
                    selectedAsset?.title ||
                    "Creative asset"
                  }
                  className="h-[420px] w-full object-contain"
                />

              )}

            </div>

          ) : (

            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-white/35">
              No preview asset found.
            </div>

          )}

          <div className="mt-6 grid grid-cols-4 gap-4">

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Status</div>
              <div className="mt-2">
                {production?.status || "Asset Preview"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Tasks</div>
              <div className="mt-2 text-2xl">{tasks.length}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Assets</div>
              <div className="mt-2 text-2xl">{assets.length}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Queue</div>
              <div className="mt-2 text-2xl">
                {runtime.queueRuntime?.total || 0}
              </div>
            </div>

          </div>

        </section>

        <aside className="p-6">

          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
            Assets
          </div>

          <div className="space-y-3">

            {assets.map(asset => {

              const url =
                assetUrl(asset);

              return (

                <div
                  key={asset.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >

                  {url && (

                    isVideo(asset) ? (

                      <video
                        src={url}
                        className="mb-3 h-24 w-full rounded-lg object-cover"
                      />

                    ) : (

                      <img
                        src={url}
                        alt={asset.name || asset.title || "Asset"}
                        className="mb-3 h-24 w-full rounded-lg object-cover"
                      />

                    )

                  )}

                  <div className="text-sm font-medium">
                    {asset.name || asset.title || asset.asset_type || "Creative Asset"}
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    {asset.provider || asset.asset_type || "asset"}
                  </div>

                </div>

              );

            })}

            {!assets.length && (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
                Empty
              </div>
            )}

          </div>

        </aside>

      </div>

    </div>

  );

}
