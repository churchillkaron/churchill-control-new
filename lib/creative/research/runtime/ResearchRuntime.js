import {
  createResearchReport,
} from "../documents/ResearchReport";
import {
  buildResearchPlan,
} from "../reasoning/ResearchDirector";
import * as Repository from "../repositories/ResearchRepository";
import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeMeasuredUniversalTemporalDirectionRuntime,
} from "@/lib/creative/director/runtime/CreativeMeasuredUniversalTemporalDirectionRuntime";
import {
  CreativeUniversalAssetIntelligenceRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime";
import {
  sanitizeCreativePromptlessDirectionSpec,
} from "@/lib/creative/director/runtime/CreativePromptlessDirectionSpecRuntime";
import {
  CreativeStoryLineageContractRuntime,
} from "@/lib/creative/director/runtime/CreativeStoryLineageContractRuntime";
import {
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";
import {
  InternalCreativeResearchRuntime,
} from "./InternalCreativeResearchRuntime";

const RESEARCH_GATE_FLAG = Symbol.for(
  "avantiqo.creative.research.master-plan-gate.v7",
);

const COMPLETED_PAID_RESEARCH_STATUSES = new Set([
  "COMPLETED",
  "COMPLETED_FROM_EXISTING_USAGE",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function plainText(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function identity(value) {
  return plainText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identitiesAgree(left, right) {
  const a = identity(left);
  const b = identity(right);
  if (!a || !b) return true;
  return a === b || (a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b));
}

function hostname(value) {
  const raw = plainText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return raw.toLowerCase().replace(/^www\./, "").replace(/\/$/, "");
  }
}

function namedCompany(project = {}, brief = {}) {
  return plainText(
    project.metadata?.company_name ||
    project.metadata?.organization_name ||
    brief.company_name ||
    brief.metadata?.company_name ||
    project.name ||
    project.title,
  );
}

function completedPaidResearchReport({ project = {}, brief = {}, existing = [] } = {}) {
  const approval = object(project.metadata?.paid_research_approval);
  const status = text(approval.status);
  const reportId = plainText(approval.research_report_id);

  if (
    approval.approved !== true ||
    approval.retry_required === true ||
    !COMPLETED_PAID_RESEARCH_STATUSES.has(status) ||
    !reportId
  ) {
    return null;
  }

  const report = list(existing).find((item) => plainText(item?.id) === reportId);
  if (!report) return null;
  if (
    plainText(report.organization_id) &&
    plainText(project.organization_id) &&
    plainText(report.organization_id) !== plainText(project.organization_id)
  ) {
    return null;
  }
  if (
    plainText(report.creative_project_id) &&
    plainText(report.creative_project_id) !== plainText(project.id)
  ) {
    return null;
  }

  const validation = object(report.metadata?.validation);
  if (validation.passed !== true) return null;

  const policy = resolveResearchPolicy(project, brief);
  if (plainText(validation.policy?.version) !== plainText(policy.version)) {
    return null;
  }

  const researchedAt = Date.parse(
    validation.researched_at ||
    report.metadata?.researched_at ||
    report.created_at ||
    "",
  );
  const maxAgeMs = Math.max(0, Number(policy.max_age_days || 0)) * 86400000;
  if (
    !Number.isFinite(researchedAt) ||
    maxAgeMs <= 0 ||
    Date.now() - researchedAt > maxAgeMs
  ) {
    return null;
  }

  const resolution = object(report.metadata?.company_resolution);
  const expectedCompany = namedCompany(project, brief);
  const resolvedCompany = plainText(
    resolution.matched_internal_identity ||
    resolution.canonical_name,
  );
  if (expectedCompany && resolvedCompany && !identitiesAgree(expectedCompany, resolvedCompany)) {
    return null;
  }

  const expectedWebsite = hostname(
    project.metadata?.official_website ||
    brief.official_website ||
    brief.metadata?.official_website,
  );
  const resolvedWebsite = hostname(resolution.official_website);
  if (expectedWebsite && resolvedWebsite && expectedWebsite !== resolvedWebsite) {
    return null;
  }

  return report;
}

function fullLengthTemporalProject(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const workflow = text(
    metadata.workflow_kind ||
    metadata.creative_medium ||
    project.production_type ||
    brief.workflow_kind ||
    brief.creative_medium,
  );
  const temporal = ["TEMPORAL", "VIDEO", "FILM", "ANIMATION"].includes(workflow);
  if (!temporal) return false;

  const mode = text(
    metadata.duration_mode ||
    metadata.temporal_contract?.mode ||
    metadata.temporalContract?.mode ||
    brief.duration_mode,
  );
  const duration = finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );

  return metadata.full_song === true ||
    metadata.music_video === true ||
    ["FULL_SOURCE_AUDIO", "FULL_SONG", "MATCH_SOURCE_AUDIO"].includes(mode) ||
    (duration !== null && duration >= 90);
}

function researchForDirection(report = {}) {
  const metadata = object(report.metadata);
  return {
    contract: metadata.contract || "CREATIVE_AUTONOMOUS_RESEARCH_V1",
    report_id: report.id || null,
    research_identity: metadata.research_identity || null,
    summary: report.summary || "",
    confidence: Number(report.confidence || 0),
    validation: metadata.validation || {},
    company_resolution: metadata.company_resolution || {},
    company_truth: metadata.company_truth || {},
    brand_intelligence: metadata.brand_intelligence || {},
    audience: report.audience || {},
    competitor_analysis: metadata.competitor_analysis || {
      competitors: list(report.competitors),
    },
    market: metadata.market || {
      trends: list(report.trends),
    },
    commercial_intelligence: metadata.commercial_intelligence || {},
    messaging: report.messaging || {},
    creative_opportunities: metadata.creative_opportunities || [],
    recommendations: list(report.recommendations),
    claims: list(metadata.claims).filter((claim) => claim?.verified === true),
    sources: list(metadata.sources).map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      source_type: source.source_type,
      official: source.official === true,
      primary: source.primary === true,
      retrieved_at: source.retrieved_at,
    })),
  };
}

async function resolveResearch({
  organizationId,
  project,
  mission,
  brief,
  assets,
  forceResearch,
}) {
  const existing = await Repository.list({
    organization_id: organizationId,
    creative_project_id: project.id,
  });

  if (InternalCreativeResearchRuntime.applies(project)) {
    const reusable = existing.find((report) =>
      report.metadata?.validation?.passed === true &&
      report.metadata?.validation?.policy?.mode === "INTERNAL_CREATIVE",
    );
    if (reusable && !forceResearch) return reusable;

    return Repository.create(createResearchReport(
      InternalCreativeResearchRuntime.build({
        organization_id: organizationId,
        project,
        brief,
        assets,
      }),
    ));
  }

  if (!forceResearch) {
    const completed = completedPaidResearchReport({
      project: { ...project, organization_id: organizationId },
      brief,
      existing,
    });
    if (completed) return completed;
  }

  const { AutonomousResearchDirectorRuntime } = await import(
    "./AutonomousResearchDirectorRuntime"
  );
  return AutonomousResearchDirectorRuntime.run({
    organization_id: organizationId,
    mission,
    project,
    brief,
    assets,
    force: forceResearch,
  });
}

function enrichBriefWithUniversalAssets({ brief, project, assets }) {
  const assetIntelligence = CreativeUniversalAssetIntelligenceRuntime.analyze({
    project,
    brief,
    assets,
  });
  if (!assetIntelligence.passed) {
    throw new Error(
      `CREATIVE_UNIVERSAL_ASSET_INTELLIGENCE_BLOCKED:${assetIntelligence.blocking_issues.join(",")}`,
    );
  }

  return {
    assetIntelligence,
    brief: {
      ...brief,
      metadata: {
        ...object(brief.metadata),
        universal_asset_intelligence: assetIntelligence,
        universal_subject_profiles: assetIntelligence.person_profiles,
        universal_product_profiles: assetIntelligence.product_profiles,
        universal_brand_mark_profiles: assetIntelligence.brand_mark_profiles,
        universal_location_profiles: assetIntelligence.location_profiles,
        primary_subject_profile_id:
          brief.metadata?.primary_subject_profile_id ||
          assetIntelligence.primary_subject_profile_id ||
          null,
        asset_role_rules: assetIntelligence.rules,
      },
    },
  };
}

function attachAssetIntelligence(master = {}, assetIntelligence = {}) {
  return {
    ...master,
    plan: master.plan ? {
      ...master.plan,
      universal_asset_intelligence: assetIntelligence,
      subject_profiles: assetIntelligence.person_profiles,
      product_profiles: assetIntelligence.product_profiles,
      brand_mark_profiles: assetIntelligence.brand_mark_profiles,
      location_profiles: assetIntelligence.location_profiles,
      production: {
        ...object(master.plan.production),
        universal_asset_intelligence_required: true,
        uploaded_people_background_policy: "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED",
        identity_verification_required:
          assetIntelligence.person_profiles.length > 0 ||
          master.plan.production?.identity_verification_required === true,
        product_verification_required:
          assetIntelligence.product_profiles.length > 0 ||
          master.plan.production?.product_verification_required === true,
        brand_mark_verification_required:
          assetIntelligence.brand_mark_profiles.length > 0 ||
          master.plan.production?.brand_mark_verification_required === true,
      },
    } : master.plan,
    universal_asset_intelligence: assetIntelligence,
  };
}

function attachPromptlessStoryAuthority(master = {}, research = {}) {
  if (!master.plan) {
    throw new Error("CREATIVE_MASTER_PLAN_REQUIRED_FOR_STORY_LINEAGE");
  }

  const promptless = sanitizeCreativePromptlessDirectionSpec(master.plan);
  const lineage = CreativeStoryLineageContractRuntime.build({
    plan: promptless.plan,
    research,
  });
  const lineageValidation = CreativeStoryLineageContractRuntime.assert(lineage.plan);

  return {
    ...master,
    plan: lineage.plan,
    promptless_direction_spec: promptless.evidence.validation,
    promptless_direction_sanitization: promptless.evidence,
    story_lineage: lineage.lineage,
    story_lineage_validation: lineageValidation,
  };
}

function installResearchBackedMasterPlanGate() {
  if (CreativeMasterPlanRuntime[RESEARCH_GATE_FLAG]) return;
  const createWithoutResearchGate = CreativeMasterPlanRuntime.create.bind(
    CreativeMasterPlanRuntime,
  );
  Object.defineProperty(CreativeMasterPlanRuntime, RESEARCH_GATE_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create = async function createResearchBackedMasterPlan(input = {}) {
    const organizationId = input.organization_id;
    const project = object(input.project);
    if (!organizationId) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const mission = object(input.mission);
    const brief = object(input.brief);
    const assets = list(input.assets);
    const research = await resolveResearch({
      organizationId,
      project,
      mission,
      brief,
      assets,
      forceResearch: input.force_research === true,
    });
    const validation = object(research.metadata?.validation);
    if (validation.passed !== true) {
      throw new Error("CREATIVE_RESEARCH_VALIDATION_REQUIRED_BEFORE_DIRECTION");
    }

    const researchIntelligence = researchForDirection(research);
    const universal = enrichBriefWithUniversalAssets({
      brief: {
        ...brief,
        metadata: {
          ...object(brief.metadata),
          autonomous_research: researchIntelligence,
        },
      },
      project,
      assets,
    });
    const enrichedInput = {
      ...input,
      brief: universal.brief,
    };

    const directed = fullLengthTemporalProject(project, enrichedInput.brief)
      ? await CreativeMeasuredUniversalTemporalDirectionRuntime.create(enrichedInput)
      : await createWithoutResearchGate(enrichedInput);
    const masterWithAssets = attachAssetIntelligence(
      directed,
      universal.assetIntelligence,
    );
    const master = attachPromptlessStoryAuthority(masterWithAssets, research);

    return {
      ...master,
      research,
      research_validation: validation,
    };
  };
}

installResearchBackedMasterPlanGate();

export async function runResearch(
  project = {},
  brief = {},
  reasoningProvider,
) {
  if (!project.organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!reasoningProvider?.run) throw new Error("reasoning provider required");

  const plan = await buildResearchPlan(project, brief);
  const result = await reasoningProvider.run({ project, brief, plan });
  const document = createResearchReport({
    organization_id: project.organization_id,
    creative_project_id: project.id,
    creative_brief_id: brief.id || null,
    ...(result || {}),
    metadata: {
      ...(result?.metadata || {}),
      research_plan: plan,
    },
  });

  return Repository.create(document);
}

export const ResearchRuntime = {
  runResearch,

  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    return Repository.create(createResearchReport(input));
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "runResearch"],
      status: current ? "ready" : "not_started",
      permissions,
    };
  },
};
