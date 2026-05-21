"use client";

import { supabase } from "@/lib/shared/supabase/client";

export default function QueuePanel({
  queuedCampaigns = [],
  setQueuedCampaigns,
  setActiveAsset,
}) {
  const openAsset = (item) => {
    if (!setActiveAsset) return;

    const mediaUrl =
      item?.video_url ||
      item?.file_url ||
      item?.image_url ||
      item?.thumbnail_url ||
      null;

    const isVideo =
      item?.is_video ||
      item?.tags?.includes("video") ||
      item?.video_url;

    if (!mediaUrl) return;

    setActiveAsset({
      type: isVideo ? "video" : "image",
      url: mediaUrl,
      asset: item,
    });
  };

  const deleteQueueItem = async (id) => {
    if (!id) return;

    const confirmDelete = window.confirm(
      "Remove queued campaign?"
    );

    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from("campaign_publish_queue")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        return;
      }

      setQueuedCampaigns((prev) =>
        prev.filter((item) => item.id !== id)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const publishNow = async (campaign) => {
    try {
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
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="
        bg-black/30
        border border-white/10
        rounded-2xl
        p-5
      "
    >
      <div
        className="
          text-orange-400
          uppercase
          tracking-[0.2em]
          text-xs
          mb-4
        "
      >
        Scheduled Queue
      </div>

      <div
        className="
          max-h-[500px]
          overflow-y-auto
          pr-2
          space-y-4
        "
      >
        {queuedCampaigns?.length === 0 && (
          <div className="text-white/40 text-sm">
            No queued campaigns
          </div>
        )}

        {queuedCampaigns?.map((item) => {
          const mediaUrl =
            item?.video_url ||
            item?.file_url ||
            item?.image_url ||
            item?.thumbnail_url ||
            null;

          const isVideo =
            item?.is_video ||
            item?.tags?.includes("video") ||
            item?.video_url;

          return (
            <div
              key={item.id}
              className="
                bg-black/40
                border border-white/10
                rounded-2xl
                p-4
                relative
              "
            >
              <button
                onClick={() =>
                  deleteQueueItem(item.id)
                }
                className="
                  absolute
                  top-3
                  right-3
                  w-8
                  h-8
                  rounded-full
                  bg-red-500
                  text-white
                  text-sm
                "
              >
                ×
              </button>

              <div
                onClick={() =>
                  openAsset(item)
                }
                className="
                  w-full
                  h-40
                  rounded-xl
                  overflow-hidden
                  bg-black
                  border border-white/10
                  mb-4
                  cursor-pointer
                "
              >
                {mediaUrl ? (
                  isVideo ? (
                    <video
                      src={mediaUrl}
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt={item.name}
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />
                  )
                ) : (
                  <div
                    className="
                      w-full
                      h-full
                      flex
                      items-center
                      justify-center
                      text-white/30
                    "
                  >
                    No Media
                  </div>
                )}
              </div>

              <div className="text-white text-2xl mb-1">
                {item.title || item.name || "Campaign"}
              </div>

              <div className="text-white/60 mb-2">
                {item.subtitle ||
                  item.campaign_name ||
                  "Scheduled Campaign"}
              </div>

              <div className="text-blue-400 text-sm mb-2">
                META
              </div>

              <div className="text-green-400 text-sm mb-3">
                {item.status || "queued"}
              </div>

              {item.scheduled_for && (
                <div className="text-white/40 text-sm mb-4">
                  Scheduled:{" "}
                  {new Date(
                    item.scheduled_for
                  ).toLocaleString()}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    publishNow(item)
                  }
                  className="
                    flex-1
                    bg-green-900/40
                    border border-green-500/30
                    text-green-300
                    py-3
                    rounded-xl
                  "
                >
                  PUBLISH
                </button>

                <button
                  onClick={() =>
                    deleteQueueItem(item.id)
                  }
                  className="
                    flex-1
                    bg-red-900/40
                    border border-red-500/30
                    text-red-300
                    py-3
                    rounded-xl
                  "
                >
                  CANCEL
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}