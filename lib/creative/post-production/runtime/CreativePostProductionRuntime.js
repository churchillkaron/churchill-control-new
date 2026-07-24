import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

function sortByProductionOrder(a, b) {
  const scene = Number(a.scene_number || 0) - Number(b.scene_number || 0);
  if (scene !== 0) return scene;
  return Number(a.shot_number || 0) - Number(b.shot_number || 0);
}

function taskUrl(task = {}) {
  return (
    task.output?.video_url ||
    task.output?.url ||
    task.output?.asset?.url ||
    null
  );
}

function shotVideoTask(tasks = [], shotId) {
  return tasks.find((task) => (
    task.shot_id === shotId &&
    task.metadata?.deliverable === "VIDEO_SHOT" &&
    task.status === "COMPLETED"
  ));
}

function shotQaTask(tasks = [], shotId) {
  return tasks.find((task) => (
    task.shot_id === shotId &&
    task.metadata?.deliverable === "VIDEO_SHOT_QA" &&
    task.status === "COMPLETED"
  ));
}

function buildGraphics(shots = []) {
  return shots.flatMap((shot) => {
    const graphics = [];

    for (const subtitle of shot.subtitles || []) {
      graphics.push({
        type: "SUBTITLE",
        shot_id: shot.id,
        text: subtitle.text || subtitle.content || "",
        start_seconds: Number(subtitle.start_seconds || 0),
        end_seconds: Number(
          subtitle.end_seconds || shot.duration_seconds || 0,
        ),
        safe_area: "broadcast_and_vertical_safe",
        generated_in_post: true,
      });
    }

    for (const card of shot.metadata?.graphics || []) {
      graphics.push({
        ...card,
        shot_id: shot.id,
        generated_in_post: true,
      });
    }

    return graphics;
  });
}

function buildAudioPlan(shots = []) {
  const dialogue = [];
  const voiceover = [];
  const musicCues = [];
  const sfx = [];
  const ambience = [];

  for (const shot of shots) {
    for (const line of shot.dialogue || []) {
      dialogue.push({
        shot_id: shot.id,
        speaker: line.speaker || null,
        text: line.text || line.line || "",
        performance: line.performance || "natural and restrained",
        sync_required: line.sync_required !== false,
      });
    }

    if (shot.narration?.text) {
      voiceover.push({
        shot_id: shot.id,
        text: shot.narration.text,
        voice: shot.narration.voice || {},
        timing: shot.narration.timing || {},
      });
    }

    if (Object.keys(shot.music || {}).length) {
      musicCues.push({
        shot_id: shot.id,
        ...shot.music,
      });
    }

    for (const item of shot.sound_effects || []) {
      sfx.push({
        shot_id: shot.id,
        description:
          typeof item === "string" ? item : item.description || "",
        timing: typeof item === "object" ? item.timing || {} : {},
      });
    }

    ambience.push({
      shot_id: shot.id,
      location: shot.location || {},
      requirement: "Continuous believable room tone and environmental bed",
    });
  }

  return {
    stems: {
      dialogue,
      voiceover,
      music: musicCues,
      sfx,
      foley: sfx.filter((item) => /contact|step|cloth|glass|door|movement/i.test(item.description)),
      ambience,
    },
    mix_rules: {
      dialogue_priority: true,
      automatic_music_ducking: true,
      preserve_dynamic_range: true,
      avoid_overcompression: true,
      remove_clicks_pops_and_noise: true,
      maintain_room_tone_continuity: true,
      loudness_targets: {
        web_master_lufs: -14,
        broadcast_master_lufs: -23,
        true_peak_dbtp: -1,
      },
    },
  };
}

function buildExports(durationSeconds) {
  return [
    {
      id: "master_16_9",
      aspect_ratio: "16:9",
      resolution: "3840x2160",
      codec: "H.264 or platform-approved mezzanine",
      duration_seconds: durationSeconds,
      purpose: "MASTER",
    },
    {
      id: "social_9_16",
      aspect_ratio: "9:16",
      resolution: "1080x1920",
      codec: "H.264",
      duration_seconds: durationSeconds,
      purpose: "VERTICAL_SOCIAL",
    },
    {
      id: "social_1_1",
      aspect_ratio: "1:1",
      resolution: "1080x1080",
      codec: "H.264",
      duration_seconds: durationSeconds,
      purpose: "SQUARE_SOCIAL",
    },
  ];
}

export const CreativePostProductionRuntime = {
  async build({
    organization_id,
    creative_project_id,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const [scenes, shots, tasks] = await Promise.all([
      SceneRuntime.list({ organization_id, creative_project_id }),
      ShotRuntime.list({ organization_id, creative_project_id }),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);

    const orderedShots = [...shots].sort(sortByProductionOrder);
    let cursor = 0;
    const edit = [];
    const missing = [];

    for (const shot of orderedShots) {
      const videoTask = shotVideoTask(tasks, shot.id);
      const qaTask = shotQaTask(tasks, shot.id);
      const sourceUrl = taskUrl(videoTask);
      const duration = Number(shot.duration_seconds || 0);

      if (!videoTask || !sourceUrl) {
        missing.push({
          shot_id: shot.id,
          reason: "APPROVED_VIDEO_SHOT_MISSING",
        });
        continue;
      }

      edit.push({
        index: edit.length + 1,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        source_task_id: videoTask.id,
        source_url: sourceUrl,
        timeline_in_seconds: cursor,
        timeline_out_seconds: cursor + duration,
        source_in_seconds: 0,
        source_out_seconds: duration,
        duration_seconds: duration,
        transition_in: shot.metadata?.transition_in || { type: "CUT" },
        transition_out: shot.metadata?.transition_out || { type: "CUT" },
        camera: shot.camera || {},
        continuity: shot.metadata?.continuity || {},
        quality_review: qaTask?.output?.result || qaTask?.output || null,
      });

      cursor += duration;
    }

    const graphics = buildGraphics(orderedShots);
    const audio = buildAudioPlan(orderedShots);

    return {
      version: "creative-post-production-v1",
      organization_id,
      creative_project_id,
      status: missing.length ? "BLOCKED" : "READY_FOR_ASSEMBLY",
      editorial: {
        total_duration_seconds: cursor,
        scenes: [...scenes].sort(
          (a, b) => Number(a.scene_number || 0) - Number(b.scene_number || 0),
        ),
        edit_decision_list: edit,
        pacing_rules: [
          "Cut on story, emotion, action or sound rather than arbitrary duration.",
          "Protect reaction timing and humor payoff.",
          "Avoid transitions that call attention to themselves without narrative purpose.",
          "Regenerate or retrim only the failed shot, never the complete film.",
        ],
      },
      graphics: {
        overlays: graphics,
        rules: [
          "Important text, subtitles, logos and calls to action are composed in post.",
          "Never rely on generated in-frame typography for final delivery.",
          "Respect brand fonts, clear space, contrast and channel safe areas.",
        ],
      },
      audio,
      finishing: {
        color: {
          match_shots: true,
          protect_skin_tones: true,
          protect_brand_colors: true,
          remove_flicker: true,
          normalize_exposure_and_white_balance: true,
          grain_only_when_motivated: true,
        },
        picture: {
          stabilize_when_required: true,
          deflicker_when_required: true,
          remove_duplicate_or_corrupt_frames: true,
          upscale_only_after_picture_lock: true,
        },
      },
      final_quality_control: {
        minimum_score: 92,
        checks: [
          "all planned shots present",
          "all source URLs valid",
          "no unresolved or failed production tasks",
          "identity and product continuity",
          "logo and text accuracy",
          "picture continuity and pacing",
          "dialogue intelligibility",
          "music and effects balance",
          "loudness and true peak compliance",
          "color continuity",
          "master and channel variants present",
        ],
      },
      exports: buildExports(cursor),
      missing_requirements: missing,
    };
  },
};
