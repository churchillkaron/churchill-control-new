export const dynamic = "force-dynamic";

import PlatformControlTower from "@/components/platform/PlatformControlTower";
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

async function loadPlatformControlTower() {
  const access = await requirePlatformAdminAccess();

  if (!access.success) {
    return {
      access,
      organizations: [],
      recentEvents: [],
      modules: [],
      health: {
        status: "degraded",
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        services: {},
      },
    };
  }

  const [organizationsResult, eventsResult, modulesResult, healthResult] =
    await Promise.allSettled([
      supabaseAdmin.from("organizations").select("*"),
      supabaseAdmin
        .from("organization_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("platform_modules").select("*"),
      checkSystemHealth(),
    ]);

  const organizations =
    organizationsResult.status === "fulfilled" &&
    !organizationsResult.value.error
      ? organizationsResult.value.data || []
      : [];

  const recentEvents =
    eventsResult.status === "fulfilled" && !eventsResult.value.error
      ? eventsResult.value.data || []
      : [];

  const modules =
    modulesResult.status === "fulfilled" && !modulesResult.value.error
      ? modulesResult.value.data || []
      : [];

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
    organizations,
    recentEvents,
    modules,
    health,
  };
}

function AccessDenied({ status, error }) {
  return (
    <div className="-mx-5 -my-5 min-h-[calc(100vh-61px)] bg-[#070707] px-5 py-10 text-white lg:-mx-7 lg:-my-6 lg:px-7">
      <div className="mx-auto max-w-3xl rounded-[24px] border border-white/[0.08] bg-[#0D0D0D] p-6">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#D6A66A]">
          Avantiqo Platform
        </div>
        <h1 className="mt-3 text-[28px] font-medium tracking-[-0.04em]">
          Platform administrator access required
        </h1>
        <p className="mt-3 text-[12px] leading-6 text-white/45">
          This control tower is restricted to active PLATFORM_OWNER and
          SUPER_ADMIN staff accounts.
        </p>
        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3 text-[11px] text-white/42">
          {status || 403} · {error || "Access denied"}
        </div>
      </div>
    </div>
  );
}

export default async function PlatformPage() {
  const runtime = await loadPlatformControlTower();

  if (!runtime.access?.success) {
    return (
      <AccessDenied
        status={runtime.access?.status}
        error={runtime.access?.error}
      />
    );
  }

  return (
    <PlatformControlTower
      organizations={runtime.organizations}
      recentEvents={runtime.recentEvents}
      modules={runtime.modules}
      health={runtime.health}
    />
  );
}
