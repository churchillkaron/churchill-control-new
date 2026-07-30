import { researchContextIdentity } from "./ResearchEvidenceContractRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function assetSummary(asset = {}) {
  return {
    id: text(asset.id || asset.asset_id),
    name: text(asset.name || asset.title || asset.file_name),
    type: text(asset.asset_type || asset.type),
    description: text(asset.description || asset.analysis?.description),
    tags: list(asset.tags || asset.analysis?.tags),
    analysis: object(asset.analysis),
    rights: object(asset.rights || asset.metadata?.rights),
    restrictions: object(asset.restrictions || asset.metadata?.restrictions),
  };
}

export function isInternalCreativeResearchProject(project = {}) {
  const metadata = object(project.metadata);
  const policyMode = text(metadata.research_policy?.mode).toUpperCase();
  const productionType = text(project.production_type).toUpperCase();
  const workflowKind = text(metadata.workflow_kind).toUpperCase();
  const durationMode = text(
    metadata.duration_mode || metadata.temporal_contract?.mode,
  ).toUpperCase();

  return policyMode === "INTERNAL_CREATIVE" ||
    metadata.full_song === true ||
    metadata.music_video === true ||
    durationMode === "FULL_SOURCE_AUDIO" ||
    (
      ["VIDEO", "FILM", "TEMPORAL"].includes(productionType) &&
      workflowKind === "TEMPORAL" &&
      metadata.primary_soundtrack_asset_node_id
    );
}

export function buildInternalCreativeResearchReport({
  organization_id,
  project = {},
  brief = {},
  assets = [],
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");

  const projectMetadata = object(project.metadata);
  const assetManifest = list(assets).map(assetSummary);
  const soundtrack = assetManifest.find((asset) =>
    ["AUDIO", "MUSIC", "VOICE"].includes(text(asset.type).toUpperCase()),
  ) || null;
  const artistName = text(
    projectMetadata.artist_name ||
    projectMetadata.subject_name ||
    brief.artist_name ||
    brief.subject_name,
  );
  const projectName = text(project.name || project.title || "Music video");
  const objective = text(
    project.objective ||
    brief.creative_objective ||
    brief.business_goal ||
    "Create a complete cinematic music video covering the full uploaded song.",
  );
  const duration = Number(
    projectMetadata.temporal_contract?.duration_seconds ||
    projectMetadata.full_song_duration_seconds ||
    project.target_duration ||
    0,
  );

  const contextIdentity = researchContextIdentity({
    contract: "CREATIVE_INTERNAL_RESEARCH_CONTEXT_V1",
    organization_id,
    project_id: project.id,
    project_name: projectName,
    objective,
    duration,
    assets: assetManifest.map((asset) => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
    })),
  });
  const researchedAt = new Date().toISOString();
  const sourceId = "owner-project-context";
  const source = {
    id: sourceId,
    title: `${projectName} owner-provided project context`,
    url: null,
    publisher: "Avantiqo organisation context",
    source_type: "owner_provided",
    retrieved_at: researchedAt,
    published_at: null,
    official: true,
    primary: true,
    internal: true,
    excerpt: objective,
  };

  const claims = [
    {
      id: "project-objective",
      claim: objective,
      category: "creative",
      source_ids: [sourceId],
      confidence: 100,
      verification_status: "VERIFIED",
      verified: true,
      public_usable: false,
      sensitive: false,
      expires_at: null,
      notes: "Owner-provided production objective.",
    },
    {
      id: "full-song-duration",
      claim: duration > 0
        ? `The master must cover the complete ${duration}-second source song without truncation.`
        : "The master must cover the complete source song without truncation.",
      category: "creative",
      source_ids: [sourceId],
      confidence: 100,
      verification_status: "VERIFIED",
      verified: true,
      public_usable: false,
      sensitive: false,
      expires_at: null,
      notes: "Derived from inspected project timing metadata.",
    },
  ];

  const validation = {
    contract: "CREATIVE_INTERNAL_RESEARCH_V1",
    passed: true,
    blockers: [],
    policy: {
      version: "internal-creative-v1",
      mode: "INTERNAL_CREATIVE",
      max_age_days: 3650,
      minimum_external_sources: 0,
      minimum_primary_sources: 1,
      minimum_verified_claims: 2,
      minimum_confidence: 100,
      require_company_resolution: false,
      require_competitor_analysis: false,
      require_audience_evidence: false,
      require_market_context: false,
    },
    source_count: 1,
    external_source_count: 0,
    primary_source_count: 1,
    claim_count: claims.length,
    verified_claim_count: claims.length,
    unsupported_claim_ids: [],
    unsafe_public_claim_ids: [],
    company_resolution_status: "NOT_REQUIRED",
    confidence: 100,
    researched_at: researchedAt,
    context_identity: contextIdentity,
  };

  return {
    organization_id,
    creative_project_id: project.id,
    creative_brief_id: brief.id || null,
    summary: [
      `Internal creative intelligence for ${projectName}.`,
      artistName ? `Featured artist/subject: ${artistName}.` : null,
      objective,
      soundtrack ? `Primary soundtrack asset: ${soundtrack.name || soundtrack.id}.` : null,
      duration > 0 ? `Required exact master duration: ${duration} seconds.` : null,
    ].filter(Boolean).join(" "),
    audience: object(brief.target_audience || brief.audience),
    competitors: [],
    trends: [],
    keywords: ["music video", "full song", "cinematic storytelling"],
    messaging: {
      primary: text(brief.core_message || projectMetadata.core_message || objective),
      secondary: list(brief.supporting_messages),
      call_to_action: text(brief.requested_action),
    },
    visual_direction: {
      ...object(projectMetadata.visual_direction),
      asset_manifest: assetManifest,
      full_song: true,
      exact_duration_seconds: duration || null,
    },
    recommendations: [
      "Build one continuous emotional story across the complete song structure.",
      "Use the owner-provided artist and reference assets as identity and continuity authority.",
      "Reserve lip-sync for shots where the performer is visibly singing.",
      "Match scene and shot timing to the primary soundtrack without truncation or looping.",
    ],
    confidence: 100,
    reasoning: {
      model: "internal-context",
      provider: "avantiqo",
      version: "CREATIVE_INTERNAL_RESEARCH_V1",
    },
    metadata: {
      contract: "CREATIVE_INTERNAL_RESEARCH_V1",
      research_identity: researchContextIdentity({
        context_identity: contextIdentity,
        claims,
      }),
      context_identity: contextIdentity,
      validation,
      policy: validation.policy,
      company_resolution: {
        status: "NOT_REQUIRED",
        canonical_name: artistName || projectName,
        reasoning: "This is an owner-directed creative production, not a company market-research assignment.",
      },
      company_truth: {},
      brand_intelligence: object(projectMetadata.brand_intelligence),
      competitor_analysis: { competitors: [] },
      market: {},
      commercial_intelligence: {},
      creative_opportunities: [],
      sources: [source],
      claims,
      provider: "avantiqo",
      model: "internal-context",
      usage: null,
      billing: null,
      researched_at: researchedAt,
      asset_manifest: assetManifest,
    },
  };
}

export const InternalCreativeResearchRuntime = {
  applies: isInternalCreativeResearchProject,
  build: buildInternalCreativeResearchReport,
};
