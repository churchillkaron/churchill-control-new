import { uploadCampaignImage }
from "@/lib/supabase/uploadCampaignImage";

import { uploadGeneratedImage }
from "@/lib/supabase/uploadGeneratedImage";

import { saveCampaign }
from "@/lib/supabase/saveCampaign";

import { saveCampaignMemory }
from "@/lib/supabase/saveCampaignMemory";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

import buildCampaignCaption
from "@/lib/marketing/ai/context/buildCampaignCaption";

import engineRouter
from "@/lib/marketing/ai/router/engineRouter";

import { createGenerationJob }
from "@/lib/supabase/createGenerationJob";

import { getMarketingAssets }
from "@/lib/supabase/getMarketingAssets";

import { selectBestAssets }
from "@/lib/marketing/ai/assets/selectBestAssets";

import { incrementAssetUsage }
from "@/lib/supabase/incrementAssetUsage";

import { savePromptHistory }
from "@/lib/supabase/savePromptHistory";

import { buildCampaignDNA }
from "@/lib/marketing/ai/dna/buildCampaignDNA";

import { calculateEnginePerformance }
from "@/lib/marketing/ai/performance/calculateEnginePerformance";

import { getBestEngineForCampaign }
from "@/lib/marketing/ai/decision/getBestEngineForCampaign";

import { saveMarketingAsset }
from "@/lib/supabase/saveMarketingAsset";

function sanitizeText(
  value = ""
) {

  return String(value || "")
    .replace(/abba/gi, "Retro Disco")
    .replace(/taylor swift/gi, "Pop Night")
    .replace(/beyonce/gi, "Live Music")
    .replace(/elvis/gi, "Classic Music");

}

export async function createCampaignFlow({

  tenantId,

  pageId,

  prompt,

  poster,

  selectedAssets: providedSelectedAssets = [],

  generationJobs = [],

  previousCampaigns = [],

}) {

  const safeTenantId =
    tenantId || null;

  const safePageId =
    pageId || poster?.pageId || null;

  const safeCampaignType =
    sanitizeText(
      poster?.campaignType || "General Campaign"
    );

  const safeTitle =
    sanitizeText(
      poster?.campaignTitle || safeCampaignType
    );

  const safeSubtitle =
    sanitizeText(
      poster?.campaignSubtitle || ""
    );

  const safeExtraDirection =
    sanitizeText(
      poster?.extraDirection || ""
    );

  // =====================================
  // ENGINE DECISION
  // =====================================

  const enginePerformance =
    calculateEnginePerformance({

      jobs:
        generationJobs,

      campaigns:
        previousCampaigns,

    });

  const engineDecision =
    getBestEngineForCampaign({

      campaignType:
        safeCampaignType,

      enginePerformance,

    });

  const selectedEngine =
    poster?.engine ||
    engineDecision.engine;

  const isVideo =
    selectedEngine === "video";

  console.log(
    "AI ENGINE DECISION:",
    engineDecision
  );

  // =====================================
  // ASSETS
  // =====================================

  const allAssets =
    await getMarketingAssets({

      tenantId:
        safeTenantId,

    });

  const autoSelectedAssets =
    selectBestAssets({

      assets:
        allAssets || [],

      mood:
        poster?.mood,

      sceneType:
        safeCampaignType,

      limit: 4,

    });

  const selectedAssets =
    providedSelectedAssets?.length
      ? providedSelectedAssets
      : autoSelectedAssets;

  const sourceAsset =
    selectedAssets?.[0] || null;

  const sourceImageUrl =
    sourceAsset?.image_url ||
    sourceAsset?.file_url ||
    sourceAsset?.thumbnail_url ||
    null;

  // =====================================
  // ASSET CONTEXT
  // =====================================

  const assetContext =

    (selectedAssets || [])
      .filter(Boolean)
      .map((asset) => {

        return `

Asset:
${asset?.name || ""}

Type:
${asset?.asset_type || ""}

Tags:
${(asset?.tags || []).join(", ")}

Mood:
${asset?.analysis?.mood || ""}

Lighting:
${asset?.analysis?.lighting || ""}

Scene:
${asset?.analysis?.sceneType || ""}

`;

      })
      .join("\n");

  // =====================================
  // ENGINE
  // =====================================

  const engineConfig =
    await engineRouter({

      engine:
        selectedEngine,

      prompt,

      assets: {

        selectedAssets,

      },

      poster: {

        ...poster,

        campaignType:
          safeCampaignType,

        campaignTitle:
          safeTitle,

        campaignSubtitle:
          safeSubtitle,

        extraDirection:
          safeExtraDirection,

      },

    });

  console.log(
    "ENGINE CONFIG:",
    engineConfig
  );

  // =====================================
  // OUTPUT EXTRACTION
  // =====================================

  const generatedImageUrl =

    engineConfig?.output?.image_url ||

    engineConfig?.output?.images?.[0]?.url ||

    engineConfig?.images?.[0]?.url ||

    engineConfig?.image?.url ||

    engineConfig?.url ||

    null;

  const videoJobId =
    engineConfig?.output?.video_job_id ||
    null;

  console.log(
    "GENERATED IMAGE URL:",
    generatedImageUrl
  );

  console.log(
    "VIDEO JOB ID:",
    videoJobId
  );

  if (
    isVideo &&
    !videoJobId
  ) {

    throw new Error(

      engineConfig?.error ||

      engineConfig?.output?.error ||

      "Video generation failed"

    );

  }

  if (
    !isVideo &&
    !generatedImageUrl
  ) {

    throw new Error(

      engineConfig?.error ||

      engineConfig?.output?.error ||

      "No generated image returned"

    );

  }

  // =====================================
  // BASE64 IMAGE UPLOAD
  // =====================================

  let finalImageUrl =
    generatedImageUrl;

  let thumbnailUrl =
    isVideo
      ? sourceImageUrl
      : null;

  if (
    generatedImageUrl?.startsWith(
      "data:image"
    )
  ) {

    console.log(
      "UPLOADING BASE64 IMAGE"
    );

    const uploadResult =
      await uploadGeneratedImage({

        tenantId:
          safeTenantId,

        imageBase64:
          generatedImageUrl,

      });

    console.log(
      "UPLOAD RESULT:",
      uploadResult
    );

    if (
      uploadResult?.success
    ) {

      finalImageUrl =
        uploadResult.url;

      thumbnailUrl =
        uploadResult.thumbnail_url ||
        uploadResult.url;

    }

  }

  // =====================================
  // UPLOAD NON-VIDEO IMAGE TO STORAGE
  // =====================================

  if (
    !isVideo &&
    finalImageUrl
  ) {

    const imageBlob =
      await fetch(
        finalImageUrl
      ).then((response) =>
        response.blob()
      );

    const uploadedImageUrl =
      await uploadCampaignImage({

        file:
          imageBlob,

        tenantId:
          safeTenantId,

      });

    console.log(
      "UPLOADED IMAGE URL:",
      uploadedImageUrl
    );

    finalImageUrl =
      uploadedImageUrl ||
      finalImageUrl;

    thumbnailUrl =
      thumbnailUrl ||
      finalImageUrl;

  }

  console.log(
    "FINAL IMAGE URL:",
    finalImageUrl
  );

  // =====================================
  // CONTENT
  // =====================================

  const contentData =
    await buildCampaignCaption({

      venue:
        poster?.venue,

      campaignType:
        safeCampaignType,

      mood:
        poster?.mood,

      atmosphere:
        poster?.atmosphere,

      subject:
        sanitizeText(
          poster?.subject
        ),

      selectedBusiness:
        poster?.selectedBusiness,

    });

  // =====================================
  // ASSET USAGE
  // =====================================

  for (const asset of selectedAssets) {

    await incrementAssetUsage({

      assetId:
        asset.id,

    });

  }

  // =====================================
  // PROMPT HISTORY
  // =====================================

  await savePromptHistory({

    tenantId:
      safeTenantId,

    prompt: `

${sanitizeText(prompt || "")}

ASSET CONTEXT:

${assetContext}

`,

    recommendation: {

      mood:
        poster?.mood,

      lighting:
        poster?.lighting,

      campaignType:
        safeCampaignType,

    },

    selectedAssets,

  });

  // =====================================
  // DNA
  // =====================================

  const dna =
    buildCampaignDNA({

      assets:
        selectedAssets,

      recommendation: {

        mood:
          poster?.mood,

        lighting:
          poster?.lighting,

        sceneType:
          safeCampaignType,

      },

    });

  // =====================================
  // MASTER CAMPAIGN
  // =====================================

  const campaign = {

    tenant_id:
      safeTenantId,

    page_id:
      safePageId,

    campaign_type:
      safeCampaignType,

    layout:
      poster?.layout,

    title:
      safeTitle,

    subtitle:
      safeSubtitle,

    content:
      contentData?.fullContent || "",

    mood:
      poster?.mood,

    lighting:
      poster?.lighting,

    composition:
      poster?.composition,

    atmosphere:
      poster?.atmosphere,

    venue:
      poster?.venue,

    subject:
      sanitizeText(
        poster?.subject
      ),

    extra_direction:
      safeExtraDirection,

    dna: {

      ...dna,

      sceneType:
        safeCampaignType,

    },

    prompt: `

${sanitizeText(prompt || "")}

ASSET CONTEXT:

${assetContext}

`,

    image_url:
      isVideo
        ? sourceImageUrl
        : finalImageUrl,

    video_url:
      null,

    video_job_id:
      isVideo
        ? videoJobId
        : null,

    thumbnail_url:
      thumbnailUrl ||
      finalImageUrl ||
      sourceImageUrl ||
      null,

    engine:
      selectedEngine,

    provider:
      engineConfig?.provider || null,

    engine_reason:
      engineDecision?.reason || null,

    engine_confidence:
      engineDecision?.confidence || null,

    selected_assets:
      selectedAssets,

    status:
      isVideo
        ? "processing"
        : "ready",

    is_video:
      isVideo,

  };

  console.log(
    "MASTER CAMPAIGN INPUT:",
    campaign
  );

  const savedCampaign =
    await saveCampaign(
      campaign
    );

  console.log(
    "MASTER CAMPAIGN SAVED:",
    savedCampaign
  );

  if (!savedCampaign?.id) {

    throw new Error(
      "Campaign save failed"
    );

  }

  // =====================================
  // LINKED MARKETING ASSET
  // =====================================

  const savedAsset =
    await saveMarketingAsset({

      tenantId:
        safeTenantId,

      pageId:
        safePageId,

      campaignId:
        savedCampaign.id,

      assetType:
        "generated_campaign",

      name:
        safeTitle ||
        "Generated Campaign",

      imageUrl:
        isVideo
          ? sourceImageUrl
          : finalImageUrl,

      thumbnailUrl:
        thumbnailUrl ||
        finalImageUrl ||
        sourceImageUrl ||
        null,

      aiGenerated:
        true,

      provider:
        engineConfig?.provider || null,

      analysis: {

        engine:
          selectedEngine,

        mood:
          poster?.mood,

        atmosphere:
          poster?.atmosphere,

        campaignType:
          safeCampaignType,

        tags: [

          safeCampaignType,

          poster?.mood,

          poster?.venue,

          selectedEngine,

        ].filter(Boolean),

      },

    });

  console.log(
    "LINKED MARKETING ASSET SAVED:",
    savedAsset
  );

  // =====================================
  // GENERATION JOB
  // =====================================

  const generationJob =
    await createGenerationJob({

      tenantId:
        safeTenantId,

      campaignId:
        savedCampaign.id,

      imageUrl:
        isVideo
          ? sourceImageUrl
          : finalImageUrl,

      prompt:
        sanitizeText(prompt || ""),

      engine:
        selectedEngine,

      provider:
        engineConfig?.provider,

    });

  console.log(
    "GENERATION JOB SAVED:",
    generationJob
  );

  if (
    generationJob?.id &&
    !isVideo
  ) {

    await fetch(

      "http://localhost:3000/api/marketing/process-generation-job",

      {

        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({

            jobId:
              generationJob.id,

          }),

      }

    );

  }

  // =====================================
  // MEMORY
  // =====================================

  await saveCampaignMemory({

    tenantId:
      safeTenantId,

    pageId:
      safePageId,

    campaign:
      savedCampaign,

  });

  // =====================================
  // QUEUE
  // =====================================

  const queueResult =
    await queueCampaign({

      campaignId:
        savedCampaign.id,

      tenantId:
        savedCampaign.tenant_id ||
        safeTenantId,

      platform:
        "meta",

      scheduledFor:
        new Date()
          .toISOString(),

    });

  console.log(
    "QUEUE RESULT:",
    queueResult
  );

  return {

    ...savedCampaign,

    asset:
      savedAsset,

    queue:
      queueResult,

    generationJob,

  };

}