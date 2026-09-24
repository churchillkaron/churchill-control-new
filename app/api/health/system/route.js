import { NextResponse } from "next/server";
import checkSystemHealth from "@/lib/health/checkSystemHealth";

export const dynamic = "force-dynamic";

function publicSystemHealth(health = {}) {
  const services = health?.services && typeof health.services === "object" ? health.services : {};
  const diagnosis = services?.business_diagnosis && typeof services.business_diagnosis === "object" ? services.business_diagnosis : null;
  return {
    status: health?.status || "unhealthy",
    runtime_state: health?.runtime_state || "unverified",
    timestamp: health?.timestamp || new Date().toISOString(),
    duration_ms: Number.isFinite(Number(health?.duration_ms)) ? Number(health.duration_ms) : 0,
    services: {
      database: services.database || null,
      queue: services.queue || null,
      business_diagnosis: diagnosis ? {
        status: diagnosis.ready === true ? "available" : "unavailable",
        ready: diagnosis.ready === true,
      } : null,
    },
  };
}

export async function GET() {
  try {
    const health = await checkSystemHealth();
    const publicHealth = publicSystemHealth(health);

    return NextResponse.json(publicHealth, {
      status: health.status === "healthy" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: "System health unavailable",
      },
      {
        status: 500,
        headers: { "cache-control": "no-store" },
      }
    );
  }
}

export { publicSystemHealth };
