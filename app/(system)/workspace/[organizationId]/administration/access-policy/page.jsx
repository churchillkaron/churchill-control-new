"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Crosshair,
  KeyRound,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
import { distanceMeters } from "@/lib/people/workforce/locationMath";

const EMPTY_POLICY = {
  access: {
    organization_access_enabled: true,
    staff_portal_enabled: true,
  },
  workforce: {
    early_clock_in_minutes: "",
    late_threshold_minutes: "",
    gps_clock_in_required: false,
    passkey_clock_in_required: false,
    clock_in_site_latitude: "",
    clock_in_site_longitude: "",
    clock_in_radius_meters: "",
    location_accuracy_max_meters: "",
  },
};

function normalizePolicy(policy = {}) {
  return {
    access: {
      organization_access_enabled:
        policy?.access?.organization_access_enabled !== false,
      staff_portal_enabled: policy?.access?.staff_portal_enabled !== false,
    },
    workforce: {
      early_clock_in_minutes:
        policy?.workforce?.early_clock_in_minutes ?? "",
      late_threshold_minutes:
        policy?.workforce?.late_threshold_minutes ?? "",
      gps_clock_in_required:
        policy?.workforce?.gps_clock_in_required === true,
      passkey_clock_in_required:
        policy?.workforce?.passkey_clock_in_required === true,
      clock_in_site_latitude:
        policy?.workforce?.clock_in_site_latitude ?? "",
      clock_in_site_longitude:
        policy?.workforce?.clock_in_site_longitude ?? "",
      clock_in_radius_meters:
        policy?.workforce?.clock_in_radius_meters ?? "",
      location_accuracy_max_meters:
        policy?.workforce?.location_accuracy_max_meters ?? "",
    },
  };
}

function optionalNumber(value) {
  return value === "" ? null : Number(value);
}

function locationErrorMessage(locationError) {
  const messageByCode = {
    1: "Location permission was denied. Allow location access and try again.",
    2: "The device could not determine its current location.",
    3: "Location capture timed out. Move to an area with a stronger GPS signal and try again.",
  };

  return (
    messageByCode[locationError?.code] ||
    "Unable to capture the current business location."
  );
}

export default function OrganizationAccessPolicyPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [capturedAccuracy, setCapturedAccuracy] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const locationReadiness = useMemo(() => {
    const latitude = optionalNumber(policy.workforce.clock_in_site_latitude);
    const longitude = optionalNumber(policy.workforce.clock_in_site_longitude);
    const radius = optionalNumber(policy.workforce.clock_in_radius_meters);
    const maxAccuracy = optionalNumber(
      policy.workforce.location_accuracy_max_meters
    );
    const coordinatesConfigured =
      Number.isFinite(latitude) && Number.isFinite(longitude);
    const geofenceConfigured =
      coordinatesConfigured && Number.isFinite(radius) && radius >= 1;

    return {
      latitude,
      longitude,
      radius,
      maxAccuracy,
      coordinatesConfigured,
      geofenceConfigured,
    };
  }, [policy.workforce]);

  async function loadPolicy() {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/administration/access-policy?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load organization policy");
      }

      setPolicy(normalizePolicy(result.policy));
      setCapturedAccuracy(null);
      setTestResult(null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load organization policy");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicy();
  }, [organizationId]);

  function updateAccess(key, value) {
    setPolicy((current) => ({
      ...current,
      access: { ...current.access, [key]: value },
    }));
  }

  function updateWorkforce(key, value) {
    setTestResult(null);
    setPolicy((current) => ({
      ...current,
      workforce: { ...current.workforce, [key]: value },
    }));
  }

  function captureCurrentLocation() {
    setError("");
    setMessage("");
    setTestResult(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device or browser does not provide GPS location access.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        const accuracy = Number(position.coords.accuracy || 0);

        setPolicy((current) => ({
          ...current,
          workforce: {
            ...current.workforce,
            clock_in_site_latitude: latitude,
            clock_in_site_longitude: longitude,
          },
        }));
        setCapturedAccuracy(accuracy);
        setMessage(
          `Current business location captured with approximately ${Math.round(accuracy)} m device accuracy. Review the radius, then save the policy.`
        );
        setLocating(false);
      },
      (locationError) => {
        setError(locationErrorMessage(locationError));
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  function testCurrentLocation() {
    setError("");
    setMessage("");
    setTestResult(null);

    if (!locationReadiness.geofenceConfigured) {
      setError(
        "Configure valid site coordinates and an allowed radius before testing the geofence."
      );
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device or browser does not provide GPS location access.");
      return;
    }

    setTesting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy || 0);
        const distance = distanceMeters(
          latitude,
          longitude,
          locationReadiness.latitude,
          locationReadiness.longitude
        );
        const withinRadius = distance <= locationReadiness.radius;
        const accuracyAccepted =
          locationReadiness.maxAccuracy === null ||
          !Number.isFinite(locationReadiness.maxAccuracy) ||
          accuracy <= locationReadiness.maxAccuracy;

        setTestResult({
          distance,
          accuracy,
          withinRadius,
          accuracyAccepted,
          passed: withinRadius && accuracyAccepted,
        });
        setTesting(false);
      },
      (locationError) => {
        setError(locationErrorMessage(locationError));
        setTesting(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function savePolicy() {
    setError("");
    setMessage("");

    for (const [value, label] of [
      [policy.workforce.early_clock_in_minutes, "Early clock-in minutes"],
      [policy.workforce.late_threshold_minutes, "Late threshold minutes"],
    ]) {
      if (value !== "") {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 0) {
          setError(`${label} must be a non-negative whole number or left blank.`);
          return;
        }
      }
    }

    const latitude = optionalNumber(policy.workforce.clock_in_site_latitude);
    const longitude = optionalNumber(policy.workforce.clock_in_site_longitude);
    const radius = optionalNumber(policy.workforce.clock_in_radius_meters);
    const maxAccuracy = optionalNumber(policy.workforce.location_accuracy_max_meters);

    if ((latitude === null) !== (longitude === null)) {
      setError("Clock-in site latitude and longitude must be configured together.");
      return;
    }
    if (
      latitude !== null &&
      (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    ) {
      setError("Clock-in site latitude must be between -90 and 90.");
      return;
    }
    if (
      longitude !== null &&
      (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    ) {
      setError("Clock-in site longitude must be between -180 and 180.");
      return;
    }
    if (radius !== null && (!Number.isFinite(radius) || radius < 1)) {
      setError("Clock-in radius must be at least 1 meter or left blank.");
      return;
    }
    if (
      maxAccuracy !== null &&
      (!Number.isFinite(maxAccuracy) || maxAccuracy < 0)
    ) {
      setError("Maximum GPS accuracy must be zero or greater, or left blank.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/administration/access-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          access: policy.access,
          workforce: {
            early_clock_in_minutes:
              policy.workforce.early_clock_in_minutes === ""
                ? null
                : Number(policy.workforce.early_clock_in_minutes),
            late_threshold_minutes:
              policy.workforce.late_threshold_minutes === ""
                ? null
                : Number(policy.workforce.late_threshold_minutes),
            gps_clock_in_required: policy.workforce.gps_clock_in_required,
            passkey_clock_in_required:
              policy.workforce.passkey_clock_in_required,
            clock_in_site_latitude: latitude,
            clock_in_site_longitude: longitude,
            clock_in_radius_meters: radius,
            location_accuracy_max_meters: maxAccuracy,
          },
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save organization policy");
      }

      setPolicy(normalizePolicy(result.policy));
      setTestResult(null);
      setMessage("Organization access and workforce policy saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save organization policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-white/[0.045] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-[#D6A66A]">
                Administration · Access & Workforce
              </div>
              <h1 className="mt-3 text-4xl font-black">Organization Policy</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Configure each business independently: app access, workforce timing, identity verification, GPS requirements and its own clock-in site geofence.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPolicy}
              disabled={loading}
              className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </section>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <PolicyCard icon={<ShieldCheck className="h-5 w-5" />} title="App access">
            <Toggle
              label="Organization app access"
              description="When disabled, normal users cannot enter this organization. Owners and recovery administrators retain access so the organization cannot lock itself out."
              checked={policy.access.organization_access_enabled}
              onChange={(value) => updateAccess("organization_access_enabled", value)}
            />
            <Toggle
              label="Staff portal access"
              description="Controls entry for staff-only roles. Workspace administrators are unaffected by this staff portal switch."
              checked={policy.access.staff_portal_enabled}
              onChange={(value) => updateAccess("staff_portal_enabled", value)}
            />
          </PolicyCard>

          <PolicyCard icon={<TimerReset className="h-5 w-5" />} title="Workforce timing">
            <NumberField
              label="Early clock-in minutes"
              value={policy.workforce.early_clock_in_minutes}
              onChange={(value) => updateWorkforce("early_clock_in_minutes", value)}
              description="Leave blank for no early clock-in restriction."
            />
            <NumberField
              label="Late threshold minutes"
              value={policy.workforce.late_threshold_minutes}
              onChange={(value) => updateWorkforce("late_threshold_minutes", value)}
              description="Leave blank to record minutes after scheduled start without classifying the shift as late."
            />
          </PolicyCard>

          <PolicyCard icon={<KeyRound className="h-5 w-5" />} title="Clock-in identity">
            <Toggle
              label="Require passkey verification for clock-in"
              description="Staff must verify the passkey registered to their own Supabase account immediately before starting a shift. The device may use Face ID, Touch ID, Windows Hello, a device PIN, or a hardware security key."
              checked={policy.workforce.passkey_clock_in_required}
              onChange={(value) => updateWorkforce("passkey_clock_in_required", value)}
            />
            <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.05] p-4 text-xs leading-5 text-violet-100/65">
              Enroll staff passkeys first in Workforce Profile before requiring this verification. Biometric templates stay on the employee device and are never stored by Avantiqo.
            </div>
          </PolicyCard>

          <PolicyCard icon={<MapPin className="h-5 w-5" />} title="Clock-in location">
            <Toggle
              label="Require GPS for clock-in"
              description="Staff must provide a fresh browser GPS reading before a shift can start. The server validates and stores the evidence."
              checked={policy.workforce.gps_clock_in_required}
              onChange={(value) => updateWorkforce("gps_clock_in_required", value)}
            />

            <LocationReadinessCard
              gpsRequired={policy.workforce.gps_clock_in_required}
              coordinatesConfigured={locationReadiness.coordinatesConfigured}
              geofenceConfigured={locationReadiness.geofenceConfigured}
              radius={locationReadiness.radius}
              maxAccuracy={locationReadiness.maxAccuracy}
            />

            <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-4">
              <div className="text-sm font-semibold text-white/80">Business clock-in point</div>
              <p className="mt-1 text-xs leading-5 text-white/40">
                Stand at the normal staff clock-in location and capture the current coordinates. They are saved only for this organization.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={captureCurrentLocation}
                  disabled={locating || testing}
                  className="flex h-11 items-center gap-2 rounded-xl border border-[#D6A66A]/30 bg-black/20 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#F3D2A7] disabled:opacity-40"
                >
                  <Crosshair className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} />
                  {locating ? "Capturing..." : "Use current location"}
                </button>
                <button
                  type="button"
                  onClick={testCurrentLocation}
                  disabled={locating || testing || !locationReadiness.geofenceConfigured}
                  className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 text-xs font-black uppercase tracking-[0.14em] text-white/70 disabled:opacity-40"
                >
                  <TestTube2 className={`h-4 w-4 ${testing ? "animate-pulse" : ""}`} />
                  {testing ? "Testing..." : "Test current location"}
                </button>
              </div>
              {capturedAccuracy !== null ? (
                <div className="mt-2 text-xs text-white/45">
                  Last capture accuracy: approximately {Math.round(capturedAccuracy)} m.
                </div>
              ) : null}
              {testResult ? <LocationTestResult result={testResult} radius={locationReadiness.radius} maxAccuracy={locationReadiness.maxAccuracy} /> : null}
            </div>

            <NumberField
              label="Work site latitude"
              value={policy.workforce.clock_in_site_latitude}
              onChange={(value) => updateWorkforce("clock_in_site_latitude", value)}
              description="Per-business latitude. Configure together with longitude to enable a geofence."
              step="any"
              min="-90"
            />
            <NumberField
              label="Work site longitude"
              value={policy.workforce.clock_in_site_longitude}
              onChange={(value) => updateWorkforce("clock_in_site_longitude", value)}
              description="Per-business longitude. Configure together with latitude to enable a geofence."
              step="any"
              min="-180"
            />
            <NumberField
              label="Allowed radius in meters"
              value={policy.workforce.clock_in_radius_meters}
              onChange={(value) => updateWorkforce("clock_in_radius_meters", value)}
              description="When coordinates and a radius are configured, clock-in is rejected outside this distance."
              min="1"
              step="any"
            />
            <NumberField
              label="Maximum GPS accuracy in meters"
              value={policy.workforce.location_accuracy_max_meters}
              onChange={(value) => updateWorkforce("location_accuracy_max_meters", value)}
              description="Reject weak staff GPS readings above this reported accuracy."
              step="any"
            />
          </PolicyCard>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={savePolicy}
            disabled={loading || saving || locating || testing}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Policy"}
          </button>
        </div>
      </div>
    </main>
  );
}

function LocationReadinessCard({
  gpsRequired,
  coordinatesConfigured,
  geofenceConfigured,
  radius,
  maxAccuracy,
}) {
  let title = "GPS not required";
  let description = "Staff clock-in can proceed without GPS evidence for this organization.";
  let tone = "neutral";

  if (gpsRequired && !coordinatesConfigured) {
    title = "GPS required · no site configured";
    description = "GPS evidence is mandatory, but there is no business clock-in point yet. Staff location will be recorded without a site-boundary check.";
    tone = "warning";
  } else if (gpsRequired && coordinatesConfigured && !geofenceConfigured) {
    title = "GPS required · geofence incomplete";
    description = "Site coordinates are configured, but an allowed radius is still required before outside-site clock-ins can be rejected.";
    tone = "warning";
  } else if (gpsRequired && geofenceConfigured) {
    title = "GPS + geofence ready";
    description = `Staff must be within approximately ${Math.round(radius)} m of the saved business point${Number.isFinite(maxAccuracy) ? ` with device accuracy of ${Math.round(maxAccuracy)} m or better` : ""}.`;
    tone = "success";
  } else if (!gpsRequired && geofenceConfigured) {
    title = "Geofence configured · GPS policy off";
    description = "The site boundary is ready, but it is not enforced until Require GPS for clock-in is enabled.";
  }

  const classes =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/80"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-100/80"
        : "border-white/10 bg-white/[0.025] text-white/55";

  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : MapPin;

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <p className="mt-1 text-xs leading-5 opacity-75">{description}</p>
    </div>
  );
}

function LocationTestResult({ result, radius, maxAccuracy }) {
  const classes = result.passed
    ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/80"
    : "border-red-400/20 bg-red-400/[0.06] text-red-100/80";
  const Icon = result.passed ? CheckCircle2 : TriangleAlert;

  return (
    <div className={`mt-3 rounded-xl border p-3 ${classes}`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
        <Icon className="h-4 w-4" /> {result.passed ? "Geofence test passed" : "Geofence test failed"}
      </div>
      <div className="mt-2 space-y-1 text-xs leading-5 opacity-80">
        <div>
          Distance from saved site: approximately {Math.round(result.distance)} m · allowed {Math.round(radius)} m.
        </div>
        <div>
          Device accuracy: approximately {Math.round(result.accuracy)} m
          {Number.isFinite(maxAccuracy) ? ` · required ${Math.round(maxAccuracy)} m or better.` : "."}
        </div>
        {!result.withinRadius ? <div>This device is currently outside the configured work-site radius.</div> : null}
        {!result.accuracyAccepted ? <div>The GPS reading is not accurate enough for the configured policy.</div> : null}
      </div>
    </div>
  );
}

function PolicyCard({ icon, title, children }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white/75">
        {icon} {title}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <span>
        <span className="block text-sm font-semibold text-white/80">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/35">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, description, min = "0", step = "1" }) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="text-sm font-semibold text-white/80">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-white/35">{description}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Not configured"
        className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none"
      />
    </label>
  );
}

function Notice({ tone, children }) {
  const classes =
    tone === "error"
      ? "border-red-500/20 bg-red-500/10 text-red-200"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
