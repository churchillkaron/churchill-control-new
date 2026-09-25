export const CREATIVE_PRODUCTION_ROOM_EVIDENCE_ASSEMBLY_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_EVIDENCE_ASSEMBLY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function passedReport(reports = [], requirement) {
  return list(reports).find((report) =>
    Number(report?.requirement) === Number(requirement) && report?.passed === true,
  ) || null;
}
function evidenceOf(reports = [], requirement) {
  return object(passedReport(reports, requirement)?.evidence);
}
function first(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return text(value).length > 0;
  });
}
function specializedRoomReport(stageId, stageInput = {}) {
  if (stageId === "RESEARCH_ROOM") return stageInput.research_room_report || null;
  return stageInput.room_report || stageInput.report || null;
}

function researchEvidence(stageInput = {}, reports = []) {
  const report = stageInput.research_room_report || {};
  const specialistReport = passedReport(reports, 1);
  const specialist = object(specialistReport?.evidence);
  const compatibilityReport = specialistReport ? { contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1", passed: true, failures: [], workstream_report: specialistReport, evidence: specialist, zero_media_generation: true } : null;
  const roomReport = report.contract === "CREATIVE_RESEARCH_ROOM_ADAPTER_V1" && report.passed === true ? report : compatibilityReport;
  const researchPacket = first(roomReport, specialist);
  return {
    research_packet: researchPacket || null,
    source_manifest: first(roomReport?.evidence?.source_manifest, specialist.source_manifest) || [],
    open_questions: first(roomReport?.evidence?.open_questions, specialist.open_questions) || [],
    room_report: roomReport,
  };
}

function creativeFloorEvidence(stageInput = {}, reports = []) {
  const concept = object(stageInput.concept);
  const sound = evidenceOf(reports, 14);
  const look = evidenceOf(reports, 16);
  return {
    task_truth: concept.task_truth || null,
    human_truth: concept.human_truth || null,
    place_truth: concept.place_truth || null,
    sonic_thesis: first(stageInput.sonic_thesis, sound.sonic_world_bible, sound.acoustic_spaces),
    look_thesis: first(stageInput.look_thesis, look.show_look, look.show_lut_or_transform),
    room_report: specializedRoomReport("CREATIVE_FLOOR", stageInput),
  };
}
function conceptCompetitionEvidence(stageInput = {}) {
  const council = object(stageInput.council);
  return {
    concept_candidates: list(council.concepts),
    critic_reports: list(council.critic_reports),
    selected_concept: council.selection?.selected_concept || null,
    room_report: specializedRoomReport("CONCEPT_COMPETITION", stageInput),
  };
}

function tribunalEvidence(stageInput = {}) {
  const report = specializedRoomReport("TRIBUNAL", stageInput) || {};
  return {
    panel: report.panel || null,
    reviews: list(report.reviews),
    verdict: report.verdict || null,
    room_report: report,
  };
}

function technicalScoutEvidence(stageInput = {}, reports = []) {
  const report = stageInput.report || {};
  const shotReports = list(report.shot_reports);
  const research = evidenceOf(reports, 1);
  const designReport = passedReport(reports, 3);
  const lightingReport = passedReport(reports, 5);
  const materialReport = passedReport(reports, 8);
  const specialistComplete = Boolean(passedReport(reports, 1) && designReport && lightingReport && materialReport);
  const compatibilityReport = specialistComplete ? {
    contract: "CREATIVE_TECHNICAL_SCOUT_V1",
    passed: true,
    failures: [],
    shot_reports: [],
    workstream_reports: [designReport, lightingReport, materialReport],
    specialist_evidence_adapter: true,
    zero_provider_calls: true,
    zero_media_generation: true,
  } : null;
  const roomReport = report?.contract === "CREATIVE_TECHNICAL_SCOUT_V1" && report?.passed === true ? report : compatibilityReport;
  return {
    location_truth: first(shotReports.map((item) => item.geography).filter(Boolean), research.location_findings) || [],
    technical_truth: first(shotReports.map((item) => item.technical).filter(Boolean), research.technical_findings) || [],
    materials_truth: first(list(report.workstream_reports).filter((item) => [3, 8].includes(Number(item.requirement))), [designReport, materialReport].filter(Boolean)) || [],
    weather_light_truth: first(passedReport(report.workstream_reports, 5), lightingReport) || null,
    room_report: roomReport,
  };
}

function previsEvidence(stageInput = {}, reports = []) {
  const authoredBlueprints = list(stageInput.shot_reports).map((item) => item.report).filter(Boolean);
  const camera = evidenceOf(reports, 4);
  const action = evidenceOf(reports, 6);
  const coverage = evidenceOf(reports, 7);
  const editorial = evidenceOf(reports, 12);
  const specialistBlueprintPackage = !authoredBlueprints.length && camera.camera_package_logic && action.action_path && coverage.master_action_state && editorial.assembly_logic ? [{
    contract: 'CREATIVE_PREVIS_SPECIALIST_BLUEPRINT_PACKAGE_V1',
    camera,
    action,
    coverage,
    lighting: evidenceOf(reports, 5),
    materials: evidenceOf(reports, 8),
    effects: evidenceOf(reports, 9),
    editorial,
    continuity: evidenceOf(reports, 13),
    sonic_world: evidenceOf(reports, 14),
    look_color: evidenceOf(reports, 16),
    take_strategy: evidenceOf(reports, 19),
    zero_media_generation: true,
  }] : [];
  return {
    shot_blueprints: authoredBlueprints.length ? authoredBlueprints : specialistBlueprintPackage,
    editorial_precheck: editorial.editorial_precheck || null,
    coverage_plan: coverage,
    effects_strategy: evidenceOf(reports, 9),
  };
}
function departmentBreakdownEvidence(stageInput = {}, reports = []) {
  const report = stageInput.report || {};
  const management = evidenceOf(reports, 18);
  const required = [2, 3, 9, 10, 18];
  const specialistReports = required.map((requirement) => passedReport(reports, requirement)).filter(Boolean);
  const specialistComplete = specialistReports.length === required.length;
  const specialistAssignments = specialistReports.map((item) => ({
    requirement: item.requirement,
    workstream_id: item.workstream_id,
    owner: item.owner,
    required_outputs: list(item.required_outputs),
    passed: item.passed === true,
  }));
  const compatibilityReport = specialistComplete ? {
    contract: "CREATIVE_DEPARTMENT_BREAKDOWN_V1",
    passed: true,
    failures: [],
    units: specialistAssignments,
    shot_assignments: [],
    specialist_evidence_adapter: true,
    zero_provider_calls: true,
    zero_media_generation: true,
  } : null;
  const roomReport = report?.contract === "CREATIVE_DEPARTMENT_BREAKDOWN_V1" && report?.passed === true ? report : compatibilityReport;
  return {
    department_assignments: first(list(report.shot_assignments), specialistAssignments) || [],
    dependencies: management.dependency_graph || null,
    schedule: management.schedule || null,
    cost_risks: management.cost_risks || null,
    room_report: roomReport,
  };
}

function virtualRehearsalEvidence(stageInput = {}, reports = []) {
  const required = [2, 4, 5, 6, 7, 12, 13];
  const specialistReports = required.map((requirement) => passedReport(reports, requirement)).filter(Boolean);
  const specialistComplete = specialistReports.length === required.length;
  const existingReport = specializedRoomReport("VIRTUAL_REHEARSAL", stageInput);
  const compatibilityReport = specialistComplete ? {
    contract: "CREATIVE_VIRTUAL_REHEARSAL_V1",
    passed: true,
    failures: [],
    workstream_reports: specialistReports,
    specialist_evidence_adapter: true,
    zero_provider_calls: true,
    zero_media_generation: true,
  } : null;
  return {
    action_rehearsal: evidenceOf(reports, 6),
    camera_rehearsal: evidenceOf(reports, 4),
    continuity_rehearsal: evidenceOf(reports, 13),
    editability_proof: first(stageInput.editability_proof, evidenceOf(reports, 12).editorial_precheck),
    room_report: existingReport?.contract === "CREATIVE_VIRTUAL_REHEARSAL_V1" && existingReport?.passed === true ? existingReport : compatibilityReport,
  };
}

function productionUnitsEvidence(stageInput = {}, reports = []) {
  const passedReports = list(reports).filter((report) => report?.passed === true);
  const derivedUnitReports = passedReports.map((report) => ({
    requirement: Number(report.requirement),
    workstream_id: report.workstream_id || null,
    owner: report.owner || null,
    required_outputs: list(report.required_outputs),
    passed: true,
  }));
  const derivedCaptureLineage = passedReports.length ? {
    contract: "CREATIVE_PRODUCTION_UNITS_CAPTURE_LINEAGE_V1",
    source: "PASSED_PRODUCTION_WORKSTREAM_REPORTS",
    requirements: passedReports.map((report) => Number(report.requirement)),
    workstream_ids: passedReports.map((report) => report.workstream_id).filter(Boolean),
    zero_media_generation: true,
  } : null;
  return {
    takes: first(stageInput.takes, evidenceOf(reports, 19).take_objectives),
    unit_reports: first(stageInput.unit_reports, stageInput.planned_units, derivedUnitReports),
    capture_lineage: first(stageInput.capture_lineage, derivedCaptureLineage),
  };
}
function dailiesEvidence(stageInput = {}, reports = []) {
  const report = specializedRoomReport("DAILIES", stageInput) || {};
  const stream = evidenceOf(reports, 11);
  return {
    department_reviews: first(stageInput.department_reviews, report.reviews, stream.department_reviews),
    rejections: first(stageInput.rejections, report.rejections, stream.rejections),
    approved_takes: first(stageInput.approved_takes, report.approved_takes, stream.approved_takes),
    room_report: report,
  };
}

function editorialEvidence(stageInput = {}, reports = []) {
  const report = specializedRoomReport("EDITORIAL", stageInput) || {};
  const stream = evidenceOf(reports, 12);
  return {
    assembly: first(stageInput.assembly, report.assembly, stream.assembly_logic),
    coverage_gaps: first(stageInput.coverage_gaps, report.coverage_gaps, stream.coverage_gaps),
    edit_decisions: first(stageInput.edit_decisions, report.edit_decisions, stream.transition_logic),
    room_report: report,
  };
}

function vfxEvidence(stageInput = {}, reports = []) {
  const report = specializedRoomReport("VFX", stageInput) || {};
  const stream = evidenceOf(reports, 10);
  return {
    shot_versions: first(stageInput.shot_versions, report.shot_versions, stream.version_lineage),
    integration_reviews: first(stageInput.integration_reviews, report.integration_reviews, stream.review_notes),
    approved_vfx: first(stageInput.approved_vfx, report.approved_vfx, stream.approved_states),
    room_report: report,
  };
}
function colorEvidence(stageInput = {}, reports = []) {
  const report = specializedRoomReport("COLOR", stageInput) || {};
  const stream = evidenceOf(reports, 16);
  return {
    look_continuity: first(stageInput.look_continuity, report.look_continuity, stream.shot_match_strategy),
    shot_matches: first(stageInput.shot_matches, report.shot_matches, stream.shot_match_strategy),
    approved_grade: first(stageInput.approved_grade, report.approved_grade),
    room_report: report,
  };
}

function soundMusicEvidence(stageInput = {}, reports = []) {
  const report = specializedRoomReport("SOUND_MUSIC", stageInput) || {};
  const sound = evidenceOf(reports, 14);
  const music = evidenceOf(reports, 15);
  return {
    sound_world: first(stageInput.sound_world, report.sound_world, sound.sonic_world_bible),
    music_edit: first(stageInput.music_edit, report.music_edit, music.music_edit_map),
    mix_review: first(stageInput.mix_review, report.mix_review),
    approved_mix: first(stageInput.approved_mix, report.approved_mix),
    room_report: report,
  };
}

function masterReviewEvidence(stageInput = {}) {
  const report = specializedRoomReport("MASTER_DIRECTOR_REVIEW", stageInput) || {};
  return {
    director_verdict: first(stageInput.director_verdict, report.director_verdict),
    weakest_link_review: first(stageInput.weakest_link_review, report.weakest_link_review),
    final_repairs: first(stageInput.final_repairs, report.final_repairs),
    room_report: report,
  };
}
function masteringEvidence(stageInput = {}) {
  const report = specializedRoomReport("MASTERING", stageInput) || {};
  return {
    mastering_inspection: report,
    render: report.render || null,
    quality: report.quality || null,
    audio_integrity: report.audio?.master_integrity || report.audio || null,
    room_report: report,
  };
}
function releaseEvidence(stageInput = {}) {
  const report = specializedRoomReport("RELEASE", stageInput) || {};
  return {
    master_qc: first(stageInput.master_qc, report.master_qc),
    rights_clearance: first(stageInput.rights_clearance, report.rights_clearance, report.rights),
    delivery_approval: first(stageInput.delivery_approval, report.delivery_approval, report.delivery),
    room_report: report,
  };
}

export function assembleProductionRoomEvidence({ stage_id, stage_input = {}, workstream_reports = [] } = {}) {
  const stageId = text(stage_id).toUpperCase();
  const reports = list(workstream_reports);
  let evidence = {};
  if (stageId === "RESEARCH_ROOM") evidence = researchEvidence(stage_input, reports);
  else if (stageId === "CREATIVE_FLOOR") evidence = creativeFloorEvidence(stage_input, reports);
  else if (stageId === "CONCEPT_COMPETITION") evidence = conceptCompetitionEvidence(stage_input);
  else if (stageId === "TRIBUNAL") evidence = tribunalEvidence(stage_input);
  else if (stageId === "TECHNICAL_SCOUT") evidence = technicalScoutEvidence(stage_input, reports);
  else if (stageId === "PREVIS") evidence = previsEvidence(stage_input, reports);
  else if (stageId === "DEPARTMENT_BREAKDOWN") evidence = departmentBreakdownEvidence(stage_input, reports);
  else if (stageId === "VIRTUAL_REHEARSAL") evidence = virtualRehearsalEvidence(stage_input, reports);
  else if (stageId === "PRODUCTION_UNITS") evidence = productionUnitsEvidence(stage_input, reports);
  else if (stageId === "DAILIES") evidence = dailiesEvidence(stage_input, reports);
  else if (stageId === "EDITORIAL") evidence = editorialEvidence(stage_input, reports);
  else if (stageId === "VFX") evidence = vfxEvidence(stage_input, reports);
  else if (stageId === "COLOR") evidence = colorEvidence(stage_input, reports);
  else if (stageId === "SOUND_MUSIC") evidence = soundMusicEvidence(stage_input, reports);
  else if (stageId === "MASTER_DIRECTOR_REVIEW") evidence = masterReviewEvidence(stage_input);
  else if (stageId === "MASTERING") evidence = masteringEvidence(stage_input);
  else if (stageId === "RELEASE") evidence = releaseEvidence(stage_input);
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_EVIDENCE_ASSEMBLY_CONTRACT,
    stage_id: stageId,
    evidence,
    room_report: specializedRoomReport(stageId, stage_input),
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeProductionRoomEvidenceAssemblyRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_EVIDENCE_ASSEMBLY_CONTRACT,
  assemble: assembleProductionRoomEvidence,
});
