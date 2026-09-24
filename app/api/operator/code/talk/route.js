import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const MEMORY_SCOPE = "code_studio_talk_history";
const MEMORY_KEY = "primary";
const MAX_TURNS = 100;
const DB_TIMEOUT_MS = 5000;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function timeoutSignal() {
  return AbortSignal.timeout(DB_TIMEOUT_MS);
}

async function accessFor(request, organizationId) {
  return requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: REQUIRED_PERMISSION,
  });
}

async function loadHistory(organizationId) {
  const result = await supabaseAdmin
    .from("intelligence_memories")
    .select("metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY)
    .eq("active", true)
    .maybeSingle()
    .abortSignal(timeoutSignal());
  if (result.error) throw result.error;
  const metadata = result.data?.metadata && typeof result.data.metadata === "object"
    ? result.data.metadata
    : {};
  return {
    turns: Array.isArray(metadata.turns) ? metadata.turns.slice(-MAX_TURNS) : [],
    updated_at: result.data?.updated_at || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"), 200);
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });

    const access = await accessFor(request, organizationId);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const history = await loadHistory(organizationId);
    return Response.json({
      success: true,
      turns: history.turns,
      updated_at: history.updated_at,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_TALK_LOAD_FAILED",
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const role = text(body.role, 40).toLowerCase();
    const content = text(body.content, 12000);
    const clientTurnId = text(body.client_turn_id, 240) || crypto.randomUUID();
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!["user", "assistant"].includes(role)) return Response.json({ success: false, error: "role invalid" }, { status: 400 });
    if (!content) return Response.json({ success: false, error: "content required" }, { status: 400 });

    const access = await accessFor(request, organizationId);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const history = await loadHistory(organizationId);
    const existing = history.turns.find((turn) => text(turn?.id, 240) === clientTurnId);
    if (existing) {
      return Response.json({ success: true, duplicate: true, turn: existing });
    }

    const now = new Date().toISOString();
    const turn = {
      id: clientTurnId,
      role,
      content,
      created_at: now,
    };
    const turns = [...history.turns, turn].slice(-MAX_TURNS);
    const written = await supabaseAdmin
      .from("intelligence_memories")
      .upsert({
        organization_id: organizationId,
        memory_scope: MEMORY_SCOPE,
        memory_key: MEMORY_KEY,
        memory_type: "fact",
        subject: "Code Studio Talk transcript",
        content: "Durable Code Studio Talk transcript.",
        importance: 0.5,
        confidence: 1,
        source: "code_studio_talk",
        active: true,
        metadata: {
          contract: "AVANTIQO_CODE_STUDIO_TALK_HISTORY_V1",
          turns,
          turn_count: turns.length,
          updated_by_user_id: access.user?.id || null,
        },
        updated_at: now,
      }, { onConflict: "organization_id,memory_scope,memory_key" })
      .select("updated_at")
      .single()
      .abortSignal(timeoutSignal());
    if (written.error) throw written.error;

    return Response.json({
      success: true,
      turn,
      updated_at: written.data?.updated_at || now,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_TALK_PERSIST_FAILED",
    }, { status: 500 });
  }
}
