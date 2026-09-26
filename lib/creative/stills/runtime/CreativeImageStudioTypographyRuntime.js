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

const graphemeSegmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter("und", { granularity: "grapheme" }) : null;
const wordSegmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter("und", { granularity: "word" }) : null;

function graphemes(value) {
  const text = String(value ?? "");
  if (!text) return [];
  return graphemeSegmenter ? [...graphemeSegmenter.segment(text)].map((item) => item.segment) : Array.from(text);
}

function graphemeWidthEm(grapheme,style) {
  if (!grapheme) return 0;
  if (/^\s+$/u.test(grapheme)) return 0.33;
  if (/\p{Extended_Pictographic}/u.test(grapheme)) return 1;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(grapheme)) return 1;
  if (/\p{Script=Thai}/u.test(grapheme)) return 0.62;
  if (/^[ilI1\.,'\x60!\|:;]$/u.test(grapheme)) return 0.32;
  if (/^[MW@#%&]$/u.test(grapheme)) return 0.85;
  if (/^\p{Punctuation}$/u.test(grapheme)) return 0.38;
  if (/^\p{Number}$/u.test(grapheme)) return 0.56;
  if (/^\p{Uppercase_Letter}$/u.test(grapheme)) return 0.66;
  return style.weight >= 700 ? 0.59 : style.weight >= 600 ? 0.57 : 0.54;
}

function estimatedTextWidth(value,style) {
  const units=graphemes(value);
  if(!units.length)return 0;
  const glyphs=units.reduce((sum,unit)=>sum+graphemeWidthEm(unit,style)*style.fontSize,0);
  return Math.max(0,glyphs+Math.max(0,units.length-1)*style.letterSpacing);
}

function splitLongWord(word,maxWidth,style) {
  const units=graphemes(word);
  if(estimatedTextWidth(word,style)<=maxWidth)return [word];
  const parts=[];let current="";
  for(const unit of units){
    const candidate=current+unit;
    if(current&&estimatedTextWidth(candidate,style)>maxWidth){parts.push(current);current=unit;}
    else current=candidate;
  }
  if(current)parts.push(current);
  return parts.length?parts:[word];
}

function paragraphUnits(paragraph) {
  const text = String(paragraph ?? "");
  if (/\s/u.test(text)) {
    return text.trim().split(/\s+/u).filter(Boolean).map((word) => ({ text: word, separator: " " }));
  }
  if (!wordSegmenter) return [{ text, separator: "" }];
  const segments = [...wordSegmenter.segment(text)]
    .map((item) => item.segment)
    .filter((segment) => segment && !/^\s+$/u.test(segment));
  return (segments.length ? segments : [text]).map((segment) => ({ text: segment, separator: "" }));
}

export function measureImageStudioText({ text = "", bounds = {}, style = {} } = {}) {
  const normalized = normalizeImageStudioTextStyle(style);
  const width = Math.max(1, num(bounds.width, 1));
  const height = Math.max(1, num(bounds.height, 1));
  const lineHeightPx = normalized.fontSize * normalized.lineHeight;
  const maxLines = Math.max(1, Math.floor(height / lineHeightPx));
  const lines = [];

  for (const paragraph of String(text ?? "").split(/\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const unit of paragraphUnits(paragraph)) {
      const parts = splitLongWord(unit.text, width, normalized);
      for (let index = 0; index < parts.length; index++) {
        const word = parts[index];
        const separator = current && index === 0 ? unit.separator : "";
        const candidate = current ? `${current}${separator}${word}` : word;
        if (estimatedTextWidth(candidate,normalized) <= width + 0.001) current = candidate;
        else { if (current) lines.push(current); current = word; }
      }
    }
    lines.push(current);
  }

  const lineWidths=lines.map((line)=>estimatedTextWidth(line,normalized));
  const contentHeight = lines.length * lineHeightPx;
  const overflow = lines.length > maxLines || contentHeight > height + 0.001 || lineWidths.some((lineWidth)=>lineWidth>width+.001);
  const visibleLines = lines.slice(0, maxLines);
  const visibleLineWidths=lineWidths.slice(0,maxLines);
  let offsetY = 0;
  const visibleHeight = visibleLines.length * lineHeightPx;
  if (normalized.verticalAlign === "middle") offsetY = Math.max(0, (height - visibleHeight) / 2);
  if (normalized.verticalAlign === "bottom") offsetY = Math.max(0, height - visibleHeight);
  return { ...normalized, lines, lineWidths, visibleLines, visibleLineWidths, maxLines, lineHeightPx, contentHeight, overflow, offsetY };
}

export const CreativeImageStudioTypographyRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_TYPOGRAPHY_V1",
  normalize: normalizeImageStudioTextStyle,
  measure: measureImageStudioText,
});
