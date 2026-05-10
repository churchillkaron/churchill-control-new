"use client";

import { useRef, useState }
from "react";

import { usePosterState }
from "@/hooks/usePosterState";


import StudioTopBar
from "../../components/marketing/studio/StudioTopBar";

import StudioLeftPanel
from "../../components/marketing/studio/StudioLeftPanel";

import StudioCenterStage
from "../../components/marketing/studio/StudioCenterStage";

import StudioRightPanel
from "../../components/marketing/studio/StudioRightPanel";

import { runCampaignGeneration }
from "@/lib/services/runCampaignGeneration";

export const dynamic =
  "force-dynamic";
export default function Page() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const poster =
    usePosterState();

  const posterExportNodeRef =
    useRef(null);

  const [loading, setLoading] =
    useState(false);

  async function generateAIImage() {

  try {

    setLoading(true);

    const campaign =
      await runCampaignGeneration({

        tenantId,

        poster,

      });

      const [
  latestCampaign,
  setLatestCampaign,
] = useState(null);

    poster.setSelectedImage(
      campaign.image_url
    );

    setLatestCampaign(
  campaign
);

  } catch (err) {

    console.error(
      "CAMPAIGN GENERATION ERROR:",
      err
    );

    alert(
      JSON.stringify(err)
    );

  } finally {

    setLoading(false);

  }

}

  return (

    <div
      className="
        min-h-screen
        bg-black
        text-white
        overflow-hidden
      "
    >

      <StudioTopBar
        poster={poster}
      />

      <div
        className="
          relative
          h-[calc(100vh-90px)]
        "
      >

        <StudioLeftPanel
          poster={poster}
        />

        <StudioCenterStage
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

        <StudioRightPanel
          poster={poster}
          loading={loading}
          generateAIImage={
            generateAIImage
          }
          exportRef={
            posterExportNodeRef
          }
          latestCampaign={
  latestCampaign
}
        />

      </div>

    </div>

  );

}