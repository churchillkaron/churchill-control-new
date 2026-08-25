const CONTRACT = "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_MODEL_INPUT_V1";
const OPERATION = "PRODUCT_REPOSITORY_ASSESSMENT";
const MAX_FIXED_EVIDENCE_CHARS = 8000;
const MAX_DYNAMIC_EVIDENCE_CHARS = 6000;
const MAX_SEARCH_MATCHES = 12;
const MAX_SEARCH_MATCH_CHARS = 600;
const MAX_TRACKED_FILE_SAMPLE = 80;
const MAX_INVENTORY_ARRAY = 80;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, limit) {
  const source = String(value ?? "");
  if (source.length <= limit) return source;
  const head = Math.max(0, Math.floor(limit * 0.72));
  const tail = Math.max(0, limit - head);
  return `${source.slice(0, head)}\n...[MODEL_INPUT_COMPACTED]...\n${source.slice(-tail)}`;
}

function compactInventory(value) {
  const inventory = object(value);
  const compacted = {};
  const scalarKeys = [
    "contract",
    "source",
    "complete_tracked_file_count",
    "all_tracked_files_counted",
    "bounded_output",
    "surface_count",
    "extension_count",
    "surface_counts_truncated",
  ];
  for (const key of scalarKeys) {
    if (inventory[key] !== undefined) compacted[key] = inventory[key];
  }
  for (const key of [
    "top_level_counts",
    "surface_counts",
    "extension_counts",
    "representative_paths",
    "representative_tracked_files",
  ]) {
    if (Array.isArray(inventory[key])) {
      compacted[key] = inventory[key].slice(0, MAX_INVENTORY_ARRAY);
    }
  }
  return compacted;
}

function compactEvidenceFile(value, dynamic = false) {
  const file = object(value);
  const compacted = {
    file_path: text(file.file_path, 1000) || null,
    found: file.found === true,
  };
  for (const key of [
    "start_line",
    "end_line",
    "total_lines",
    "discovery_match_count",
    "discovery_score",
  ]) {
    if (file[key] !== undefined) compacted[key] = file[key];
  }
  if (Array.isArray(file.discovery_queries)) {
    compacted.discovery_queries = file.discovery_queries.slice(0, 8);
  }
  if (Array.isArray(file.discovery_sources)) {
    compacted.discovery_sources = file.discovery_sources.slice(0, 8);
  }
  if (Array.isArray(file.discovery_excerpts)) {
    compacted.discovery_excerpts = file.discovery_excerpts
      .slice(0, 3)
      .map((entry) => ({
        ...object(entry),
        excerpt: compactText(entry?.excerpt, 700),
      }));
  }
  if (file.error) compacted.error = text(file.error, 500);
  if (file.content) {
    compacted.content = compactText(
      file.content,
      dynamic ? MAX_DYNAMIC_EVIDENCE_CHARS : MAX_FIXED_EVIDENCE_CHARS,
    );
  }
  return compacted;
}

function compactSearch(value) {
  const search = object(value);
  return {
    query: text(search.query, 500) || null,
    paths: list(search.paths).slice(0, 12),
    source: text(search.source, 120) || null,
    match_count: Number(search.match_count || 0),
    truncated: search.truncated === true,
    matches: list(search.matches)
      .slice(0, MAX_SEARCH_MATCHES)
      .map((match) => compactText(match, MAX_SEARCH_MATCH_CHARS)),
    ...(search.error ? { error: text(search.error, 500) } : {}),
  };
}

function compactSnapshot(value) {
  const snapshot = object(value);
  const dynamic = object(snapshot.dynamic_evidence_expansion);
  return {
    generated_at: snapshot.generated_at || null,
    repository_url: snapshot.repository_url || null,
    ref: snapshot.ref || null,
    current_main_head: snapshot.current_main_head || null,
    verified_commit_sha: snapshot.verified_commit_sha || null,
    verified_commit_is_current_head: snapshot.verified_commit_is_current_head ?? null,
    main_advanced_after_verified_commit:
      snapshot.main_advanced_after_verified_commit ?? null,
    clean_checkout: snapshot.clean_checkout === true,
    package_manager: snapshot.package_manager || null,
    tracked_file_count: Number(snapshot.tracked_file_count || 0),
    tracked_files_sample: list(snapshot.tracked_files_sample)
      .slice(0, MAX_TRACKED_FILE_SAMPLE),
    tracked_files_sample_strategy: snapshot.tracked_files_sample_strategy || null,
    tracked_file_inventory: compactInventory(snapshot.tracked_file_inventory),
    evidence_files: list(snapshot.evidence_files)
      .map((file) => compactEvidenceFile(file, false)),
    evidence_query_plan: object(snapshot.evidence_query_plan),
    evidence_searches: list(snapshot.evidence_searches).map(compactSearch),
    dynamic_evidence_expansion: {
      method: dynamic.method || null,
      maximum_files: dynamic.maximum_files ?? null,
      allowed_prefixes: list(dynamic.allowed_prefixes),
      allowed_extensions: list(dynamic.allowed_extensions),
      candidate_count: Number(dynamic.candidate_count || 0),
      files: list(dynamic.files).map((file) => compactEvidenceFile(file, true)),
      bounded: dynamic.bounded === true,
      read_only: dynamic.read_only === true,
      authorization_effect: dynamic.authorization_effect || null,
    },
    requested_focus: snapshot.requested_focus || null,
    bounded_repository_evidence: snapshot.bounded_repository_evidence === true,
    dynamic_repository_evidence: snapshot.dynamic_repository_evidence === true,
    cross_surface_repository_evidence: snapshot.cross_surface_repository_evidence === true,
    repository_evidence_query_planner_attempted:
      snapshot.repository_evidence_query_planner_attempted === true,
    intelligence_planned_repository_evidence:
      snapshot.intelligence_planned_repository_evidence === true,
    full_repository_certification: snapshot.full_repository_certification === true,
    model_input_compaction: {
      contract: CONTRACT,
      full_runtime_snapshot_preserved: true,
      exact_evidence_paths_preserved: true,
      repository_head_preserved: true,
      fixed_evidence_content_chars_per_file: MAX_FIXED_EVIDENCE_CHARS,
      dynamic_evidence_content_chars_per_file: MAX_DYNAMIC_EVIDENCE_CHARS,
      search_matches_per_query: MAX_SEARCH_MATCHES,
      tracked_file_sample_limit: MAX_TRACKED_FILE_SAMPLE,
      authorization_effect: "NONE",
    },
  };
}

function compactMessage(message) {
  if (message?.role !== "user" || typeof message?.content !== "string") {
    return { ...message };
  }
  let parsed;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return { ...message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...message };
  }
  if (!parsed.repository_snapshot) return { ...message };
  return {
    ...message,
    content: JSON.stringify({
      ...parsed,
      repository_snapshot: compactSnapshot(parsed.repository_snapshot),
    }),
  };
}

export function compactProductRepositoryAssessmentConversation(
  conversation,
  metadata = {},
) {
  if (text(object(metadata).operation, 120) !== OPERATION) {
    return list(conversation).map((message) => ({ ...message }));
  }
  return list(conversation).map(compactMessage);
}

export const AvantiqoProductRepositoryAssessmentPromptCompactor = Object.freeze({
  contract: CONTRACT,
  operation: OPERATION,
  compactConversation: compactProductRepositoryAssessmentConversation,
});
