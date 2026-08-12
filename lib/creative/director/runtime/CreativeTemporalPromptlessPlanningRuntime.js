import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-promptless-planning.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative extraction.
    }
  }
  return null;
}

function stripPromptFields(value) {
  if (Array.isArray(value)) return value.map(stripPromptFields);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const normalized = key.toLowerCase();
        return normalized !== "prompt" && !normalized.endsWith("_prompt");
      })
      .map(([key, nested]) => [key, stripPromptFields(nested)]),
  );
}

function masterOutputSpecFromPrompt(prompt) {
  const match = text(prompt).match(/MASTER OUTPUT SPEC:\s*(\{[^\n]*\})/i);
  if (!match?.[1]) return {};
  try {
    return object(JSON.parse(match[1]));
  } catch {
    return {};
  }
}

function promptlessInputPrompt(prompt) {
  let governed = text(prompt);

  governed = governed
    .replace(/^\s*"provider_prompt"\s*:\s*"[^"\n]*"\s*,?\s*$/gim, "")
    .replace(/^\s*"negative_prompt"\s*:\s*"[^"\n]*"\s*,?\s*$/gim, "")
    .replace(
      /"output_spec"\s*:\s*\{\}/gi,
      `"output_spec": {
      "duration_seconds": "exactly match this shot duration_seconds",
      "aspect_ratio": "copy MASTER OUTPUT SPEC aspect_ratio",
      "resolution": "copy MASTER OUTPUT SPEC resolution",
      "frame_rate": "copy MASTER OUTPUT SPEC frame_rate",
      "audio": "copy MASTER OUTPUT SPEC audio"
    }`,
    )
    .replace(
      /^\s*- Provider prompts must be complete enough to execute without interpretation\.\s*$/gim,
      "- Persist structured creative direction only. Provider instructions are serialized later at the execution transport boundary.",
    );

  return `${governed}

PROMPTLESS PERSISTENCE CONTRACT
- Do not emit prompt, provider_prompt, negative_prompt, visual_prompt, video_prompt, image_prompt, or any other *_prompt field anywhere in the JSON.
- Persist structured direction only: frame plan, camera, lighting, production design, continuity, audio, VFX, source bindings, negative constraints, failure modes, repair instructions, and output specification.
- generation.required must be true and generation.service/capability must both be ai.video.generate.
- generation.output_spec must contain the exact shot duration plus concrete aspect_ratio, resolution, frame_rate and audio values from MASTER OUTPUT SPEC.
- Do not invent missing technical output values. If MASTER OUTPUT SPEC is incomplete, return the missing field explicitly as unresolved so validation fails closed before production.
- Never use N/A, none, not applicable, TBD or unspecified for a required direction field. Resolve it from verified context or let validation reject the incomplete direction.
`;
}

function requiredOutputSpec(shot = {}, masterOutputSpec = {}) {
  const generation = object(shot.generation);
  const existing = object(generation.output_spec);
  const duration =
    finite(shot.duration_seconds) ??
    finite(existing.duration_seconds) ??
    finite(masterOutputSpec.duration_seconds);
  const aspectRatio =
    text(masterOutputSpec.aspect_ratio) || text(existing.aspect_ratio);
  const resolution =
    text(masterOutputSpec.resolution) || text(existing.resolution);
  const frameRate =
    finite(masterOutputSpec.frame_rate) ?? finite(existing.frame_rate);
  const audio = text(masterOutputSpec.audio) || text(existing.audio);

  const missing = [];
  if (duration === null || duration <= 0) missing.push("duration_seconds");
  if (!aspectRatio) missing.push("aspect_ratio");
  if (!resolution) missing.push("resolution");
  if (frameRate === null || frameRate <= 0) missing.push("frame_rate");
  if (!audio) missing.push("audio");
  if (missing.length) {
    throw new Error(
      `TEMPORAL_OUTPUT_SPEC_INCOMPLETE:${missing.join(",")}`,
    );
  }

  return {
    ...existing,
    media_type: "VIDEO",
    duration_seconds: duration,
    aspect_ratio: aspectRatio,
    resolution,
    frame_rate: frameRate,
    audio,
  };
}

function normalizeShot(shot = {}, masterOutputSpec = {}) {
  const clean = stripPromptFields(shot);
  const generation = object(clean.generation);

  return {
    ...clean,
    generation: {
      ...stripPromptFields(generation),
      required: true,
      service: "ai.video.generate",
      capability: "ai.video.generate",
      output_spec: requiredOutputSpec(clean, masterOutputSpec),
    },
  };
}

function rewriteResult(result, masterOutputSpec) {
  const nestedOutput = object(result?.output?.output);
  const directOutput = object(result?.output);
  const output = Object.keys(nestedOutput).length ? nestedOutput : directOutput;
  const parsed = parseJson(output.text || output.content || output);
  if (!parsed || !list(parsed.shots).length) return result;

  const normalized = {
    ...stripPromptFields(parsed),
    shots: list(parsed.shots).map((shot) => normalizeShot(shot, masterOutputSpec)),
  };
  const normalizedText = JSON.stringify(normalized);

  if (Object.keys(nestedOutput).length) {
    return {
      ...result,
      output: {
        ...directOutput,
        output: {
          ...nestedOutput,
          ...normalized,
          text: normalizedText,
        },
      },
    };
  }

  if (Object.keys(directOutput).length) {
    return {
      ...result,
      output: {
        ...directOutput,
        ...normalized,
        text: normalizedText,
      },
    };
  }

  return {
    ...result,
    output: {
      ...normalized,
      text: normalizedText,
    },
  };
}

function governedInput(input = {}) {
  if (
    String(input.category || "").toUpperCase() !== "CREATIVE_DIRECTION" ||
    input.service_id !== "ai.reasoning.execute" ||
    String(input.metadata?.operation || "").toUpperCase() !==
      "TEMPORAL_SCENE_SHOT_DIRECTION_V1"
  ) {
    return input;
  }

  return {
    ...input,
    input: {
      ...(input.input || {}),
      prompt: promptlessInputPrompt(input.input?.prompt),
    },
    metadata: {
      ...(input.metadata || {}),
      temporal_promptless_contract: {
        contract: "TEMPORAL_PROMPTLESS_DIRECTION_V1",
        persistence: "STRUCTURED_ONLY",
        provider_prompt_boundary: "EXECUTION_TRANSPORT_ONLY",
        implicit_format_defaults_allowed: false,
        implicit_creative_direction_defaults_allowed: false,
      },
    },
  };
}

export function installCreativeTemporalPromptlessPlanningRuntime() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutPromptlessPlanning = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithPromptlessPlanning(input = {}) {
    const governed = governedInput(input);
    const masterOutputSpec = masterOutputSpecFromPrompt(governed.input?.prompt);
    const result = await executeWithoutPromptlessPlanning(governed);

    if (
      String(governed.metadata?.operation || "").toUpperCase() !==
      "TEMPORAL_SCENE_SHOT_DIRECTION_V1"
    ) {
      return result;
    }

    return rewriteResult(result, masterOutputSpec);
  };
}

installCreativeTemporalPromptlessPlanningRuntime();

export const CreativeTemporalPromptlessPlanningRuntime = {
  installed: true,
  governedInput,
  normalizeShot,
  requiredOutputSpec,
};
