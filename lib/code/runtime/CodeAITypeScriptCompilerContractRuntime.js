import ts from "typescript";

export const CODE_AI_TYPESCRIPT_COMPILER_CONTRACT =
  "AVANTIQO_CODE_AI_TYPESCRIPT_COMPILER_CONTRACT_V1";

const MAX_FILES = 40;
const MAX_EXPORTS = 120;
const MAX_PROPERTIES = 120;
const MAX_SIGNATURES = 8;

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalizePath(value) {
  return text(value, 1200).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}
function isTsPath(path) { return /\.(?:ts|tsx|mts|cts)$/i.test(path); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function observedDocuments(state = {}) {
  const docs = new Map();
  for (const entry of [...list(state?.declared_evidence_reads), ...list(state?.source_read_evidence), ...list(state?.evidence)]) {
    if (text(entry?.action, 80) !== "read") continue;
    if (entry?.status && text(entry.status, 80) !== "completed") continue;
    const result = object(entry?.result);
    const path = normalizePath(result.file_path || result.path);
    const content = String(result.content ?? "");
    if (path && content && isTsPath(path)) docs.set(path, content);
  }
  return docs;
}

function extensionCandidates(path) {
  if (/\.[A-Za-z0-9]+$/.test(path)) return [path];
  return [path, `${path}.ts`, `${path}.tsx`, `${path}.mts`, `${path}.cts`, `${path}/index.ts`, `${path}/index.tsx`];
}

function resolveVirtualModule(specifier, containingFile, files) {
  const raw = text(specifier, 1200);
  if (!raw) return null;
  let base = null;
  if (raw.startsWith("@/")) base = raw.slice(2);
  else if (raw.startsWith(".")) {
    const parts = normalizePath(containingFile).split("/");
    parts.pop();
    for (const part of raw.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    base = parts.join("/");
  } else return null;
  return extensionCandidates(normalizePath(base)).find((candidate) => files.has(candidate)) || null;
}


function hasCrossFileTypeDependency(files) {
  for (const [path, content] of files.entries()) {
    const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imported = new Set();
    let explicitTypeOnly = false;
    const walk = (node) => {
      if (ts.isImportDeclaration(node) && node.importClause) {
        if (node.importClause.isTypeOnly) explicitTypeOnly = true;
        if (node.importClause.name) imported.add(node.importClause.name.text);
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            imported.add(item.name.text);
            if (item.isTypeOnly) explicitTypeOnly = true;
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
    if (explicitTypeOnly) return true;
    let referencedImportedType = false;
    const inspectTypes = (node) => {
      if (referencedImportedType) return;
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && imported.has(node.typeName.text)) referencedImportedType = true;
      if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression) && imported.has(node.expression.text)) referencedImportedType = true;
      ts.forEachChild(node, inspectTypes);
    };
    inspectTypes(sourceFile);
    if (referencedImportedType) return true;
  }
  return false;
}

function compilerHost(files, options) {
  const host = {
    getSourceFile(fileName, languageVersion) {
      const path = normalizePath(fileName);
      const content = files.get(path);
      if (content !== undefined) return ts.createSourceFile(`/${path}`, content, languageVersion, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const disk = ts.sys.readFile(fileName);
      return disk === undefined ? undefined : ts.createSourceFile(fileName, disk, languageVersion, true);
    },
    getDefaultLibFileName() { return ts.getDefaultLibFilePath(options); },
    writeFile() {},
    getCurrentDirectory() { return "/"; },
    getDirectories() { return []; },
    fileExists(fileName) { const path = normalizePath(fileName); return files.has(path) || ts.sys.fileExists(fileName); },
    readFile(fileName) { const path = normalizePath(fileName); return files.get(path) ?? ts.sys.readFile(fileName); },
    getCanonicalFileName(fileName) { return normalizePath(fileName); },
    useCaseSensitiveFileNames() { return true; },
    getNewLine() { return "\n"; },
    realpath(fileName) { return normalizePath(fileName); },
    resolveModuleNames(moduleNames, containingFile) {
      return moduleNames.map((specifier) => {
        const resolved = resolveVirtualModule(specifier, containingFile, files);
        if (resolved) return { resolvedFileName: `/${resolved}`, extension: resolved.endsWith(".tsx") ? ts.Extension.Tsx : ts.Extension.Ts, isExternalLibraryImport: false };
        if (specifier.startsWith(".") || specifier.startsWith("@/")) return undefined;
        const external = ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule;
        return external || undefined;
      });
    },
  };
  return host;
}

function propertyShape(checker, type) {
  if (!type) return [];
  return checker.getPropertiesOfType(type).slice(0, MAX_PROPERTIES).map((symbol) => {
    const declaration = symbol.valueDeclaration || symbol.declarations?.[0];
    let propertyType = null;
    try { propertyType = declaration ? checker.getTypeOfSymbolAtLocation(symbol, declaration) : checker.getDeclaredTypeOfSymbol(symbol); } catch {}
    return {
      name: text(symbol.getName(), 240),
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
      type: propertyType ? text(checker.typeToString(propertyType, declaration, ts.TypeFormatFlags.NoTruncation), 500) : null,
    };
  }).filter((item) => item.name);
}

function typeParametersOf(symbol) {
  const decl = symbol?.declarations?.[0];
  return list(decl?.typeParameters).slice(0, 20).map((param) => text(param?.name?.text, 120)).filter(Boolean);
}

function exportTypeContract(checker, symbol) {
  const target = (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = target?.declarations?.[0];
  if (!decl) return null;
  const kind = ts.isInterfaceDeclaration(decl) ? "interface"
    : ts.isTypeAliasDeclaration(decl) ? "type_alias"
    : ts.isClassDeclaration(decl) ? "class"
    : null;
  if (!kind) return null;
  let type = null;
  try { type = checker.getDeclaredTypeOfSymbol(target); } catch {}
  if (!type) try { type = checker.getTypeAtLocation(decl); } catch {}
  if (!type) return null;
  const bases = [];
  try {
    if (type.getBaseTypes) for (const base of type.getBaseTypes() || []) bases.push(text(checker.typeToString(base, decl, ts.TypeFormatFlags.NoTruncation), 500));
  } catch {}
  return {
    name: text(symbol.getName(), 240),
    target_name: text(target.getName(), 240),
    kind,
    properties: propertyShape(checker, type),
    type_parameters: typeParametersOf(target),
    base_types: unique(bases).slice(0, 20),
    compiler_resolved: true,
  };
}

function signatureContract(checker, signature, declaration) {
  const parameters = signature.getParameters().map((param) => {
    const decl = param.valueDeclaration || param.declarations?.[0] || declaration;
    let type = null;
    try { type = checker.getTypeOfSymbolAtLocation(param, decl); } catch {}
    return {
      name: text(param.getName(), 240),
      optional: (param.flags & ts.SymbolFlags.Optional) !== 0 || Boolean(param.valueDeclaration?.questionToken || param.valueDeclaration?.initializer),
      properties: propertyShape(checker, type),
      type: type ? text(checker.typeToString(type, decl, ts.TypeFormatFlags.NoTruncation), 500) : null,
    };
  });
  let returnType = null;
  try { returnType = signature.getReturnType(); } catch {}
  return {
    parameters,
    return_properties: propertyShape(checker, returnType),
    return_type: returnType ? text(checker.typeToString(returnType, declaration, ts.TypeFormatFlags.NoTruncation), 500) : null,
    type_parameters: list(signature.typeParameters).slice(0, 20).map((item) => text(item?.symbol?.getName?.(), 120)).filter(Boolean),
  };
}

function exportFunctionContract(checker, symbol) {
  const target = (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = target?.valueDeclaration || target?.declarations?.find((item) => ts.isFunctionDeclaration(item) || ts.isVariableDeclaration(item));
  if (!decl) return null;
  let type = null;
  try { type = checker.getTypeOfSymbolAtLocation(target, decl); } catch {}
  const signatures = type?.getCallSignatures?.() || [];
  if (!signatures.length) return null;
  return {
    name: text(symbol.getName(), 240),
    target_name: text(target.getName(), 240),
    signatures: signatures.slice(0, MAX_SIGNATURES).map((signature) => signatureContract(checker, signature, decl)),
    compiler_resolved: true,
  };
}

export function buildCodeAITypeScriptCompilerContracts({ state = {}, writes = [] } = {}) {
  const beforeFiles = observedDocuments(state);
  const writeEntries = list(writes).map((item) => [normalizePath(item?.path), String(item?.content ?? "")]).filter(([path]) => isTsPath(path));
  const afterFiles = new Map(beforeFiles);
  for (const [path, content] of writeEntries) afterFiles.set(path, content);
  const relevant = new Set(writeEntries.map(([path]) => path));
  const build = (files) => {
    const boundedEntries = [...files.entries()].slice(-MAX_FILES);
    const boundedFiles = new Map(boundedEntries);
    const options = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
      skipLibCheck: true,
      noLib: false,
      allowJs: false,
      noEmit: true,
      baseUrl: "/",
      paths: { "@/*": ["*"] },
      ignoreDeprecations: "6.0",
    };
    const program = ts.createProgram({ rootNames: [...boundedFiles.keys()].map((path) => `/${path}`), options, host: compilerHost(boundedFiles, options) });
    const checker = program.getTypeChecker();
    const byPath = {};
    let exportCount = 0;
    for (const sourceFile of program.getSourceFiles()) {
      const path = normalizePath(sourceFile.fileName);
      if (!boundedFiles.has(path)) continue;
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      if (!moduleSymbol) continue;
      const types = [];
      const functions = [];
      for (const symbol of checker.getExportsOfModule(moduleSymbol).slice(0, MAX_EXPORTS)) {
        if (exportCount >= MAX_EXPORTS) break;
        const typeContract = exportTypeContract(checker, symbol);
        if (typeContract) types.push(typeContract);
        const fnContract = exportFunctionContract(checker, symbol);
        if (fnContract) functions.push(fnContract);
        if (typeContract || fnContract) exportCount += 1;
      }
      byPath[path] = { types, functions };
    }
    const diagnostics = ts.getPreEmitDiagnostics(program).slice(0, 20).map((diag) => ({
      code: Number(diag.code),
      category: ts.DiagnosticCategory[diag.category] || String(diag.category),
      message: text(ts.flattenDiagnosticMessageText(diag.messageText, " "), 600),
      file: diag.file ? normalizePath(diag.file.fileName) : null,
    }));
    return {
      by_path: byPath,
      diagnostics,
      diagnostic_error_count: diagnostics.filter((item) => item.category === "Error").length,
      clean: diagnostics.filter((item) => item.category === "Error").length === 0,
      file_count: boundedFiles.size,
      export_count: exportCount,
    };
  };

  const crossFileTypeDependency = beforeFiles.size >= 2 && hasCrossFileTypeDependency(beforeFiles);
  if (!writeEntries.length || beforeFiles.size < 2 || !crossFileTypeDependency) {
    return {
      contract: CODE_AI_TYPESCRIPT_COMPILER_CONTRACT,
      active: false,
      reason: !writeEntries.length ? "NO_TYPESCRIPT_WRITES" : beforeFiles.size === 0 ? "NO_OBSERVED_TYPESCRIPT_EVIDENCE" : beforeFiles.size < 2 ? "SINGLE_FILE_STATIC_AST_SUFFICIENT" : "NO_OBSERVED_CROSS_FILE_TYPE_DEPENDENCY",
      before: { by_path: {}, diagnostics: [], file_count: beforeFiles.size, export_count: 0 },
      after: { by_path: {}, diagnostics: [], file_count: afterFiles.size, export_count: 0 },
      relevant_paths: [...relevant],
      compiler_api_used: true,
      repository_wide_compile_performed: false,
      model_call_performed: false,
      provider_call_performed: false,
      authorization_effect: "NONE",
    };
  }
  return {
    contract: CODE_AI_TYPESCRIPT_COMPILER_CONTRACT,
    active: true,
    before: build(beforeFiles),
    after: build(afterFiles),
    relevant_paths: [...relevant].slice(0, MAX_FILES),
    max_files: MAX_FILES,
    compiler_api_used: true,
    observed_cross_file_type_dependency: crossFileTypeDependency,
    cross_file_symbol_resolution: true,
    aliases_resolved: true,
    inheritance_resolved: true,
    generic_instantiations_resolved: true,
    repository_wide_compile_performed: false,
    incomplete_observed_program_is_not_absence_of_contract: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export default Object.freeze({
  contract: CODE_AI_TYPESCRIPT_COMPILER_CONTRACT,
  build: buildCodeAITypeScriptCompilerContracts,
  max_files: MAX_FILES,
});
