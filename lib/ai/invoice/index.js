/**
 * INVOICE INTELLIGENCE ENGINE
 * Converts documents → financial intelligence
 */

export async function processInvoice({
  ocrText,
  organizationId,
}) {
  if (!ocrText) {
    return {
      success: false,
      error: "NO_INVOICE_DATA",
    };
  }

  // =========================
  // SIMPLE STRUCTURED EXTRACTION (AI-ready layer)
  // =========================
  const lines = ocrText.split("\n");

  const totalLine = lines.find(l =>
    l.toLowerCase().includes("total")
  );

  const vatLine = lines.find(l =>
    l.toLowerCase().includes("vat")
  );

  const vendorLine = lines[0] || "unknown";

  const extractNumber = (text) => {
    const match = text?.match(/[\d,.]+/);
    return match ? parseFloat(match[0].replace(",", "")) : 0;
  };

  const result = {
    vendor: vendorLine,
    total: extractNumber(totalLine),
    vat: extractNumber(vatLine),
    category: classifyExpense(ocrText),
    organizationId,
    confidence: 0.78,
  };

  return {
    success: true,
    data: result,
  };
}

/**
 * BASIC FINANCE CLASSIFICATION
 */
function classifyExpense(text) {
  const t = text.toLowerCase();

  if (t.includes("food") || t.includes("restaurant")) {
    return "COGS_FOOD";
  }

  if (t.includes("salary") || t.includes("wage")) {
    return "PAYROLL";
  }

  if (t.includes("electric") || t.includes("water")) {
    return "UTILITIES";
  }

  return "OPERATING_EXPENSE";
}
