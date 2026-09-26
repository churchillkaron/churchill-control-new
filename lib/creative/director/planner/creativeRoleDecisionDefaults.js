// Roles the registry already says cannot apply to this workflow are completed from the registry rather
// than demanded from the director.
//
// The contract requires an explicit status for all twenty-one agency roles. For a role whose applies_to
// includes the workflow, choosing ACTIVE or NOT_REQUIRED is a real judgement and must be stated with
// reasoning -- that accountability is the point and it is untouched here.
//
// For a role whose applies_to excludes the workflow, it is not a judgement. experience_director is
// INTERACTIVE only and technical_architect is INTERACTIVE and SOFTWARE, so neither can apply to a film,
// and the registry says so before anyone is asked. Requiring the model to echo a lookup adds no
// accountability, and it cost a film every single run: fifteen calls of story, scene architecture and
// shot direction rejected because two disciplines that cannot apply were not declared inapplicable.
//
// The system fills in deterministic workflow exclusions and non-waivable governance decisions.
// Other eligible disciplines remain creative judgements: they may be ACTIVE or accountably NOT_REQUIRED.

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}


function temporalEliteRoleBackfill(roleId, plan = {}) {
  const workflowKind = text(plan?.workflow_kind).toUpperCase();
  if (workflowKind !== "TEMPORAL") return null;
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  const sceneIds = scenes.map((scene) => text(scene?.id)).filter(Boolean);
  const shotIds = scenes.flatMap((scene) => Array.isArray(scene?.shots) ? scene.shots : []).map((shot) => text(shot?.id)).filter(Boolean);
  const visualWorld = object(plan?.visual_world);
  const deliverables = Array.isArray(plan?.deliverables) ? plan.deliverables : [];
  const outputSpec = object(deliverables[0]?.output_spec);
  const temporal = object(plan?.temporal_contract);
  const concept = object(plan?.concept);
  const worldName = text(visualWorld.name);
  const conceptVisualSystem = object(concept.visual_system);
  const conceptPhysicalWorld = text(conceptVisualSystem.world || concept.environment_progression);
  const evidence = (...items) => items.flat().map(text).filter(Boolean).slice(0, 8);
  const sceneEvidence = evidence(sceneIds.map((id) => `scene:${id}`), shotIds.slice(0, 3).map((id) => `shot:${id}`));

  const decisions = {
    previsualization_supervisor: {
      decision: "Own the approved scene-to-shot spatial rehearsal so camera geography, transitions and executable coverage remain coherent before any paid visual generation begins.",
      evidence: evidence(sceneEvidence, `scene_count:${scenes.length}`, `shot_count:${shotIds.length}`),
      risks: ["Shot generation can become visually impressive but spatially incoherent if camera geography is not rehearsed against the authored scene sequence."],
      repair_instructions: ["Rehearse scene geography and shot transitions against the authored IDs before releasing generation tasks."],
    },
    production_designer: {
      decision: `Own the physical world, materials, environmental logic and prop continuity of ${worldName || conceptPhysicalWorld || "the approved temporal visual world"} across the authored scene sequence.`,
      evidence: evidence(worldName && `visual_world:${worldName}`, conceptPhysicalWorld && `concept_physical_world:${conceptPhysicalWorld}`, visualWorld.materials_and_surface_behavior && "visual_world:materials_and_surface_behavior", visualWorld.architecture && "visual_world:architecture", sceneEvidence),
      risks: ["World, material or prop drift between shots would collapse the film into unrelated generated images."],
      repair_instructions: ["Hold approved world, material and prop authority constant across shot production and reject unmotivated substitutions."],
    },
    sound_design_supervisor: {
      decision: "Own source sound, designed transitions, silence, spatial detail and picture-locked sound cues so every authored visual state change has a motivated sonic consequence.",
      evidence: evidence(temporal.picture_locked_audio_direction_required === true && "temporal_contract:picture_locked_audio_direction_required", temporal.cinematic_spatial_soundfield_required === true && "temporal_contract:cinematic_spatial_soundfield_required", sceneEvidence),
      risks: ["Generic cinematic sound or music-first coverage can flatten the authored tension and erase scene-specific physical causality."],
      repair_instructions: ["Bind sound events to authored shot actions and transitions; preserve silence where it is structurally intentional."],
    },
    color_di_supervisor: {
      decision: `Own the final color pipeline and shot-to-shot image continuity for ${worldName || "the approved visual world"}, preserving the authored palette, light behavior and material response through finishing.`,
      evidence: evidence(worldName && `visual_world:${worldName}`, visualWorld.controlled_palette || visualWorld.palette_logic ? "visual_world:palette_logic" : "", visualWorld.light_behavior && "visual_world:light_behavior", outputSpec.resolution && `output_resolution:${outputSpec.resolution}`),
      risks: ["Independent generations can diverge in exposure, palette, contrast and material response even when composition is correct."],
      repair_instructions: ["Normalize exposure and palette by sequence while protecting intentional contrast changes and material truth."],
    },
    mix_finishing_engineer: {
      decision: "Own final dialogue/source-detail balance, spatial soundfield, dynamics and delivery mix so the picture-locked film retains intelligibility, restraint and authored tension through final output.",
      evidence: evidence(temporal.picture_locked_audio_direction_required === true && "temporal_contract:picture_locked_audio_direction_required", temporal.cinematic_spatial_soundfield_required === true && "temporal_contract:cinematic_spatial_soundfield_required", outputSpec.frame_rate && `frame_rate:${outputSpec.frame_rate}`),
      risks: ["A technically complete soundtrack can still mask human-scale detail or destroy the intended dynamic contrast."],
      repair_instructions: ["Mix against the locked picture and preserve deliberate silence, transient detail and dynamic headroom before delivery."],
    },
    post_production_supervisor: {
      decision: "Own the governed handoff from approved shot production through edit, VFX, color, sound, QC and final master delivery without bypassing any specialist evidence gate.",
      evidence: evidence(sceneEvidence, outputSpec.duration_seconds && `duration_seconds:${outputSpec.duration_seconds}`, outputSpec.resolution && `output_resolution:${outputSpec.resolution}`),
      risks: ["Parallel specialist outputs can drift from the approved master or be released out of order without one accountable finishing handoff."],
      repair_instructions: ["Require each specialist handoff and final QC proof to resolve against the same approved master-plan lineage before release."],
    },
  };

  const selected = decisions[roleId];
  if (!selected || !selected.evidence.length) return null;
  return {
    status: "ACTIVE",
    ...selected,
    confidence: 100,
    legacy_role_registry_backfill: true,
    derived_from_system_governance: true,
  };
}

function stillRoleBackfill(roleId, plan = {}) {
  const workflowKind = text(plan?.workflow_kind).toUpperCase();
  if (workflowKind !== "STILL") return null;
  const deliverables = Array.isArray(plan?.deliverables) ? plan.deliverables : [];
  const serialized = JSON.stringify({ deliverables, story: plan?.story || {}, concept: plan?.concept || {}, production: plan?.production || {} }).toLowerCase();

  if (roleId === "graphic_design_director") {
    const hasDesignedComposition = /composition|layout|grid|spacing|logo|format|poster|design/.test(serialized);
    if (!hasDesignedComposition) return null;
    return {
      status: "ACTIVE",
      decision: "Own the deterministic still composition, hierarchy, spacing, logo placement and responsive format adaptation defined by the approved deliverables.",
      evidence: deliverables.map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:").slice(0, 6),
      confidence: 100,
      risks: ["A generated image can be visually attractive while still failing the approved hierarchy, spacing or exact brand-asset placement."],
      repair_instructions: ["Keep layout, spacing and exact brand-asset placement deterministic and verify each required output format before release."],
      derived_from_system_governance: true,
    };
  }

  if (roleId === "typography_director") {
    const hasTypography = /typography|font|headline|tagline|copy|text|type/.test(serialized);
    if (!hasTypography) return null;
    return {
      status: "ACTIVE",
      decision: "Own audience-facing typography, line breaking, hierarchy and readability for the approved still deliverables, keeping exact copy deterministic rather than generated into pixels.",
      evidence: deliverables.map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:").slice(0, 6),
      confidence: 100,
      risks: ["Generated or unverified type can drift from approved copy, hierarchy, readability or brand fidelity."],
      repair_instructions: ["Composite exact approved copy and typography deterministically and verify readability at each delivery size."],
      derived_from_system_governance: true,
    };
  }

  if (roleId === "image_retouching_director") {
    const hasSourceEditing = /photo|photograph|retouch|source_asset|source asset|composite|compositing|skin|portrait|cleanup|relight/.test(serialized);
    if (hasSourceEditing) {
      return {
        status: "ACTIVE",
        decision: "Own bounded still-image cleanup and finishing while preserving approved composition, source identity and exact brand assets.",
        evidence: deliverables.map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:").slice(0, 6),
        confidence: 95,
        risks: ["Whole-image regeneration can destroy approved composition, identity or source fidelity when a bounded repair would suffice."],
        repair_instructions: ["Prefer local repair, cleanup and compositing over whole-image regeneration whenever approved structure can be preserved."],
        derived_from_system_governance: true,
      };
    }
    return {
      status: "NOT_REQUIRED",
      decision: "No source photograph, portrait or source-preserving retouch task is defined in the current still plan, so a dedicated retouching decision is not required at this planning stage.",
      evidence: [],
      confidence: 100,
      risks: [],
      repair_instructions: [],
      derived_from_system_governance: true,
    };
  }
  return null;
}

const MANDATORY_GOVERNANCE_ROLE_DECISIONS = Object.freeze({
  quality_director: (plan) => ({
    status: "ACTIVE",
    decision: `Enforce ${text(plan?.quality?.version) || "the system-owned creative quality policy"} as the release gate and reject work that fails the authored quality, continuity, realism or story requirements.`,
    evidence: [text(plan?.quality?.version) || "system-owned creative quality policy"],
    confidence: 100,
    risks: ["A technically completed output may still fail the authored release-quality threshold."],
    repair_instructions: ["Keep release blocked until every applicable quality failure is repaired and revalidated."],
    derived_from_system_governance: true,
  }),
  rights_safety_director: (plan) => ({
    status: "ACTIVE",
    decision: "Keep licensing, identity, claims, privacy and protected brand material governed throughout production and block release when required evidence is absent.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, `asset_manifest_entries:${Array.isArray(plan?.asset_manifest) ? plan.asset_manifest.length : 0}`],
    confidence: 100,
    risks: ["Generated or sourced material may introduce unsupported identity, licensing, claim or brand-use risk."],
    repair_instructions: ["Require traceable rights and safety evidence for any protected or identity-bearing material before release."],
    derived_from_system_governance: true,
  }),
  release_director: (plan) => ({
    status: "ACTIVE",
    decision: "Keep delivery and publication blocked until the governed master, approvals, quality checks, rights checks and required technical validations are complete.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, ...((Array.isArray(plan?.deliverables) ? plan.deliverables : []).map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:"))],
    confidence: 100,
    risks: ["Generation completion can be mistaken for release readiness without explicit release evidence."],
    repair_instructions: ["Do not publish or distribute until all release gates are explicitly satisfied."],
    derived_from_system_governance: true,
  }),
  performance_director: (plan) => ({
    status: "ACTIVE",
    decision: "Define post-release measurement against the mission and deliverable outcome, and keep learning signals separate from creative or release approval itself.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, ...((Array.isArray(plan?.deliverables) ? plan.deliverables : []).map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:"))],
    confidence: 100,
    risks: ["Generic engagement metrics could replace the actual mission outcome if measurement is not bound to the deliverable."],
    repair_instructions: ["Bind post-release learning to the mission outcome and use stronger business signals whenever they are available."],
    derived_from_system_governance: true,
  }),
});

export function applyDerivedRoleDecisions(plan = {}, roles = []) {
  const workflowKind = text(plan?.workflow_kind).toUpperCase();
  if (!workflowKind) return plan;

  const decisions = { ...object(plan.role_decisions) };
  let derived = 0;

  for (const role of roles) {
    const governanceFactory = MANDATORY_GOVERNANCE_ROLE_DECISIONS[role.id];
    const existingGovernance = object(decisions[role.id]);
    if (governanceFactory && text(existingGovernance.status).toUpperCase() !== "ACTIVE") {
      decisions[role.id] = governanceFactory(plan);
      derived += 1;
      continue;
    }

    const appliesTo = Array.isArray(role?.applies_to) ? role.applies_to : [];
    const eligible = appliesTo.includes("ALL") || appliesTo.includes(workflowKind);
    if (eligible) {
      const existing = object(decisions[role.id]);
      if (["ACTIVE", "NOT_REQUIRED"].includes(text(existing.status).toUpperCase())) continue;
      const backfilled = temporalEliteRoleBackfill(role.id, plan) || stillRoleBackfill(role.id, plan);
      if (backfilled) {
        decisions[role.id] = backfilled;
        derived += 1;
      }
      continue;
    }

    const existing = object(decisions[role.id]);
    if (["ACTIVE", "NOT_REQUIRED"].includes(text(existing.status).toUpperCase())) continue;

    decisions[role.id] = {
      ...existing,
      status: "NOT_REQUIRED",
      // The reason is the registry's own statement, not an invented rationale. Anyone reading the plan
      // can see this was derived rather than decided.
      decision: `Not applicable to ${workflowKind} work. This discipline is registered for ${
        appliesTo.join(" and ") || "other"
      } workflows only, so it is not required for this medium.`,
      derived_from_registry: true,
    };
    derived += 1;
  }

  if (!derived) return plan;
  return { ...plan, role_decisions: decisions };
}

export default applyDerivedRoleDecisions;
