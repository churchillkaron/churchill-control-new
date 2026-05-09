"use client";

import { useEffect, useState }
from "react";

import { supabase }
from "@/lib/supabase";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

import { updateCampaignStatus }
from "@/lib/supabase/updateCampaignStatus";

export default function Page() {

  const [campaigns, setCampaigns] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadCampaigns();

  }, []);

  async function loadCampaigns() {

    try {

      const { data, error } =
        await supabase
          .from(
            "marketing_campaigns"
          )
          .select("*")
          .order(
            "created_at",
            { ascending: false }
          );

      if (error) {

        throw error;
      }

      setCampaigns(data || []);

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);
    }
  }

  if (loading) {

    return (

      <div
        className="
          min-h-screen
          bg-black
          text-white
          p-10
        "
      >
        Loading campaigns...
      </div>

    );
  }
async function publishCampaign(
  campaign
) {

  try {

    await queueCampaign({

      campaignId:
        campaign.id,

      platform:
        "instagram",

      scheduledFor:
        new Date()
          .toISOString(),
    });
await updateCampaignStatus({

  campaignId:
    campaign.id,

  status:
    "queued",
});
    alert(
      "Campaign queued"
    );

  } catch (err) {

    console.error(err);

    alert(
      "Queue failed"
    );
  }
}
async function processQueue() {

  try {

    const res =
      await fetch(
        "/api/marketing/process-queue",
        {
          method: "POST",
        }
      );

    const data =
      await res.json();

    console.log(data);

    await loadCampaigns();

    alert(
      "Queue processed"
    );

  } catch (err) {

    console.error(err);

    alert(
      "Processing failed"
    );
  }
}
  return (

    <div
      className="
        min-h-screen
        bg-black
        text-white
        p-10
      "
    >

      <div
        className="
          max-w-[1600px]
          mx-auto
        "
      >

        <h1
          className="
            text-5xl
            font-light
            mb-10
          "
        >
          Campaign Queue
        </h1>

        <div
          className="
            grid
            lg:grid-cols-3
            gap-8
          "
        >
<div className="mb-8">

  <button
    onClick={processQueue}
    className="
      bg-orange-500
      text-black
      px-6
      py-3
      rounded-xl
      font-bold
    "
  >
    Process Queue
  </button>

</div>
          {campaigns.map((campaign) => (

            <div
              key={campaign.id}
              className="
                bg-white/5
                border
                border-white/10
                rounded-3xl
                overflow-hidden
              "
            >

              {campaign.image_url && (

                <img
                  src={campaign.image_url}
                  alt=""
                  className="
                    w-full
                    h-[400px]
                    object-cover
                  "
                />

              )}

              <div className="p-6">

                <div
                  className="
                    text-orange-500
                    uppercase
                    tracking-[0.2em]
                    text-sm
                    mb-3
                  "
                >
                  {campaign.campaign_type}
                </div>

                <h2
                  className="
                    text-3xl
                    mb-3
                  "
                >
                  {campaign.title}
                </h2>

                <div
                  className="
                    text-white/60
                    mb-5
                  "
                >
                  {campaign.subtitle}
                </div>

                <div
                  className="
                    flex
                    items-center
                    justify-between
                  "
                >

                  <div
                    className="
                      text-xs
                      uppercase
                      tracking-[0.2em]
                      text-white/40
                    "
                  >
                    {campaign.status}
                  </div>

                  <button
  onClick={() =>
    publishCampaign(
      campaign
    )
  }
  className="
    bg-blue-500
    px-4
    py-2
    rounded-xl
  "
>
  Queue Publish
</button>

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );
}