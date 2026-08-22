const CONTRACT = "CREATIVE_DESIGN_TEXT_LAYOUT_V1";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function localeFor(text, requestedLocale = null) {
  if (requestedLocale) return requestedLocale;
  if (/\p{Script=Thai}/u.test(String(text || ""))) return "th";
  return "en";
}

function segmentWords(value, locale) {
  const text = String(value ?? "");
  if (!text) return [];
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    return [...segmenter.segment(text)].map((entry) => ({
      value: entry.segment,
      word_like: entry.isWordLike !== false,
    }));
  } catch {
    return text.split(/(\s+)/).filter(Boolean).map((value) => ({
      value,
      word_like: !/^\s+$/.test(value),
    }));
  }
}

function segmentGraphemes(value, locale) {
  const text = String(value ?? "");
  if (!text) return [];
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((entry) => entry.segment);
  } catch {
    return Array.from(text);
  }
}

function estimatedGraphemeWidth(grapheme, fontSize, letterSpacing) {
  if (/^\s$/u.test(grapheme)) return fontSize * 0.28 + letterSpacing;
  if (/\p{Script=Thai}/u.test(grapheme)) return fontSize * 0.58 + letterSpacing;
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(grapheme)) {
    return fontSize + letterSpacing;
  }
  if (/^[MW@#%&]$/u.test(grapheme)) return fontSize * 0.82 + letterSpacing;
  if (/^[ilI1.,'`:;|!]$/u.test(grapheme)) return fontSize * 0.28 + letterSpacing;
  return fontSize * 0.54 + letterSpacing;
}

export function estimateCreativeDesignTextWidth(value, typography = {}) {
  const fontSize = Math.max(1, number(typography.font_size, 16));
  const letterSpacing = number(typography.letter_spacing, 0);
  const locale = localeFor(value, typography.locale);
  return segmentGraphemes(value, locale).reduce(
    (sum, grapheme) => sum + estimatedGraphemeWidth(grapheme, fontSize, letterSpacing),
    0,
  );
}

function splitOversizeToken(token, maximumWidth, typography, locale) {
  const graphemes = segmentGraphemes(token, locale);
  const chunks = [];
  let current = "";
  for (const grapheme of graphemes) {
    const candidate = current + grapheme;
    if (current && estimateCreativeDesignTextWidth(candidate, typography) > maximumWidth) {
      chunks.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [token];
}

export function wrapCreativeDesignText(value, frame = {}, typography = {}) {
  const content = String(value ?? "");
  const fontSize = Math.max(1, number(typography.font_size, 16));
  const lineHeightMultiplier = Math.max(0.1, number(typography.line_height, 1.2));
  const lineHeight = fontSize * lineHeightMultiplier;
  const maximumWidth = Math.max(1, number(frame.width, 1));
  const maximumHeight = Math.max(1, number(frame.height, 1));
  const locale = localeFor(content, typography.locale);
  const lines = [];

  for (const paragraph of content.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const segments = segmentWords(paragraph, locale);
    let current = "";
    for (const segment of segments) {
      const raw = segment.value;
      const candidate = current + raw;
      if (
        !current ||
        estimateCreativeDesignTextWidth(candidate, typography) <= maximumWidth
      ) {
        current = candidate;
        continue;
      }

      if (current.trim().length) lines.push(current.trimEnd());
      const trimmed = raw.trimStart();
      if (!trimmed) {
        current = "";
        continue;
      }
      if (estimateCreativeDesignTextWidth(trimmed, typography) <= maximumWidth) {
        current = trimmed;
        continue;
      }

      const chunks = splitOversizeToken(trimmed, maximumWidth, typography, locale);
      lines.push(...chunks.slice(0, -1));
      current = chunks.at(-1) || "";
    }
    if (current || !lines.length) lines.push(current.trimEnd());
  }

  const maxLines = Math.max(1, Math.floor(maximumHeight / lineHeight));
  return {
    contract: CONTRACT,
    lines,
    all_lines: lines,
    line_count: lines.length,
    line_height: lineHeight,
    required_height: lines.length * lineHeight,
    max_lines: maxLines,
    overflow: lines.length > maxLines,
    locale,
    unicode_segmented: true,
    content_preserved_on_overflow: true,
    estimated: true,
  };
}

export const CreativeDesignTextLayoutRuntime = Object.freeze({
  contract: CONTRACT,
  wrap: wrapCreativeDesignText,
  estimateWidth: estimateCreativeDesignTextWidth,
});

export default CreativeDesignTextLayoutRuntime;
