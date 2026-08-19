export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/platform/service-runtime/providers/gemini/GeminiFounderStatusRecoveryPatch.js";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/sup