import { NextResponse } from "next/server";
import OpenAI from "openai";

import { buildOrganizationRuntime } from "@/lib/platform/runtime/buildOrganizationRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";


import { routeAIModel } from "@/lib/ai/routeAIModel";
import { extractActions } from "@/lib/ai/extractActions";
import { executeActions } from "@/lib/ai/executeActions";
import { runCommandCenterWatch } from "@/lib/ai/runCommandCenterWatch";
import { selfHealingEngine } from "@/lib/ai/selfHealingEngine";
import { decisionEngine } from "@/lib/ai/decisionEngine";
import { executionPlanner } from "@/lib/ai/executionPlanner";
import { pushToApprovalQueue } from "@/lib/ai/approvalQueue";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const memoryStore = new Map();

export async function POST(req) {
  try {
    const { query, organizationId, sessionId } = await req.json();

    const access = await requireOrganizationAccess({ organizationId });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const org = access.organization;

    // =========================
    // MODULE-BASED AI ACCESS CONTROL
    // =========================

    const hasAI = modules.some(m =>
      m.module_id === 'owner_ai' || m.module_id === 'analytics'
    );

    if (!hasAI) {
      return NextResponse.json({
        success: false,
        error: 'MODULE_NOT_ENABLED'
      });
    }


    // =========================
    // 🔐 SAAS FEATURE GUARD
    // =========================

if (!hasAI) {
  return NextResponse.json({
    success: false,
    error: "MODULE_NOT_ENABLED",
    module: "owner_ai"
  });
}


    const runtime = await buildOrganizationRuntime({
      organization: org,
      access,
      organizationTree: null,
      modules: [],
    });

    const sid = sessionId || organizationId;

    if (!memoryStore.has(sid)) {
      memoryStore.set(sid, []);
    }

    const history = memoryStore.get(sid);
    history.push({ role: "user", content: query });

    const route = routeAIModel(query);

    const model =
      route.model === "deep"
        ? "gpt-4o"
        : "gpt-4o-mini";

    const systemContext = `
Enterprise AI System for ${org?.name}

PLAN: ${"enterprise" || "starter"}

LIVE DATA:
${JSON.stringify(runtime.metrics, null, 2)}

RULES:
- Respect plan limits
- Do not exceed permissions
`;

    const messages = [
      { role: "system", content: systemContext },
      ...history.slice(-12),
      { role: "user", content: query },
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
    });

    const answer = completion.choices[0].message.content;

    const actions = extractActions(answer);
    await executeActions({ actions, organizationId });

    const commandCenter = await runCommandCenterWatch({ organizationId });

    const selfHealing = selfHealingEngine({
      metrics: runtime.metrics,
      events: commandCenter?.alerts || [],
      alerts: runtime.alerts,
    });

    const decisions = decisionEngine({ selfHealing });
    const execution = executionPlanner({ decisions });

    const approval = await pushToApprovalQueue({
      organizationId,
      executionPlan: execution,
      decisions,
    });

    history.push({ role: "assistant", content: answer });

    return NextResponse.json({
      success: true,
      answer,
      modelUsed: model,
      
      actions,
      commandCenter,
      selfHealing,
      decisions,
      execution,
      approval,
      sessionId: sid,
    });

  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
