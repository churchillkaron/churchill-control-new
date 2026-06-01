export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

import { calculateCampaignScore }
from "@/lib/marketing/ai/scoring/calculateCampaignScore";

import { updateBusinessAIProfile }
from "@/lib/marketing/repositories/updateBusinessAIProfile";

import { updateEngineLearningMemory }
from "@/lib/marketing/ai/learning/updateEngineLearningMemory";

export async function GET() {

  try {

    const {

      data: campaigns,

      error: campaignsError,

    } = await supabase

      .from("marketing_campaigns")

      .select("*")

      .eq(
        "status",
        "published"
      );

    if (campaignsError) {

      throw campaignsError;

    }

    for (const campaign of campaigns) {

      try {

        const {
          data: account,
        } = await supabase

          .from("meta_accounts")

          .select("*")

          .eq(
            "page_id",
            campaign.page_id
          )

          .single();

        if (!account) {

          continue;

        }

        // INSTAGRAM ANALYTICS

        if (
          campaign.instagram_post_id
        ) {

          const igRes =

            await fetch(

              `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${account.access_token}`

            );

          const igData =
            await igRes.json();

          console.log(
            "IG ANALYTICS:",
            igData
          );

          const performanceScore =

            calculateCampaignScore(
              igData
            );

          // UPDATE CAMPAIGN

          await supabase

            .from(
              "marketing_campaigns"
            )

            .update({

              analytics:
                igData,

              performance_score:
                performanceScore,

              analytics_updated_at:
                new Date()
                  .toISOString(),

            })

            .eq(
              "id",
              campaign.id
            );

          // UPDATE MEMORY SCORE

          await supabase

            .from(
              "campaign_memory"
            )

            .update({

              engagement_score:
                performanceScore,

              analytics:
                igData,

              updated_at:
                new Date()
                  .toISOString(),

            })

            .eq(
              "campaign_id",
              campaign.id
            )

            .eq(
              "page_id",
              campaign.page_id
            );

          // UPDATE ASSET PERFORMANCE
// LOAD GENERATION JOB

const {
  data: generationJob,
} = await supabase

  .from(
    "generation_jobs"
  )

  .select("*")

  .eq(
    "campaign_id",
    campaign.id
  )

  .order(
    "created_at",
    {
      ascending: false,
    }
  )

  .limit(1)

  .single();

// UPDATE LEARNING MEMORY

await updateEngineLearningMemory({

  tenantId:
    campaign.tenant_id,

  pageId:
    campaign.page_id,

  campaign,

  generationJob,

});
          const {
            data: assetUsage,
          } = await supabase

            .from(
              "campaign_asset_usage"
            )

            .select("*")

            .eq(
              "campaign_id",
              campaign.id
            );

          if (assetUsage?.length) {

            for (const usage of assetUsage) {

              await supabase

                .from(
                  "marketing_assets"
                )

                .update({

                  score:
                    performanceScore,

                  last_performance_score:
                    performanceScore,

                  updated_at:
                    new Date()
                      .toISOString(),

                })

                .eq(
                  "id",
                  usage.asset_id
                );

            }

          }

          // UPDATE BUSINESS AI PROFILE

          await updateBusinessAIProfile({

            tenantId:
              campaign.tenant_id,

            pageId:
              campaign.page_id,

          });

        }

      } catch (campaignError) {

        console.error(
          "ANALYTICS ERROR:",
          campaignError
        );

      }

    }

    return NextResponse.json({

      success: true,

    });

  } catch (err) {

    console.error(
      "SYNC ANALYTICS ERROR:",
      err
    );

    return NextResponse.json(

      {
        success: false,

        error:
          err.message,
      },

      {
        status: 500,
      }

    );

  }

}