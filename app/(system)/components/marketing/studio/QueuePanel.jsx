"use client";

import { supabase } from "@/lib/shared/supabase/client";

export default function QueuePanel({
  queuedCampaigns = [],
  setQueuedCampaigns,
  setActiveAsset,
}) {
  const openAsset = (item) => {
    const mediaUrl =
      item?.video_url ||
      item?.file_url ||
      item?.image_url ||
      item?.thumbnail_url ||
      item?.marketing_campaigns?.campaign_content?.image_url ||
      null;

    if (!mediaUrl) return;

    const isVideo = item?.is_video || item?.tags?.includes("video") || item?.video_url;

    setActiveAsset?.({
      type: isVideo ? "video" : "image",
      url: mediaUrl,
      asset: item,
    });
  };

  const deleteQueueItem = async (id) => {
    if (!id) return;

    const confirmDelete = window.confirm("Remove queued campaign?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("campaign_publish_queue")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      return;
    }

    setQueuedCampaigns?.((prev) =>
      prev.filter((item) => item.id !== id)
    );
  };

  const publishNow = async (campaign) => {
    await fetch("/api/marketing/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignId: campaign.campaign_id,
        queueId: campaign.id,
      }),
    });
  };

  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6B56D]">
          Queue
        </div>
        <div className="text-xs text-white/35">
          {queuedCampaigns.length}
        </div>
      </div>

      <div className="space-y-3">
        {queuedCampaigns.length === 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 text-sm text-white/40">
            No queued campaigns.
          </div>
        )}

        {queuedCampaigns.slice(0, 8).map((item) => {
          const mediaUrl =
            item?.video_url ||
            item?.file_url ||
            item?.image_url ||
            item?.thumbnail_url ||
            item?.marketing_campaigns?.campaign_content?.image_url ||
            null;

          return (
            <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-black/30 p-3">
              <div onClick={() => openAsset(item)} className="mb-3 h-24 cursor-pointer overflow-hidden rounded-xl bg-black">
                {mediaUrl ? (
                  <img src={mediaUrl} alt={item.title || "Campaign"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/25">
                    No Media
                  </div>
                )}
              </div>

              <div className="text-sm font-medium">
                {item.title || item.campaign_name || "Scheduled Campaign"}
              </div>

              <div className="mt-1 text-xs text-white/40">
                {item.status || "queued"}
              </div>

              <div className="mt-3 flex gap-2">
                <button onClick={() => publishNow(item)} className="flex-1 rounded-xl border border-[#D6B56D]/25 bg-[#D6B56D]/12 py-2 text-xs text-[#E8D39A]">
                  Publish
                </button>
                <button onClick={() => deleteQueueItem(item.id)} className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 py-2 text-xs text-red-300">
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
