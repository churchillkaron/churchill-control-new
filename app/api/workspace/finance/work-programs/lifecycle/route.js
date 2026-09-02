export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.close.execute",
  "finance.configuration.manage",
];

const TERMINAL_ITEM_STATUSES = new Set(["COMPLETE", "SKIPPED"]);
const TERMINAL_REQUEST_STATUSES = new Set(["ACCEPTED", "CANCELLED"]);

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance work program permission denied");
}

async function getRun(access, runId) {
  const { data, error } = await supabaseAdmin
    .from("accounting_engagement_runs")
    .select("*")
    .eq("id", runId)
    .eq("accounting_firm_id", access.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accounting engagement run not found");
  return data;
}

async function getRunState(access, runId) {
  const [itemsResult, requestsResult] = await Promise.all([
    supabaseAdmin
      .from("accounting_engagement_work_items")
      .select("*")
      .eq("accounting_firm_id", access.organizationId)
      .eq("run_id", runId)
      .order("sequence_no", { ascending: true }),
    supabaseAdmin
      .from("accounting_client_requests")
      .select("*")
      .eq("accounting_firm_id", access.organizationId)
      .eq("run_id", runId),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (requestsResult.error) throw requestsResult.error;
  return { items: itemsResult.data || [], requests: requestsResult.data || [] };
}

function dependencyBlockers(item, items) {
  const dependencies = Array.isArray(item.dependency_step_keys) ? item.dependency_step_keys : [];
  if (!dependencies.length) return [];
  const byKey = new Map(items.map((row) => [row.step_key, row]));
  return dependencies
    .map((key) => ({ key, item: byKey.get(key) }))
    .filter(({ item: dependency }) => !dependency || !TERMINAL_ITEM_STATUSES.has(dependency.status))
    .map(({ key, item: dependency }) => ({
      step_key: key,
      status: dependency?.status || "MISSING",
      title: dependency?.title || key,
    }));
}

function hasEvidence(item, body) {
  if (!item?.metadata?.evidence_required) return true;
  const evidence = body.evidence ?? item.evidence;
  const conclusion = clean(body.conclusion ?? item.conclusion);
  if (Array.isArray(evidence)) return evidence.length > 0 && Boolean(conclusion);
  if (evidence && typeof evidence === "object") return Object.keys(evidence).length > 0 && Boolean(conclusion);
  return Boolean(clean(evidence)) && Boolean(conclusion);
}

async function ensureFinanceReviewCleared(item) {
  if (item.work_type !== "FINANCE_REVIEW") return;
  if (!item.finance_review_item_id) {
    const error = new Error("Finance review work must be linked to a Finance review item before completion");
    error.status = 409;
    throw error;
  }
  const [reviewResult, notesResult, signoffsResult] = await Promise.all([
    supabaseAdmin
      .from("finance_review_items")
      .select("id,status")
      .eq("id", item.finance_review_item_id)
      .maybeSingle(),
    supabaseAdmin
      .from("finance_review_notes")
      .select("id", { count: "exact", head: true })
      .eq("review_item_id", item.finance_review_item_id)
      .neq("status", "RESOLVED"),
    supabaseAdmin
      .from("finance_review_signoffs")
      .select("signoff_role")
      .eq("review_item_id", item.finance_review_item_id),
  ]);
  if (reviewResult.error) throw reviewResult.error;
  if (notesResult.error) throw notesResult.error;
  if (signoffsResult.error) throw signoffsResult.error;
  const roles = new Set((signoffsResult.data || []).map((row) => row.signoff_role));
  if (!reviewResult.data || reviewResult.data.status !== "CLEARED" || Number(notesResult.count || 0) > 0 || !roles.has("PARTNER")) {
    const error = new Error("Finance review is not fully cleared by reviewer and partner");
    error.status = 409;
    throw error;
  }
}

async function releaseDependents(access, runId) {
  const { items } = await getRunState(access, runId);
  const updates = [];
  for (const item of items) {
    if (!["BLOCKED", "NOT_STARTED"].includes(item.status)) continue;
    const blockers = dependencyBlockers(item, items);
    if (!blockers.length) updates.push(item.id);
  }
  if (!updates.length) return 0;
  const { error } = await supabaseAdmin
    .from("accounting_engagement_work_items")
    .update({ status: "READY", blocked_reason: null, updated_at: new Date().toISOString() })
    .eq("accounting_firm_id", access.organizationId)
    .eq("run_id", runId)
    .in("id", updates);
  if (error) throw error;
  return updates.length;
}

async function reconcileRun(access, run) {
  const { items, requests } = await getRunState(access, run.id);
  const openItems = items.filter((item) => !TERMINAL_ITEM_STATUSES.has(item.status));
  const openRequests = requests.filter((request) => !TERMINAL_REQUEST_STATUSES.has(request.status));
  const blocked = openItems.some((item) => item.status === "BLOCKED");
  const waiting = openItems.some((item) => item.status === "WAITING_ON_CLIENT") || openRequests.some((request) => ["DRAFT", "SENT", "VIEWED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(request.status));
  const readyForReview = openItems.some((item) => item.status === "READY_FOR_REVIEW");
  const reviewed = openItems.length > 0 && openItems.every((item) => ["READY_FOR_REVIEW", "COMPLETE", "SKIPPED"].includes(item.status));
  let status = "IN_PROGRESS";
  if (blocked) status = "BLOCKED";
  else if (waiting) status = "WAITING_ON_CLIENT";
  else if (readyForReview) status = "READY_FOR_REVIEW";
  else if (reviewed) status = "REVIEWED";
  else if (!openItems.length && !openRequests.length) status = "CLEARED";
  const { data, error } = await supabaseAdmin
    .from("accounting_engagement_runs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("accounting_firm_id", access.organizationId)
    .select("*")
    .single();
  if (error) throw error;
  return { run: data, items, requests };
}

async function audit(access, action, entityType, entityId, beforeData, afterData, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    before_data: beforeData || null,
    after_data: afterData || null,
    metadata,
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const action = clean(body.action).toLowerCase();
    const runId = clean(body.runId || body.run_id);
    if (!action || !runId) return jsonError("action and runId are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const run = await getRun(access, runId);
    if (run.locked_at && action !== "roll_forward") return jsonError("Completed work program is locked and cannot be changed", 409);

    if (action === "start_item" || action === "complete_item" || action === "request_changes") {
      const itemId = clean(body.workItemId || body.work_item_id);
      if (!itemId) return jsonError("workItemId is required");
      const { data: item, error: itemError } = await supabaseAdmin
        .from("accounting_engagement_work_items")
        .select("*")
        .eq("id", itemId)
        .eq("run_id", run.id)
        .eq("accounting_firm_id", access.organizationId)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) return jsonError("Work item not found", 404);

      const { items } = await getRunState(access, run.id);
      const blockers = dependencyBlockers(item, items);
      if (blockers.length) return jsonError("Prerequisite work is incomplete", 409, blockers);

      if (action === "start_item") {
        if (!["READY", "NOT_STARTED", "CHANGES_REQUESTED"].includes(item.status)) return jsonError(`Cannot start work item from ${item.status}`, 409);
        const { data, error } = await supabaseAdmin
          .from("accounting_engagement_work_items")
          .update({ status: "IN_PROGRESS", start_at: item.start_at || new Date().toISOString(), blocked_reason: null, updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .select("*")
          .single();
        if (error) throw error;
        await audit(access, "ACCOUNTING_WORK_ITEM_STARTED", "accounting_engagement_work_item", item.id, item, data, { run_id: run.id });
        const reconciled = await reconcileRun(access, run);
        return NextResponse.json({ success: true, work_item: data, run: reconciled.run });
      }

      if (action === "request_changes") {
        if (!["READY_FOR_REVIEW", "IN_PROGRESS", "COMPLETE"].includes(item.status)) return jsonError(`Cannot request changes from ${item.status}`, 409);
        const reason = clean(body.reason || body.blocked_reason);
        if (!reason) return jsonError("reason is required");
        const { data, error } = await supabaseAdmin
          .from("accounting_engagement_work_items")
          .update({ status: "CHANGES_REQUESTED", blocked_reason: reason, completed_at: null, completed_by: null, updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .select("*")
          .single();
        if (error) throw error;
        await audit(access, "ACCOUNTING_WORK_ITEM_CHANGES_REQUESTED", "accounting_engagement_work_item", item.id, item, data, { run_id: run.id, reason });
        const reconciled = await reconcileRun(access, run);
        return NextResponse.json({ success: true, work_item: data, run: reconciled.run });
      }

      if (item.work_type === "CLIENT_REQUEST") {
        const { data: clientRequest, error: clientRequestError } = await supabaseAdmin
          .from("accounting_client_requests")
          .select("*")
          .eq("work_item_id", item.id)
          .maybeSingle();
        if (clientRequestError) throw clientRequestError;
        if (!clientRequest || clientRequest.status !== "ACCEPTED") return jsonError("Client evidence must be accepted before this work item can complete", 409);
      }
      if (!hasEvidence(item, body)) return jsonError("Required evidence and conclusion must be recorded before completion", 409);
      await ensureFinanceReviewCleared(item);

      const nextStatus = ["REVIEWER", "PARTNER"].includes(item.required_role) ? "COMPLETE" : body.readyForReview === true || body.ready_for_review === true ? "READY_FOR_REVIEW" : "COMPLETE";
      const { data, error } = await supabaseAdmin
        .from("accounting_engagement_work_items")
        .update({
          status: nextStatus,
          evidence: body.evidence ?? item.evidence ?? {},
          conclusion: body.conclusion ?? item.conclusion ?? null,
          completed_at: nextStatus === "COMPLETE" ? new Date().toISOString() : null,
          completed_by: nextStatus === "COMPLETE" ? access.user?.id || null : null,
          blocked_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .select("*")
        .single();
      if (error) throw error;
      if (nextStatus === "COMPLETE") await releaseDependents(access, run.id);
      await audit(access, nextStatus === "COMPLETE" ? "ACCOUNTING_WORK_ITEM_COMPLETED" : "ACCOUNTING_WORK_ITEM_READY_FOR_REVIEW", "accounting_engagement_work_item", item.id, item, data, { run_id: run.id });
      const reconciled = await reconcileRun(access, run);
      return NextResponse.json({ success: true, work_item: data, run: reconciled.run });
    }

    if (["send_client_request", "submit_client_request", "accept_client_request", "client_request_changes"].includes(action)) {
      const requestId = clean(body.clientRequestId || body.client_request_id);
      if (!requestId) return jsonError("clientRequestId is required");
      const { data: clientRequest, error: requestError } = await supabaseAdmin
        .from("accounting_client_requests")
        .select("*")
        .eq("id", requestId)
        .eq("run_id", run.id)
        .eq("accounting_firm_id", access.organizationId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!clientRequest) return jsonError("Client request not found", 404);

      const now = new Date().toISOString();
      let patch = {};
      if (action === "send_client_request") {
        if (!["DRAFT", "CHANGES_REQUESTED"].includes(clientRequest.status)) return jsonError(`Cannot send request from ${clientRequest.status}`, 409);
        patch = { status: "SENT", sent_at: clientRequest.sent_at || now, updated_at: now };
      } else if (action === "submit_client_request") {
        if (!["SENT", "VIEWED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(clientRequest.status)) return jsonError(`Cannot submit request from ${clientRequest.status}`, 409);
        patch = { status: "SUBMITTED", submitted_at: now, client_response: body.clientResponse ?? body.client_response ?? clientRequest.client_response, updated_at: now };
      } else if (action === "accept_client_request") {
        if (clientRequest.status !== "SUBMITTED") return jsonError("Only submitted client evidence can be accepted", 409);
        patch = { status: "ACCEPTED", accepted_at: now, accepted_by: access.user?.id || null, changes_requested_at: null, changes_requested_by: null, updated_at: now };
      } else {
        if (clientRequest.status !== "SUBMITTED") return jsonError("Changes can only be requested from submitted client evidence", 409);
        patch = { status: "CHANGES_REQUESTED", changes_requested_at: now, changes_requested_by: access.user?.id || null, accepted_at: null, accepted_by: null, updated_at: now };
      }

      const { data, error } = await supabaseAdmin
        .from("accounting_client_requests")
        .update(patch)
        .eq("id", clientRequest.id)
        .select("*")
        .single();
      if (error) throw error;

      if (action === "send_client_request") {
        await supabaseAdmin.from("accounting_engagement_work_items").update({ status: "WAITING_ON_CLIENT", updated_at: now }).eq("id", clientRequest.work_item_id);
      }
      if (action === "accept_client_request") {
        await supabaseAdmin.from("accounting_engagement_work_items").update({ status: "READY", blocked_reason: null, updated_at: now }).eq("id", clientRequest.work_item_id);
      }
      if (action === "client_request_changes") {
        await supabaseAdmin.from("accounting_engagement_work_items").update({ status: "WAITING_ON_CLIENT", blocked_reason: "Client evidence requires changes", updated_at: now }).eq("id", clientRequest.work_item_id);
      }

      await audit(access, `ACCOUNTING_CLIENT_REQUEST_${action.replace("client_request", "").replace(/^_+/, "").toUpperCase()}`, "accounting_client_request", clientRequest.id, clientRequest, data, { run_id: run.id, work_item_id: clientRequest.work_item_id });
      const reconciled = await reconcileRun(access, run);
      return NextResponse.json({ success: true, client_request: data, run: reconciled.run });
    }

    if (action === "complete_run") {
      const { items, requests } = await getRunState(access, run.id);
      const incompleteItems = items.filter((item) => !TERMINAL_ITEM_STATUSES.has(item.status));
      const incompleteRequests = requests.filter((clientRequest) => !TERMINAL_REQUEST_STATUSES.has(clientRequest.status));
      if (incompleteItems.length || incompleteRequests.length) {
        return jsonError("Work program cannot complete while work items or client requests remain open", 409, {
          work_items: incompleteItems.map((item) => ({ id: item.id, step_key: item.step_key, status: item.status })),
          client_requests: incompleteRequests.map((clientRequest) => ({ id: clientRequest.id, status: clientRequest.status })),
        });
      }
      const now = new Date().toISOString();
      const snapshot = {
        completed_at: now,
        template_id: run.template_id,
        period_id: run.period_id,
        work_items: items.map((item) => ({ id: item.id, step_key: item.step_key, status: item.status, evidence: item.evidence, conclusion: item.conclusion, completed_at: item.completed_at })),
        client_requests: requests.map((clientRequest) => ({ id: clientRequest.id, status: clientRequest.status, submitted_at: clientRequest.submitted_at, accepted_at: clientRequest.accepted_at })),
      };
      const { data, error } = await supabaseAdmin
        .from("accounting_engagement_runs")
        .update({ status: "COMPLETE", completed_at: now, locked_at: now, locked_by: access.user?.id || null, completion_snapshot: snapshot, updated_at: now })
        .eq("id", run.id)
        .select("*")
        .single();
      if (error) throw error;
      await audit(access, "ACCOUNTING_ENGAGEMENT_RUN_COMPLETED", "accounting_engagement_run", run.id, run, data, { snapshot });
      return NextResponse.json({ success: true, run: data });
    }

    if (action === "reconcile_run") {
      const reconciled = await reconcileRun(access, run);
      return NextResponse.json({ success: true, run: reconciled.run });
    }

    return jsonError("Unsupported work program lifecycle action", 400);
  } catch (error) {
    const message = error?.message || "Unable to update accounting work program lifecycle";
    return jsonError(message, error?.status || (/permission denied/i.test(message) ? 403 : 500));
  }
}
