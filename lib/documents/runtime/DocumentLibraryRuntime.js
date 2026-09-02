import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PENDING_APPROVAL_STATUSES = new Set([
  "pending",
  "requested",
  "open",
  "in_review",
  "under_review",
]);
const CLOSED_DELIVERY_STATUSES = new Set([
  "sent",
  "delivered",
  "complete",
  "completed",
]);
const CLOSED_DOCUMENT_STATUSES = new Set([
  "archived",
  "cancelled",
  "deleted",
  "disposed",
  "obsolete",
  "superseded",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isMissingRelation(error) {
  const code = clean(error?.code).toUpperCase();
  const message = clean(error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the column")
  );
}

async function safeSource(source, task, fallback = [], { optional = false } = {}) {
  try {
    const data = await task();
    return { source, status: "connected", data, error: null };
  } catch (error) {
    if (optional && isMissingRelation(error)) {
      return { source, status: "not_ready", data: fallback, error: null };
    }
    console.error("DOCUMENT_LIBRARY_SOURCE_FAILED", { source, error });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

function normalizeControlledDocument(row = {}) {
  const metadata = metadataObject(row.metadata);
  return {
    id: row.id,
    source: "controlled",
    organization_id: row.organization_id || null,
    entity_id: row.entity_id || metadata.entity_id || null,
    name: row.document_name || metadata.title || "Document",
    document_number: row.document_number || metadata.document_number || null,
    document_type: row.document_type || metadata.document_type || "file",
    status: row.document_status || "draft",
    classification: row.classification || metadata.classification || "INTERNAL",
    mime_type: row.mime_type || metadata.mime_type || null,
    size_bytes: numeric(row.file_size_bytes || metadata.file_size_bytes),
    version_number: numeric(row.version_number || metadata.version_number || 1),
    storage_path: row.storage_path || metadata.storage_path || null,
    file_url: null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || row.created_at || null,
    created_by: row.created_by || null,
    owner_staff_id: row.owner_staff_id || metadata.owner_staff_id || null,
    approved_by: row.approved_by || null,
    approved_at: row.approved_at || null,
    approval_required: Boolean(metadata.approval_required),
    financial_impact: Boolean(metadata.financial_impact),
    reference_type: row.reference_table || metadata.reference_type || null,
    reference_id: row.reference_id || metadata.reference_id || null,
    effective_date: row.effective_date || metadata.effective_date || null,
    expiry_date: row.expiry_date || metadata.expiry_date || null,
    review_due_at: row.review_due_at || metadata.review_due_at || null,
    retention_until: row.retention_until || metadata.retention_until || null,
    legal_hold: Boolean(row.legal_hold || metadata.legal_hold),
    tags: Array.isArray(row.tags)
      ? row.tags
      : Array.isArray(metadata.tags)
        ? metadata.tags
        : [],
    checksum_sha256: row.checksum_sha256 || metadata.checksum_sha256 || null,
    metadata,
  };
}

function normalizeIntakeDocument(row = {}) {
  return {
    id: row.id,
    source: "intake",
    organization_id: row.organization_id || null,
    entity_id: row.entity_id || null,
    name: row.file_name || "Uploaded document",
    document_number: null,
    document_type: row.ai_type || "file",
    status: row.status || "uploaded",
    classification: row.ai_module || null,
    mime_type: row.mime_type || null,
    size_bytes: 0,
    version_number: 1,
    storage_path: null,
    file_url: row.file_url || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || row.created_at || null,
    created_by: row.uploaded_by || null,
    owner_staff_id: null,
    approved_by: row.approved_by || null,
    approved_at: row.approved_at || null,
    approval_required: row.approval_required === true,
    financial_impact: row.financial_impact === true,
    reference_type: row.destination_module || null,
    reference_id: row.destination_record_id || null,
    effective_date: null,
    expiry_date: null,
    review_due_at: null,
    retention_until: null,
    legal_hold: false,
    tags: [],
    checksum_sha256: null,
    metadata: {
      ai_module: row.ai_module || null,
      ai_type: row.ai_type || null,
      destination_module: row.destination_module || null,
      destination_record_id: row.destination_record_id || null,
    },
  };
}

function matchesEntity(document, entityId) {
  if (!entityId) return true;
  if (!document.entity_id) return true;
  return document.entity_id === entityId;
}

function matchesSearch(document, query) {
  const needle = clean(query).toLowerCase();
  if (!needle) return true;
  const haystack = [
    document.name,
    document.document_number,
    document.document_type,
    document.status,
    document.classification,
    document.reference_type,
    ...(document.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export async function loadDocumentLibrary({
  organizationId,
  entityId = null,
  query = "",
  status = "",
  type = "",
  source = "",
  limit = 500,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 5000));

  const [controlledSource, intakeSource] = await Promise.all([
    safeSource("enterprise_documents", async () => {
      const { data, error } = await supabaseAdmin
        .from("enterprise_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(boundedLimit);
      if (error) throw error;
      return data || [];
    }),
    safeSource("organization_documents", async () => {
      const { data, error } = await supabaseAdmin
        .from("organization_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(boundedLimit);
      if (error) throw error;
      return data || [];
    }),
  ]);

  const documents = [
    ...(controlledSource.data || []).map(normalizeControlledDocument),
    ...(intakeSource.data || []).map(normalizeIntakeDocument),
  ]
    .filter((document) => matchesEntity(document, entityId))
    .filter((document) => !source || normalized(document.source) === normalized(source))
    .filter((document) => !status || normalized(document.status) === normalized(status))
    .filter((document) => !type || normalized(document.document_type) === normalized(type))
    .filter((document) => matchesSearch(document, query))
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
    .slice(0, boundedLimit);

  return {
    documents,
    count: documents.length,
    sources: {
      enterprise_documents: {
        status: controlledSource.status,
        error: controlledSource.error,
      },
      organization_documents: {
        status: intakeSource.status,
        error: intakeSource.error,
      },
    },
  };
}

function dueWithin(value, today, days) {
  const date = dateOnly(value);
  if (!date) return false;
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const target = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target)) return false;
  const delta = Math.round((target - start) / 86400000);
  return delta >= 0 && delta <= days;
}

function overdue(value, today) {
  const date = dateOnly(value);
  return Boolean(date && date < today);
}

export async function loadDocumentCommandCenter({
  organizationId,
  entityId = null,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const library = await loadDocumentLibrary({
    organizationId,
    entityId,
    limit: 5000,
  });

  const [
    versionsSource,
    accessSource,
    templatesSource,
    approvalsSource,
    deliveriesSource,
    linksSource,
    signaturesSource,
    retentionSource,
  ] = await Promise.all([
    safeSource("enterprise_document_versions", async () => {
      const { data, error } = await supabaseAdmin
        .from("enterprise_document_versions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    }),
    safeSource("enterprise_document_access_logs", async () => {
      const { data, error } = await supabaseAdmin
        .from("enterprise_document_access_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("accessed_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data || [];
    }),
    safeSource("document_templates", async () => {
      let query = supabaseAdmin
        .from("document_templates")
        .select("*")
        .eq("organization_id", organizationId);
      if (entityId) query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    }),
    safeSource("approval_requests", async () => {
      const { data, error } = await supabaseAdmin
        .from("approval_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("reference_table", "enterprise_documents")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    }),
    safeSource("customer_document_deliveries", async () => {
      let query = supabaseAdmin
        .from("customer_document_deliveries")
        .select("*")
        .eq("organization_id", organizationId);
      if (entityId) query = query.eq("entity_id", entityId);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    }),
    safeSource("enterprise_document_links", async () => {
      const { data, error } = await supabaseAdmin
        .from("enterprise_document_links")
        .select("*")
        .eq("organization_id", organizationId)
        .limit(5000);
      if (error) throw error;
      return data || [];
    }, [], { optional: true }),
    safeSource("document_signature_requests", async () => {
      const { data, error } = await supabaseAdmin
        .from("document_signature_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    }, [], { optional: true }),
    safeSource("document_retention_policies", async () => {
      const { data, error } = await supabaseAdmin
        .from("document_retention_policies")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .limit(500);
      if (error) throw error;
      return data || [];
    }, [], { optional: true }),
  ]);

  const documents = library.documents || [];
  const controlled = documents.filter((row) => row.source === "controlled");
  const intake = documents.filter((row) => row.source === "intake");
  const unclassified = intake.filter(
    (row) => normalized(row.status) === "uploaded" || !clean(row.classification),
  );
  const intakeApprovalRequired = intake.filter(
    (row) => row.approval_required && !row.approved_at,
  );
  const approvalRequests = (approvalsSource.data || []).filter((row) =>
    PENDING_APPROVAL_STATUSES.has(normalized(row.status)),
  );
  const controlledReview = controlled.filter((row) =>
    ["draft", "review", "in_review", "under_review", "pending_approval"].includes(normalized(row.status)),
  );
  const expiring = controlled.filter(
    (row) => !CLOSED_DOCUMENT_STATUSES.has(normalized(row.status)) && dueWithin(row.expiry_date, today, 30),
  );
  const expired = controlled.filter(
    (row) => !CLOSED_DOCUMENT_STATUSES.has(normalized(row.status)) && overdue(row.expiry_date, today),
  );
  const reviewsDue = controlled.filter(
    (row) => !CLOSED_DOCUMENT_STATUSES.has(normalized(row.status)) && (overdue(row.review_due_at, today) || dueWithin(row.review_due_at, today, 14)),
  );
  const retentionDue = controlled.filter(
    (row) => !row.legal_hold && row.retention_until && (overdue(row.retention_until, today) || dueWithin(row.retention_until, today, 30)),
  );
  const legalHolds = controlled.filter((row) => row.legal_hold);
  const signatures = signaturesSource.data || [];
  const pendingSignatures = signatures.filter((row) =>
    !["signed", "complete", "completed", "declined", "cancelled", "expired"].includes(normalized(row.status)),
  );
  const deliveries = deliveriesSource.data || [];
  const failedDeliveries = deliveries.filter((row) =>
    normalized(row.status) === "failed" || Boolean(row.error_message),
  );
  const openDeliveries = deliveries.filter(
    (row) => !CLOSED_DELIVERY_STATUSES.has(normalized(row.status)) && normalized(row.status) !== "failed",
  );
  const templates = templatesSource.data || [];
  const activeTemplates = templates.filter((row) => !["archived", "inactive"].includes(normalized(row.status)));

  const queue = [];

  unclassified.slice(0, 6).forEach((row) => {
    queue.push({
      id: `intake:${row.id}`,
      kind: "intake",
      priority: "attention",
      title: row.name,
      detail: "Uploaded file needs classification and filing",
      status: "Classify",
      href: "/documents/intake",
    });
  });

  intakeApprovalRequired.slice(0, 8).forEach((row) => {
    queue.push({
      id: `intake-approval:${row.id}`,
      kind: "approval",
      priority: "attention",
      title: row.name,
      detail: [row.classification, row.document_type, row.financial_impact ? "Financial impact" : null]
        .filter(Boolean)
        .join(" · "),
      status: "Approval required",
      href: "/documents/approvals",
    });
  });

  approvalRequests.slice(0, 8).forEach((row) => {
    const document = controlled.find((candidate) => candidate.id === row.reference_id);
    queue.push({
      id: `approval:${row.id}`,
      kind: "approval",
      priority: "attention",
      title: document?.name || "Controlled document approval",
      detail: `Approval workflow · Step ${numeric(row.current_step) || 1}`,
      status: row.status || "Pending",
      href: "/documents/approvals",
    });
  });

  expired.slice(0, 5).forEach((row) => {
    queue.push({
      id: `expired:${row.id}`,
      kind: "contract",
      priority: "attention",
      title: row.name,
      detail: `Expired ${dateOnly(row.expiry_date)}`,
      status: "Expired",
      href: "/documents/contracts",
    });
  });

  expiring.slice(0, 5).forEach((row) => {
    queue.push({
      id: `expiring:${row.id}`,
      kind: "contract",
      priority: "review",
      title: row.name,
      detail: `Expires ${dateOnly(row.expiry_date)}`,
      status: "Review renewal",
      href: "/documents/contracts",
    });
  });

  reviewsDue.slice(0, 5).forEach((row) => {
    queue.push({
      id: `review:${row.id}`,
      kind: "review",
      priority: overdue(row.review_due_at, today) ? "attention" : "review",
      title: row.name,
      detail: `Review due ${dateOnly(row.review_due_at)}`,
      status: "Document review",
      href: "/documents/library",
    });
  });

  retentionDue.slice(0, 5).forEach((row) => {
    queue.push({
      id: `retention:${row.id}`,
      kind: "records",
      priority: "review",
      title: row.name,
      detail: `Retention disposition ${dateOnly(row.retention_until)}`,
      status: "Disposition review",
      href: "/documents/records",
    });
  });

  pendingSignatures.slice(0, 5).forEach((row) => {
    const document = controlled.find((candidate) => candidate.id === row.enterprise_document_id);
    queue.push({
      id: `signature:${row.id}`,
      kind: "signature",
      priority: "review",
      title: document?.name || "Signature request",
      detail: row.signer_name || row.signer_email || "Signature pending",
      status: titleCase(row.status || "Pending"),
      href: "/documents/approvals",
    });
  });

  failedDeliveries.slice(0, 5).forEach((row) => {
    queue.push({
      id: `delivery:${row.id}`,
      kind: "delivery",
      priority: "attention",
      title: row.subject || titleCase(row.document_type || "Document delivery"),
      detail: row.error_message || `Delivery to ${row.recipient || "recipient"} failed`,
      status: "Retry delivery",
      href: "/documents/activity",
    });
  });

  const recent = documents.slice(0, 12);
  const sources = {
    ...library.sources,
    enterprise_document_versions: { status: versionsSource.status, error: versionsSource.error },
    enterprise_document_access_logs: { status: accessSource.status, error: accessSource.error },
    document_templates: { status: templatesSource.status, error: templatesSource.error },
    approval_requests: { status: approvalsSource.status, error: approvalsSource.error },
    customer_document_deliveries: { status: deliveriesSource.status, error: deliveriesSource.error },
    enterprise_document_links: { status: linksSource.status, error: linksSource.error },
    document_signature_requests: { status: signaturesSource.status, error: signaturesSource.error },
    document_retention_policies: { status: retentionSource.status, error: retentionSource.error },
  };

  return {
    metrics: {
      files: {
        total: documents.length,
        controlled: controlled.length,
        intake: intake.length,
      },
      inbox: {
        unclassified: unclassified.length,
        approval_required: intakeApprovalRequired.length,
        total_attention: unclassified.length + intakeApprovalRequired.length,
      },
      approvals: {
        pending: approvalRequests.length + intakeApprovalRequired.length + controlledReview.length,
        workflow: approvalRequests.length,
        controlled_review: controlledReview.length,
      },
      versions: {
        total: (versionsSource.data || []).length,
      },
      templates: {
        active: activeTemplates.length,
        total: templates.length,
      },
      contracts: {
        expiring_30d: expiring.length,
        expired: expired.length,
      },
      records: {
        retention_due: retentionDue.length,
        legal_holds: legalHolds.length,
        policies: (retentionSource.data || []).length,
      },
      signatures: {
        pending: pendingSignatures.length,
        total: signatures.length,
      },
      distribution: {
        open: openDeliveries.length,
        failed: failedDeliveries.length,
        total: deliveries.length,
      },
      links: {
        total: (linksSource.data || []).length,
      },
    },
    queue: queue.slice(0, 24),
    recent,
    sources,
  };
}

export async function loadDocumentDetail({ organizationId, documentId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!documentId) throw new Error("documentId required");

  const { data: document, error } = await supabaseAdmin
    .from("enterprise_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!document) return null;

  const [versionsSource, accessSource, linksSource, signaturesSource, approvalsSource] = await Promise.all([
    safeSource("enterprise_document_versions", async () => {
      const { data, error: versionsError } = await supabaseAdmin
        .from("enterprise_document_versions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("enterprise_document_id", documentId)
        .order("version_number", { ascending: false })
        .limit(500);
      if (versionsError) throw versionsError;
      return data || [];
    }),
    safeSource("enterprise_document_access_logs", async () => {
      const { data, error: accessError } = await supabaseAdmin
        .from("enterprise_document_access_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("enterprise_document_id", documentId)
        .order("accessed_at", { ascending: false })
        .limit(250);
      if (accessError) throw accessError;
      return data || [];
    }),
    safeSource("enterprise_document_links", async () => {
      const { data, error: linksError } = await supabaseAdmin
        .from("enterprise_document_links")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("enterprise_document_id", documentId)
        .limit(500);
      if (linksError) throw linksError;
      return data || [];
    }, [], { optional: true }),
    safeSource("document_signature_requests", async () => {
      const { data, error: signaturesError } = await supabaseAdmin
        .from("document_signature_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("enterprise_document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (signaturesError) throw signaturesError;
      return data || [];
    }, [], { optional: true }),
    safeSource("approval_requests", async () => {
      const { data, error: approvalsError } = await supabaseAdmin
        .from("approval_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("reference_table", "enterprise_documents")
        .eq("reference_id", documentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (approvalsError) throw approvalsError;
      return data || [];
    }),
  ]);

  return {
    document: normalizeControlledDocument(document),
    versions: versionsSource.data || [],
    access: accessSource.data || [],
    links: linksSource.data || [],
    signatures: signaturesSource.data || [],
    approvals: approvalsSource.data || [],
    sources: Object.fromEntries(
      [versionsSource, accessSource, linksSource, signaturesSource, approvalsSource].map((source) => [
        source.source,
        { status: source.status, error: source.error },
      ]),
    ),
  };
}

export async function recordDocumentAccess({
  organizationId,
  documentId,
  actorId = null,
  accessType = "VIEW",
  metadata = {},
} = {}) {
  if (!organizationId || !documentId) return null;
  const { data, error } = await supabaseAdmin
    .from("enterprise_document_access_logs")
    .insert({
      organization_id: organizationId,
      enterprise_document_id: documentId,
      accessed_by: actorId || null,
      access_type: clean(accessType).toUpperCase() || "VIEW",
      metadata: metadataObject(metadata),
      accessed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
