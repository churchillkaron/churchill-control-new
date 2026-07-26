export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

function text(value) {
  return String(value || "").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map(text)
    .filter(Boolean);
}

function missionPayload(body, organizationId) {
  const intent = text(
    body.intent ||
    body.request ||
    body.objective ||
    body.business_goal,
  );

  if (!intent) throw new Error("creative intent required");

  return {
    organization_id: organizationId,
    campaign_id: body.campaign_id || body.campaignId || null,
    title: text(body.title) || intent.slice(0, 120),
    business_goal: intent,
    objective: intent,
    audience:
      body.audience && typeof body.audience === "object"
        ? body.audience
        : {},
    channels: normalizeList(body.channels || body.target_channels),
    metadata: {
      ...(body.metadata || {}),
      source: "natural_language_creative_intent",
      production_type:
        body.production_type || body.productionType || null,
      target_duration:
        Number(body.target_duration || body.duration_seconds || 30),
      target_languages: normalizeList(
        body.target_languages || body.languages || ["en"],
      ),
      quality_profile:
        body.quality_profile || body.qualityProfile || null,
      budget_profile:
        body.budget_profile || body.budgetProfile || null,
      desired_outcome:
        text(body.desired_outcome || body.desiredOutcome),
      communication_goal:
        text(body.communication_goal || body.communicationGoal),
      call_to_action:
        text(body.call_to_action || body.callToAction),
      tone: text(body.tone),
      emotion: text(body.emotion),
      products: Array.isArray(body.products) ? body.products : [],
      markets: Array.isArray(body.markets) ? body.markets : [],
      context:
        body.context && typeof body.context === "object"
          ? body.context
          : {},
      original_intent: intent,
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      body.organization_id || body.organizationId || null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.mission.create",
        "creative.execute",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const mission = await CreativeMissionRuntime.create(
      missionPayload(body, organizationId),
    );
    const started = await CreativeMissionRuntime.start(mission.id);

    return Response.json({
      success: true,
      status: "READY_FOR_DIRECTION",
      mission: started,
      creative_mission_id: started.id,
      creative_project_id:
        started.runtime_context?.creative_project_id || null,
      creative_brief_id:
        started.runtime_context?.creative_brief_id || null,
      next_action: "RUN_CREATIVE_DIRECTOR",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
