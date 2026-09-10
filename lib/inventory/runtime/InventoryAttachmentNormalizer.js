function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function key(value) { return text(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value, 100).replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export const CODE_KEYS = ["code", "sku", "item_code", "product_code"];
export const NAME_KEYS = ["name", "item_name", "product_name", "description"];

function value(row, aliases) {
  const map = new Map(Object.entries(object(row)).map(([name, entry]) => [key(name), entry]));
  for (const alias of aliases) if (map.has(alias) && text(map.get(alias))) return map.get(alias);
  return null;
}

export function inventoryRowsFromAttachment(file = {}) {
  const analysis = object(file.analysis);
  const excerpt = text(analysis.content_excerpt, 120000);
  if (!excerpt) return [];
  try {
    const parsed = JSON.parse(excerpt);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.sheets)) {
      const rows = [];
      for (const sheet of parsed.sheets) {
        const source = list(sheet?.rows);
        if (source.length < 2) continue;
        const headers = list(source[0]?.values).map(key);
        for (const row of source.slice(1)) {
          const mapped = {};
          list(row?.values).forEach((entry, index) => { if (headers[index]) mapped[headers[index]] = entry; });
          rows.push(mapped);
        }
      }
      return rows;
    }
  } catch {}
  return [];
}

function normalizeRow(row, index) {
  const code = text(value(row, CODE_KEYS), 160);
  const name = text(value(row, NAME_KEYS), 500);
  const cost = number(value(row, ["cost", "unit_cost", "purchase_cost"]));
  const salePrice = number(value(row, ["sale_price", "price", "selling_price"]));
  const type = text(value(row, ["type", "item_type"]), 120) || null;
  const missing = [];
  if (!code) missing.push("code");
  if (!name) missing.push("name");
  return { row_number: index + 2, code: code || null, name: name || null, type, cost, sale_price: salePrice, missing_fields: missing };
}

export function normalizeInventoryAttachmentRows(file = {}) {
  return inventoryRowsFromAttachment(file).slice(0, 500).map(normalizeRow);
}

export function buildInventoryReview(normalizedRows = [], existingItems = []) {
  const byCode = new Map();
  for (const item of list(existingItems)) {
    const itemCode = text(item?.code, 160);
    const current = byCode.get(itemCode) || [];
    current.push(item); byCode.set(itemCode, current);
  }
  return list(normalizedRows).map((row) => {
    if (list(row.missing_fields).length) return { ...row, disposition: "INVALID" };
    const matches = byCode.get(text(row.code, 160)) || [];
    if (matches.length === 1) return { ...row, disposition: "EXISTING", existing_record_id: matches[0].id };
    if (matches.length > 1) return { ...row, disposition: "AMBIGUOUS", existing_record_ids: matches.map((item) => item.id) };
    return { ...row, disposition: "NEW" };
  });
}

export function inventoryAttachmentLooksRecognized(file = {}, rows = inventoryRowsFromAttachment(file)) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  const domains = list(analysis.candidate_domains).map(key);
  const kind = key(evidence.document_type || evidence.object_type);
  if (domains.includes("supply_chain") && /inventory|stock|item|product|sku/.test(kind)) return true;
  if (!rows.length) return false;
  const sample = rows.slice(0, 8);
  return sample.some((row) => value(row, CODE_KEYS)) && sample.some((row) => value(row, NAME_KEYS));
}
