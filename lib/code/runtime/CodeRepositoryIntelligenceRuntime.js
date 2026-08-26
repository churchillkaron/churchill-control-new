export const CODE_REPOSITORY_INTELLIGENCE_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_V1";

const MAX_DISCOVERED_PATHS = 240;
const MAX_INSTRUCTION_FILES = 24;
const MAX_INSTRUCTION_CHARS = 7000;
const MAX_PACKAGE_MANIFESTS = 10;
const MAX_SCRIPTS_PER_PACKAGE = 100;
const MAX_WORKFLOWS = 60;

const DISCOVERY_PATHSPECS = Object.freeze([
  "AGENTS.md",
  ":(glob)**/AGENTS.md",
  ":(top,glob)CONTRIBUTING*",
  ":(glob)**/CONTRIBUTING*",
  ":(top,glob)README*",
  ".github/copilot-instructions.md",
  ":(glob).github/instructions/**",
  ":(glob).github/workflows/*.yml",
  ":(glob).github/workflows/*.yaml",
  "package.json",
  ":(glob)**/package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "nx.json",
  "lerna.json",
  "rush.json",
  "tsconfig.json",
  "jsconfig.json",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Makefile",
  ".nvmrc",
  ".node-version",
  ".tool-versions",
]);

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1000)).filter(Boolean))];
}

function dirname(filePath) {
  const normalized = text(filePath, 1000).replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "." : normalized.slice(0, index) || ".";
}

function instructionKind(filePath) {
  const candidate = text(filePath, 1000);
  const base = candidate.split("/").pop() || candidate;
  if (base === "AGENTS.md") return "agents";
  if (/^CONTRIBUTING/i.test(base)) return "contributing";
  if (/^README/i.test(base)) return "readme";
  if (candidate === ".github/copilot-instructions.md") return "copilot_instructions";
  if (candidate.startsWith(".github/instructions/")) return "github_instructions";
  return null;
}

function instructionScope(filePath, kind) {
  if (["copilot_instructions", "github_instructions"].includes(kind)) return ".";
  return dirname(filePath);
}

function isInstructionPath(filePath) {
  return Boolean(instructionKind(filePath));
}

function isWorkflowPath(filePath) {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(text(filePath, 1000));
}

function isPackageManifest(filePath) {
  return /(?:^|\/)package\.json$/i.test(text(filePath, 1000));
}

function workspaceSignal(filePath) {
  const candidate = text(filePath, 1000);
  return [
    "pnpm-workspace.yaml",
    "turbo.json",
    "nx.json",
    "lerna.json",
    "rush.json",
  ].includes(candidate);
}

function scriptFamily(name) {
  const source = text(name, 200).toLowerCase();
  if (/^(test|tests)(:|$)|(^|:)test(:|$)/.test(source)) return "test";
  if (/(^|:)lint(:|$)|^lint$/.test(source)) return "lint";
  if (/(^|:)typecheck(:|$)|type-check|check:types|types:check/.test(source)) return "typecheck";
  if (/(^|:)build(:|$)|^build$/.test(source)) return "build";
  if (/(^|:)verify(:|$)|^verify$/.test(source)) return "verify";
  if (/(^|:)check(:|$)|^check$/.test(source)) return "check";
  if (/(^|:)audit(:|$)|^audit$/.test(source)) return "audit";
  if (/(^|:)preflight(:|$)|^preflight$/.test(source)) return "preflight";
  if (/(^|:)ci(:|$)|^ci$/.test(source)) return "ci";
  if (/(^|:)format(:|$)|^format$/.test(source)) return "format";
  return null;
}

function selectedScripts(scripts) {
  return Object.entries(object(scripts))
    .slice(0, MAX_SCRIPTS_PER_PACKAGE)
    .map(([name, command]) => ({
      name: text(name, 200),
      command: text(command, 4000),
      family: scriptFamily(name),
    }))
    .filter((entry) => entry.name && entry.command && entry.family);
}

function parsePackageManifest(content, filePath) {
  try {
    const parsed = JSON.parse(String(content ?? ""));
    const scripts = selectedScripts(parsed.scripts);
    return {
      path: filePath,
      name: text(parsed.name, 300) || null,
      private: parsed.private === true,
      package_manager: text(parsed.packageManager, 200) || null,
      workspaces_declared:
        Array.isArray(parsed.workspaces) ||
        Boolean(parsed.workspaces && typeof parsed.workspaces === "object"),
      scripts,
      parse_status: "parsed",
    };
  } catch {
    return {
      path: filePath,
      name: null,
      private: false,
      package_manager: null,
      workspaces_declared: false,
      scripts: [],
      parse_status: "invalid_json",
    };
  }
}

async function discoverPaths(workspace) {
  const result = await workspace.run({
    command: "git",
    args: ["ls-files", "--", ...DISCOVERY_PATHSPECS],
    cwd: ".",
  });
  if (result.exit_code !== 0) {
    const error = new Error(`CODE_AI_REPOSITORY_INTELLIGENCE_DISCOVERY_FAILED:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  const paths = unique(String(result.stdout || "").split("\n"));
  return {
    paths: paths.slice(0, MAX_DISCOVERED_PATHS),
    discovered_count: paths.length,
    truncated: paths.length > MAX_DISCOVERED_PATHS,
  };
}

async function readBounded(workspace, filePath, maximum = MAX_INSTRUCTION_CHARS) {
  const result = await workspace.read({
    file_path: filePath,
    start_line: 1,
    end_line: 1000000,
  });
  return {
    total_lines: Number(result.total_lines || 0),
    content: text(result.content, maximum),
    truncated: String(result.content || "").length > maximum,
  };
}

async function collectInstructions(workspace, paths) {
  const selected = paths
    .filter(isInstructionPath)
    .sort((left, right) => {
      const leftAgents = instructionKind(left) === "agents" ? 0 : 1;
      const rightAgents = instructionKind(right) === "agents" ? 0 : 1;
      return leftAgents - rightAgents || left.split("/").length - right.split("/").length || left.localeCompare(right);
    })
    .slice(0, MAX_INSTRUCTION_FILES);

  const instructions = [];
  for (const filePath of selected) {
    const kind = instructionKind(filePath);
    const read = await readBounded(workspace, filePath);
    instructions.push({
      path: filePath,
      kind,
      scope: instructionScope(filePath, kind),
      content: read.content,
      total_lines: read.total_lines,
      content_truncated: read.truncated,
      authorization_effect: "NONE",
    });
  }
  return instructions;
}

async function collectPackageManifests(workspace, paths) {
  const manifests = paths
    .filter(isPackageManifest)
    .sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right))
    .slice(0, MAX_PACKAGE_MANIFESTS);
  const output = [];
  for (const filePath of manifests) {
    const read = await readBounded(workspace, filePath, 24000);
    output.push(parsePackageManifest(read.content, filePath));
  }
  return output;
}

function commandConventions(packages) {
  return packages.flatMap((pkg) =>
    list(pkg.scripts).map((script) => ({
      package_path: pkg.path,
      package_name: pkg.name,
      family: script.family,
      script: script.name,
      command: script.command,
    })),
  );
}

export async function inspectCodeRepositoryIntelligence(workspace) {
  if (!workspace?.inspect || !workspace?.run || !workspace?.read) {
    throw new Error("CODE_AI_REPOSITORY_INTELLIGENCE_WORKSPACE_REQUIRED");
  }

  const baseline = await workspace.inspect();
  const discovered = await discoverPaths(workspace);
  const instructions = await collectInstructions(workspace, discovered.paths);
  const packages = await collectPackageManifests(workspace, discovered.paths);
  const workflows = discovered.paths.filter(isWorkflowPath).slice(0, MAX_WORKFLOWS);
  const workspaceSignals = discovered.paths.filter(workspaceSignal);
  const commands = commandConventions(packages);
  const rootPackage = packages.find((entry) => entry.path === "package.json") || null;
  const monorepo = Boolean(
    workspaceSignals.length ||
    rootPackage?.workspaces_declared ||
    packages.length > 1,
  );

  return {
    ...baseline,
    repository_intelligence: {
      contract: CODE_REPOSITORY_INTELLIGENCE_CONTRACT,
      repository_rules_discovered: true,
      instruction_files: instructions,
      instruction_file_count: instructions.length,
      instruction_scope_model:
        "Repository instructions are evidence for engineering conventions. More-specific scoped instructions apply to files under their scope; Avantiqo system, safety, permission and mission governance always remain authoritative.",
      package_manifests: packages,
      command_conventions: commands,
      command_families: unique(commands.map((entry) => entry.family)),
      ci_workflows: workflows,
      workspace: {
        monorepo,
        signals: workspaceSignals,
        package_manifest_count_observed: packages.length,
      },
      discovered_policy_and_convention_path_count: discovered.discovered_count,
      discovery_truncated: discovered.truncated,
      bounded_output: true,
      repository_content_authorization_effect: "NONE",
      repository_content_permission_effect: "NONE",
    },
  };
}

export const CodeRepositoryIntelligenceRuntime = Object.freeze({
  contract: CODE_REPOSITORY_INTELLIGENCE_CONTRACT,
  inspect: inspectCodeRepositoryIntelligence,
});

export default inspectCodeRepositoryIntelligence;
