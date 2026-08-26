export const CODE_REPOSITORY_INTELLIGENCE_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_V2";

const MAX_DISCOVERED_PATHS = 640;
const MAX_INSTRUCTION_FILES = 24;
const MAX_INSTRUCTION_CHARS = 7000;
const MAX_PACKAGE_MANIFESTS = 20;
const MAX_SCRIPTS_PER_PACKAGE = 100;
const MAX_WORKFLOWS = 60;
const MAX_BUILD_SYSTEM_CONVENTIONS = 120;

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
  ":(glob)**/pyproject.toml",
  "poetry.lock",
  ":(glob)**/poetry.lock",
  "requirements.txt",
  ":(glob)**/requirements.txt",
  "requirements-dev.txt",
  ":(glob)**/requirements-dev.txt",
  "setup.py",
  ":(glob)**/setup.py",
  "setup.cfg",
  ":(glob)**/setup.cfg",
  "tox.ini",
  ":(glob)**/tox.ini",
  "pytest.ini",
  ":(glob)**/pytest.ini",
  "ruff.toml",
  ":(glob)**/ruff.toml",
  ".ruff.toml",
  ":(glob)**/.ruff.toml",
  "mypy.ini",
  ":(glob)**/mypy.ini",
  "Cargo.toml",
  ":(glob)**/Cargo.toml",
  "Cargo.lock",
  ":(glob)**/Cargo.lock",
  "go.mod",
  ":(glob)**/go.mod",
  "go.sum",
  ":(glob)**/go.sum",
  "Makefile",
  ":(glob)**/Makefile",
  "CMakeLists.txt",
  ":(glob)**/CMakeLists.txt",
  "CMakePresets.json",
  ":(glob)**/CMakePresets.json",
  "pom.xml",
  ":(glob)**/pom.xml",
  "mvnw",
  ":(glob)**/mvnw",
  "build.gradle",
  ":(glob)**/build.gradle",
  "build.gradle.kts",
  ":(glob)**/build.gradle.kts",
  "settings.gradle",
  ":(glob)**/settings.gradle",
  "settings.gradle.kts",
  ":(glob)**/settings.gradle.kts",
  "gradlew",
  ":(glob)**/gradlew",
  ":(glob)*.sln",
  ":(glob)**/*.sln",
  ":(glob)*.csproj",
  ":(glob)**/*.csproj",
  "global.json",
  ":(glob)**/global.json",
  "Gemfile",
  ":(glob)**/Gemfile",
  "Rakefile",
  ":(glob)**/Rakefile",
  ":(glob)*.gemspec",
  ":(glob)**/*.gemspec",
  "composer.json",
  ":(glob)**/composer.json",
  "phpunit.xml",
  ":(glob)**/phpunit.xml",
  "phpunit.xml.dist",
  ":(glob)**/phpunit.xml.dist",
  "Package.swift",
  ":(glob)**/Package.swift",
  "WORKSPACE",
  ":(glob)**/WORKSPACE",
  "WORKSPACE.bazel",
  ":(glob)**/WORKSPACE.bazel",
  "MODULE.bazel",
  ":(glob)**/MODULE.bazel",
  "BUILD",
  ":(glob)**/BUILD",
  "BUILD.bazel",
  ":(glob)**/BUILD.bazel",
  ".bazelrc",
  ":(glob)**/.bazelrc",
  ".nvmrc",
  ":(glob)**/.nvmrc",
  ".node-version",
  ":(glob)**/.node-version",
  ".python-version",
  ":(glob)**/.python-version",
  "rust-toolchain",
  ":(glob)**/rust-toolchain",
  "rust-toolchain.toml",
  ":(glob)**/rust-toolchain.toml",
  ".tool-versions",
  ":(glob)**/.tool-versions",
]);

const BUILD_SYSTEM_RULES = Object.freeze([
  {
    id: "node",
    language: "javascript-typescript",
    any: [/(?:^|\/)package\.json$/],
    roots: [/(?:^|\/)package\.json$/],
    commands: [],
  },
  {
    id: "python-pytest",
    language: "python",
    any: [/(?:^|\/)pytest\.ini$/, /(?:^|\/)pyproject\.toml$/, /(?:^|\/)setup\.cfg$/],
    roots: [/(?:^|\/)pytest\.ini$/, /(?:^|\/)pyproject\.toml$/, /(?:^|\/)setup\.cfg$/],
    commands: [{ family: "test", script: "pytest", command: "python -m pytest" }],
  },
  {
    id: "python-ruff",
    language: "python",
    any: [/(?:^|\/)ruff\.toml$/, /(?:^|\/)\.ruff\.toml$/, /(?:^|\/)pyproject\.toml$/],
    roots: [/(?:^|\/)ruff\.toml$/, /(?:^|\/)\.ruff\.toml$/, /(?:^|\/)pyproject\.toml$/],
    commands: [{ family: "lint", script: "ruff", command: "python -m ruff check ." }],
  },
  {
    id: "python-mypy",
    language: "python",
    any: [/(?:^|\/)mypy\.ini$/, /(?:^|\/)pyproject\.toml$/],
    roots: [/(?:^|\/)mypy\.ini$/, /(?:^|\/)pyproject\.toml$/],
    commands: [{ family: "typecheck", script: "mypy", command: "python -m mypy ." }],
  },
  {
    id: "python-tox",
    language: "python",
    any: [/(?:^|\/)tox\.ini$/],
    roots: [/(?:^|\/)tox\.ini$/],
    commands: [{ family: "verify", script: "tox", command: "python -m tox" }],
  },
  {
    id: "go",
    language: "go",
    any: [/(?:^|\/)go\.mod$/],
    roots: [/(?:^|\/)go\.mod$/],
    commands: [
      { family: "test", script: "go-test", command: "go test ./..." },
      { family: "build", script: "go-build", command: "go build ./..." },
    ],
  },
  {
    id: "rust",
    language: "rust",
    any: [/(?:^|\/)Cargo\.toml$/],
    roots: [/(?:^|\/)Cargo\.toml$/],
    commands: [
      { family: "typecheck", script: "cargo-check", command: "cargo check --workspace" },
      { family: "test", script: "cargo-test", command: "cargo test --workspace" },
      { family: "lint", script: "cargo-clippy", command: "cargo clippy --workspace --all-targets" },
    ],
  },
  {
    id: "maven",
    language: "java-jvm",
    any: [/(?:^|\/)pom\.xml$/],
    roots: [/(?:^|\/)pom\.xml$/],
    commands: [{ family: "test", script: "maven-test", command: "./mvnw test or mvn test" }],
  },
  {
    id: "gradle",
    language: "java-kotlin-jvm",
    any: [/(?:^|\/)build\.gradle(?:\.kts)?$/, /(?:^|\/)settings\.gradle(?:\.kts)?$/],
    roots: [/(?:^|\/)settings\.gradle(?:\.kts)?$/, /(?:^|\/)build\.gradle(?:\.kts)?$/],
    commands: [
      { family: "test", script: "gradle-test", command: "./gradlew test" },
      { family: "build", script: "gradle-build", command: "./gradlew build" },
    ],
  },
  {
    id: "dotnet",
    language: "dotnet",
    any: [/\.sln$/i, /\.csproj$/i],
    roots: [/\.sln$/i, /\.csproj$/i],
    commands: [
      { family: "build", script: "dotnet-build", command: "dotnet build" },
      { family: "test", script: "dotnet-test", command: "dotnet test" },
    ],
  },
  {
    id: "ruby",
    language: "ruby",
    any: [/(?:^|\/)Gemfile$/, /\.gemspec$/i],
    roots: [/(?:^|\/)Gemfile$/, /\.gemspec$/i],
    commands: [
      { family: "test", script: "bundle-test", command: "bundle exec rake test" },
      { family: "verify", script: "bundle-rake", command: "bundle exec rake" },
    ],
  },
  {
    id: "php-composer",
    language: "php",
    any: [/(?:^|\/)composer\.json$/],
    roots: [/(?:^|\/)composer\.json$/],
    commands: [{ family: "test", script: "composer-test", command: "composer test (when defined)" }],
  },
  {
    id: "phpunit",
    language: "php",
    any: [/(?:^|\/)phpunit\.xml(?:\.dist)?$/],
    roots: [/(?:^|\/)phpunit\.xml(?:\.dist)?$/],
    commands: [{ family: "test", script: "phpunit", command: "vendor/bin/phpunit" }],
  },
  {
    id: "swift-package",
    language: "swift",
    any: [/(?:^|\/)Package\.swift$/],
    roots: [/(?:^|\/)Package\.swift$/],
    commands: [
      { family: "build", script: "swift-build", command: "swift build" },
      { family: "test", script: "swift-test", command: "swift test" },
    ],
  },
  {
    id: "cmake",
    language: "c-cpp",
    any: [/(?:^|\/)CMakeLists\.txt$/, /(?:^|\/)CMakePresets\.json$/],
    roots: [/(?:^|\/)CMakeLists\.txt$/, /(?:^|\/)CMakePresets\.json$/],
    commands: [
      { family: "build", script: "cmake-build", command: "cmake --build <configured-build-dir>" },
      { family: "test", script: "ctest", command: "ctest --test-dir <configured-build-dir>" },
    ],
  },
  {
    id: "make",
    language: "multi-language",
    any: [/(?:^|\/)Makefile$/],
    roots: [/(?:^|\/)Makefile$/],
    commands: [
      { family: "build", script: "make", command: "make" },
      { family: "test", script: "make-test", command: "make test (when target exists)" },
    ],
  },
  {
    id: "bazel",
    language: "multi-language",
    any: [/(?:^|\/)(?:WORKSPACE|WORKSPACE\.bazel|MODULE\.bazel|BUILD|BUILD\.bazel)$/],
    roots: [/(?:^|\/)(?:WORKSPACE|WORKSPACE\.bazel|MODULE\.bazel)$/],
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
    return {
      path: filePath,
      root: dirname(filePath),
      name: text(parsed.name, 300) || null,
      private: parsed.private === true,
      package_manager: text(parsed.packageManager, 200) || null,
      workspaces_declared:
        Array.isArray(parsed.workspaces) ||
        Boolean(parsed.workspaces && typeof parsed.workspaces === "object"),
      scripts: selectedScripts(parsed.scripts),
      parse_status: "parsed",
    };
  } catch {
    return {
      path: filePath,
      root: dirname(filePath),
      name: null,
      private: false,
      package_manager: null,
      workspaces_declared: false,
      scripts: [],
      parse_status: "invalid_json",
    };
  }
}

function buildSystemMatches(rule, paths) {
  return paths.filter((filePath) => rule.any.some((pattern) => pattern.test(filePath)));
}

function buildSystemRoots(rule, evidencePaths) {
  const rootPatterns = list(rule.roots);
  const rootEvidence = rootPatterns.length
    ? evidencePaths.filter((filePath) => rootPatterns.some((pattern) => pattern.test(filePath)))
    : evidencePaths;
  if (rule.id === "bazel" && !rootEvidence.length && evidencePaths.length) return ["."];
  return unique(rootEvidence.map(dirname)).sort();
}

function discoveryPriority(filePath) {
  if (isInstructionPath(filePath)) return 0;
  if (isWorkflowPath(filePath)) return 1;
  if (isPackageManifest(filePath)) return 2;
  const base = basename(filePath);
  if (/^(?:pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|Package\.swift|composer\.json|Gemfile|CMakeLists\.txt|WORKSPACE(?:\.bazel)?|MODULE\.bazel)$/i.test(base)) return 3;
  if (/\.(?:sln|csproj)$/i.test(base)) return 3;
  if (/^(?:BUILD|BUILD\.bazel)$/i.test(base)) return 5;
  return 4;
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
  const allPaths = unique(String(result.stdout || "").split("\n"));
  const prioritized = [...allPaths].sort((left, right) =>
    discoveryPriority(left) - discoveryPriority(right) ||
    left.split("/").length - right.split("/").length ||
    left.localeCompare(right));
  return {
    paths: prioritized.slice(0, MAX_DISCOVERED_PATHS),
    discovered_count: allPaths.length,
    truncated: allPaths.length > MAX_DISCOVERED_PATHS,
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
      working_directory: pkg.root || dirname(pkg.path),
      family: script.family,
      script: script.name,
      command: script.command,
      confidence: "repository_declared",
    })),
  );
}

function buildSystemConventions(paths) {
  const output = [];
  for (const rule of BUILD_SYSTEM_RULES) {
    const evidencePaths = buildSystemMatches(rule, paths);
    if (!evidencePaths.length || !rule.commands.length) continue;
    const roots = buildSystemRoots(rule, evidencePaths);
    for (const root of roots.length ? roots : ["."]) {
      const rootEvidence = evidencePaths.filter((filePath) =>
        root === "." ? dirname(filePath) === "." : filePath === root || filePath.startsWith(`${root}/`));
      for (const command of rule.commands) {
        output.push({
          source: "build-system-convention",
          build_system: rule.id,
          language: rule.language,
          package_path: root,
          package_name: null,
          working_directory: root,
          family: command.family,
          script: command.script,
          command: command.command,
          evidence_paths: (rootEvidence.length ? rootEvidence : evidencePaths).slice(0, 12),
          confidence: "conventional_candidate_verify_before_execution",
        });
      }
    }
  }
  return output.slice(0, MAX_BUILD_SYSTEM_CONVENTIONS);
}

function detectedBuildSystems(paths, packages) {
  const systems = [];
  if (packages.length) {
    systems.push({
      id: "node",
      language: "javascript-typescript",
      roots: unique(packages.map((pkg) => pkg.root || dirname(pkg.path))).sort(),
    });
  }
  for (const rule of BUILD_SYSTEM_RULES) {
    if (rule.id === "node") continue;
    const evidencePaths = buildSystemMatches(rule, paths);
    if (!evidencePaths.length) continue;
    systems.push({
      id: rule.id,
      language: rule.language,
      roots: buildSystemRoots(rule, evidencePaths),
      evidence_paths: evidencePaths.slice(0, 12),
    });
  }
  const byId = new Map();
  for (const item of systems) byId.set(item.id, item);
  return [...byId.values()];
}

function commandConventions(packages, paths) {
  const declared = packageCommandConventions(packages);
  const conventional = buildSystemConventions(paths);
  const declaredKeys = new Set(
    declared.map((item) => `${item.build_system}:${item.working_directory}:${item.family}:${item.command}`),
  );
  return [
    ...declared,
    ...conventional.filter(
      (item) => !declaredKeys.has(`${item.build_system}:${item.working_directory}:${item.family}:${item.command}`),
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
  const buildRoots = unique(buildSystems.flatMap((entry) => list(entry.roots))).sort();
  const nestedBuildRoots = buildRoots.filter((root) => root && root !== ".");
  const monorepo = Boolean(
    workspaceSignals.length ||
    rootPackage?.workspaces_declared ||
    packages.length > 1 ||
    nestedBuildRoots.length,
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
        build_roots: buildRoots,
        nested_build_root_count_observed: nestedBuildRoots.length,
        mixed_language: unique(buildSystems.map((entry) => entry.language)).length > 1,
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
