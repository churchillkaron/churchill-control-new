import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { createStoredZip } from "@/lib/creative/documents/runtime/OpenXmlPackageRuntime";
import * as ProductionTaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  resolveSoftwareContract,
  softwareQualityFailures,
  softwareQualityPass,
  unwrapSoftwareOutput,
} from "./SoftwareContractRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function safe(value, fallback = "software") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function dependencyTasks(task, tasks) {
  const ids = new Set(list(task.depends_on));
  return tasks.filter((candidate) => ids.has(candidate.id));
}

async function writeSourceTree(directory, files) {
  for (const file of files) {
    const target = path.join(directory, ...file.path.split("/"));
    const resolved = path.resolve(target);
    const root = `${path.resolve(directory)}${path.sep}`;
    if (!resolved.startsWith(root)) {
      throw new Error(`CREATIVE_SOFTWARE_FILE_PATH_ESCAPE:${file.path}`);
    }
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const buffer = file.encoding === "base64"
      ? Buffer.from(file.content, "base64")
      : Buffer.from(file.content, "utf8");
    await fs.writeFile(resolved, buffer, { mode: 0o600 });
  }
}

function sandboxExecutable(task) {
  return task.input?.sandbox_policy?.executable ||
    task.metadata?.sandbox_policy?.executable ||
    process.env.CREATIVE_SOFTWARE_SANDBOX_EXECUTABLE ||
    null;
}

function runSandbox(executable, jobPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [jobPath], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH || "",
        NODE_ENV: "production",
      },
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_SOFTWARE_SANDBOX_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `CREATIVE_SOFTWARE_SANDBOX_EXIT_${code}`,
        ));
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function collectFiles(directory) {
  const output = [];
  async function walk(current, relative = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute, rel);
      else if (entry.isFile()) output.push({ name: rel, data: await fs.readFile(absolute) });
    }
  }
  await walk(directory);
  return output.sort((left, right) => left.name.localeCompare(right.name));
}

function verifyArtifactManifest(report, outputEntries) {
  const failures = [];
  const actual = new Map(outputEntries.map((entry) => [entry.name, checksum(entry.data)]));
  const declared = list(report.artifacts);
  if (!declared.length) failures.push("SOFTWARE_BUILD_ARTIFACT_REQUIRED");
  for (const artifact of declared) {
    const name = text(artifact.path || artifact.name).replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("../")) {
      failures.push("SOFTWARE_ARTIFACT_PATH_INVALID");
      continue;
    }
    if (!actual.has(name)) {
      failures.push(`SOFTWARE_ARTIFACT_MISSING:${name}`);
      continue;
    }
    if (!artifact.checksum || artifact.checksum !== actual.get(name)) {
      failures.push(`SOFTWARE_ARTIFACT_CHECKSUM_MISMATCH:${name}`);
    }
  }
  if (!outputEntries.length) failures.push("SOFTWARE_OUTPUT_FILES_REQUIRED");
  return failures;
}

function validateSandboxReport(
  report,
  identity,
  requirements,
  outputEntries,
  policyHash,
) {
  const failures = [];
  if (report.contract !== "AVANTIQO_SOFTWARE_SANDBOX_REPORT_V1") {
    failures.push("SOFTWARE_SANDBOX_REPORT_CONTRACT_INVALID");
  }
  if (report.job_id !== identity) failures.push("SOFTWARE_SANDBOX_JOB_ID_MISMATCH");
  if (!report.runner?.executor_id) failures.push("SOFTWARE_SANDBOX_EXECUTOR_ID_REQUIRED");
  if (report.runner?.policy_hash !== policyHash) {
    failures.push("SOFTWARE_SANDBOX_POLICY_HASH_MISMATCH");
  }
  if (report.isolation?.filesystem_isolated !== true) {
    failures.push("SOFTWARE_SANDBOX_FILESYSTEM_ISOLATION_REQUIRED");
  }
  if (report.isolation?.privilege_dropped !== true) {
    failures.push("SOFTWARE_SANDBOX_PRIVILEGE_DROP_REQUIRED");
  }
  if (report.isolation?.resource_limits_applied !== true) {
    failures.push("SOFTWARE_SANDBOX_RESOURCE_LIMITS_REQUIRED");
  }
  if (requirements.network_access) {
    if (report.network?.enabled !== true) failures.push("SOFTWARE_SANDBOX_NETWORK_ACCESS_REQUIRED");
    const actualHosts = list(report.network?.allowed_hosts).map(String).sort();
    const expectedHosts = [...requirements.allowed_network_hosts].sort();
    if (JSON.stringify(actualHosts) !== JSON.stringify(expectedHosts)) {
      failures.push("SOFTWARE_SANDBOX_NETWORK_HOST_POLICY_MISMATCH");
    }
  } else if (report.isolation?.network_disabled !== true || report.network?.enabled === true) {
    failures.push("SOFTWARE_SANDBOX_NETWORK_ISOLATION_REQUIRED");
  }
  if (requirements.build_required && report.build?.passed !== true) {
    failures.push("SOFTWARE_BUILD_FAILED");
  }
  if (requirements.test_required && report.tests?.passed !== true) {
    failures.push("SOFTWARE_TESTS_FAILED");
  }
  if (requirements.security_audit_required && report.security?.passed !== true) {
    failures.push("SOFTWARE_SECURITY_AUDIT_FAILED");
  }
  failures.push(...verifyArtifactManifest(report, outputEntries));
  return { passed: failures.length === 0, failures: [...new Set(failures)] };
}

async function upload(task, name, buffer, contentType, identity) {
  const bucket = task.input?.storage_policy?.bucket ||
    task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_SOFTWARE_BUILD_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("CREATIVE_SOFTWARE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(task.organization_id),
    safe(task.creative_project_id),
    "software",
    safe(task.metadata?.deliverable_id || task.id),
    identity,
    name,
  ].join("/");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    name,
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: checksum(buffer),
  };
}

function commandManifest(commands) {
  return Object.fromEntries(
    Object.entries(commands).map(([group, values]) => [
      group,
      values.map((command) => ({
        command: command.command,
        args: command.args,
        label: command.label,
      })),
    ]),
  );
}

export const CreativeSoftwareProductionRuntime = {
  async build(task) {
    if (!task?.organization_id || !task?.creative_project_id) {
      throw new Error("CREATIVE_SOFTWARE_CONTEXT_REQUIRED");
    }
    const tasks = await projectTasks(task);
    const dependencies = dependencyTasks(task, tasks);
    const contract = resolveSoftwareContract(task, dependencies);
    const commands = commandManifest(contract.commands);
    const policy = {
      network_access: contract.requirements.network_access,
      allowed_network_hosts: contract.requirements.allowed_network_hosts,
      filesystem_read_only_source: true,
      output_directory_only: true,
      drop_privileges: true,
      resource_limits_required: true,
    };
    const policyHash = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
    const identity = crypto.createHash("sha256").update(JSON.stringify({
      organization_id: task.organization_id,
      project_id: task.creative_project_id,
      deliverable_id: task.metadata?.deliverable_id || null,
      title: contract.title,
      runtime: contract.runtime,
      entrypoint: contract.entrypoint,
      files: contract.files,
      commands,
      requirements: contract.requirements,
      policy_hash: policyHash,
    })).digest("hex");
    const executable = sandboxExecutable(task);
    if (!executable) throw new Error("CREATIVE_SOFTWARE_SANDBOX_EXECUTABLE_REQUIRED");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-software-"));
    const sourceDirectory = path.join(root, "source");
    const outputDirectory = path.join(root, "output");
    const reportPath = path.join(root, "sandbox-report.json");
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.mkdir(outputDirectory, { recursive: true });
    try {
      await writeSourceTree(sourceDirectory, contract.files);
      const job = {
        contract: "AVANTIQO_SOFTWARE_SANDBOX_JOB_V1",
        job_id: identity,
        source_directory: sourceDirectory,
        output_directory: outputDirectory,
        report_path: reportPath,
        commands,
        runtime: contract.runtime,
        entrypoint: contract.entrypoint,
        policy,
        policy_hash: policyHash,
        requirements: contract.requirements,
      };
      const jobPath = path.join(root, "sandbox-job.json");
      await fs.writeFile(jobPath, JSON.stringify(job, null, 2), { mode: 0o600 });
      const execution = await runSandbox(
        executable,
        jobPath,
        Number(task.input?.sandbox_policy?.timeout_ms || task.metadata?.sandbox_policy?.timeout_ms || 600000),
      );
      const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      const outputEntries = await collectFiles(outputDirectory);
      const audit = validateSandboxReport(
        report,
        identity,
        contract.requirements,
        outputEntries,
        policyHash,
      );
      if (!audit.passed) {
        throw new Error(`CREATIVE_SOFTWARE_SANDBOX_VALIDATION_FAILED:${audit.failures.join(",")}`);
      }
      const sourceEntries = contract.files.map((file) => ({
        name: file.path,
        data: file.encoding === "base64"
          ? Buffer.from(file.content, "base64")
          : Buffer.from(file.content, "utf8"),
      }));
      const sourcePackage = createStoredZip(sourceEntries);
      const buildPackage = createStoredZip(outputEntries);
      const reportBuffer = Buffer.from(JSON.stringify(report, null, 2));
      const logBuffer = Buffer.from(JSON.stringify({
        stdout: execution.stdout,
        stderr: execution.stderr,
      }, null, 2));
      const source = await upload(task, "source.zip", sourcePackage, "application/zip", identity);
      const build = await upload(task, "build.zip", buildPackage, "application/zip", identity);
      const reportFile = await upload(task, "sandbox-report.json", reportBuffer, "application/json", identity);
      const logs = await upload(task, "sandbox-logs.json", logBuffer, "application/json", identity);
      return {
        type: "ASSET",
        name: `${contract.title} software build`,
        url: build.url,
        file_url: build.url,
        package_url: build.url,
        source_package_url: source.url,
        build_artifact_url: build.url,
        storage_path: build.storage_path,
        mime_type: build.mime_type,
        package_id: identity,
        build_id: identity,
        checksum: build.checksum,
        files: [source, build, reportFile, logs],
        sandbox_report: report,
        sandbox_audit: audit,
        policy_hash: policyHash,
        contract_summary: {
          title: contract.title,
          runtime: contract.runtime,
          entrypoint: contract.entrypoint,
          source_file_count: contract.files.length,
          output_file_count: outputEntries.length,
        },
        deployment: {
          ready: true,
          published: false,
          target: contract.requirements.deployment_target || null,
        },
      };
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },

  async validate(task) {
    const tasks = await projectTasks(task);
    const dependencies = dependencyTasks(task, tasks);
    const buildTask = dependencies.find((item) => {
      const output = object(unwrapSoftwareOutput(item.output));
      return Boolean(output.build_artifact_url || output.package_url);
    }) || null;
    const reviewTask = dependencies.find((item) => item !== buildTask) || null;
    const build = object(unwrapSoftwareOutput(buildTask?.output));
    const review = object(unwrapSoftwareOutput(reviewTask?.output));
    const failures = [];
    if (!buildTask || buildTask.status !== "COMPLETED") failures.push("SOFTWARE_BUILD_REQUIRED");
    if (!build.build_artifact_url || !build.source_package_url) failures.push("SOFTWARE_PACKAGES_REQUIRED");
    if (!build.checksum) failures.push("SOFTWARE_BUILD_CHECKSUM_REQUIRED");
    if (!build.sandbox_audit?.passed) failures.push("SOFTWARE_SANDBOX_AUDIT_REQUIRED");
    if (!build.sandbox_report?.runner?.executor_id) failures.push("SOFTWARE_SANDBOX_EXECUTOR_REQUIRED");
    if (build.sandbox_report?.runner?.policy_hash !== build.policy_hash) {
      failures.push("SOFTWARE_SANDBOX_POLICY_ATTESTATION_REQUIRED");
    }
    if (!reviewTask || reviewTask.status !== "COMPLETED") failures.push("SOFTWARE_SEMANTIC_REVIEW_REQUIRED");
    if (!softwareQualityPass(review)) failures.push("SOFTWARE_SEMANTIC_REVIEW_REJECTED");
    failures.push(...softwareQualityFailures(review));
    const passed = failures.length === 0;
    return {
      passed,
      success: passed,
      verdict: passed ? "PASS" : "FAIL",
      overall_score: passed ? 100 : 0,
      failed_checks: [...new Set(failures)],
      repair_instructions: passed ? [] : [
        "Repair the source package, sandbox build, tests, security findings or semantic review failures, then rebuild the deliverable.",
      ],
      build_task_id: buildTask?.id || null,
      semantic_review_task_id: reviewTask?.id || null,
      build_artifact_url: build.build_artifact_url || null,
      source_package_url: build.source_package_url || null,
      deployment_ready: passed,
      published: false,
    };
  },
};
