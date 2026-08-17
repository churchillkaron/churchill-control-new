"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import captureDeviceLocation from "@/lib/shared/location/captureDeviceLocation";

function timeLabel(value) {
  if (!value) return "Flexible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Flexible";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function distanceLabel(value) {
  if (value === null || value === undefined) return null;
  if (value < 1000) return `${Math.round(value)} m from service location`;
  return `${(value / 1000).toFixed(1)} km from service location`;
}

function destinationValue(job) {
  if (job?.destinationCoordinates) {
    return `${job.destinationCoordinates.latitude},${job.destinationCoordinates.longitude}`;
  }
  return job?.destination || job?.locationName || null;
}

function navigationLinks(job) {
  const destination = destinationValue(job);
  if (!destination) return [];
  const encoded = encodeURIComponent(destination);
  const coordinates = job?.destinationCoordinates;

  return [
    {
      id: "google",
      label: "Google Maps",
      href: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    },
    {
      id: "apple",
      label: "Apple Maps",
      href: `https://maps.apple.com/?daddr=${encoded}`,
    },
    {
      id: "waze",
      label: "Waze",
      href: coordinates
        ? `https://waze.com/ul?ll=${encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`)}&navigate=yes`
        : `https://waze.com/ul?q=${encoded}&navigate=yes`,
    },
  ];
}

function statusLabel(job) {
  if (job.status === "in_progress") return `${job.actionNoun} in progress`;
  if (job.status === "paused") return `${job.actionNoun} paused`;
  if (job.status === "completed") return "Completed";
  return "Ready";
}

export default function MyDayPage() {
  const router = useRouter();
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [gpsResult, setGpsResult] = useState(null);
  const [navJobId, setNavJobId] = useState(null);

  async function loadMyDay() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/my-day", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load My Day");
      }
      setRuntime(data);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load My Day");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyDay();
  }, []);

  const jobs = runtime?.jobs || [];
  const nextJob = runtime?.next || null;
  const summary = runtime?.summary || { total: 0, completed: 0, remaining: 0 };
  const dateHeading = useMemo(() => {
    if (!runtime?.businessDate) return "Today";
    const date = new Date(`${runtime.businessDate}T12:00:00`);
    return date.toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [runtime?.businessDate]);

  async function startJob(job) {
    if (!runtime?.shiftActive) {
      setError("Start your shift before starting assigned work.");
      return;
    }

    setBusyId(job.id);
    setError("");
    setGpsResult(null);
    try {
      const location = await captureDeviceLocation();
      const response = await fetch("/api/staff/my-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: job.id, action: "start", location }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to start job");
      }
      setGpsResult({ jobId: job.id, action: "start", ...data.gps });
      router.push(`/workforce/my-day/${job.id}`);
    } catch (actionError) {
      setError(actionError?.message || "Unable to start job");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">My Day</div>
            <h1 className="mt-2 text-3xl font-black">{dateHeading}</h1>
            <p className="mt-2 text-sm text-white/45">
              {runtime?.shiftActive
                ? "You are on shift. Follow your assigned work in order."
                : "Start your shift on Home before beginning work."}
            </p>
          </div>
          <button
            type="button"
            onClick={loadMyDay}
            disabled={loading}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/60 disabled:opacity-40"
            aria-label="Refresh My Day"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric label="Jobs" value={summary.total} />
          <Metric label="Done" value={summary.completed} />
          <Metric label="Left" value={summary.remaining} />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.04]">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
        </div>
      ) : null}

      {!loading && !jobs.length ? (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
          <div className="mt-4 text-xl font-black">No assigned work today</div>
          <div className="mt-2 text-sm text-white/40">New assignments will appear here automatically.</div>
        </section>
      ) : null}

      {!loading && nextJob ? (
        <section className="rounded-[34px] border border-cyan-400/25 bg-cyan-500/[0.07] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
              {nextJob.status === "in_progress" ? "Current" : "Next"}
            </div>
            <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-white/55">
              {statusLabel(nextJob)}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-cyan-400/10 text-cyan-300">
              <Clock3 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-black">{timeLabel(nextJob.scheduledStart)}</div>
              <div className="mt-1 truncate text-xl font-black">{nextJob.customerName}</div>
              <div className="mt-1 text-sm text-white/50">{nextJob.serviceName}</div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && jobs.length ? (
        <section className="space-y-3">
          {jobs.map((job, index) => {
            const isBusy = busyId === job.id;
            const isCompleted = job.status === "completed";
            const isInProgress = job.status === "in_progress" || job.status === "paused";
            const links = navigationLinks(job);
            const gps = gpsResult?.jobId === job.id ? gpsResult : null;

            return (
              <article
                key={job.id}
                className={`rounded-[30px] border p-4 ${
                  isCompleted
                    ? "border-emerald-400/15 bg-emerald-400/[0.05]"
                    : isInProgress
                      ? "border-cyan-400/25 bg-cyan-400/[0.07]"
                      : "border-white/10 bg-white/[0.045]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-black/25 text-sm font-black text-white/70">{index + 1}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-[0.17em] text-white/35">
                        {timeLabel(job.scheduledStart)} · {job.actionNoun}
                      </div>
                      <div className="mt-1 truncate text-lg font-black">{job.customerName}</div>
                      <div className="mt-1 text-sm text-white/45">{job.serviceName}</div>
                    </div>
                  </div>
                  {isCompleted ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" /> : null}
                </div>

                {job.locationName ? (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-black/20 px-3 py-3 text-sm text-white/45">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <span>{job.locationName}</span>
                  </div>
                ) : null}

                {gps ? (
                  <div className={`mt-3 flex items-start gap-2 rounded-2xl px-3 py-3 text-xs ${
                    gps.verified === false
                      ? "border border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                      : "border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-100"
                  }`}>
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-black">GPS recorded at start</div>
                      <div className="mt-1 opacity-70">
                        {distanceLabel(gps.distanceFromDestinationMeters) || "Service location coordinates are not stored yet."}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!isCompleted ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        disabled={!links.length}
                        onClick={() => setNavJobId(navJobId === job.id ? null : job.id)}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.06] text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-30"
                      >
                        <Navigation className="h-4 w-4" /> Navigate <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {navJobId === job.id && links.length ? (
                        <div className="absolute bottom-14 left-0 right-0 z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#07101d] p-2 shadow-2xl">
                          {links.map((link) => (
                            <a
                              key={link.id}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-bold text-white/75 hover:bg-white/[0.06]"
                            >
                              {link.label}<ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {isInProgress ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/workforce/my-day/${job.id}`)}
                        className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-emerald-500 to-cyan-500 text-xs font-black uppercase tracking-[0.11em] text-white"
                      >
                        <Play className="h-4 w-4" /> Continue {job.actionNoun}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startJob(job)}
                        disabled={isBusy || !runtime?.shiftActive}
                        className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-cyan-500 text-xs font-black uppercase tracking-[0.11em] text-white disabled:opacity-35"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {isBusy ? "GPS..." : `Start ${job.actionNoun}`}
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-start gap-3">
          <Route className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <div>
            <div className="text-sm font-black">One simple workday</div>
            <div className="mt-1 text-xs leading-relaxed text-white/40">
              Start shift, navigate, start with GPS, follow the job protocol, capture evidence, complete with GPS, then continue to the next assignment.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/25 px-3 py-3 text-center">
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/35">{label}</div>
    </div>
  );
}
