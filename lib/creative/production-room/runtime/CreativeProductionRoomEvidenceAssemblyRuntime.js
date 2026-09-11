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

function researchEvidence(stageInput = {}) {
  const report = stageInput.research_room_report || {};
  return {
    research_packet: report,
    source_manifest: report.evidence?.source_manifest || [],
    open_questions: report.evidence?.open_questions || [],
    room_report: report,
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

function technicalScoutEvidence(stageInput = {}) {
  const report = stageInput.report || {};
  const shotReports = list(report.shot_reports);
  return {
    location_truth: shotReports.map((item) => item.geography).filter(Boolean),
    technical_truth: shotReports.map((item) => item.technical).filter(Boolean),
    materials_truth: list(report.workstream_reports).filter((item) => [3, 8].includes(Number(item.requirement))),
    weather_light_truth: passedReport(report.workstream_reports, 5) || null,
    room_report: report,
  };
}

function previsEvidence(stageInput = {}, reports = []) {
  return {
    shot_blueprints: list(stageInput.shot_reports).map((item) => item.report).filter(Boolean),
    editorial_precheck: evidenceOf(reports, 12).editorial_precheck || null,
    coverage_plan: evidenceOf(reports, 7),
    effects_strategy: evidenceOf(reports, 9),
  };
}
function departmentBreakdownEvidence(stageInput = {}, reports = []) {
  const report = stageInput.report || {};
  const management = evidenceOf(reports, 18);
  return {
    department_assignments: list(report.shot_assignments),
    dependencies: management.dependency_graph || null,
    schedule: management.schedule || null,
    cost_risks: management.cost_risks || null,
    room_report: report,
  };
}

function virtualRehearsalEvidence(stageInput = {}, reports = []) {
  return {
    action_rehearsal: evidenceOf(reports, 6),
    camera_rehearsal: evidenceOf(reports, 4),
    continuity_rehearsal: evidenceOf(reports, 13),
    editability_proof: first(stageInput.editability_proof, evidenceOf(reports, 12).editorial_precheck),
    room_report: specializedRoomReport("VIRTUAL_REHEARSAL", stageInput),
  };
}

function productionUnitsEvidence(stageInput = {}, reports = []) {
  return {
    takes: first(stageInput.takes, evidenceOf(reports, 19).take_objectives),
    unit_reports: first(stageInput.unit_reports, stageInput.planned_units),
    capture_lineage: stageInput.capture_lineage || null,
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
  if (stageId === "RESEARCH_ROOM") evidence = researchEvidence(stage_input);
  else if (stageId === "CREATIVE_FLOOR") evidence = creativeFloorEvidence(stage_input, reports);
  else if (stageId === "CONCEPT_COMPETITION") evidence = conceptCompetitionEvidence(stage_input);
  else if (stageId === "TRIBUNAL") evidence = tribunalEvidence(stage_input);
  else if (stageId === "TECHNICAL_SCOUT") evidence = technicalScoutEvidence(stage_input);
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
