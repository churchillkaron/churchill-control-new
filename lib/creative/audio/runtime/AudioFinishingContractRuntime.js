function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback = null) {
  const number = finite(value, fallback);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parseStructuredText(value) {
  const cleaned = text(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function unwrapAudioOutput(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || current.json || null;
    if (!next || next === current) break;
    current = next;
  }
  if (typeof current === "string") {
    return parseStructuredText(current) || { text: current };
  }
  const directText = current?.text || current?.content || current?.message;
  if (typeof directText === "string") {
    return parseStructuredText(directText) || current;
  }
  return current || {};
}

export function audioOutputUrl(value = {}) {
  const source = unwrapAudioOutput(value);
  const candidates = [
    source.audio_url,
    source.audioUrl,
    source.file_url,
    source.fileUrl,
    source.url,
    source.download_url,
    source.downloadUrl,
    source.master_url,
    source.masterUrl,
    source.files?.find?.((file) => String(file?.mime_type || file?.mimeType || "").startsWith("audio/"))?.url,
    source.files?.[0]?.url,
  ];
  return candidates.map(text).find(Boolean) || null;
}

export function audioOutputBase64(value = {}) {
  const source = unwrapAudioOutput(value);
  return text(
    source.audio_base64 ||
    source.audioBase64 ||
    source.base64 ||
    source.b64_json ||
    source.b64Json,
  ) || null;
}

function workflow(task = {}) {
  return text(task.metadata?.workflow_kind).toUpperCase();
}

function step(task = {}) {
  return text(task.metadata?.production_step_id).toLowerCase();
}

function completedAudioSources(task, tasks) {
  const dependencyIds = new Set(list(task.depends_on));
  const explicitIds = new Set(list(
    task.input?.source_task_ids ||
    task.input?.sourceTaskIds ||
    task.metadata?.source_task_ids ||
    task.metadata?.sourceTaskIds,
  ).map(String));
  let sources = tasks.filter((candidate) =>
    candidate.status === "COMPLETED" &&
    workflow(candidate) === "AUDIO" &&
    (dependencyIds.has(candidate.id) || explicitIds.has(candidate.id)),
  );
  if (!sources.length) {
    sources = tasks.filter((candidate) =>
      candidate.status === "COMPLETED" &&
      workflow(candidate) === "AUDIO" &&
      ["produce", "generate", "voice", "music", "sfx", "record"].includes(step(candidate)),
    );
  }
  return sources.filter((candidate) => audioOutputUrl(candidate.output) || audioOutputBase64(candidate.output));
}

function normalizeTrack(entry, index, sourceTasks) {
  const item = typeof entry === "string" ? { source_task_id: entry } : object(entry);
  const requestedId = text(item.source_task_id || item.sourceTaskId || item.task_id || item.taskId);
  const requestedRole = text(item.role || item.type).toLowerCase();
  const sourceTask = sourceTasks.find((candidate) => candidate.id === requestedId) ||
    sourceTasks.find((candidate) => requestedRole && text(candidate.metadata?.audio_role).toLowerCase() === requestedRole) ||
    sourceTasks[index] ||
    null;
  const source = sourceTask ? unwrapAudioOutput(sourceTask.output) : item;
  const url = audioOutputUrl(source);
  const base64 = audioOutputBase64(source);
  if (!url && !base64) {
    throw new Error(`CREATIVE_AUDIO_TRACK_SOURCE_REQUIRED:${index + 1}`);
  }
  const duration = finite(item.duration_seconds ?? item.durationSeconds ?? item.duration, null);
  const start = Math.max(0, finite(item.start_seconds ?? item.startSeconds ?? item.start, 0));
  const trimStart = Math.max(0, finite(item.trim_start_seconds ?? item.trimStartSeconds ?? item.trim_start, 0));
  return {
    id: text(item.id || item.track_id || item.trackId || sourceTask?.id || `track-${index + 1}`),
    source_task_id: sourceTask?.id || requestedId || null,
    role: requestedRole || text(sourceTask?.metadata?.audio_role || "program").toLowerCase(),
    label: text(item.label || item.title || sourceTask?.title || `Track ${index + 1}`),
    url,
    base64,
    mime_type: text(item.mime_type || item.mimeType || source.mime_type || source.mimeType),
    file_name: text(item.file_name || item.fileName || source.file_name || source.fileName),
    start_seconds: start,
    trim_start_seconds: trimStart,
    duration_seconds: duration !== null && duration > 0 ? duration : null,
    gain_db: finite(item.gain_db ?? item.gainDb ?? item.gain, 0),
    fade_in_seconds: Math.max(0, finite(item.fade_in_seconds ?? item.fadeInSeconds ?? item.fade_in, 0)),
    fade_out_seconds: Math.max(0, finite(item.fade_out_seconds ?? item.fadeOutSeconds ?? item.fade_out, 0)),
    metadata: object(item.metadata),
  };
}

function normalizeDeliveries(spec = {}) {
  const raw = list(spec.deliveries || spec.exports || spec.formats);
  const supported = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus"]);
  return raw.map((entry, index) => {
    const item = typeof entry === "string" ? { format: entry } : object(entry);
    let format = text(item.format || item.type || item.extension).toLowerCase().replace(/^\./, "");
    if (format === "aac") format = "m4a";
    if (!supported.has(format)) {
      throw new Error(`CREATIVE_AUDIO_DELIVERY_FORMAT_UNSUPPORTED:${format || index + 1}`);
    }
    const defaultName = `delivery-${index + 1}.${format}`;
    return {
      id: text(item.id || `delivery-${index + 1}`),
      format,
      file_name: text(item.file_name || item.fileName || item.name || defaultName),
      bitrate: text(item.bitrate || item.bit_rate || item.bitRate),
      sample_rate: positiveInteger(item.sample_rate ?? item.sampleRate, null),
      channels: positiveInteger(item.channels, null),
      codec: text(item.codec),
      metadata: object(item.metadata),
    };
  });
}

function outputSpec(task = {}) {
  return {
    ...object(task.input?.requirements?.output_spec),
    ...object(task.input?.output_spec),
    ...object(task.metadata?.requirements?.output_spec),
    ...object(task.metadata?.output_spec),
  };
}

function directionOutput(tasks = []) {
  const direction = tasks
    .filter((task) => task.status === "COMPLETED" && workflow(task) === "AUDIO" && step(task) === "direction")
    .sort((left, right) => Number(right.metadata?.production_step_index || 0) - Number(left.metadata?.production_step_index || 0))[0];
  return direction ? unwrapAudioOutput(direction.output) : {};
}

export function resolveAudioFinishingContract(task = {}, tasks = []) {
  const spec = outputSpec(task);
  const direction = directionOutput(tasks);
  const sourceTasks = completedAudioSources(task, tasks);
  if (!sourceTasks.length) throw new Error("CREATIVE_AUDIO_SOURCE_TASKS_REQUIRED");
  const trackPlan = list(
    spec.tracks ||
    spec.stems ||
    spec.timeline?.tracks ||
    direction.tracks ||
    direction.stems ||
    direction.timeline?.tracks,
  );
  const tracks = (trackPlan.length ? trackPlan : sourceTasks.map((source) => ({ source_task_id: source.id })))
    .map((entry, index) => normalizeTrack(entry, index, sourceTasks));
  const loudness = object(spec.loudness || direction.loudness || direction.mastering?.loudness);
  const targetLufs = finite(
    loudness.target_lufs ??
    loudness.targetLufs ??
    spec.target_lufs ??
    spec.targetLufs ??
    process.env.CREATIVE_AUDIO_DEFAULT_TARGET_LUFS,
    null,
  );
  const truePeak = finite(
    loudness.true_peak_dbtp ??
    loudness.truePeakDbtp ??
    spec.true_peak_dbtp ??
    spec.truePeakDbtp ??
    process.env.CREATIVE_AUDIO_DEFAULT_TRUE_PEAK_DBTP,
    null,
  );
  if (targetLufs === null) throw new Error("CREATIVE_AUDIO_TARGET_LUFS_REQUIRED");
  if (truePeak === null) throw new Error("CREATIVE_AUDIO_TRUE_PEAK_DBTP_REQUIRED");
  const type = text(task.metadata?.deliverable_type).toUpperCase();
  const transcriptionRequired =
    spec.transcription_required === true ||
    spec.transcriptionRequired === true ||
    ["VOICE", "PODCAST", "SPEECH", "VOICEOVER", "VOICE_OVER"].includes(type) ||
    tracks.some((track) => ["voice", "speech", "dialogue", "dialog", "voiceover", "voice_over"].includes(track.role));
  return {
    title: text(spec.title || direction.title || task.title || "Audio master"),
    tracks,
    master: {
      target_lufs: targetLufs,
      true_peak_dbtp: truePeak,
      loudness_range_lu: finite(
        loudness.range_lu ??
        loudness.lra ??
        process.env.CREATIVE_AUDIO_DEFAULT_LOUDNESS_RANGE_LU,
        11,
      ),
      sample_rate: positiveInteger(
        spec.sample_rate ?? spec.sampleRate ?? process.env.CREATIVE_AUDIO_DEFAULT_SAMPLE_RATE,
        48000,
      ),
      channels: Math.min(2, Math.max(1, positiveInteger(
        spec.channels ?? process.env.CREATIVE_AUDIO_DEFAULT_CHANNELS,
        2,
      ))),
      tolerance_lu: Math.max(0.1, finite(
        loudness.tolerance_lu ?? loudness.tolerance ?? process.env.CREATIVE_AUDIO_LOUDNESS_TOLERANCE_LU,
        0.5,
      )),
      true_peak_tolerance_db: Math.max(0, finite(
        loudness.true_peak_tolerance_db ?? process.env.CREATIVE_AUDIO_TRUE_PEAK_TOLERANCE_DB,
        0.1,
      )),
    },
    deliveries: normalizeDeliveries(spec),
    waveform: {
      width: positiveInteger(spec.waveform?.width, 1600),
      height: positiveInteger(spec.waveform?.height, 400),
    },
    transcription: {
      required: transcriptionRequired,
      language: text(spec.transcription_language || spec.transcriptionLanguage || direction.language),
      model: text(spec.transcription_model || spec.transcriptionModel),
    },
    media_policy: object(task.input?.media_policy || task.input?.mediaPolicy || task.metadata?.media_policy),
    output_spec: spec,
  };
}

export function audioQualityPass(value = {}) {
  const evidence = unwrapAudioOutput(value);
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
  const verdict = text(evidence.verdict || evidence.status || evidence.result || evidence.decision).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function audioQualityFailures(value = {}) {
  const evidence = unwrapAudioOutput(value);
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((item) => typeof item === "string" ? item : item?.message || item?.issue),
  ].filter(Boolean).map(String);
}

export const AudioFinishingContractRuntime = {
  resolve: resolveAudioFinishingContract,
  unwrap: unwrapAudioOutput,
};
