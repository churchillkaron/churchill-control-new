"use client";

import { useEffect, useState }
from "react";

import { supabase }
from "@/lib/supabase";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

import { updateCampaignStatus }
from "@/lib/supabase/updateCampaignStatus";

const PAGE_NAMES = {

  "112860474967":
    "Churchill Bar and Restaurant",

  "113408238398926":
    "Cole Ley",

  "118739891119327":
    "PCS Business Group",

  "109949861972047":
    "Pestcontrol Phuket",

  "106273351354545":
    "The New Butterfly",

};

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

      await loadCampaigns();

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

        <div
          className="
            flex
            items-center
            justify-between
            mb-10
          "
        >

          <div>

            <h1
              className="
                text-5xl
                font-light
              "
            >
              Campaign Queue
            </h1>

            <div
              className="
                text-white/40
                mt-2
              "
            >
              Multi-brand AI publishing
            </div>

          </div>

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

        <div
          className="
            grid
            lg:grid-cols-3
            gap-8
          "
        >

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
                    text-sm
                    text-blue-400
                    mb-3
                  "
                >
                  {
                    PAGE_NAMES[
                      campaign.page_id
                    ] || "Unknown Brand"
                  }
                </div>

                <div
                  className="
                    text-xs
                    uppercase
                    tracking-[0.2em]
                    text-white/40
                    mb-2
                  "
                >
                  Status:
                  {" "}
                  {campaign.status}
                </div>

                {campaign.instagram_post_id && (

                  <div
                    className="
                      text-xs
                      text-green-400
                      mb-2
                    "
                  >
                    Instagram Published
                  </div>

                )}

                {campaign.facebook_post_id && (

                  <div
                    className="
                      text-xs
                      text-blue-400
                      mb-2
                    "
                  >
                    Facebook Published
                  </div>

                )}

                {campaign.publish_error && (

                  <div
                    className="
                      text-xs
                      text-red-400
                      mb-4
                    "
                  >
                    {campaign.publish_error}
                  </div>

                )}

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
                    w-full
                  "
                >
                  Queue Publish
                </button>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}