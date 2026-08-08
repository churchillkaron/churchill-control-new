import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-promptless-planning.v1",
);

const PLACEHOLDER = /^(?:n\/?a\.?|none\.?|not applicable\.?|tbd\.?|unspecified\.?)$/i;

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
- Never use N/A, none, not applicable, TBD or unspecified for a required direction field. Describe operational absence explicitly instead.
`;
}

function operationalText(value, fallback) {
  const normalized = text(value);
  return !normalized || PLACEHOLDER.test(normalized) ? fallback : value;
}

function normalizeShot(shot = {}, masterOutputSpec = {}) {
  const clean = stripPromptFields(shot);
  const generation = object(clean.generation);
  const existingOutputSpec = object(generation.output_spec);
  const duration =
    finite(clean.duration_seconds) ??
    finite(existingOutputSpec.duration_seconds) ??
    finite(masterOutputSpec.duration_seconds);

  const design = object(clean.production_design);
  const continuity = object(clean.continuity);

  return {
    ...clean,
    production_design: {
      ...design,
      environment: operationalText(
        design.environment,
        "The established scene environment is preserved without introducing an additional environment layer.",
      ),
      wardrobe: operationalText(
        design.wardrobe,
        "No featured wardrobe is required; any background human figures remain non-identifiable and clothing continuity follows the established venue context.",
      ),
      props: operationalText(
        design.props,
        "No additional hero props are introduced beyond objects already established by the approved source and scene direction.",
      ),
      materials: operationalText(
        design.materials,
        "Existing source materials and surfaces are preserved with physically credible texture, reflectance and wear.",
      ),
      texture_detail: operationalText(
        design.texture_detail,
        "Preserve source-grounded micro-texture and natural surface variation; avoid synthetic smoothing or plastic detail.",
      ),
    },
    continuity: {
      ...continuity,
      identity: operationalText(
        continuity.identity,
        "No featured identity is introduced; any background people remain non-identifiable while the source environment stays visually consistent.",
      ),
      product: operationalText(
        continuity.product,
        "No new hero product is introduced; visible objects remain consistent with the approved source environment.",
      ),
      location: operationalText(
        continuity.location,
        "Maintain the same source-grounded location geometry, architecture, lighting anchors and spatial relationships throughout the shot.",
      ),
      wardrobe: operationalText(
        continuity.wardrobe,
        "No featured wardrobe continuity is required; incidental background clothing remains stable and non-identifying throughout the shot.",
      ),
      screen_direction: operationalText(
        continuity.screen_direction,
        "Maintain one coherent screen direction for camera travel and any incidental subject movement across the complete shot.",
      ),
      spatial_geography: operationalText(
        continuity.spatial_geography,
        "Preserve source-grounded spatial geography and relative positions of architectural and environmental elements throughout the shot.",
      ),
    },
    generation: {
      ...stripPromptFields(generation),
      required: true,
      service: "ai.video.generate",
      capability: "ai.video.generate",
      output_spec: {
        ...existingOutputSpec,
        media_type: "VIDEO",
        duration_seconds: duration,
        aspect_ratio:
          text(masterOutputSpec.aspect_ratio) ||
          text(existingOutputSpec.aspect_ratio) ||
          "16:9",
        resolution:
          text(masterOutputSpec.resolution) ||
          text(existingOutputSpec.resolution) ||
          "1920x1080",
        frame_rate:
          finite(masterOutputSpec.frame_rate) ??
          finite(existingOutputSpec.frame_rate) ??
          30,
        audio:
          text(masterOutputSpec.audio) ||
          text(existingOutputSpec.audio) ||
          "Follow the structured shot audio and sound-design contract for the exact shot duration.",
      },
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
};
