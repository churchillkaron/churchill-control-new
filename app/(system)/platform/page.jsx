export const dynamic = "force-dynamic";

import PlatformAdminConsole from "@/components/platform/PlatformAdminConsole";
import checkSystemHealth from "@/lib/health/checkSystemHealth";
import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizePlatformHealth(health) {
  const database = health?.services?.database || { status: "unknown" };

  return {
    ...health,
    status: database.status === "healthy" ? "partial" : "degraded",
    services: {
      ...health?.services,
      database,
      queue: {
        status: "unverified",
        workers_active: null,
        source: "QUEUE_HEALTH_PROBE_NOT_RUNTIME_VERIFIED",
      },
    },
  };
}

function rowsFrom(result) {
  return result.status === "fulfilled" && !result.value.error
    ? result.value.data || []
    : [];
}

async function loadPlatformAdminConsole() {
  const access = await requirePlatformAdminAccess();

  if (!access.success) {
    return {
      access,
      organizations: [],
      recentEvents: [],
      modules: [],
      staff: [],
      recentUsage: [],
      health: {
        status: "degraded",
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        services: {},
      },
    };
  }

  const [
    organizationsResult,
    eventsResult,
    modulesResult,
    staffResult,
    usageResult,
    healthResult,
  ] = await Promise.allSettled([
    supabaseAdmin.from("organizations").select("*"),
    supabaseAdmin
      .from("organization_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin.from("platform_modules").select("*"),
    supabaseAdmin
      .from("staff_accounts")
      .select("id,email,role,active,auth_user_id,organization_id")
      .order("email", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from("platform_service_usage")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    checkSystemHealth(),
  ]);

  const health =
    healthResult.status === "fulfilled"
      ? normalizePlatformHealth(healthResult.value)
      : {
          status: "degraded",
          timestamp: new Date().toISOString(),
          duration_ms: 0,
          services: {},
        };

  return {
    access,
    organizations: rowsFrom(organizationsResult),
    recentEvents: rowsFrom(eventsResult),
    modules: rowsFrom(modulesResult),
    staff: rowsFrom(staffResult),
    recentUsage: rowsFrom(usageResult),
    health,
  };
}

function AccessDenied({ status, error }) {
  return (
    <div className="-mx-5 -my-5 min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-5 py-10 text-[#2A2723] lg:-mx-7 lg:-my-6 lg:px-7">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9]">
        <div className="border-b border-black/[0.06] px-5 py-4">
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
            Avantiqo Platform
          </div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#27231F]">
            Platform administrator access required
          </h1>
          <p className="mt-1 max-w-2xl text-[9px] leading-5 text-[#918B83]">
            This workspace is restricted to active PLATFORM_OWNER and SUPER_ADMIN staff accounts.
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="rounded-xl border border-black/[0.07] bg-[#F6F4F0] px-4 py-3 text-[9px] text-[#746E66]">
            {status || 403} · {error || "Access denied"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function PlatformPage() {
  const runtime = await loadPlatformAdminConsole();

  if (!runtime.access?.success) {
    return (
      <AccessDenied
        status={runtime.access?.status}
        error={runtime.access?.error}
      />
    );
  }

  return (
    <PlatformAdminConsole
      organizations={runtime.organizations}
      recentEvents={runtime.recentEvents}
      modules={runtime.modules}
      staff={runtime.staff}
      recentUsage={runtime.recentUsage}
      health={runtime.health}
    />
  );
}
