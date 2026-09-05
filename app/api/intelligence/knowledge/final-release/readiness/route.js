import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import {
  getAvantiqoFinalKnowledgeReleaseActivationReadiness,
} from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseActivationReadinessRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function uuid(value) {
  const normalized = text(value, 80).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function createUserContextClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
}

async function assertManagerAuthority(organizationId) {
  const user = await getServerCurrentUser();
  if (!uuid(user?.id)) {
    throw new Error("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_READINESS_AUTHENTICATED_USER_REQUIRED");
  }
  const userClient = createUserContextClient();
  const authority = await userClient.rpc("can_manage_organization", {
    target_organization_id: organizationId,
  });
  if (authority.error) throw authority.error;
  if (authority.data !== true) {
    throw new Error("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_READINESS_ORGANIZATION_MANAGER_AUTHORITY_REQUIRED");
  }
}

function statusForError(message) {
  if (/AUTHENTICATED_USER_REQUIRED/.test(message)) return 401;
  if (/ORGANIZATION_MANAGER_AUTHORITY_REQUIRED/.test(message)) return 403;
  if (/ORGANIZATION_REQUIRED/.test(message)) return 400;
  return 422;
}

export async function GET(request) {
  try {
    const organizationId = uuid(new URL(request.url).searchParams.get("organization_id"));
    if (!organizationId) {
      throw new Error("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_READINESS_ORGANIZATION_REQUIRED");
    }
    await assertManagerAuthority(organizationId);
    const readiness = await getAvantiqoFinalKnowledgeReleaseActivationReadiness();
    return NextResponse.json(readiness, {
      status: readiness.ready === true ? 200 : 409,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = text(error?.message || error, 1000) || "FINAL_RELEASE_READINESS_FAILED";
    return NextResponse.json({ success: false, error: message }, {
      status: statusForError(message),
      headers: { "cache-control": "no-store" },
    });
  }
}
