export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";

const DEFAULT_LOOKBACK_DAYS = 365;
const MAX_LOOKBACK_DAYS = 1095;
const MAX_OCCURRENCES = 2000;
const TERMINAL = new Set(["completed", "cancelled", "canceled", "archived"]);
const ACTIVE_CHECK_STATUSES = new Set(["recorded", "validated"]);
const CONDITION_ALERTS = new Set(["damaged", "missing", "blocked", "contaminated", "replacement_required"]);

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

function monitoringSeverity(level) {
  return ({ none: 0, low: 1, medium: 2, high: 4, critical: 5 })[normalized(level)] ?? 0;
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
      monitoring_point_count: 0,
      monitoring_check_count: 0,
      monitoring_alert_count: 0,
      last_service_at: null,
      last_treatment_at: null,
      last_monitoring_at: null,
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
      point_id: null,
      point_type: null,
      barcode: null,
      status: null,
      visit_ids: new Set(),
      application_count: 0,
      monitoring_check_count: 0,
      last_seen_at: null,
      last_area: null,
      condition: null,
      activity_level: null,
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

async function loadMonitoringHistory(context, from, to) {
  const [equipmentResponse, activityResponse] = await Promise.all([
    serverOperationsApi.list({ capabilityId: "equipment", context }),
    serverOperationsApi.list({
      capabilityId: "activities",
      context,
      filters: { source_domain: "service-management", source_type: "monitoring-point-check" },
    }),
  ]);

  if (equipmentResponse.status >= 400 || !equipmentResponse.body?.ok) {
    throw new Error(equipmentResponse.body?.error || "Operational monitoring equipment could not be loaded.");
  }
  if (activityResponse.status >= 400 || !activityResponse.body?.ok) {
    throw new Error(activityResponse.body?.error || "Monitoring check history could not be loaded.");
  }

  const points = (equipmentResponse.body.rows || []).filter((record) => record.attributes?.monitoring_point?.industry_key === "pest-control");
  const pointsById = new Map(points.map((record) => [record.id, record]));
  const fromMs = millis(from);
  const toMs = millis(to) || Date.now();
  const checks = (activityResponse.body.rows || []).filter((record) => {
    if (!pointsById.has(record.source_id)) return false;
    if (!ACTIVE_CHECK_STATUSES.has(normalized(record.status))) return false;
    const check = record.attributes?.monitoring_point_check;
    if (!check) return false;
    const checkedAt = millis(check.checked_at || record.created_at);
    return checkedAt >= fromMs && checkedAt <= toMs;
  });

  return { points, pointsById, checks };
}

function applyMonitoringHistory({ sites, monitoring, now }) {
  for (const record of monitoring.points) {
    const point = record.attributes?.monitoring_point || {};
    if (!point.customer_location_id && !point.customer_party_id) continue;
    const site = ensureSite(sites, {
      customer_party_id: point.customer_party_id,
      customer_name: point.customer_name,
      customer_location_id: point.customer_location_id,
      customer_location_name: point.customer_location_name,
    });
    const device = deviceEntry(site, point.code || record.name || record.id);
    device.point_id = record.id;
    device.point_type = point.point_type || null;
    device.barcode = point.barcode || null;
    device.status = record.status || null;
    device.last_area = point.area || device.last_area;
    site.monitoring_point_count += 1;
  }

  for (const activity of monitoring.checks) {
    const check = activity.attributes?.monitoring_point_check || {};
    const equipment = monitoring.pointsById.get(activity.source_id);
    const point = equipment?.attributes?.monitoring_point || {};
    if (!equipment || (!point.customer_location_id && !point.customer_party_id)) continue;

    const site = ensureSite(sites, {
      customer_party_id: point.customer_party_id,
      customer_name: point.customer_name,
      customer_location_id: point.customer_location_id,
      customer_location_name: point.customer_location_name,
    });
    const checkedAt = check.checked_at || activity.created_at || null;
    const severity = monitoringSeverity(check.activity_level);
    const conditionAlert = CONDITION_ALERTS.has(normalized(check.condition));
    const device = deviceEntry(site, point.code || equipment.name || equipment.id);

    site.monitoring_check_count += 1;
    site.last_monitoring_at = latest(site.last_monitoring_at, checkedAt);
    site.last_service_at = latest(site.last_service_at, checkedAt);
    if (severity >= 4 || conditionAlert) site.monitoring_alert_count += 1;
    site.pressure_points += (severity * recencyWeight(checkedAt, now)) + (conditionAlert ? 4 * recencyWeight(checkedAt, now) : 0);

    device.point_id = equipment.id;
    device.point_type = point.point_type || null;
    device.barcode = point.barcode || null;
    device.status = equipment.status || null;
    device.monitoring_check_count += 1;
    device.last_seen_at = latest(device.last_seen_at, checkedAt);
    device.last_area = point.area || device.last_area;
    device.condition = check.condition || device.condition;
    device.activity_level = check.activity_level || device.activity_level;
    if (text(check.pest_name, 120)) device.target_pests.add(text(check.pest_name, 120));
    device.methods.add(text(check.action_taken, 120) || "inspected");

    const pestName = text(check.pest_name, 120);
    if (pestName && severity > 0) {
      const pest = pestEntry(site, pestName);
      const age = ageDays(checkedAt, now);
      pest.findings += 1;
      pest.visit_ids.add(`monitoring:${activity.id}`);
      pest.max_severity = Math.max(pest.max_severity, severity);
      pest.last_seen_at = latest(pest.last_seen_at, checkedAt);
      if (text(point.area, 160)) pest.areas.add(text(point.area, 160));
      if (age <= 90) pest.recent_90 += 1;
      else if (age <= 180) pest.previous_90 += 1;
      site.finding_count += 1;
      if (severity >= 4) site.high_severity_count += 1;
    }

    site.history.push({
      occurrence_id: `monitoring:${activity.id}`,
      occurrence_at: checkedAt,
      occurrence_status: activity.status || "recorded",
      closed: true,
      service_name: `Monitoring · ${point.code || equipment.name || "point"}`,
      finding_count: pestName && severity > 0 ? 1 : 0,
      application_count: 0,
      pests: pestName && severity > 0 ? [pestName] : [],
      devices: [point.code || equipment.name || "Monitoring point"],
      max_severity: severity,
      treatment_status: null,
      monitoring_condition: check.condition || null,
      monitoring_activity_level: check.activity_level || null,
      monitoring_action: check.action_taken || null,
    });
  }
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
    point_id: device.point_id,
    point_type: device.point_type,
    barcode: device.barcode,
    status: device.status,
    visit_count: device.visit_ids.size,
    application_count: device.application_count,
    monitoring_check_count: device.monitoring_check_count,
    last_seen_at: device.last_seen_at,
    last_area: device.last_area,
    condition: device.condition,
    activity_level: device.activity_level,
    materials: [...device.materials].slice(0, 8),
    target_pests: [...device.target_pests].slice(0, 8),
    methods: [...device.methods].filter(Boolean).slice(0, 8),
  })).sort((a, b) => millis(b.last_seen_at) - millis(a.last_seen_at));

  const materials = [...site.materials.values()]
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 10);

  const repeatPestCount = pests.filter((row) => row.visit_count >= 2).length;
  const recentHighSeverity = pests.some((row) => row.max_severity >= 4 && ageDays(row.last_seen_at, now) <= 90);
  const monitoringAlert = site.monitoring_alert_count > 0 && ageDays(site.last_monitoring_at, now) <= 90;
  const activityIndex = Math.min(100, Math.round(site.pressure_points + (repeatPestCount * 8) + (site.high_severity_count * 4)));
  const pressureState = recentHighSeverity || monitoringAlert || activityIndex >= 60
    ? "high"
    : repeatPestCount > 0 || activityIndex >= 25
      ? "watch"
      : "low";

  const topPest = pests[0] || null;
  const alertDevice = devices.find((row) => ["high", "critical"].includes(normalized(row.activity_level)) || CONDITION_ALERTS.has(normalized(row.condition)));
  const nextVisitBrief = alertDevice
    ? `${alertDevice.device} needs attention${alertDevice.activity_level ? `: ${text(alertDevice.activity_level).replaceAll("_", " ")} pest activity` : ""}${alertDevice.condition && normalized(alertDevice.condition) !== "good" ? `, condition ${text(alertDevice.condition).replaceAll("_", " ")}` : ""}${alertDevice.last_area ? ` at ${alertDevice.last_area}` : ""}.`
    : topPest
      ? `${topPest.pest_name}${topPest.visit_count >= 2 ? ` has repeated across ${topPest.visit_count} observations` : " is the latest recorded pressure"}${topPest.areas.length ? `; recheck ${topPest.areas.slice(0, 2).join(" and ")}` : ""}.`
      : devices.length
        ? `No pest pressure is driving this site. Recheck ${devices.slice(0, 3).map((row) => row.device).join(", ")} on their governed cadence.`
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
    monitoring_point_count: site.monitoring_point_count,
    monitoring_check_count: site.monitoring_check_count,
    monitoring_alert_count: site.monitoring_alert_count,
    repeat_pest_count: repeatPestCount,
    observed_device_count: devices.length,
    last_service_at: site.last_service_at,
    last_treatment_at: site.last_treatment_at,
    last_monitoring_at: site.last_monitoring_at,
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
      .slice(0, 36),
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

    const [rows, monitoring] = await Promise.all([
      listServiceOccurrences({
        organizationId: resolved.context.organization_id,
        from,
        to,
        limit: MAX_OCCURRENCES,
      }),
      loadMonitoringHistory(resolved.context, from, to),
    ]);

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

    applyMonitoringHistory({ sites, monitoring, now });

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
      monitoring_check_count: monitoring.checks.length,
      metrics: {
        sites: siteRows.length,
        attention_sites: siteRows.filter((site) => site.needs_attention).length,
        repeat_pressure_sites: siteRows.filter((site) => site.repeat_pest_count > 0).length,
        high_severity_findings: siteRows.reduce((sum, site) => sum + site.high_severity_count, 0),
        observed_devices: observedDevices.size,
        treatment_visits: siteRows.reduce((sum, site) => sum + site.treatment_visit_count, 0),
        monitoring_points: monitoring.points.length,
        monitoring_checks: monitoring.checks.length,
        monitoring_alerts: siteRows.reduce((sum, site) => sum + site.monitoring_alert_count, 0),
      },
      sites: siteRows,
      authority: {
        sources: [
          "service_plan_occurrences.attributes.service_treatment",
          "operations.equipment.attributes.monitoring_point",
          "operations.activities.attributes.monitoring_point_check",
        ],
        device_semantics: "governed-monitoring-equipment-plus-treatment-observation",
        note: "Site intelligence combines governed service treatment history with canonical Operations monitoring equipment and append-only check evidence. It does not create a parallel customer, asset or inventory source of truth.",
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
