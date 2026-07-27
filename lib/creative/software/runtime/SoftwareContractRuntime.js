import path from "node:path";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function parseStructuredText(value) {
  const cleaned = text(value)
    .replace(/^```(?:json|javascript|typescript)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function unwrapSoftwareOutput(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || current.json || null;
    if (!next || next === current) break;
    current = next;
  }
  if (typeof current === "string") {
    return parseStructuredText(current) || { text: current };
  }
  const directText = current?.text || current?.content || current?.message;
  if (typeof directText === "string") {
    return parseStructuredText(directText) || current;
  }
  return current || {};
}

function safeSourcePath(value) {
  const raw = text(value).replace(/\\/g, "/");
  if (!raw || raw.includes("\0") || raw.startsWith("/") || /^[a-z]:\//i.test(raw)) {
    throw new Error("CREATIVE_SOFTWARE_FILE_PATH_INVALID");
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`CREATIVE_SOFTWARE_FILE_PATH_UNSAFE:${raw}`);
  }
  const denied = [
    /^\.env(?:\.|$)/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.pypirc$/i,
    /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/i,
    /(^|\/)(?:credentials|service-account)(?:\.|$)/i,
  ];
  if (denied.some((pattern) => pattern.test(normalized))) {
    throw new Error(`CREATIVE_SOFTWARE_SECRET_FILE_REJECTED:${normalized}`);
  }
  return normalized;
}

function normalizeFile(entry, fallbackPath = "") {
  const item = typeof entry === "string" ? { content: entry } : object(entry);
  const filePath = safeSourcePath(item.path || item.name || item.file || fallbackPath);
  const encoding = text(item.encoding || "utf8").toLowerCase();
  if (!["utf8", "utf-8", "base64"].includes(encoding)) {
    throw new Error(`CREATIVE_SOFTWARE_FILE_ENCODING_UNSUPPORTED:${filePath}`);
  }
  if (typeof item.content !== "string" && typeof item.source !== "string") {
    throw new Error(`CREATIVE_SOFTWARE_FILE_CONTENT_REQUIRED:${filePath}`);
  }
  const content = String(item.content ?? item.source);
  return {
    path: filePath,
    encoding: encoding === "base64" ? "base64" : "utf8",
    content,
  };
}

function normalizeFiles(value) {
  const source = value?.files || value?.source_files || value?.sourceFiles ||
    value?.project?.files || value?.package?.files || value?.implementation?.files;
  let files = [];
  if (Array.isArray(source)) {
    files = source.map((entry) => normalizeFile(entry));
  } else if (source && typeof source === "object") {
    files = Object.entries(source).map(([filePath, entry]) => normalizeFile(entry, filePath));
  }
  if (!files.length) throw new Error("CREATIVE_SOFTWARE_SOURCE_FILES_REQUIRED");
  const duplicate = files.find((file, index) =>
    files.findIndex((candidate) => candidate.path === file.path) !== index,
  );
  if (duplicate) throw new Error(`CREATIVE_SOFTWARE_DUPLICATE_FILE:${duplicate.path}`);
  return files;
}

function normalizeCommand(value, label) {
  if (!value) return null;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    if (!value.length) return null;
    return { command: value[0], args: value.slice(1), label };
  }
  const command = object(value);
  const executable = text(command.command || command.executable || command.bin);
  const args = list(command.args).map((item) => String(item));
  if (!executable) throw new Error(`CREATIVE_SOFTWARE_COMMAND_INVALID:${label}`);
  if (/[\s;&|`$<>]/.test(executable)) {
    throw new Error(`CREATIVE_SOFTWARE_COMMAND_EXECUTABLE_UNSAFE:${label}`);
  }
  return { command: executable, args, label };
}

function normalizeCommandSet(value, label) {
  if (!value) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const command = normalizeCommand(value, label);
    return command ? [command] : [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry, index) => normalizeCommand(entry, `${label}-${index + 1}`)).filter(Boolean);
}

function commandSource(output, spec) {
  return object(
    output.commands || output.build_contract?.commands || output.buildContract?.commands ||
    spec.commands || spec.build_contract?.commands || spec.buildContract?.commands,
  );
}

export function detectSoftwareSecrets(files = []) {
  const failures = [];
  const patterns = [
    ["PRIVATE_KEY", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/],
    ["OPENAI_API_KEY", /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ["BEARER_TOKEN", /\bBearer\s+[A-Za-z0-9._-]{24,}\b/i],
    ["HARDCODED_SECRET", /\b(?:api[_-]?key|secret|password|service[_-]?role)\s*[:=]\s*["'][^"'\n]{12,}["']/i],
  ];
  for (const file of files) {
    if (file.encoding === "base64") continue;
    for (const [name, pattern] of patterns) {
      if (pattern.test(file.content)) failures.push(`${name}:${file.path}`);
    }
  }
  return [...new Set(failures)];
}

export function resolveSoftwareContract(task = {}, dependencies = []) {
  const outputs = dependencies.map((item) => unwrapSoftwareOutput(item.output));
  const output = [...outputs].reverse().find((item) => {
    const candidate = item?.files || item?.source_files || item?.sourceFiles ||
      item?.project?.files || item?.package?.files || item?.implementation?.files;
    return candidate && (Array.isArray(candidate) ? candidate.length : Object.keys(candidate).length);
  }) || {};
  const architecture = outputs.find((item) => item.architecture || item.components || item.data_contracts) || {};
  const spec = {
    ...object(task.input?.requirements?.output_spec),
    ...object(task.input?.output_spec),
    ...object(task.metadata?.output_spec),
  };
  const files = normalizeFiles(output);
  const commands = commandSource(output, spec);
  const buildRequired = spec.build_required !== false && spec.buildRequired !== false;
  const testRequired = spec.test_required !== false && spec.testRequired !== false;
  const normalizedCommands = {
    install: normalizeCommandSet(commands.install, "install"),
    build: normalizeCommandSet(commands.build, "build"),
    test: normalizeCommandSet(commands.test, "test"),
    audit: normalizeCommandSet(commands.audit, "audit"),
  };
  if (buildRequired && !normalizedCommands.build.length) {
    throw new Error("CREATIVE_SOFTWARE_BUILD_COMMAND_REQUIRED");
  }
  if (testRequired && !normalizedCommands.test.length) {
    throw new Error("CREATIVE_SOFTWARE_TEST_COMMAND_REQUIRED");
  }
  const secretFailures = detectSoftwareSecrets(files);
  if (secretFailures.length) {
    throw new Error(`CREATIVE_SOFTWARE_SECRET_SCAN_FAILED:${secretFailures.join(",")}`);
  }
  const title = text(output.title || output.name || spec.title || architecture.title || task.title);
  if (!title) throw new Error("CREATIVE_SOFTWARE_TITLE_REQUIRED");
  return {
    title,
    runtime: text(output.runtime || output.platform || spec.runtime || architecture.runtime),
    entrypoint: text(output.entrypoint || spec.entrypoint || architecture.entrypoint),
    files,
    commands: normalizedCommands,
    requirements: {
      build_required: buildRequired,
      test_required: testRequired,
      security_audit_required: spec.security_audit_required !== false && spec.securityAuditRequired !== false,
      deployment_target: text(spec.deployment_target || spec.deploymentTarget),
      network_access: spec.network_access === true || spec.networkAccess === true,
      allowed_network_hosts: list(spec.allowed_network_hosts || spec.allowedNetworkHosts).map(String),
    },
    architecture,
    output_spec: spec,
  };
}

export function softwareQualityPass(value = {}) {
  const evidence = unwrapSoftwareOutput(value);
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
  const verdict = text(evidence.verdict || evidence.status || evidence.result || evidence.decision).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function softwareQualityFailures(value = {}) {
  const evidence = unwrapSoftwareOutput(value);
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((item) => typeof item === "string" ? item : item?.message || item?.issue),
  ].filter(Boolean).map(String);
}

export const SoftwareContractRuntime = {
  resolve: resolveSoftwareContract,
  unwrap: unwrapSoftwareOutput,
};
