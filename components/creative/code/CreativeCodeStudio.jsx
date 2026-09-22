"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Code2, Eye, ExternalLink, GitBranch, GitCommit, GitCompare, MessageSquare, Monitor, PlugZap, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCodeProgressFeed } from "@/components/operator/CodeProgressFeedProvider";
import AvantiqoCodeIDE from "@/components/creative/code/AvantiqoCodeIDE";

const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new";
const MAX_RESUMES = 24;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value) {
  return String(value ?? "").trim();
}

function statusCopy(progress, fallback = "Ready") {
  const latest = progress?.latest_event;
  return latest?.description || latest?.phase || progress?.state_status || fallback;
}

function humanStatus(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Working";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CreativeCodeStudio({ organizationId }) {
  const {
    progress,
    active: liveProgressActive,
    requestRefresh,
  } = useCodeProgressFeed();
  const [studioView, setStudioView] = useState("talk");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [repositoryUrl, setRepositoryUrl] = useState(DEFAULT_REPOSITORY);
  const [ref, setRef] = useState("main");
  const [objective, setObjective] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [workspaceTarget, setWorkspaceTarget] = useState("SANDBOX");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [allowedRoot, setAllowedRoot] = useState("");
  const [pairing, setPairing] = useState(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [deliveryResult, setDeliveryResult] = useState(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [releaseDeploymentId, setReleaseDeploymentId] = useState("");
  const [releasePreviewUrl, setReleasePreviewUrl] = useState("");
  const [releaseBaselineUrl, setReleaseBaselineUrl] = useState("");
  const [releaseShadowPaths, setReleaseShadowPaths] = useState("/");
  const [releaseReplaySelector, setReleaseReplaySelector] = useState("body");
  const [releaseInvariantCommand, setReleaseInvariantCommand] = useState("node");
  const [releaseInvariantArgs, setReleaseInvariantArgs] = useState("--test");
  const [releaseCertificationBusy, setReleaseCertificationBusy] = useState(false);
  const [releaseCertificationStatus, setReleaseCertificationStatus] = useState("");
  const [releaseCertificationResult, setReleaseCertificationResult] = useState(null);
  const [rollingBusy, setRollingBusy] = useState(false);
  const [rollingStatus, setRollingStatus] = useState("");
  const [rollingResult, setRollingResult] = useState(null);
  const [rollingPolicyBusy, setRollingPolicyBusy] = useState(false);
  const [rollingPolicyResult, setRollingPolicyResult] = useState(null);
  const [rollingPolicyStatus, setRollingPolicyStatus] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!running && !liveProgressActive) return;
    setStatus(statusCopy(progress, running ? "Working" : "Following active mission"));
  }, [liveProgressActive, progress, running]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    fetch(`/api/operator/code/devices?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin" })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || body?.success !== true) return;
        const next = Array.isArray(body.devices) ? body.devices : [];
        setDevices(next);
        if (!deviceId) {
          const online = next.find((device) => device.online === true);
          if (online) setDeviceId(online.id);
        }
      })
      .catch(() => null);
    const timer = window.setInterval(() => {
      fetch(`/api/operator/code/devices?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin" })
        .then((response) => response.json())
        .then((body) => { if (!cancelled && body?.success === true) setDevices(Array.isArray(body.devices) ? body.devices : []); })
        .catch(() => null);
    }, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [organizationId, deviceId]);

  async function createPairing() {
    if (!organizationId || pairingBusy || !allowedRoot.trim()) return;
    setPairingBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/operator/code/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId, allowed_roots: [allowedRoot.trim()] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Device pairing failed");
      setPairing(body);
    } catch (pairError) {
      setError(pairError?.message || "Device pairing failed");
    } finally {
      setPairingBusy(false);
    }
  }

  async function runDelivery(mode) {
    const executionKey = result?.execution_key;
    const message = commitMessage.trim();
    if (!executionKey || !message || deliveryBusy) return;
    setDeliveryBusy(true);
    setDeliveryResult(null);
    setError(null);
    setDeliveryStatus(mode === "release"
      ? "Committing verified change and releasing production…"
      : mode === "review"
        ? "Creating verified review branch and draft pull request…"
        : "Committing verified change…");
    try {
      const endpoint = mode === "release"
        ? "/api/operator/code/release"
        : mode === "review"
          ? "/api/operator/code/review"
          : "/api/operator/code/commit";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          execution_key: executionKey,
          commit_message: message,
          ...(mode === "review" ? { title: message } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Code delivery failed");
      setDeliveryResult(body.result || body);
      setDeliveryStatus(mode === "release"
        ? (body.result?.deployment?.rolling_release_active === true
          ? `Verified production canary active at ${body.result.deployment.rolling_release_percentage || 0}%`
          : body.result?.production_deployed === true
            ? "Committed and production deployment verified"
            : "Commit verified; deployment is still settling")
        : mode === "review"
          ? "Verified draft pull request created; merge remains separately governed"
          : "Commit verified on GitHub");
    } catch (deliveryError) {
      setError(deliveryError?.message || "Code delivery failed");
      setDeliveryStatus("Delivery stopped");
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function runReleaseCertification() {
    const executionKey = result?.execution_key;
    const deploymentId = releaseDeploymentId.trim();
    const previewUrl = releasePreviewUrl.trim();
    const baselineUrl = releaseBaselineUrl.trim();
    const shadowPaths = releaseShadowPaths.split(",").map((item) => item.trim()).filter(Boolean);
    const invariantCommand = releaseInvariantCommand.trim();
    const invariantArgs = releaseInvariantArgs.trim().split(/\s+/).filter(Boolean);
    if (!executionKey || !deploymentId || !previewUrl || !baselineUrl || !deviceId || !shadowPaths.length || !invariantCommand || releaseCertificationBusy) return;
    const baselineScreenshotPath = [...verification].reverse().find((item) => item?.screenshot_path)?.screenshot_path || null;
    setReleaseCertificationBusy(true);
    setReleaseCertificationResult(null);
    setReleaseCertificationStatus("Certifying exact review deployment…");
    setError(null);
    try {
      const response = await fetch("/api/operator/code/release-certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          execution_key: executionKey,
          deployment_id: deploymentId,
          preview_url: previewUrl,
          baseline_url: baselineUrl,
          device_id: deviceId,
          browser_steps: [{ id: "release-replay", action: "assert_visible", selector: releaseReplaySelector.trim() || "body" }],
          baseline_screenshot_path: baselineScreenshotPath,
          visual_threshold: 0.01,
          shadow_paths: shadowPaths,
          invariant_commands: [{ command: invariantCommand, args: invariantArgs, cwd: ".", timeout_ms: 180000 }],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Release certification failed");
      const certification = body.result || body;
      setReleaseCertificationResult(certification);
      setReleaseCertificationStatus("Preview, shadow, invariant and browser certification verified");
      setResult((current) => current ? {
        ...current,
        release_certification: certification,
        engineering_precision_os: certification.engineering_precision_os || current.engineering_precision_os,
        state: {
          ...(current.state || {}),
          precision_evidence: certification.precision_evidence || current.state?.precision_evidence || {},
          engineering_precision_os: certification.engineering_precision_os || current.state?.engineering_precision_os || current.engineering_precision_os || null,
        },
      } : current);
    } catch (certificationError) {
      setError(certificationError?.message || "Release certification failed");
      setReleaseCertificationStatus("Release certification stopped");
    } finally {
      setReleaseCertificationBusy(false);
    }
  }

  async function runRollingPolicy(operation) {
    if (rollingPolicyBusy) return;
    setRollingPolicyBusy(true);
    setError(null);
    setRollingPolicyStatus(operation === "configure" ? "Configuring Vercel safe rolling-release policy…" : "Checking Vercel rolling-release policy…");
    try {
      const response = await fetch("/api/operator/code/rolling-release-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId, operation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Rolling policy action failed");
      const next = body.result || body;
      setRollingPolicyResult(next);
      const compliant = operation === "configure" ? next?.configured?.verified?.verified === true : next?.compliant === true;
      setRollingPolicyStatus(compliant ? "Safe rollout policy verified: 5 → 25 → 100 with automatic rollback" : `Policy not ready${next?.error ? ` · ${next.error}` : ""}`);
    } catch (policyError) {
      setError(policyError?.message || "Rolling policy action failed");
      setRollingPolicyStatus("Rolling policy stopped");
    } finally {
      setRollingPolicyBusy(false);
    }
  }

  async function runRollingRelease(operation) {
    const executionKey = result?.execution_key;
    const canaryId = deliveryResult?.deployment?.deployment_id;
    const commitSha = deliveryResult?.commit?.commit_sha || deliveryResult?.commit_sha;
    if (!executionKey || !canaryId || !commitSha || rollingBusy) return;
    const current = rollingResult?.current_state || rollingResult?.rolling_release || null;
    const nextStageIndex = current?.next_stage_index;
    if (operation === "advance" && !Number.isInteger(Number(nextStageIndex))) {
      setError("Rolling release has no verified next stage to approve.");
      return;
    }
    setRollingBusy(true);
    setError(null);
    setRollingStatus(operation === "status" ? "Reading production canary state…" : operation === "advance" ? "Approving the next verified canary stage…" : "Completing the verified canary to 100%…");
    try {
      const response = await fetch("/api/operator/code/rolling-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          execution_key: executionKey,
          operation,
          canary_deployment_id: canaryId,
          expected_commit_sha: commitSha,
          ...(operation === "advance" ? { next_stage_index: Number(nextStageIndex) } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Rolling release action failed");
      const next = body.result || body;
      setRollingResult(next);
      const state = next.current_state || next.rolling_release || {};
      const percentage = Number(state.current_canary_percentage || 0);
      setRollingStatus(operation === "complete" ? "Rolling release completed at 100%" : `Production canary verified at ${percentage}%`);
    } catch (rollingError) {
      setError(rollingError?.message || "Rolling release action failed");
      setRollingStatus("Rolling release stopped");
    } finally {
      setRollingBusy(false);
    }
  }

  async function runMission() {
    const trimmedObjective = objective.trim();
    if (!trimmedObjective || running || liveProgressActive) return;

    setRunning(true);
    setResult(null);
    setError(null);
    setStatus(workspaceTarget === "DEVICE" ? "Connecting to the selected computer and inspecting the repository…" : "Opening governed workspace and inspecting the repository…");
    requestRefresh();

    const executionKey = `code-studio:${crypto.randomUUID()}`;
    let resumeState = null;

    try {
      for (let attempt = 0; attempt < MAX_RESUMES; attempt += 1) {
        const response = await fetch("/api/operator/code/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            organizationId,
            objective: trimmedObjective,
            repository_url: repositoryUrl.trim(),
            ref: ref.trim() || "main",
            workspace_target: workspaceTarget,
            device_id: workspaceTarget === "DEVICE" ? deviceId : null,
            execution_key: executionKey,
            resume_state: resumeState,
            reasoning_call_budget: 4,
            max_employee_passes: 8,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Code mission failed (${response.status})`);
        if (!mounted.current) return;

        setResult(body);
        setStatus(body.status === "planner_pending"
          ? "Reasoning job is still running — following the same job…"
          : body.status || "Working");
        requestRefresh();

        if (body.resume_required === true && body.resume_state) {
          resumeState = body.resume_state;
          await wait(1400);
          continue;
        }

        if (body.status === "completed" && body.customer_artifact?.verified_complete === true) {
          setCommitMessage((current) => current || `Code Studio: ${trimmedObjective}`.slice(0, 200));
        }
        if (body.status === "completed" && body.customer_artifact?.verified_complete === true && body.engineering_operating_system?.engineering_os_ready !== false) {
          setStatus("Completed and verified");
        } else if (body.status === "completed" && body.customer_artifact?.verified_complete === true) {
          setStatus("Implementation verified · engineering department proof still incomplete");
        } else if (body.status === "completed") {
          setStatus("Completed");
        } else {
          setStatus(body.reason || body.status || "Stopped");
        }
        requestRefresh();
        return;
      }
      throw new Error("Code mission resume limit reached. The same mission can be resumed; no second mission was started.");
    } catch (missionError) {
      if (!mounted.current) return;
      setError(missionError?.message || "Code mission failed");
      setStatus("Stopped");
    } finally {
      if (mounted.current) setRunning(false);
      requestRefresh();
    }
  }

  const artifact = result?.customer_artifact || null;
  const files = Array.isArray(artifact?.files_changed) ? artifact.files_changed : [];
  const verification = Array.isArray(artifact?.verification) ? artifact.verification : [];
  const blockers = Array.isArray(artifact?.blockers) ? artifact.blockers : [];
  const engineeringOS = result?.engineering_operating_system || result?.state?.engineering_operating_system || null;
  const engineeringDepartments = Array.isArray(engineeringOS?.department_readiness) ? engineeringOS.department_readiness : [];
  const engineeringOSReady = engineeringOS ? engineeringOS.engineering_os_ready === true : true;
  const precisionOS = result?.engineering_precision_os || result?.state?.engineering_precision_os || null;
  const precisionReadiness = Array.isArray(precisionOS?.readiness) ? precisionOS.readiness : [];
  const precisionOSReady = precisionOS ? precisionOS.precision_ready === true : true;
  const precisionEvidence = result?.state?.precision_evidence || {};
  const uiAffected = files.some((filePath) => /(^|\/)(app|pages|components|src\/app)\//i.test(filePath) || /\.(jsx|tsx|css|scss)$/i.test(filePath));
  const requiredReleasePrecision = [
    "staging_canary",
    "progressive_rollback",
    "business_invariants",
    "shadow_verification",
    ...(uiAffected ? ["user_flow_replay", "visual_regression", "accessibility"] : []),
  ];
  const releasePrecisionReady = requiredReleasePrecision.every((key) => {
    const evidence = precisionEvidence?.[key];
    return evidence?.recorded === true && evidence?.passed !== false && evidence?.verified !== false;
  });
  const governedDeliveryReady = Boolean(artifact?.commit_ready && engineeringOSReady && precisionOSReady);
  const liveFiles = Array.isArray(progress?.files_changed) ? progress.files_changed : [];
  const liveEvents = Array.isArray(progress?.events) ? progress.events.slice(-8).reverse() : [];
  const businessPartnerHref = organizationId ? `/workspace/${organizationId}` : "#";

  return (
    <main
      className="min-h-screen bg-[#080808] px-5 py-6 text-white md:px-8 md:py-8"
      data-avantiqo-code-progress-consumer="shared-provider"
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-[#D6A66A]">Creative · Code</div>
            <h1 className="text-3xl font-light tracking-[-0.035em] md:text-4xl">Code Studio</h1>
            <p className="mt-2 max-w-3xl text-sm font-light leading-6 text-white/55">
              Tell Avantiqo what to build or fix. Business Partner remains the control plane; Code Studio gives you the live engineering, verification and diff view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              data-avantiqo-business-partner-link="true"
              href={businessPartnerHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/55 transition hover:border-[#D6A66A]/35 hover:text-[#e7c497]"
            >
              <ArrowLeft size={12} />
              Business Partner
            </Link>
            <Link
              href={`/workspace/${organizationId}/creative/code/developer`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/55 transition hover:border-[#D6A66A]/35 hover:text-[#e7c497]"
            >
              <Monitor size={12} />
              Developer Mode
            </Link>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D6A66A]/35 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[11px] text-[#e7c497]">
              <ShieldCheck size={12} />
              Governed engineering · commit and deploy gated
            </div>
          </div>
        </header>

        <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {[
            { id: "talk", label: "Talk", icon: MessageSquare },
            { id: "code", label: "Code", icon: Code2 },
            { id: "preview", label: "Preview", icon: Eye },
            { id: "changes", label: "Changes", icon: GitCompare },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStudioView(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] transition ${studioView === id ? "bg-[#D6A66A]/12 text-[#e7c497]" : "text-white/40 hover:bg-white/[0.035] hover:text-white/65"}`}
            >
              <Icon size={12}/>
              {label}
            </button>
          ))}
          <div className="ml-auto text-[10px] text-white/25">One project session · one active Code mission</div>
        </nav>

        <section className={studioView === "talk" || studioView === "code" ? "block" : "hidden"}>
          <AvantiqoCodeIDE
            organizationId={organizationId}
            embedded
            studioView={studioView}
            onStudioViewChange={setStudioView}
            onPreviewUrlChange={(url) => {
              setPreviewUrl(url);
              setPreviewRefreshKey((value) => value + 1);
            }}
          />
        </section>

        {studioView === "preview" ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Preview</div>
                <div className="mt-1 text-[10px] text-white/22">Same project session · refresh after Code or manual edits</div>
              </div>
              <input
                value={previewUrl}
                onChange={(event) => setPreviewUrl(event.target.value)}
                placeholder="http://localhost:3000 or preview URL"
                className="ml-auto min-w-[320px] flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 outline-none focus:border-[#D6A66A]/45"
              />
              <button type="button" onClick={() => setPreviewRefreshKey((value) => value + 1)} disabled={!previewUrl.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/45 disabled:opacity-25"><RefreshCw size={11}/> Refresh</button>
              {previewUrl.trim() ? <a href={previewUrl.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/45"><ExternalLink size={11}/> Open</a> : null}
              <button type="button" onClick={() => setStudioView("code")} className="rounded-lg border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-3 py-2 text-[10px] text-[#e7c497]">Back to Code</button>
            </div>
            {previewUrl.trim() ? (
              <iframe key={`${previewUrl}-${previewRefreshKey}`} title="Code Studio preview" src={previewUrl.trim()} className="mt-4 h-[720px] w-full rounded-xl border border-white/10 bg-white" />
            ) : (
              <div className="mt-4 flex h-[520px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/25">Open Preview from Code, or enter the running app URL here. The preview stays inside this same project session.</div>
            )}
          </section>
        ) : null}

        <div className={studioView === "changes" ? "block" : "hidden"}>
        {liveProgressActive && !running ? (
          <section
            data-avantiqo-shared-code-mission="true"
            className="rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.055] px-4 py-4 md:px-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#e7c497]">
                  <Activity size={12} className="animate-pulse" />
                  Shared Code mission · live
                </div>
                <div className="mt-2 max-w-4xl text-sm leading-6 text-white/75">
                  {progress?.objective || statusCopy(progress, "Avantiqo Code is working from Business Partner or another governed entry surface.")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/35">
                  {progress?.repository_url ? <span>{progress.repository_url}</span> : null}
                  {progress?.ref ? <span className="inline-flex items-center gap-1"><GitBranch size={10} /> {progress.ref}</span> : null}
                  {progress?.mission_id ? <span>Mission {progress.mission_id}</span> : null}
                </div>
              </div>
              <Link
                href={businessPartnerHref}
                className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/50 transition hover:border-[#D6A66A]/35 hover:text-[#e7c497]"
              >
                Steer in Business Partner
              </Link>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Mission</div>
                <div className="mt-1 text-sm text-white/65">One goal. Avantiqo handles the engineering loop.</div>
              </div>
              <div className={`h-2 w-2 rounded-full ${running || liveProgressActive ? "animate-pulse bg-[#D6A66A]" : "bg-white/25"}`} />
            </div>

            <label className="block text-[11px] uppercase tracking-[0.16em] text-white/35">Repository</label>
            <input
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              disabled={running || liveProgressActive}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">Branch / ref</label>
            <input
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              disabled={running || liveProgressActive}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">Engineering workspace</label>
            <select
              value={workspaceTarget}
              onChange={(event) => setWorkspaceTarget(event.target.value)}
              disabled={running || liveProgressActive}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            >
              <option value="SANDBOX">Avantiqo governed sandbox</option>
              <option value="DEVICE">Connected computer</option>
              <option value="LOCAL_COMPUTER">Local server computer</option>
            </select>

            {workspaceTarget === "DEVICE" ? (
              <div className="mt-3 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-3.5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#e7c497]"><Monitor size={12}/> Avantiqo Code Device</div>
                <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="mt-3 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white/75">
                  <option value="">Select connected computer</option>
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.display_name} · {device.online ? "online" : "offline"}</option>)}
                </select>
                <div className="mt-3 flex gap-2">
                  <input value={allowedRoot} onChange={(event) => setAllowedRoot(event.target.value)} placeholder="Allowed root, e.g. /Users/name/Projects" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white/75 placeholder:text-white/20"/>
                  <button type="button" onClick={createPairing} disabled={pairingBusy || !allowedRoot.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/35 px-3 text-[10px] text-[#e7c497] disabled:opacity-35"><PlugZap size={11}/>{pairingBusy ? "Creating…" : "Pair computer"}</button>
                </div>
                {pairing ? <div className="mt-3 rounded-lg border border-white/8 bg-black/35 p-3 text-[10px] leading-5 text-white/45"><div className="text-white/70">One-time pairing code</div><div className="mt-1 select-all break-all font-mono text-[#e7c497]">{pairing.pairing_code}</div><div className="mt-1">On the computer, run the Avantiqo Code Device agent once with this code. It can only access the allowed root above.</div></div> : null}
              </div>
            ) : null}

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">What should Code do?</label>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              disabled={running || liveProgressActive}
              placeholder="Example: Audit the invoice workspace, fix the broken mobile layout, add regression tests and verify the final diff."
              rows={9}
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm leading-6 text-white/85 outline-none transition placeholder:text-white/22 focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={runMission}
              disabled={running || liveProgressActive || !objective.trim() || !repositoryUrl.trim() || (workspaceTarget === "DEVICE" && !devices.some((device) => device.id === deviceId && device.online))}
              className="mt-4 w-full rounded-xl border border-[#D6A66A]/60 bg-[#D6A66A] px-4 py-3 text-sm font-medium text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {running ? "Code is working…" : liveProgressActive ? "Following active mission…" : "Run mission"}
            </button>

            {liveProgressActive && !running ? (
              <div className="mt-2 text-[10px] leading-4 text-white/35">
                A shared Code mission is already active. This surface follows it instead of starting a competing mission.
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Current state</div>
              <div className="mt-1.5 text-sm text-white/70">{status}</div>
              {progress?.files_changed?.length ? (
                <div className="mt-2 text-xs text-white/40">{progress.files_changed.length} file(s) changed in governed workspace</div>
              ) : null}
              {progress?.current_operation_id ? (
                <div className="mt-1 text-[10px] font-mono text-white/30">{progress.current_operation_id}</div>
              ) : null}
            </div>
            {error ? <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs leading-5 text-red-200/85">{error}</div> : null}
          </div>

          <div className="min-h-[560px] rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Engineering evidence</div>
                <div className="mt-1 text-sm text-white/65">Live work, verification and final source changes stay reviewable through commit and release.</div>
              </div>
              {artifact ? (
                <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${artifact.verified_complete ? "border-emerald-300/20 text-emerald-200/75" : "border-white/10 text-white/40"}`}>
                  {artifact.verified_complete ? "Verified" : artifact.status || "Working"}
                </div>
              ) : liveProgressActive ? (
                <div className="rounded-full border border-[#D6A66A]/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#e7c497]">
                  Live
                </div>
              ) : null}
            </div>

            {!artifact && !progress ? (
              <div className="flex min-h-[460px] items-center justify-center text-center">
                <div className="max-w-sm text-sm font-light leading-6 text-white/30">
                  Start here or delegate from Business Partner. Live files, verification evidence and the final diff will appear in this same workspace.
                </div>
              </div>
            ) : artifact ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Files" value={files.length} />
                  <Metric label="Checks passed" value={artifact.verification_passed_count || 0} />
                  <Metric label="Commit ready" value={governedDeliveryReady ? "Yes" : "No"} />
                </div>

                {engineeringDepartments.length ? <Panel title="Engineering OS · 17 departments"><div className="space-y-2">{engineeringDepartments.map((department) => <div key={department.id} className="flex items-start justify-between gap-3 text-xs"><span className="text-white/55">{department.id}. {department.name}</span><span className={department.required ? (department.satisfied ? "text-emerald-200/70" : "text-amber-100/80") : "text-white/25"}>{department.required ? (department.satisfied ? "PASS" : "REQUIRED") : "N/A"}</span></div>)}</div>{engineeringOSReady ? <div className="mt-3 text-[10px] text-emerald-200/65">All required engineering departments satisfied.</div> : <div className="mt-3 text-[10px] text-amber-100/70">Governed delivery remains blocked until every required department has evidence.</div>}</Panel> : null}

                {precisionReadiness.length ? <Panel title="Engineering Precision OS · 35 capabilities"><div className="space-y-2">{precisionReadiness.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 text-xs"><span className="text-white/55">{item.id}. {item.name}</span><span className={item.required ? (item.satisfied ? "text-emerald-200/70" : "text-amber-100/80") : "text-white/25"}>{item.required ? (item.satisfied ? "PASS" : "REQUIRED") : "N/A"}</span></div>)}</div>{precisionOSReady ? <div className="mt-3 text-[10px] text-emerald-200/65">All required precision capabilities satisfied.</div> : <div className="mt-3 text-[10px] text-amber-100/70">Commit/review remains blocked until required precision proof is present.</div>}<div className={releasePrecisionReady ? "mt-2 text-[10px] text-emerald-200/60" : "mt-2 text-[10px] text-amber-100/65"}>Production E-gate: {releasePrecisionReady ? "READY" : "preview/shadow/canary/rollback proof required"}</div></Panel> : null}

                {files.length ? <Panel title="Changed files"><ul className="space-y-1.5 text-xs text-white/65">{files.map((file) => <li key={file} className="font-mono">{file}</li>)}</ul></Panel> : null}
                {verification.length ? <Panel title="Verification"><div className="space-y-2">{verification.map((item, index) => <div key={`${item.operation_id || "check"}-${index}`} className="flex gap-3 text-xs"><span className={item.passed ? "text-emerald-200/70" : "text-red-200/70"}>{item.passed ? "PASS" : "FAIL"}</span><span className="font-mono text-white/50">{[item.command, ...(item.args || [])].filter(Boolean).join(" ") || item.operation_id}</span></div>)}</div></Panel> : null}
                {artifact.verified_complete === true ? <Panel title="Production rollout policy"><div className="space-y-3"><div className="text-[10px] leading-4 text-white/40">Production release requires Vercel stages 5% → 25% → 100%, manual stage approval, and an active health gate that automatically rolls back on failure.</div><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => runRollingPolicy("status")} disabled={rollingPolicyBusy} className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] text-white/55 disabled:opacity-30">Check policy</button><button type="button" onClick={() => runRollingPolicy("configure")} disabled={rollingPolicyBusy} className="rounded-lg border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-3 py-2 text-[10px] text-[#e7c497] disabled:opacity-30">Configure safe rollout policy</button></div>{rollingPolicyStatus ? <div className={`text-[10px] ${rollingPolicyResult?.compliant === true || rollingPolicyResult?.configured?.verified?.verified === true ? "text-emerald-200/65" : "text-white/40"}`}>{rollingPolicyStatus}</div> : null}</div></Panel> : null}
                {artifact.verified_complete === true ? <Panel title="Governed delivery"><div className="space-y-3"><input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} maxLength={200} placeholder="Commit message" className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><div className="grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => runDelivery("review")} disabled={deliveryBusy || !governedDeliveryReady || !commitMessage.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2.5 text-[10px] text-white/65 disabled:opacity-30"><GitCommit size={12}/> Create review PR</button><button type="button" onClick={() => runDelivery("commit")} disabled={deliveryBusy || !governedDeliveryReady || !commitMessage.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2.5 text-[10px] text-white/65 disabled:opacity-30"><GitCommit size={12}/> Commit verified change</button><button type="button" onClick={() => runDelivery("release")} disabled={deliveryBusy || !governedDeliveryReady || !releasePrecisionReady || !commitMessage.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2.5 text-[10px] text-[#e7c497] disabled:opacity-30"><Rocket size={12}/> Commit + deploy production</button></div>{deliveryStatus ? <div className="text-[10px] leading-4 text-white/45">{deliveryStatus}</div> : null}{deliveryResult?.commit_sha ? <div className="font-mono text-[10px] text-emerald-200/65">Commit {deliveryResult.commit_sha}</div> : null}{deliveryResult?.commit?.commit_sha ? <div className="font-mono text-[10px] text-emerald-200/65">Commit {deliveryResult.commit.commit_sha}</div> : null}{deliveryResult?.pull_request_url ? <a href={deliveryResult.pull_request_url} target="_blank" rel="noreferrer" className="block text-[10px] text-[#e7c497] underline underline-offset-2">Draft PR #{deliveryResult.pull_request_number}</a> : null}{deliveryResult?.deployment?.deployment_url ? <a href={deliveryResult.deployment.deployment_url} target="_blank" rel="noreferrer" className="block text-[10px] text-[#e7c497] underline underline-offset-2">{deliveryResult.deployment.deployment_url}</a> : null}</div></Panel> : null}
                {deliveryResult?.deployment?.rolling_release_active === true ? <Panel title="Production rolling release · 5 → 25 → 100"><div className="space-y-3"><div className="grid grid-cols-3 gap-2 text-[10px]"><div className="rounded border border-white/8 p-2"><div className="text-white/25">Canary</div><div className="mt-1 font-mono text-white/65">{deliveryResult.deployment.deployment_id}</div></div><div className="rounded border border-white/8 p-2"><div className="text-white/25">Traffic</div><div className="mt-1 text-[#e7c497]">{rollingResult?.current_state?.current_canary_percentage ?? deliveryResult.deployment.rolling_release_percentage ?? 0}%</div></div><div className="rounded border border-white/8 p-2"><div className="text-white/25">State</div><div className="mt-1 text-white/65">{rollingResult?.current_state?.state || deliveryResult.deployment.rolling_release_state || "ACTIVE"}</div></div></div><div className="grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => runRollingRelease("status")} disabled={rollingBusy} className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] text-white/55 disabled:opacity-30">Check rollout</button><button type="button" onClick={() => runRollingRelease("advance")} disabled={rollingBusy || !Number.isInteger(Number((rollingResult?.current_state || rollingResult?.rolling_release)?.next_stage_index)) || (rollingResult?.current_state || rollingResult?.rolling_release)?.next_stage_percentage === 100 || (rollingResult?.current_state || rollingResult?.rolling_release)?.next_stage_is_final === true} className="rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/8 px-3 py-2 text-[10px] text-[#e7c497] disabled:opacity-30">Approve next stage</button><button type="button" onClick={() => runRollingRelease("complete")} disabled={rollingBusy || Number(rollingResult?.current_state?.current_canary_percentage ?? deliveryResult?.deployment?.rolling_release_percentage ?? 0) !== 25} className="rounded-lg border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2 text-[10px] text-[#e7c497] disabled:opacity-30">Complete 100%</button></div>{rollingStatus ? <div className="text-[10px] text-white/45">{rollingStatus}</div> : null}<div className="text-[10px] leading-4 text-white/30">Every stage re-verifies the exact canary deployment and commit. Code AI and the developer terminal cannot advance production traffic.</div></div></Panel> : null}
                {deliveryResult?.pull_request_url ? <Panel title="Release certification · E gate"><div className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><input value={releaseDeploymentId} onChange={(event) => setReleaseDeploymentId(event.target.value)} placeholder="Vercel deployment ID" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><input value={releasePreviewUrl} onChange={(event) => setReleasePreviewUrl(event.target.value)} placeholder="Preview URL" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><input value={releaseBaselineUrl} onChange={(event) => setReleaseBaselineUrl(event.target.value)} placeholder="Current production baseline URL" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><input value={releaseShadowPaths} onChange={(event) => setReleaseShadowPaths(event.target.value)} placeholder="Shadow paths, comma separated" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><input value={releaseReplaySelector} onChange={(event) => setReleaseReplaySelector(event.target.value)} placeholder="Replay selector" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><div className="grid grid-cols-[90px_1fr] gap-2"><input value={releaseInvariantCommand} onChange={(event) => setReleaseInvariantCommand(event.target.value)} placeholder="node" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/><input value={releaseInvariantArgs} onChange={(event) => setReleaseInvariantArgs(event.target.value)} placeholder="--test tests/…" className="rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none focus:border-[#D6A66A]/45"/></div></div><button type="button" onClick={runReleaseCertification} disabled={releaseCertificationBusy || !releaseDeploymentId.trim() || !releasePreviewUrl.trim() || !releaseBaselineUrl.trim() || !deviceId || !releaseInvariantCommand.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2.5 text-[10px] text-[#e7c497] disabled:opacity-30"><ShieldCheck size={12}/> Certify exact preview for production</button>{releaseCertificationStatus ? <div className="text-[10px] text-white/45">{releaseCertificationStatus}</div> : null}{releaseCertificationResult?.review_commit_sha ? <div className="font-mono text-[10px] text-emerald-200/65">Certified {releaseCertificationResult.review_commit_sha}</div> : null}</div></Panel> : null}
                {blockers.length ? <Panel title="Remaining blockers"><ul className="space-y-1.5 text-xs text-amber-100/65">{blockers.map((item) => <li key={item}>{item}</li>)}</ul></Panel> : null}
                {artifact.patch ? <Panel title="Final diff"><pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-white/60">{artifact.patch}</pre></Panel> : null}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Files" value={liveFiles.length} />
                  <Metric label="Operations" value={progress?.completed_operation_count || 0} />
                  <Metric label="Blockers" value={progress?.blocker_count || 0} />
                </div>

                <Panel title="Live mission">
                  <div className="space-y-2 text-xs leading-5 text-white/55">
                    <div className="flex items-center justify-between gap-3">
                      <span>State</span>
                      <span className="text-white/75">{humanStatus(progress?.state_status)}</span>
                    </div>
                    {progress?.latest_event?.description ? <div className="border-t border-white/8 pt-2 text-white/65">{progress.latest_event.description}</div> : null}
                    {progress?.latest_test_command ? (
                      <div className="border-t border-white/8 pt-2 font-mono text-[11px] text-white/45">
                        {[progress.latest_test_command, ...(progress.latest_test_args || [])].filter(Boolean).join(" ")}
                        {progress.latest_test_exit_code !== null && progress.latest_test_exit_code !== undefined ? ` · exit ${progress.latest_test_exit_code}` : ""}
                      </div>
                    ) : null}
                  </div>
                </Panel>

                {liveFiles.length ? <Panel title="Files changed so far"><ul className="space-y-1.5 text-xs text-white/65">{liveFiles.map((file) => <li key={file} className="font-mono">{file}</li>)}</ul></Panel> : null}
                {liveEvents.length ? (
                  <Panel title="Recent engineering activity">
                    <div className="space-y-3">
                      {liveEvents.map((event, index) => (
                        <div key={`${event.at || "event"}-${event.operation_id || index}`} className="border-b border-white/7 pb-3 last:border-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/30">
                            <span>{humanStatus(event.phase)}</span>
                            {event.verification_passed === true ? <span className="text-emerald-200/60">PASS</span> : null}
                            {event.verification_passed === false ? <span className="text-red-200/60">FAIL</span> : null}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-white/55">{event.description || event.action || event.status || "Working"}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[9px] uppercase tracking-[0.15em] text-white/28">{label}</div><div className="mt-1 text-lg font-light text-white/75">{value}</div></div>;
}

function Panel({ title, children }) {
  return <section className="rounded-xl border border-white/8 bg-black/25 p-4"><div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[#D6A66A]/70">{title}</div>{children}</section>;
}
