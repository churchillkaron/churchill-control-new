export const CODE_REPOSITORY_INTELLIGENCE_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_V2";

const MAX_DISCOVERED_PATHS = 320;
const MAX_INSTRUCTION_FILES = 24;
const MAX_INSTRUCTION_CHARS = 7000;
const MAX_PACKAGE_MANIFESTS = 10;
const MAX_SCRIPTS_PER_PACKAGE = 100;
const MAX_WORKFLOWS = 60;
const MAX_BUILD_SYSTEM_CONVENTIONS = 80;

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
  "requirements-dev.txt",
  "setup.py",
  "setup.cfg",
  "tox.ini",
  "pytest.ini",
  "ruff.toml",
  ".ruff.toml",
  "mypy.ini",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "Makefile",
  "CMakeLists.txt",
  "CMakePresets.json",
  "pom.xml",
  "mvnw",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradlew",
  ":(glob)*.sln",
  ":(glob)*.csproj",
  ":(glob)**/*.csproj",
  "global.json",
  "Gemfile",
  "Rakefile",
  ":(glob)*.gemspec",
  "composer.json",
  "phpunit.xml",
  "phpunit.xml.dist",
  "Package.swift",
  "WORKSPACE",
  "WORKSPACE.bazel",
  "MODULE.bazel",
  "BUILD",
  "BUILD.bazel",
  ".bazelrc",
  ".nvmrc",
  ".node-version",
  ".python-version",
  "rust-toolchain",
  "rust-toolchain.toml",
  ".tool-versions",
]);

const BUILD_SYSTEM_RULES = Object.freeze([
  {
    id: "node",
    language: "javascript-typescript",
    any: [/^(?:.*\/)?package\.json$/],
    commands: [],
  },
  {
    id: "python-pytest",
    language: "python",
    any: [/^pytest\.ini$/, /^pyproject\.toml$/, /^setup\.cfg$/, /(?:^|\/)tests?(?:\/|$)/],
    commands: [{ family: "test", script: "pytest", command: "python -m pytest" }],
  },
  {
    id: "python-ruff",
    language: "python",
    any: [/^ruff\.toml$/, /^\.ruff\.toml$/, /^pyproject\.toml$/],
    commands: [{ family: "lint", script: "ruff", command: "python -m ruff check ." }],
  },
  {
    id: "python-mypy",
    language: "python",
    any: [/^mypy\.ini$/, /^pyproject\.toml$/],
    commands: [{ family: "typecheck", script: "mypy", command: "python -m mypy ." }],
  },
  {
    id: "python-tox",
    language: "python",
    any: [/^tox\.ini$/],
    commands: [{ family: "verify", script: "tox", command: "python -m tox" }],
  },
  {
    id: "go",
    language: "go",
    any: [/^go\.mod$/],
    commands: [
      { family: "test", script: "go-test", command: "go test ./..." },
      { family: "build", script: "go-build", command: "go build ./..." },
    ],
  },
  {
    id: "rust",
    language: "rust",
    any: [/^Cargo\.toml$/],
    commands: [
      { family: "typecheck", script: "cargo-check", command: "cargo check --workspace" },
      { family: "test", script: "cargo-test", command: "cargo test --workspace" },
      { family: "lint", script: "cargo-clippy", command: "cargo clippy --workspace --all-targets" },
    ],
  },
  {
    id: "maven",
    language: "java-jvm",
    any: [/^pom\.xml$/],
    commands: [{ family: "test", script: "maven-test", command: "./mvnw test or mvn test" }],
  },
  {
    id: "gradle",
    language: "java-kotlin-jvm",
    any: [/^build\.gradle(?:\.kts)?$/, /^settings\.gradle(?:\.kts)?$/],
    commands: [
      { family: "test", script: "gradle-test", command: "./gradlew test" },
      { family: "build", script: "gradle-build", command: "./gradlew build" },
    ],
  },
  {
    id: "dotnet",
    language: "dotnet",
    any: [/\.sln$/i, /\.csproj$/i],
    commands: [
      { family: "build", script: "dotnet-build", command: "dotnet build" },
      { family: "test", script: "dotnet-test", command: "dotnet test" },
    ],
  },
  {
    id: "ruby",
    language: "ruby",
    any: [/^Gemfile$/, /\.gemspec$/i],
    commands: [
      { family: "test", script: "bundle-test", command: "bundle exec rake test" },
      { family: "verify", script: "bundle-rake", command: "bundle exec rake" },
    ],
  },
  {
    id: "php-composer",
    language: "php",
    any: [/^composer\.json$/],
    commands: [{ family: "test", script: "composer-test", command: "composer test (when defined)" }],
  },
  {
    id: "phpunit",
    language: "php",
    any: [/^phpunit\.xml(?:\.dist)?$/],
    commands: [{ family: "test", script: "phpunit", command: "vendor/bin/phpunit" }],
  },
  {
    id: "swift-package",
    language: "swift",
    any: [/^Package\.swift$/],
    commands: [
      { family: "build", script: "swift-build", command: "swift build" },
      { family: "test", script: "swift-test", command: "swift test" },
    ],
  },
  {
    id: "cmake",
    language: "c-cpp",
    any: [/^CMakeLists\.txt$/, /^CMakePresets\.json$/],
    commands: [
      { family: "build", script: "cmake-build", command: "cmake --build <configured-build-dir>" },
      { family: "test", script: "ctest", command: "ctest --test-dir <configured-build-dir>" },
    ],
  },
  {
    id: "make",
    language: "multi-language",
    any: [/^Makefile$/],
    commands: [
      { family: "build", script: "make", command: "make" },
      { family: "test", script: "make-test", command: "make test (when target exists)" },
    ],
  },
  {
    id: "bazel",
    language: "multi-language",
    any: [/^(?:WORKSPACE|WORKSPACE\.bazel|MODULE\.bazel|BUILD|BUILD\.bazel)$/],
    commands: [
      { family: "test", script: "bazel-test", command: "bazel test //..." },
      { family: "build", script: "bazel-build", command: "bazel build //..." },
    ],
  },
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

function basename(filePath) {
  const normalized = text(filePath, 1000).replaceAll("\\", "/");
  return normalized.split("/").pop() || normalized;
}

function instructionKind(filePath) {
  const candidate = text(filePath, 1000);
  const base = basename(candidate);
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

function packageCommandConventions(packages) {
  return packages.flatMap((pkg) =>
    list(pkg.scripts).map((script) => ({
      source: "package-script",
      build_system: "node",
      language: "javascript-typescript",
      package_path: pkg.path,
      package_name: pkg.name,
      family: script.family,
      script: script.name,
      command: script.command,
      confidence: "repository_declared",
    })),
  );
}

function buildSystemMatches(rule, paths) {
  return paths.filter((filePath) => rule.any.some((pattern) => pattern.test(filePath)));
}

function buildSystemConventions(paths) {
  const output = [];
  for (const rule of BUILD_SYSTEM_RULES) {
    const evidencePaths = buildSystemMatches(rule, paths);
    if (!evidencePaths.length) continue;
    for (const command of rule.commands) {
      output.push({
        source: "build-system-convention",
        build_system: rule.id,
        language: rule.language,
        package_path: ".",
        package_name: null,
        family: command.family,
        script: command.script,
        command: command.command,
        evidence_paths: evidencePaths.slice(0, 12),
        confidence: "conventional_candidate_verify_before_execution",
      });
    }
  }
  return output.slice(0, MAX_BUILD_SYSTEM_CONVENTIONS);
}

function detectedBuildSystems(paths, packages) {
  const systems = [];
  if (packages.length) systems.push({ id: "node", language: "javascript-typescript" });
  for (const rule of BUILD_SYSTEM_RULES) {
    if (rule.id === "node") continue;
    if (buildSystemMatches(rule, paths).length) {
      systems.push({ id: rule.id, language: rule.language });
    }
  }
  const byId = new Map();
  for (const item of systems) byId.set(item.id, item);
  return [...byId.values()];
}

function commandConventions(packages, paths) {
  const declared = packageCommandConventions(packages);
  const conventional = buildSystemConventions(paths);
  const declaredKeys = new Set(
    declared.map((item) => `${item.build_system}:${item.family}:${item.command}`),
  );
  return [
    ...declared,
    ...conventional.filter(
      (item) => !declaredKeys.has(`${item.build_system}:${item.family}:${item.command}`),
    ),
  ];
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
  const commands = commandConventions(packages, discovered.paths);
  const buildSystems = detectedBuildSystems(discovered.paths, packages);
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
      detected_build_systems: buildSystems,
      detected_languages: unique(buildSystems.map((entry) => entry.language)),
      command_conventions: commands,
      command_families: unique(commands.map((entry) => entry.family)),
      command_convention_policy:
        "Repository-declared commands are preferred. Build-system conventions are candidates only and must be verified against repository files/help/configuration before execution when the command is conditional or contains placeholders.",
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
