import { CreativeGeographyTruthPreflightRuntime } from "../../quality/runtime/CreativeGeographyTruthPreflightRuntime.js";
import { CreativeTechnicalSubjectTruthRuntime } from "../../quality/runtime/CreativeTechnicalSubjectTruthRuntime.js";
import { evaluateVirtualProductionWorkstream } from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_TECHNICAL_SCOUT_CONTRACT = "CREATIVE_TECHNICAL_SCOUT_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function materialEvidence(shot = {}) {
  const design = shot.production_design || {};
  return [design.materials, design.texture_detail, shot.material_behavior].filter((value) => text(value) || (value && typeof value === "object"));
}
function lightingEvidence(shot = {}) {
  const lighting = shot.lighting || {};
  return [lighting.source, lighting.direction, lighting.contrast, lighting.colour, lighting.exposure_intent]
    .filter((value) => text(value).length >= 8);
}

export function evaluateTechnicalScout({ shots = [], production_design_bible = {}, lighting_simulation = {}, material_physics = {} } = {}) {
  const rows = list(shots);
  const failures = [];
  if (!rows.length) failures.push("TECHNICAL_SCOUT_SHOTS_REQUIRED");
  const shot_reports = rows.map((shot, index) => {
    const geography = CreativeGeographyTruthPreflightRuntime.evaluate(shot);
    const technical = CreativeTechnicalSubjectTruthRuntime.evaluate(shot);
    const materials = materialEvidence(shot);
    const lighting = lightingEvidence(shot);
    const local = [...geography.failures, ...technical.failures];
    if (!materials.length) local.push("TECHNICAL_SCOUT_MATERIAL_EVIDENCE_REQUIRED");
    if (lighting.length < 4) local.push("TECHNICAL_SCOUT_LIGHTING_EVIDENCE_REQUIRED");
    failures.push(...local.map((code) => `${index}:${code}`));
    return { shot_id: shot.id || `shot-${index + 1}`, geography, technical, materials, lighting, passed: local.length === 0 };
  });

  const productionDesignReport = evaluateVirtualProductionWorkstream({ requirement: 3, evidence: production_design_bible });
  const lightingReport = evaluateVirtualProductionWorkstream({ requirement: 5, evidence: lighting_simulation });
  const materialReport = evaluateVirtualProductionWorkstream({ requirement: 8, evidence: material_physics });
  for (const report of [productionDesignReport, lightingReport, materialReport]) {
    failures.push(...report.failures.map((code) => `${report.requirement}:${code}`));
  }

  return Object.freeze({
    contract: CREATIVE_TECHNICAL_SCOUT_CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    shot_reports,
    workstream_reports: [productionDesignReport, lightingReport, materialReport],
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeTechnicalScoutRuntime = Object.freeze({
  contract: CREATIVE_TECHNICAL_SCOUT_CONTRACT,
  evaluate: evaluateTechnicalScout,
});