"use client";

import QueuePanel from "./QueuePanel";

export default function StudioRightPanel({
  latestCampaign,
  queuedCampaigns,
  setQueuedCampaigns,
  recommendation,
  promptPreview,
  generateCampaign,
  setActiveAsset,
}) {
  const score =
    latestCampaign?.score ||
    latestCampaign?.performance_score ||
    recommendation?.score ||
    82;

  const openAsset = (asset) => {
    const mediaUrl =
      asset?.video_url ||
      asset?.file_url ||
      asset?.image_url ||
      asset?.thumbnail_url ||
      latestCampaign?.video_url ||
      latestCampaign?.image_url ||
      null;

    if (!mediaUrl) return;

    const isVideo =
      asset?.is_video ||
      asset?.tags?.includes("video") ||
      asset?.video_url ||
      latestCampaign?.is_video;

    setActiveAsset?.({
      type: isVideo ? "video" : "image",
      url: mediaUrl,
      asset,
    });
  };

  return (
    <aside className="h-full overflow-y-auto p-4 text-white">
      <Panel title="AI Control">
        <button
          onClick={generateCampaign}
          className="w-full rounded-2xl border border-[#D6B56D]/30 bg-[#D6B56D]/15 px-4 py-3 text-sm font-semibold text-[#F2DE9B] transition hover:bg-[#D6B56D]/22"
        >
          Generate Campaign
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <Badge label="Brand" value="Live" />
          <Badge label="Memory" value="On" />
          <Badge label="Assets" value="AI" />
        </div>
      </Panel>

      <Panel title="Campaign Score">
        <div className="flex items-end gap-2">
          <div className="text-5xl font-light tracking-[-0.08em]">{score}</div>
          <div className="pb-2 text-white/40">/100</div>
        </div>

        <div className="mt-4 space-y-2">
          <Meter label="Brand Match" value={86} />
          <Meter label="Luxury Score" value={91} />
          <Meter label="Engagement" value={78} />
        </div>
      </Panel>

      <Panel title="Latest Creative">
        {latestCampaign ? (
          <button onClick={() => openAsset(latestCampaign)} className="w-full text-left">
            {(latestCampaign?.video_url || latestCampaign?.image_url || latestCampaign?.thumbnail_url) && (
              <div className="mb-3 h-36 overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
                {latestCampaign?.is_video || latestCampaign?.video_url ? (
                  <video src={latestCampaign.video_url || latestCampaign.image_url} className="h-full w-full object-cover" />
                ) : (
                  <img src={latestCampaign.image_url || latestCampaign.thumbnail_url} alt="Campaign" className="h-full w-full object-cover" />
                )}
              </div>
            )}

            <div className="text-sm font-semibold">
              {latestCampaign.title || latestCampaign.campaign_name || "Latest Campaign"}
            </div>
            <div className="mt-1 text-xs text-white/40">
              {latestCampaign.status || latestCampaign.campaign_status || "draft"}
            </div>
          </button>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 text-sm text-white/40">
            Generate a creative to see campaign details.
          </div>
        )}
      </Panel>

      <Panel title="AI Recommendation">
        <div className="text-sm leading-6 text-white/65">
          {recommendation?.summary ||
            "Use selected assets with the current brand profile to generate a campaign that matches the organization’s visual direction."}
        </div>
      </Panel>

      <Panel title="Prompt Preview">
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-black/35 p-3 text-xs leading-5 text-white/45">
          {promptPreview}
        </pre>
      </Panel>

      <QueuePanel
        queuedCampaigns={queuedCampaigns}
        setQueuedCampaigns={setQueuedCampaigns}
        setActiveAsset={setActiveAsset}
      />
    </aside>
  );
}

function Panel({ title, children }) {
  return (
    <section className="mb-4 rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[#D6B56D]">{title}</div>
      {children}
    </section>
  );
}

function Badge({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-2">
      <div className="text-white/35">{label}</div>
      <div className="mt-1 text-[#E8D39A]">{value}</div>
    </div>
  );
}

function Meter({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-white/40">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-[#D6B56D]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
