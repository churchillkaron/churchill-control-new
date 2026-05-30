"use client";

export const dynamic = "force-dynamic";





import {
  useRef,
  useState,
  useEffect,
}
from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

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

import PublishPanel
from "@/app/(system)/components/marketing/studio/PublishPanel";


import { getQueuedCampaigns }
from "@/lib/supabase/getQueuedCampaigns";

import { getMetaAccounts }
from "@/lib/supabase/getMetaAccounts";

import { getGenerationJobs }
from "@/lib/supabase/getGenerationJobs";

import AssetLibraryPanel
from "@/app/(system)/components/marketing/studio/AssetLibraryPanel";

import { getMarketingAssets }
from "@/lib/supabase/getMarketingAssets";

import AssetUploadPanel
from "@/app/(system)/components/marketing/studio/AssetUploadPanel";

import { getCampaignRecommendation }
from "@/lib/marketing/ai/recommendations/getCampaignRecommendation";

import { getBestPromptHistory }
from "@/lib/supabase/getBestPromptHistory";

import { engineCapabilities }
from "@/lib/marketing/ai/router/engineCapabilities";

export default function Page() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const poster =
    usePosterState();

  const posterExportNodeRef =
    useRef(null);

  const [loading, setLoading] =
    useState(false);

  const [
    latestCampaign,
    setLatestCampaign,
  ] = useState(null);

  const [
    queuedCampaigns,
    setQueuedCampaigns,
  ] = useState([]);

  const [
    metaAccounts,
    setMetaAccounts,
  ] = useState([]);

  const [
    generationJobs,
    setGenerationJobs,
  ] = useState([]);

 const [
  marketingAssets,
  setMarketingAssets,
] = useState([]);

const [
  activeAsset,
  setActiveAsset,
] = useState(null);

const [
  selectedAssets,
  setSelectedAssets,
] = useState([]);

const engineConfig =

  engineCapabilities[
    poster.engine
  ] || {};
  
const [
  promptHistory,
  setPromptHistory,
] = useState([]);

const recommendation =
  getCampaignRecommendation({

    assets:
      selectedAssets,

    promptHistory,

  });

  const promptPreview = `

Mood:
${poster.mood}

Lighting:
${poster.lighting}

Venue:
${poster.venue}

Campaign:
${poster.campaignType}

Atmosphere:
${poster.atmosphere}

Selected Assets:
${selectedAssets
  .map((a) => a.name)
  .join(", ")}

`;

useEffect(() => {

  if (!selectedAssets.length) {

    return;

  }

  if (
    recommendation?.mood &&
    poster.mood !==
      recommendation.mood
  ) {

    poster.setMood(
      recommendation.mood
    );

  }

  if (
    recommendation?.lighting &&
    poster.lighting !==
      recommendation.lighting
  ) {

    poster.setLighting(
      recommendation.lighting
    );

  }

}, [

  selectedAssets,

  recommendation,

]);
  useEffect(() => {

    async function loadData() {

      const assets =
  await getMarketingAssets({

    tenantId,

  });

setMarketingAssets(
  assets
);
const history =
  await getBestPromptHistory({
    tenantId,
  });

setPromptHistory(
  history
);

      const accounts =
        await getMetaAccounts({

          tenantId,

        });
if (latestCampaign?.id) {


  const response =
    await fetch(

      `/api/marketing/campaign/${latestCampaign.id}`

    );

  const refreshedCampaign =
    await response.json();

  if (
    refreshedCampaign?.id
  ) {

    setLatestCampaign(
      refreshedCampaign
    );

    if (
      refreshedCampaign.image_url
    ) {

      poster.setSelectedImage(
        refreshedCampaign.image_url
      );

    }

  }

}
      setMetaAccounts(
        accounts
      );

      const queueData =
        await getQueuedCampaigns({

          tenantId,

        });

      setQueuedCampaigns(
        queueData
      );

      const jobs =
        await getGenerationJobs({

          tenantId,

        });

      setGenerationJobs(
        jobs
      );

    }

   loadData();

const interval =

  setInterval(() => {

    loadData();

  }, 4000);

return () =>
  clearInterval(interval);



  }, []);

  async function refreshAssets() {

  const assets =
    await getMarketingAssets({

      tenantId,

    });

  setMarketingAssets(
    assets
  );
const history =
  await getBestPromptHistory({

    tenantId,

  });

setPromptHistory(
  history
);
}

  async function generateAIImage() {

    try { 
      
      if (!poster.pageId) {

  alert(
    "Please choose a connected business before generating a campaign."
  );

  return;

}
if (

  engineConfig.requiresImage &&

  !selectedAssets.length &&

  !poster.selectedImage

) {

  alert(
    "This engine requires a source image. Select an asset or upload an image first."
  );

  return;

}

      setLoading(true);

     const response =
  await fetch(
    "/api/marketing/generate",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
  JSON.stringify({

    tenantId,

    poster,

    selectedAssets,

    pageId:
      poster.pageId,

    selectedBusiness:

      metaAccounts.find(
        (a) =>
          a.page_id ===
          poster.pageId
      ) || null,

  }),
    }
  );

const data =
  await response.json();

if (!response.ok || !data.success) {

  throw new Error(
    data.error ||
    "Generation failed"
  );

}

const campaign =
  data.campaign;

setLatestCampaign(
  campaign
);
// =====================================
// VIDEO ENGINE POLLING
// =====================================

if (

  engineConfig.supportsVideo &&

  data?.output?.job_id

) {

  const pollVideo = async () => {

    try {

      const statusResponse =
        await fetch(

          "/api/marketing/video-status",

          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

            },

            body: JSON.stringify({

              jobId:
                data.output.job_id,

            }),

          }

        );

      const statusData =
        await statusResponse.json();

      console.log(
        "VIDEO STATUS:",
        statusData
      );

      // =====================================
      // COMPLETED
      // =====================================

      if (
        statusData?.status ===
        "completed"
      ) {

        setLatestCampaign(

          (prev) => ({

            ...prev,

            video_url:
              statusData.video_url,

            image_url:
              statusData.video_url,

            is_video:
              true,

          })

        );

        return;

      }

      // =====================================
      // FAILED
      // =====================================

      if (
        statusData?.status ===
        "failed"
      ) {

        alert(

          statusData.error ||

          "Video failed"

        );

        return;

      }

      // =====================================
      // KEEP POLLING
      // =====================================

      setTimeout(
        pollVideo,
        5000
      );

    } catch (err) {

      console.error(
        "VIDEO POLLING ERROR:",
        err
      );

    }

  };

  // START POLLING

  pollVideo();

}

const queueData =
  await getQueuedCampaigns({

    tenantId,

  });

setQueuedCampaigns(
  queueData
);

const jobs =
  await getGenerationJobs({

    tenantId,

  });

setGenerationJobs(
  jobs
);

    } catch (err) {

      console.error(
        "CAMPAIGN GENERATION ERROR:",
        err
      );

      console.error(
        "FULL GENERATION ERROR:",
        err
      );

      alert(
        err.message ||
        "Generation failed"
      );

    } finally {

      setLoading(false);

    }

  }
async function generateCampaign() {

  try {

    console.log(
      "GENERATING CAMPAIGN..."
    );

    if (!poster.pageId) {

  alert(
    "Please choose a connected business first."
  );

  return;

}

    const response =
      await fetch(

        "/api/marketing/generate",

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

  tenantId,

  pageId:
    poster.pageId,


  prompt:
    promptPreview,

  poster,

  selectedBusiness:

    metaAccounts.find(
      (a) =>
        a.page_id ===
        poster.pageId
    ) || null,

}),

        }

      );

    const data =
      await response.json();

    console.log(
      "GENERATION RESULT:",
      data
    );

    if (data?.campaign) {

      setLatestCampaign(
        data.campaign
      );

    }

  } catch (err) {

    console.error(
      "GENERATE CAMPAIGN ERROR:",
      err
    );

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
          metaAccounts={
            metaAccounts
          }
        />
<StudioCenterStage
  poster={poster}
  exportRef={posterExportNodeRef}
  selectedAssets={selectedAssets}
  setSelectedAssets={setSelectedAssets}
  latestCampaign={latestCampaign}
  activeAsset={activeAsset}
  setActiveAsset={setActiveAsset}
/>

        <div
          className="
            absolute
            right-8
            top-8
            bottom-8
            w-[380px]
            flex
            flex-col
            gap-6
            overflow-y-auto
            pr-2
            z-20
          "
        >

          <PublishPanel

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

  pageId={
    poster.pageId
  }

  selectedBusiness={

    metaAccounts.find(
      (a) =>
        a.page_id ===
        poster.pageId
    ) || null

  }

/>
          <StudioRightPanel
  latestCampaign={latestCampaign}
  queuedCampaigns={queuedCampaigns}
  setQueuedCampaigns={setQueuedCampaigns}
  recommendation={recommendation}
  promptPreview={promptPreview}
  promptHistory={promptHistory}
  generateCampaign={generateCampaign}
  setActiveAsset={setActiveAsset}
/>
          
<AssetLibraryPanel

  assets={marketingAssets}

  selectedBusiness={
    poster.pageId
  }

  refreshAssets={
    refreshAssets
  }

  onSelectAsset={(asset) => {

    setSelectedAssets(
      (prev) => {

        const exists =
          prev.find(
            (a) =>
              a.id === asset.id
          );

        if (exists) {

          return prev;

        }

        return [

          ...prev,

          asset,

        ];

      }
    );

  }}

/>
<AssetUploadPanel
  tenantId={tenantId}
  pageId={poster.pageId}
  refreshAssets={refreshAssets}
  metaAccounts={metaAccounts}
/>
        </div>

      </div>

    </div>

  );

}