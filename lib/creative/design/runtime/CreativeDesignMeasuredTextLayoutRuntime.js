import sharp from "sharp";

const CONTRACT = "CREATIVE_DESIGN_MEASURED_TEXT_LAYOUT_V1";
const MAX_MEASUREMENTS = 12000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function localeFor(value, requestedLocale = null) {
  if (requestedLocale) return requestedLocale;
  if (/\p{Script=Thai}/u.test(String(value || ""))) return "th";
  if (/\p{Script=Arabic}/u.test(String(value || ""))) return "ar";
  return "en";
}

function segmentWords(value, locale) {
  const source = String(value ?? "");
  if (!source) return [];
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    return [...segmenter.segment(source)].map((entry) => ({
      value: entry.segment,
      word_like: entry.isWordLike !== false,
    }));
  } catch {
    return source.split(/(\s+)/).filter(Boolean).map((entry) => ({
      value: entry,
      word_like: !/^\s+$/.test(entry),
    }));
  }
}

function segmentGraphemes(value, locale) {
  const source = String(value ?? "");
  if (!source) return [];
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    return [...segmenter.segment(source)].map((entry) => entry.segment);
  } catch {
    return Array.from(source);
  }
}

function escapePango(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function bindingFor(bindings, id) {
  if (!bindings || !id) return null;
  if (typeof bindings.get === "function") return bindings.get(id) || null;
  return object(bindings)[id] || null;
}

function fontDescriptor(binding, typography) {
  const explicitFamily = text(
    binding?.font_family ||
    binding?.pango_family ||
    typography?.font_family,
  );
  const cssFamily = text(binding?.css_family);
  const family = explicitFamily ||
    (cssFamily && !cssFamily.startsWith("AvantiqoFont-") ? cssFamily : "");
  const filePath = text(binding?.file_path);
  const fontSize = Math.max(1, number(typography?.font_size, 16));
  const fontAssetId = text(typography?.font_asset_id) || "unknown";
  if (!family) {
    throw new Error(`CREATIVE_DESIGN_MEASURED_FONT_FAMILY_REQUIRED:${fontAssetId}`);
  }
  if (!filePath) {
    throw new Error(`CREATIVE_DESIGN_MEASURED_FONT_FILE_REQUIRED:${fontAssetId}`);
  }
  return { family, filePath, fontSize };
}

function wordLikeCount(value, locale) {
  return segmentWords(value, locale)
    .filter((entry) => entry.word_like && text(entry.value))
    .length;
}

function balanceScore(widths, maximumWidth) {
  if (widths.length <= 1) return 1;
  const used = widths.filter((value) => value > 0);
  if (!used.length) return 1;
  const spread = Math.max(...used) - Math.min(...used);
  return Number(
    Math.max(0, 1 - Math.min(1, spread / Math.max(1, maximumWidth))).toFixed(4),
  );
}

function normalizedColumns(node = {}) {
  const columns = list(node.columns);
  const total = columns.reduce(
    (sum, column) => sum + Math.max(0, number(column.width, 0)),
    0,
  );
  return columns.map((column, index) => ({
    ...column,
    id: text(column.id) || `column-${index + 1}`,
    width_ratio: total > 0
      ? Math.max(0, number(column.width, 0)) / total
      : 1 / Math.max(1, columns.length),
  }));
}

function normalizedCell(row, column, columnIndex) {
  const values = list(row.cells);
  const cellValue = values[columnIndex];
  const cell = typeof cellValue === "object" && cellValue !== null
    ? cellValue
    : { content: cellValue };
  return {
    content: String(cell.content ?? ""),
    typography: {
      ...object(column.typography),
      ...object(cell.typography),
    },
    style: {
      ...object(column.style),
      ...object(cell.style),
    },
  };
}

export async function createCreativeDesignMeasuredTextLayout({
  document = {},
  font_bindings = null,
  measure_text = null,
} = {}) {
  const layouts = new Map();
  const evidence = [];
  const widthCache = new Map();
  let measurementCount = 0;

  async function measureWidth(value, typography = {}) {
    const content = String(value ?? "");
    if (!content) return 0;
    const fontAssetId = text(typography.font_asset_id);
    const binding = bindingFor(font_bindings, fontAssetId);
    if (!binding) {
      throw new Error(
        `CREATIVE_DESIGN_MEASURED_FONT_BINDING_REQUIRED:${fontAssetId || "unknown"}`,
      );
    }
    const letterSpacing = number(typography.letter_spacing, 0);
    const locale = localeFor(content, typography.locale);
    const descriptor = measure_text
      ? {
          family: text(binding?.font_family || binding?.css_family) || "TEST_FONT",
          filePath: text(binding?.file_path) || "TEST_FILE",
          fontSize: Math.max(1, number(typography.font_size, 16)),
        }
      : fontDescriptor(binding, typography);
    const key = JSON.stringify([
      fontAssetId,
      descriptor.family,
      descriptor.filePath,
      descriptor.fontSize,
      letterSpacing,
      content,
    ]);
    if (widthCache.has(key)) return widthCache.get(key);
    if (measurementCount >= MAX_MEASUREMENTS) {
      throw new Error(
        `CREATIVE_DESIGN_MEASURED_TEXT_LIMIT_EXCEEDED:${MAX_MEASUREMENTS}`,
      );
    }
    measurementCount += 1;

    const promise = (async () => {
      let measured;
      if (typeof measure_text === "function") {
        measured = await measure_text({
          content,
          typography,
          binding,
          locale,
        });
      } else {
        const metadata = await sharp({
          text: {
            text: escapePango(content),
            font: `${descriptor.family} ${descriptor.fontSize}`,
            fontfile: descriptor.filePath,
            dpi: 72,
            rgba: true,
            wrap: "none",
          },
        }).metadata();
        measured = number(metadata.width, 0);
      }
      const graphemeCount = segmentGraphemes(content, locale).length;
      return Math.max(
        0,
        number(measured, 0) + Math.max(0, graphemeCount - 1) * letterSpacing,
      );
    })();
    widthCache.set(key, promise);
    return promise;
  }

  async function splitOversizeToken(token, maximumWidth, typography, locale) {
    const chunks = [];
    let current = "";
    for (const grapheme of segmentGraphemes(token, locale)) {
      const candidate = current + grapheme;
      if (
        current &&
        await measureWidth(candidate, typography) > maximumWidth
      ) {
        chunks.push(current);
        current = grapheme;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [token];
  }

  async function rebalance(lines, widths, maximumWidth, typography, locale) {
    if (
      lines.length < 2 ||
      /\p{Script=Thai}|\p{Script=Arabic}/u.test(lines.join(""))
    ) {
      return { lines, widths };
    }
    const nextLines = [...lines];
    const nextWidths = [...widths];
    for (let pass = 0; pass < 2; pass += 1) {
      const lastIndex = nextLines.length - 1;
      const previousWords = nextLines[lastIndex - 1]
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (previousWords.length < 3) break;
      const moved = previousWords.at(-1);
      const previousCandidate = previousWords.slice(0, -1).join(" ");
      const lastCandidate = `${moved} ${nextLines[lastIndex]}`.trim();
      const [previousWidth, lastWidth] = await Promise.all([
        measureWidth(previousCandidate, typography),
        measureWidth(lastCandidate, typography),
      ]);
      if (previousWidth > maximumWidth || lastWidth > maximumWidth) break;
      const beforeSpread = Math.abs(
        nextWidths[lastIndex - 1] - nextWidths[lastIndex],
      );
      const afterSpread = Math.abs(previousWidth - lastWidth);
      if (afterSpread >= beforeSpread) break;
      nextLines[lastIndex - 1] = previousCandidate;
      nextLines[lastIndex] = lastCandidate;
      nextWidths[lastIndex - 1] = previousWidth;
      nextWidths[lastIndex] = lastWidth;
    }
    return { lines: nextLines, widths: nextWidths };
  }

  async function layoutText(value, frame = {}, typography = {}, layoutId = null) {
    const content = String(value ?? "");
    const fontSize = Math.max(1, number(typography.font_size, 16));
    const lineHeightMultiplier = Math.max(
      0.1,
      number(typography.line_height, 1.2),
    );
    const lineHeight = fontSize * lineHeightMultiplier;
    const maximumWidth = Math.max(1, number(frame.width, 1));
    const maximumHeight = Math.max(1, number(frame.height, 1));
    const locale = localeFor(content, typography.locale);
    const lines = [];
    const widths = [];

    for (const paragraph of content.split(/\r?\n/)) {
      if (!paragraph) {
        lines.push("");
        widths.push(0);
        continue;
      }
      const paragraphLines = [];
      const paragraphWidths = [];
      let current = "";
      for (const segment of segmentWords(paragraph, locale)) {
        const raw = segment.value;
        const candidate = current + raw;
        if (
          !current ||
          await measureWidth(candidate.trimEnd(), typography) <= maximumWidth
        ) {
          current = candidate;
          continue;
        }

        if (current.trim().length) {
          const committed = current.trimEnd();
          paragraphLines.push(committed);
          paragraphWidths.push(await measureWidth(committed, typography));
        }
        const trimmed = raw.trimStart();
        if (!trimmed) {
          current = "";
          continue;
        }
        if (await measureWidth(trimmed, typography) <= maximumWidth) {
          current = trimmed;
          continue;
        }
        const chunks = await splitOversizeToken(
          trimmed,
          maximumWidth,
          typography,
          locale,
        );
        for (const chunk of chunks.slice(0, -1)) {
          paragraphLines.push(chunk);
          paragraphWidths.push(await measureWidth(chunk, typography));
        }
        current = chunks.at(-1) || "";
      }
      if (current || !paragraphLines.length) {
        const committed = current.trimEnd();
        paragraphLines.push(committed);
        paragraphWidths.push(await measureWidth(committed, typography));
      }
      const balanced = await rebalance(
        paragraphLines,
        paragraphWidths,
        maximumWidth,
        typography,
        locale,
      );
      lines.push(...balanced.lines);
      widths.push(...balanced.widths);
    }

    const maxLines = Math.max(1, Math.floor(maximumHeight / lineHeight));
    const lastLine = lines.at(-1) || "";
    const actualFontMeasurement = typeof measure_text !== "function";
    const layout = {
      contract: CONTRACT,
      id: layoutId,
      lines,
      all_lines: lines,
      line_widths: widths.map((entry) => Number(entry.toFixed(3))),
      line_count: lines.length,
      line_height: lineHeight,
      required_height: lines.length * lineHeight,
      max_lines: maxLines,
      overflow:
        lines.length > maxLines ||
        widths.some((entry) => entry > maximumWidth + 0.5),
      locale,
      unicode_segmented: true,
      content_preserved_on_overflow: true,
      estimated: false,
      actual_font_measurement: actualFontMeasurement,
      shaping_engine: actualFontMeasurement
        ? "PANGO_HARFBUZZ_FREETYPE"
        : "INJECTED_TEST_MEASURER",
      measurement_source: actualFontMeasurement
        ? "SHARP_TEXT_FONTFILE"
        : "INJECTED_TEST_MEASURER",
      balance_score: balanceScore(widths, maximumWidth),
      widow_orphan_risk:
        lines.length > 1 && wordLikeCount(lastLine, locale) <= 1,
    };
    if (layoutId) layouts.set(layoutId, layout);
    return layout;
  }

  for (const page of list(document.pages)) {
    for (const node of list(page.nodes)) {
      if (node.type === "TEXT") {
        const layout = await layoutText(
          node.content,
          node.frame,
          object(node.typography),
          node.id,
        );
        evidence.push({
          page_id: page.id,
          node_id: node.id,
          type: "TEXT",
          ...layout,
        });
      }

      if (node.type === "TABLE") {
        const columns = normalizedColumns(node);
        const rows = list(node.rows);
        const baseTypography = object(node.typography);
        const baseStyle = object(node.cell_style);
        const basePaddingX = Math.max(0, number(node.cell_padding_x, 8));
        const basePaddingY = Math.max(0, number(node.cell_padding_y, 8));

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = object(rows[rowIndex]);
          for (
            let columnIndex = 0;
            columnIndex < columns.length;
            columnIndex += 1
          ) {
            const column = columns[columnIndex];
            const cell = normalizedCell(row, column, columnIndex);
            const style = {
              ...baseStyle,
              ...object(row.style),
              ...cell.style,
            };
            const typography = {
              ...baseTypography,
              ...cell.typography,
            };
            const paddingX = Math.max(
              0,
              number(style.padding_x, basePaddingX),
            );
            const paddingY = Math.max(
              0,
              number(style.padding_y, basePaddingY),
            );
            const width = Math.max(
              1,
              number(node.frame?.width, 1) * column.width_ratio - paddingX * 2,
            );
            const id = `${node.id}:r${rowIndex}:c${columnIndex}`;
            const layout = await layoutText(
              cell.content,
              { width, height: Number.MAX_SAFE_INTEGER },
              typography,
              id,
            );
            evidence.push({
              page_id: page.id,
              node_id: node.id,
              cell_id: id,
              type: "TABLE_CELL",
              padding_y: paddingY,
              ...layout,
            });
          }
        }
      }
    }
  }

  return {
    success: true,
    contract: CONTRACT,
    layouts,
    evidence,
    measurement_count: measurementCount,
    cache_entries: widthCache.size,
    actual_font_measurement: typeof measure_text !== "function",
    shaping_engine: typeof measure_text !== "function"
      ? "PANGO_HARFBUZZ_FREETYPE"
      : "INJECTED_TEST_MEASURER",
    provider_called: false,
  };
}

export const CreativeDesignMeasuredTextLayoutRuntime = Object.freeze({
  contract: CONTRACT,
  create: createCreativeDesignMeasuredTextLayout,
});

export default CreativeDesignMeasuredTextLayoutRuntime;
