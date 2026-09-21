export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { createControlledDocument, createDocumentSignedUrl, updateControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assertStaffUploadSignature } from "@/lib/people/security/StaffUploadSecurity";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";
import { routeAnalyzedAttachment } from "@/lib/platform/runtime/UniversalAttachmentRoutingRuntime";
import { matchAnalyzedAttachmentToBusiness } from "@/lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const ROUTING_DESTINATIONS = Object.freeze({
  ACCOUNTING: { domain: "FINANCE", label: "Accounting", reviewerRole: "ACCOUNTING" },
  MANAGER: { domain: "PEOPLE", label: "Manager", reviewerRole: "MANAGER" },
  HOUSEKEEPING: { domain: "OPERATIONS", label: "Housekeeping", reviewerRole: "HOUSEKEEPING" },
  FRONT_DESK: { domain: "OPERATIONS", label: "Front Desk", reviewerRole: "FRONT_DESK" },
  MAINTENANCE: { domain: "OPERATIONS", label: "Maintenance", reviewerRole: "MAINTENANCE" },
  PEOPLE: { domain: "PEOPLE", label: "People / HR", reviewerRole: "PEOPLE" },
  SUPPLY_CHAIN: { domain: "SUPPLY_CHAIN", label: "Supply Chain", reviewerRole: "SUPPLY_CHAIN" },
  FIELD_SERVICE: { domain: "OPERATIONS", label: "Field Service", reviewerRole: "FIELD_SERVICE" },
  COMMERCIAL: { domain: "COMMERCIAL", label: "Commercial", reviewerRole: "COMMERCIAL" },
  PROJECTS: { domain: "PROJECTS", label: "Projects", reviewerRole: "PROJECTS" },
  PERSONAL: { domain: "DOCUMENTS", label: "My Documents", reviewerRole: "SELF" },
  UNKNOWN: { domain: "DOCUMENTS", label: "Manager Review", reviewerRole: "MANAGER" },
});

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizedKey(value, fallback = "UNKNOWN") {
  const key = clean(value, 80).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return key || fallback;
}

function numberBetween(value, minimum = 0, maximum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function canonicalDestinationKey(universalDestination, source = {}) {
  const destination = universalDestination?.destination || {};
  const workspace = normalizedKey(destination.workspace || destination.domain_id || destination.domain || "");
  const item = normalizedKey(destination.item_id || "");
  const route = clean(destination.route, 240).toLowerCase();

  if (workspace === "FINANCE") return "ACCOUNTING";
  if (workspace === "SUPPLY_CHAIN") return "SUPPLY_CHAIN";
  if (workspace === "PEOPLE") return "PEOPLE";
  if (workspace === "COMMERCIAL") return "COMMERCIAL";
  if (workspace === "PROJECTS") return "PROJECTS";

  if (workspace === "OPERATIONS") {
    if (item.includes("HOUSEKEEP") || route.includes("housekeeping")) return "HOUSEKEEPING";
    if (item.includes("MAINTENANCE") || route.includes("maintenance")) return "MAINTENANCE";
    if (item.includes("FRONT_DESK") || route.includes("front-desk")) return "FRONT_DESK";
    return "MANAGER";
  }

  if (workspace === "DOCUMENTS") return "PERSONAL";
  return normalizedKey(source.destination || source.destination_role || source.route_to || source.owner_team);
}

function workflowFromEvidence(source = {}) {
  const kind = [
    source.object_type,
    source.document_type,
    ...(Array.isArray(source.candidate_domains) ? source.candidate_domains : []),
  ].map((value) => clean(value, 120).toLowerCase()).join(" ");

  if (/supplier.*invoice|vendor.*invoice|vendor bill|purchase invoice/.test(kind)) return "SUPPLIER_INVOICE";
  if (/receipt|paid expense|expense/.test(kind)) return "EXPENSE_RECEIPT";
  if (/passport|national id|government id|identity/.test(kind)) return "IDENTITY_DOCUMENT";
  if (/work permit/.test(kind)) return "WORK_PERMIT";
  if (/housekeep|room clean|room inspection/.test(kind)) return "HOUSEKEEPING_EVIDENCE";
  if (/maintenance|repair|service report|equipment inspection/.test(kind)) return "MAINTENANCE_EVIDENCE";
  if (/incident|accident|safety report/.test(kind)) return "INCIDENT_REPORT";
  if (/inventory|stock count|stock evidence/.test(kind)) return "INVENTORY_EVIDENCE";
  if (/delivery note|goods receipt|receiving report/.test(kind)) return "DELIVERY_NOTE";
  if (/purchase order|purchase request|procurement/.test(kind)) return "PURCHASE_DOCUMENT";
  if (/field service|service visit|treatment report/.test(kind)) return "FIELD_SERVICE_EVIDENCE";
  if (/customer|client/.test(kind)) return "CUSTOMER_DOCUMENT";
  if (/project|drawing|specification/.test(kind)) return "PROJECT_EVIDENCE";
  return "GENERAL_DOCUMENT";
}

function normalizeRouting(classification, universalDestination = null) {
  const source = classification && typeof classification === "object" && !Array.isArray(classification) ? classification : {};
  const destinationKey = canonicalDestinationKey(universalDestination, source);
  const destination = ROUTING_DESTINATIONS[destinationKey] || ROUTING_DESTINATIONS.UNKNOWN;
  const workflow = workflowFromEvidence(source);
  const confidence = numberBetween(
    universalDestination?.evidence_classification?.confidence ?? source.routing_confidence ?? source.confidence,
    0,
    1,
  );
  const urgent = source.urgent === true || normalizedKey(source.urgency, "NORMAL") === "URGENT";
  const canonicalNeedsClarification = universalDestination?.status === "CLARIFICATION_REQUIRED";
  const needsHumanReview = canonicalNeedsClarification || source.requires_human_review !== false || confidence == null || confidence < 0.92;

  return {
    destinationKey: ROUTING_DESTINATIONS[destinationKey] ? destinationKey : "UNKNOWN",
    destinationLabel: destination.label,
    destinationDomain: destination.domain,
    reviewerRole: destination.reviewerRole,
    workflow,
    confidence,
    urgency: urgent ? "URGENT" : "NORMAL",
    requiresHumanReview: needsHumanReview,
    suggestedAction: clean(source.suggested_action || source.next_action, 240) || "Review and route this private staff upload.",
    rationale: clean(
      universalDestination?.clarification_question || source.routing_reason || source.reason,
      500,
    ) || null,
    state: needsHumanReview ? "ROUTED_FOR_REVIEW" : "CLASSIFIED_FOR_REVIEW",
    autoMutationAllowed: false,
    routingAuthority: universalDestination?.status === "DESTINATION_RESOLVED"
      ? "ERP_REGISTRY"
      : "STAFF_CLASSIFIER_FALLBACK",
  };
}

async function fileChecksum(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

async function findExistingStaffCapture({ organizationId, staffId, checksum }) {
  if (!organizationId || !staffId || !checksum) return null;
  const documentResult = await supabaseAdmin
    .from("enterprise_documents")
    .select("id,entity_id,metadata,checksum_sha256,created_at")
    .eq("organization_id", organizationId)
    .eq("owner_staff_id", staffId)
    .eq("document_type", "STAFF_CAPTURE")
    .eq("checksum_sha256", checksum)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (documentResult.error) throw documentResult.error;
  if (!documentResult.data?.id) return null;

  const assignmentResult = await supabaseAdmin
    .from("staff_intake_assignments")
    .select("id,destination_key,destination_domain,reviewer_role,workflow,confidence,urgency,requires_human_review,suggested_action,rationale,universal_destination,business_match,handoff_status,status")
    .eq("organization_id", organizationId)
    .eq("enterprise_document_id", documentResult.data.id)
    .maybeSingle();
  if (assignmentResult.error) throw assignmentResult.error;
  if (!assignmentResult.data) return null;

  const classification = documentResult.data.metadata?.staff_capture_classification?.result || null;
  return {
    document: documentResult.data,
    assignment: assignmentResult.data,
    classification,
  };
}

function publicRoutingFromAssignment(assignment = {}) {
  const destinationKey = normalizedKey(assignment.destination_key, "UNKNOWN");
  const destination = ROUTING_DESTINATIONS[destinationKey] || ROUTING_DESTINATIONS.UNKNOWN;
  return {
    destinationLabel: destination.label,
    workflow: normalizedKey(assignment.workflow, "GENERAL_DOCUMENT"),
  };
}

function publicRoutingSummary(routing = {}) {
  return {
    destinationLabel: clean(routing.destinationLabel, 120) || "Manager Review",
    workflow: normalizedKey(routing.workflow, "GENERAL_DOCUMENT"),
  };
}

async function currentEntityId({ organizationId, staffId }) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await supabaseAdmin.from("employee_employment_assignments")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffId)
    .eq("status", "ACTIVE")
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(2);
  if (result.error) throw result.error;
  return result.data?.length === 1 ? result.data[0].entity_id : null;
}

function parseClassification(execution) {
  const candidates = [
    execution?.output?.result,
    execution?.output?.output?.result,
    execution?.output?.output,
    execution?.output?.raw?.output?.result,
    execution?.output?.raw?.output,
    execution?.output?.raw?.result,
    execution?.output?.raw,
    execution?.output,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
    if (typeof candidate === "string") {
      try { return JSON.parse(candidate); } catch {}
    }
  }
  return null;
}

async function settleOwnedClassification(execution, { organizationId } = {}) {
  if (!execution?.pending) return execution;
  if (!organizationId || !execution?.provider || !execution?.provider_job_id || !execution?.usage?.id) {
    throw new Error("Owned classification pending execution is missing settlement context");
  }

  const deadline = Date.now() + 45_000;
  let settled = execution;
  while (settled?.pending && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    settled = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider: execution.provider,
      provider_job_id: execution.provider_job_id,
      usage_id: execution.usage.id,
      pricing: execution.pricing || {},
      metadata: {
        module: "STAFF_PORTAL",
        operation: "QUICK_CAMERA_CLASSIFY_SETTLE",
      },
      started_at: execution.started_at || null,
    });
  }

  if (settled?.pending) {
    const error = new Error("Owned staff document classification is still processing");
    error.code = "STAFF_CLASSIFICATION_PENDING";
    throw error;
  }
  if (settled?.failed || settled?.success === false) {
    throw new Error(settled?.error || "Owned staff document classification failed");
  }
  return settled;
}

function canonicalAttachmentFile({ classification, documentId, fileName = null, mimeType = null } = {}) {
  const evidence = classification && typeof classification === "object" ? classification : {};
  return {
    id: documentId,
    name: fileName || null,
    mime_type: mimeType || null,
    analysis: {
      status: "ANALYZED",
      confidence: Number(evidence.confidence || 0),
      candidate_domains: Array.isArray(evidence.candidate_domains) ? evidence.candidate_domains : [],
      evidence: {
        object_type: clean(evidence.object_type || evidence.document_type, 120) || null,
        document_type: clean(evidence.document_type, 120) || null,
        confidence: Number(evidence.confidence || 0),
        candidate_domains: Array.isArray(evidence.candidate_domains) ? evidence.candidate_domains : [],
        key_fields: evidence.key_fields && typeof evidence.key_fields === "object" ? evidence.key_fields : {},
        identifiers: evidence.identifiers && typeof evidence.identifiers === "object" ? evidence.identifiers : {},
        parties: Array.isArray(evidence.parties) ? evidence.parties : [],
        dates: Array.isArray(evidence.dates) ? evidence.dates : [],
        amounts: Array.isArray(evidence.amounts) ? evidence.amounts : [],
        currency: evidence.currency || null,
        clarification_required: evidence.clarification_required === true,
        clarification_question: clean(evidence.clarification_question, 500) || null,
      },
    },
  };
}

async function persistRoutingAssignment({ context, documentId, entityId, routing, universalDestination = null, businessMatch = null }) {
  const assignment = await supabaseAdmin.from("staff_intake_assignments").upsert({
    organization_id: context.organizationId,
    entity_id: entityId,
    enterprise_document_id: documentId,
    uploader_staff_id: context.staff.id,
    destination_key: routing.destinationKey,
    destination_domain: routing.destinationDomain,
    reviewer_role: routing.reviewerRole,
    workflow: routing.workflow,
    confidence: routing.confidence,
    urgency: routing.urgency,
    requires_human_review: routing.requiresHumanReview,
    suggested_action: routing.suggestedAction,
    rationale: routing.rationale,
    universal_destination: universalDestination,
    business_match: businessMatch,
    handoff_status: "AWAITING_ROUTING_REVIEW",
    status: "PENDING_REVIEW",
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,enterprise_document_id" });
  if (assignment.error) throw assignment.error;
  return "PENDING_REVIEW";
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, error: "Photo or document required" }, { status: 400 });
    }
    const mimeType = clean(file.type, 120).toLowerCase();
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ success: false, error: "Upload must be JPEG, PNG, WebP or PDF" }, { status: 415 });
    }
    if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Upload must be between 1 byte and 15 MB" }, { status: 413 });
    }
    await assertStaffUploadSignature(file, { allowedMimeTypes: ALLOWED });

    const checksum = await fileChecksum(file);
    const existingCapture = await findExistingStaffCapture({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      checksum,
    });
    if (existingCapture) {
      const existingClassification = existingCapture.classification;
      return NextResponse.json({
        success: true,
        reused: true,
        classificationStatus: existingClassification ? "CLASSIFIED" : "SAVED_UNCLASSIFIED",
        routing: publicRoutingFromAssignment(existingCapture.assignment),
      }, { status: 200 });
    }

    const entityId = await currentEntityId({ organizationId: context.organizationId, staffId: context.staff.id });
    const created = await createControlledDocument({
      organizationId: context.organizationId,
      entityId,
      actor: { staff: context.staff },
      file,
      documentName: `Staff capture · ${context.staff.name || context.staff.email || "Staff"} · ${new Date().toISOString()}`,
      documentType: "STAFF_CAPTURE",
      classification: "RESTRICTED",
      ownerStaffId: context.staff.id,
      referenceType: "STAFF",
      referenceId: context.staff.id,
      tags: ["staff-capture", "mobile-camera", "intake"],
      metadata: {
        staff_capture: {
          staff_id: context.staff.id,
          party_id: context.staff.party_id || null,
          entity_id: entityId,
          uploaded_at: new Date().toISOString(),
          source: "STAFF_MOBILE_CAMERA",
          private: true,
        },
      },
    });
    const documentId = created?.document?.id || created?.id;
    if (!documentId) throw new Error("Controlled document creation failed");

    let classification = null;
    let routing = normalizeRouting(null);
    let classificationStatus = "NOT_RUN";
    let classificationError = null;
    let routingQueueStatus = "NOT_QUEUED";
    try {
      const signed = await createDocumentSignedUrl({ organizationId: context.organizationId, documentId, expiresIn: 300 });
      const pendingExecution = await ServiceExecutionRuntime.execute({
        organization_id: context.organizationId,
        entity_id: entityId,
        service_id: "ocr",
        provider_id: "avantiqo-image",
        input: {
          capability: "ai.image.analyze",
          requested_capability: "document.classify",
          source_assets: [signed.url],
          image: signed.url,
          instructions_text: `Analyze this private staff-uploaded photo or document by visible business evidence only. Do not choose an Avantiqo workflow, permission, destination, reviewer, or action authority. Do not guess hidden facts. Return one strict JSON object with: object_type, document_type, confidence, candidate_domains, key_fields, identifiers, parties, dates, amounts, currency, urgency, clarification_required, clarification_question, suggested_action, routing_reason. candidate_domains may include Finance, Supply Chain, People, Projects, Operations, Commercial, Documents, Administration, Compliance. Use clarification_required=true whenever the visible evidence is insufficient or ambiguous. The uploader role is ${clean(context.role || context.staff?.role, 80) || "UNKNOWN"} and department is ${clean(context.staff?.department, 80) || "UNKNOWN"}; use those only as context, never as evidence of document contents and never to grant authority.`,
          quantity: 1,
        },
        metadata: {
          module: "STAFF_PORTAL",
          operation: "QUICK_CAMERA_CLASSIFY",
          document_id: documentId,
          staff_id: context.staff.id,
          local_only: true,
          paid_fallback_allowed: false,
        },
        category: "DOCUMENT",
      });
      const execution = await settleOwnedClassification(pendingExecution, {
        organizationId: context.organizationId,
      });
      classification = parseClassification(execution);
      if (!classification) throw new Error("Owned classifier returned no structured classification");
      classificationStatus = "CLASSIFIED";
      const canonicalFile = canonicalAttachmentFile({
        classification,
        documentId,
        fileName: file.name || null,
        mimeType,
      });
      const universalDestination = classification
        ? routeAnalyzedAttachment(canonicalFile, { registry: ERP_REGISTRY })
        : null;
      const businessMatch = classification
        ? await matchAnalyzedAttachmentToBusiness({
            file: canonicalFile,
            organizationId: context.organizationId,
            entityId,
          })
        : null;
      routing = normalizeRouting(classification, universalDestination);
      await updateControlledDocument({
        organizationId: context.organizationId,
        documentId,
        actor: { staff: context.staff },
        patch: {
          metadata: {
            staff_capture_classification: {
              status: classificationStatus,
              result: classification,
              provider: "avantiqo-image",
              local_first: true,
              classified_at: classification ? new Date().toISOString() : null,
            },
            staff_capture_routing: {
              ...routing,
              universal_destination: universalDestination,
              business_match: businessMatch,
              routed_at: new Date().toISOString(),
              routed_by: "AVANTIQO_OWNED_INTAKE",
              original_private: true,
            },
          },
        },
      });

      routingQueueStatus = await persistRoutingAssignment({
        context,
        documentId,
        entityId,
        routing,
        universalDestination,
        businessMatch,
      });
    } catch (error) {
      classificationStatus = "SAVED_UNCLASSIFIED";
      classificationError = clean(error?.message || "Classification unavailable", 300);
      routing = normalizeRouting({
        destination: "MANAGER",
        workflow: "GENERAL_DOCUMENT",
        routing_confidence: 0,
        urgency: "NORMAL",
        requires_human_review: true,
        suggested_action: "Review this private staff upload because automatic classification was unavailable.",
        routing_reason: "Classifier unavailable or returned an invalid result.",
      });
      try {
        routingQueueStatus = await persistRoutingAssignment({ context, documentId, entityId, routing });
      } catch (routingError) {
        routingQueueStatus = "QUEUE_FAILED";
        classificationError = clean(`${classificationError}; routing queue unavailable: ${routingError?.message || "unknown error"}`, 300);
      }
    }

    return NextResponse.json({
      success: true,
      reused: false,
      classificationStatus,
      routing: publicRoutingSummary(routing),
    }, { status: 201 });
  } catch (error) {
    return staffApiErrorResponse(error, "Staff camera upload failed");
  }
}
