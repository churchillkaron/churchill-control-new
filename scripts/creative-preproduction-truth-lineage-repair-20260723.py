from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# CreativeMissionComposerRuntime
# ---------------------------------------------------------------------------
path = Path("lib/creative/intent/CreativeMissionComposerRuntime.js")
text = path.read_text()

text = replace_once(
    text,
    'const RIGHTS_ASSERTION_PATTERN = /\\b(owns? all|fully owns?|rights[- ]?cleared|royalty[- ]?free|licensed for|all rights secured|commercial rights secured)\\b/i;\n',
    'const RIGHTS_ASSERTION_PATTERN = /\\b(owns? all|fully owns?|rights?[- ]?cleared|royalty[- ]?free|licensed(?: for)?|all rights secured|commercial rights secured|permission secured|cleared for campaign use)\\b/i;\n',
    "rights assertion pattern",
)

old = '''function deliverableTitle(item = {}, index = 0, medium = null) {
  const supplied = compactText(item.title || item.name, 100);
  if (supplied && !/^(?:creative\\s+)?deliverable\\s*\\d*$/i.test(supplied)) {
    return supplied;
  }

  const fingerprint = deliverableFingerprint(item);
  if (/film[_\\s-]*master|master[_\\s-]*(film|video)|hero[_\\s-]*film/.test(fingerprint)) {
    return "Churchill Cinematic Hero Film";
  }
'''
new = '''function deliverableProductionRole(item = {}, medium = null) {
  const resolved = medium || resolveDeliverableMedium(item);
  if (resolved !== "FILM") return "INDEPENDENT";

  const fingerprint = deliverableFingerprint(item);
  if (
    item.metadata?.master_version === true ||
    item.metadata?.hero === true ||
    /film[_\\s-]*master|master[_\\s-]*(film|video)|hero[_\\s-]*film/.test(fingerprint)
  ) {
    return "MASTER";
  }

  if (
    item.metadata?.cutdown === true ||
    item.metadata?.vertical === true ||
    /social[_\\s-]*cutdown|reels?|shortform|short[_\\s-]*video|stories/.test(fingerprint)
  ) {
    return "CUTDOWN";
  }

  return "INDEPENDENT";
}

function deliverableTitle(item = {}, index = 0, medium = null) {
  const resolvedMedium = medium || resolveDeliverableMedium(item);
  const productionRole = deliverableProductionRole(item, resolvedMedium);

  if (productionRole === "MASTER") {
    return "Churchill Cinematic Hero Film";
  }
  if (productionRole === "CUTDOWN") {
    return "Social Campaign Cutdown Series";
  }

  const supplied = compactText(item.title || item.name, 100);
  if (supplied && !/^(?:creative\\s+)?deliverable\\s*\\d*$/i.test(supplied)) {
    return supplied;
  }

  const fingerprint = deliverableFingerprint(item);
  if (/film[_\\s-]*master|master[_\\s-]*(film|video)|hero[_\\s-]*film/.test(fingerprint)) {
    return "Churchill Cinematic Hero Film";
  }
'''
text = replace_once(text, old, new, "deliverable role and title")

old = '''  return source.map((item, index) => {
    const medium = resolveDeliverableMedium(item, request);
    return {
      id: String(item?.id || `deliverable_${index + 1}`),
      title: deliverableTitle(item, index, medium),
'''
new = '''  return source.map((item, index) => {
    const medium = resolveDeliverableMedium(item, request);
    const productionRole = deliverableProductionRole(item, medium);
    return {
      id: String(item?.id || `deliverable_${index + 1}`),
      title: deliverableTitle(item, index, medium),
'''
text = replace_once(text, old, new, "normalize deliverable role")

old = '''      metadata:
        item?.metadata &&
        typeof item.metadata === "object" &&
        !Array.isArray(item.metadata)
          ? item.metadata
          : {},
'''
new = '''      metadata: {
        ...(
          item?.metadata &&
          typeof item.metadata === "object" &&
          !Array.isArray(item.metadata)
            ? item.metadata
            : {}
        ),
        production_role: productionRole,
        derivative_policy:
          productionRole === "CUTDOWN"
            ? "DERIVE_FROM_APPROVED_MASTER_TIMELINE"
            : null,
      },
'''
text = replace_once(text, old, new, "deliverable metadata role")
path.write_text(text)


# ---------------------------------------------------------------------------
# CreativeBusinessTruthRuntime
# ---------------------------------------------------------------------------
path = Path("lib/creative/knowledge/CreativeBusinessTruthRuntime.js")
text = path.read_text()

old = '''    country: compact(first(row.country, row.country_code), 100),
    timezone: compact(row.timezone, 100),
'''
new = '''    country: compact(first(row.country, row.country_code), 100),
    address: compact(first(row.address, row.address_line_1, row.registered_address), 400),
    city: compact(first(row.city, row.locality), 120),
    state: compact(first(row.state, row.province), 120),
    postal_code: compact(row.postal_code, 40),
    timezone: compact(row.timezone, 100),
'''
text = replace_once(text, old, new, "organization location fields")

old = '''async function queryReusableAssets(organization_id) {
  const { data, error } = await supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false })
    .limit(MAX_REUSABLE_ASSETS * 3);

  if (error) throw error;
  return (data || [])
    .filter(isApprovedReusableAsset)
    .slice(0, MAX_REUSABLE_ASSETS);
}
'''
new = '''async function queryAssetNodes(organization_id) {
  const { data, error } = await supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false })
    .limit(MAX_REUSABLE_ASSETS * 3);

  if (error) throw error;
  return data || [];
}
'''
text = replace_once(text, old, new, "asset node query")

old = '''    const [organizationResult, currencyResult, locationsResult, assetsResult, reusableResult] = await Promise.allSettled([
      queryOrganization(organization_id),
      resolveOrganizationCurrency({ organization_id, entity_id }),
      queryLocations(organization_id),
      queryUploadedAssets(organization_id),
      queryReusableAssets(organization_id),
    ]);
'''
new = '''    const [organizationResult, currencyResult, locationsResult, assetsResult, assetNodesResult] = await Promise.allSettled([
      queryOrganization(organization_id),
      resolveOrganizationCurrency({ organization_id, entity_id }),
      queryLocations(organization_id),
      queryUploadedAssets(organization_id),
      queryAssetNodes(organization_id),
    ]);
'''
text = replace_once(text, old, new, "hydrate asset nodes")

old = '''    const uploadedAssets = resultValue(assetsResult, []).map(uploadedAssetTruth);
    const reusableAssets = resultValue(reusableResult, []).map(reusableAssetTruth);
    const failures = [
      failure("organization_currency", currencyResult),
      failure("business_locations", locationsResult),
      failure("creative_assets", assetsResult),
      failure("creative_asset_nodes", reusableResult),
    ].filter(Boolean);
'''
new = '''    const uploadedAssets = resultValue(assetsResult, []).map(uploadedAssetTruth);
    const assetNodes = resultValue(assetNodesResult, []);
    const reusableAssets = assetNodes
      .filter(isApprovedReusableAsset)
      .slice(0, MAX_REUSABLE_ASSETS)
      .map(reusableAssetTruth);
    const evidenceNodes = assetNodes
      .slice(0, MAX_REUSABLE_ASSETS * 3)
      .map(reusableAssetTruth);
    const failures = [
      failure("organization_currency", currencyResult),
      failure("business_locations", locationsResult),
      failure("creative_assets", assetsResult),
      failure("creative_asset_nodes", assetNodesResult),
    ].filter(Boolean);
'''
text = replace_once(text, old, new, "asset node values")

old = '''      { source: "creative_asset_nodes", status: reusableResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: reusableAssets.length },
'''
new = '''      { source: "creative_asset_nodes", status: assetNodesResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: evidenceNodes.length },
'''
text = replace_once(text, old, new, "asset node manifest")

old = '''      assets: { uploaded_references: uploadedAssets, approved_reusable: reusableAssets },
      source_failures: failures,
      truth_policy: {
'''
new = '''      locations_grounding: {
        status:
          locations.length > 0
            ? "STRUCTURED_LOCATION"
            : organization.address || organization.city
              ? "ORGANIZATION_ADDRESS_EVIDENCE"
              : "VISUAL_REFERENCE_ONLY",
        structured_location_count: locations.length,
        requires_release_verification: locations.length === 0,
      },
      assets: {
        uploaded_references: uploadedAssets,
        evidence_nodes: evidenceNodes,
        approved_reusable: reusableAssets,
      },
      source_failures: failures,
      truth_policy: {
'''
text = replace_once(text, old, new, "truth grounding")

old = '''      uploaded_assets: uploadedAssets.length,
      reusable_assets: reusableAssets.length,
      source_failures: failures.length,
'''
new = '''      uploaded_assets: uploadedAssets.length,
      asset_nodes: evidenceNodes.length,
      reusable_assets: reusableAssets.length,
      source_failures: failures.length,
'''
text = replace_once(text, old, new, "asset node record count")
path.write_text(text)


# ---------------------------------------------------------------------------
# Mission compose route
# ---------------------------------------------------------------------------
path = Path("app/api/creative/missions/compose/route.js")
text = path.read_text()

old = '''import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
'''
new = '''import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
'''
text = replace_once(text, old, new, "asset graph import")

old = '''function projectPayload({
  organization_id,
  mission,
  deliverable,
  blueprint,
  knowledge,
  businessTruth,
}) {
'''
new = '''function projectPayload({
  organization_id,
  mission,
  deliverable,
  blueprint,
  knowledge,
  businessTruth,
  masterProjectId = null,
}) {
'''
text = replace_once(text, old, new, "project payload master id")

old = '''      deliverable_metadata: deliverable.metadata || {},
      mission_workflow: blueprint.workflow || [],
'''
new = '''      deliverable_metadata: deliverable.metadata || {},
      production_role:
        deliverable.metadata?.production_role || "INDEPENDENT",
      master_project_id:
        deliverable.metadata?.production_role === "CUTDOWN"
          ? masterProjectId
          : null,
      derivative_policy:
        deliverable.metadata?.production_role === "CUTDOWN"
          ? "DERIVE_FROM_APPROVED_MASTER_TIMELINE"
          : null,
      mission_workflow: blueprint.workflow || [],
'''
text = replace_once(text, old, new, "project lineage metadata")

old = '''    const blueprint = enforceCreativeDeliverableContract(composedBlueprint);

    assertProductionReadyBlueprint(blueprint);
'''
new = '''    const blueprint = enforceCreativeDeliverableContract(composedBlueprint);

    if (businessTruth.record_counts?.locations === 0) {
      blueprint.decision_gates = [
        ...(blueprint.decision_gates || []),
        {
          id: "location_grounding_gate",
          title: "Verify venue location evidence before release",
          description:
            "No structured business location record was available. Ground production in approved organization address evidence and uploaded venue references, then verify the final venue identity before release.",
        },
      ];
    }

    assertProductionReadyBlueprint(blueprint);
'''
text = replace_once(text, old, new, "location decision gate")

old = '''    const projects = [];
    for (const deliverable of blueprint.deliverables || []) {
      const project = await CreativeProjectRuntime.create(
        projectPayload({
          organization_id,
          mission,
          deliverable,
          blueprint,
          knowledge,
          businessTruth,
        }),
      );
      projects.push(project);
    }

    return NextResponse.json({
'''
new = '''    const projects = [];
    let masterProjectId = null;
    const orderedDeliverables = [
      ...(blueprint.deliverables || []).filter(
        (deliverable) => deliverable.metadata?.production_role === "MASTER",
      ),
      ...(blueprint.deliverables || []).filter(
        (deliverable) => deliverable.metadata?.production_role !== "MASTER",
      ),
    ];

    for (const deliverable of orderedDeliverables) {
      const project = await CreativeProjectRuntime.create(
        projectPayload({
          organization_id,
          mission,
          deliverable,
          blueprint,
          knowledge,
          businessTruth,
          masterProjectId,
        }),
      );

      if (deliverable.metadata?.production_role === "MASTER") {
        masterProjectId = project.id;
      }
      projects.push(project);
    }

    const evidenceProjectId = masterProjectId || projects[0]?.id || null;
    if (evidenceProjectId) {
      const references = businessTruth.assets?.uploaded_references || [];
      for (const asset of references.slice(0, 40)) {
        await CreativeAssetGraphRuntime.create({
          organization_id,
          creative_project_id: evidenceProjectId,
          creative_asset_id: asset.id,
          type: String(asset.type || "IMAGE").toUpperCase(),
          status: "IMPORTED",
          name: asset.name || "Imported Reference",
          description: asset.description || "Organization-scoped production reference",
          url: asset.url || asset.thumbnail_url || null,
          lineage: {
            source: "creative_assets",
            provider_id: null,
            capability: "creative.reference.import",
            generation_version: 1,
          },
          reuse: {
            reusable: true,
            approved_for_reuse: false,
          },
          review: {
            ai_reviewed: false,
            human_reviewed: false,
            approved: false,
            notes: "Imported as production evidence; rights and reuse approval remain separate gates.",
          },
          metadata: {
            evidence_role: "MISSION_REFERENCE",
            source_asset_id: asset.id,
            rights_status: "UNVERIFIED",
          },
        });
      }
    }

    const finalBusinessTruth = await CreativeBusinessTruthRuntime.hydrate({
      organization_id,
      entity_id,
      period_id,
      creative_mission_id: mission.id,
      creative_project_id: evidenceProjectId,
      captured_by:
        access?.user?.id ||
        access?.user_id ||
        null,
      persist: true,
    });

    return NextResponse.json({
'''
text = replace_once(text, old, new, "project creation and evidence hydration")

text = text.replace("businessTruth.snapshot_id", "finalBusinessTruth.snapshot_id")
text = text.replace("businessTruth.payload_hash", "finalBusinessTruth.payload_hash")
text = text.replace("businessTruth.schema_version", "finalBusinessTruth.schema_version")
text = text.replace("businessTruth.record_counts", "finalBusinessTruth.record_counts")
text = text.replace("businessTruth.source_manifest", "finalBusinessTruth.source_manifest")
text = text.replace("businessTruth.source_failures", "finalBusinessTruth.source_failures")
path.write_text(text)


# ---------------------------------------------------------------------------
# Live mission smoke assertions
# ---------------------------------------------------------------------------
path = Path("scripts/creative-live-mission-smoke.sh")
text = path.read_text()

old = '''const sourceFailures = Array.isArray(body.business_truth?.source_failures)
  ? body.business_truth.source_failures
  : [];
'''
new = '''const sourceFailures = Array.isArray(body.business_truth?.source_failures)
  ? body.business_truth.source_failures
  : [];
const recordCounts = body.business_truth?.record_counts || {};
'''
text = replace_once(text, old, new, "smoke record counts")

old = '''if (sourceFailures.length) fail(`business truth has ${sourceFailures.length} source failure(s)`);
if (blueprint.composition_source !== 'AI_DIRECTOR') fail('AI Director was not used');
'''
new = '''if (sourceFailures.length) fail(`business truth has ${sourceFailures.length} source failure(s)`);
if (Number(recordCounts.asset_nodes || 0) < 1) fail('business truth has no project-scoped asset evidence nodes');
if (blueprint.composition_source !== 'AI_DIRECTOR') fail('AI Director was not used');
'''
text = replace_once(text, old, new, "smoke evidence assertion")

old = '''const filmDeliverables = deliverables.filter((deliverable) => String(deliverable.medium).toUpperCase() === 'FILM');
if (!filmDeliverables.length) fail('no film/video deliverable was produced');
for (const deliverable of filmDeliverables) {
'''
new = '''const filmDeliverables = deliverables.filter((deliverable) => String(deliverable.medium).toUpperCase() === 'FILM');
if (!filmDeliverables.length) fail('no film/video deliverable was produced');
const masterFilms = filmDeliverables.filter((deliverable) => deliverable.metadata?.production_role === 'MASTER');
const cutdownFilms = filmDeliverables.filter((deliverable) => deliverable.metadata?.production_role === 'CUTDOWN');
if (masterFilms.length !== 1) fail(`expected exactly one master film, received ${masterFilms.length}`);
if (/cutdown/i.test(masterFilms[0].title || '')) fail('master film is mislabeled as a cutdown');
for (const cutdown of cutdownFilms) {
  if (cutdown.metadata?.derivative_policy !== 'DERIVE_FROM_APPROVED_MASTER_TIMELINE') {
    fail(`${cutdown.title} is not bound to the approved master timeline`);
  }
}
for (const deliverable of filmDeliverables) {
'''
text = replace_once(text, old, new, "smoke film lineage assertion")

old = '''console.log(`PASS: business truth hash ${body.business_truth.payload_hash}`);
console.log('PASS: business truth source failures 0');
'''
new = '''console.log(`PASS: business truth hash ${body.business_truth.payload_hash}`);
console.log(`PASS: project-scoped asset evidence nodes ${recordCounts.asset_nodes}`);
console.log('PASS: master and cutdown lineage contract');
console.log('PASS: business truth source failures 0');
'''
text = replace_once(text, old, new, "smoke success output")
path.write_text(text)
