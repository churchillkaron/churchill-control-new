export const dynamic = "force-dynamic";

import PlatformAdminConsole from "@/components/platform/PlatformAdminConsole";
import PlatformCommercialRuntimeControl from "@/components/platform/PlatformCommercialRuntimeControl";
import checkSystemHealth from "@/lib/health/checkSystemHealth";
import loadVercelDeploymentHistory from "@/lib/platform/release/loadVercelDeploymentHistory";
import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function rowsFrom(result) {
  return result.status === "fulfilled" && !result.value.error
    ? result.value.data || []
    : [];
}

function releaseState() {
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
  };
}

function unavailableReleaseHistory(source, error = null) {
  return {
    status: "unverified",
    source,
    checkedAt: new Date().toISOString(),
    deployments: [],
    error,
  };
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
      wallets: [],
      walletTransactions: [],
      providers: [],
      subscriptions: [],
      queueJobs: [],
      deadLetterJobs: [],
      releaseState: releaseState(),
      releaseHistory: unavailableReleaseHistory("PLATFORM_ADMIN_ACCESS_REQUIRED"),
      health: {
        status: "degraded",
        runtime_state: "unverified",
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
    walletsResult,
    walletTransactionsResult,
    subscriptionsResult,
    queueJobsResult,
    deadLetterJobsResult,
    healthResult,
    releaseHistoryResult,
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
    supabaseAdmin
      .from("organization_wallets")
      .select("*")
      .order("organization_id", { ascending: true }),
    supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("subscriptions")
      .select("id,organization_id,company,email,currency,billing_cycle,subtotal,discount_total,final_monthly_total,final_yearly_total,selected_modules,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("queue_jobs")
      .select("id,organization_id,type,priority,status,error_message,retry_count,max_retries,worker_name,locked_at,started_at,completed_at,scheduled_for,dead_letter,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("dead_letter_jobs")
      .select("id,original_job_id,type,failed_at")
      .order("failed_at", { ascending: false })
      .limit(500),
    checkSystemHealth(),
    loadVercelDeploymentHistory(),
  ]);

  const health =
    healthResult.status === "fulfilled"
      ? healthResult.value
      : {
          status: "degraded",
          runtime_state: "unverified",
          timestamp: new Date().toISOString(),
          duration_ms: 0,
          services: {},
        };

  const releaseHistory =
    releaseHistoryResult.status === "fulfilled"
      ? releaseHistoryResult.value
      : unavailableReleaseHistory(
          "VERCEL_DEPLOYMENT_HISTORY_PROMISE_REJECTED",
          releaseHistoryResult.reason?.message || "Deployment history unavailable",
        );

  return {
    access,
    organizations: rowsFrom(organizationsResult),
    recentEvents: rowsFrom(eventsResult),
    modules: rowsFrom(modulesResult),
    staff: rowsFrom(staffResult),
    recentUsage: rowsFrom(usageResult),
    wallets: rowsFrom(walletsResult),
    walletTransactions: rowsFrom(walletTransactionsResult),
    subscriptions: rowsFrom(subscriptionsResult),
    queueJobs: rowsFrom(queueJobsResult),
    deadLetterJobs: rowsFrom(deadLetterJobsResult),
    releaseState: releaseState(),
    releaseHistory,
    providers: Object.values(PROVIDER_REGISTRY).map(provider => ({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      connectionModel: provider.connectionModel || "managed",
      capabilities: provider.capabilities || [],
      runtime: provider.runtime || null,
      runtimeAvailable: provider.runtimeAvailable === true,
      active: provider.active !== false,
    })),
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
    <>
      <PlatformAdminConsole
        organizations={runtime.organizations}
        recentEvents={runtime.recentEvents}
        modules={runtime.modules}
        staff={runtime.staff}
        recentUsage={runtime.recentUsage}
        wallets={runtime.wallets}
        walletTransactions={runtime.walletTransactions}
        providers={runtime.providers}
        health={runtime.health}
      />
      <PlatformCommercialRuntimeControl
        subscriptions={runtime.subscriptions}
        queueJobs={runtime.queueJobs}
        deadLetterJobs={runtime.deadLetterJobs}
        organizations={runtime.organizations}
        releaseState={runtime.releaseState}
        releaseHistory={runtime.releaseHistory}
        queueHealth={runtime.health?.services?.queue || {}}
      />
    </>
  );
}
