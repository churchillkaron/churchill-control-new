"use client";

import { deleteQueuedCampaign }
from "@/lib/supabase/deleteQueuedCampaign";



export default function QueuePanel({

  queuedCampaigns = [],

  setQueuedCampaigns,

}) {

  return (

    <div
      className="
        bg-white/5
        border
        border-white/10
        rounded-2xl
        p-5
        mt-6
      "
    >

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.2em]
          text-xs
          mb-5
        "
      >
        Scheduled Queue
      </div>

      {queuedCampaigns.length === 0 && (

        <div
          className="
            text-white/40
            text-sm
          "
        >
          No queued campaigns yet.
        </div>

      )}

      <div
        className="
          space-y-4
          max-h-[320px]
          overflow-auto
          pr-2
        "
      >

        {queuedCampaigns.map(
          (item) => {

            const campaign =
              item.marketing_campaigns;

            return (

              <div
                key={item.id}
                className="
                  bg-black/30
                  border
                  border-white/10
                  rounded-2xl
                  p-4
                "
              >

                <div
                  className="
                    text-white
                    font-semibold
                    mb-2
                  "
                >
                  {campaign?.title}
                </div>

                <div
                  className="
                    text-white/50
                    text-sm
                    mb-2
                  "
                >
                  {campaign?.campaign_type}
                </div>

                <div
                  className="
                    text-blue-400
                    text-xs
                    uppercase
                    tracking-[0.2em]
                    mb-2
                  "
                >
                  {item.platform}
                </div>

                <div
                  className="
                    text-green-400
                    text-xs
                  "
                >
                  {item.status}
                </div>

                <div
                  className="
                    text-white/40
                    text-xs
                    mt-2
                  "
                >
                  Scheduled:
                  {" "}
                  {new Date(
                    item.scheduled_for
                  ).toLocaleString()}
                </div>

                <div
                  className="
                    flex
                    gap-2
                    mt-4
                  "
                >

                  <button
                    onClick={async () => {

                      const response =
  await fetch(
    "/api/marketing/publish-now",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({
          campaignId,
        }),
    }
  );

const result =
  await response.json();

                      if (!result.success) {

                        alert(
                          result.error
                        );

                        return;

                      }

                      alert(
                        "Campaign published successfully"
                      );

                      setQueuedCampaigns(

                        queuedCampaigns.filter(
                          (queueItem) =>

                            queueItem.id !==
                            item.id
                        )

                      );

                    }}
                    className="
                      flex-1
                      bg-green-500/20
                      hover:bg-green-500/30
                      border
                      border-green-500/30
                      text-green-300
                      rounded-xl
                      py-2
                      text-xs
                      uppercase
                      tracking-[0.2em]
                      transition-all
                    "
                  >
                    Publish
                  </button>

                  <button
                    onClick={async () => {

                      const result =
                        await deleteQueuedCampaign({

                          queueId:
                            item.id,

                        });

                      if (!result.success) {

                        alert(
                          result.error
                        );

                        return;

                      }

                      setQueuedCampaigns(

                        queuedCampaigns.filter(
                          (queueItem) =>

                            queueItem.id !==
                            item.id
                        )

                      );

                    }}
                    className="
                      flex-1
                      bg-red-500/20
                      hover:bg-red-500/30
                      border
                      border-red-500/30
                      text-red-300
                      rounded-xl
                      py-2
                      text-xs
                      uppercase
                      tracking-[0.2em]
                      transition-all
                    "
                  >
                    Cancel
                  </button>

                </div>

              </div>

            );

          }
        )}

      </div>

    </div>

  );

}