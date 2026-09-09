import { jsPDF } from "jspdf";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { buildCustomerInvoiceDocument } from "@/lib/platform/documents/builders/CustomerInvoiceBuilder";
import { resolveBrand } from "@/lib/platform/documents/branding/BrandResolver";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: text(currency) || "THB",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${text(currency) || "THB"} ${amount.toLocaleString("en-GB")}`;
  }
}

function dateLabel(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return text(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function firstHexColor(brand = {}) {
  for (const candidate of list(brand?.colors)) {
    const value = text(typeof candidate === "string" ? candidate : candidate?.value || candidate?.hex);
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  }
  return "#D6A66A";
}

function rgb(hex) {
  const value = text(hex).replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function customerName(document, context) {
  const party = context?.party || document?.party || {};
  return text(party.display_name || party.legal_name || party.name) || "Customer";
}

async function loadScopedInvoice({ organizationId, entityId, invoiceId }) {
  let query = supabaseAdmin
    .from("customer_invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", invoiceId);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    const scopedError = new Error("Customer invoice not found in the selected organization and legal entity");
    scopedError.status = 404;
    throw scopedError;
  }
  return data;
}

async function loadPaymentEvidence({ organizationId, entityId, invoiceId }) {
  let allocationQuery = supabaseAdmin
    .from("finance_customer_payment_allocations")
    .select("customer_payment_id,allocated_amount,allocated_at")
    .eq("organization_id", organizationId)
    .eq("customer_invoice_id", invoiceId)
    .is("reversed_at", null)
    .order("allocated_at", { ascending: false })
    .limit(1);
  if (entityId) allocationQuery = allocationQuery.eq("entity_id", entityId);
  const allocationResult = await allocationQuery.maybeSingle();
  if (allocationResult.error) throw allocationResult.error;
  const allocation = allocationResult.data;
  if (!allocation?.customer_payment_id) return null;

  let paymentQuery = supabaseAdmin
    .from("customer_payments")
    .select("id,payment_number,payment_date,amount,payment_method,reference_number,currency_code,status,allocated_amount,unapplied_amount")
    .eq("organization_id", organizationId)
    .eq("id", allocation.customer_payment_id);
  if (entityId) paymentQuery = paymentQuery.eq("entity_id", entityId);
  const paymentResult = await paymentQuery.maybeSingle();
  if (paymentResult.error) throw paymentResult.error;
  return paymentResult.data ? { kind: "posted", allocation, payment: paymentResult.data } : null;
}

async function loadHistoricalPaymentEvidence({ organizationId, entityId, invoiceId }) {
  let query = supabaseAdmin
    .from("finance_historical_customer_payment_evidence")
    .select("receipt_number,paid_date,amount,currency_code,payment_method,source_system,evidence")
    .eq("organization_id", organizationId)
    .eq("customer_invoice_id", invoiceId)
    .order("paid_date", { ascending: false })
    .limit(1);
  if (entityId) query = query.eq("entity_id", entityId);
  const result = await query.maybeSingle();
  if (result.error) {
    if (["PGRST205", "42P01"].includes(result.error.code)) return null;
    throw result.error;
  }
  return result.data ? { kind: "historical", historical: result.data } : null;
}

function legalAddress(brand = {}) {
  const legal = brand?.legal || {};
  return [legal.address, legal.phone, legal.email].map(text).filter(Boolean);
}

function paymentLines(brand = {}) {
  const payment = brand?.payment || {};
  return [
    payment.bank_name ? `Bank: ${payment.bank_name}` : null,
    payment.account_name ? `Account name: ${payment.account_name}` : null,
    payment.account_number ? `Account: ${payment.account_number}` : null,
    payment.swift ? `SWIFT: ${payment.swift}` : null,
  ].filter(Boolean);
}

async function loadBrandLogo(brand = {}) {
  const url = text(brand.logo_url);
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = text(response.headers.get("content-type")).toLowerCase();
    const format = contentType.includes("jpeg") || contentType.includes("jpg") ? "JPEG" : "PNG";
    const bytes = Buffer.from(await response.arrayBuffer());
    return { data: `data:${contentType || "image/png"};base64,${bytes.toString("base64")}`, format };
  } catch {
    return null;
  }
}

export async function renderCustomerInvoicePdf({ organizationId, entityId, invoiceId, mode = "auto" }) {
  if (!organizationId) throw new Error("organizationId required");
  if (!invoiceId) throw new Error("invoiceId required");

  const invoice = await loadScopedInvoice({ organizationId, entityId, invoiceId });
  const postedPaymentEvidence = await loadPaymentEvidence({ organizationId, entityId, invoiceId });
  const historicalPaymentEvidence = postedPaymentEvidence || text(invoice.source_document_type).toUpperCase() !== "LEGACY_COLELEY_INVOICE"
    ? null
    : await loadHistoricalPaymentEvidence({ organizationId, entityId, invoiceId });
  const paymentEvidence = postedPaymentEvidence || historicalPaymentEvidence;
  const requestedReceipt = text(mode).toLowerCase() === "receipt";
  const receiptMode = requestedReceipt || (text(invoice.status).toUpperCase() === "PAID" && Boolean(paymentEvidence));
  if (requestedReceipt && !paymentEvidence) {
    const receiptError = new Error("Paid receipt requires verified posted payment or migrated historical payment evidence");
    receiptError.status = 409;
    throw receiptError;
  }
  const resolvedEntityId = entityId || invoice.entity_id;
  const [brand, partyResult] = await Promise.all([
    resolveBrand({ organizationId, entityId: resolvedEntityId }),
    invoice.party_id || invoice.customer_id
      ? supabaseAdmin
          .from("parties")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("id", invoice.party_id || invoice.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const brandLogo = await loadBrandLogo(brand);
  if (partyResult?.error) throw partyResult.error;
  const context = { brand, party: partyResult?.data || null };
  const document = await buildCustomerInvoiceDocument({
    data: { invoice },
    context,
  });

  const legal = brand.legal || {};
  const currency = text(document.currency_code || brand.currency_code || legal.currency) || "THB";
  const accent = rgb(firstHexColor(brand));
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 48;
  const right = pageWidth - 48;

  pdf.setFillColor(...accent);
  pdf.rect(0, 0, pageWidth, 7, "F");
  const brandTextX = brandLogo ? left + 94 : left;
  if (brandLogo) {
    try {
      pdf.addImage(brandLogo.data, brandLogo.format, left, 27, 82, 56, undefined, "FAST");
    } catch {
      // Keep legal-name fallback below if the source image cannot be embedded.
    }
  }
  pdf.setTextColor(22, 22, 22);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(text(legal.legal_name || brand.name || "Company"), brandTextX, 54);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(95, 95, 95);
  const address = legalAddress(brand);
  address.forEach((line, index) => pdf.text(line, brandTextX, 70 + index * 11));
  if (legal.tax_id) pdf.text(`Tax ID: ${legal.tax_id}`, brandTextX, 70 + address.length * 11);

  pdf.setTextColor(22, 22, 22);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text(receiptMode ? "RECEIPT" : "INVOICE", right, 54, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(...accent);
  pdf.text(text(document.invoice_number || "DRAFT"), right, 72, { align: "right" });

  pdf.setTextColor(105, 105, 105);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("BILL TO", left, 132);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(12);
  pdf.text(customerName(document, context), left, 150);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  const party = context.party || document.party || {};
  const partyAddress = [party.address, party.phone, party.email].map(text).filter(Boolean);
  partyAddress.forEach((line, index) => pdf.text(line, left, 165 + index * 11));
  if (party.tax_id) {
    pdf.text(`Tax ID: ${text(party.tax_id)}`, left, 165 + partyAddress.length * 11);
  }

  const metaX = right - 155;
  const metaValueX = right;
  const payment = paymentEvidence?.payment || null;
  const allocation = paymentEvidence?.allocation || null;
  const historical = paymentEvidence?.historical || null;
  const paymentDate = payment?.payment_date || allocation?.allocated_at || historical?.paid_date || null;
  const paidAmount = Number(allocation?.allocated_amount || payment?.allocated_amount || historical?.amount || 0);
  const metaRows = receiptMode
    ? [
        ["Invoice date", dateLabel(document.invoice_date)],
        ["Payment date", dateLabel(paymentDate ? String(paymentDate).slice(0, 10) : null)],
        ["Status", "PAID"],
        ["Currency", currency],
      ]
    : [
        ["Invoice date", dateLabel(document.invoice_date)],
        ["Due date", dateLabel(document.due_date)],
        ["Currency", currency],
        ["Status", text(document.status || "OPEN").toUpperCase()],
      ];
  pdf.setFontSize(8.5);
  metaRows.forEach(([label, value], index) => {
    const y = 132 + index * 18;
    pdf.setTextColor(120, 120, 120);
    pdf.setFont("helvetica", "normal");
    pdf.text(label, metaX, y);
    pdf.setTextColor(25, 25, 25);
    pdf.setFont("helvetica", "bold");
    pdf.text(value, metaValueX, y, { align: "right" });
  });

  let y = 225;
  pdf.setFillColor(248, 248, 248);
  pdf.roundedRect(left, y, right - left, 26, 5, 5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("DESCRIPTION", left + 10, y + 17);
  pdf.text("QTY", right - 170, y + 17, { align: "right" });
  pdf.text("UNIT PRICE", right - 85, y + 17, { align: "right" });
  pdf.text("AMOUNT", right - 8, y + 17, { align: "right" });
  y += 38;

  const rows = list(document.lines);
  pdf.setFontSize(9);
  rows.forEach((line, index) => {
    const description = text(line.description || line.name || `Line ${index + 1}`);
    const descriptionLines = pdf.splitTextToSize(description, 260).slice(0, 3);
    const rowHeight = Math.max(26, descriptionLines.length * 11 + 10);
    if (y + rowHeight > pageHeight - 150) {
      pdf.addPage();
      y = 60;
    }
    pdf.setDrawColor(232, 232, 232);
    pdf.line(left, y + rowHeight - 4, right, y + rowHeight - 4);
    pdf.setTextColor(35, 35, 35);
    pdf.setFont("helvetica", "normal");
    pdf.text(descriptionLines, left + 10, y + 11);
    pdf.text(String(Number(line.quantity || 0)), right - 170, y + 11, { align: "right" });
    pdf.text(money(line.unit_price, currency), right - 85, y + 11, { align: "right" });
    const amount = Number(line.quantity || 0) * Number(line.unit_price || 0);
    pdf.setFont("helvetica", "bold");
    pdf.text(money(amount, currency), right - 8, y + 11, { align: "right" });
    y += rowHeight;
  });

  y += 18;
  const subtotal = Number(document.totals?.subtotal || 0);
  const tax = Number(document.totals?.tax_amount || 0);
  const total = Number(document.totals?.total_amount || subtotal + tax);
  const totals = receiptMode
    ? [
        ["Invoice total", total],
        ["Amount paid", paidAmount || total],
        ["Balance due", 0],
      ]
    : [
        ["Subtotal", subtotal],
        ...(tax ? [["Tax", tax]] : []),
        ["Total", total],
      ];
  totals.forEach(([label, value], index) => {
    const isTotal = index === totals.length - 1;
    pdf.setFont("helvetica", isTotal ? "bold" : "normal");
    pdf.setFontSize(isTotal ? 12 : 9);
    pdf.setTextColor(isTotal ? 25 : 95, isTotal ? 25 : 95, isTotal ? 25 : 95);
    pdf.text(label, right - 155, y, { align: "right" });
    pdf.text(money(value, currency), right, y, { align: "right" });
    y += isTotal ? 22 : 16;
  });

  const receiptPaymentLines = receiptMode
    ? [
        payment?.payment_number || historical?.receipt_number
          ? `Receipt: ${payment?.payment_number || historical?.receipt_number}`
          : null,
        payment?.payment_method || historical?.payment_method
          ? `Payment method: ${payment?.payment_method || historical?.payment_method}`
          : null,
        payment?.reference_number ? `Reference: ${payment.reference_number}` : null,
        paymentDate ? `Paid on: ${dateLabel(String(paymentDate).slice(0, 10))}` : null,
        historical?.source_system ? `Source: ${historical.source_system}` : null,
      ].filter(Boolean)
    : [];
  const payments = receiptMode ? receiptPaymentLines : paymentLines(brand);
  if (payments.length) {
    y += 10;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(95, 95, 95);
    pdf.text(receiptMode ? "PAYMENT RECEIVED" : "PAYMENT DETAILS", left, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(45, 45, 45);
    payments.forEach((line, index) => pdf.text(line, left, y + 15 + index * 11));
  }

  pdf.setDrawColor(...accent);
  pdf.line(left, pageHeight - 62, right, pageHeight - 62);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  const footer = [
    text(legal.legal_name || brand.name),
    legal.registration_number ? `Registration ${legal.registration_number}` : null,
    legal.tax_id ? `Tax ID ${legal.tax_id}` : null,
    brand.website || null,
  ].filter(Boolean).join(" · ");
  pdf.text(footer || "Generated by Avantiqo", pageWidth / 2, pageHeight - 42, { align: "center" });

  const baseName = text(document.invoice_number || invoice.id).replace(/[^A-Za-z0-9._-]+/g, "-");
  const filename = `${baseName}${receiptMode ? "-receipt" : ""}.pdf`;
  return {
    buffer: Buffer.from(pdf.output("arraybuffer")),
    filename,
    invoice: document,
  };
}
