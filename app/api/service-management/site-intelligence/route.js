export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";

const DEFAULT_LOOKBACK_DAYS = 365;
const MAX_LOOKBACK_DAYS = 1095;
const MAX_OCCURRENCES = 2000;
const TERMINAL = new Set(["completed", "cancelled", "canceled", "archived"]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function millis(value) {
  return dateValue(value)?.getTime() || 0;
}

function latest(left, right) {
  return millis(right) > millis(left) ? right : left;
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Site intelligence could not be loaded." },
    { status: error?.status || status },
  );
}

function siteKey(delivery = {}) {
  const locationId = text(delivery.customer_location_id, 160);
  if (locationId) return `location:${locationId}`;
  const partyId = text(delivery.customer_party_id, 160) || "customer";
  const name = normalized(delivery.customer_location_name || "site") || "site";
  return `fallback:${partyId}:${name}`;
}

function ageDays(value, now) {
  const timestamp = millis(value);
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - timestamp) / 86400000);
}

function recencyWeight(value, now) {
  const age = ageDays(value, now);
  if (age <= 30) return 3;
  if (age <= 90) return 2;
  if (age <= 180) return 1;
  return 0.5;
}

function trendFor(recent, previous) {
  if (recent > 0 && previous === 0) return "new";
  if (recent >= previous * 1.5 && recent > previous) return "increasing";
  if (previous >= recent * 1.5 && previous > recent) return "decreasing";
  return "steady";
}

function ensureSite(map, delivery) {
  const key = siteKey(delivery);
  if (!map.has(key)) {
    map.set(key, {
      site_key: key,
      customer_party_id: text(delivery.customer_party_id, 160) || null,
      customer_name: text(delivery.customer_name, 220) || "Customer",
      customer_location_id: text(delivery.customer_location_id, 160) || null,
      customer_location_name: text(delivery.customer_location_name, 220) || "Site not named",
      visit_count: 0,
      treatment_visit_count: 0,
      finding_count: 0,
      application_count: 0,
      high_severity_count: 0,
      last_service_at: null,
      last_treatment_at: null,
      pressure_points: 0,
      pests: new Map(),
      devices: new Map(),
      materials: new Map(),
      history: [],
    });
  }
  return map.get(key);
}

function pestEntry(site, pestName) {
  const key = normalized(pestName) || "unknown";
  if (!site.pests.has(key)) {
    site.pests.set(key, {
      key,
      pest_name: text(pestName, 120) || "Unknown pest",
      findings: 0,
      visit_ids: new Set(),
      max_severity: 0,
      last_seen_at: null,
      areas: new Set(),
      recent_90: 0,
      previous_90: 0,
    });
  }
  return site.pests.get(key);
}

function deviceEntry(site, deviceName) {
  const key = normalized(deviceName) || "device";
  if (!site.devices.has(key)) {
    site.devices.set(key, {
      key,
      device: text(deviceName, 120),
      visit_ids: new Set(),
      application_count: 0,
      last_seen_at: null,
      last_area: null,
      materials: new Set(),
      target_pests: new Set(),
      methods: new Set(),
    });
  }
  return site.devices.get(key);
}

function materialEntry(site, materialName) {
  const key = normalized(materialName) || "material";
  if (!site.materials.has(key)) {
    site.materials.set(key, { key, material_name: text(materialName, 180), applications: 0, last_used_at: null });
  }
  return site.materials.get(key);
}

function finalizeSite(site, now) {
  const pests = [...site.pests.values()].map((pest) => ({
    pest_name: pest.pest_name,
    finding_count: pest.findings,
    visit_count: pest.visit_ids.size,
    max_severity: pest.max_severity,
    last_seen_at: pest.last_seen_at,
    areas: [...pest.areas].slice(0, 8),
    trend: trendFor(pest.recent_90, pest.previous_90),
    recent_90_findings: pest.recent_90,
    previous_90_findings: pest.previous_90,
  })).sort((a, b) => {
    if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
    if (b.max_severity !== a.max_severity) return b.max_severity - a.max_severity;
    return millis(b.last_seen_at) - millis(a.last_seen_at);
  });

  const devices = [...site.devices.values()].map((device) => ({
    device: device.device,
    visit_count: device.visit_ids.size,
    application_count: device.application_count,
    last_seen_at: device.last_seen_at,
    last_area: device.last_area,
    materials: [...device.materials].slice(0, 8),
    target_pests: [...device.target_pests].slice(0, 8),
    methods: [...device.methods].slice(0, 8),
  })).sort((a, b) => millis(b.last_seen_at) - millis(a.last_seen_at));

  const materials = [...site.materials.values()]
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 10);

  const repeatPestCount = pests.filter((row) => row.visit_count >= 2).length;
  const recentHighSeverity = pests.some((row) => row.max_severity >= 4 && ageDays(row.last_seen_at, now) <= 90);
  const activityIndex = Math.min(100, Math.round(site.pressure_points + (repeatPestCount * 8) + (site.high_severity_count * 4)));
  const pressureState = recentHighSeverity || activityIndex >= 60
    ? "high"
    : repeatPestCount > 0 || activityIndex >= 25
      ? "watch"
      : "low";

  const topPest = pests[0] || null;
  const nextVisitBrief = topPest
    ? `${topPest.pest_name}${topPest.visit_count >= 2 ? ` has repeated across ${topPest.visit_count} visits` : " is the latest recorded pressure"}${topPest.areas.length ? `; recheck ${topPest.areas.slice(0, 2).join(" and ")}` : ""}.`
    : devices.length
      ? `No pest finding is driving this site. Recheck observed device${devices.length === 1 ? "" : "s"}: ${devices.slice(0, 3).map((row) => row.device).join(", ")}.`
      : "No repeated pest pressure has been recorded in the selected history window.";

  return {
    site_key: site.site_key,
    customer_party_id: site.customer_party_id,
    customer_name: site.customer_name,
    customer_location_id: site.customer_location_id,
    customer_location_name: site.customer_location_name,
    visit_count: site.visit_count,
    treatment_visit_count: site.treatment_visit_count,
    finding_count: site.finding_count,
    application_count: site.application_count,
    high_severity_count: site.high_severity_count,
    repeat_pest_count: repeatPestCount,
    observed_device_count: devices.length,
    last_service_at: site.last_service_at,
    last_treatment_at: site.last_treatment_at,
    activity_index: activityIndex,
    pressure_state: pressureState,
    needs_attention: pressureState !== "low",
    top_pests: pests.slice(0, 4),
    pests,
    devices,
    materials,
    next_visit_brief: nextVisitBrief,
    history: site.history
      .sort((a, b) => millis(b.occurrence_at) - millis(a.occurrence_at))
      .slice(0, 24),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const requestedDays = Number(input.lookbackDays || input.lookback_days || DEFAULT_LOOKBACK_DAYS);
    const lookbackDays = Math.max(30, Math.min(Number.isFinite(requestedDays) ? requestedDays : DEFAULT_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS));
    const now = Date.now();
    const from = input.from || new Date(now - (lookbackDays * 86400000)).toISOString();
    const to = input.to || new Date(now).toISOString();

    const rows = await listServiceOccurrences({
      organizationId: resolved.context.organization_id,
      from,
      to,
      limit: MAX_OCCURRENCES,
    });

    const visible = rows.filter((row) => (
      !resolved.context.entity_id
      || !row.entity_id
      || row.entity_id === resolved.context.entity_id
    ));

    const sites = new Map();
    for (const occurrence of visible) {
      const delivery = occurrence.attributes?.service_delivery || {};
      if (!delivery.customer_party_id && !delivery.customer_location_id && !delivery.customer_location_name) continue;

      const site = ensureSite(sites, delivery);
      const occurrenceAt = occurrence.completed_at || occurrence.occurrence_at || occurrence.updated_at || null;
      site.visit_count += 1;
      site.last_service_at = latest(site.last_service_at, occurrenceAt);

      const treatment = occurrence.attributes?.service_treatment || null;
      const findings = Array.isArray(treatment?.pest_findings) ? treatment.pest_findings : [];
      const applications = Array.isArray(treatment?.applications) ? treatment.applications : [];
      if (treatment) {
        site.treatment_visit_count += 1;
        site.last_treatment_at = latest(site.last_treatment_at, treatment.updated_at || treatment.captured_at || occurrenceAt);
      }

      const visitPests = new Set();
      let maxSeverity = 0;
      for (const finding of findings) {
        const activityType = normalized(finding.activity_type);
        if (activityType === "none") continue;
        const pestName = text(finding.pest_name, 120);
        if (!pestName) continue;

        const pest = pestEntry(site, pestName);
        const severity = Number.isFinite(Number(finding.severity)) ? Number(finding.severity) : 1;
        const findingAt = treatment?.updated_at || treatment?.captured_at || occurrenceAt;
        const age = ageDays(findingAt, now);

        pest.findings += 1;
        pest.visit_ids.add(occurrence.id);
        pest.max_severity = Math.max(pest.max_severity, severity);
        pest.last_seen_at = latest(pest.last_seen_at, findingAt);
        if (text(finding.area, 160)) pest.areas.add(text(finding.area, 160));
        if (age <= 90) pest.recent_90 += 1;
        else if (age <= 180) pest.previous_90 += 1;

        site.finding_count += 1;
        if (severity >= 4) site.high_severity_count += 1;
        site.pressure_points += Math.max(1, severity) * recencyWeight(findingAt, now);
        maxSeverity = Math.max(maxSeverity, severity);
        visitPests.add(pestName);
      }

      const visitDevices = new Set();
      for (const application of applications) {
        site.application_count += 1;
        const applicationAt = treatment?.updated_at || treatment?.captured_at || occurrenceAt;
        const materialName = text(application.material_name, 180);
        if (materialName) {
          const material = materialEntry(site, materialName);
          material.applications += 1;
          material.last_used_at = latest(material.last_used_at, applicationAt);
        }

        const deviceName = text(application.device, 120);
        if (deviceName) {
          const device = deviceEntry(site, deviceName);
          device.visit_ids.add(occurrence.id);
          device.application_count += 1;
          device.last_seen_at = latest(device.last_seen_at, applicationAt);
          if (text(application.treatment_area, 200)) device.last_area = text(application.treatment_area, 200);
          if (materialName) device.materials.add(materialName);
          for (const target of Array.isArray(application.target_pests) ? application.target_pests : []) {
            if (text(target, 120)) device.target_pests.add(text(target, 120));
          }
          if (text(application.application_method, 120)) device.methods.add(text(application.application_method, 120));
          visitDevices.add(deviceName);
        }
      }

      site.history.push({
        occurrence_id: occurrence.id,
        occurrence_at: occurrenceAt,
        occurrence_status: occurrence.status || null,
        closed: TERMINAL.has(normalized(occurrence.status)),
        service_name: text(delivery.service_name, 180) || "Service visit",
        finding_count: findings.length,
        application_count: applications.length,
        pests: [...visitPests].slice(0, 8),
        devices: [...visitDevices].slice(0, 8),
        max_severity: maxSeverity,
        treatment_status: treatment?.status || null,
      });
    }

    const siteRows = [...sites.values()]
      .map((site) => finalizeSite(site, now))
      .sort((a, b) => {
        if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
        if (b.activity_index !== a.activity_index) return b.activity_index - a.activity_index;
        return millis(b.last_service_at) - millis(a.last_service_at);
      });

    const observedDevices = new Set();
    for (const site of siteRows) for (const device of site.devices) observedDevices.add(`${site.site_key}:${normalized(device.device)}`);

    return Response.json({
      success: true,
      window: { from, to, lookback_days: lookbackDays },
      occurrence_count: visible.length,
      metrics: {
        sites: siteRows.length,
        attention_sites: siteRows.filter((site) => site.needs_attention).length,
        repeat_pressure_sites: siteRows.filter((site) => site.repeat_pest_count > 0).length,
        high_severity_findings: siteRows.reduce((sum, site) => sum + site.high_severity_count, 0),
        observed_devices: observedDevices.size,
        treatment_visits: siteRows.reduce((sum, site) => sum + site.treatment_visit_count, 0),
      },
      sites: siteRows,
      authority: {
        source: "service_plan_occurrences.attributes.service_treatment",
        device_semantics: "observed-in-treatment-history",
        note: "This view derives site and device intelligence from governed service history; it does not create a parallel customer, asset or inventory source of truth.",
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
