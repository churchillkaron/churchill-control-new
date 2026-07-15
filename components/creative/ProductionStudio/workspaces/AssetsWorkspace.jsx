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

export default function AssetsWorkspace({
  runtime,
}) {

  const assets =
    runtime.assetRuntime?.items || [];

  const current =
    runtime.assetRuntime?.current || null;

  return (

    <div className="h-full overflow-auto p-8 text-white">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Asset Library
        </div>

        <div className="mt-2 text-3xl font-semibold">
          {current?.name || "Creative Assets"}
        </div>

      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">

        <Stat
          title="Assets"
          value={assets.length}
        />

        <Stat
          title="Images"
          value={
            assets.filter(
              a=>a.asset_type==="image"
            ).length
          }
        />

        <Stat
          title="Videos"
          value={
            assets.filter(
              a=>a.asset_type==="video"
            ).length
          }
        />

        <Stat
          title="Audio"
          value={
            assets.filter(
              a=>a.asset_type==="audio"
            ).length
          }
        />

      </div>

      <div className="grid grid-cols-2 gap-6">

        <Card title="Asset Library">

          <div className="space-y-3">

            {assets.length===0 && (
              <div className="text-white/40">
                No assets available.
              </div>
            )}

            {assets.map(asset=>(

              <div
                key={asset.id}
                className="rounded-lg border border-white/10 p-4"
              >

                <div className="font-medium">
                  {asset.name || asset.filename}
                </div>

                <div className="mt-1 text-sm text-white/45">
                  {asset.asset_type || "-"}
                </div>

              </div>

            ))}

          </div>

        </Card>

        <Card title="Asset Details">

          <div className="space-y-4">

            <div className="flex justify-between">
              <span className="text-white/45">Name</span>
              <span>{current?.name || "-"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-white/45">Type</span>
              <span>{current?.asset_type || "-"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-white/45">Status</span>
              <span>{current?.status || "-"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-white/45">Usage</span>
              <span>{current?.usage_count || 0}</span>
            </div>

          </div>

        </Card>

      </div>

    </div>

  );

}
