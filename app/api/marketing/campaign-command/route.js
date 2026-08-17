export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeDirectorRuntime } from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function errorResponse(error, fallback = "Marketing command failed") {
  const status = Number(error?.status || 500);
  return NextResponse.json(
    {
      success: false,
      error: error?.message || fallback,
      code: error?.code || null,
    },
    { status },
  );
}

async function requireAccess({ organizationId, request, permissions = null }) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    ...(permissions?.length ? { requiredAnyPermission: permissions } : {}),
  });

  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  return access;
}

async function accessibleOrganizations(access, request) {
  const staffAccountId = access.access?.staffAccountId || access.staff?.id || null;
  if (!staffAccountId) return [];

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("organization_id,status")
    .eq("staff_account_id", staffAccountId)
    .limit(1000);

  if (membershipError) throw membershipError;

  const ids = [
    ...new Set(
      (memberships || [])
        .filter((row) => !["inactive", "disabled", "suspended", "revoked"].includes(
          String(row.status || "").toLowerCase(),
        ))
        .map((row) => row.organization_id)
        .filter(Boolean),
    ),
  ];

  if (!ids.includes(access.organizationId)) ids.unshift(access.organizationId);

  const verified = [];
  for (const organizationId of ids) {
    const candidate = await requireOrganizationAccess({ organizationId, request });
    if (candidate.success) verified.push(organizationId);
  }

  if (!verified.length) return [];

  const { data: organizations, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,organization_type,status,industry")
    .in("id", verified)
    .order("name", { ascending: true });

  if (organizationError) throw organizationError;
  return organizations || [];
}

function campaignContent(input = {}) {
  const channels = list(input.channels);
  const audienceSegments = list(input.audienceSegments);

  return {
    spend_state: "planned_not_authorized",
    goal: text(input.objective),
    offer: text(input.offer),
    primary_cta: text(input.primaryCta),
    core_message: text(input.coreMessage),
    channels,
    audience: {
      market: text(input.market),
      approach: text(input.audienceApproach),
      segments: audienceSegments,
    },
    creative_direction: {
      style: text(input.creativeDirection),
      content_pillars: list(input.contentPillars),
    },
    measurement: list(input.measurement),
    strategy_state: "ready_for_avantiqo_execution",
    source: "marketing_command_center",
    created_without_prompt: true,
  };
}

async function createCampaignForOrganization({ organization, input, access }) {
  const name = text(input.name, "New Campaign");
  const campaignName = input.organizationIds?.length > 1
    ? `${organization.name} | ${name}`
    : name;

  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .insert({
      organization_id: organization.id,
      campaign_name: campaignName,
      campaign_type: text(input.campaignType, "growth"),
      campaign_status: "draft",
      scheduled_at: input.startDate ? `${input.startDate}T00:00:00.000Z` : null,
      budget: amount(input.organizationBudget),
      campaign_content: campaignContent(input),
      performance_metrics: {},
      created_by: access.userId || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function createCampaign(input, request) {
  const ownerOrganizationId = text(input.ownerOrganizationId);
  const ownerAccess = await requireAccess({ organizationId: ownerOrganizationId, request });
  const available = await accessibleOrganizations(ownerAccess, request);
  const availableById = new Map(available.map((organization) => [organization.id, organization]));
  const requestedIds = [
    ...new Set(list(input.organizationIds).map(String).filter(Boolean)),
  ];

  if (!requestedIds.length) requestedIds.push(ownerOrganizationId);

  const organizations = [];
  for (const organizationId of requestedIds) {
    if (!availableById.has(organizationId)) {
      const error = new Error("One or more selected organizations are not accessible");
      error.status = 403;
      throw error;
    }
    await requireAccess({ organizationId, request });
    organizations.push(availableById.get(organizationId));
  }

  if (!text(input.name) || !text(input.objective)) {
    const error = new Error("Campaign name and objective are required");
    error.status = 400;
    throw error;
  }

  const createdCampaigns = [];
  let group = null;

  try {
    for (const organization of organizations) {
      createdCampaigns.push(
        await createCampaignForOrganization({
          organization,
          input: { ...input, organizationIds: requestedIds },
          access: ownerAccess,
        }),
      );
    }

    if (organizations.length > 1) {
      const masterBudget = amount(input.masterBudget);
      const { data: createdGroup, error: groupError } = await supabaseAdmin
        .from("marketing_campaign_groups")
        .insert({
          organization_id: ownerOrganizationId,
          campaign_group_name: text(input.name),
          campaign_group_type: "multi_organization",
          campaign_status: "draft",
          objective: text(input.objective),
          start_date: input.startDate || null,
          end_date: input.endDate || null,
          budget: masterBudget,
          currency_code: text(input.currencyCode, "THB"),
          campaign_content: {
            spend_state: "planned_not_authorized",
            total_monthly_budget_thb: masterBudget,
            organization_media_budget_thb:
              amount(input.organizationBudget) * organizations.length,
            source: "marketing_command_center",
            created_without_prompt: true,
          },
          performance_metrics: {},
          created_by: ownerAccess.userId || null,
        })
        .select("*")
        .single();

      if (groupError) throw groupError;
      group = createdGroup;

      const members = createdCampaigns.map((campaign, index) => ({
        campaign_group_id: group.id,
        marketing_campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        member_role: index === 0 ? "lead" : "participant",
        member_status: "active",
        sequence_no: index,
      }));

      const { error: memberError } = await supabaseAdmin
        .from("marketing_campaign_group_members")
        .insert(members);

      if (memberError) throw memberError;
    }

    return {
      group,
      campaigns: createdCampaigns,
      mode: organizations.length > 1 ? "multi_organization" : "single_organization",
    };
  } catch (error) {
    if (group?.id) {
      await supabaseAdmin.from("marketing_campaign_groups").delete().eq("id", group.id);
    }
    if (createdCampaigns.length) {
      await supabaseAdmin
        .from("marketing_campaigns")
        .delete()
        .in("id", createdCampaigns.map((campaign) => campaign.id));
    }
    throw error;
  }
}

function missionPayload(campaign) {
  const content = campaign.campaign_content || {};
  return {
    organization_id: campaign.organization_id,
    campaign_id: campaign.id,
    title: campaign.campaign_name,
    business_goal: content.goal || campaign.campaign_name,
    objective: content.core_message || content.goal || campaign.campaign_name,
    audience: content.audience || {},
    channels: list(content.channels),
    metadata: {
      source: "marketing_campaign_command_center",
      campaign_name: campaign.campaign_name,
      offer: content.offer || "",
      call_to_action: content.primary_cta || "",
      creative_direction: content.creative_direction || {},
      measurement: list(content.measurement),
      requested_outputs: list(content.channels),
      spend_state: content.spend_state || "planned_not_authorized",
      creative_solution_source: "DIRECTOR_RESOLVED_FROM_CAMPAIGN_CONTEXT",
    },
  };
}

async function getCampaign({ organizationId, campaignId }) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function ensureMission(campaign) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("creative_missions")
    .select("*")
    .eq("organization_id", campaign.organization_id)
    .eq("campaign_id", campaign.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const mission = existing || await CreativeMissionRuntime.create(missionPayload(campaign));
  return CreativeMissionRuntime.start(mission.id);
}

async function prepareCreative(input, request, execute = false) {
  const organizationId = text(input.organizationId);
  const campaignId = text(input.campaignId);
  if (!organizationId || !campaignId) {
    const error = new Error("organizationId and campaignId are required");
    error.status = 400;
    throw error;
  }

  const access = await requireAccess({
    organizationId,
    request,
    permissions: execute
      ? ["creative.execute", "creative.production.run", "creative.*"]
      : null,
  });
  const campaign = await getCampaign({ organizationId, campaignId });
  const mission = await ensureMission(campaign);
  const projectId = mission.runtime_context?.creative_project_id || null;

  let execution = null;
  if (execute) {
    execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: mission.id,
      creative_project_id: projectId,
      objective: campaign.campaign_content?.goal || campaign.campaign_name,
      business_goal: campaign.campaign_content?.goal || campaign.campaign_name,
      requestedOutputs: list(campaign.campaign_content?.channels),
      requested_by_user_id: access.userId,
      requested_by_staff_account_id: access.access?.staffAccountId || null,
      execution_access: {
        authenticated: true,
        role: access.role || null,
        permissions: access.permissions || [],
      },
    });
  }

  return {
    campaign: {
      id: campaign.id,
      organization_id: campaign.organization_id,
      campaign_name: campaign.campaign_name,
    },
    mission,
    execution,
    studio_path: `/workspace/${organizationId}/commercial/design/mission/${mission.id}`,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = text(body.action, "context").toLowerCase();

    if (action === "context") {
      const access = await requireAccess({
        organizationId: body.ownerOrganizationId,
        request,
      });
      const organizations = await accessibleOrganizations(access, request);
      return NextResponse.json({ success: true, data: { organizations } });
    }

    if (action === "create_campaign") {
      const data = await createCampaign(body, request);
      return NextResponse.json({ success: true, data });
    }

    if (action === "prepare_creative") {
      const data = await prepareCreative(body, request, false);
      return NextResponse.json({ success: true, data });
    }

    if (action === "execute_creative") {
      const data = await prepareCreative(body, request, true);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported marketing command" },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
