const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_POD_RUNTIME_TELEMETRY_CONTRACT_V1";
const GRAPHQL = "https://api.runpod.io/graphql";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function redact(value) {
  return text(value)
    .slice(0, 2000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\brpa_[A-Za-z0-9._~+\/-]{8,}\b/g, "rpa_[REDACTED]")
    .replace(/\brps_[A-Za-z0-9._~+\/-]{8,}\b/g, "rps_[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?key|secret[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:api_key|token|key|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "READ_ONLY",
    diagnosis: "RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED",
    graphql_schema_verified: false,
    runpod_mutation_performed: false,
    pod_created: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=CREDENTIAL_REQUIRED`);
  process.exitCode = 2;
} else {
  const query = `query {
    myself {
      pods {
        id
        desiredStatus
        runtime {
          uptimeInSeconds
          ports {
            privatePort
            publicPort
            type
            isIpPublic
          }
          gpus {
            gpuUtilPercent
            memoryUtilPercent
          }
          container {
            cpuPercent
            memoryPercent
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(managementKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });

    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }

    const errors = list(body?.errors).map((entry) => redact(entry?.message)).filter(Boolean);
    if (!response.ok || errors.length) {
      console.log(JSON.stringify({
        success: false,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis: response.status === 401 || response.status === 403
          ? "RUNPOD_GRAPHQL_CREDENTIAL_REJECTED"
          : errors.length
            ? "RUNPOD_GRAPHQL_SCHEMA_OR_QUERY_REJECTED"
            : "RUNPOD_GRAPHQL_HTTP_ERROR",
        http_status: response.status,
        graphql_errors: errors.slice(0, 5),
        graphql_schema_verified: false,
        runpod_mutation_performed: false,
        pod_created: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=FAIL`);
      process.exitCode = 1;
    } else {
      const pods = list(object(body?.data)?.myself?.pods);
      const runtimePods = pods.filter((pod) => object(pod?.runtime)?.uptimeInSeconds != null);
      const registeredHttpPorts = pods.reduce((sum, pod) => (
        sum + list(object(pod?.runtime)?.ports).filter((port) => text(port?.type).toLowerCase() === "http").length
      ), 0);

      console.log(JSON.stringify({
        success: true,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis: "RUNPOD_GRAPHQL_RUNTIME_TELEMETRY_CONTRACT_VERIFIED",
        graphql_schema_verified: true,
        pod_query_verified: true,
        runtime_uptime_field_verified: true,
        runtime_ports_field_verified: true,
        runtime_gpu_metrics_field_verified: true,
        runtime_container_metrics_field_verified: true,
        visible_pod_count: pods.length,
        pods_with_runtime_telemetry: runtimePods.length,
        registered_http_port_count: registeredHttpPorts,
        runpod_mutation_performed: false,
        pod_created: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=PASS`);
    }
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      contract: CONTRACT,
      mode: "READ_ONLY",
      diagnosis: "RUNPOD_GRAPHQL_REQUEST_FAILED",
      error: redact(error?.message),
      graphql_schema_verified: false,
      runpod_mutation_performed: false,
      pod_created: false,
      inference_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    console.log(`${CONTRACT}=FAIL`);
    process.exitCode = 1;
  }
}
