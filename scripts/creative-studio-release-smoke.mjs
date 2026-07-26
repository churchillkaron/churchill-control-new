#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const terminalStates = new Set([
  "READY_FOR_APPROVAL",
  "REVIEW_REQUIRED",
  "BLOCKED_BY_RELEASE_GATE",
  "BLOCKED_BY_PRODUCTION_FAILURE",
]);

const publicationTerminalStates = new Set([
  "COMPLETED",
  "FAILED",
  "EVIDENCE_REQUIRED",
]);

function env(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function integer(name, fallback) {
  const value = Number(env(name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers() {
  const result = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const cookie = env("CREATIVE_SMOKE_COOKIE");
  const bearer = env("CREATIVE_SMOKE_BEARER_TOKEN");
  if (cookie) result.cookie = cookie;
  if (bearer) result.authorization = `Bearer ${bearer}`;

  const extra = env("CREATIVE_SMOKE_HEADERS_JSON");
  if (extra) Object.assign(result, JSON.parse(extra));
  return result;
}

async function request(baseUrl, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok || payload.success === false) {
    const message = payload.error || payload.message || raw || response.statusText;
    const error = new Error(`${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function postProduction(payload = {}) {
  return (
    payload.execution?.production?.post_production ||
    payload.production?.post_production ||
    payload.post_production ||
    null
  );
}

function productionStatus(payload = {}) {
  const post = postProduction(payload);
  return (
    post?.status ||
    payload.execution?.production?.status ||
    payload.production?.status ||
    payload.status ||
    null
  );
}

function id(value) {
  return value?.id || null;
}

function releaseEvidence(payload = {}) {
  const post = postProduction(payload) || {};
  return {
    status: post.status || productionStatus(payload),
    timeline: post.timeline || null,
    render: post.render || null,
    release_gate: post.release_gate || null,
    technical_qc: post.technical_qc || null,
    perceptual_quality: post.perceptual_quality || null,
    release_readiness: post.release_readiness || null,
    repair_plan: post.repair_plan || null,
    repair_execution: post.repair_execution || null,
  };
}

async function supabaseSnapshot(client, organizationId, projectId = null) {
  if (!client) return null;

  async function rows(table, configure) {
    let query = client.from(table).select("*");
    query = configure(query);
    const { data, error } = await query;
    if (error) return { table, error: error.message, rows: [] };
    return { table, error: null, rows: data || [] };
  }

  const wallet = await rows("organization_wallets", (query) =>
    query.eq("organization_id", organizationId).limit(1),
  );
  const transactions = await rows("wallet_transactions", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
  );
  const usage = await rows("platform_service_usage", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
  );
  const billingLines = await rows("billing_invoice_lines", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
  );
  const assetNodes = projectId
    ? await rows("creative_asset_nodes", (query) =>
        query
          .eq("organization_id", organizationId)
          .eq("creative_project_id", projectId)
          .order("created_at", { ascending: true }),
      )
    : null;

  return {
    captured_at: new Date().toISOString(),
    wallet: wallet.rows[0] || null,
    wallet_error: wallet.error,
    wallet_transactions: transactions.rows,
    wallet_transactions_error: transactions.error,
    service_usage: usage.rows,
    service_usage_error: usage.error,
    billing_lines: billingLines.rows,
    billing_lines_error: billingLines.error,
    creative_asset_nodes: assetNodes?.rows || [],
    creative_asset_nodes_error: assetNodes?.error || null,
  };
}

function countBy(rows, key) {
  return rows.reduce((result, row) => {
    const value = text(row?.[key] || "UNKNOWN").toUpperCase();
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function matchingSettlement(snapshot, execution) {
  if (!snapshot || !execution) return null;
  const metadata = execution.metadata || {};
  const usageId = metadata.usage_id || null;
  const transactions = snapshot.wallet_transactions.filter((row) =>
    usageId && (row.usage_id === usageId || row.reference === usageId),
  );
  const usage = snapshot.service_usage.find((row) => row.id === usageId) || null;
  const billingLines = snapshot.billing_lines.filter((row) =>
    row.usage_id === usageId || row.service_usage_id === usageId,
  );
  return {
    usage_id: usageId,
    usage,
    wallet_transactions: transactions,
    wallet_transaction_types: countBy(transactions, "type"),
    billing_lines: billingLines,
  };
}

function assertion(id, passed, evidence = null, reason = null) {
  return { id, passed: Boolean(passed), evidence, reason: passed ? null : reason };
}

async function main() {
  const baseUrl = required("CREATIVE_SMOKE_BASE_URL");
  const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
  const publishTargetId = env("CREATIVE_SMOKE_PUBLISH_TARGET_ID");
  const outputPath = env(
    "CREATIVE_SMOKE_OUTPUT",
    `creative-studio-release-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const pollIntervalMs = integer("CREATIVE_SMOKE_POLL_INTERVAL_MS", 10000);
  const maxPolls = integer("CREATIVE_SMOKE_MAX_POLLS", 60);
  const command = env(
    "CREATIVE_SMOKE_INTENT",
    "Create a 30 second premium vertical campaign film with a strong opening, cinematic product storytelling, titles, sound design, subtitles and a clear call to action.",
  );
  const channels = text(env("CREATIVE_SMOKE_CHANNELS", "instagram"))
    .split(",")
    .map(text)
    .filter(Boolean);

  const supabaseUrl = env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const report = {
    started_at: new Date().toISOString(),
    base_url: baseUrl,
    organization_id: organizationId,
    publish_target_id: publishTargetId,
    command,
    channels,
    phases: [],
    assertions: [],
  };

  const before = await supabaseSnapshot(supabase, organizationId);
  report.database_before = before;

  const created = await request(baseUrl, "/api/creative/create", {
    organization_id: organizationId,
    intent: command,
    title: env("CREATIVE_SMOKE_TITLE", `Creative release smoke ${Date.now()}`),
    production_type: env("CREATIVE_SMOKE_PRODUCTION_TYPE", "MASTER_VIDEO"),
    target_duration: Number(env("CREATIVE_SMOKE_DURATION_SECONDS", "30")),
    target_languages: text(env("CREATIVE_SMOKE_LANGUAGES", "en"))
      .split(",")
      .map(text)
      .filter(Boolean),
    channels,
    requested_outputs: channels,
    quality_profile: env("CREATIVE_SMOKE_QUALITY_PROFILE", "premium"),
    metadata: {
      smoke_test: true,
      smoke_started_at: report.started_at,
    },
  });
  report.phases.push({ phase: "create", response: created });

  const missionId = created.creative_mission_id;
  const projectId = created.creative_project_id;
  const briefId = created.creative_brief_id;
  report.creative_mission_id = missionId;
  report.creative_project_id = projectId;
  report.creative_brief_id = briefId;
  report.assertions.push(
    assertion("mission_created", missionId, missionId, "Mission ID missing"),
    assertion("project_created", projectId, projectId, "Project ID missing"),
    assertion("brief_created", briefId, briefId, "Brief ID missing"),
  );

  let current = created;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const status = productionStatus(current);
    if (terminalStates.has(status)) break;
    await sleep(pollIntervalMs);
    current = await request(baseUrl, "/api/creative/director/execute", {
      organization_id: organizationId,
      creative_mission_id: missionId,
      creative_project_id: projectId,
      creative_brief_id: briefId,
    });
    report.phases.push({
      phase: "pipeline_resume",
      attempt: attempt + 1,
      status: productionStatus(current),
      response: current,
    });
  }

  let evidence = releaseEvidence(current);
  report.release_before_approvals = evidence;
  report.assertions.push(
    assertion("timeline_created", id(evidence.timeline), id(evidence.timeline), "Timeline missing"),
    assertion("final_render_created", id(evidence.render), id(evidence.render), "Final render missing"),
    assertion(
      "technical_qc_passed",
      evidence.technical_qc?.passed === true || evidence.render?.metadata?.technical_qc?.passed === true,
      evidence.technical_qc || evidence.render?.metadata?.technical_qc || null,
      "Technical QC did not pass",
    ),
  );

  if (evidence.release_gate?.metadata?.passed === true) {
    const approval = await request(baseUrl, "/api/creative/release/approve", {
      organization_id: organizationId,
      subject_asset_node_id: evidence.release_gate.id,
      scope: "RELEASE_GATE",
      notes: "Creative Studio release smoke approval",
    });
    report.phases.push({ phase: "approve_release_gate", response: approval });
  }

  if (!evidence.render?.id) throw new Error("FINAL_RENDER_REQUIRED_FOR_APPROVAL");
  const renderApproval = await request(baseUrl, "/api/creative/release/approve", {
    organization_id: organizationId,
    subject_asset_node_id: evidence.render.id,
    scope: "FINAL_RENDER",
    notes: "Creative Studio final-render smoke approval",
  });
  report.phases.push({ phase: "approve_final_render", response: renderApproval });

  const readiness = await request(baseUrl, "/api/creative/release/readiness", {
    organization_id: organizationId,
    creative_project_id: projectId,
    timeline_asset_node_id: evidence.timeline?.id || null,
    final_render_asset_node_id: evidence.render.id,
  });
  report.phases.push({ phase: "release_readiness", response: readiness });
  evidence = {
    ...evidence,
    release_readiness: readiness.report,
  };
  report.release_after_approvals = evidence;
  report.assertions.push(
    assertion(
      "release_readiness_passed",
      readiness.report?.metadata?.passed === true,
      readiness.report?.metadata || null,
      `Readiness failed: ${list(readiness.report?.metadata?.failed_checks).join(", ")}`,
    ),
  );

  if (readiness.report?.metadata?.passed === true && publishTargetId) {
    const publishApproval = await request(baseUrl, "/api/creative/release/approve", {
      organization_id: organizationId,
      subject_asset_node_id: readiness.report.id,
      scope: "PUBLISH_RELEASE",
      notes: "Creative Studio publish smoke approval",
    });
    report.phases.push({ phase: "approve_publish", response: publishApproval });

    const commandResponse = await request(baseUrl, "/api/creative/release/publish/command", {
      organization_id: organizationId,
      release_readiness_report_id: readiness.report.id,
      publish_target_id: publishTargetId,
    });
    report.phases.push({ phase: "publish_command", response: commandResponse });
    const publishCommandId = commandResponse.command?.id;
    if (!publishCommandId) throw new Error("PUBLISH_COMMAND_ID_REQUIRED");

    let executionResponse = await request(baseUrl, "/api/creative/release/publish/execute", {
      organization_id: organizationId,
      publish_command_asset_node_id: publishCommandId,
    });
    report.phases.push({ phase: "publish_execute", response: executionResponse });

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const status = executionResponse.execution?.metadata?.execution_status;
      if (publicationTerminalStates.has(status)) break;
      await sleep(pollIntervalMs);
      executionResponse = await request(baseUrl, "/api/creative/release/publish/execute", {
        organization_id: organizationId,
        publish_command_asset_node_id: publishCommandId,
      });
      report.phases.push({
        phase: "publish_resume",
        attempt: attempt + 1,
        response: executionResponse,
      });
    }

    const duplicateCheck = await request(baseUrl, "/api/creative/release/publish/execute", {
      organization_id: organizationId,
      publish_command_asset_node_id: publishCommandId,
    });
    report.phases.push({ phase: "publish_duplicate_check", response: duplicateCheck });
    report.publish = {
      command: commandResponse.command,
      execution: executionResponse.execution,
      duplicate_check: duplicateCheck.execution,
    };

    const executionStatus = executionResponse.execution?.metadata?.execution_status;
    report.assertions.push(
      assertion(
        "publication_completed",
        executionStatus === "COMPLETED",
        executionResponse.execution?.metadata || null,
        `Publication ended as ${executionStatus || "UNKNOWN"}`,
      ),
      assertion(
        "external_publication_evidence_present",
        Boolean(
          executionResponse.execution?.metadata?.external_publication_id ||
          executionResponse.execution?.metadata?.external_publication_url,
        ),
        {
          id: executionResponse.execution?.metadata?.external_publication_id || null,
          url: executionResponse.execution?.metadata?.external_publication_url || null,
        },
        "External publication ID or URL missing",
      ),
      assertion(
        "duplicate_execution_reused",
        duplicateCheck.reused === true &&
          duplicateCheck.execution?.id === executionResponse.execution?.id,
        {
          first_execution_id: executionResponse.execution?.id || null,
          repeated_execution_id: duplicateCheck.execution?.id || null,
          reused: duplicateCheck.reused === true,
        },
        "Repeated execution did not reuse the same publication record",
      ),
    );
  } else if (!publishTargetId) {
    report.publish = { skipped: true, reason: "CREATIVE_SMOKE_PUBLISH_TARGET_ID not set" };
  }

  const after = await supabaseSnapshot(supabase, organizationId, projectId);
  report.database_after = after;
  const settlement = matchingSettlement(after, report.publish?.execution);
  report.publication_settlement = settlement;

  if (report.publish?.execution && settlement) {
    report.assertions.push(
      assertion(
        "wallet_charge_not_duplicated",
        Number(settlement.wallet_transaction_types.CHARGE || 0) <= 1,
        settlement.wallet_transaction_types,
        "More than one wallet charge exists for the publication usage",
      ),
      assertion(
        "wallet_reservation_not_duplicated",
        Number(settlement.wallet_transaction_types.RESERVE || 0) <= 1,
        settlement.wallet_transaction_types,
        "More than one wallet reservation exists for the publication usage",
      ),
      assertion(
        "usage_settled_once",
        settlement.usage?.status === "SUCCESS",
        settlement.usage,
        "Publication service usage is not SUCCESS",
      ),
      assertion(
        "billing_evidence_present",
        settlement.billing_lines.length > 0 ||
          Boolean(report.publish.execution?.metadata?.billing_invoice_id),
        {
          billing_lines: settlement.billing_lines,
          billing_invoice_id:
            report.publish.execution?.metadata?.billing_invoice_id || null,
        },
        "Publication billing evidence missing",
      ),
    );
  }

  const nodes = list(after?.creative_asset_nodes);
  report.asset_node_type_counts = countBy(nodes, "type");
  report.assertions.push(
    assertion(
      "asset_evidence_available",
      !supabase || nodes.length > 0,
      report.asset_node_type_counts,
      "No creative asset evidence found",
    ),
  );

  report.completed_at = new Date().toISOString();
  report.passed = report.assertions.every((item) => item.passed);
  report.failed_assertions = report.assertions
    .filter((item) => !item.passed)
    .map((item) => item.id);

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE STUDIO RELEASE SMOKE");
  console.log("============================================================");
  console.log(`MISSION=${missionId}`);
  console.log(`PROJECT=${projectId}`);
  console.log(`STATUS=${productionStatus(current) || "UNKNOWN"}`);
  console.log(`PUBLISH=${report.publish?.execution?.metadata?.execution_status || report.publish?.reason || "NOT_RUN"}`);
  console.log(`REPORT=${outputPath}`);
  console.log(`RESULT=${report.passed ? "PASS" : "FAIL"}`);
  if (!report.passed) {
    console.log(`FAILED_ASSERTIONS=${report.failed_assertions.join(",")}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const failurePath = env(
    "CREATIVE_SMOKE_OUTPUT",
    `creative-studio-release-smoke-failed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const failure = {
    passed: false,
    failed_at: new Date().toISOString(),
    error: error.message,
    status: error.status || null,
    payload: error.payload || null,
    stack: error.stack || null,
  };
  await fs.writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error("CREATIVE STUDIO RELEASE SMOKE FAILED");
  console.error(error);
  console.error(`REPORT=${failurePath}`);
  process.exitCode = 1;
});
