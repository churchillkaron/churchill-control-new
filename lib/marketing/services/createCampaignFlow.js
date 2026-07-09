import { uploadCampaignImage }
from "@/lib/marketing/repositories/uploadCampaignImage";

import { uploadGeneratedImage }
from "@/lib/marketing/repositories/uploadGeneratedImage";

import { saveCampaign }
from "@/lib/marketing/repositories/saveCampaign";

import { saveCampaignMemory }
from "@/lib/marketing/repositories/saveCampaignMemory";

import { queueCampaign }
from "@/lib/marketing/repositories/queueCampaign";

import buildCampaignCaption
from "@/lib/ai/context/buildCampaignCaption";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import { createGenerationJob }
from "@/lib/marketing/repositories/createGenerationJob";

import { getMarketingAssets }
from "@/lib/marketing/repositories/getMarketingAssets";

import { selectBestAssets }
from "@/lib/ai/assets/selectBestAssets";

import { incrementAssetUsage }
from "@/lib/marketing/repositories/incrementAssetUsage";

import { savePromptHistory }
from "@/lib/marketing/repositories/savePromptHistory";

import { buildCampaignDNA }
from "@/lib/ai/context/buildCampaignDNA";


import { saveMarketingAsset }
from "@/lib/marketing/repositories/saveMarketingAsset";

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

  organizationId,

  pageId,

  prompt,

  poster,

  businessProfile = null,

  selectedAssets: providedSelectedAssets = [],

  generationJobs = [],

  previousCampaigns = [],

}) {

  const safeOrganizationId =
    organizationId || null;

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

  const selectedService =
    poster?.engine === "video"
      ? "ai.video.generate"
      : poster?.engine === "enhance"
        ? "ai.image.upscale"
        : "ai.image.generate";

  const isVideo =
    selectedService === "ai.video.generate";

  if (process.env.NODE_ENV !== "production") console.log(
    "AI SERVICE:",
    selectedService
  );

  // =====================================
  // ASSETS
  // =====================================

  const allAssets =
    await getMarketingAssets({

      organizationId:
        safeOrganizationId,

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

Description:
${asset?.analysis?.description || ""}

Objects:
${(asset?.analysis?.objects || []).join(", ")}

Activities:
${(asset?.analysis?.activities || []).join(", ")}

Venue Area:
${asset?.analysis?.venue_area || ""}

Business Angles:
${(asset?.analysis?.business_angle || []).join(", ")}

Suggested Campaign Uses:
${(asset?.analysis?.campaign_uses || []).join(", ")}

Tags:
${(asset?.tags || []).join(", ")}

Mood:
${asset?.analysis?.mood || ""}

Lighting:
${asset?.analysis?.lighting || ""}

Scene:
${asset?.analysis?.sceneType || ""}

Visual Risks:
${(asset?.analysis?.visual_risks || []).join(", ")}

Confidence:
${asset?.analysis?.asset_confidence || ""}

`;

      })
      .join("\n");

  // =====================================
  // ENGINE
  // =====================================

  const engineConfig =
    await runAIService.execute({

      organization_id:
        safeOrganizationId,

      service_id:
        selectedService,

      input: {

        prompt,

        businessProfile,

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

      },

      metadata: {

        source:
          "marketing_campaign",

        page_id:
          safePageId,

      },

    });

  if (process.env.NODE_ENV !== "production") console.log(
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

  if (process.env.NODE_ENV !== "production") console.log(
    "GENERATED IMAGE URL:",
    generatedImageUrl
  );

  if (process.env.NODE_ENV !== "production") console.log(
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

    if (process.env.NODE_ENV !== "production") console.log(
      "UPLOADING BASE64 IMAGE"
    );

    const uploadResult =
      await uploadGeneratedImage({

        organizationId:
          safeOrganizationId,

        imageBase64:
          generatedImageUrl,

      });

    if (process.env.NODE_ENV !== "production") console.log(
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

        organizationId:
          safeOrganizationId,

      });

    if (process.env.NODE_ENV !== "production") console.log(
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

  if (process.env.NODE_ENV !== "production") console.log(
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

    organizationId:
      safeOrganizationId,

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

    organization_id:
      safeOrganizationId,

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
      selectedService,

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

  if (process.env.NODE_ENV !== "production") console.log(
    "MASTER CAMPAIGN INPUT:",
    campaign
  );

  const savedCampaign =
    await saveCampaign(
      campaign
    );

  if (process.env.NODE_ENV !== "production") console.log(
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

      organizationId:
        safeOrganizationId,

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
          selectedService,

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

          selectedService,

        ].filter(Boolean),

      },

    });

  if (process.env.NODE_ENV !== "production") console.log(
    "LINKED MARKETING ASSET SAVED:",
    savedAsset
  );

  // =====================================
  // GENERATION JOB
  // =====================================

  const generationJob =
    await createGenerationJob({

      organizationId:
        safeOrganizationId,

      campaignId:
        savedCampaign.id,

      imageUrl:
        isVideo
          ? sourceImageUrl
          : finalImageUrl,

      prompt:
        sanitizeText(prompt || ""),

      engine:
        selectedService,

      provider:
        engineConfig?.provider,

      selectedAssets:
        selectedAssets,

      metadata: {
        facebook_page_id:
          safePageId,

        source_asset_ids:
          selectedAssets
            .map(asset => asset.id)
            .filter(Boolean),
      },

    });

  if (process.env.NODE_ENV !== "production") console.log(
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

    organizationId:
      safeOrganizationId,

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

      organizationId:
        savedCampaign.organization_id ||
        safeOrganizationId,

      platform:
        "meta",

      scheduledFor:
        new Date()
          .toISOString(),

    });

  if (process.env.NODE_ENV !== "production") console.log(
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