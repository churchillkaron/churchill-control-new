function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedCodec(value) {
  const codec = String(value || "").trim().toLowerCase();
  const aliases = {
    libx264: "h264",
    h264_nvenc: "h264",
    h264_videotoolbox: "h264",
    libx265: "hevc",
    hevc_nvenc: "hevc",
    hevc_videotoolbox: "hevc",
    libvpx: "vp8",
    "libvpx-vp9": "vp9",
    prores_ks: "prores",
    prores_aw: "prores",
    libaom_av1: "av1",
    libsvtav1: "av1",
    aac_at: "aac",
    libfdk_aac: "aac",
    libmp3lame: "mp3",
    libopus: "opus",
  };

  return aliases[codec] || codec || null;
}

function check(id, expected, actual, passed, evidence = {}) {
  return {
    id,
    expected,
    actual,
    passed: Boolean(passed),
    evidence,
  };
}

function hasAudio(technical = {}) {
  if (technical.audio_codec) return true;
  return (Array.isArray(technical.streams) ? technical.streams : [])
    .some((stream) => stream.codec_type === "audio");
}

function profileRequiresAudio(profile = {}, audioExpected = false) {
  return Boolean(
    audioExpected ||
    profile.audio_required === true ||
    profile.audioRequired === true ||
    profile.require_audio === true ||
    profile.requireAudio === true ||
    profile.primary_audio_asset_id ||
    profile.primaryAudioAssetId ||
    profile.audio === "preserve the supplied primary soundtrack exactly",
  );
}

export const CreativeRenderTechnicalQualityRuntime = {
  evaluate({
    technical = {},
    profile = {},
    expected_duration_seconds = null,
    audio_expected = false,
  } = {}) {
    const checks = [];
    const fileSize = finite(technical.file_size_bytes);
    const duration = finite(technical.duration_seconds);
    const expectedDuration = finite(expected_duration_seconds);
    const tolerance = finite(
      profile.duration_tolerance_seconds ??
      profile.durationToleranceSeconds,
    );
    const width = finite(technical.width);
    const height = finite(technical.height);
    const expectedWidth = finite(profile.width);
    const expectedHeight = finite(profile.height);
    const actualVideoCodec = normalizedCodec(technical.video_codec);
    const expectedVideoCodec = normalizedCodec(
      profile.expected_video_codec ??
      profile.expectedVideoCodec ??
      profile.video_codec ??
      profile.videoCodec,
    );
    const actualAudioCodec = normalizedCodec(technical.audio_codec);
    const expectedAudioCodec = normalizedCodec(
      profile.expected_audio_codec ??
      profile.expectedAudioCodec ??
      profile.audio_codec ??
      profile.audioCodec,
    );
    const audioRequired = profileRequiresAudio(profile, audio_expected);

    checks.push(check(
      "file_non_empty",
      "positive byte size",
      fileSize,
      fileSize !== null && fileSize > 0,
    ));
    checks.push(check(
      "video_stream_present",
      "video",
      technical.media_kind || actualVideoCodec,
      technical.media_kind === "video" || Boolean(actualVideoCodec),
    ));
    checks.push(check(
      "duration_present",
      "positive duration",
      duration,
      duration !== null && duration > 0,
    ));

    if (expectedDuration !== null && tolerance !== null) {
      checks.push(check(
        "duration_within_tolerance",
        {
          duration_seconds: expectedDuration,
          tolerance_seconds: tolerance,
        },
        duration,
        duration !== null && Math.abs(duration - expectedDuration) <= tolerance,
        {
          difference_seconds:
            duration === null ? null : Math.abs(duration - expectedDuration),
        },
      ));
    }

    if (expectedWidth !== null || expectedHeight !== null) {
      checks.push(check(
        "dimensions_match_profile",
        {
          width: expectedWidth,
          height: expectedHeight,
        },
        { width, height },
        width === expectedWidth && height === expectedHeight,
      ));
    }

    if (expectedVideoCodec) {
      checks.push(check(
        "video_codec_matches_profile",
        expectedVideoCodec,
        actualVideoCodec,
        actualVideoCodec === expectedVideoCodec,
      ));
    }

    if (audioRequired) {
      checks.push(check(
        "audio_stream_present",
        true,
        hasAudio(technical),
        hasAudio(technical),
        {
          required_by_profile: true,
          primary_audio_asset_id:
            profile.primary_audio_asset_id ||
            profile.primaryAudioAssetId ||
            null,
        },
      ));

      if (expectedAudioCodec) {
        checks.push(check(
          "audio_codec_matches_profile",
          expectedAudioCodec,
          actualAudioCodec,
          actualAudioCodec === expectedAudioCodec,
        ));
      }
    }

    return {
      passed: checks.every((item) => item.passed),
      checks,
      failed_checks: checks.filter((item) => !item.passed).map((item) => item.id),
      evaluated_at: new Date().toISOString(),
      audio_required: audioRequired,
    };
  },
};
