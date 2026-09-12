import { parse } from "@babel/parser";

export const CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT =
  "AVANTIQO_CODE_AI_SYNTAX_AWARE_DEPENDENCY_V1";

const MAX_AST_NODES = 12000;
const MAX_IMPORTS = 120;
const MAX_CALLS = 120;
const MAX_SCHEMA_REFS = 120;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parserPlugins(filePath) {
  const lower = text(filePath, 1200).toLowerCase();
  const plugins = ["jsx", "importAttributes", "topLevelAwait", "classProperties", "classPrivateProperties", "classPrivateMethods"];
  if (/\.(?:ts|tsx|mts|cts)$/.test(lower)) plugins.push("typescript");
  return plugins;
}

function literalString(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "StringLiteral" || node.type === "Literal") return text(node.value, 1200) || null;
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) {
    return text(node.quasis?.[0]?.value?.cooked, 1200) || null;
  }
  return null;
}

function memberName(node) {
  if (!node || node.type !== "MemberExpression") return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  return literalString(node.property);
}

function walkAst(root, visit) {
  const stack = [root];
  let visited = 0;
  while (stack.length && visited < MAX_AST_NODES) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    visited += 1;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index] === "object") stack.push(value[index]);
        }
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        stack.push(value);
      }
    }
  }
  return { visited, bounded: stack.length > 0 };
}

function addImportBinding(bindings, imports, source, kind, imported, local) {
  if (!source || imports.length >= MAX_IMPORTS) return;
  const binding = { source, kind, imported, local };
  imports.push(binding);
  if (local) bindings.set(local, binding);
}

function analyzeAst(filePath, content) {
  const source = String(content ?? "");
  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: parserPlugins(filePath),
    });
  } catch (error) {
    return {
      parsed: false,
      parse_error: text(error?.message || error, 500),
      imports: [], exports: [], calls: [], schema_references: [],
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }

  const bindings = new Map();
  const imports = [];
  const exports = [];
  const calls = [];
  const schemaReferences = [];
  const seenCalls = new Set();
  const seenSchema = new Set();

  const walked = walkAst(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      const specifier = literalString(node.source);
      for (const item of node.specifiers || []) {
        if (item.type === "ImportDefaultSpecifier") addImportBinding(bindings, imports, specifier, "default", "default", item.local?.name);
        else if (item.type === "ImportNamespaceSpecifier") addImportBinding(bindings, imports, specifier, "namespace", "*", item.local?.name);
        else if (item.type === "ImportSpecifier") addImportBinding(bindings, imports, specifier, "named", item.imported?.name || literalString(item.imported), item.local?.name);
      }
      if (!(node.specifiers || []).length && specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "side_effect", imported: null, local: null });
    }
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      const specifier = literalString(node.source);
      if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "reexport", imported: "*", local: null });
    }
    if (node.type === "ExportDefaultDeclaration") exports.push("default");
    if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration;
      if (decl?.id?.name) exports.push(decl.id.name);
      if (decl?.type === "VariableDeclaration") {
        for (const item of decl.declarations || []) if (item.id?.type === "Identifier") exports.push(item.id.name);
      }
      for (const item of node.specifiers || []) exports.push(item.exported?.name || literalString(item.exported));
    }

    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const callee = node.callee;
    if (callee?.type === "Identifier") {
      const binding = bindings.get(callee.name);
      if (binding && calls.length < MAX_CALLS) {
        const key = `${binding.source}:${binding.imported}:${callee.name}`;
        if (!seenCalls.has(key)) {
          seenCalls.add(key);
          calls.push({ source: binding.source, import_kind: binding.kind, imported: binding.imported, local: callee.name, member: null });
        }
      }
      if (callee.name === "require") {
        const specifier = literalString(node.arguments?.[0]);
        if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "require", imported: "*", local: null });
      }
    } else if (callee?.type === "MemberExpression") {
      const member = memberName(callee);
      if (callee.object?.type === "Identifier") {
        const binding = bindings.get(callee.object.name);
        if (binding?.kind === "namespace" && member && calls.length < MAX_CALLS) {
          const key = `${binding.source}:${member}:${callee.object.name}`;
          if (!seenCalls.has(key)) {
            seenCalls.add(key);
            calls.push({ source: binding.source, import_kind: "namespace", imported: member, local: `${callee.object.name}.${member}`, member });
          }
        }
      }
      if ((member === "from" || member === "rpc") && schemaReferences.length < MAX_SCHEMA_REFS) {
        const value = literalString(node.arguments?.[0]);
        const kind = member === "from" ? "table" : "rpc";
        const key = `${kind}:${value}`;
        if (value && !seenSchema.has(key)) {
          seenSchema.add(key);
          schemaReferences.push({ kind, name: value, relation: member === "from" ? "references_database_table" : "calls_database_rpc" });
        }
      }
    } else if (callee?.type === "Import") {
      const specifier = literalString(node.arguments?.[0]);
      if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "dynamic", imported: "*", local: null });
    }
  });

  return {
    parsed: true,
    parse_error: null,
    imports: imports.slice(0, MAX_IMPORTS),
    exports: unique(exports).slice(0, 80),
    calls: calls.slice(0, MAX_CALLS),
    schema_references: schemaReferences.slice(0, MAX_SCHEMA_REFS),
    ast_nodes_visited: walked.visited,
    ast_walk_bounded: walked.bounded,
  };
}

function analyzeSql(content) {
  const source = String(content ?? "");
  const relationships = [];
  const seen = new Set();
  const add = (relation, kind, name) => {
    const normalized = text(name, 500).replace(/^['"`]|['"`]$/g, "");
    const key = `${relation}:${kind}:${normalized}`;
    if (!normalized || seen.has(key) || relationships.length >= MAX_SCHEMA_REFS) return;
    seen.add(key);
    relationships.push({ relation, kind, name: normalized });
  };
  const patterns = [
    ["defines_table", "table", /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w.]*)/gi],
    ["alters_table", "table", /\balter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z_][\w.]*)/gi],
    ["references_table", "table", /\breferences\s+([a-zA-Z_][\w.]*)/gi],
    ["defines_function", "function", /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-zA-Z_][\w.]*)/gi],
    ["defines_view", "view", /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([a-zA-Z_][\w.]*)/gi],
  ];
  for (const [relation, kind, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) add(relation, kind, match[1]);
  }
  return relationships;
}

export function analyzeCodeAISourceDependencies(filePath, content) {
  const path = text(filePath, 1200);
  if (/\.sql$/i.test(path)) {
    return {
      contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
      parser: "STRUCTURED_SQL_RELATIONSHIP_SCANNER",
      syntax_aware: false,
      parsed: true,
      imports: [], exports: [], calls: [],
      schema_references: analyzeSql(content),
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(path)) {
    return {
      contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
      parser: "UNSUPPORTED",
      syntax_aware: false,
      parsed: false,
      parse_error: "UNSUPPORTED_SOURCE_TYPE",
      imports: [], exports: [], calls: [], schema_references: [],
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }
  const result = analyzeAst(path, content);
  return {
    contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
    parser: "BABEL_AST",
    syntax_aware: true,
    ...result,
  };
}

export const CodeAISyntaxAwareDependencyRuntime = Object.freeze({
  contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
  analyze: analyzeCodeAISourceDependencies,
  bounded_ast_nodes: MAX_AST_NODES,
  bounded_imports: MAX_IMPORTS,
  bounded_calls: MAX_CALLS,
  bounded_schema_references: MAX_SCHEMA_REFS,
  repository_complete_graph_claimed: false,
  authorization_effect: "NONE",
});

export default CodeAISyntaxAwareDependencyRuntime;
