const URL_KEYS = new Set([
  "url", "href", "file_url", "signed_url", "inspection_url", "asset_url",
  "generated_media_url", "output_url", "preview_url", "image_url", "video_url",
  "audio_url", "package_url", "screenshot_url", "thumbnail_url", "document_url",
  "pdf_url", "receipt_url", "download_url", "master_url", "media_url", "storage_reference",
  "playback_url", "primary_url", "master_signed_url", "uri", "output_reference",
  "final_url", "render_url", "final_render_url", "build_artifact_url", "output_storage_reference",
  "provider_receipt_url", "waveform_url",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function safeReference(value) {
  const reference = text(value);
  if (!reference) return null;
  if (reference.startsWith("/") || reference.startsWith("storage://") || /^https?:\/\//i.test(reference)) return reference;
  return null;
}

function primitive(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value) ? value : text(value, 500);
}

function previewRows(owner = {}) {
  const rows = Array.isArray(owner.preview_rows) ? owner.preview_rows : Array.isArray(owner.rows) ? owner.rows : Array.isArray(owner.data) ? owner.data : [];
  return rows.slice(0, 20).map((row) => {
    if (Array.isArray(row)) return row.slice(0, 12).map(primitive);
    if (row && typeof row === "object") return Object.fromEntries(Object.entries(row).slice(0, 12).map(([key, value]) => [text(key, 120), primitive(value)]));
    return primitive(row);
  });
}

export function collectOperatorPresentationArtifacts(value, limit = 48) {
  const output = [];
  const seen = new Set();

  function visit(current, depth = 0, parent = null) {
    if (!current || depth > 8 || output.length >= limit) return;
    if (Array.isArray(current)) { current.forEach((entry) => visit(entry, depth + 1, parent)); return; }
    if (typeof current !== "object") return;

    for (const [key, raw] of Object.entries(current)) {
      const normalizedKey = text(key, 80).toLowerCase();
      if (typeof raw === "string" && URL_KEYS.has(normalizedKey)) {
        const reference = safeReference(raw);
        if (reference && !seen.has(reference)) {
          seen.add(reference);
          const rows = previewRows(current);
          output.push({
            url: reference,
            label: text(current.label || current.title || current.name || current.file_name || parent?.label || parent?.title || parent?.name, 240) || null,
            mime_type: text(current.mime_type || current.mimeType || current.content_type || current.mime, 160) || null,
            folder: text(current.folder || current.folder_name || current.filing_folder || current.group || current.section || parent?.folder || parent?.folder_name || parent?.filing_folder, 240) || null,
            source_key: normalizedKey,
            ...(rows.length ? { preview_rows: rows } : {}),
            preview_text: text(current.preview_text || current.text_preview || current.excerpt || current.summary, 12000) || null,
          });
        }
      }
      if (raw && typeof raw === "object") visit(raw, depth + 1, current);
    }
  }

  visit(value);
  return output;
}

export default collectOperatorPresentationArtifacts;
