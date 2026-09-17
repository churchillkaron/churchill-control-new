function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rowsFrom(result = {}) {
  const root = object(result);
  for (const key of ["rows","items","invoices","bookings","customers","employees","documents","quotations","assets","data"]) {
    if (Array.isArray(root[key])) return root[key];
    if (root[key] && typeof root[key] === "object" && Array.isArray(root[key].rows)) return root[key].rows;
  }
  return [];
}

function labelFrom(row = {}) {
  const value = object(row);
  return text(value.name || value.display_name || value.customer_name || value.supplier_name || value.invoice_number || value.number || value.title || value.reference || value.code, 180);
}

export function deterministicFastReadReply({ capabilityKey, result, message = "" } = {}) {
  const key = text(capabilityKey, 300);
  const root = object(result);
  if (key === "services.wallet.read") {
    const wallet = object(root.wallet || root.result || root);
    if (wallet.wallet_exists === false) return "There is no Services wallet for this organization yet.";
    const currency = text(wallet.currency, 24);
    const available = text(wallet.available_balance, 80);
    const reserved = text(wallet.reserved_balance, 80);
    const status = text(wallet.status, 80);
    if (available) return `Current Services wallet: ${currency ? `${currency} ` : ""}${available} available${reserved ? `, ${reserved} reserved` : ""}${status ? `, status ${status}` : ""}.`;
  }
  let rows = rowsFrom(root);
  const queryTokens = text(message, 500).toLowerCase().split(/\s+/).filter((token) => token.length >= 4 && !["show","list","latest","current","invoice","invoices","customer","customers","balance","status","today","what","where","which","with","from","have"].includes(token));
  if (rows.length && queryTokens.length) {
    const filtered = rows.filter((row) => {
      const haystack = JSON.stringify(row).toLowerCase();
      return queryTokens.every((token) => haystack.includes(token));
    });
    if (filtered.length) rows = filtered;
  }
  const explicit = root.count ?? root.total ?? root.total_count;
  const explicitCount = explicit === null || explicit === undefined || explicit === "" ? null : Number(explicit);
  const count = queryTokens.length && rows.length ? rows.length : (Number.isFinite(explicitCount) ? explicitCount : rows.length);
  if (rows.length || Number.isFinite(explicitCount)) {
    const labels = rows.map(labelFrom).filter(Boolean).slice(0, 5);
    return labels.length ? `I found ${count} current record${count === 1 ? "" : "s"}: ${labels.join(", ")}.` : `I found ${count} current record${count === 1 ? "" : "s"}.`;
  }
  const summary = text(root.summary || root.message, 1000);
  return summary || null;
}
