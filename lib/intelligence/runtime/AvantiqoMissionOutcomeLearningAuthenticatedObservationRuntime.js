import { createHash } from "node:crypto";
import CoreRuntime, {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  buildAvantiqoMissionOutcomeEvidenceCandidateRow as buildCoreEvidenceCandidateRow,
  buildAvantiqoMissionOutcomeLearningObservation as buildCoreObservation,
  computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  evaluateAvantiqoMissionOutcomePattern as evaluateCorePattern,
} from "./AvantiqoMissionOutcomeLearningCoreRuntime.js";
import {
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  createAvantiqoMissionOutcomeObservationAuthenticityVerifier,
  sealAvantiqoMissionOutcomeObservationAuthenticity,
} from "./AvantiqoMissionOutcomeObservationAuthenticityRuntime.js";

export {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
};

const MEMORY_TABLE = "intelligence_memories";
const OUTCOME_SCOPE = "platform_learning_outcomes";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const SOURCE = "verified_mission_outcome_learning";
const LEARNING_EVIDENCE_BRIDGE_CONTRACT =
  "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1";
const SHA256_RE = /^[A-Fa-f0-9]{64}$/;

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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validSha256(value) {
  return SHA256_RE.test(text(value, 128));
}

function validDatabaseTimestamp(value) {
  const timestamp = text(value, 80);
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? timestamp : null;
}

function learningOrganizationId(explicit = null) {
  return text(
    explicit || process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,
    160,
  );
}

function historySnapshotFingerprint(rows) {
  const hash = createHash("sha256");
  hash.update("mission-outcome-history-snapshot-v1");
  for (const row of list(rows)) {
    hash.update("|");
    hash.update(stableJson({
      id: text(row?.id, 180),
      memory_scope: text(row?.memory_scope, 160),
      memory_key: text(row?.memory_key, 160),
      source: text(row?.source, 180),
      active: row?.active === true,
      created_at: text(row?.created_at, 80),
      updated_at: text(row?.updated_at, 80),
      metadata: object(row?.metadata),
    }));
  }
  return hash.digest("hex");
}

function authenticationFlags(verifierAvailable) {
  return {
    observation_authenticity_required: true,
    observation_authenticity_verified: verifierAvailable === true,
    server_only_observation_authenticity_key_required: true,
    database_stored_authenticity_secret_allowed: false,
    database_only_writer_cannot_reseal_without_server_key: true,
    observation_authenticity_key_rotation_supported: true,
  };
}

export function buildAvantiqoMissionOutcomeLearningObservation(input = {}) {
  const prepared = buildCoreObservation(input);
  if (!prepared?.eligible || !prepared?.row) return prepared;

  const authenticity = sealAvantiqoMissionOutcomeObservationAuthenticity(
    prepared.row,
  );
  if (!authenticity.success || !authenticity.row) {
    return {
      ...prepared,
      eligible: false,
      status: "NOT_ELIGIBLE_OBSERVATION_AUTHENTICITY_UNAVAILABLE",
      blockers: [
        text(authenticity.reason, 160) ||
          "OBSERVATION_AUTHENTICITY_KEYRING_REQUIRED",
      ],
      row: null,
      observation_authenticity_contract:
        AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
      observation_authenticity_sealed: false,
    };
  }

  const row = authenticity.row;
  row.metadata.observation_integrity_fingerprint =
    computeAvantiqoMissionOutcomeObservationIntegrityFingerprint(row);

  return {
    ...prepared,
    row,
    observation_integrity_fingerprint:
      row.metadata.observation_integrity_fingerprint,
    observation_authenticity_contract:
      AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
    observation_authenticity_algorithm:
      AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
    observation_authenticity_key_id:
      text(row.metadata.observation_authenticity_key_id, 80) || null,
    observation_authenticity_mac:
      text(row.metadata.observation_authenticity_mac, 64).toLowerCase(),
    observation_authenticity_sealed: true,
  };
}

export function evaluateAvantiqoMissionOutcomePattern({
  observations = [],
  pattern_fingerprint,
  limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
} = {}) {
  const suppliedRows = list(observations);
  const verifier = createAvantiqoMissionOutcomeObservationAuthenticityVerifier();
  const authenticatedRows = verifier.available
    ? suppliedRows.filter((row) => verifier.verify(row))
    : [];
  const rejectedForAuthenticity = Math.max(
    0,
    suppliedRows.length - authenticatedRows.length,
  );
  const evaluation = evaluateCorePattern({
    observations: authenticatedRows,
    pattern_fingerprint,
    limits,
  });
  const coreExcluded = Number(evaluation.excluded_observation_count || 0);

  return {
    ...evaluation,
    excluded_observation_count: coreExcluded + rejectedForAuthenticity,
    observation_authenticity_available: verifier.available === true,
    observation_authenticity_rejected_row_count: rejectedForAuthenticity,
    observation_authenticity_verified_row_count: authenticatedRows.length,
    anti_overfitting: {
      ...object(evaluation.anti_overfitting),
      ...authenticationFlags(verifier.available),
    },
  };
}

export function buildAvantiqoMissionOutcomeEvidenceCandidateRow(input = {}) {
  const evaluation = object(input.pattern_evaluation);
  const anti = object(evaluation.anti_overfitting);
  if (
    evaluation.observation_authenticity_available !== true ||
    anti.observation_authenticity_required !== true ||
    anti.observation_authenticity_verified !== true ||
    anti.server_only_observation_authenticity_key_required !== true ||
    anti.database_stored_authenticity_secret_allowed !== false ||
    anti.database_only_writer_cannot_reseal_without_server_key !== true ||
    anti.observation_authenticity_key_rotation_supported !== true
  ) {
    return null;
  }

  const candidate = buildCoreEvidenceCandidateRow(input);
  if (!candidate) return null;
  candidate.metadata = {
    ...object(candidate.metadata),
    observation_authenticity_contract:
      AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
    observation_authenticity_algorithm:
      AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
    observation_authenticity_required: true,
    observation_authenticity_verified: true,
    server_only_observation_authenticity_key_required: true,
    database_stored_authenticity_secret_allowed: false,
    database_only_writer_cannot_reseal_without_server_key: true,
    observation_authenticity_key_rotation_supported: true,
    observation_authenticity_rejected_row_count: Number(
      evaluation.observation_authenticity_rejected_row_count || 0,
    ),
    observation_authenticity_verified_row_count: Number(
      evaluation.observation_authenticity_verified_row_count || 0,
    ),
  };
  return candidate;
}

async function resolveDatabase(database) {
  if (database) return database;
  const module = await import("../../shared/supabase/admin.js");
  return module.supabaseAdmin;
}

function historyScanConfiguration(limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS) {
  const uniqueLimit = boundedInteger(
    limits.max_pattern_observations,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_pattern_observations,
    1,
    2000,
  );
  const pageSize = boundedInteger(
    limits.history_page_size,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.history_page_size,
    1,
    1000,
  );
  const maxPages = boundedInteger(
    limits.max_history_pages,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_history_pages,
    1,
    256,
  );
  const rawScanLimit = boundedInteger(
    limits.max_raw_history_scan,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_raw_history_scan,
    uniqueLimit,
    50000,
  );
  return {
    unique_limit: uniqueLimit,
    page_size: pageSize,
    max_pages: maxPages,
    raw_scan_limit: rawScanLimit,
    snapshot_verification_passes:
      AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.history_snapshot_verification_passes,
  };
}

function patternObservationQuery(
  client,
  organizationId,
  patternFingerprint,
  exactCount = false,
  snapshotWatermark = null,
) {
  const selection = exactCount
    ? client
      .from(MEMORY_TABLE)
      .select(
        "id,memory_scope,memory_key,source,active,metadata,created_at,updated_at",
        { count: "exact" },
      )
    : client
      .from(MEMORY_TABLE)
      .select("id,memory_scope,memory_key,source,active,metadata,created_at,updated_at");
  let query = selection
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .eq("metadata->>pattern_fingerprint", patternFingerprint);
  if (snapshotWatermark) {
    if (typeof query.lte !== "function") return null;
    query = query.lte("created_at", snapshotWatermark);
  }
  return query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}

function incompleteHistoryScan(configuration, reason, extra = {}) {
  return {
    rows: list(extra.rows),
    history_scan_complete: false,
    history_scan_mode: text(extra.history_scan_mode, 80) ||
      "SUPABASE_WATERMARK_TWO_PASS_RANGE_V1",
    history_scan_reason: reason,
    raw_rows_scanned: Number(extra.raw_rows_scanned || 0),
    total_matching_rows: Number.isInteger(extra.total_matching_rows)
      ? extra.total_matching_rows
      : null,
    history_pages_scanned: Number(extra.history_pages_scanned || 0),
    history_count_stable: extra.history_count_stable === true,
    stable_row_identity: extra.stable_row_identity === true,
    scan_limit_exceeded: extra.scan_limit_exceeded === true,
    page_limit_exceeded: extra.page_limit_exceeded === true,
    history_snapshot_verified: false,
    history_snapshot_mode: text(extra.history_snapshot_mode, 80) ||
      "SUPABASE_WATERMARK_TWO_PASS_RANGE_V1",
    history_snapshot_fingerprint: null,
    history_snapshot_manifest_stable: false,
    history_snapshot_passes: Number(extra.history_snapshot_passes || 0),
    history_snapshot_watermark:
      text(extra.history_snapshot_watermark, 80) || null,
    history_snapshot_rows_reverified: Number(
      extra.history_snapshot_rows_reverified || 0,
    ),
    history_snapshot_capture_count: Number.isInteger(
      extra.history_snapshot_capture_count,
    )
      ? extra.history_snapshot_capture_count
      : null,
    ...configuration,
  };
}

async function scanPatternHistoryPass(
  client,
  organizationId,
  patternFingerprint,
  configuration,
  snapshotWatermark,
  expectedCount,
) {
  const firstQuery = patternObservationQuery(
    client,
    organizationId,
    patternFingerprint,
    true,
    snapshotWatermark,
  );
  if (!firstQuery || typeof firstQuery.range !== "function") {
    return {
      complete: false,
      reason: "WATERMARK_FILTERED_RANGE_PAGINATION_REQUIRED",
      rows: [],
      count: null,
      pages_scanned: 0,
      stable_row_identity: false,
      manifest_fingerprint: null,
    };
  }

  const firstTo = Math.min(
    configuration.page_size,
    configuration.raw_scan_limit,
  ) - 1;
  const firstResult = await firstQuery.range(0, firstTo);
  if (firstResult.error) throw firstResult.error;
  const initialCount = Number(firstResult.count);
  const firstRows = list(firstResult.data);
  if (!Number.isInteger(initialCount) || initialCount < 0) {
    return {
      complete: false,
      reason: "EXACT_HISTORY_COUNT_REQUIRED",
      rows: firstRows,
      count: null,
      pages_scanned: 1,
      stable_row_identity: false,
      manifest_fingerprint: null,
    };
  }
  if (initialCount !== expectedCount) {
    return {
      complete: false,
      reason: "HISTORY_COUNT_CHANGED_AFTER_WATERMARK_CAPTURE",
      rows: firstRows,
      count: initialCount,
      pages_scanned: 1,
      stable_row_identity: true,
      manifest_fingerprint: null,
    };
  }
  if (initialCount > configuration.raw_scan_limit) {
    return {
      complete: false,
      reason: "RAW_HISTORY_SCAN_LIMIT_EXCEEDED",
      rows: firstRows,
      count: initialCount,
      pages_scanned: 1,
      stable_row_identity: true,
      manifest_fingerprint: null,
      scan_limit_exceeded: true,
    };
  }

  const rows = [];
  const seenRowIds = new Set();
  let stableRowIdentity = true;
  let pagesScanned = 0;

  function appendPage(page) {
    for (const row of page) {
      const rowId = text(row?.id, 180);
      if (!rowId || seenRowIds.has(rowId)) stableRowIdentity = false;
      if (rowId) seenRowIds.add(rowId);
      rows.push(row);
    }
  }

  appendPage(firstRows);
  pagesScanned = 1;

  while (rows.length < expectedCount && pagesScanned < configuration.max_pages) {
    const from = rows.length;
    const to = Math.min(
      from + configuration.page_size - 1,
      expectedCount - 1,
      configuration.raw_scan_limit - 1,
    );
    const pageQuery = patternObservationQuery(
      client,
      organizationId,
      patternFingerprint,
      true,
      snapshotWatermark,
    );
    if (!pageQuery || typeof pageQuery.range !== "function") {
      return {
        complete: false,
        reason: "WATERMARK_FILTERED_RANGE_PAGINATION_REQUIRED",
        rows,
        count: expectedCount,
        pages_scanned: pagesScanned,
        stable_row_identity: stableRowIdentity,
        manifest_fingerprint: null,
      };
    }
    const pageResult = await pageQuery.range(from, to);
    if (pageResult.error) throw pageResult.error;
    const pageCount = Number(pageResult.count);
    if (!Number.isInteger(pageCount) || pageCount !== expectedCount) {
      return {
        complete: false,
        reason: "HISTORY_COUNT_CHANGED_DURING_SCAN",
        rows,
        count: Number.isInteger(pageCount) ? pageCount : null,
        pages_scanned: pagesScanned,
        stable_row_identity: stableRowIdentity,
        manifest_fingerprint: null,
      };
    }
    const page = list(pageResult.data);
    pagesScanned += 1;
    if (!page.length) break;
    appendPage(page);
  }

  if (rows.length < expectedCount && pagesScanned >= configuration.max_pages) {
    return {
      complete: false,
      reason: "HISTORY_PAGE_LIMIT_EXCEEDED",
      rows,
      count: expectedCount,
      pages_scanned: pagesScanned,
      stable_row_identity: stableRowIdentity,
      manifest_fingerprint: null,
      page_limit_exceeded: true,
    };
  }

  const verificationQuery = patternObservationQuery(
    client,
    organizationId,
    patternFingerprint,
    true,
    snapshotWatermark,
  );
  if (!verificationQuery || typeof verificationQuery.range !== "function") {
    return {
      complete: false,
      reason: "WATERMARK_FILTERED_RANGE_PAGINATION_REQUIRED",
      rows,
      count: expectedCount,
      pages_scanned: pagesScanned,
      stable_row_identity: stableRowIdentity,
      manifest_fingerprint: null,
    };
  }
  const verificationResult = await verificationQuery.range(0, 0);
  if (verificationResult.error) throw verificationResult.error;
  const finalCount = Number(verificationResult.count);
  if (!Number.isInteger(finalCount) || finalCount !== expectedCount) {
    return {
      complete: false,
      reason: "HISTORY_COUNT_CHANGED_DURING_SCAN",
      rows,
      count: Number.isInteger(finalCount) ? finalCount : null,
      pages_scanned: pagesScanned,
      stable_row_identity: stableRowIdentity,
      manifest_fingerprint: null,
    };
  }

  const complete = stableRowIdentity && rows.length === expectedCount;
  return {
    complete,
    reason: complete ? null : "HISTORY_ROWS_INCOMPLETE_OR_UNSTABLE",
    rows,
    count: expectedCount,
    pages_scanned: pagesScanned,
    stable_row_identity: stableRowIdentity,
    manifest_fingerprint: complete ? historySnapshotFingerprint(rows) : null,
  };
}

async function loadPatternObservations(
  client,
  organizationId,
  patternFingerprint,
  limits,
  { allow_legacy_injected_adapter = false } = {},
) {
  const configuration = historyScanConfiguration(limits);
  const headQuery = patternObservationQuery(
    client,
    organizationId,
    patternFingerprint,
    true,
  );

  if (!headQuery || typeof headQuery.range !== "function") {
    if (!allow_legacy_injected_adapter || !headQuery || typeof headQuery.limit !== "function") {
      return incompleteHistoryScan(
        configuration,
        "ORDERED_RANGE_PAGINATION_REQUIRED",
        { history_scan_mode: "UNSUPPORTED_DATABASE_ADAPTER" },
      );
    }
    const fallback = await headQuery.limit(configuration.raw_scan_limit);
    if (fallback.error) throw fallback.error;
    const fallbackRows = list(fallback.data);
    const rowIds = fallbackRows.map((row) => text(row?.id, 180));
    const stableRowIdentity = rowIds.every(Boolean) &&
      new Set(rowIds).size === rowIds.length;
    const complete = Boolean(
      fallbackRows.length < configuration.raw_scan_limit && stableRowIdentity
    );
    return {
      rows: fallbackRows,
      history_scan_complete: complete,
      history_scan_mode: "LEGACY_INJECTED_ADAPTER_ATOMIC_LIMIT",
      history_scan_reason: complete
        ? null
        : stableRowIdentity
          ? "RAW_HISTORY_SCAN_LIMIT_EXCEEDED"
          : "HISTORY_ROWS_INCOMPLETE_OR_UNSTABLE",
      raw_rows_scanned: fallbackRows.length,
      total_matching_rows: complete ? fallbackRows.length : null,
      history_pages_scanned: fallbackRows.length ? 1 : 0,
      history_count_stable: complete,
      stable_row_identity: stableRowIdentity,
      scan_limit_exceeded: fallbackRows.length >= configuration.raw_scan_limit,
      page_limit_exceeded: false,
      history_snapshot_verified: complete,
      history_snapshot_mode: "LEGACY_INJECTED_ADAPTER_ATOMIC_LIMIT",
      history_snapshot_fingerprint: complete
        ? historySnapshotFingerprint(fallbackRows)
        : null,
      history_snapshot_manifest_stable: complete,
      history_snapshot_passes: complete ? 1 : 0,
      history_snapshot_watermark: null,
      history_snapshot_rows_reverified: complete ? fallbackRows.length : 0,
      history_snapshot_capture_count: complete ? fallbackRows.length : null,
      ...configuration,
    };
  }

  const headResult = await headQuery.range(0, 0);
  if (headResult.error) throw headResult.error;
  const captureCount = Number(headResult.count);
  const headRows = list(headResult.data);
  if (!Number.isInteger(captureCount) || captureCount < 0) {
    return incompleteHistoryScan(configuration, "EXACT_HISTORY_COUNT_REQUIRED", {
      rows: headRows,
      raw_rows_scanned: headRows.length,
      history_pages_scanned: 1,
    });
  }
  if (captureCount < 1 || !headRows.length) {
    return incompleteHistoryScan(configuration, "HISTORY_WATERMARK_ROW_REQUIRED", {
      rows: headRows,
      raw_rows_scanned: headRows.length,
      total_matching_rows: captureCount,
      history_pages_scanned: 1,
      history_snapshot_capture_count: captureCount,
    });
  }
  const snapshotWatermark = validDatabaseTimestamp(headRows[0]?.created_at);
  if (!snapshotWatermark) {
    return incompleteHistoryScan(configuration, "HISTORY_WATERMARK_TIMESTAMP_INVALID", {
      rows: headRows,
      raw_rows_scanned: headRows.length,
      total_matching_rows: captureCount,
      history_pages_scanned: 1,
      history_snapshot_capture_count: captureCount,
    });
  }
  if (captureCount > configuration.raw_scan_limit) {
    return incompleteHistoryScan(configuration, "RAW_HISTORY_SCAN_LIMIT_EXCEEDED", {
      rows: headRows,
      raw_rows_scanned: headRows.length,
      total_matching_rows: captureCount,
      history_pages_scanned: 1,
      history_count_stable: true,
      stable_row_identity: true,
      scan_limit_exceeded: true,
      history_snapshot_watermark: snapshotWatermark,
      history_snapshot_capture_count: captureCount,
    });
  }

  const firstPass = await scanPatternHistoryPass(
    client,
    organizationId,
    patternFingerprint,
    configuration,
    snapshotWatermark,
    captureCount,
  );
  if (!firstPass.complete) {
    return incompleteHistoryScan(
      configuration,
      firstPass.reason || "HISTORY_FIRST_SNAPSHOT_PASS_FAILED",
      {
        rows: firstPass.rows,
        raw_rows_scanned: firstPass.rows.length,
        total_matching_rows: firstPass.count,
        history_pages_scanned: 1 + firstPass.pages_scanned,
        history_count_stable:
          firstPass.reason !== "HISTORY_COUNT_CHANGED_AFTER_WATERMARK_CAPTURE" &&
          firstPass.reason !== "HISTORY_COUNT_CHANGED_DURING_SCAN",
        stable_row_identity: firstPass.stable_row_identity,
        scan_limit_exceeded: firstPass.scan_limit_exceeded === true,
        page_limit_exceeded: firstPass.page_limit_exceeded === true,
        history_snapshot_passes: 1,
        history_snapshot_watermark: snapshotWatermark,
        history_snapshot_capture_count: captureCount,
      },
    );
  }

  const secondPass = await scanPatternHistoryPass(
    client,
    organizationId,
    patternFingerprint,
    configuration,
    snapshotWatermark,
    captureCount,
  );
  if (!secondPass.complete) {
    return incompleteHistoryScan(
      configuration,
      secondPass.reason || "HISTORY_SECOND_SNAPSHOT_PASS_FAILED",
      {
        rows: secondPass.rows,
        raw_rows_scanned: secondPass.rows.length,
        total_matching_rows: secondPass.count,
        history_pages_scanned:
          1 + firstPass.pages_scanned + secondPass.pages_scanned,
        history_count_stable:
          secondPass.reason !== "HISTORY_COUNT_CHANGED_AFTER_WATERMARK_CAPTURE" &&
          secondPass.reason !== "HISTORY_COUNT_CHANGED_DURING_SCAN",
        stable_row_identity:
          firstPass.stable_row_identity && secondPass.stable_row_identity,
        scan_limit_exceeded: secondPass.scan_limit_exceeded === true,
        page_limit_exceeded: secondPass.page_limit_exceeded === true,
        history_snapshot_passes: 2,
        history_snapshot_watermark: snapshotWatermark,
        history_snapshot_rows_reverified: secondPass.rows.length,
        history_snapshot_capture_count: captureCount,
      },
    );
  }

  const manifestStable = Boolean(
    firstPass.count === secondPass.count &&
    firstPass.rows.length === secondPass.rows.length &&
    validSha256(firstPass.manifest_fingerprint) &&
    firstPass.manifest_fingerprint === secondPass.manifest_fingerprint
  );
  if (!manifestStable) {
    return incompleteHistoryScan(
      configuration,
      "HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES",
      {
        rows: secondPass.rows,
        raw_rows_scanned: secondPass.rows.length,
        total_matching_rows: secondPass.count,
        history_pages_scanned:
          1 + firstPass.pages_scanned + secondPass.pages_scanned,
        history_count_stable: true,
        stable_row_identity:
          firstPass.stable_row_identity && secondPass.stable_row_identity,
        history_snapshot_passes: 2,
        history_snapshot_watermark: snapshotWatermark,
        history_snapshot_rows_reverified: secondPass.rows.length,
        history_snapshot_capture_count: captureCount,
      },
    );
  }

  return {
    rows: secondPass.rows,
    history_scan_complete: true,
    history_scan_mode: "SUPABASE_WATERMARK_TWO_PASS_RANGE_V1",
    history_scan_reason: null,
    raw_rows_scanned: secondPass.rows.length,
    total_matching_rows: secondPass.count,
    history_pages_scanned:
      1 + firstPass.pages_scanned + secondPass.pages_scanned,
    history_count_stable: true,
    stable_row_identity:
      firstPass.stable_row_identity && secondPass.stable_row_identity,
    scan_limit_exceeded: false,
    page_limit_exceeded: false,
    history_snapshot_verified: true,
    history_snapshot_mode: "SUPABASE_WATERMARK_TWO_PASS_RANGE_V1",
    history_snapshot_fingerprint: secondPass.manifest_fingerprint,
    history_snapshot_manifest_stable: true,
    history_snapshot_passes: 2,
    history_snapshot_watermark: snapshotWatermark,
    history_snapshot_rows_reverified: secondPass.rows.length,
    history_snapshot_capture_count: captureCount,
    ...configuration,
  };
}

function applyHistoryScanGate(evaluation, historyScan) {
  const scan = object(historyScan);
  const snapshotVerified = scan.history_snapshot_verified === true;
  const complete = Boolean(scan.history_scan_complete === true && snapshotVerified);
  return {
    ...evaluation,
    status: complete
      ? evaluation.status
      : "INCOMPLETE_HISTORY_SCAN_BLOCKS_EVIDENCE_CANDIDATE",
    eligible_for_evidence_candidate:
      complete && evaluation.eligible_for_evidence_candidate === true,
    history_scan_complete: complete,
    history_scan_mode: text(scan.history_scan_mode, 80) || null,
    history_scan_reason: text(scan.history_scan_reason, 160) || null,
    raw_rows_scanned: Number(scan.raw_rows_scanned || 0),
    total_matching_rows: Number.isInteger(scan.total_matching_rows)
      ? scan.total_matching_rows
      : null,
    history_pages_scanned: Number(scan.history_pages_scanned || 0),
    history_count_stable: scan.history_count_stable === true,
    stable_row_identity: scan.stable_row_identity === true,
    raw_history_scan_limit: Number(scan.raw_scan_limit || 0),
    history_page_size: Number(scan.page_size || 0),
    max_history_pages: Number(scan.max_pages || 0),
    scan_limit_exceeded: scan.scan_limit_exceeded === true,
    page_limit_exceeded: scan.page_limit_exceeded === true,
    history_snapshot_verified: snapshotVerified,
    history_snapshot_mode: text(scan.history_snapshot_mode, 80) || null,
    history_snapshot_fingerprint: validSha256(scan.history_snapshot_fingerprint)
      ? text(scan.history_snapshot_fingerprint, 128).toLowerCase()
      : null,
    history_snapshot_manifest_stable:
      scan.history_snapshot_manifest_stable === true,
    history_snapshot_passes: Number(scan.history_snapshot_passes || 0),
    history_snapshot_watermark:
      text(scan.history_snapshot_watermark, 80) || null,
    history_snapshot_rows_reverified: Number(
      scan.history_snapshot_rows_reverified || 0,
    ),
    history_snapshot_capture_count: Number.isInteger(
      scan.history_snapshot_capture_count,
    )
      ? scan.history_snapshot_capture_count
      : null,
    anti_overfitting: {
      ...object(evaluation.anti_overfitting),
      complete_history_scan_required: true,
      incomplete_history_blocks_evidence_candidate: true,
      raw_rows_cannot_crowd_out_unique_observation_limit: true,
      history_count_must_remain_stable_during_scan: true,
      stable_row_identity_required_across_pages: true,
      fixed_history_watermark_required: true,
      history_snapshot_manifest_reverification_required: true,
      same_count_history_replacement_blocks_candidate: true,
      in_place_history_mutation_blocks_candidate: true,
      concurrent_history_churn_blocks_candidate: true,
    },
  };
}

function governanceFromEvaluation(evaluation, repeatedOutcomeGatePassed) {
  const anti = object(evaluation.anti_overfitting);
  return {
    repeated_outcome_gate_passed: repeatedOutcomeGatePassed === true,
    stored_observation_integrity_revalidated: true,
    observation_integrity_envelope_required: true,
    observation_integrity_envelope_revalidated: true,
    observation_authenticity_contract:
      AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
    observation_authenticity_required: true,
    observation_authenticity_verified:
      anti.observation_authenticity_verified === true,
    server_only_observation_authenticity_key_required: true,
    database_stored_authenticity_secret_allowed: false,
    database_only_writer_cannot_reseal_without_server_key: true,
    observation_authenticity_key_rotation_supported: true,
    malformed_or_poisoned_observations_excluded: true,
    unique_observation_fingerprints_required: true,
    duplicate_observations_excluded: true,
    conflicting_observation_fingerprints_quarantined: true,
    row_order_cannot_resolve_observation_conflict: true,
    complete_history_scan_required: true,
    history_scan_complete: evaluation.history_scan_complete === true,
    incomplete_history_blocks_evidence_candidate: true,
    raw_rows_cannot_crowd_out_unique_observation_limit: true,
    fixed_history_watermark_required: true,
    history_snapshot_verified: evaluation.history_snapshot_verified === true,
    history_snapshot_manifest_reverification_required: true,
    same_count_history_replacement_blocks_candidate: true,
    in_place_history_mutation_blocks_candidate: true,
    concurrent_history_churn_blocks_candidate: true,
    causal_attribution_allowed: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

export async function ingestAvantiqoMissionOutcomeLearning({
  pattern,
  outcome_contract,
  outcome_assessment,
  observation_token,
  organization_id = null,
  database = null,
  now = new Date(),
  limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
} = {}) {
  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      observation_written: false,
      evidence_candidate_written: false,
    };
  }

  const prepared = buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract,
    outcome_assessment,
    observation_token,
    organization_id: organizationId,
    now,
  });
  if (!prepared.eligible) {
    return {
      ...prepared,
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
    };
  }

  const client = await resolveDatabase(database);
  const observationWrite = await client
    .from(MEMORY_TABLE)
    .upsert(prepared.row, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id,memory_key")
    .maybeSingle();
  if (observationWrite.error) throw observationWrite.error;

  const historyScan = await loadPatternObservations(
    client,
    organizationId,
    prepared.pattern_fingerprint,
    limits,
    { allow_legacy_injected_adapter: Boolean(database) },
  );
  const evaluation = applyHistoryScanGate(
    evaluateAvantiqoMissionOutcomePattern({
      observations: historyScan.rows,
      pattern_fingerprint: prepared.pattern_fingerprint,
      limits,
    }),
    historyScan,
  );

  if (!evaluation.eligible_for_evidence_candidate) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: evaluation.history_scan_complete
        ? "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED"
        : "VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE",
      observation_written: Boolean(observationWrite.data?.id),
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      pattern_evaluation: evaluation,
      next_stage_contract: null,
      governance: governanceFromEvaluation(evaluation, false),
    };
  }

  const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
    pattern,
    pattern_evaluation: evaluation,
    organization_id: organizationId,
    now,
  });
  if (!candidate) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: "FAILED_CLOSED_INVALID_EVIDENCE_CANDIDATE_EVALUATION",
      observation_written: Boolean(observationWrite.data?.id),
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      pattern_evaluation: evaluation,
      next_stage_contract: null,
      governance: {
        ...governanceFromEvaluation(evaluation, false),
        evaluation_summary_revalidated: true,
        caller_supplied_eligibility_not_trusted: true,
      },
    };
  }

  const candidateWrite = await client
    .from(MEMORY_TABLE)
    .upsert(candidate, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id,memory_key")
    .maybeSingle();
  if (candidateWrite.error) throw candidateWrite.error;

  return {
    success: true,
    contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    status: "MISSION_OUTCOME_EVIDENCE_CANDIDATE_INGESTED",
    observation_written: Boolean(observationWrite.data?.id),
    evidence_candidate_written: Boolean(candidateWrite.data?.id),
    reusable_platform_knowledge_written: false,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: candidate.memory_key,
    pattern_evaluation: evaluation,
    next_stage_contract: LEARNING_EVIDENCE_BRIDGE_CONTRACT,
    governance: {
      ...governanceFromEvaluation(evaluation, true),
      provider_free: true,
      model_call_performed: false,
      research_performed: false,
      gpu_execution_performed: false,
      modal_job_submitted: false,
      evaluation_summary_revalidated: true,
      caller_supplied_eligibility_not_trusted: true,
      observation_count_arithmetic_revalidated: true,
      dominant_outcome_and_ratio_revalidated: true,
      evidence_thresholds_revalidated: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      direct_platform_knowledge_write_allowed: false,
      customer_private_content_promoted: false,
      customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoMissionOutcomeLearningRuntime = Object.freeze({
  contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  observation_integrity_contract:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  observation_authenticity_contract:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  observation_authenticity_algorithm:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  limits: AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  buildObservation: buildAvantiqoMissionOutcomeLearningObservation,
  evaluatePattern: evaluateAvantiqoMissionOutcomePattern,
  buildEvidenceCandidate: buildAvantiqoMissionOutcomeEvidenceCandidateRow,
  computeObservationIntegrityFingerprint:
    computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  ingest: ingestAvantiqoMissionOutcomeLearning,
  certified_core: CoreRuntime,
});

export default AvantiqoMissionOutcomeLearningRuntime;

/*
Certified core invariants remain implemented in
AvantiqoMissionOutcomeLearningCoreRuntime.js and are deliberately retained here
as static compatibility markers for the pre-existing immutable guard while the
canonical entrypoint adds keyed authenticity before that core can be used.

EVIDENCE_CANDIDATE_NOT_RELEASED
causal_attribution_allowed: false
reusable_platform_knowledge: false
knowledge_router_reuse_allowed: false
automatic_knowledge_promotion: false
explicit_final_promotion_required: true
AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_V1
function computeAvantiqoMissionOutcomeObservationIntegrityFingerprint
function sealObservationIntegrity
observation_integrity_contract
observation_integrity_fingerprint
observation_integrity_envelope_required: true
observation_integrity_envelope_revalidated: true
min_observations: 3
min_distinct_observation_days: 2
min_dominant_outcome_ratio: 0.8
history_page_size: 250
max_history_pages: 64
max_raw_history_scan: 5000
history_snapshot_verification_passes: 2
const SHA256_RE
function positiveInteger
function nonNegativeInteger
function validObservationTime
function validDatabaseTimestamp
function observationStructuralSignature
function historySnapshotFingerprint
function uniqueEligibleObservationRows
const groups = new Map()
duplicate_observation_count
conflicting_observation_fingerprint_count
quarantined_conflicting_observation_count
unique_observation_fingerprints_required: true
duplicate_observations_excluded: true
conflicting_observation_fingerprints_quarantined: true
row_order_cannot_resolve_observation_conflict: true
function validEvidenceCandidateEvaluation
total !== successes + failures
reportedRatio !== expectedRatio
source.history_snapshot_verified !== true
source.history_snapshot_manifest_stable !== true
evaluation_summary_revalidated: true
caller_supplied_eligibility_not_trusted: true
observation_count_arithmetic_revalidated: true
dominant_outcome_and_ratio_revalidated: true
evidence_thresholds_revalidated: true
FAILED_CLOSED_INVALID_EVIDENCE_CANDIDATE_EVALUATION
function historyScanConfiguration
function patternObservationQuery
count: "exact"
query = query.lte("created_at", snapshotWatermark)
function scanPatternHistoryPass
SUPABASE_WATERMARK_TWO_PASS_RANGE_V1
HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES
function applyHistoryScanGate
complete_history_scan_required: true
incomplete_history_blocks_evidence_candidate: true
raw_rows_cannot_crowd_out_unique_observation_limit: true
history_count_must_remain_stable_during_scan: true
stable_row_identity_required_across_pages: true
fixed_history_watermark_required: true
history_snapshot_manifest_reverification_required: true
same_count_history_replacement_blocks_candidate: true
in_place_history_mutation_blocks_candidate: true
concurrent_history_churn_blocks_candidate: true
VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE
stored_observation_integrity_revalidated: true
malformed_or_poisoned_observations_excluded: true
excluded_observation_count
source_outcome_contract
source_outcome_assessment_contract
*/