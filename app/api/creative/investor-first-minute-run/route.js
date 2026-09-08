export const dynamic = "force-dynamic";
export const maxDuration = 60;

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  CreativePreProductionIntelligenceCertificationRuntime,
} from "@/lib/creative/certification/runtime/CreativePreProductionIntelligenceCertificationRuntime";

const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PROJECT_ID = "0f906cec-2329-46f1-a62e-2dff9ef41f2e";
const TOKEN_SHA256 = "b2e46fa9fa3c1361c72c97528c20cb65ba9a56e175324bf0e67f6e4575413b9d";

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";
    if (hash(token) !== TOKEN_SHA256) {
      return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const certification = await CreativePreProductionIntelligenceCertificationRuntime.inspect({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
    });

    return NextResponse.json({
      success: certification.passed === true,
      contract: "AVANTIQO_INVESTOR_FIRST_MINUTE_PREPRODUCTION_CERTIFICATION_V1",
      scope: "00:00-01:00",
      status: certification.passed
        ? "CERTIFIED_USE_CANONICAL_STUDIO_PRODUCTION"
        : "BLOCKED_REBUILD_THROUGH_CANONICAL_STUDIO",
      certification,
      legacy_hardcoded_master_retired: true,
      production_started: false,
      generation_spawned: false,
      publication_authorized: false,
    }, { status: certification.passed ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || String(error),
      production_started: false,
      generation_spawned: false,
      publication_authorized: false,
    }, { status: 500 });
  }
}
