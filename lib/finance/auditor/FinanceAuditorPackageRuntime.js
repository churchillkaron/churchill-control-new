import crypto, { randomUUID } from "node:crypto";
import { File } from "node:buffer";
import JSZip from "jszip";

import { createControlledDocument, createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import {
  buildFinanceClosePackageSnapshot,
  buildFinanceClosePackageFingerprint,
  evaluateFinanceClosePackageFreshness,
} from "@/lib/finance/period-close/runtime/FinanceClosePackageFreshness";
import { run as runReport } from "@/lib/finance/reporting/runtime/ReportingApplicationService";
import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PACKAGE_CONTRACT = "AVANTIQO_FINANCE_AUDITOR_PACKAGE_V1";
const VOLATILE_KEYS = new Set(["generated_at", "generatedAt", "updated_at", "created_at", "requested_at"]);
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const now = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fixedZipDate = new Date("1980-01-01T00:00:00.000Z");

function stable(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return Object.fromEntries(Object.keys(value).filter((key) => !VOLATILE_KEYS.has(key)).sort().map((key) => [key, stable(value[key])]));
}
function digest(value) { return sha256(JSON.stringify(stable(value))); }
function safeName(value, fallback = "file") {
  return text(value, 220).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "") || fallback;
}
function actorStaffId(actor) { return actor?.access?.staffAccountId || actor?.staff?.id || actor?.staffId || actor?.staff_id || null; }
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function csv(rows = []) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row?.[column])).join(","))].join("\n");
}
function addJson(zip, path, value) { zip.file(path, JSON.stringify(value, null, 2), { date: fixedZipDate }); }
function addText(zip, path, value) { zip.file(path, String(value ?? ""), { date: fixedZipDate }); }

async function complete(label, buildQuery) {
  return fetchCompleteFinancePopulation({ label, buildQuery });
}

async function loadPeriod({ organizationId, entityId, periodId }) {
  const { data, error } = await supabaseAdmin.from("accounting_periods").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", periodId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accounting period is outside organization/entity scope");
  return data;
}

async function loadLatestCompletedCloseRun({ organizationId, entityId, periodId }) {
  const { data, error } = await supabaseAdmin.from("finance_period_close_runs")
    .select("id,organization_id,entity_id,period_id,close_type,status,result,closed_by,closed_at,created_at,updated_at")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("period_id", periodId).eq("status", "COMPLETED")
    .order("closed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  return rows.find((row) => String(row.close_type || "").toUpperCase() === "YEAR_END") || rows[0] || null;
}

export async function getFinanceAuditorPackageReadiness({ organizationId, entityId, periodId } = {}) {
  if (!organizationId || !entityId || !periodId) return { ready: false, blockers: ["Select a legal entity and accounting period."], period: null, close_run: null, freshness: null };
  const period = await loadPeriod({ organizationId, entityId, periodId });
  const blockers = [];
  const periodStatus = text(period.status).toUpperCase();
  if (!["CLOSED", "LOCKED"].includes(periodStatus)) blockers.push("Close the accounting period through the governed Finance close before generating an auditor package.");
  const closeRun = await loadLatestCompletedCloseRun({ organizationId, entityId, periodId });
  if (!closeRun) return { ready: false, blockers: [...blockers, "A completed governed period-close run is required."], period, close_run: null, freshness: null };
  const snapshot = await buildFinanceClosePackageSnapshot({ organizationId, entityId, periodId });
  const freshness = evaluateFinanceClosePackageFreshness({ snapshot, closeRun });
  if (!freshness.trusted || freshness.state !== "CURRENT") blockers.push(freshness.reason || "The governed close package is not current.");
  return { ready: blockers.length === 0, blockers, period, close_run: closeRun, freshness, close_snapshot: snapshot };
}

async function buildCanonicalReports({ organizationId, entityId, periodId, period }) {
  const params = { organizationId, entityId, periodId, startDate: period.start_date, endDate: period.end_date };
  const [trialBalance, profitLoss, balanceSheet, cashFlow] = await Promise.all([
    runReport("trial_balance", params), runReport("profit_loss", params), runReport("balance_sheet", params), runReport("cash_flow", params),
  ]);
  if (trialBalance?.balanced !== true) throw new Error(`Trial balance must be balanced before auditor package generation; difference ${trialBalance?.difference ?? "unknown"}`);
  return { trial_balance: trialBalance, profit_loss: profitLoss, balance_sheet: balanceSheet, cash_flow: cashFlow };
}

async function loadSupportingEvidence({ organizationId, entityId, periodId, period }) {
  const start = String(period.start_date).slice(0, 10);
  const end = String(period.end_date).slice(0, 10);
  const legacyPeriods = await supabaseAdmin.from("financial_periods").select("id")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("start_date", start).eq("end_date", end);
  if (legacyPeriods.error) throw legacyPeriods.error;
  const legacyPeriodIds = (legacyPeriods.data || []).map((row) => row.id).filter(Boolean);
  const workEvidencePromise = legacyPeriodIds.length
    ? complete("Auditor package work-program evidence", (from, to) => supabaseAdmin.from("accounting_work_program_evidence_links")
        .select("id,document_id,evidence_category,status,is_primary,run_id,work_item_id,engagement_id,linked_at,metadata")
        .eq("organization_id", organizationId).eq("entity_id", entityId).in("period_id", legacyPeriodIds)
        .order("id", { ascending: true }).range(from, to))
    : Promise.resolve({ rows: [], pages: 0, complete: true });
  const [workEvidence, vendorInvoices, apIntake, bankImports] = await Promise.all([
    workEvidencePromise,
    complete("Auditor package vendor invoice evidence", (from, to) => supabaseAdmin.from("vendor_invoices")
      .select("id,invoice_number,invoice_date,vendor_party_id,document_id,status,total_amount,currency_code,journal_entry_id")
      .eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", start).lte("invoice_date", end)
      .order("invoice_date", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    complete("Auditor package AP intake evidence", (from, to) => supabaseAdmin.from("finance_ap_intake_items")
      .select("id,enterprise_document_id,vendor_invoice_id,invoice_number,invoice_date,source_sha256,source_file_name,preparation_status")
      .eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", start).lte("invoice_date", end)
      .order("invoice_date", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    complete("Auditor package bank statement imports", (from, to) => supabaseAdmin.from("finance_bank_statement_imports")
      .select("id,bank_account_id,statement_number,statement_start_date,statement_end_date,opening_balance,closing_balance,currency_code,source_file_url,import_reference,status,created_at")
      .eq("organization_id", organizationId).eq("entity_id", entityId).lte("statement_start_date", end).gte("statement_end_date", start)
      .order("statement_start_date", { ascending: true }).order("id", { ascending: true }).range(from, to)),
  ]);

  const legacyIds = [...new Set([
    ...workEvidence.rows.map((row) => row.document_id),
    ...vendorInvoices.rows.map((row) => row.document_id),
  ].filter(Boolean))];
  const directEnterpriseIds = [...new Set(apIntake.rows.map((row) => row.enterprise_document_id).filter(Boolean))];

  const [legacyResult, mappedEnterpriseResult, directEnterpriseResult] = await Promise.all([
    legacyIds.length ? supabaseAdmin.from("organization_documents").select("id,organization_id,file_url,file_name,mime_type,status,created_at,updated_at").eq("organization_id", organizationId).in("id", legacyIds) : Promise.resolve({ data: [], error: null }),
    legacyIds.length ? supabaseAdmin.from("enterprise_documents").select("id,source_organization_document_id,document_name,document_type,document_status,version_number,storage_path,mime_type,file_size_bytes,checksum_sha256,classification,updated_at").eq("organization_id", organizationId).in("source_organization_document_id", legacyIds) : Promise.resolve({ data: [], error: null }),
    directEnterpriseIds.length ? supabaseAdmin.from("enterprise_documents").select("id,source_organization_document_id,document_name,document_type,document_status,version_number,storage_path,mime_type,file_size_bytes,checksum_sha256,classification,updated_at").eq("organization_id", organizationId).in("id", directEnterpriseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [legacyResult, mappedEnterpriseResult, directEnterpriseResult]) if (result.error) throw result.error;
  const enterpriseById = new Map([...(mappedEnterpriseResult.data || []), ...(directEnterpriseResult.data || [])].map((row) => [row.id, row]));
  const enterpriseByLegacy = new Map((mappedEnterpriseResult.data || []).map((row) => [row.source_organization_document_id, row]));
  const legacyById = new Map((legacyResult.data || []).map((row) => [row.id, row]));

  const references = [];
  for (const row of workEvidence.rows) references.push({ source: "WORK_PROGRAM", source_record_id: row.id, evidence_category: row.evidence_category, legacy_document_id: row.document_id, enterprise_document_id: enterpriseByLegacy.get(row.document_id)?.id || null });
  for (const row of vendorInvoices.rows.filter((row) => row.document_id)) references.push({ source: "VENDOR_INVOICE", source_record_id: row.id, reference: row.invoice_number, legacy_document_id: row.document_id, enterprise_document_id: enterpriseByLegacy.get(row.document_id)?.id || null });
  for (const row of apIntake.rows.filter((row) => row.enterprise_document_id)) references.push({ source: "AP_INTAKE", source_record_id: row.id, reference: row.invoice_number || row.source_file_name, legacy_document_id: null, enterprise_document_id: row.enterprise_document_id });

  const enterpriseDocuments = [...new Map(references.filter((row) => row.enterprise_document_id).map((row) => [row.enterprise_document_id, enterpriseById.get(row.enterprise_document_id) || enterpriseByLegacy.get(row.legacy_document_id)])).values()].filter(Boolean);
  const legacyDocuments = [...new Map(references.filter((row) => row.legacy_document_id).map((row) => [row.legacy_document_id, legacyById.get(row.legacy_document_id)])).values()].filter(Boolean);
  return { work_program_evidence: workEvidence.rows, vendor_invoice_evidence: vendorInvoices.rows, ap_intake_evidence: apIntake.rows, bank_statement_imports: bankImports.rows, document_references: references, enterprise_documents: enterpriseDocuments, legacy_documents: legacyDocuments };
}

async function addBankStatementSourceFiles(zip, imports = []) {
  const included = [];
  for (const row of imports.filter((entry) => text(entry.source_file_url))) {
    const url = text(row.source_file_url, 4000);
    if (!/^https?:\/\//i.test(url)) throw new Error(`Bank statement ${row.statement_number || row.id} has an unsupported source file reference`);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Unable to freeze bank statement source ${row.statement_number || row.id}: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const extension = contentType.includes("pdf") ? ".pdf" : contentType.includes("csv") ? ".csv" : contentType.includes("spreadsheet") || contentType.includes("excel") ? ".xlsx" : ".bin";
    const filename = safeName(`statement-${row.statement_number || row.id}${extension}`, `statement-${row.id}${extension}`);
    zip.file(`bank-source-files/${row.id}/${filename}`, buffer, { binary: true, date: fixedZipDate });
    included.push({ statement_import_id: row.id, statement_number: row.statement_number || null, filename, checksum_sha256: sha256(buffer), file_size_bytes: buffer.length, mime_type: contentType });
  }
  return included;
}

async function addEnterpriseSupportingFiles(zip, documents = []) {
  const included = [];
  for (const document of documents) {
    if (!document?.storage_path) throw new Error(`Controlled supporting document ${document?.id || "unknown"} has no storage path`);
    const { data, error } = await supabaseAdmin.storage.from("documents").download(document.storage_path);
    if (error) throw new Error(`Unable to freeze controlled supporting document ${document.id}: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const actualChecksum = sha256(buffer);
    if (document.checksum_sha256 && actualChecksum !== document.checksum_sha256) throw new Error(`Supporting document checksum mismatch: ${document.document_name || document.id}`);
    const filename = safeName(document.document_name || document.id, document.id);
    zip.file(`supporting-documents/${document.id}/${filename}`, buffer, { binary: true, date: fixedZipDate });
    included.push({ id: document.id, name: document.document_name, version_number: document.version_number, checksum_sha256: actualChecksum, mime_type: document.mime_type, file_size_bytes: buffer.length, classification: document.classification });
  }
  return included;
}

async function buildAuditorSource({ organizationId, entityId, periodId, readiness = null }) {
  const gate = readiness || await getFinanceAuditorPackageReadiness({ organizationId, entityId, periodId });
  if (!gate.ready) { const error = new Error("AUDITOR_PACKAGE_NOT_READY"); error.code = "AUDITOR_PACKAGE_NOT_READY"; error.blockers = gate.blockers; throw error; }
  const reports = await buildCanonicalReports({ organizationId, entityId, periodId, period: gate.period });
  const supporting = await loadSupportingEvidence({ organizationId, entityId, periodId, period: gate.period });
  const reportDigests = Object.fromEntries(Object.entries(reports).map(([key, value]) => [key, digest(value)]));
  const evidenceIndex = {
    references: supporting.document_references,
    enterprise_documents: supporting.enterprise_documents.map((row) => ({ id: row.id, source_organization_document_id: row.source_organization_document_id, name: row.document_name, type: row.document_type, status: row.document_status, version_number: row.version_number, checksum_sha256: row.checksum_sha256, mime_type: row.mime_type, file_size_bytes: row.file_size_bytes, classification: row.classification })),
    legacy_documents: supporting.legacy_documents.map((row) => ({ id: row.id, file_name: row.file_name, mime_type: row.mime_type, status: row.status, has_file_url: Boolean(row.file_url) })),
    bank_statement_sources: supporting.bank_statement_imports.map((row) => ({ id: row.id, statement_number: row.statement_number, source_file_present: Boolean(row.source_file_url), import_reference: row.import_reference || null })),
  };
  const sourceCore = {
    contract: PACKAGE_CONTRACT,
    scope: gate.close_snapshot.scope,
    close_run_id: gate.close_run.id,
    close_type: gate.close_run.close_type,
    close_fingerprint_digest: gate.freshness.current_fingerprint.digest,
    close_fingerprint_sections: gate.freshness.current_fingerprint.sections,
    report_digests: reportDigests,
    supporting_evidence_digest: digest({
      index: evidenceIndex,
      work_program_evidence: supporting.work_program_evidence,
      vendor_invoice_evidence: supporting.vendor_invoice_evidence,
      ap_intake_evidence: supporting.ap_intake_evidence,
      bank_statement_imports: supporting.bank_statement_imports,
    }),
  };
  return { gate, reports, supporting, evidenceIndex, sourceCore, source_digest: digest(sourceCore) };
}

async function nextPackageVersion({ organizationId, entityId, periodId }) {
  const { data, error } = await supabaseAdmin.from("finance_auditor_packages").select("package_version")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("period_id", periodId)
    .order("package_version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return Number(data?.package_version || 0) + 1;
}

export async function generateFinanceAuditorPackage({ organizationId, entityId, periodId, actor = null } = {}) {
  const readiness = await getFinanceAuditorPackageReadiness({ organizationId, entityId, periodId });
  const source = await buildAuditorSource({ organizationId, entityId, periodId, readiness });

  const zip = new JSZip();
  addJson(zip, "close/close-freshness.json", { state: source.gate.freshness.state, reason: source.gate.freshness.reason, current_fingerprint: source.gate.freshness.current_fingerprint, stored_fingerprint: source.gate.freshness.stored_fingerprint });
  addJson(zip, "close/close-snapshot.json", source.gate.close_snapshot);
  addJson(zip, "ledger/general-ledger.json", source.gate.close_snapshot.sections.ledger);
  addText(zip, "ledger/general-ledger.csv", csv(source.gate.close_snapshot.sections.ledger));
  addJson(zip, "ledger/journals.json", source.gate.close_snapshot.sections.journals);
  addText(zip, "ledger/journals.csv", csv(source.gate.close_snapshot.sections.journals));
  addJson(zip, "reports/trial-balance.json", source.reports.trial_balance);
  addText(zip, "reports/trial-balance.csv", csv(source.reports.trial_balance.rows || []));
  addJson(zip, "reports/profit-and-loss.json", source.reports.profit_loss);
  addJson(zip, "reports/balance-sheet.json", source.reports.balance_sheet);
  addJson(zip, "reports/cash-flow.json", source.reports.cash_flow);
  addJson(zip, "controls/close-steps.json", source.gate.close_snapshot.sections.close_steps);
  addJson(zip, "controls/bank-reconciliations.json", source.gate.close_snapshot.sections.reconciliations);
  addJson(zip, "controls/tax-and-statutory.json", source.gate.close_snapshot.sections.tax_and_statutory);
  addJson(zip, "controls/close-adjustments.json", source.gate.close_snapshot.sections.close_adjustments);
  addJson(zip, "controls/review-and-approval.json", source.gate.close_snapshot.sections.review_and_approval);
  addJson(zip, "evidence/work-program-evidence.json", source.supporting.work_program_evidence);
  addJson(zip, "evidence/vendor-invoice-evidence.json", source.supporting.vendor_invoice_evidence);
  addJson(zip, "evidence/ap-intake-evidence.json", source.supporting.ap_intake_evidence);
  addJson(zip, "evidence/bank-statement-imports.json", source.supporting.bank_statement_imports);
  addJson(zip, "evidence/supporting-document-index.json", source.evidenceIndex);
  const [includedDocuments, includedBankSources] = await Promise.all([
    addEnterpriseSupportingFiles(zip, source.supporting.enterprise_documents),
    addBankStatementSourceFiles(zip, source.supporting.bank_statement_imports),
  ]);
  const unresolvedLegacyCount = source.supporting.legacy_documents.filter((legacy) => !source.supporting.enterprise_documents.some((doc) => doc.source_organization_document_id === legacy.id)).length;
  const frozenEvidence = {
    controlled_documents: includedDocuments.map((row) => ({ id: row.id, version_number: row.version_number, checksum_sha256: row.checksum_sha256, file_size_bytes: row.file_size_bytes })),
    bank_source_files: includedBankSources.map((row) => ({ statement_import_id: row.statement_import_id, checksum_sha256: row.checksum_sha256, file_size_bytes: row.file_size_bytes })),
  };
  const finalSourceCore = { ...source.sourceCore, frozen_file_digest: digest(frozenEvidence) };
  const packageDigest = digest(finalSourceCore);

  const existing = await supabaseAdmin.from("finance_auditor_packages").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("period_id", periodId).eq("package_digest", packageDigest).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { success: true, replay: true, package: existing.data, readiness };

  const packageId = randomUUID();
  const packageVersion = await nextPackageVersion({ organizationId, entityId, periodId });
  const manifest = {
    contract: PACKAGE_CONTRACT,
    package_id: packageId,
    package_version: packageVersion,
    package_digest: packageDigest,
    scope: source.gate.close_snapshot.scope,
    period: { id: source.gate.period.id, name: source.gate.period.period_name || source.gate.period.name || null, start_date: source.gate.period.start_date, end_date: source.gate.period.end_date, status: source.gate.period.status },
    close: { run_id: source.gate.close_run.id, close_type: source.gate.close_run.close_type, closed_at: source.gate.close_run.closed_at, fingerprint_digest: source.gate.freshness.current_fingerprint.digest },
    source_digest: packageDigest,
    report_digests: source.sourceCore.report_digests,
    supporting_evidence_digest: source.sourceCore.supporting_evidence_digest,
    frozen_file_digest: finalSourceCore.frozen_file_digest,
    population: source.gate.close_snapshot.population,
    generated_at: now(),
    immutable_snapshot: true,
    mutation_authority: false,
    included_controlled_documents: includedDocuments,
    included_controlled_document_count: includedDocuments.length,
    legacy_document_reference_count: source.supporting.legacy_documents.length,
    unresolved_legacy_document_reference_count: unresolvedLegacyCount,
    included_bank_source_files: includedBankSources,
    bank_source_reference_count: source.supporting.bank_statement_imports.filter((row) => row.source_file_url).length,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2), { date: fixedZipDate });
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" });
  const filename = `auditor-package-${String(source.gate.period.start_date).slice(0, 10)}-${String(source.gate.period.end_date).slice(0, 10)}-v${packageVersion}.zip`;
  const file = new File([zipBuffer], filename, { type: "application/zip" });
  const document = await createControlledDocument({
    organizationId, entityId, actor, file,
    documentName: `Auditor Package ${source.gate.period.period_name || source.gate.period.name || String(source.gate.period.end_date).slice(0, 10)} v${packageVersion}`,
    documentType: "FINANCE_AUDITOR_PACKAGE",
    classification: "RESTRICTED",
    referenceType: "finance_auditor_package",
    referenceId: packageId,
    tags: ["finance", "auditor-package", "close-evidence", `period-${periodId}`],
    metadata: { contract: PACKAGE_CONTRACT, package_id: packageId, package_version: packageVersion, package_digest: packageDigest, close_fingerprint_digest: source.gate.freshness.current_fingerprint.digest, frozen_file_digest: finalSourceCore.frozen_file_digest, immutable_snapshot: true, mutation_authority: false },
  });
  const controlledDocumentId = document?.id || document?.document?.id || null;
  if (!controlledDocumentId) throw new Error("Auditor package controlled document id missing");
  const { data: packageRow, error } = await supabaseAdmin.from("finance_auditor_packages").insert({
    id: packageId, organization_id: organizationId, entity_id: entityId, period_id: periodId, package_version: packageVersion,
    close_run_id: source.gate.close_run.id, close_type: source.gate.close_run.close_type,
    close_fingerprint_digest: source.gate.freshness.current_fingerprint.digest, package_digest: packageDigest,
    controlled_document_id: controlledDocumentId, status: "GENERATED", manifest, generated_by: actorStaffId(actor), generated_at: now(),
  }).select("*").single();
  if (error) throw error;
  return { success: true, replay: false, package: packageRow, readiness, controlled_document: document };
}

export async function listFinanceAuditorPackages({ organizationId, entityId, periodId } = {}) {
  if (!organizationId || !entityId) return [];
  let query = supabaseAdmin.from("finance_auditor_packages").select("*,finance_auditor_package_grants(id,auditor_name,auditor_email,issued_at,expires_at,revoked_at,last_viewed_at,last_downloaded_at,download_count)")
    .eq("organization_id", organizationId).eq("entity_id", entityId).order("package_version", { ascending: false });
  if (periodId) query = query.eq("period_id", periodId);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

export async function getFinanceAuditorPackageDownload({ organizationId, packageId } = {}) {
  const { data, error } = await supabaseAdmin.from("finance_auditor_packages").select("id,organization_id,status,controlled_document_id").eq("organization_id", organizationId).eq("id", packageId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "GENERATED") throw new Error("Auditor package is not available");
  return createDocumentSignedUrl({ organizationId, documentId: data.controlled_document_id, expiresIn: 300 });
}

export async function issueFinanceAuditorPackageGrant({ organizationId, entityId, packageId, auditorName = null, auditorEmail, issuedBy = null, ttlDays = 30 } = {}) {
  const email = text(auditorEmail, 320).toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Valid auditor email required");
  const { data: packageRow, error } = await supabaseAdmin.from("finance_auditor_packages").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", packageId).eq("status", "GENERATED").maybeSingle();
  if (error) throw error;
  if (!packageRow) throw new Error("Auditor package not found");
  const readiness = await getFinanceAuditorPackageReadiness({ organizationId, entityId, periodId: packageRow.period_id });
  if (!readiness.ready || readiness.freshness?.current_fingerprint?.digest !== packageRow.close_fingerprint_digest) throw new Error("Auditor package is stale; generate a current package before sharing it");
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const days = Math.max(1, Math.min(Number(ttlDays) || 30, 90));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const { data: grant, error: insertError } = await supabaseAdmin.from("finance_auditor_package_grants").insert({
    package_id: packageId, organization_id: organizationId, entity_id: entityId, auditor_name: text(auditorName, 240) || null,
    auditor_email: email, token_hash: tokenHash, issued_by: issuedBy || null, issued_at: now(), expires_at: expiresAt,
    metadata: { contract: "AVANTIQO_AUDITOR_PACKAGE_GRANT_V1", read_only: true, exact_package_only: true, erp_access: false, mutation_authority: false },
  }).select("*").single();
  if (insertError) throw insertError;
  return { grant, token, expires_at: expiresAt, token_returned_once: true };
}

export async function revokeFinanceAuditorPackageGrant({ organizationId, grantId, revokedBy = null, reason = "STAFF_REVOKED" } = {}) {
  const stamp = now();
  const { data, error } = await supabaseAdmin.from("finance_auditor_package_grants").update({ revoked_by: revokedBy || null, revoked_at: stamp, revoke_reason: text(reason, 500) || "STAFF_REVOKED" }).eq("organization_id", organizationId).eq("id", grantId).is("revoked_at", null).select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function resolvePublicFinanceAuditorPackageGrant(token, { markViewed = false, markDownloaded = false } = {}) {
  const raw = text(token, 500);
  if (!raw) return null;
  const tokenHash = sha256(raw);
  const { data: grant, error } = await supabaseAdmin.from("finance_auditor_package_grants").select("*").eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", now()).maybeSingle();
  if (error) throw error;
  if (!grant) return null;
  const { data: packageRow, error: packageError } = await supabaseAdmin.from("finance_auditor_packages").select("*").eq("id", grant.package_id).eq("organization_id", grant.organization_id).eq("entity_id", grant.entity_id).eq("status", "GENERATED").maybeSingle();
  if (packageError) throw packageError;
  if (!packageRow) return null;
  const patch = {};
  if (markViewed) patch.last_viewed_at = now();
  if (markDownloaded) { patch.last_downloaded_at = now(); patch.download_count = Number(grant.download_count || 0) + 1; }
  if (Object.keys(patch).length) await supabaseAdmin.from("finance_auditor_package_grants").update(patch).eq("id", grant.id);
  return { grant: { ...grant, ...patch }, package: packageRow };
}

export async function getPublicFinanceAuditorPackageDownload(token) {
  const resolved = await resolvePublicFinanceAuditorPackageGrant(token, { markDownloaded: true });
  if (!resolved) return null;
  const signed = await createDocumentSignedUrl({ organizationId: resolved.package.organization_id, documentId: resolved.package.controlled_document_id, expiresIn: 300 });
  return { ...resolved, signed_url: signed.url, expires_in: signed.expires_in };
}
