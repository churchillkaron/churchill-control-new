function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function number(value, fallback = null) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function temporalError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeKeyframe(value = {}, index = 0) {
  const source = object(value);
  const atMs = number(
    source.at_ms ??
    source.time_ms ??
    source.timestamp_ms,
    null,
  );

  return {
    ...source,
    keyframe_number: index + 1,
    at_ms: atMs,
    state: source.state ?? source.value ?? null,
    interpolation:
      source.interpolation ||
      source.curve ||
      null,
    motivation:
      source.motivation ||
      source.reason ||
      null,
  };
}

function normalizeTrack(value = {}, index = 0) {
  const source = object(value);
  const keyframes = list(source.keyframes)
    .map(normalizeKeyframe)
    .sort((left, right) =>
      Number(left.at_ms || 0) - Number(right.at_ms || 0),
    );

  return {
    ...source,
    track_number: index + 1,
    id:
      source.id ||
      source.track_id ||
      `track_${index + 1}`,
    owner:
      source.owner ||
      source.department ||
      null,
    subject:
      source.subject ||
      source.target ||
      null,
    property:
      source.property ||
      source.dimension ||
      null,
    initial_state:
      source.initial_state ??
      keyframes[0]?.state ??
      null,
    final_state:
      source.final_state ??
      keyframes.at(-1)?.state ??
      null,
    keyframes,
    physical_rules: list(source.physical_rules),
    immutable_rules: list(source.immutable_rules),
    acceptance_criteria: list(source.acceptance_criteria),
  };
}

function normalizeEvent(value = {}, index = 0) {
  const source = object(value);

  return {
    ...source,
    event_number: index + 1,
    id:
      source.id ||
      source.event_id ||
      `event_${index + 1}`,
    start_ms: number(source.start_ms, null),
    end_ms: number(source.end_ms, null),
    owner:
      source.owner ||
      source.department ||
      null,
    action:
      source.action ||
      source.description ||
      null,
    motivation:
      source.motivation ||
      source.reason ||
      null,
    entering_state: source.entering_state ?? null,
    leaving_state: source.leaving_state ?? null,
    acceptance_criteria: list(source.acceptance_criteria),
  };
}

function normalizeDepartment(value = {}) {
  const source = object(value);

  return {
    tracks: list(source.tracks).map(normalizeTrack),
    events: list(source.events).map(normalizeEvent),
    immutable_locks: list(source.immutable_locks),
    directed_evolution: list(source.directed_evolution),
    failure_conditions: list(source.failure_conditions),
  };
}

function normalizeMasterStill(value = {}, shot = {}) {
  const source = object(value);

  return {
    role: "MOTION_ORIGIN_FRAME",
    frame_time_ms: 0,
    frame_number: 0,
    source_shot_title: shot.title || null,
    exact_camera_state: object(source.exact_camera_state),
    exact_subject_state: list(source.exact_subject_state),
    exact_object_state: list(source.exact_object_state),
    exact_location_state: object(source.exact_location_state),
    exact_lighting_state: object(source.exact_lighting_state),
    exact_environment_state: object(source.exact_environment_state),
    exact_focus_state: object(source.exact_focus_state),
    exact_exposure_state: object(source.exact_exposure_state),
    safe_motion_space: list(source.safe_motion_space),
    immutable_locks: list(source.immutable_locks),
    permitted_motion: list(source.permitted_motion),
    prohibited_changes: list(source.prohibited_changes),
    reference_asset_ids: list(
      source.reference_asset_ids ||
      shot.reference_asset_ids,
    ).map(String),
    approval_requirements: list(source.approval_requirements),
  };
}

export function normalizeCreativeShotTemporalContract({
  shot,
  fps = 30,
} = {}) {
  const source = object(shot);
  const temporal = object(source.temporal_contract);
  const durationSeconds = number(source.duration_seconds, 0);
  const durationMs = Math.round(durationSeconds * 1000);
  const resolvedFps = Math.max(1, Math.round(number(temporal.fps, fps)));
  const totalFrames = Math.round(durationSeconds * resolvedFps);

  return {
    version: "frame-governing-shot-temporal-contract-v1",
    duration_ms: durationMs,
    fps: resolvedFps,
    total_frames: totalFrames,
    timebase: `${resolvedFps}fps`,
    master_still: normalizeMasterStill(
      source.master_still_contract || temporal.master_still,
      source,
    ),
    camera: normalizeDepartment(temporal.camera),
    performance: normalizeDepartment(temporal.performance),
    objects_products: normalizeDepartment(
      temporal.objects_products || temporal.objects,
    ),
    lighting: normalizeDepartment(temporal.lighting),
    environment: normalizeDepartment(temporal.environment),
    focus_exposure: normalizeDepartment(
      temporal.focus_exposure,
    ),
    sound: normalizeDepartment(temporal.sound),
    editorial: normalizeDepartment(temporal.editorial),
    continuity: {
      entering_state:
        temporal.continuity?.entering_state ??
        source.continuity?.entering ??
        null,
      leaving_state:
        temporal.continuity?.leaving_state ??
        source.continuity?.leaving ??
        null,
      locks: list(
        temporal.continuity?.locks ||
        source.continuity?.locks,
      ),
      handoff_requirements: list(
        temporal.continuity?.handoff_requirements,
      ),
    },
    immutable_locks: list(temporal.immutable_locks),
    directed_evolution: list(temporal.directed_evolution),
    quality_requirements: object(
      temporal.quality_requirements ||
      source.quality_requirements,
    ),
    metadata: {
      ...(object(temporal.metadata)),
      every_frame_inherits_contract: true,
      master_still_is_frame_zero: true,
      unspecified_motion_is_forbidden: true,
    },
  };
}

function keyframeFailures({
  department,
  track,
  durationMs,
  label,
}) {
  const failures = [];
  const trackLabel = `${label} ${department} track ${track.track_number}`;

  if (!text(track.owner)) {
    failures.push(`${trackLabel}: owner missing`);
  }
  if (!text(track.subject)) {
    failures.push(`${trackLabel}: subject missing`);
  }
  if (!text(track.property)) {
    failures.push(`${trackLabel}: property missing`);
  }
  if (!track.keyframes.length) {
    failures.push(`${trackLabel}: keyframes missing`);
    return failures;
  }

  let previous = -1;
  for (const keyframe of track.keyframes) {
    if (!Number.isFinite(Number(keyframe.at_ms))) {
      failures.push(`${trackLabel}: keyframe time missing`);
      continue;
    }
    if (keyframe.at_ms < 0 || keyframe.at_ms > durationMs) {
      failures.push(`${trackLabel}: keyframe ${keyframe.at_ms}ms outside shot duration`);
    }
    if (keyframe.at_ms < previous) {
      failures.push(`${trackLabel}: keyframes not chronological`);
    }
    if (keyframe.state === null || keyframe.state === undefined) {
      failures.push(`${trackLabel}: keyframe state missing at ${keyframe.at_ms}ms`);
    }
    if (!text(keyframe.motivation)) {
      failures.push(`${trackLabel}: keyframe motivation missing at ${keyframe.at_ms}ms`);
    }
    previous = keyframe.at_ms;
  }

  if (!track.acceptance_criteria.length) {
    failures.push(`${trackLabel}: acceptance criteria missing`);
  }

  return failures;
}

function eventFailures({
  department,
  event,
  durationMs,
  label,
}) {
  const failures = [];
  const eventLabel = `${label} ${department} event ${event.event_number}`;

  if (!Number.isFinite(Number(event.start_ms))) {
    failures.push(`${eventLabel}: start time missing`);
  }
  if (!Number.isFinite(Number(event.end_ms))) {
    failures.push(`${eventLabel}: end time missing`);
  }
  if (
    Number.isFinite(Number(event.start_ms)) &&
    Number.isFinite(Number(event.end_ms)) &&
    event.end_ms < event.start_ms
  ) {
    failures.push(`${eventLabel}: end precedes start`);
  }
  if (event.start_ms < 0 || event.end_ms > durationMs) {
    failures.push(`${eventLabel}: timing outside shot duration`);
  }
  if (!text(event.owner)) failures.push(`${eventLabel}: owner missing`);
  if (!text(event.action)) failures.push(`${eventLabel}: action missing`);
  if (!text(event.motivation)) failures.push(`${eventLabel}: motivation missing`);
  if (!event.acceptance_criteria.length) {
    failures.push(`${eventLabel}: acceptance criteria missing`);
  }

  return failures;
}

function departmentFailures({
  name,
  department,
  durationMs,
  label,
  required = true,
}) {
  const failures = [];
  const tracks = list(department.tracks);
  const events = list(department.events);

  if (required && !tracks.length && !events.length) {
    failures.push(`${label}: ${name} temporal direction missing`);
    return failures;
  }

  for (const track of tracks) {
    failures.push(...keyframeFailures({
      department: name,
      track,
      durationMs,
      label,
    }));
  }
  for (const event of events) {
    failures.push(...eventFailures({
      department: name,
      event,
      durationMs,
      label,
    }));
  }

  return failures;
}

export function inspectCreativeShotTemporalContract({
  shot,
  fps = 30,
  label = "shot",
} = {}) {
  const contract = normalizeCreativeShotTemporalContract({
    shot,
    fps,
  });
  const failures = [];
  const warnings = [];

  if (contract.duration_ms <= 0) {
    failures.push(`${label}: positive duration required`);
  }
  if (contract.total_frames <= 0) {
    failures.push(`${label}: positive frame count required`);
  }

  const master = contract.master_still;
  const requiredMasterSections = [
    "exact_camera_state",
    "exact_location_state",
    "exact_lighting_state",
    "exact_environment_state",
    "exact_focus_state",
    "exact_exposure_state",
  ];
  for (const key of requiredMasterSections) {
    if (!Object.keys(object(master[key])).length) {
      failures.push(`${label}: master still ${key} missing`);
    }
  }
  if (!master.immutable_locks.length) {
    failures.push(`${label}: master still immutable locks missing`);
  }
  if (!master.permitted_motion.length) {
    failures.push(`${label}: master still permitted motion missing`);
  }
  if (!master.prohibited_changes.length) {
    failures.push(`${label}: master still prohibited changes missing`);
  }
  if (!master.approval_requirements.length) {
    failures.push(`${label}: master still approval requirements missing`);
  }

  const departments = [
    ["camera", contract.camera, true],
    ["performance", contract.performance, true],
    ["objects_products", contract.objects_products, true],
    ["lighting", contract.lighting, true],
    ["environment", contract.environment, true],
    ["focus_exposure", contract.focus_exposure, true],
    ["sound", contract.sound, true],
    ["editorial", contract.editorial, true],
  ];

  for (const [name, department, required] of departments) {
    failures.push(...departmentFailures({
      name,
      department,
      durationMs: contract.duration_ms,
      label,
      required,
    }));
  }

  if (!contract.continuity.entering_state) {
    failures.push(`${label}: temporal entering continuity missing`);
  }
  if (!contract.continuity.leaving_state) {
    failures.push(`${label}: temporal leaving continuity missing`);
  }
  if (!contract.continuity.locks.length) {
    failures.push(`${label}: temporal continuity locks missing`);
  }
  if (!contract.immutable_locks.length) {
    failures.push(`${label}: global temporal immutable locks missing`);
  }
  if (!contract.directed_evolution.length) {
    failures.push(`${label}: directed evolution rules missing`);
  }
  if (!Object.keys(contract.quality_requirements).length) {
    failures.push(`${label}: temporal quality requirements missing`);
  }

  const timedItems = departments.reduce(
    (total, [, department]) =>
      total +
      department.tracks.reduce(
        (sum, track) => sum + track.keyframes.length,
        0,
      ) +
      department.events.length,
    0,
  );

  if (timedItems < Math.max(4, Math.ceil(contract.duration_ms / 1000))) {
    warnings.push(
      `${label}: low temporal event density for ${contract.duration_ms}ms`,
    );
  }

  return {
    contract,
    report: {
      passed: failures.length === 0,
      version: contract.version,
      duration_ms: contract.duration_ms,
      fps: contract.fps,
      total_frames: contract.total_frames,
      timed_item_count: timedItems,
      master_still_is_frame_zero: true,
      every_frame_inherits_contract: true,
      failures,
      warnings,
    },
  };
}

export function enforceCreativeShotTemporalContract(input = {}) {
  const result = inspectCreativeShotTemporalContract(input);

  if (!result.report.passed) {
    throw temporalError(
      "CREATIVE_SHOT_TEMPORAL_CONTRACT_REJECTED",
      result.report,
    );
  }

  return result;
}

export function applyCreativeTemporalContractsToPlan({
  creativePlan,
  fps = 30,
} = {}) {
  const output = clone(creativePlan) || {};
  const reports = [];

  output.scenes = list(output.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => {
      const result = enforceCreativeShotTemporalContract({
        shot,
        fps,
        label: `scene ${sceneIndex + 1} shot ${shotIndex + 1}`,
      });
      reports.push(result.report);

      return {
        ...shot,
        temporal_contract: result.contract,
        master_still_contract: result.contract.master_still,
      };
    }),
  }));

  return {
    creativePlan: output,
    report: {
      passed: reports.every((report) => report.passed),
      shot_count: reports.length,
      total_frames: reports.reduce(
        (total, report) => total + Number(report.total_frames || 0),
        0,
      ),
      reports,
    },
  };
}
