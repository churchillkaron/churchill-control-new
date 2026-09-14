const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeImageStudioTextStyle(style = {}) {
  const fontSize = Math.max(6, num(style.font_size, 36));
  const lineHeight = clamp(num(style.line_height, 1.05), 0.8, 3);
  const align = ["left", "center", "right"].includes(style.text_align) ? style.text_align : "left";
  const verticalAlign = ["top", "middle", "bottom"].includes(style.vertical_align) ? style.vertical_align : "top";
  const family = String(style.font_family || "Arial, Helvetica, sans-serif").trim() || "Arial, Helvetica, sans-serif";
  const weight = clamp(num(style.font_weight, 500), 100, 900);
  const letterSpacing = clamp(num(style.letter_spacing, 0), -fontSize * 0.1, fontSize * 0.5);
  return { fontSize, lineHeight, align, verticalAlign, family, weight, letterSpacing };
}

function estimatedGlyphWidth(style) {
  const weightFactor = style.weight >= 700 ? 0.59 : style.weight >= 600 ? 0.57 : 0.54;
  return Math.max(1, style.fontSize * weightFactor + style.letterSpacing);
}

function splitLongWord(word, maxChars) {
  if (word.length <= maxChars) return [word];
  const parts = [];
  for (let i = 0; i < word.length; i += maxChars) parts.push(word.slice(i, i + maxChars));
  return parts;
}

export function measureImageStudioText({ text = "", bounds = {}, style = {} } = {}) {
  const normalized = normalizeImageStudioTextStyle(style);
  const width = Math.max(1, num(bounds.width, 1));
  const height = Math.max(1, num(bounds.height, 1));
  const glyphWidth = estimatedGlyphWidth(normalized);
  const maxChars = Math.max(1, Math.floor(width / glyphWidth));
  const lineHeightPx = normalized.fontSize * normalized.lineHeight;
  const maxLines = Math.max(1, Math.floor(height / lineHeightPx));
  const lines = [];

  for (const paragraph of String(text ?? "").split(/\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const sourceWord of paragraph.trim().split(/\s+/)) {
      for (const word of splitLongWord(sourceWord, maxChars)) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) current = candidate;
        else { if (current) lines.push(current); current = word; }
      }
    }
    lines.push(current);
  }

  const contentHeight = lines.length * lineHeightPx;
  const overflow = lines.length > maxLines || contentHeight > height + 0.001;
  const visibleLines = lines.slice(0, maxLines);
  let offsetY = 0;
  const visibleHeight = visibleLines.length * lineHeightPx;
  if (normalized.verticalAlign === "middle") offsetY = Math.max(0, (height - visibleHeight) / 2);
  if (normalized.verticalAlign === "bottom") offsetY = Math.max(0, height - visibleHeight);
  return { ...normalized, lines, visibleLines, maxLines, lineHeightPx, contentHeight, overflow, offsetY };
}

export const CreativeImageStudioTypographyRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_TYPOGRAPHY_V1",
  normalize: normalizeImageStudioTextStyle,
  measure: measureImageStudioText,
});
