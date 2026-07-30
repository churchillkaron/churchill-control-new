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
  CreativeTemporalMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime";
import {
  InternalCreativeResearchRuntime,
} from "./InternalCreativeResearchRuntime";

const RESEARCH_GATE_FLAG = Symbol.for("avantiqo.creative.research.master-plan-gate.v3");

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    const enrichedInput = {
      ...input,
      brief: {
        ...brief,
        metadata: {
          ...object(brief.metadata),
          autonomous_research: researchIntelligence,
        },
      },
    };
    const master = fullLengthTemporalProject(project, enrichedInput.brief)
      ? await CreativeTemporalMasterPlanRuntime.create(enrichedInput)
      : await createWithoutResearchGate(enrichedInput);

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
