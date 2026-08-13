export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import "@/lib/finance/bootstrap/registerFinanceBilling";

import { NextResponse } from "next/server";

import {
  CreativeWorldClassLiveBenchmarkRuntime,
} from "@/lib/creative/quality/runtime/CreativeWorldClassLiveBenchmarkRuntime";
import {
  CREATIVE_WORLD_CLASS_BENCHMARK_CASES,
  getCreativeWorldClassBenchmarkCase,
} from "@/app/api/creative/tests/world-class-benchmark/fixtures";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

function text(value) {
  return String(value ?? "").trim();
}

function publicCase(benchmarkCase) {
  return {
    id: benchmarkCase.id,
    label: benchmarkCase.label,
    production_type: benchmarkCase.production_type,
  };
}

function errorStatus(error) {
  const message = text(error?.message).toUpperCase();
  const code = text(error?.code).toUpperCase();
  const value = `${code}:${message}`;
  if (
    value.includes("REQUIRED") ||
    value.includes("INVALID") ||
    value.includes("NOT_REGISTERED")
  ) {
    return 400;
  }
  if (
    value.includes("PERMISSION") ||
    value.includes("FORBIDDEN") ||
    value.includes("UNAUTHORIZED")
  ) {
    return 403;
  }
  if (value.includes("NOT_FOUND")) return 404;
  if (value.includes("CONFLICT") || value.includes("LOCK")) return 409;
  return 500;
}

async function requireCaseAccess(request, benchmarkCase) {
  const access = await requireOrganizationAccess({
    organizationId: benchmarkCase.organization_id,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });

  if (!access.success) {
    const error = new Error(
      access.error || "CREATIVE_BENCHMARK_ACCESS_FORBIDDEN",
    );
    error.code = access.code || "CREATIVE_BENCHMARK_ACCESS_FORBIDDEN";
    error.status = access.status || 403;
    throw error;
  }

  return access;
}

async function requireAllCaseAccess(request) {
  const uniqueOrganizations = [
    ...new Set(
      CREATIVE_WORLD_CLASS_BENCHMARK_CASES.map(
        (entry) => entry.organization_id,
      ),
    ),
  ];

  for (const organizationId of uniqueOrganizations) {
    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: EXECUTION_PERMISSIONS,
    });
    if (!access.success) {
      const error = new Error(
        access.error || "CREATIVE_BENCHMARK_ACCESS_FORBIDDEN",
      );
      error.code = access.code || "CREATIVE_BENCHMARK_ACCESS_FORBIDDEN";
      error.status = access.status || 403;
      throw error;
    }
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = text(body.action).toLowerCase();

    if (action === "run_case") {
      if (body.confirm_reasoning_spend !== true) {
        return NextResponse.json(
          {
            success: false,
            error: "Explicit reasoning-spend confirmation required",
            code: "CREATIVE_BENCHMARK_REASONING_SPEND_CONFIRMATION_REQUIRED",
          },
          { status: 400 },
        );
      }

      const caseId = text(body.case_id);
      if (!caseId) {
        return NextResponse.json(
          {
            success: false,
            error: "case_id required",
            code: "CREATIVE_BENCHMARK_CASE_ID_REQUIRED",
          },
          { status: 400 },
        );
      }

      const benchmarkCase = getCreativeWorldClassBenchmarkCase(caseId);
      await requireCaseAccess(request, benchmarkCase);
      const result = await CreativeWorldClassLiveBenchmarkRuntime.runCase(
        benchmarkCase,
      );

      return NextResponse.json({
        success: true,
        action: "run_case",
        case: publicCase(benchmarkCase),
        ...result,
        safety: {
          reasoning_provider_calls_executed: true,
          media_generation_executed: false,
          publication_executed: false,
          production_graph_created: false,
          production_task_created: false,
        },
      });
    }

    if (action === "evaluate") {
      await requireAllCaseAccess(request);
      const report = CreativeWorldClassLiveBenchmarkRuntime.evaluate(
        body.cases,
        CREATIVE_WORLD_CLASS_BENCHMARK_CASES,
      );

      return NextResponse.json({
        success: true,
        action: "evaluate",
        report,
        safety: {
          reasoning_provider_calls_executed: false,
          media_generation_executed: false,
          publication_executed: false,
          production_graph_created: false,
          production_task_created: false,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unsupported benchmark action",
        code: "CREATIVE_BENCHMARK_ACTION_INVALID",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative benchmark QA failed",
        code: error?.code || null,
      },
      { status: error?.status || errorStatus(error) },
    );
  }
}
